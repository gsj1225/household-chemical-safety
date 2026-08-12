"""KnowledgeRepository — 加载、校验、检索本地知识库。

- 启动时加载 backend/data/knowledge/*.json 并做强类型校验，非法 JSON 立即抛错。
- topic/surface/scene 使用标准词，aliases 归一化（小写去空格）。
- TOP_K=3，HIT_THRESHOLD=0.5。
- 排序：score 降序 → reviewed 优先 → version 新者优先 → id 字典序。
- sources 按 (type, ref) 去重。
- 仅 reviewed 可作 local_hit 并进入正式 knowledge；provisional 只能 insufficient。
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from pydantic import ValidationError

from app.models.knowledge import (
    KnowledgeEntry,
    KnowledgeMatch,
    KnowledgeQuery,
    KnowledgeResult,
    SourceRef,
)

TOP_K = 3
HIT_THRESHOLD = 0.5

# 权重：别名/主题 0.6，材质 0.25，场景 0.15
_W_ALIAS = 0.6
_W_SURFACE = 0.25
_W_SCENE = 0.15


class KnowledgeLoadError(RuntimeError):
    """知识库加载/校验失败（非法 JSON 启动即失败）。"""


def _normalize(token: str) -> str:
    return re.sub(r"\s+", "", token).lower()


def _dedup_sources(sources: list[SourceRef]) -> list[SourceRef]:
    seen: set[tuple[str, str]] = set()
    out: list[SourceRef] = []
    for s in sources:
        key = (s.type, s.ref)
        if key in seen:
            continue
        seen.add(key)
        out.append(s)
    return out


class KnowledgeRepository:
    """本地知识库：加载、校验与检索。"""

    def __init__(self, base_dir: str | Path = "data/knowledge"):
        self._base_dir = Path(base_dir)
        self._entries: list[KnowledgeEntry] = []
        self._by_id: dict[str, KnowledgeEntry] = {}
        self._load()

    def _load(self) -> None:
        if not self._base_dir.is_dir():
            raise KnowledgeLoadError(f"知识库目录不存在: {self._base_dir}")
        files = sorted(self._base_dir.glob("*.json"))
        if not files:
            raise KnowledgeLoadError(f"知识库目录为空: {self._base_dir}")
        for path in files:
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
                entry = KnowledgeEntry.model_validate(data)
            except (json.JSONDecodeError, ValidationError) as exc:
                raise KnowledgeLoadError(f"非法知识条目 {path.name}: {exc}") from exc
            if entry.id in self._by_id:
                raise KnowledgeLoadError(f"重复知识条目 id: {entry.id}")
            self._entries.append(entry)
            self._by_id[entry.id] = entry
        self._entries.sort(key=lambda e: e.id)

    @property
    def entries(self) -> list[KnowledgeEntry]:
        return list(self._entries)

    def get(self, entry_id: str) -> KnowledgeEntry | None:
        return self._by_id.get(entry_id)

    def _entry_score(
        self, entry: KnowledgeEntry, query: KnowledgeQuery
    ) -> tuple[float, list[str], bool]:
        """返回 (score, fields, surface_blocked)。

        surface_blocked 为 True 表示材质不适用/被排除，该条目不得提供正式知识建议。
        """
        score = 0.0
        fields: list[str] = []
        surface_blocked = False
        q_aliases = {_normalize(a) for a in query.aliases}
        entry_aliases = {_normalize(a) for a in entry.aliases}
        entry_topic = _normalize(entry.topic)

        # 别名/主题匹配
        hit_alias = False
        if query.topic and (_normalize(query.topic) == entry_topic or _normalize(query.topic) in entry_aliases):
            hit_alias = True
            fields.append("topic")
        if q_aliases and (q_aliases & entry_aliases or q_aliases & {entry_topic}):
            hit_alias = True
            fields.append("alias")
        if hit_alias:
            score += _W_ALIAS

        # 材质匹配：排除材质命中 → 不得提供正式建议；
        # query.surface 已知但不在 entry.surfaces → 材质不匹配，同样不得视为完整命中。
        if query.surface:
            q_surf = _normalize(query.surface)
            if any(_normalize(s) == q_surf for s in entry.excluded_surfaces):
                surface_blocked = True
            elif any(_normalize(s) == q_surf for s in entry.surfaces):
                score += _W_SURFACE
                fields.append("surface")
            else:
                surface_blocked = True

        # 场景匹配
        if query.scene and not surface_blocked:
            q_scene = _normalize(query.scene)
            if any(_normalize(s) == q_scene for s in entry.scene):
                score += _W_SCENE
                fields.append("scene")

        return round(min(score, 1.0), 4), fields, surface_blocked

    def search(self, query: KnowledgeQuery) -> KnowledgeResult:
        scored: list[tuple[float, KnowledgeEntry, list[str]]] = []
        for entry in self._entries:
            score, fields, surface_blocked = self._entry_score(entry, query)
            # 材质不适用/被排除的条目不参与候选，不能仅凭 topic/alias 绕过材质不匹配
            if surface_blocked:
                continue
            if score > 0:
                scored.append((score, entry, fields))

        # 排序：score 降序 → reviewed 优先 → version 新者优先 → id 字典序
        def _ver_key(entry: KnowledgeEntry):
            parts = [int(x) for x in entry.version.split(".")]
            return tuple(parts)

        scored.sort(key=lambda t: (-t[0], 0 if t[1].confidence == "reviewed" else 1,
                                   -_ver_key(t[1])[0] if t[1].version else 0, t[1].id))

        top = scored[:TOP_K]
        matches = [
            KnowledgeMatch(entry=e, matched_fields=fields, score=s)
            for s, e, fields in top
        ]

        # 材质未知：query.surface 为空时，不能把 topic/alias 命中直接视为可执行 local_hit。
        # 有相关 reviewed/候选条目 → insufficient（要求补充材质）；无任何候选 → no_match。
        if not query.surface:
            any_candidate = any(
                s >= HIT_THRESHOLD or (0 < s < HIT_THRESHOLD) for s, _e, _f in top
            )
            local_status = "insufficient" if any_candidate else "no_match"
            return KnowledgeResult(local_status=local_status, matches=matches)

        # 状态判定（材质已知）
        reviewed_hit = any(s >= HIT_THRESHOLD and e.confidence == "reviewed" for s, e, _ in top)
        if reviewed_hit:
            local_status = "local_hit"
        else:
            any_partial = any(s >= HIT_THRESHOLD for s, e, _ in top) or any(0 < s < HIT_THRESHOLD for s, e, _ in top)
            local_status = "insufficient" if any_partial else "no_match"

        return KnowledgeResult(local_status=local_status, matches=matches)
