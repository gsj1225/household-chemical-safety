"""KnowledgeProvider — 知识检索接口（Stage 3）。

- LocalKnowledgeProvider：检索本地 JSON 知识库（首期唯一生效）。
- ExternalKnowledgeProvider：受控外部检索，首期仅接口 + Mock，不连接真实网络。
  外部结果必须含 title/domain/url(retrievedAt)，且仅 https、通过白名单。

隐私/安全边界：
- 不发送完整库存与完整成分；
- 外部内容不写入本地知识库；
- 失败/无来源/不可靠时不自行补全。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from inspect import isawaitable
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.config import settings
from app.data.knowledge_repository import KnowledgeRepository
from app.models.knowledge import KnowledgeQuery, KnowledgeResult, SourceRef


class KnowledgeProvider(ABC):
    """知识检索抽象基类。"""

    @abstractmethod
    async def search(self, query: KnowledgeQuery) -> KnowledgeResult:
        """按检索条件返回本地知识结果。"""
        pass


class LocalKnowledgeProvider(KnowledgeProvider):
    """本地知识库检索。"""

    def __init__(self, repository: KnowledgeRepository | None = None):
        self._repo = repository or KnowledgeRepository()

    @property
    def repository(self) -> KnowledgeRepository:
        return self._repo

    async def search(self, query: KnowledgeQuery) -> KnowledgeResult:
        return self._repo.search(query)


class ExternalSearchResult(BaseModel):
    """外部检索结果（仅外部来源引用 + 是否失败）。"""

    model_config = ConfigDict(populate_by_name=True)

    sources: list[SourceRef] = Field(default_factory=list)
    failed: bool = False


class ExternalKnowledgeProvider:
    """外部知识检索（Mock 实现，首期不连接真实网络）。

    构造时可注入 fake_search 用于测试命中/失败。
    默认不可用（failed=True），EXTERNAL_KNOWLEDGE_ENABLED 关闭时不发起任何请求。
    """

    def __init__(
        self,
        allowlist: list[str] | None = None,
        fake_search: Any | None = None,
    ):
        self._allowlist = set(
            allowlist if allowlist is not None else settings.EXTERNAL_KNOWLEDGE_ALLOWLIST
        )
        self._fake_search = fake_search

    async def search(self, query: KnowledgeQuery) -> ExternalSearchResult:
        if self._fake_search is not None:
            result = self._fake_search(query)
            if isawaitable(result):
                result = await result
            return result
        # 受控 Mock：仅当显式开启外部检索（EXTERNAL_KNOWLEDGE_ENABLED）且配置了
        # 白名单时，返回一个固定模拟外部来源（不连真实网络），用于 Stage 5 QA 验证
        # external_hit 的 UI 渲染。默认关闭时完全不影响生产（仍视为失败）。
        if settings.EXTERNAL_KNOWLEDGE_ENABLED and self._allowlist:
            domain = next(iter(self._allowlist))
            topic = (query.topic or "general").strip() or "general"
            return ExternalSearchResult(
                sources=[SourceRef(
                    type="external",
                    title="受控外部资料（Mock）",
                    domain=domain,
                    url=f"https://{domain}/knowledge/{topic}",
                    ref=f"ext-{topic}",
                    version="1.0",
                    retrieved_at="2026-08-12",
                )],
                failed=False,
            )
        # 默认：外部未实现/不可用 → 视为失败
        return ExternalSearchResult(sources=[], failed=True)

    def filter_allowed(self, sources: list[SourceRef]) -> list[SourceRef]:
        """只保留 https 且域名在白名单的外部来源。"""
        return [s for s in sources if self.source_allowed(s)]

    def source_allowed(self, source: SourceRef) -> bool:
        if not source.url.startswith("https://"):
            return False
        return source.domain in self._allowlist
