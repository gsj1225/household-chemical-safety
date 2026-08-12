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
from app.models.assistant import (
    AssistantProductAdvice,
    AssistantSafetyWarning,
    LegacyAssistantDraft,
)
from app.models.inventory import (
    ConfirmedFact,
    InformationStatus,
    ProductCategory,
    ProductCreate,
    SafetyStatement,
)
from app.models.knowledge import (
    AssistantNarrativeDraft,
    KnowledgeIntent,
    KnowledgeIntentDraft,
    KnowledgeQuery,
    KnowledgeStep,
    SourceRef,
)
from app.services.assistant_service import AssistantService


# ── 测试辅助 ─────────────────────────────────────

def _entry(eid, topic="主题", aliases=None, surfaces=None, scene=None, steps=None,
           cats=None, warnings=None, confidence="reviewed", version="1.0",
           excluded=None, tag_condition="", forbidden=None):
    return {
        "id": eid, "topic": topic, "aliases": aliases or [topic],
        "surfaces": surfaces or [], "excluded_surfaces": excluded or [], "scene": scene or [],
        "steps": [{"order": i + 1, "text": s} for i, s in enumerate(steps or [])],
        "allowed_product_categories": cats or [],
        "warnings": warnings or [], "prohibited_actions": [], "stop_conditions": [],
        "tag_condition": tag_condition, "forbidden_terms": forbidden or [],
        "sources": [{"type": "local_kb", "title": "家庭安全知识库", "url": ""}],
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

    def __init__(self, aliases=None, narrative="已按知识库给出建议。", surface=None):
        self._aliases = aliases or []
        self._narrative = narrative
        self._surface = surface

    async def extract_knowledge_intent(self, *a, **k):
        if not self._aliases and self._surface is None:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(
            aliases=self._aliases, surface=self._surface))

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
            _entry("lime", "水垢", aliases=["水垢", "马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"]),
        ]))
        r = kb.search(KnowledgeQuery(aliases=["马桶"], surface="马桶"))
        assert r.local_status == "local_hit"
        assert r.matches[0].entry.id == "lime"

    def test_surface_unknown_is_insufficient(self):
        # 材质未知：topic/alias 命中不能直接视为可执行 local_hit
        kb = KnowledgeRepository(_write_kb([
            _entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], steps=["保持通风"]),
        ]))
        r = kb.search(KnowledgeQuery(aliases=["马桶"]))
        assert r.local_status == "insufficient"

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
            [_entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["马桶"], surface="马桶")))
        assert resp.knowledge_status == "local_hit"
        assert resp.knowledge
        assert resp.inventory_advice[0].recommendation == "recommended"
        assert resp.inventory_advice[0].product_name == "洁厕灵"

    def test_local_hit_no_inventory(self):
        svc, _ = _build_service(
            [_entry("ink", "墨水", aliases=["墨水"], surfaces=["硬质桌面"], cats=["stain_remover"], steps=["测试"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["墨水"], surface="硬质桌面")))
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
            [_entry("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"], cats=["laundry"], steps=["按标签使用"])],
            [_prod("p-need", "未知", ProductCategory.laundry, status=InformationStatus.needs_information)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"], surface="可水洗织物")))
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

    def test_production_provider_never_returns_mock_source(self):
        """生产链路（默认构造，无 fake_search 注入）即使开启外部检索，
        也不构造伪造标题/URL/检索日期，统一 external_fail。"""
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        # 生产默认构造：不传 external_provider → ExternalKnowledgeProvider()（无 fake_search）
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["无匹配"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["无匹配"]), allow_external_search=True))
        assert resp.knowledge_status == "external_fail"
        assert resp.external_sources == []
        # 直接验证默认 provider 的 search 不返回任何伪造字段
        r = _run(ExternalKnowledgeProvider().search(KnowledgeQuery(topic="whatever")))
        assert r.failed is True
        assert r.sources == []


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
            [_entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["马桶"], surface="马桶", narrative=bogus)))
        assert resp.inventory_advice[0].product_name == "洁厕灵"  # 来自库存，非叙事
        assert all(w.severity in ("critical", "attention") for w in resp.safety_warnings)
        # 叙事内容只作为 answer 文本，不影响结构化字段
        assert "神秘浓缩剂" not in resp.inventory_advice[0].product_name

    def test_critical_engine_overrides_common_advice(self):
        # 知识允许消毒剂+洁厕剂两类，两者存在 critical 关系 → 强制警告并剥离混用步骤
        svc, _ = _build_service(
            [_entry("mix", "消毒清洁", aliases=["混合测试"], surfaces=["陶瓷"], cats=["disinfectant", "toilet_cleaner"],
                    steps=["倒入洁厕剂", "与消毒液混合使用"])],
            [
                _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
                _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
            ],
        )
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["混合测试"], surface="陶瓷")))
        assert any(w.severity == "critical" for w in resp.safety_warnings)
        for a in resp.inventory_advice:
            for s in a.steps:
                assert "混" not in s and "混合" not in s

