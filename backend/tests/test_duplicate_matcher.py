"""DuplicateMatcher 单元测试 — B2 验收

覆盖场景：
- 条码强匹配
- 品牌+名称强匹配
- 名称普通匹配
- 无匹配返回空列表
- 大小写不敏感
- 前后空格容错
- 多条码匹配
- 不合并记录（只返回候选）
"""

from __future__ import annotations

import pytest

from app.core.duplicate_matcher import DuplicateMatcher
from app.models.inventory import InventoryProduct, ProductCategory, ConfirmedFact, FactSource


class FakeProductReader:
    """内存产品列表，模拟 ProductReader 接口"""

    def __init__(self, products: list[InventoryProduct]):
        self._products = products

    def list_all(self) -> list[InventoryProduct]:
        return list(self._products)


def make_product(
    product_id: str = "p1",
    name: str = "威猛先生",
    brand: str | None = "威露",
    category: ProductCategory = ProductCategory.kitchen_cleaner,
    barcode: str | None = "6901234567890",
) -> InventoryProduct:
    return InventoryProduct(
        id=product_id,
        name=name,
        brand=brand,
        category=category,
        barcode=barcode,
        ingredients=[ConfirmedFact(display_value="水", source=FactSource.label)],
        createdAt="2026-01-01T00:00:00Z",
        updatedAt="2026-01-01T00:00:00Z",
        revision=1,
    )


class TestBarcodeMatch:
    """条码强匹配"""

    def test_barcode_exact_match_returns_strong(self):
        products = [make_product(product_id="p1", barcode="6901234567890")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="任意名称", barcode="6901234567890")
        assert len(candidates) == 1
        assert candidates[0].product_id == "p1"
        assert candidates[0].match_strength == "strong"
        assert "条码" in candidates[0].match_reason

    def test_barcode_no_match_returns_empty(self):
        products = [make_product(product_id="p1", barcode="6901234567890")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="任意", barcode="9999999999999")
        assert candidates == []

    def test_barcode_match_multiple_products(self):
        """多条码完全一致时全部返回"""
        products = [
            make_product(product_id="p1", barcode="6901234567890"),
            make_product(product_id="p2", name="另一款", barcode="6901234567890"),
        ]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="任意", barcode="6901234567890")
        assert len(candidates) == 2

    def test_barcode_none_skips_barcode_match(self):
        """barcode 为 None 时不走条码匹配"""
        products = [make_product(product_id="p1", barcode="6901234567890")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露", barcode=None)
        # 应走品牌+名称匹配
        assert len(candidates) == 1
        assert "条码" not in candidates[0].match_reason


class TestBrandNameMatch:
    """品牌+名称强匹配"""

    def test_brand_name_exact_match_returns_strong(self):
        products = [make_product(product_id="p1", name="威猛先生", brand="威露")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露")
        assert len(candidates) == 1
        assert candidates[0].match_strength == "strong"
        assert "品牌" in candidates[0].match_reason

    def test_brand_name_case_insensitive(self):
        products = [make_product(product_id="p1", name="Cleaner", brand="BrandX")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="cleaner", brand="brandx")
        assert len(candidates) == 1
        assert candidates[0].match_strength == "strong"

    def test_brand_name_whitespace_tolerant(self):
        products = [make_product(product_id="p1", name=" 威猛先生 ", brand=" 威露 ")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露")
        assert len(candidates) == 1

    def test_brand_mismatch_no_strong_match(self):
        """品牌不同时不应走强匹配，但可能走名称普通匹配"""
        products = [make_product(product_id="p1", name="威猛先生", brand="威露")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="另一品牌")
        assert len(candidates) == 1
        assert candidates[0].match_strength == "normal"

    def test_brand_none_falls_to_name_match(self):
        """brand 为 None 时跳过品牌匹配，走名称匹配"""
        products = [make_product(product_id="p1", name="威猛先生", brand="威露")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand=None)
        assert len(candidates) == 1
        assert candidates[0].match_strength == "normal"


class TestNameMatch:
    """名称普通匹配"""

    def test_name_only_match_returns_normal(self):
        products = [make_product(product_id="p1", name="威猛先生", brand=None)]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand=None, barcode=None)
        assert len(candidates) == 1
        assert candidates[0].match_strength == "normal"
        assert "产品名" in candidates[0].match_reason

    def test_name_case_insensitive(self):
        products = [make_product(product_id="p1", name="Cleaner")]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="CLEANER")
        assert len(candidates) == 1


class TestNoMatch:
    """无匹配场景"""

    def test_empty_product_list(self):
        matcher = DuplicateMatcher(FakeProductReader([]))
        candidates = matcher.find_duplicates(name="任意", brand="任意", barcode="123")
        assert candidates == []

    def test_completely_different_products(self):
        products = [
            make_product(product_id="p1", name="洗洁精", brand="立白", barcode="111"),
            make_product(product_id="p2", name="消毒液", brand="滴露", barcode="222"),
        ]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="柔顺剂", brand="蓝月亮", barcode="333")
        assert candidates == []


class TestPriority:
    """匹配优先级（短路返回）"""

    def test_barcode_takes_priority_over_name(self):
        """条码匹配时不再检查名称"""
        products = [
            make_product(product_id="p1", name="完全不同的名字", brand="不同品牌", barcode="6901234567890"),
        ]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露", barcode="6901234567890")
        assert len(candidates) == 1
        assert candidates[0].match_strength == "strong"
        assert "条码" in candidates[0].match_reason

    def test_brand_name_takes_priority_over_name_only(self):
        """品牌+名称匹配时不再走名称普通匹配"""
        products = [
            make_product(product_id="p1", name="威猛先生", brand="威露"),
            make_product(product_id="p2", name="威猛先生", brand="另一个品牌"),
        ]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露")
        # 只返回品牌+名称都匹配的 p1
        assert len(candidates) == 1
        assert candidates[0].product_id == "p1"
        assert candidates[0].match_strength == "strong"


class TestDoesNotMerge:
    """DuplicateMatcher 只返回候选，不修改数据"""

    def test_does_not_modify_product_list(self):
        products = [make_product(product_id="p1", name="威猛先生", brand="威露")]
        original_count = len(products)
        matcher = DuplicateMatcher(FakeProductReader(products))
        matcher.find_duplicates(name="威猛先生", brand="威露")
        assert len(products) == original_count

    def test_candidate_has_product_info(self):
        products = [
            make_product(product_id="p1", name="威猛先生", brand="威露",
                        category=ProductCategory.kitchen_cleaner, barcode="6901234567890")
        ]
        matcher = DuplicateMatcher(FakeProductReader(products))
        candidates = matcher.find_duplicates(name="威猛先生", brand="威露")
        assert candidates[0].name == "威猛先生"
        assert candidates[0].brand == "威露"
        assert candidates[0].category == "kitchen_cleaner"
