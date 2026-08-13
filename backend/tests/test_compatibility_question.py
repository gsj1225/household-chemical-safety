"""兼容性问题识别与处理测试 — 直接混用安全问题修复

测试覆盖：
- is_compatibility_question 各种模式识别
- match_products_from_question 产品名称匹配
- build_relevant_pairs 组合构建
- 直接问题返回 RULE-001 critical
- 名称匹配失败时全库组合检查
- 成分缺失返回 needs_information
- 普通污渍问题行为不变
- out_of_scope 行为不变
- 规则结果覆盖 Qwen 的任何普通建议
- safetyWarnings 在 no_match/insufficient 状态下仍渲染
- critical warning 显示"严重/禁止混用"
- 不显示不安全的产品操作卡
"""

import asyncio
import os
import tempfile

import pytest

from app.config import settings
from app.core.compatibility_engine import CompatibilityEngine
from app.core.compatibility_question import (
    build_relevant_pairs,
    is_compatibility_question,
    match_products_from_question,
)
from app.core.knowledge_provider import (
    ExternalKnowledgeProvider,
    LocalKnowledgeProvider,
)
from app.core.mock_ai import MockAI
from app.data.inventory_repository import InventoryRepository
from app.data.knowledge_repository import KnowledgeRepository
from app.models.assistant import AssistantSafetyWarning
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
)
from app.services.assistant_service import AssistantService

# ── 辅助 ─────────────────────────────────────────


def _prod(pid, name, category, status=InformationStatus.complete, ingredients=()):
    return ProductCreate(
        productId=pid, operationId="op-" + pid, name=name, category=category,
        information_status=status,
        ingredients=[ConfirmedFact(display_value=i) for i in ingredients],
    )


def _build_service(entries=None, products=None, external_provider=None):
    db = os.path.join(tempfile.mkdtemp(), "it.db")
    repo = InventoryRepository(db)
    for p in products or []:
        repo.create(p)
    engine = CompatibilityEngine()
    if entries:
        import json
        from pathlib import Path

        d = Path(tempfile.mkdtemp(prefix="kb_"))
        for e in entries:
            (d / f"{e['id']}.json").write_text(
                json.dumps(e, ensure_ascii=False), encoding="utf-8"
            )
        local = LocalKnowledgeProvider(KnowledgeRepository(d))
    else:
        local = LocalKnowledgeProvider()
    ext = external_provider or ExternalKnowledgeProvider()
    return AssistantService(repo, engine, local_provider=local, external_provider=ext)


def _run(coro):
    return asyncio.run(coro)


class OverrideAI(MockAI):
    """LLM 返回越权安全结论，验证规则结果覆盖 LLM。"""

    def __init__(self):
        super().__init__()
        self.called_narrative = False

    async def extract_knowledge_intent(self, *a, **k):
        return KnowledgeIntentDraft()

    async def generate_narrative(self, *a, **k):
        self.called_narrative = True
        return AssistantNarrativeDraft(
            answer="可以安全混用，没有问题。"  # 越权：与 critical 规则矛盾
        )


@pytest.fixture(autouse=True)
def _restore():
    orig_enabled = settings.EXTERNAL_KNOWLEDGE_ENABLED
    yield
    settings.EXTERNAL_KNOWLEDGE_ENABLED = orig_enabled


# ── is_compatibility_question ────────────────────


class TestIsCompatibilityQuestion:
    @pytest.mark.parametrize("q", [
        "洁厕灵能和84消毒液一起用吗",
        "84消毒液可以和洁厕灵混用吗",
        "洁厕灵和84能不能混合",
        "84和洁厕灵能混合吗",
        "这两种是否冲突",
        "能同时使用84和洁厕灵吗",
        "可以同时使用吗",
        "搭配使用可以吗",
        "混用可以吗",
        "混合使用安全吗",
        "一起使用没问题吧",
        "同时使用会反应吗",
        "会中和吗",
    ])
    def test_detected(self, q):
        assert is_compatibility_question(q) is True

    @pytest.mark.parametrize("q", [
        "怎么清理马桶",
        "油污怎么去除",
        "洗衣液推荐",
        "",
        "   ",
        "84消毒液怎么稀释",
    ])
    def test_not_detected(self, q):
        assert is_compatibility_question(q) is False


# ── match_products_from_question ──────────────────


