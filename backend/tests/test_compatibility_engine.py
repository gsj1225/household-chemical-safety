"""B2 CompatibilityEngine 测试

覆盖：A/B对称、别名归一化、证据状态、信息不足、无命中。
"""

import pytest

from app.core.compatibility_engine import CompatibilityEngine
from app.models.inventory import (
    ConfirmedFact,
    DatePrecision,
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    InventoryProduct,
    PartialDate,
    ProductCategory,
)


@pytest.fixture
def engine():
    return CompatibilityEngine()


def _make_product(
    pid="p-001",
    name="84消毒液",
    category=ProductCategory.disinfectant,
    ingredients=None,
    info_status=InformationStatus.complete,
) -> InventoryProduct:
    return InventoryProduct(
        productId=pid,
        name=name,
        category=category,
        ingredients=ingredients or [],
        identification_confidence=IdentificationConfidence.high,
        information_status=info_status,
        production_date=PartialDate(precision=DatePrecision.unknown),
        expiry_date=PartialDate(precision=DatePrecision.unknown),
    )


class TestRuleMatching:
    def test_chlorine_acid_critical(self, engine):
        """含氯消毒剂 + 酸性清洁剂 = critical do_not_mix"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="盐酸", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) >= 1
        assert any(r.relation_type.value == "do_not_mix" for r in relations)
        assert any(r.severity.value == "critical" for r in relations)

    def test_chlorine_ammonia_critical(self, engine):
        """含氯 + 含氨 = critical"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "玻璃水", ProductCategory.kitchen_cleaner,
                          [ConfirmedFact(display_value="氨水", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert any(r.severity.value == "critical" for r in relations)

    def test_chlorine_alcohol_critical(self, engine):
        """含氯 + 酒精 = critical"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "酒精喷雾", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="乙醇", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert any(r.severity.value == "critical" for r in relations)

    def test_alkali_acid_critical(self, engine):
        """强碱 + 酸 = critical"""
        a = _make_product("p-001", "管道疏通剂", ProductCategory.drain_cleaner,
                          [ConfirmedFact(display_value="氢氧化钠", source=FactSource.label)])
        b = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="盐酸", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert any(r.severity.value == "critical" for r in relations)


class TestSymmetry:
    def test_ab_order_symmetric(self, engine):
        """A/B 交换结果不变"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="盐酸", source=FactSource.label)])

        relations_ab = engine.check_pair(a, b)
        relations_ba = engine.check_pair(b, a)

        assert len(relations_ab) == len(relations_ba)
        # 规则 ID 集合相同
        rules_ab = {r.rule_id for r in relations_ab}
        rules_ba = {r.rule_id for r in relations_ba}
        assert rules_ab == rules_ba


class TestAliasNormalization:
    def test_alias_resolved(self, engine):
        """别名归一化：'次氯酸鈉'（繁体）→ '次氯酸钠'"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸鈉", source=FactSource.label)])
        b = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="鹽酸", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) >= 1

    def test_english_alias(self, engine):
        """英文别名归一化：'sodium hypochlorite' → '次氯酸钠'"""
        a = _make_product("p-001", "Bleach", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="sodium hypochlorite", source=FactSource.label)])
        b = _make_product("p-002", "Toilet Cleaner", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="hydrochloric acid", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) >= 1

    def test_case_insensitive(self, engine):
        """大小写不敏感"""
        a = _make_product("p-001", "Bleach", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="SODIUM HYPOCHLORITE", source=FactSource.label)])
        b = _make_product("p-002", "Cleaner", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="Hydrochloric Acid", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) >= 1


class TestNoConflict:
    def test_same_category_no_rule(self, engine):
        """同品类但无规则不得误报"""
        a = _make_product("p-001", "洗洁精A", ProductCategory.kitchen_cleaner,
                          [ConfirmedFact(display_value="表面活性剂", source=FactSource.label)])
        b = _make_product("p-002", "洗洁精B", ProductCategory.kitchen_cleaner,
                          [ConfirmedFact(display_value="表面活性剂", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) == 0

    def test_unrelated_products(self, engine):
        """无关联产品不产生关系"""
        a = _make_product("p-001", "洗衣液", ProductCategory.laundry,
                          [ConfirmedFact(display_value="表面活性剂", source=FactSource.label)])
        b = _make_product("p-002", "杀虫喷雾", ProductCategory.pesticide,
                          [ConfirmedFact(display_value="拟除虫菊酯", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        assert len(relations) == 0


class TestNeedsInformation:
    def test_both_unknown_ingredients(self, engine):
        """两个产品都无成分信息且状态为needs_information"""
        a = _make_product("p-001", "产品A", ProductCategory.disinfectant,
                          info_status=InformationStatus.needs_information)
        b = _make_product("p-002", "产品B", ProductCategory.toilet_cleaner,
                          info_status=InformationStatus.needs_information)
        relations = engine.check_pair(a, b)
        assert len(relations) == 1
        assert relations[0].relation_type.value == "needs_information"
        assert relations[0].severity.value == "unknown"

    def test_one_complete_one_unknown_no_needs_info(self, engine):
        """一个有成分一个没有，不应产生needs_information"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)],
                          info_status=InformationStatus.complete)
        b = _make_product("p-002", "未知产品", ProductCategory.toilet_cleaner,
                          info_status=InformationStatus.needs_information)
        relations = engine.check_pair(a, b)
        # 84消毒液按品类也能触发规则（disinfectant + toilet_cleaner）
        # 所以可能有关系，但不应该是 needs_information
        for r in relations:
            assert r.relation_type.value != "needs_information"


class TestEvidenceStatus:
    def test_verified_rule_has_sources(self, engine):
        """verified 规则有来源"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                          [ConfirmedFact(display_value="盐酸", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        rule_001 = [r for r in relations if r.rule_id == "RULE-001"]
        assert len(rule_001) == 1
        assert rule_001[0].evidence_status.value == "verified"
        assert len(rule_001[0].sources) > 0

    def test_needs_review_rule_has_no_sources(self, engine):
        """needs_review 规则来源为空"""
        a = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        b = _make_product("p-002", "酒精", ProductCategory.disinfectant,
                          [ConfirmedFact(display_value="乙醇", source=FactSource.label)])
        relations = engine.check_pair(a, b)
        rule_003 = [r for r in relations if r.rule_id == "RULE-003"]
        assert len(rule_003) == 1
        assert rule_003[0].evidence_status.value == "needs_review"
        assert len(rule_003[0].sources) == 0


class TestCheckAgainstAll:
    def test_multiple_products(self, engine):
        """目标产品与多个库存产品产生关系"""
        target = _make_product("p-001", "84消毒液", ProductCategory.disinfectant,
                               [ConfirmedFact(display_value="次氯酸钠", source=FactSource.label)])
        acid = _make_product("p-002", "洁厕灵", ProductCategory.toilet_cleaner,
                             [ConfirmedFact(display_value="盐酸", source=FactSource.label)])
        alcohol = _make_product("p-003", "酒精", ProductCategory.disinfectant,
                                [ConfirmedFact(display_value="乙醇", source=FactSource.label)])
        safe = _make_product("p-004", "洗衣液", ProductCategory.laundry,
                             [ConfirmedFact(display_value="表面活性剂", source=FactSource.label)])

        relations = engine.check_against_all(target, [acid, alcohol, safe])
        # 应该与 acid 和 alcohol 产生关系，与 safe 无关系
        related_ids = {r.product_a_id for r in relations} | {r.product_b_id for r in relations}
        assert "p-002" in related_ids
        assert "p-003" in related_ids
        assert "p-004" not in related_ids
