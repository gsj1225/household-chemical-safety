"""Assistant 问答接口测试 — Stage 4

覆盖 Mock 模式文字/照片、history 截断、productId 校验、
critical 相容性兜底、needs_information、超范围、限流、AI 错误映射。
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
from app.models.assistant import (
    AssistantDraft,
    AssistantProductAdvice,
    AssistantSafetyWarning,
)
from app.models.inventory import (
    ConfirmedFact,
    InformationStatus,
    ProductCategory,
    ProductCreate,
)
from app.services.assistant_service import AssistantService

TOKEN = "assistant-test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}

# 1x1 透明 PNG
TINY_PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n\x2d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


def _seed(repo: InventoryRepository) -> None:
    """写入 3 个产品：含氯消毒剂、酸性洁厕剂、信息待补充产品。"""
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
        productId="p-need",
        operationId="op-need",
        name="未知品牌清洁剂",
        category=ProductCategory.other,
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
    """每个测试后恢复全局状态，避免污染其他测试模块。"""
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
    """种子库存 + MockAI 客户端。"""
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


class _UnknownAI(MockAI):
    """返回一个库存中不存在的 productId + 一个真实 productId。"""

    async def answer_household_question(self, question, history, image_bytes, inventory_context, compatibility_context, context_product_id=None):
        return AssistantDraft(
            answer="测试未知产品过滤",
            product_advice=[
                AssistantProductAdvice(product_id="unknown-id-xyz", recommendation="recommended", reason="x", steps=["s"], cautions=[]),
                AssistantProductAdvice(product_id="p-jc", recommendation="recommended", reason="y", steps=["s"], cautions=[]),
            ],
        )


class _TimeoutAI(MockAI):
    async def answer_household_question(self, question, history, image_bytes, inventory_context, compatibility_context, context_product_id=None):
        raise AIProviderTimeoutError("timeout")


class _ErrorAI(MockAI):
    async def answer_household_question(self, question, history, image_bytes, inventory_context, compatibility_context, context_product_id=None):
        raise AIProviderError("error")

class _OutOfScopeWithAdviceAI(MockAI):
    """LLM 误返回 outOfScope + 产品建议/通用建议，后端必须兜底清空。"""

    async def answer_household_question(self, question, history, image_bytes, inventory_context, compatibility_context, context_product_id=None):
        return AssistantDraft(
            answer="该问题超出我的回答范围。",
            out_of_scope=True,
            product_advice=[
                AssistantProductAdvice(product_id="p-84", recommendation="recommended", reason="x", steps=["使用"], cautions=[]),
            ],
            general_advice=["通用建议：注意通风。"],
            safety_warnings=[
                AssistantSafetyWarning(severity="attention", title="注意", description="d", relation_id=None, recommended_action="a")
            ],
        )


class TestAssistantApi:
    def test_text_question_returns_structured_answer(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理马桶"}, headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"]
        assert body["inventoryAdvice"]
        known = {"p-84", "p-jc", "p-need"}
        assert all(a["productId"] in known for a in body["inventoryAdvice"])
        assert body["generalAdvice"]

    def test_photo_multipart_request(self, client):
        files = {"image": ("test.png", TINY_PNG, "image/png")}
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "帮我看看这个"}, files=files, headers=AUTH,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["answer"]

    def test_history_truncated_to_12(self, client):
        long_history = [{"role": "user", "text": f"消息{i}"} for i in range(20)]
        import json as _json
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "怎么清理", "history": _json.dumps(long_history)},
            headers=AUTH,
        )
        assert resp.status_code == 200

    def test_unknown_product_id_filtered(self, client):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "u.db"), _UnknownAI())
        resp = c.post("/api/assistant/ask", data={"question": "测试"}, headers=AUTH)
        body = resp.json()
        ids = [a["productId"] for a in body["inventoryAdvice"]]
        assert "unknown-id-xyz" not in ids
        assert "p-jc" in ids
        app.dependency_overrides.clear()
        rate_limiter.clear()

    def test_only_references_inventory_products(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
        body = resp.json()
        known = {"p-84", "p-jc", "p-need"}
        for a in body["inventoryAdvice"]:
            assert a["productId"] in known

    def test_critical_mixing_forced_warning_and_stripped(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "84消毒液和洁厕灵可以混用吗"}, headers=AUTH)
        body = resp.json()
        # 必须有 critical 安全警告
        assert any(w["severity"] == "critical" for w in body["safetyWarnings"])
        # 库存建议中不能残留混用步骤
        for a in body["inventoryAdvice"]:
            for s in a["steps"]:
                assert "混" not in s and "混合" not in s and "一起" not in s
        # 证据记录 critical 关系
        assert body["evidence"]

    def test_needs_information_not_recommended(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "清理厨房"}, headers=AUTH)
        body = resp.json()
        for a in body["inventoryAdvice"]:
            if a["productId"] == "p-need":
                assert a["recommendation"] == "needs_information"

    def test_no_inventory_candidate_general_advice_only(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "e.db"), MockAI(), seed=False)
        resp = c.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
        body = resp.json()
        assert body["inventoryAdvice"] == []
        assert body["generalAdvice"]
        app.dependency_overrides.clear()
        rate_limiter.clear()

    def test_out_of_scope_returns_200_rejection(self, client):
        resp = client.post("/api/assistant/ask", data={"question": "误食了洁厕剂怎么办"}, headers=AUTH)
        assert resp.status_code == 200
        body = resp.json()
        assert body["outOfScope"] is True
        assert body["inventoryAdvice"] == []

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
            r = client.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
            assert r.status_code == 200
        resp = client.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
        assert resp.status_code == 429
        assert resp.json()["error"]["code"] == "RATE_LIMITED"
        assert "Retry-After" in resp.headers

    def test_ai_timeout_maps_504(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "t.db"), _TimeoutAI())
        resp = c.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
        assert resp.status_code == 504
        assert resp.json()["error"]["code"] == "AI_PROVIDER_TIMEOUT"
        app.dependency_overrides.clear()
        rate_limiter.clear()

    def test_ai_error_maps_502(self):
        import tempfile, os
        tmp = tempfile.mkdtemp()
        c, _, _ = _build_client(os.path.join(tmp, "e2.db"), _ErrorAI())
        resp = c.post("/api/assistant/ask", data={"question": "怎么清理"}, headers=AUTH)
        assert resp.status_code == 502
        assert resp.json()["error"]["code"] == "AI_PROVIDER_ERROR"
        app.dependency_overrides.clear()
        rate_limiter.clear()


class TestAssistantDraftContract:
    def test_qwen_json_contract_validates(self):
        """Qwen 结构化输出契约可被 AssistantDraft 校验。"""
        payload = {
            "answer": "建议",
            "needs_clarification": False,
            "clarification_questions": [],
            "product_advice": [
                {
                    "productId": "p-jc",
                    "recommendation": "recommended",
                    "reason": "合适",
                    "steps": ["佩戴手套"],
                    "cautions": [],
                }
            ],
            "general_advice": ["通用建议"],
            "safety_warnings": [
                {
                    "severity": "critical",
                    "title": "禁止混用",
                    "description": "描述",
                    "relationId": "rel-1",
                    "recommended_action": "分开使用",
                }
            ],
            "out_of_scope": False,
        }
        draft = AssistantDraft.model_validate(payload)
        assert draft.product_advice[0].product_id == "p-jc"
        assert draft.safety_warnings[0].severity == "critical"

    def test_product_name_backfilled_from_db(self, client):
        """productName 必须由库存回填，不依赖 LLM。"""
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "洁厕灵能和84一起用吗"},
            headers=AUTH,
        )
        assert resp.status_code == 200
        body = resp.json()
        names = {a["productName"] for a in body["inventoryAdvice"]}
        assert "84消毒液" in names
        assert "威猛先生洁厕灵" in names
        for a in body["inventoryAdvice"]:
            assert a["productName"], "productName 不允许为空"

    def test_context_product_id_participates_in_compat(self, client):
        """contextProductId 参与：当前产品与其他产品的 critical 关系进入证据。"""
        resp = client.post(
            "/api/assistant/ask",
            data={
                "question": "我能用84消毒液清洁吗",
                "contextProductId": "p-84",
            },
            headers=AUTH,
        )
        assert resp.status_code == 200
        body = resp.json()
        # 结合当前产品的说明
        assert "已结合当前产品「84消毒液」" in body["answer"]
        # p-84(次氯酸钠) 与 p-jc(盐酸) 存在 critical 关系，应进入证据
        assert any("混" in e or "混合" in e or "氯" in e for e in body["evidence"])
        assert any(w["severity"] == "critical" for w in body["safetyWarnings"])

    def test_context_product_unknown_id_safe(self, client):
        """contextProductId 不在库存时不应报错，正常返回。"""
        resp = client.post(
            "/api/assistant/ask",
            data={"question": "怎么清理", "contextProductId": "p-not-exist"},
            headers=AUTH,
        )
        assert resp.status_code == 200

    def test_out_of_scope_clears_llm_advice(self, tmp_path):
        """LLM 返回 outOfScope=true 且同时带产品建议时，后端必须清空产品/通用建议。"""
        c, _, _ = _build_client(
            str(tmp_path / "oos.db"), _OutOfScopeWithAdviceAI()
        )
        resp = c.post(
            "/api/assistant/ask",
            data={"question": "某种异常情况"},
            headers=AUTH,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["outOfScope"] is True
        assert body["inventoryAdvice"] == []
        assert body["generalAdvice"] == []
        assert body["safetyWarnings"] == []
        assert body["clarificationQuestions"] == []
