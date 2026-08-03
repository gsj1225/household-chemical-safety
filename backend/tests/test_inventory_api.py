"""B1 Inventory API 测试

覆盖：列表、详情、创建、修改、删除、重复检查、幂等、revision冲突、错误码。
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_inventory_service
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.models.inventory import (
    ConfirmedFact,
    DatePrecision,
    DuplicateDecision,
    FactSource,
    IdentificationConfidence,
    InformationStatus,
    PartialDate,
    ProductCategory,
    ProductCreate,
    SafetyStatement,
)
from app.services.inventory_service import InventoryService


@pytest.fixture
def client(tmp_path):
    """使用临时数据库的测试客户端"""
    path = str(tmp_path / "test_api_inventory.db")
    repo = InventoryRepository(path)
    service = InventoryService(repo)

    def override_service():
        return service

    app.dependency_overrides[get_inventory_service] = override_service
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    repo.clear()


def _make_create_payload(
    product_id="p-api-001",
    name="84消毒液",
    operation_id="op-api-001",
    brand="某品牌",
    duplicate_decision="check_first",
) -> dict:
    return {
        "productId": product_id,
        "operationId": operation_id,
        "revision": 1,
        "name": name,
        "category": "disinfectant",
        "brand": brand,
        "production_date": {"value": "2025-05", "precision": "month", "source": "label"},
        "expiry_date": {"value": "2027-05", "precision": "month", "source": "label"},
        "shelf_life_text": None,
        "ingredients": [{"display_value": "次氯酸钠", "source": "label", "confirmation": "confirmed", "normalized_value": None, "audit_source": None}],
        "label_warnings": [],
        "storage_requirements": [{"text": "避光阴凉", "source": "label", "rule_id": None}],
        "hazards": [],
        "incompatibility_targets": [],
        "identification_confidence": "high",
        "information_status": "complete",
        "duplicateDecision": duplicate_decision,
    }


class TestProductList:
    def test_empty_list(self, client):
        r = client.get("/api/inventory/products")
        assert r.status_code == 200
        data = r.json()
        assert data["items"] == []
        assert data["total"] == 0
        assert data["summary"]["status"] == "no_registered_conflict"
        assert data["summary"]["totalProducts"] == 0

    def test_list_with_products(self, client):
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "消毒液"))
        client.post("/api/inventory/products", json=_make_create_payload("p-002", "洁厕灵", "op-002"))
        r = client.get("/api/inventory/products")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 2
        assert data["summary"]["totalProducts"] == 2

    def test_list_search(self, client):
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "84消毒液"))
        client.post("/api/inventory/products", json=_make_create_payload("p-002", "洁厕灵", "op-002"))
        r = client.get("/api/inventory/products?query=消毒")
        assert r.status_code == 200
        data = r.json()
        assert data["total"] == 1
        assert data["items"][0]["name"] == "84消毒液"

    def test_list_filter_category(self, client):
        payload = _make_create_payload("p-002", "洁厕灵", "op-002")
        payload["category"] = "toilet_cleaner"
        client.post("/api/inventory/products", json=payload)
        r = client.get("/api/inventory/products?category=toilet_cleaner")
        assert r.status_code == 200
        assert r.json()["total"] == 1


class TestProductCreate:
    def test_create_success(self, client):
        r = client.post("/api/inventory/products", json=_make_create_payload())
        assert r.status_code == 201
        data = r.json()
        assert data["product"]["productId"] == "p-api-001"
        assert data["product"]["name"] == "84消毒液"
        assert data["product"]["revision"] == 1
        assert data["compatibilitySummary"]["totalProducts"] == 1
        assert data["changedRelations"] == []

    def test_create_idempotent_same_request(self, client):
        payload = _make_create_payload()
        r1 = client.post("/api/inventory/products", json=payload)
        assert r1.status_code == 201
        r2 = client.post("/api/inventory/products", json=payload)
        assert r2.status_code == 201
        # 幂等：相同 operationId + 相同请求应返回相同结果
        assert r1.json()["product"]["productId"] == r2.json()["product"]["productId"]
        # 只创建了一条记录
        assert r2.json()["compatibilitySummary"]["totalProducts"] == 1

    def test_create_duplicate_candidate(self, client):
        # 先创建一个
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "84消毒液"))
        # 再创建同名的
        payload2 = _make_create_payload("p-002", "84消毒液", "op-002", "某品牌")
        r = client.post("/api/inventory/products", json=payload2)
        assert r.status_code == 409
        data = r.json()
        assert data["error"]["code"] == "DUPLICATE_CANDIDATE"
        assert len(data["error"]["candidates"]) > 0

    def test_create_with_duplicate_decision_update(self, client):
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "84消毒液"))
        # 使用 update_existing 决策应被拒绝，应走 PATCH 更新接口
        payload2 = _make_create_payload("p-002", "84消毒液", "op-002", "某品牌", "update_existing")
        r = client.post("/api/inventory/products", json=payload2)
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "BAD_REQUEST"


class TestProductDetail:
    def test_get_existing(self, client):
        client.post("/api/inventory/products", json=_make_create_payload())
        r = client.get("/api/inventory/products/p-api-001")
        assert r.status_code == 200
        assert r.json()["product"]["name"] == "84消毒液"

    def test_get_not_found(self, client):
        r = client.get("/api/inventory/products/nonexistent")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "PRODUCT_NOT_FOUND"


class TestProductUpdate:
    def test_update_success(self, client):
        client.post("/api/inventory/products", json=_make_create_payload())
        update_payload = {
            "expectedRevision": 1,
            "operationId": "op-update-001",
            "name": "84消毒液（改名）",
            "category": "disinfectant",
            "brand": "某品牌",
            "production_date": {"value": "2025-05", "precision": "month", "source": "label"},
            "expiry_date": {"value": "2028-01", "precision": "month", "source": "label"},
            "shelf_life_text": None,
            "ingredients": [{"display_value": "次氯酸钠", "source": "label", "confirmation": "confirmed", "normalized_value": None, "audit_source": None}],
            "label_warnings": [],
            "storage_requirements": [{"text": "避光阴凉", "source": "label", "rule_id": None}],
            "hazards": [],
            "incompatibility_targets": [],
            "identification_confidence": "high",
            "information_status": "complete",
        }
        r = client.patch("/api/inventory/products/p-api-001", json=update_payload)
        assert r.status_code == 200
        data = r.json()
        assert data["product"]["revision"] == 2
        assert data["product"]["name"] == "84消毒液（改名）"

    def test_update_revision_conflict(self, client):
        client.post("/api/inventory/products", json=_make_create_payload())
        update_payload = {
            "expectedRevision": 99,
            "operationId": "op-update-001",
            "name": "改名",
            "category": "disinfectant",
            "production_date": {"precision": "unknown", "value": None, "source": "label"},
            "expiry_date": {"precision": "unknown", "value": None, "source": "label"},
            "ingredients": [],
            "label_warnings": [],
            "storage_requirements": [],
            "hazards": [],
            "incompatibility_targets": [],
            "identification_confidence": "unknown",
            "information_status": "needs_information",
        }
        r = client.patch("/api/inventory/products/p-api-001", json=update_payload)
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "PRODUCT_VERSION_CONFLICT"

    def test_update_not_found(self, client):
        update_payload = {
            "expectedRevision": 1,
            "operationId": "op-update-001",
            "name": "改名",
            "category": "disinfectant",
            "production_date": {"precision": "unknown", "value": None, "source": "label"},
            "expiry_date": {"precision": "unknown", "value": None, "source": "label"},
            "ingredients": [],
            "label_warnings": [],
            "storage_requirements": [],
            "hazards": [],
            "incompatibility_targets": [],
            "identification_confidence": "unknown",
            "information_status": "needs_information",
        }
        r = client.patch("/api/inventory/products/nonexistent", json=update_payload)
        assert r.status_code == 404


class TestProductDelete:
    def test_delete_success(self, client):
        client.post("/api/inventory/products", json=_make_create_payload())
        r = client.request(
            "DELETE",
            "/api/inventory/products/p-api-001",
            json={"expectedRevision": 1, "operationId": "op-del-001"},
        )
        assert r.status_code == 200
        assert r.json()["totalProducts"] == 0

        # 确认已删除
        r2 = client.get("/api/inventory/products/p-api-001")
        assert r2.status_code == 404

    def test_delete_revision_conflict(self, client):
        client.post("/api/inventory/products", json=_make_create_payload())
        r = client.request(
            "DELETE",
            "/api/inventory/products/p-api-001",
            json={"expectedRevision": 99, "operationId": "op-del-001"},
        )
        assert r.status_code == 409
        assert r.json()["error"]["code"] == "PRODUCT_VERSION_CONFLICT"


class TestDuplicateCheck:
    def test_check_duplicates_found(self, client):
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "84消毒液"))
        r = client.post(
            "/api/inventory/duplicates/check",
            json={"name": "84消毒液", "brand": "某品牌", "category": "disinfectant", "ingredients": []},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["hasCandidates"] is True
        assert data["candidates"][0]["matchStrength"] == "strong"

    def test_check_duplicates_none(self, client):
        client.post("/api/inventory/products", json=_make_create_payload("p-001", "84消毒液"))
        r = client.post(
            "/api/inventory/duplicates/check",
            json={"name": "完全不同的产品", "ingredients": []},
        )
        assert r.status_code == 200
        assert r.json()["hasCandidates"] is False

    def test_check_duplicates_barcode(self, client):
        payload = _make_create_payload("p-001", "84消毒液")
        payload["barcode"] = "6901234567890"
        client.post("/api/inventory/products", json=payload)
        r = client.post(
            "/api/inventory/duplicates/check",
            json={"name": "其他产品", "barcode": "6901234567890", "ingredients": []},
        )
        assert r.status_code == 200
        assert r.json()["hasCandidates"] is True
