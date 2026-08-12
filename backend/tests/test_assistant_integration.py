"""Assistant 六状态真实接口联调 — Stage 3（知识库优先，可复现）

通过真实 ASGI HTTP（TestClient 经路由/鉴权/Form 解析/中间件）+ 受控知识库 +
固定意图 AI，确定性覆盖六个 knowledgeStatus：
1. local_hit           2. local_hit_no_inventory   3. insufficient
4. no_match            5. external_hit              6. external_fail

内联种子，不依赖运行服务器或未跟踪文件。任一断言失败 → pytest 非零退出。
"""

import json
import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_ai_provider, get_assistant_service
from app.config import settings
from app.core.compatibility_engine import CompatibilityEngine
from app.core.knowledge_provider import (
    ExternalKnowledgeProvider,
    ExternalSearchResult,
    LocalKnowledgeProvider,
)
from app.core.mock_ai import MockAI
from app.core.rate_limit import rate_limiter
from app.data.inventory_repository import InventoryRepository
from app.data.knowledge_repository import KnowledgeRepository
from app.main import app
from app.models.inventory import (
    ConfirmedFact,
    InformationStatus,
    ProductCategory,
    ProductCreate,
)
from app.models.knowledge import (
    AssistantNarrativeDraft,
    KnowledgeIntent,
    KnowledgeIntentDraft,
    SourceRef,
)
from app.services.assistant_service import AssistantService

TOKEN = "assistant-integration-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def _entry(eid, topic="主题", aliases=None, steps=None, cats=None,
           confidence="reviewed", warnings=None, surfaces=None, excluded=None):
    return {
        "id": eid, "topic": topic, "aliases": aliases or [topic],
        "surfaces": surfaces or [], "excluded_surfaces": excluded or [], "scene": [],
        "steps": [{"order": i + 1, "text": s} for i, s in enumerate(steps or [])],
        "allowed_product_categories": cats or [],
        "warnings": warnings or [], "prohibited_actions": [], "stop_conditions": [],
        "tag_condition": "", "forbidden_terms": [],
        "sources": [{"type": "local_kb", "title": "家庭安全知识库", "url": ""}],
        "reviewed_at": "2026-08-12", "version": "1.0", "confidence": confidence,
    }


def _write_kb(entries) -> Path:
    d = Path(tempfile.mkdtemp(prefix="itkb_"))
    for e in entries:
        (d / f"{e['id']}.json").write_text(json.dumps(e, ensure_ascii=False), encoding="utf-8")
    return d


def _prod(pid, name, category, status=InformationStatus.complete, ingredients=()):
    return ProductCreate(
        productId=pid, operationId="op-" + pid, name=name, category=category,
        information_status=status,
        ingredients=[ConfirmedFact(display_value=i) for i in ingredients],
    )


class FixedIntentAI(MockAI):
    def __init__(self, aliases=None, narrative="已按知识库给出建议。", surface=None):
        self._aliases = aliases or []
        self._narrative = narrative
        self._surface = surface

    async def extract_knowledge_intent(self, *a, **k):
        if not self._aliases and self._surface is None:
            return KnowledgeIntentDraft()
        return KnowledgeIntentDraft(knowledge_intent=KnowledgeIntent(
            aliases=self._aliases, surface=self._surface))

    async def generate_narrative(self, *a, **k):
        return AssistantNarrativeDraft(answer=self._narrative)


def _make_client(entries, products, external_provider=None, ai=None):
    db = os.path.join(tempfile.mkdtemp(), "it.db")
    repo = InventoryRepository(db)
    for p in products:
        repo.create(p)
    engine = CompatibilityEngine()
    local = LocalKnowledgeProvider(KnowledgeRepository(_write_kb(entries)))
    ext = external_provider or ExternalKnowledgeProvider()
    service = AssistantService(repo, engine, local_provider=local, external_provider=ext)
    settings.DEBUG = False
    settings.DEMO_ACCESS_TOKEN = TOKEN
    app.dependency_overrides[get_assistant_service] = lambda: service
    app.dependency_overrides[get_ai_provider] = lambda: (ai or FixedIntentAI())
    return TestClient(app)