# ══════════════════════════════════════════════════════════════
# 追加：4 个阻塞问题修复的回归测试
#   P1 产品推荐不能只凭类别
#   P2 排除材质必须参与检索
#   P3 隔离旧 LegacyAssistantDraft
#   P4 本地来源追溯 + KnowledgeStep 校验
# ══════════════════════════════════════════════════════════════

def _entry_v2(eid, topic="主题", aliases=None, surfaces=None, excluded=None, scene=None,
              steps=None, cats=None, warnings=None, prohibited=None, tag_condition="",
              confidence="reviewed", version="1.0", forbidden=None):
    """比 _entry 更完整的条目构造，支持 excluded_surfaces/tag_condition/prohibited/forbidden_terms。"""
    return {
        "id": eid, "topic": topic, "aliases": aliases or [topic],
        "surfaces": surfaces or [], "excluded_surfaces": excluded or [], "scene": scene or [],
        "steps": [{"order": i + 1, "text": s} for i, s in enumerate(steps or [])],
        "allowed_product_categories": cats or [],
        "warnings": warnings or [], "prohibited_actions": prohibited or [], "stop_conditions": [],
        "tag_condition": tag_condition, "forbidden_terms": forbidden or [],
        "sources": [{"type": "local_kb", "title": "家庭安全知识库", "ref": eid, "version": version, "url": ""}],
        "reviewed_at": "2026-08-12", "version": version, "confidence": confidence,
    }

class SurfaceIntentAI(MockAI):
    """返回固定别名 + 材质的意图，用于材质检索测试。"""

    def __init__(self, aliases=None, surface=None, narrative="已按知识库给出建议。"):
        self._aliases = aliases or []
        self._surface = surface
        self._narrative = narrative

    async def extract_knowledge_intent(self, *a, **k):
        if not self._aliases and not self._surface:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(
            aliases=self._aliases, surface=self._surface))

    async def generate_narrative(self, *a, **k):
        return AssistantNarrativeDraft(answer=self._narrative)

class TraceAI(MockAI):
    """记录被调用方法，验证新流程只走两次 LLM 调用。"""

    def __init__(self, aliases=None, narrative="已按知识库给出建议。", surface=None):
        self.calls: list[str] = []
        self._aliases = aliases or []
        self._narrative = narrative
        self._surface = surface

    async def extract_knowledge_intent(self, *a, **k):
        self.calls.append("extract_knowledge_intent")
        if not self._aliases and self._surface is None:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(
            aliases=self._aliases, surface=self._surface))

    async def generate_narrative(self, *a, **k):
        self.calls.append("generate_narrative")
        return AssistantNarrativeDraft(answer=self._narrative)

    async def answer_household_question(self, *a, **k):
        self.calls.append("answer_household_question")
        return LegacyAssistantDraft(answer="legacy")

