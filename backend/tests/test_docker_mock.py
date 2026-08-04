"""Docker Mock 模式启动测试。

验证 AI_PROVIDER=mock 时后端可正常启动并响应请求。
模拟 Docker 容器中的环境：DEBUG=false, DEMO_ACCESS_TOKEN 设置。
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
def docker_mock_client(tmp_path):
    """模拟 Docker Mock 模式：DEBUG=false, AI_PROVIDER=mock, 有令牌。"""
    path = str(tmp_path / "test_docker_mock.db")
    repo = InventoryRepository(path)
    service = InventoryService(repo)

    original_debug = settings.DEBUG
    original_token = settings.DEMO_ACCESS_TOKEN

    settings.DEBUG = False
    settings.DEMO_ACCESS_TOKEN = "docker-test-token"

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


class TestDockerMockMode:
    """Docker Mock 模式启动测试。"""

    def test_health_ok_in_mock_mode(self, docker_mock_client):
        """Mock 模式健康检查正常。"""
        resp = docker_mock_client.get("/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"

    def test_api_requires_token_in_mock_mode(self, docker_mock_client):
        """Mock 模式下 API 需要令牌。"""
        resp = docker_mock_client.get("/api/inventory/products")
        assert resp.status_code == 401

    def test_api_works_with_token_in_mock_mode(self, docker_mock_client):
        """Mock 模式下带令牌正常访问。"""
        resp = docker_mock_client.get(
            "/api/inventory/products",
            headers={"Authorization": "Bearer docker-test-token"},
        )
        assert resp.status_code == 200

    def test_recognition_works_in_mock_mode(self, docker_mock_client):
        """Mock 模式下识别接口正常。"""
        import io
        resp = docker_mock_client.post(
            "/api/inventory/recognition/recognize",
            files={"image": ("test.jpg", io.BytesIO(b"fake-jpeg-data"), "image/jpeg")},
            headers={"Authorization": "Bearer docker-test-token"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "draftId" in body
