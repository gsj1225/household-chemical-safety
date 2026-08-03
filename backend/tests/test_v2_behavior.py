"""V2 行为集成测试 — 覆盖第三轮审查中的 P0/P1 场景

测试内容：
1. 产品详情返回单品摘要（非全库摘要）
2. 搜索查询正确过滤
3. 重复候选决策语义
4. 信息完整性判定
5. 幂等重试
6. 相容性关系列表包含产品 ID
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_inventory_service, get_compatibility_service
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.models.inventory import (
    ConfirmedFact,
    DatePrecision,
    DuplicateDecision,
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    InventoryFilters,
    PartialDate,
    ProductCategory,
    ProductCreate,
)
from app.services.inventory_service import InventoryService
from app.services.compatibility_service import CompatibilityService
from app.core.compatibility_engine import CompatibilityEngine


@pytest.fixture
def client(tmp_path):
    """使用临时数据库的测试客户端，注入相容性回调"""
    path = str(tmp_path / "test_v2_behavior.db")
    repo = InventoryRepository(path)
    engine = CompatibilityEngine()
    inv_service = InventoryService(repo)
    comp_service = CompatibilityService(repo, engine)
    inv_service.set_compatibility_callback(comp_service.recalculate_for_product)

    def override_inv():
        return inv_service

    def override_comp():
        return comp_service

    app.dependency_overrides[get_inventory_service] = override_inv
    app.dependency_overrides[get_compatibility_service] = override_comp
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    repo.clear()


def _make_create(
    name: str,
    product_id: str = "prod-test-001",
    operation_id: str = "op-test-001",
    brand: str | None = None,
    category: ProductCategory = ProductCategory.disinfectant,
    ingredients: list[str] | None = None,
    duplicate_decision: DuplicateDecision = DuplicateDecision.create_another,
) -> dict:
    """构建创建产品请求的 JSON payload"""
    return ProductCreate(
        productId=product_id,
        operationId=operation_id,
        revision=1,
        brand=brand,
        name=name,
        category=category,
        barcode=None,
        production_date=PartialDate(value=None, precision=DatePrecision.unknown, source=FactSource.label),
        expiry_date=PartialDate(value="2027-05", precision=DatePrecision.month, source=FactSource.label),
        shelf_life_text=None,
        ingredients=[
            ConfirmedFact(
                display_value=ing,
                normalized_value=None,
                source=FactSource.label,
                confirmation="confirmed",
                audit_source=None,
            )
            for ing in (ingredients or ["乙醇"])
        ],
        label_warnings=[],
        storage_requirements=[],
        hazards=[],
        incompatibility_targets=[],
        identification_confidence=IdentificationConfidence.user_confirmed,
        information_status=InformationStatus.complete,
        duplicateDecision=duplicate_decision,
    ).model_dump(by_alias=True)


# ── P0: 产品详情返回单品摘要 ──────────────────────

class TestProductDetailScopedSummary:
    """P0: 产品详情不应返回全库摘要，只返回涉及当前产品的关系"""

    def test_unrelated_product_shows_no_relations(self, client):
        """A、B 有冲突时，无关产品 C 的详情不应显示冲突"""
        # 创建产品 A（含次氯酸钠）
        client.post("/api/inventory/products", json=_make_create(
            "漂白水A", product_id="prod-a", operation_id="op-a",
            ingredients=["次氯酸钠"], category=ProductCategory.bleach,
        ))

        # 创建产品 B（含盐酸）—— 与 A 应有冲突
        client.post("/api/inventory/products", json=_make_create(
            "洁厕灵B", product_id="prod-b", operation_id="op-b",
            ingredients=["盐酸"], category=ProductCategory.toilet_cleaner,
        ))

        # 创建产品 C（与 A、B 无关）
        client.post("/api/inventory/products", json=_make_create(
            "洗手液C", product_id="prod-c", operation_id="op-c",
            ingredients=["表面活性剂"], category=ProductCategory.bathroom_cleaner,
        ))

        # 产品 C 的详情不应包含 A-B 之间的冲突
        detail_c = client.get("/api/inventory/products/prod-c")
        assert detail_c.status_code == 200
        data_c = detail_c.json()
        assert data_c["compatibilitySummary"]["totalRelations"] == 0
        assert data_c["compatibilitySummary"]["status"] == "no_registered_conflict"
        assert data_c["changedRelations"] == []

    def test_related_product_shows_relations(self, client):
        """A 与 B 有冲突时，A 的详情应显示冲突关系"""
        client.post("/api/inventory/products", json=_make_create(
            "漂白水A", product_id="prod-a", operation_id="op-a",
            ingredients=["次氯酸钠"], category=ProductCategory.bleach,
        ))
        client.post("/api/inventory/products", json=_make_create(
            "洁厕灵B", product_id="prod-b", operation_id="op-b",
            ingredients=["盐酸"], category=ProductCategory.toilet_cleaner,
        ))

        detail_a = client.get("/api/inventory/products/prod-a")
        assert detail_a.status_code == 200
        data_a = detail_a.json()
        assert data_a["compatibilitySummary"]["totalRelations"] > 0
        assert data_a["compatibilitySummary"]["criticalCount"] > 0
        assert len(data_a["changedRelations"]) > 0
        # 关系中应包含产品 A 的 ID
        for rel in data_a["changedRelations"]:
            assert "prod-a" in (rel["productAId"], rel["productBId"])


# ── P1: 搜索查询 ──────────────────────────────────

class TestSearchQuery:
    """P1: 搜索应正确过滤产品列表"""

    def test_search_by_name(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "威猛先生厨房清洁", product_id="p1", operation_id="op1",
        ))
        client.post("/api/inventory/products", json=_make_create(
            "蓝月亮洗手液", product_id="p2", operation_id="op2",
        ))

        resp = client.get("/api/inventory/products?query=厨房")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "威猛先生厨房清洁"

    def test_search_no_results(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "威猛先生", product_id="p1", operation_id="op1",
        ))

        resp = client.get("/api/inventory/products?query=不存在的产品")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert len(data["items"]) == 0

    def test_search_empty_returns_all(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "产品A", product_id="p1", operation_id="op1",
        ))
        client.post("/api/inventory/products", json=_make_create(
            "产品B", product_id="p2", operation_id="op2",
        ))

        resp = client.get("/api/inventory/products")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 2


# ── P1: 重复候选决策 ──────────────────────────────

class TestDuplicateDecision:
    """P1: 重复候选的三个分支语义"""

    def test_check_first_finds_duplicate(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "威猛先生", product_id="p1", operation_id="op1",
            duplicate_decision=DuplicateDecision.create_another,
        ))

        create2 = _make_create(
            "威猛先生", product_id="p2", operation_id="op2",
            duplicate_decision=DuplicateDecision.check_first,
        )
        resp = client.post("/api/inventory/products", json=create2)
        assert resp.status_code == 409
        data = resp.json()
        assert data["error"]["code"] == "DUPLICATE_CANDIDATE"
        assert len(data["error"]["candidates"]) > 0

    def test_create_another_skips_check(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "威猛先生", product_id="p1", operation_id="op1",
        ))

        resp = client.post("/api/inventory/products", json=_make_create(
            "威猛先生", product_id="p2", operation_id="op2",
            duplicate_decision=DuplicateDecision.create_another,
        ))
        assert resp.status_code == 201

    def test_update_existing_rejected_on_create(self, client):
        resp = client.post("/api/inventory/products", json=_make_create(
            "威猛先生", product_id="p1", operation_id="op1",
            duplicate_decision=DuplicateDecision.update_existing,
        ))
        assert resp.status_code == 400


# ── P1: 信息完整性 ────────────────────────────────

class TestInformationStatus:
    """P1: 信息完整性应检查名称+有效期+成分"""

    def test_complete_with_all_fields(self, client):
        resp = client.post("/api/inventory/products", json=_make_create(
            "完整产品", product_id="p1", operation_id="op1", ingredients=["乙醇"],
        ))
        assert resp.status_code == 201
        assert resp.json()["product"]["information_status"] == "complete"


# ── P1: 幂等重试 ──────────────────────────────────

class TestIdempotency:
    """P1: 相同 operationId + request 重试应返回缓存结果"""

    def test_retry_returns_same_result(self, client):
        payload = _make_create("测试产品", product_id="p1", operation_id="op-retry-001")
        resp1 = client.post("/api/inventory/products", json=payload)
        assert resp1.status_code == 201

        resp2 = client.post("/api/inventory/products", json=payload)
        assert resp2.status_code == 201
        assert resp1.json()["product"]["productId"] == resp2.json()["product"]["productId"]


# ── P1: 相容性关系列表包含产品 ID ─────────────────

class TestCompatibilityRelationsDisplay:
    """P1: 关系列表应包含产品 ID，前端可据此显示产品对"""

    def test_relations_contain_product_ids(self, client):
        client.post("/api/inventory/products", json=_make_create(
            "漂白水A", product_id="prod-a", operation_id="op-a",
            ingredients=["次氯酸钠"], category=ProductCategory.bleach,
        ))
        client.post("/api/inventory/products", json=_make_create(
            "洁厕灵B", product_id="prod-b", operation_id="op-b",
            ingredients=["盐酸"], category=ProductCategory.toilet_cleaner,
        ))

        resp = client.get("/api/inventory/compatibility/relations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] > 0
        for rel in data["items"]:
            assert "product_a_id" in rel
            assert "product_b_id" in rel
            assert rel["product_a_id"] != rel["product_b_id"]
