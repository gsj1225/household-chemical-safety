"""Assistant 知识库优先 — Stage 3 综合测试。

覆盖：
- 10 条真实知识条目加载
- 非法 JSON 启动失败（confidence/steps/id/version/date）
- reviewed 命中 / local_hit_no_inventory / insufficient / no_match
- provisional 不进入 knowledge，仅 pendingKnowledgeNotice
- outOfScope 前置短路 + 不调用任何 LLM + 四类安全关键词
- 外部关闭 / 外部 Mock 命中 / 外部失败 / HTTPS + 白名单
- 来源去重 / TOP_K 与排序
- 第二次 LLM 越权内容被忽略
- CompatibilityEngine critical 覆盖普通建议
"""

import asyncio
import json
import os
import tempfile
from pathlib import Path

import pytest

from app.config import settings
from app.core.compatibility_engine import CompatibilityEngine
from app.core.knowledge_provider import (
    ExternalKnowledgeProvider,
    ExternalSearchResult,
    LocalKnowledgeProvider,
)
from app.core.mock_ai import MockAI
from app.core.safety_scope_classifier import SafetyScopeClassifier
from app.data.inventory_repository import InventoryRepository
from app.data.knowledge_repository import KnowledgeLoadError, KnowledgeRepository
from app.models.inventory import (
    ConfirmedFact,
    InformationStatus,
    ProductCategory,
    ProductCreate,
)
from app.models.knowledge import (
    AssistantNarrativeDraft,
    KnowledgeIntent,
    KnowledgeIntentDraft,
    KnowledgeQuery,
    SourceRef,
)
from app.services.assistant_service import AssistantService


# ── 测试辅助 ─────────────────────────────────────

def _entry(eid, topic="主题", aliases=None, surfaces=None, scene=None, steps=None,
           cats=None, warnings=None, confidence="reviewed", version="1.0"):
    return {
        "id": eid, "topic": topic, "aliases": aliases or [topic],
        "surfaces": surfaces or [], "excluded_surfaces": [], "scene": scene or [],
        "steps": [{"order": i + 1, "text": s} for i, s in enumerate(steps or [])],
        "allowed_product_categories": cats or [],
        "warnings": warnings or [], "prohibited_actions": [], "stop_conditions": [],
        "tag_condition": "", "sources": [{"type": "local_kb", "title": "家庭安全知识库", "url": ""}],
        "reviewed_at": "2026-08-12", "version": version, "confidence": confidence,
    }


def _write_kb(entries) -> Path:
    d = Path(tempfile.mkdtemp(prefix="kb_"))
    for e in entries:
        (d / f"{e['id']}.json").write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return d


def _prod(pid, name, category, status=InformationStatus.complete, ingredients=()):
    return ProductCreate(
        productId=pid, operationId="op-" + pid, name=name, category=category,
        information_status=status,
        ingredients=[ConfirmedFact(display_value=i) for i in ingredients],
    )


def _build_service(entries, products, external_provider=None):
    db = os.path.join(tempfile.mkdtemp(), "it.db")
    repo = InventoryRepository(db)
    for p in products:
        repo.create(p)
    engine = CompatibilityEngine()
    local = LocalKnowledgeProvider(KnowledgeRepository(_write_kb(entries)))
    ext = external_provider or ExternalKnowledgeProvider()
    return AssistantService(repo, engine, local_provider=local, external_provider=ext), local.repository


class FixedIntentAI(MockAI):
    """返回固定意图 + 固定叙事，便于服务层确定性测试。"""

    def __init__(self, aliases=None, narrative="已按知识库给出建议。"):
        self._aliases = aliases or []
        self._narrative = narrative

    async def extract_knowledge_intent(self, *a, **k):
        if not self._aliases:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(aliases=self._aliases))

    async def generate_narrative(self, *a, **k):
        return AssistantNarrativeDraft(answer=self._narrative)


class BoomAI(MockAI):
    """任何 LLM 调用都抛错，用于验证 outOfScope 前置不调用 LLM。"""

    async def extract_knowledge_intent(self, *a, **k):
        raise AssertionError("outOfScope 时不应调用意图提取 LLM")

    async def generate_narrative(self, *a, **k):
        raise AssertionError("outOfScope 时不应调用回答组织 LLM")


@pytest.fixture(autouse=True)
def _restore():
    orig_enabled = settings.EXTERNAL_KNOWLEDGE_ENABLED
    orig_allow = settings.EXTERNAL_KNOWLEDGE_ALLOWLIST
    yield
    settings.EXTERNAL_KNOWLEDGE_ENABLED = orig_enabled
    settings.EXTERNAL_KNOWLEDGE_ALLOWLIST = orig_allow


def _run(coro):
    return asyncio.run(coro)


# ── 知识库加载与校验 ─────────────────────────────

