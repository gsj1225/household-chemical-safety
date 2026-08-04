"""Mock 模式启动测试（模拟生产配置）。

注意：此测试使用 FastAPI TestClient 模拟生产配置（DEBUG=false +
DEMO_ACCESS_TOKEN），不是真实的 Docker 容器启动测试。
真实的 Docker 容器验证待执行（标记为 TODO）。

覆盖：
- AI_PROVIDER=mock + DEBUG=false + 有令牌时后端可正常响应
- Mock 模式下鉴权正常工作
- Mock 模式下识别接口正常
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_inventory_service
from app.config import settings
from app.core.mock_ai import MockAI
from app.core.rate_limit import rate_limiter
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.services.inventory_service import InventoryService


@pytest.fixture
def mock_mode_client(tmp_path):
    """模拟生产 Mock 模式：DEBUG=false, AI_PROVIDER=mock, 有令牌。

    注意：这不是真实的 Docker 容器测试。
    真实 Docker 验证（TODO）：
      docker build -t homechem-api backend/
      docker run -p 8000:8000 --env-file backend/.env homechem-api
      curl http://localhost:8000/health
    """
    path = str(tmp_path / "test_mock_mode.db")
    repo = InventoryRepository(path)
    service = InventoryService(repo)

    original_debug = settings.DEBUG
    original_token = settings.DEMO_ACCESS_TOKEN

    settings.DEBUG = False
    settings.DEMO_ACCESS_TOKEN = "mock-test-token"

    def override_service():
        return service

    def override_ai():
        return MockAI()

    app.dependency_overrides[get_inventory_service] = override_service
    app.dependency_overrides[get_ai_provider] = override_ai

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()
    settings.DEBUG = original_debug
    settings.DEMO_ACCESS_TOKEN = original_token
    rate_limiter.clear()


class TestMockMode:
    """Mock 模式测试（非 Docker 容器测试）。"""

    def test_health_ok_in_mock_mode(self, mock_mode_client):
        """Mock 模式健康检查正常。"""
        resp = mock_mode_client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"

    def test_api_requires_token_in_mock_mode(self, mock_mode_client):
        """Mock 模式下 API 需要令牌。"""
        resp = mock_mode_client.get("/api/inventory/products")
        assert resp.status_code == 401

    def test_api_works_with_token_in_mock_mode(self, mock_mode_client):
        """Mock 模式下带令牌正常访问。"""
        resp = mock_mode_client.get(
            "/api/inventory/products",
            headers={"Authorization": "Bearer mock-test-token"},
        )
        assert resp.status_code == 200

    def test_recognition_works_in_mock_mode(self, mock_mode_client):
        """Mock 模式下识别接口正常。"""
        import io
        resp = mock_mode_client.post(
            "/api/inventory/recognition/recognize",
            files={"image": ("test.jpg", io.BytesIO(b"fake-jpeg-data"), "image/jpeg")},
            headers={"Authorization": "Bearer mock-test-token"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "draftId" in body