@pytest.fixture(autouse=True)
def _restore():
    orig_enabled = settings.EXTERNAL_KNOWLEDGE_ENABLED
    orig_debug = settings.DEBUG
    orig_token = settings.DEMO_ACCESS_TOKEN
    yield
    settings.EXTERNAL_KNOWLEDGE_ENABLED = orig_enabled
    settings.DEBUG = orig_debug
    settings.DEMO_ACCESS_TOKEN = orig_token
    app.dependency_overrides.clear()
    rate_limiter.clear()


class TestSixStateIntegration:
    def test_state1_local_hit(self):
        c = _make_client(
            [_entry("lime", "水垢", aliases=["马桶"], surfaces=["马桶"], cats=["toilet_cleaner"], steps=["保持通风"])],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner, ingredients=["盐酸"])],
            ai=FixedIntentAI(aliases=["马桶"], surface="马桶"),
        )
        r = c.post("/api/assistant/ask", data={"question": "马桶怎么清洁"}, headers=AUTH)
        assert r.status_code == 200
        b = r.json()
        assert b["knowledgeStatus"] == "local_hit"
        assert b["knowledge"]
        assert b["inventoryAdvice"][0]["productName"] == "威猛先生洁厕灵"
        assert b["sources"][0]["type"] == "local_kb"

    def test_state2_local_hit_no_inventory(self):
        c = _make_client(
            [_entry("ink", "墨水", aliases=["墨水"], surfaces=["硬质桌面"], cats=["stain_remover"], steps=["测试"])],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner)],
            ai=FixedIntentAI(aliases=["墨水"], surface="硬质桌面"),
        )
        r = c.post("/api/assistant/ask", data={"question": "怎么除墨水"}, headers=AUTH)
        b = r.json()
        assert b["knowledgeStatus"] == "local_hit_no_inventory"
        assert b["inventoryAdvice"] == []

    def test_state3_insufficient_provisional(self):
        c = _make_client(
            [_entry("p1", "待审", aliases=["x"], steps=[], confidence="provisional")],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner)],
            ai=FixedIntentAI(aliases=["x"]),
        )
        r = c.post("/api/assistant/ask", data={"question": "x"}, headers=AUTH)
        b = r.json()
        assert b["knowledgeStatus"] == "insufficient"
        assert b["knowledge"] == []
        assert b["pendingKnowledgeNotice"] == "存在待审核资料，尚未通过审核，暂不提供操作建议。"

    def test_state4_no_match(self):
        c = _make_client(
            [_entry("lime", "水垢", aliases=["马桶"], steps=["s"])],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner)],
            ai=FixedIntentAI(aliases=["无匹配"]),
        )
        r = c.post("/api/assistant/ask", data={"question": "随便问问"}, headers=AUTH)
        b = r.json()
        assert b["knowledgeStatus"] == "no_match"
        assert b["knowledge"] == []
        assert b["inventoryAdvice"] == []

    def test_state5_external_hit(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        ext = ExternalKnowledgeProvider(
            allowlist=["example.com"],
            fake_search=lambda q: ExternalSearchResult(sources=[
                SourceRef(type="external", title="CDC", domain="example.com",
                          url="https://example.com/bleach", retrieved_at="2026-08-12")
            ]),
        )
        c = _make_client(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=ext, ai=FixedIntentAI(aliases=["无匹配"]),
        )
        r = c.post("/api/assistant/ask",
                   data={"question": "q", "allowExternalSearch": "true"}, headers=AUTH)
        b = r.json()
        assert b["knowledgeStatus"] == "external_hit"
        assert b["externalSources"][0]["domain"] == "example.com"

    def test_state6_external_fail(self):
        settings.EXTERNAL_KNOWLEDGE_ENABLED = True
        ext = ExternalKnowledgeProvider(
            allowlist=["example.com"],
            fake_search=lambda q: ExternalSearchResult(failed=True),
        )
        c = _make_client(
            [_entry("lime", "水垢", aliases=["x"], steps=["s"])],
            [_prod("p-jc", "威猛先生洁厕灵", ProductCategory.toilet_cleaner)],
            external_provider=ext, ai=FixedIntentAI(aliases=["无匹配"]),
        )
        r = c.post("/api/assistant/ask",
                   data={"question": "q", "allowExternalSearch": "true"}, headers=AUTH)
        b = r.json()
        assert b["knowledgeStatus"] == "external_fail"
        assert b["externalSources"] == []
