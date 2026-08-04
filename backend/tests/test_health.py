"""健康检查测试。

覆盖：
- DB 正常时返回 200
- DB 不可用时返回 503
- 响应包含 db 字段
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_inventory_service
from app.config import settings
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.services.inventory_service import InventoryService


@pytest.fixture
def client(tmp_path):
    path = str(tmp_path / "test_health.db")
    repo = InventoryRepository(path)
    service = InventoryService(repo)

    def override_service():
        return service

    app.dependency_overrides[get_inventory_service] = override_service
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


class TestHealthCheck:
    """健康检查。"""

    def test_healthy_returns_200(self, client):
        """DB 正常时返回 200。"""
        resp = client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"
        assert body["app"] == settings.APP_NAME

    def test_db_unavailable_returns_503(self, client, tmp_path):
        """DB 不可用时返回 503，使 Docker healthcheck 失败。"""
        original_path = settings.DATABASE_PATH
        settings.DATABASE_PATH = str(tmp_path / "nonexistent" / "missing.db")
        try:
            resp = client.get("/health")
            assert resp.status_code == 503
            body = resp.json()
            assert body["status"] == "degraded"
            assert body["db"] == "error"
        finally:
            settings.DATABASE_PATH = original_path

    def test_root_returns_app_info(self, client):
        """根路径返回应用信息。"""
        resp = client.get("/")
        assert resp.status_code == 200
        body = resp.json()
        assert "app" in body
        assert "version" in body
