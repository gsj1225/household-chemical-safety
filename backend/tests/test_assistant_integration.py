"""Assistant 六状态真实接口联调 — Agent C 可复现证据

本文件直接走真实 ASGI HTTP（FastAPI TestClient 经路由/鉴权/Form 解析/中间件），
内联种子数据，不依赖运行中的服务器或任何未跟踪文件。
从干净检出环境执行：

    cd backend
    python -m pytest tests/test_assistant_integration.py -q -p no:cacheprovider

任一状态断言失败都会使 pytest 退出码非零，满足"六状态可复现 + 断言 + 非零退出"。

覆盖六个生产状态：
1. 库存产品推荐（inventoryAdvice 非空 + productName 由库回填）
2. 通用建议（generalAdvice 非空）
3. 信息不足追问（needsClarification + clarificationQuestions）
4. 禁止混用（critical 警告 + 混用/连用步骤被剥离）
5. 超范围拒答（outOfScope=true，且清空一切产品/通用建议）
6. contextProductId 参与（结合当前产品核验进入答案与证据）
"""

import tempfile
import os

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_assistant_service
from app.config import settings
from app.core.compatibility_engine import CompatibilityEngine
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

TOKEN = "assistant-integration-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _seed(repo: InventoryRepository) -> None:
    repo.create(ProductCreate(
        productId="p-84", operationId="it-1", name="84消毒液",
        category=ProductCategory.disinfectant,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="次氯酸钠")],
    ))
    repo.create(ProductCreate(
        productId="p-jc", operationId="it-2", name="威猛先生洁厕灵",
        category=ProductCategory.toilet_cleaner,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="盐酸")],
    ))
    repo.create(ProductCreate(
        productId="p-xy", operationId="it-3", name="蓝月亮洗衣液",
        category=ProductCategory.laundry,
        information_status=InformationStatus.complete,
        ingredients=[ConfirmedFact(display_value="表面活性剂")],
    ))


def _make_client():
    tmp = tempfile.mkdtemp(prefix="it_")
    db = os.path.join(tmp, "it.db")
    repo = InventoryRepository(db)
    engine = CompatibilityEngine()
    service = AssistantService(repo, engine)
    _seed(repo)
    settings.DEBUG = False
    settings.DEMO_ACCESS_TOKEN = TOKEN
    app.dependency_overrides[get_assistant_service] = lambda: service
    app.dependency_overrides[get_ai_provider] = lambda: MockAI()
    return TestClient(app)


def _ask(client, question, **extra):
    data = {"question": question}
    data.update(extra)
    return client.post("/api/assistant/ask", data=data, headers=AUTH)


@pytest.fixture(autouse=True)
def _restore_global_state():
    """恢复全局 settings 并清理 override/限流，避免污染其他测试模块。"""
    orig_debug = settings.DEBUG
    orig_token = settings.DEMO_ACCESS_TOKEN
    yield
    settings.DEBUG = orig_debug
    settings.DEMO_ACCESS_TOKEN = orig_token
    app.dependency_overrides.clear()
    rate_limiter.clear()


class TestAssistantSixStateIntegration:
    def test_state1_inventory_recommendation(self):
        c = _make_client()
        r = _ask(c, "怎么清理马桶")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["inventoryAdvice"], "应返回库存推荐"
        assert body["inventoryAdvice"][0]["productName"], "productName 必须非空"
        assert body["inventoryAdvice"][0]["productName"] == "蓝月亮洗衣液"

    def test_state2_general_advice(self):
        c = _make_client()
        r = _ask(c, "怎么清理马桶")
        assert r.status_code == 200
        body = r.json()
        assert body["generalAdvice"], "应返回通用建议"

    def test_state3_clarification(self):
        c = _make_client()
        r = _ask(c, "不确定该用哪个产品")
        assert r.status_code == 200
        body = r.json()
        assert body["needsClarification"] is True
        assert body["clarificationQuestions"], "应返回追问问题"
        assert body["inventoryAdvice"] == [], "追问时不应给产品建议"

    def test_state4_forbidden_mixing(self):
        c = _make_client()
        r = _ask(c, "洁厕灵能和84一起用吗")
        assert r.status_code == 200
        body = r.json()
        critical = [w for w in body["safetyWarnings"] if w["severity"] == "critical"]
        assert critical, "应产生 critical 警告"
        # 混用/连用步骤必须被剥离
        mix_words = ("混合", "一起用", "同时用", "连用")
        for advice in body["inventoryAdvice"]:
            for step in advice.get("steps", []):
                assert not any(w in step for w in mix_words), f"存在未剥离的混用步骤: {step}"

    def test_state5_out_of_scope_cleared(self):
        c = _make_client()
        r = _ask(c, "误食了84消毒液怎么办")
        assert r.status_code == 200
        body = r.json()
        assert body["outOfScope"] is True
        assert body["inventoryAdvice"] == [], "超范围时不得返回产品建议"
        assert body["generalAdvice"] == [], "超范围时不得返回通用建议"
        assert body["safetyWarnings"] == [], "超范围时不得返回安全操作"

    def test_state6_context_product_id(self):
        c = _make_client()
        r = _ask(c, "我能用84消毒液清洁厨房吗", contextProductId="p-84")
        assert r.status_code == 200
        body = r.json()
        assert "已结合当前产品「84消毒液」" in body["answer"], "应结合当前产品作答"
        assert body["evidence"], "应产生与当前产品相关的依据"
        # p-84(次氯酸钠) vs p-jc(盐酸) 的 critical 关系应进入证据
        assert any("混" in e or "氯" in e for e in body["evidence"])