class LegacyOverrideAI(MockAI):
    """旧路径若被调用会返回越权内容；新流程绝不调用它。"""

    async def extract_knowledge_intent(self, *a, **k):
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(aliases=["马桶"], surface="马桶"))

    async def generate_narrative(self, *a, **k):
        return AssistantNarrativeDraft(answer="按知识库建议处理。")

    async def answer_household_question(self, *a, **k):
        return LegacyAssistantDraft(
            answer="旧接口越权建议",
            out_of_scope=True,
            product_advice=[
                AssistantProductAdvice(product_id="p-fake", recommendation="recommended",
                                       reason="LLM 伪造推荐")
            ],
            safety_warnings=[
                AssistantSafetyWarning(severity="critical", title="LLM 伪造警告",
                                       description="x", recommended_action="x")
            ],
        )


# ── P1 产品推荐不能只凭类别 ──────────────────────

class TestProductRecommendation:
    def _svc(self, entry, product):
        return _build_service([entry], [product])

    def test_label_inapplicable_not_recommended(self):
        # 类别匹配但标签明确不适用（命中排除材质）→ not_recommended
        entry = _entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"],
                          excluded=["需干洗面料"], cats=["laundry"], steps=["按标签使用"])
        prod = ProductCreate(
            productId="p-a", operationId="op-a", name="普通洗衣液",
            category=ProductCategory.laundry, information_status=InformationStatus.complete,
            ingredients=[ConfirmedFact(display_value="表面活性剂")],
            label_warnings=[ConfirmedFact(display_value="不可用于需干洗面料")],
        )
        svc, _ = self._svc(entry, prod)
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.inventory_advice[0].recommendation == "not_recommended"

    def test_ingredient_conflict_not_recommended(self):
        # 有成分但与知识禁用条件（forbidden_terms）冲突 → not_recommended
        entry = _entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"],
                          cats=["laundry"], forbidden=["漂白成分"], steps=["按标签使用"])
        prod = _prod("p-a", "漂白洗衣液", ProductCategory.laundry, ingredients=["含漂白成分的清洁剂"])
        svc, _ = self._svc(entry, prod)
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.inventory_advice[0].recommendation == "not_recommended"

    def test_no_verifiable_label_needs_information(self):
        # 只有类别匹配、没有可核验标签/成分 → needs_information
        entry = _entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"],
                          cats=["laundry"], steps=["按标签使用"])
        svc, _ = self._svc(entry, _prod("p-a", "普通洗衣液", ProductCategory.laundry))
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.inventory_advice[0].recommendation == "needs_information"

    def test_full_pass_recommended(self):
        # 完整适用信息且无冲突 → recommended
        entry = _entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"],
                          cats=["laundry"], tag_condition="使用前必须核对产品标签", steps=["按标签使用"])
        prod = ProductCreate(
            productId="p-a", operationId="op-a", name="专用洗衣液",
            category=ProductCategory.laundry, information_status=InformationStatus.complete,
            ingredients=[ConfirmedFact(display_value="表面活性剂")],
            label_warnings=[ConfirmedFact(display_value="适用于可水洗织物")],
        )
        svc, _ = self._svc(entry, prod)
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["油污"], surface="可水洗织物")))
        a = resp.inventory_advice[0]
        assert a.recommendation == "recommended"
        assert a.product_name == "专用洗衣液"


# ── P2 排除材质必须参与检索 ──────────────────────

class TestSurfaceExclusion:
    OIL = _entry_v2("oil", "油污", aliases=["油污", "油渍"], surfaces=["可水洗织物"],
                    excluded=["需干洗面料", "未确认的特殊面料"], cats=["laundry"], steps=["按标签处理"])

    def _svc(self):
        return _build_service([self.OIL], [_prod("p-a", "洗衣液", ProductCategory.laundry, ingredients=["表面活性剂"])])

    def test_excluded_surface_no_local_hit(self):
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="需干洗面料")))
        assert resp.knowledge_status != "local_hit"
        assert resp.knowledge == []
        assert resp.inventory_advice == []

    def test_unknown_material_no_local_hit(self):
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="未知特殊材质")))
        assert resp.knowledge_status != "local_hit"
        assert resp.knowledge == []

    def test_topic_hit_but_surface_mismatch(self):
        # topic 命中但材质不在 entry.surfaces → 不得视为完整 local_hit
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="皮革")))
        assert resp.knowledge_status != "local_hit"
        assert resp.knowledge == []

    def test_surface_match_is_local_hit(self):
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.knowledge_status == "local_hit"
        assert resp.knowledge

    def test_repository_excluded_surface(self):
        # 直接验证 KnowledgeRepository 层：excluded 命中不返回该条目
        kb = KnowledgeRepository(_write_kb([self.OIL]))
        r = kb.search(KnowledgeQuery(aliases=["油污"], surface="需干洗面料"))
        assert r.matches == []
        assert r.local_status != "local_hit"