class TestMatchProductsFromQuestion:
    def setup_method(self):
        db = os.path.join(tempfile.mkdtemp(), "match.db")
        repo = InventoryRepository(db)
        repo.create(_prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]))
        repo.create(_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]))
        repo.create(_prod("p-laundry", "蓝月亮洗衣液", ProductCategory.laundry, ingredients=["表面活性剂"]))
        self.products, _ = repo.list()

    def test_exact_name_match(self):
        matched = match_products_from_question("84消毒液能和洁厕灵一起用吗", self.products)
        ids = {p.id for p in matched}
        assert "p-84" in ids  # "84消毒液" 精确匹配
        assert "p-jc" in ids   # "洁厕灵" 核心词匹配（去掉"威猛先生"前缀）

    def test_ingredient_match(self):
        matched = match_products_from_question("次氯酸钠能和盐酸混用吗", self.products)
        ids = {p.id for p in matched}
        assert "p-84" in ids   # 成分"次氯酸钠"匹配
        assert "p-jc" in ids   # 成分"盐酸"匹配

    def test_no_match(self):
        matched = match_products_from_question("这个东西能和那个东西一起用吗", self.products)
        assert matched == []


# ── build_relevant_pairs ──────────────────────────


class TestBuildRelevantPairs:
    def setup_method(self):
        db = os.path.join(tempfile.mkdtemp(), "pairs.db")
        repo = InventoryRepository(db)
        repo.create(_prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]))
        repo.create(_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]))
        repo.create(_prod("p-laundry", "洗衣液", ProductCategory.laundry, ingredients=["表面活性剂"]))
        self.products, _ = repo.list()

    def test_matched_pair_only(self):
        pairs = build_relevant_pairs("84消毒液能和洁厕灵一起用吗", self.products)
        assert len(pairs) == 1
        ids = {pairs[0][0].id, pairs[0][1].id}
        assert ids == {"p-84", "p-jc"}

    def test_no_match_full_scan(self):
        pairs = build_relevant_pairs("A能和B一起用吗", self.products)
        # 3 个产品 → C(3,2) = 3 对
        assert len(pairs) == 3

    def test_empty_products(self):
        pairs = build_relevant_pairs("test", [])
        assert pairs == []

    def test_single_product(self):
        pairs = build_relevant_pairs("test", [self.products[0]])
        assert pairs == []


# ── 直接混用问题返回 critical ──────────────────────


class TestDirectCompatibilityQuestion:
    def setup_method(self):
        self.products = [
            _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
            _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
        ]

    def test_returns_rule001_critical(self):
        svc = _build_service(products=self.products)
        resp = _run(svc.ask("洁厕灵能和84消毒液一起用吗", [], None, None, OverrideAI()))

        # 不得返回"信息不足"
        assert "信息不足" not in resp.answer
        assert resp.knowledge_status == "local_hit"

        # safetyWarnings 包含 critical
        critical_warnings = [w for w in resp.safety_warnings if w.severity == "critical"]
        assert len(critical_warnings) >= 1

        w = critical_warnings[0]
        assert w.rule_id == "RULE-001"
        assert w.relation_id  # relationId 非空
        assert w.recommended_action  # 有建议操作

        # answer 明确说明"不能混用"
        assert "不能混用" in resp.answer

        # sources 包含 rule 和两个 warehouse 产品来源
        source_types = [s.type for s in resp.sources]
        assert "rule" in source_types
        warehouse_sources = [s for s in resp.sources if s.type == "warehouse"]
        assert len(warehouse_sources) >= 2

        # 不得调用 LLM 生成安全结论
        ai = OverrideAI()
        resp2 = _run(svc.ask("洁厕灵能和84消毒液一起用吗", [], None, None, ai))
        assert ai.called_narrative is False

    def test_rule_overrides_llm_advice(self):
        """规则 critical 结果覆盖 Qwen 的任何普通建议。"""
        svc = _build_service(products=self.products)
        ai = OverrideAI()
        resp = _run(svc.ask("84消毒液和洁厕灵混用可以吗", [], None, None, ai))

        # LLM 的越权"安全"结论不应出现在 answer 中
        assert "可以安全混用" not in resp.answer
        assert "没有问题" not in resp.answer

        # 规则结论生效
        assert any(w.severity == "critical" for w in resp.safety_warnings)

    def test_product_name_matching(self):
        """产品名称匹配：问题中提到产品名时精确匹配。"""
        svc = _build_service(products=self.products)
        resp = _run(svc.ask("84消毒液能和洁厕灵一起用吗", [], None, None, OverrideAI()))

        assert any(w.severity == "critical" for w in resp.safety_warnings)
        # sources 中的 warehouse 来源对应这两个产品
        refs = {s.ref for s in resp.sources if s.type == "warehouse"}
        assert "p-84" in refs
        assert "p-jc" in refs

    def test_name_match_failure_full_scan(self):
        """名称匹配失败时全库组合检查。"""
        products = [
            _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
            _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
            _prod("p-extra", "洗洁精", ProductCategory.kitchen_cleaner, ingredients=["表面活性剂"]),
        ]
        svc = _build_service(products=products)
        # 问题中不直接提到产品名，但提到"混用"
        resp = _run(svc.ask("这些东西能混用吗", [], None, None, OverrideAI()))

        # 全库扫描应该发现 84+洁厕灵 的 critical 关系
        assert any(w.severity == "critical" for w in resp.safety_warnings)