class TestKnowledgeLoading:
    def test_loads_10_real_entries(self):
        kb = KnowledgeRepository()
        assert len(kb.entries) == 10
        assert all(e.confidence == "reviewed" for e in kb.entries)

    @pytest.mark.parametrize("mutate,label", [
        (lambda e: e.update(confidence="guess"), "非法 confidence"),
        (lambda e: e.update(confidence="reviewed", steps=[]), "reviewed 空 steps"),
        (lambda e: e.update(id="Bad ID!"), "非法 id"),
        (lambda e: e.update(version="v1"), "非法 version"),
        (lambda e: e.update(reviewed_at="08/12/2026"), "非法日期"),
    ])
    def test_invalid_json_fails_loading(self, mutate, label):
        e = _entry("valid-entry", steps=["步骤"])
        mutate(e)
        d = _write_kb([e])
        with pytest.raises(KnowledgeLoadError):
            KnowledgeRepository(d)

    def test_external_url_must_be_https(self):
        with pytest.raises(Exception):
            SourceRef(type="external", title="x", domain="example.com", url="http://example.com")


# ── 检索 ─────────────────────────────────────────

class TestSearch:
    def test_reviewed_hit(self):
        kb = KnowledgeRepository(_write_kb([
            _entry("lime", "水垢", aliases=["水垢", "马桶"], cats=["toilet_cleaner"], steps=["保持通风"]),
        ]))
        r = kb.search(KnowledgeQuery(aliases=["马桶"]))
        assert r.local_status == "local_hit"
        assert r.matches[0].entry.id == "lime"

    def test_no_match(self):
        kb = KnowledgeRepository(_write_kb([_entry("lime", "水垢", aliases=["水垢"], steps=["s"])]))
        r = kb.search(KnowledgeQuery(aliases=["完全不相关"]))
        assert r.local_status == "no_match"
        assert r.matches == []

    def test_provisional_insufficient(self):
        kb = KnowledgeRepository(_write_kb([
            _entry("p1", "待审", aliases=["x"], steps=[], confidence="provisional", version="1.0"),
        ]))
        r = kb.search(KnowledgeQuery(aliases=["x"]))
        assert r.local_status == "insufficient"
        assert r.matches[0].entry.confidence == "provisional"

    def test_topk_and_sort(self):
        entries = [
            _entry("a1", "甲", aliases=["同"], steps=["a"], version="1.0"),
            _entry("a2", "乙", aliases=["同"], steps=["b"], version="2.0"),
            _entry("a3", "丙", aliases=["同"], steps=["c"], version="1.0"),
            _entry("a4", "丁", aliases=["同"], steps=["d"], version="1.0"),
        ]
        kb = KnowledgeRepository(_write_kb(entries))
        r = kb.search(KnowledgeQuery(aliases=["同"]))
        # 同分 → version 新者优先 → id 字典序，只取 TOP_K=3
        assert len(r.matches) <= 3
        assert r.matches[0].entry.id == "a2"  # version 2.0 最新


# ── 服务编排 ─────────────────────────────────────