# ── P3 隔离旧 LegacyAssistantDraft ───────────────

class TestLegacyIsolation:
    def test_new_flow_does_not_call_legacy(self):
        svc, _ = _build_service(
            [_entry_v2("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
        )
        ai = TraceAI(aliases=["马桶"], surface="马桶")
        resp = _run(svc.ask("问题", [], None, None, ai))
        assert "extract_knowledge_intent" in ai.calls
        assert "generate_narrative" in ai.calls
        assert "answer_household_question" not in ai.calls
        assert resp.out_of_scope is False

    def test_legacy_overreach_not_adopted(self):
        # 即使旧路径返回越权内容，最终结构化响应也不采用
        svc, _ = _build_service(
            [_entry_v2("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
        )
        resp = _run(svc.ask("问题", [], None, None, LegacyOverrideAI()))
        assert resp.out_of_scope is False
        assert resp.answer != "旧接口越权建议"
        ids = [a.product_id for a in resp.inventory_advice]
        assert "p-fake" not in ids
        assert resp.inventory_advice[0].product_name == "洁厕灵"
        assert all(w.title != "LLM 伪造警告" for w in resp.safety_warnings)


# ── P4 本地来源追溯 + KnowledgeStep 校验 ─────────

class TestSourceTraceability:
    def test_real_entries_source_has_ref_and_version(self):
        kb = KnowledgeRepository()
        assert len(kb.entries) == 10
        for e in kb.entries:
            local = [s for s in e.sources if s.type == "local_kb"]
            assert local, f"{e.id} 缺少 local_kb 来源"
            for s in local:
                assert s.ref == e.id, f"{e.id} 来源 ref 未追溯"
                assert s.version == e.version, f"{e.id} 来源 version 未追溯"

    def test_source_ref_unique_per_entry(self):
        kb = KnowledgeRepository()
        for e in kb.entries:
            refs = [s.ref for s in e.sources if s.type == "local_kb"]
            assert len(refs) == len(set(refs)), f"{e.id} 来源 ref 重复"

    def test_dedup_does_not_lose_different_entries(self):
        # 两个不同条目来源 type=local_kb 但 ref 不同，去重后不丢失
        svc, _ = _build_service(
            [
                _entry_v2("e1", "甲", aliases=["x1"], surfaces=["可水洗织物"], steps=["a"]),
                _entry_v2("e2", "乙", aliases=["x2"], surfaces=["可水洗织物"], steps=["b"]),
            ],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        # e1 命中（alias x1 + surface），其 local_kb 来源 ref=e1 必须保留
        resp = _run(svc.ask("问题", [], None, None, FixedIntentAI(aliases=["x1"], surface="可水洗织物")))
        refs = {s.ref for s in resp.sources if s.type == "local_kb"}
        assert "e1" in refs

    def test_knowledge_evidence_sources_traceable(self):
        svc, _ = _build_service(
            [_entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"], cats=["laundry"], steps=["按标签处理"])],
            [_prod("p-a", "洗衣液", ProductCategory.laundry)],
        )
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.knowledge
        for k in resp.knowledge:
            assert any(s.ref == k.entry_id for s in k.sources)

    def test_knowledge_evidence_reviewed_at_traceable(self):
        """reviewedAt 必须回填知识条目的审核日期，且与 KnowledgeEntry.reviewedAt 对齐。"""
        entry = _entry_v2("oil", "油污", aliases=["油污"], surfaces=["可水洗织物"], cats=["laundry"], steps=["按标签处理"])
        entry["reviewed_at"] = "2026-07-20"
        svc, _ = _build_service(
            [entry],
            [_prod("p-a", "洗衣液", ProductCategory.laundry)],
        )
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.knowledge
        for k in resp.knowledge:
            assert k.reviewed_at == "2026-07-20"
        # 与知识库条目对齐
        kb_entry = svc._kb.get("oil")
        assert kb_entry is not None
        assert kb_entry.reviewed_at == "2026-07-20"

class TestKnowledgeStepValidation:
    def test_order_must_be_positive(self):
        e = _entry_v2("x", "甲", steps=["a"])
        e["steps"] = [{"order": 0, "text": "a"}]
        with pytest.raises(KnowledgeLoadError):
            KnowledgeRepository(_write_kb([e]))

    def test_reviewed_order_must_start_at_1(self):
        e = _entry_v2("x", "甲", steps=["a", "b"])
        e["steps"] = [{"order": 2, "text": "a"}, {"order": 3, "text": "b"}]
        with pytest.raises(KnowledgeLoadError):
            KnowledgeRepository(_write_kb([e]))

    def test_reviewed_order_must_be_continuous(self):
        e = _entry_v2("x", "甲", steps=["a", "b", "c"])
        e["steps"] = [{"order": 1, "text": "a"}, {"order": 2, "text": "b"}, {"order": 4, "text": "c"}]
        with pytest.raises(KnowledgeLoadError):
            KnowledgeRepository(_write_kb([e]))

    def test_reviewed_order_no_duplicate(self):
        e = _entry_v2("x", "甲", steps=["a", "b"])
        e["steps"] = [{"order": 1, "text": "a"}, {"order": 1, "text": "b"}]
        with pytest.raises(KnowledgeLoadError):
            KnowledgeRepository(_write_kb([e]))

    def test_step_model_order_positive(self):
        with pytest.raises(Exception):
            KnowledgeStep(order=0, text="x")

    def test_valid_continuous_order_ok(self):
        kb = KnowledgeRepository(_write_kb([
            _entry_v2("x", "甲", aliases=["甲"], steps=["a", "b", "c"])
        ]))
        assert kb.get("x") is not None

# ══════════════════════════════════════════════════════════════
# 二轮修复回归测试
#   P1-2 未知材质不得直接推荐
#   P1-3 图片与超范围判定契约（方案 B）
#   P2-1 外部照片授权字段 + 图片不发送外部
#   P2-2 SourceRef 外部校验
# ══════════════════════════════════════════════════════════════

_OIL_ENTRY = _entry_v2("oil", "油污", aliases=["油污", "油渍"], surfaces=["可水洗织物", "厨房台面"],
                       excluded=["需干洗面料", "未确认的特殊面料"], cats=["laundry"], steps=["按标签处理"])


class TestP1_2UnknownMaterial:
    def _svc(self):
        return _build_service([_OIL_ENTRY],
                              [_prod("p-a", "洗衣液", ProductCategory.laundry, ingredients=["表面活性剂"])])

    def test_no_surface_is_insufficient(self):
        # “油污怎么清理” 无 surface → insufficient，不返回步骤，不生成产品推荐
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface=None)))
        assert resp.knowledge_status == "insufficient"
        assert resp.knowledge == []
        assert resp.inventory_advice == []

    def test_with_surface_is_local_hit(self):
        # “油污 + 可水洗织物” → 可进入 local_hit
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="可水洗织物")))
        assert resp.knowledge_status == "local_hit"
        assert resp.knowledge
        assert any(a.recommendation == "recommended" for a in resp.inventory_advice)

    def test_silk_surface_not_local_hit(self):
        # “油污 + 需干洗面料” → 不得进入 local_hit
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface="需干洗面料")))
        assert resp.knowledge_status != "local_hit"
        assert resp.knowledge == []
        assert resp.inventory_advice == []

    def test_topic_hit_unknown_material_no_product(self):
        # topic 命中但材质未知 → 无产品推荐
        svc, _ = self._svc()
        resp = _run(svc.ask("问题", [], None, None, SurfaceIntentAI(aliases=["油污"], surface=None)))
        assert resp.inventory_advice == []
        assert not any(a.recommendation == "recommended" for a in resp.inventory_advice)