# ── 成分缺失 ──────────────────────────────────────


class TestMissingIngredients:
    def test_needs_information_specifies_products(self):
        """成分缺失时返回 needs_information，说明哪些产品需补充成分。"""
        products = [
            _prod("p-a", "产品A", ProductCategory.disinfectant, status=InformationStatus.needs_information),
            _prod("p-b", "产品B", ProductCategory.toilet_cleaner, status=InformationStatus.needs_information),
        ]
        svc = _build_service(products=products)
        resp = _run(svc.ask("产品A能和产品B一起用吗", [], None, None, OverrideAI()))

        assert resp.knowledge_status == "insufficient"
        assert "成分" in resp.answer or "补充" in resp.answer
        # 不判定为安全或危险
        assert "不能混用" not in resp.answer
        assert "安全" not in resp.answer

        # safetyWarnings 包含 unknown 级别
        assert any(w.severity == "unknown" for w in resp.safety_warnings)

        # 说明哪些产品需要补充
        assert "产品A" in resp.answer
        assert "产品B" in resp.answer


# ── 普通污渍问题行为不变 ───────────────────────────


class TestNormalQuestionUnchanged:
    def test_stain_question_not_compatibility(self):
        """普通污渍问题不被识别为兼容性问题。"""
        assert is_compatibility_question("怎么清理马桶") is False
        assert is_compatibility_question("油污怎么去除") is False

    def test_stain_question_normal_flow(self):
        """普通问题仍走知识库优先流程。"""
        import json
        from pathlib import Path

        entry = {
            "id": "lime", "topic": "水垢", "aliases": ["水垢", "马桶"],
            "surfaces": ["马桶"], "excluded_surfaces": [], "scene": [],
            "steps": [{"order": 1, "text": "保持通风"}],
            "allowed_product_categories": ["toilet_cleaner"],
            "warnings": [], "prohibited_actions": [], "stop_conditions": [],
            "tag_condition": "", "forbidden_terms": [],
            "sources": [{"type": "local_kb", "title": "家庭安全知识库", "ref": "lime", "version": "1.0", "url": ""}],
            "reviewed_at": "2026-08-12", "version": "1.0", "confidence": "reviewed",
        }
        products = [
            _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
        ]
        svc = _build_service(entries=[entry], products=products)

        class FixedIntentAI(MockAI):
            async def extract_knowledge_intent(self, *a, **k):
                return KnowledgeIntentDraft(
                    knowledge_intent=KnowledgeIntent(aliases=["马桶"], surface="马桶")
                )

            async def generate_narrative(self, *a, **k):
                return AssistantNarrativeDraft(answer="按知识库建议处理。")

        resp = _run(svc.ask("怎么清理马桶", [], None, None, FixedIntentAI()))
        assert resp.knowledge_status == "local_hit"
        assert resp.knowledge
        assert resp.inventory_advice


# ── out_of_scope 行为不变 ─────────────────────────


class TestOutOfScopeUnchanged:
    def test_out_of_scope_before_compatibility(self):
        """out_of_scope 检查在兼容性检查之前。"""
        svc = _build_service(products=[
            _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
        ])

        class BoomAI(MockAI):
            async def extract_knowledge_intent(self, *a, **k):
                raise AssertionError("不应调用 LLM")

            async def generate_narrative(self, *a, **k):
                raise AssertionError("不应调用 LLM")

        resp = _run(svc.ask("误食了84消毒液怎么办", [], None, None, BoomAI()))
        assert resp.out_of_scope is True
        assert resp.safety_warnings == []


