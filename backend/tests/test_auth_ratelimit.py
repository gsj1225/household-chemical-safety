"""鉴权与限流测试。

覆盖：
- 演示令牌鉴权（有效/缺失/错误令牌）
- /health 和 / 豁免鉴权
- 识别接口限流（超限返回 429）
- 令牌为空时不启用鉴权
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_inventory_service
from app.core.mock_ai import MockAI
from app.core.rate_limit import rate_limiter
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.models.inventory import (
    DuplicateDecision,
    ProductCategory,
    ProductCreate,
)
from app.services.inventory_service import InventoryService


@pytest.fixture
def repo(tmp_path):
    path = str(tmp_path / "test_auth.db")
    return InventoryRepository(path)


@pytest.fixture
def service(repo):
    return InventoryService(repo)


@pytest.fixture
def client_no_auth(service):
    """无鉴权模式的客户端（DEMO_ACCESS_TOKEN 为空）。"""
    from app.config import settings
    original_token = settings.DEMO_ACCESS_TOKEN
    settings.DEMO_ACCESS_TOKEN = ""

    def override_service():
        return service

    app.dependency_overrides[get_inventory_service] = override_service
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    settings.DEMO_ACCESS_TOKEN = original_token
    rate_limiter.clear()


@pytest.fixture
def client_with_auth(service):
    """有鉴权模式的客户端。"""
    from app.config import settings
    original_token = settings.DEMO_ACCESS_TOKEN
    settings.DEMO_ACCESS_TOKEN = "test-demo-token-12345"

    def override_service():
        return service

    app.dependency_overrides[get_inventory_service] = override_service
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    settings.DEMO_ACCESS_TOKEN = original_token
    rate_limiter.clear()


VALID_TOKEN_HEADERS = {"Authorization": "Bearer test-demo-token-12345"}
WRONG_TOKEN_HEADERS = {"Authorization": "Bearer wrong-token"}
NO_TOKEN_HEADERS = {}


class TestDemoAuth:
    """演示访问令牌鉴权。"""

    def test_health_exempt_from_auth(self, client_with_auth):
        """健康检查豁免鉴权。"""
        resp = client_with_auth.get("/health")
        assert resp.status_code == 200

    def test_root_exempt_from_auth(self, client_with_auth):
        """根路径豁免鉴权。"""
        resp = client_with_auth.get("/")
        assert resp.status_code == 200

    def test_api_without_token_returns_401(self, client_with_auth):
        """无令牌访问 /api 返回 401。"""
        resp = client_with_auth.get("/api/inventory/products")
        assert resp.status_code == 401
        body = resp.json()
        assert body["error"]["code"] == "UNAUTHORIZED"

    def test_api_with_wrong_token_returns_401(self, client_with_auth):
        """错误令牌返回 401。"""
        resp = client_with_auth.get(
            "/api/inventory/products",
            headers=WRONG_TOKEN_HEADERS,
        )
        assert resp.status_code == 401

    def test_api_with_valid_token_returns_200(self, client_with_auth):
        """有效令牌正常访问。"""
        resp = client_with_auth.get(
            "/api/inventory/products",
            headers=VALID_TOKEN_HEADERS,
        )
        assert resp.status_code == 200

    def test_no_auth_when_token_empty(self, client_no_auth):
        """令牌为空时不启用鉴权。"""
        resp = client_no_auth.get("/api/inventory/products")
        assert resp.status_code == 200


class TestRecognitionRateLimit:
    """识别接口限流测试。"""

    @pytest.fixture
    def client_with_mock_ai(self, service):
        from app.config import settings
        original_token = settings.DEMO_ACCESS_TOKEN
        settings.DEMO_ACCESS_TOKEN = ""
        original_limit = settings.RECOGNITION_RATE_LIMIT_PER_MINUTE
        settings.RECOGNITION_RATE_LIMIT_PER_MINUTE = 3

        def override_service():
            return service

        def override_ai():
            return MockAI()

        app.dependency_overrides[get_inventory_service] = override_service
        app.dependency_overrides[get_ai_provider] = override_ai
        with TestClient(app) as c:
            yield c
        app.dependency_overrides.clear()
        settings.DEMO_ACCESS_TOKEN = original_token
        settings.RECOGNITION_RATE_LIMIT_PER_MINUTE = original_limit
        rate_limiter.clear()

    def _make_recognize_request(self, client):
        """发送识别请求。"""
        import io
        resp = client.post(
            "/api/inventory/recognition/recognize",
            files={"image": ("test.jpg", io.BytesIO(b"fake-jpeg-data"), "image/jpeg")},
        )
        return resp

    def test_under_limit_succeeds(self, client_with_mock_ai):
        """限流内请求成功。"""
        resp = self._make_recognize_request(client_with_mock_ai)
        # MockAI 可能返回 200 或其他状态，但不应该是 429
        assert resp.status_code != 429

    def test_over_limit_returns_429(self, client_with_mock_ai):
        """超限返回 429。"""
        # 发送 3 次（限制为 3）
        for i in range(3):
            self._make_recognize_request(client_with_mock_ai)
        # 第 4 次应该被限流
        resp = self._make_recognize_request(client_with_mock_ai)
        assert resp.status_code == 429
        body = resp.json()
        assert body["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in resp.headers