class TestP1_3ImageSafety:
    def test_classifier_text_only(self):
        # 方案 A：分类器只接收文字 question，不接收 image_bytes
        c = SafetyScopeClassifier()
        assert c.is_out_of_scope("误食了洁厕剂") is True
        assert c.is_out_of_scope("怎么清理马桶") is False
        import inspect as _inspect
        sig = _inspect.signature(c.is_out_of_scope)
        assert "image_bytes" not in sig.parameters

    def test_text_accident_short_circuit(self):
        # 文字含误食/中毒/吸入 → 前置短路，不返回知识/产品
        for q in ["误食了洁厕剂", "中毒了怎么办", "吸入有害气体"]:
            c = SafetyScopeClassifier()
            assert c.is_out_of_scope(q) is True

    def test_image_accident_before_llm_no_llm(self):
        # 带图片 + 事故文字：文字命中 → 在任意 LLM 与知识检索前短路，不调用任何 LLM
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
        )
        resp = _run(svc.ask("误食了洁厕剂怎么办", [], b"\x89PNG", None, BoomAI()))
        assert resp.out_of_scope is True
        assert resp.knowledge == []
        assert resp.inventory_advice == []

    def test_normal_text_with_image_enters_intent(self):
        # 文字正常但带图片 → 正常进入意图提取（图片不触发事故判定）
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
        )
        resp = _run(svc.ask("怎么清理马桶", [], b"\x89PNG", None, FixedIntentAI(aliases=["马桶"], surface="马桶")))
        assert resp.out_of_scope is False
        assert resp.knowledge_status == "local_hit"