# ── safetyWarnings 渲染验证 ──────────────────────


class TestSafetyWarningRendering:
    def test_critical_warning_has_rule_id(self):
        """critical warning 包含 ruleId=RULE-001。"""
        products = [
            _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
            _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
        ]
        svc = _build_service(products=products)
        resp = _run(svc.ask("84消毒液和洁厕灵能一起用吗", [], None, None, OverrideAI()))

        critical = [w for w in resp.safety_warnings if w.severity == "critical"]
        assert critical
        assert critical[0].rule_id == "RULE-001"

    def test_no_unsafe_product_cards(self):
        """兼容性问题不返回产品操作卡（inventoryAdvice 为空）。"""
        products = [
            _prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]),
            _prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]),
        ]
        svc = _build_service(products=products)
        resp = _run(svc.ask("84和洁厕灵混用吗", [], None, None, OverrideAI()))
        assert resp.inventory_advice == []

    def test_warning_shown_even_if_status_insufficient(self):
        """成分缺失时 safetyWarnings 仍包含 unknown 级别警告。"""
        products = [
            _prod("p-a", "产品A", ProductCategory.disinfectant, status=InformationStatus.needs_information),
            _prod("p-b", "产品B", ProductCategory.toilet_cleaner, status=InformationStatus.needs_information),
        ]
        svc = _build_service(products=products)
        resp = _run(svc.ask("产品A能和产品B一起用吗", [], None, None, OverrideAI()))
        assert resp.knowledge_status == "insufficient"
        assert resp.safety_warnings  # 不为空


# ── 集成测试：使用真实 SQLite + 真实 Engine ──────


class TestRealEngineIntegration:
    def test_real_sqlite_real_engine_critical(self):
        """使用真实 SQLite + 真实 CompatibilityEngine 验证 RULE-001。"""
        db = os.path.join(tempfile.mkdtemp(), "real.db")
        repo = InventoryRepository(db)
        repo.create(_prod("p-84", "84消毒液", ProductCategory.disinfectant, ingredients=["次氯酸钠"]))
        repo.create(_prod("p-jc", "洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"]))

        engine = CompatibilityEngine()
        svc = AssistantService(repo, engine)

        resp = _run(svc.ask("洁厕灵能和84消毒液一起用吗", [], None, None, OverrideAI()))

        assert resp.knowledge_status == "local_hit"
        critical = [w for w in resp.safety_warnings if w.severity == "critical"]
        assert len(critical) == 1
        assert critical[0].rule_id == "RULE-001"
        assert "不能混用" in resp.answer

    def test_attention_level_returned(self):
        """attention 级别关系也能返回。"""
        db = os.path.join(tempfile.mkdtemp(), "real.db")
        repo = InventoryRepository(db)
        # 过氧化氢 + 醋酸 → RULE-006 attention
        repo.create(_prod("p-hp", "双氧水", ProductCategory.disinfectant, ingredients=["过氧化氢"]))
        repo.create(_prod("p-va", "食醋", ProductCategory.kitchen_cleaner, ingredients=["醋酸"]))

        engine = CompatibilityEngine()
        svc = AssistantService(repo, engine)

        resp = _run(svc.ask("双氧水能和食醋一起用吗", [], None, None, OverrideAI()))

        # 应返回 attention 级别（不返回 critical）
        attention = [w for w in resp.safety_warnings if w.severity == "attention"]
        assert len(attention) >= 1
        assert resp.knowledge_status == "local_hit"

    def test_no_conflict_products(self):
        """无冲突产品组合返回无已知风险。"""
        db = os.path.join(tempfile.mkdtemp(), "real.db")
        repo = InventoryRepository(db)
        repo.create(_prod("p-a", "洗衣液", ProductCategory.laundry, ingredients=["表面活性剂"]))
        repo.create(_prod("p-b", "柔顺剂", ProductCategory.fabric_softener, ingredients=["阳离子表面活性剂"]))

        engine = CompatibilityEngine()
        svc = AssistantService(repo, engine)

        resp = _run(svc.ask("洗衣液能和柔顺剂一起用吗", [], None, None, OverrideAI()))

        assert resp.knowledge_status == "no_match"
        assert resp.safety_warnings == []
        assert "未发现" in resp.answer or "无已知" in resp.answer