class TestServiceStates:
    def test_local_hit_recommends_safe_product(self):
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["马桶"])))
        assert resp.knowledge_status == "local_hit"
        assert resp.knowledge
        assert resp.inventory_advice[0].recommendation == "recommended"
        assert resp.inventory_advice[0].product_name == "洁厕灵"

    def test_local_hit_no_inventory(self):
        svc, _ = _build_service(
            [_entry("ink", "墨水", aliases=["墨水"], cats=["stain_remover"], steps=["测试"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["墨水"])))
        assert resp.knowledge_status == "local_hit_no_inventory"
        assert resp.inventory_advice == []

    def test_insufficient_provisional_not_in_knowledge(self):
        svc, _ = _build_service(
            [_entry("p1", "待审", aliases=["x"], steps=[], confidence="provisional")],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["x"])))
        assert resp.knowledge_status == "insufficient"
        assert resp.knowledge == []
        assert resp.pending_knowledge_notice == "存在待审核资料，尚未通过审核，暂不提供操作建议。"
        assert resp.inventory_advice == []

    def test_no_match(self):
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"])))
        assert resp.knowledge_status == "no_match"
        assert resp.knowledge == []
        assert resp.inventory_advice == []

    def test_needs_information_only_not_recommended(self):
        svc, _ = _build_service(
            [_entry("oil", "油污", aliases=["油污"], cats=["laundry"], steps=["按标签使用"])],
            [_prod("p-need", "未知", ProductCategory.laundry, status=InformationStatus.needs_information)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"])))
        # 有知识命中，但库存无安全合格产品 → local_hit_no_inventory
        assert resp.knowledge_status == "local_hit_no_inventory"
        # needs_information 只能待确认，不得推荐
        assert resp.inventory_advice
        assert all(a.recommendation != "recommended" for a in resp.inventory_advice)


# ── 超范围前置 ───────────────────────────────────

class TestSafetyScope:
    @pytest.mark.parametrize("q", ["误食了洁厕剂怎么办", "中毒了", "吸入有害气体", "身体不适", "急救", "洗胃", "送医", "误饮"])
    def test_out_of_scope_keywords(self, q):
        c = SafetyScopeClassifier()
        assert c.is_out_of_scope(q) is True

    def test_out_of_scope_early_no_llm(self):
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("误食了洁厕剂怎么办", [], None, None, BoomAI()))
        assert resp.out_of_scope is True
        assert resp.knowledge == []
        assert resp.inventory_advice == []
        assert resp.general_advice == []
        assert resp.safety_warnings == []

    def test_regular_question_not_out_of_scope(self):
        assert SafetyScopeClassifier().is_out_of_scope("怎么清理马桶") is False


# ── 外部检索 ─────────────────────────────────────

def _ext_provider(sources=None, fail=False):
    allowlist = ["example.com", "gov.example"]
    def fake(q):
        if fail:
            return ExternalSearchResult(failed=True)
        return ExternalSearchResult(sources=sources or [])
    return ExternalKnowledgeProvider(allowlist=allowlist, fake_search=fake)


class TestExternal:
    def test_external_off_when_disabled(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = False
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=_ext_provider([SourceRef(type="external", title="CDC", domain="example.com", url="https://example.com/x", retrieved_at="2026-08-12")]),
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"]), allow_external_search=True))
        assert resp.knowledge_status == "no_match"
        assert resp.external_sources == []

    def test_external_hit(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=_ext_provider([SourceRef(type="external", title="CDC", domain="example.com", url="https://example.com/bleach", retrieved_at="2026-08-12")]),
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"]), allow_external_search=True))
        assert resp.knowledge_status == "external_hit"
        assert resp.external_sources[0].domain == "example.com"

    def test_external_fail(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=_ext_provider(fail=True),
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"]), allow_external_search=True))
        assert resp.knowledge_status == "external_fail"
        assert resp.external_sources == []

    def test_external_not_authorized_not_hit(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=_ext_provider([SourceRef(type="external", title="CDC", domain="example.com", url="https://example.com/x", retrieved_at="2026-08-12")]),
        )
        # 未授权 allow_external_search=False → 不进外部
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"]), allow_external_search=False))
        assert resp.knowledge_status == "no_match"
        assert resp.external_sources == []

    def test_external_https_allowlist_filter(self):
        # 非白名单域名即使 https 也被过滤
        provider = _ext_provider([SourceRef(type="external", title="Bad", domain="evil.com", url="https://evil.com/x", retrieved_at="2026-08-12")])
        allowed = provider.filter_allowed([SourceRef(type="external", title="Bad", domain="evil.com", url="https://evil.com/x", retrieved_at="2026-08-12")])
        assert allowed == []
        # SourceRef 本身拒绝非 https
        with pytest.raises(Exception):
            SourceRef(type="external", title="Bad", domain="evil.com", url="http://evil.com/x")


# ── 来源 / 越权 / critical ───────────────────────

class TestSafetyEnforcement:
    def test_sources_dedup_and_order(self):
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], cats=["toilet_cleaner"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["马桶"])))
        types = [s.type for s in resp.sources]
        assert types == sorted(types, key={"local_kb": 0, "warehouse": 1, "rule": 2, "external": 3}.get)
        # 去重
        keys = [(s.type, s.ref) for s in resp.sources]
        assert len(keys) == len(set(keys))

    def test_second_llm_overreach_ignored(self):
        # 叙事返回伪造的产品名/比例/时间/危险结论，不得进入 inventory/safety
        bogus = "建议使用「神秘浓缩剂」1:100稀释，接触30分钟，会发生危险。"
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["马桶"], narrative=bogus)))
        assert resp.inventory_advice[0].product_name == "洁厕灵"  # 来自库存，非叙事
        assert all(w.severity in ("critical", "attention") for w in resp.safety_warnings)
        # 叙事内容只作为 answer 文本，不影响结构化字段
        assert "神秘浓缩剂" not in resp.inventory_advice[0].product_name

    def test_critical_engine_overrides_common_advice(self):
        # 知识允许消毒剂+洁厕剂两类，两者存在 critical 关系 → 强制警告并剥离混用步骤
        svc, _ = _build_service(
            [_entry("mix", "消毒清洁", aliases=["混合测试"], cats=["disinfectant", "toilet_cleaner"],
                    steps=["倒入洁厕剂", "与消毒液混合使用"])],
            [
                _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
                _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
            ],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["混合测试"])))
        assert any(w.severity == "critical" for w in resp.safety_warnings)
        for a in resp.inventory_advice:
            for s in a.steps:
                assert "混" not in s and "混合" not in s