class TestP2_1ImageNotSentToExternal:
    def test_image_not_forwarded_to_external(self):
        # 图片不会发送给外部 Provider；外部只接收结构化 KnowledgeQuery
        received: list = []

        def fake(q):
            received.append(q)
            return ExternalSearchResult(sources=[
                SourceRef(type="external", title="CDC", domain="example.com",
                          url="https://example.com/x", retrieved_at="2026-08-12")
            ])

        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        svc, _ = _build_service(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=ExternalKnowledgeProvider(allowlist=["example.com"], fake_search=fake),
        )
        # no_match + 外部授权 → 进入外部；同时传入图片
        resp = _run(svc.ask("无匹配问题", [], b"\x89PNG", None, FixedIntentAI(aliases=["无匹配"]),
                            allow_external_search=True, allow_external_photo_upload=True))
        assert resp.knowledge_status == "external_hit"
        assert received, "外部应被调用"
        q = received[0]
        assert isinstance(q, KnowledgeQuery)
        # 外部 Provider 只接收结构化检索条件，不含图片
        assert not hasattr(q, "image_bytes")
        assert not hasattr(q, "image")


class TestP2_2SourceRefValidation:
    def test_external_requires_domain(self):
        with pytest.raises(Exception):
            SourceRef(type="external", title="x", url="https://example.com/x", retrieved_at="2026-08-12")

    def test_external_requires_https(self):
        with pytest.raises(Exception):
            SourceRef(type="external", title="x", domain="example.com",
                      url="http://example.com/x", retrieved_at="2026-08-12")

    def test_external_requires_retrieved_at(self):
        with pytest.raises(Exception):
            SourceRef(type="external", title="x", domain="example.com", url="https://example.com/x")

    def test_external_domain_format(self):
        # 非白名单格式（无点）的 domain 被拒绝
        with pytest.raises(Exception):
            SourceRef(type="external", title="x", domain="notadomain",
                      url="https://notadomain/x", retrieved_at="2026-08-12")

    def test_external_valid(self):
        s = SourceRef(type="external", title="x", domain="example.com",
                      url="https://example.com/x", retrieved_at="2026-08-12")
        assert s.domain == "example.com"

    def test_local_kb_not_require_external_fields(self):
        s = SourceRef(type="local_kb", title="家庭安全知识库", url="")
        assert s.type == "local_kb"
