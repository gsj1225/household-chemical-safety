"""B2 Compatibility API 测试

覆盖：摘要查询、关系列表、关系详情、404错误码、空库摘要、筛选过滤。
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_compatibility_service, get_inventory_service
from app.core.compatibility_engine import CompatibilityEngine
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.models.inventory import (
    DuplicateDecision,
    ProductCategory,
    ProductCreate,
)
from app.services.compatibility_service import CompatibilityService
from app.services.inventory_service import InventoryService


@pytest.fixture
def client(tmp_path):
    """使用临时数据库的测试客户端"""
    path = str(tmp_path / "test_api_compat.db")
    repo = InventoryRepository(path)
    engine = CompatibilityEngine()
    compat_service = CompatibilityService(repo, engine)
    inventory_service = InventoryService(repo)
    inventory_service.set_compatibility_callback(
        lambda product_id: compat_service.recalculate_for_product(product_id)
    )

    app.dependency_overrides[get_compatibility_service] = lambda: compat_service
    app.dependency_overrides[get_inventory_service] = lambda: inventory_service

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    repo.clear()


def _create_product(client, product_id, name, brand, category, barcode=None, ingredients=None):
    """辅助：通过API创建产品"""
    ingredient_objs = []
    for ing in (ingredients or []):
        ingredient_objs.append({
            "display_value": ing,
            "normalized_value": None,
            "source": "label",
            "confirmation": "confirmed",
            "audit_source": None,
        })
    payload = {
        "productId": product_id,
        "operationId": f"op-{product_id}",
        "revision": 1,
        "name": name,
        "category": category,
        "brand": brand,
        "productionDate": {"value": "2025-05", "precision": "month", "source": "label"},
        "expiryDate": {"value": "2027-05", "precision": "month", "source": "label"},
        "shelfLifeText": None,
        "barcode": barcode,
        "ingredients": ingredient_objs,
        "confirmedFacts": [],
        "safetyStatements": [],
        "identificationConfidence": "user_confirmed",
        "informationStatus": "complete",
        "duplicateDecision": "create_another",
        "labelWarnings": [],
        "storageRequirements": [],
        "hazards": [],
    }
    resp = client.post("/api/inventory/products", json=payload)
    assert resp.status_code == 201, f"创建失败: {resp.text}"
    return resp.json()


class TestSummary:
    """相容性摘要"""

    def test_empty_inventory_summary(self, client):
        """空库摘要为 no_registered_conflict"""
        resp = client.get("/api/inventory/compatibility/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "no_registered_conflict"
        assert data["totalProducts"] == 0
        assert data["totalRelations"] == 0
        assert data["criticalCount"] == 0

    def test_summary_after_creating_conflicting_products(self, client):
        """创建含氯+酸性产品后摘要显示 has_conflict"""
        _create_product(
            client, "p1", "84消毒液", "品牌A", "disinfectant",
            ingredients=["次氯酸钠", "水"]
        )
        _create_product(
            client, "p2", "洁厕灵", "品牌B", "toilet_cleaner",
            ingredients=["盐酸", "水"]
        )
        resp = client.get("/api/inventory/compatibility/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "has_conflict"
        assert data["totalProducts"] == 2
        assert data["criticalCount"] >= 1

    def test_summary_boundary_notice_present(self, client):
        """摘要包含边界声明"""
        resp = client.get("/api/inventory/compatibility/summary")
        data = resp.json()
        assert "boundary_notice" in data
        assert len(data["boundary_notice"]) > 0


class TestRelationsList:
    """关系列表"""

    def test_list_empty_relations(self, client):
        resp = client.get("/api/inventory/compatibility/relations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_relations_after_conflict(self, client):
        """创建冲突产品后关系列表非空"""
        _create_product(
            client, "p1", "84消毒液", "品牌A", "disinfectant",
            ingredients=["次氯酸钠"]
        )
        _create_product(
            client, "p2", "洁厕灵", "品牌B", "toilet_cleaner",
            ingredients=["盐酸"]
        )
        resp = client.get("/api/inventory/compatibility/relations")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    def test_list_relations_filter_by_product(self, client):
        """按产品ID筛选关系"""
        _create_product(
            client, "p1", "84消毒液", "品牌A", "disinfectant",
            ingredients=["次氯酸钠"]
        )
        _create_product(
            client, "p2", "洁厕灵", "品牌B", "toilet_cleaner",
            ingredients=["盐酸"]
        )
        _create_product(
            client, "p3", "洗洁精", "品牌C", "kitchen_cleaner",
            ingredients=["表面活性剂"]
        )
        resp = client.get("/api/inventory/compatibility/relations?product_id=p1")
        assert resp.status_code == 200
        data = resp.json()
        # p1 和 p2 有冲突，p3 无冲突
        for item in data["items"]:
            assert item["product_a_id"] == "p1" or item["product_b_id"] == "p1"

    def test_list_relations_filter_by_severity(self, client):
        """按严重等级筛选关系"""
        _create_product(
            client, "p1", "84消毒液", "品牌A", "disinfectant",
            ingredients=["次氯酸钠"]
        )
        _create_product(
            client, "p2", "洁厕灵", "品牌B", "toilet_cleaner",
            ingredients=["盐酸"]
        )
        resp = client.get("/api/inventory/compatibility/relations?severity=critical")
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            assert item["severity"] == "critical"


class TestRelationDetail:
    """关系详情"""

    def test_get_relation_detail_not_found(self, client):
        resp = client.get("/api/inventory/compatibility/relations/nonexistent-id")
        assert resp.status_code == 404
        data = resp.json()
        assert data["error"]["code"] == "RELATION_NOT_FOUND"

    def test_get_relation_detail_found(self, client):
        """创建冲突后获取关系详情"""
        _create_product(
            client, "p1", "84消毒液", "品牌A", "disinfectant",
            ingredients=["次氯酸钠"]
        )
        _create_product(
            client, "p2", "洁厕灵", "品牌B", "toilet_cleaner",
            ingredients=["盐酸"]
        )
        # 先获取关系列表拿到 relation_id
        list_resp = client.get("/api/inventory/compatibility/relations")
        relations = list_resp.json()["items"]
        assert len(relations) >= 1

        relation_id = relations[0]["relation_id"]
        resp = client.get(f"/api/inventory/compatibility/relations/{relation_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["relation_id"] == relation_id
        assert data["severity"] == "critical"
        assert data["relation_type"] == "do_not_mix"


class TestNoConflictScenario:
    """无冲突场景"""

    def test_no_conflict_products_summary(self, client):
        """无规则匹配的产品不产生 safe 关系行"""
        _create_product(
            client, "p1", "洗洁精", "品牌A", "kitchen_cleaner",
            ingredients=["表面活性剂"]
        )
        _create_product(
            client, "p2", "柔顺剂", "品牌B", "fabric_softener",
            ingredients=["季铵盐"]
        )
        resp = client.get("/api/inventory/compatibility/summary")
        data = resp.json()
        assert data["status"] == "no_registered_conflict"
        assert data["totalRelations"] == 0

    def test_no_conflict_relations_empty(self, client):
        _create_product(
            client, "p1", "洗洁精", "品牌A", "kitchen_cleaner",
            ingredients=["表面活性剂"]
        )
        _create_product(
            client, "p2", "柔顺剂", "品牌B", "fabric_softener",
            ingredients=["季铵盐"]
        )
        resp = client.get("/api/inventory/compatibility/relations")
        data = resp.json()
        assert data["total"] == 0
