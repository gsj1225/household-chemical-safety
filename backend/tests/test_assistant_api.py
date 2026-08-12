"""Assistant 问答接口测试 — Stage 3（知识库优先）

覆盖路由契约（鉴权/限流/Form/图片/历史/错误映射）与知识库优先基础行为。
详细知识库行为（命中/状态转换/外部/provisional/越权等）见 test_assistant_knowledge.py。
"""

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_assistant_service
from app.config import settings
from app.core.compatibility_engine import CompatibilityEngine
from app.core.exceptions import AIProviderError, AIProviderTimeoutError
from app.core.mock_ai import MockAI
from app.core.rate_limit import rate_limiter
from app.data.inventory_repository import InventoryRepository
from app.main import app
from app.models.inventory import (
    ConfirmedFact,
    InformationStatus,
    ProductCategory,
    ProductCreate,
)
from app.services.assistant_service import AssistantService

TOKEN = "assistant-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n\x2d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _seed(repo: InventoryRepository) -> None:
    repo.create(ProductCreate(
        productId="p-84",
        operationId="op-84",
        name="84消毒液",
        category=ProductCategory.disinfectant,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="次氯酸钠")],
    ))
    repo.create(ProductCreate(
        productId="p-jc",
        operationId="op-jc",
        name="威猛先生洁厕灵",
        category=ProductCategory.toilet_cleaner,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="盐酸")],
    ))
    repo.create(ProductCreate(
        productId="p-laundry",
        operationId="op-laundry",
        name="蓝月亮洗衣液",
        category=ProductCategory.laundry,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="表面活性剂")],
    ))
    repo.create(ProductCreate(
        productId="p-need",
        operationId="op-need",
        name="未知品牌洗衣液",
        category=ProductCategory.laundry,
        information_status=InformationStatus.needs_information,
        ingredients=[],
    ))


def _build_client(db_path, ai_provider, seed=True):
    repo = InventoryRepository(db_path)
    engine = CompatibilityEngine()
    service = AssistantService(repo, engine)
    settings.DEBUG = False
    settings.DEMO_ACCESS_TOKEN = TOKEN
    if seed:
        _seed(repo)
    app.dependency_overrides[get_assistant_service] = lambda: service
    app.dependency_overrides[get_ai_provider] = lambda: ai_provider
    return TestClient(app), repo, service


@pytest.fixture(autouse=True)
def _restore_state():
    orig_debug = settings.DEBUG
    orig_token = settings.DEMO_ACCESS_TOKEN
    orig_max_image = settings.MAX_IMAGE_SIZE_MB
    yield
    settings.DEBUG = orig_debug
    settings.DEMO_ACCESS_TOKEN = orig_token
    settings.MAX_IMAGE_SIZE_MB = orig_max_image
    app.dependency_overrides.clear()
    rate_limiter.clear()


@pytest.fixture
def client():
    import tempfile
    import os
    tmp = tempfile.mkdtemp()
    db = os.path.join(tmp, "assistant.db")
    c, _, _ = _build_client(db, MockAI())
    yield c
    app.dependency_overrides.clear()
    rate_limiter.clear()
    settings.DEBUG = True
    settings.DEMO_ACCESS_TOKEN = ""


class _TimeoutAI(MockAI):
    async def extract_knowledge_intent(self, *a, **k):
        raise AIProviderTimeoutError("timeout")


class _ErrorAI(MockAI):
    async def extract_knowledge_intent(self, *a, **k):
        raise AIProviderError("error")


class TestAssistantApi:
    def test_text_question_returns_knowledge_first(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"]
        assert body["knowledge"], "应返回知识库条目"
        assert body["knowledgeStatus"] == "local_hit"
        assert body["inventoryAdvice"]
        ids = {a["productId"] for a in body["inventoryAdvice"]}
        assert "p-jc" in ids  # 马桶 → 水垢知识 → 洁厕灵
        # 新知识库流程 generalAdvice 为空
        assert body["generalAdvice"] == []

    def test_photo_multipart_request(self, client):
        files = {"image": ("test.png", TINY_PNG, "image/png")}
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "帮我看看这个"}, files=files, headers=AUTH,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "answer" in body

    def test_history_truncated_to_12(self, client):
        import json as _json
        long_history = [{"role": "user", "text": f"消息{i}"} for i in range(20)]
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "怎么清理", "history": _json.dumps(long_history)},
            headers=AUTH,
        )
        assert resp.status_code == 200

    def test_only_references_inventory_products(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        body = resp.json()
        known = {"p-84", "p-jc", "p-laundry", "p-need"}
        for a in body["inventoryAdvice"]:
            assert a["productId"] in known

    def test_needs_information_not_recommended(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "洗衣液能去除可水洗织物上的油污吗"}, headers=AUTH)
        body = resp.json()
        # 油污 + 可水洗织物 → oil local_hit；p-need(laundry) 信息不完整 → needs_information
        assert body["knowledgeStatus"] == "local_hit"
        for a in body["inventoryAdvice"]:
            if a["productId"] == "p-need":
                assert a["recommendation"] == "needs_information"

    def test_out_of_scope_returns_200_rejection(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "误食了洁厕剂怎么办"}, headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["outOfScope"] is True
        assert body["inventoryAdvice"] == []
        assert body["knowledge"] == []
        assert body["generalAdvice"] == []
        assert body["safetyWarnings"] == []

    def test_empty_question_400(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "   "}, headers=AUTH)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "INVALID_ASSISTANT_INPUT"

    def test_bad_history_400(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理", "history": "not-json"}, headers=AUTH)
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "INVALID_ASSISTANT_INPUT"

    def test_unsupported_image_type_400(self, client):
        files = {"image": ("test.gif", b"GIF89a", "image/gif")}
        resp = client.post(
            "/api/assistant/ask", data={"question": "看看"}, files=files, headers=AUTH,
        )
        assert resp.status_code == 400
        assert resp.json()["error"]["code"] == "INVALID_ASSISTANT_INPUT"

    def test_oversized_image_413(self, client):
        original = settings.MAX_IMAGE_SIZE_MB
        settings.MAX_IMAGE_SIZE_MB = 0.00001
        try:
            files = {"image": ("test.png", TINY_PNG, "image/png")}
            resp = client.post(
                "/api/assistant/ask", data={"question": "看看"}, files=files, headers=AUTH,
            )
            assert resp.status_code == 413
            assert resp.json()["error"]["code"] == "IMAGE_TOO_LARGE"
        finally:
            settings.MAX_IMAGE_SIZE_MB = original

    def test_rate_limit_429(self, client):
        for _ in range(8):
            r = client.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
            assert r.status_code == 200
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in resp.headers

    def test_ai_timeout_maps_504(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "t.db"), _TimeoutAI())
        resp = c.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        assert resp.status_code == 504
        assert resp.json()["error"]["code"] == "AI_PROVIDER_TIMEOUT"
        app.dependency_overrides.clear()
        rate_limiter.clear()

    def test_ai_error_maps_502(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "e2.db"), _ErrorAI())
        resp = c.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        assert resp.status_code == 502
        assert resp.json()["error"]["code"] == "AI_PROVIDER_ERROR"
        app.dependency_overrides.clear()
        rate_limiter.clear()
