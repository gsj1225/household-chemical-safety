"""知识库优先助手 — 领域模型（Stage 3）

依据 docs/implementation/知识库优先助手Stage2设计.md（v1.4.1）。

契约要点：
- 所有 camelCase 字段使用 Field(alias=...)，populate_by_name=True
- confidence 仅 reviewed/provisional；reviewed 条目 steps 非空
- id 小写连字符；version 语义化版本；reviewed_at YYYY-MM-DD
- SourceRef.type 仅 local_kb/warehouse/rule/external；external URL 仅 https
- 非法 JSON 在加载时即校验失败
"""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

_ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_SEMVER_RE = re.compile(r"^\d+\.\d+(\.\d+)?$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
# 白名单域名格式：至少一个点分部分（如 example.com / gov.example）
_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$"
)

SourceType = Literal["local_kb", "warehouse", "rule", "external"]


class SourceRef(BaseModel):
    """统一来源引用（四类）。"""

    model_config = ConfigDict(populate_by_name=True)

    type: SourceType
    title: str
    domain: str = ""
    url: str = ""
    retrieved_at: str | None = Field(None, alias="retrievedAt")
    ref: str = ""
    version: str = ""

    @field_validator("url")
    @classmethod
    def _https_only(cls, v: str) -> str:
        if v and not v.startswith("https://"):
            raise ValueError("external url 只允许 https")
        return v

    @model_validator(mode="after")
    def _external_required(self) -> "SourceRef":
        """type=external 时必须补齐 domain/https url/retrievedAt，且 domain 符合域名格式。"""
        if self.type == "external":
            if not self.domain:
                raise ValueError("external 来源必须提供 domain")
            if not self.url.startswith("https://"):
                raise ValueError("external 来源必须提供 https url")
            if not self.retrieved_at:
                raise ValueError("external 来源必须提供 retrievedAt")
            if not _DOMAIN_RE.match(self.domain):
                raise ValueError("external 来源 domain 不符合域名格式")
        return self


class KnowledgeStep(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    order: int
    text: str

    @field_validator("order")
    @classmethod
    def _order_positive(cls, v: int) -> int:
        if v < 1:
            raise ValueError("order 必须是正整数")
        return v


class KnowledgeEntry(BaseModel):
    """知识库条目（仓库内 JSON，一条一文件）。"""

    model_config = ConfigDict(populate_by_name=True)

    id: str
    topic: str
    aliases: list[str] = Field(default_factory=list)
    surfaces: list[str] = Field(default_factory=list)
    excluded_surfaces: list[str] = Field(default_factory=list, alias="excludedSurfaces")
    scene: list[str] = Field(default_factory=list)
    steps: list[KnowledgeStep] = Field(default_factory=list)
    allowed_product_categories: list[str] = Field(
        default_factory=list, alias="allowedProductCategories"
    )
    warnings: list[str] = Field(default_factory=list)
    prohibited_actions: list[str] = Field(
        default_factory=list, alias="prohibitedActions"
    )
    stop_conditions: list[str] = Field(default_factory=list, alias="stopConditions")
    tag_condition: str = Field(default="", alias="tagCondition")
    sources: list[SourceRef] = Field(default_factory=list)
    reviewed_at: str = Field(alias="reviewedAt")
    version: str
    confidence: Literal["reviewed", "provisional"]
    # 结构化禁用成分/危害关键词：产品成分/标签/危害命中即 not_recommended
    forbidden_terms: list[str] = Field(default_factory=list, alias="forbiddenTerms")

    @field_validator("id")
    @classmethod
    def _id_fmt(cls, v: str) -> str:
        if not _ID_RE.match(v):
            raise ValueError("id 必须是小写连字符格式")
        return v

    @field_validator("version")
    @classmethod
    def _ver_fmt(cls, v: str) -> str:
        if not _SEMVER_RE.match(v):
            raise ValueError("version 必须是合法语义化版本（如 1.0）")
        return v

    @field_validator("reviewed_at")
    @classmethod
    def _date_fmt(cls, v: str) -> str:
        if not _DATE_RE.match(v):
            raise ValueError("reviewed_at 必须是 YYYY-MM-DD")
        return v

    @model_validator(mode="after")
    def _reviewed_requires_steps(self) -> "KnowledgeEntry":
        if self.confidence == "reviewed" and not self.steps:
            raise ValueError("reviewed 条目必须包含可执行 steps")
        if self.confidence == "reviewed":
            orders = [s.order for s in self.steps]
            expected = set(range(1, len(orders) + 1))
            if len(orders) != len(set(orders)) or set(orders) != expected:
                raise ValueError("reviewed 条目 steps order 必须从 1 开始连续且不重复")
        return self

    def ordered_steps(self) -> list[str]:
        """按 order 升序返回步骤文本。"""
        return [s.text for s in sorted(self.steps, key=lambda s: s.order)]


class KnowledgeQuery(BaseModel):
    """后端标准化的检索条件。"""

    model_config = ConfigDict(populate_by_name=True)

    topic: str | None = None
    aliases: list[str] = Field(default_factory=list)
    surface: str | None = None
    scene: str | None = None
    already_used_product_ids: list[str] = Field(
        default_factory=list, alias="alreadyUsedProductIds"
    )


class KnowledgeIntent(BaseModel):
    """LLM 调用① 提取的意图（不决定 entry_id、不产出结论）。"""

    model_config = ConfigDict(populate_by_name=True)

    topic: str | None = None
    surface: str | None = None
    scene: str | None = None
    aliases: list[str] = Field(default_factory=list)


class KnowledgeIntentDraft(BaseModel):
    """调用① 唯一产物：意图。"""

    model_config = ConfigDict(populate_by_name=True)

    knowledge_intent: KnowledgeIntent | None = None


class AssistantNarrativeDraft(BaseModel):
    """调用② 唯一产物：组织后的 answer。"""

    model_config = ConfigDict(populate_by_name=True)

    answer: str = ""


class KnowledgeMatch(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    entry: KnowledgeEntry
    matched_fields: list[str] = Field(default_factory=list, alias="matchedFields")
    score: float


class KnowledgeResult(BaseModel):
    """本地检索结果。"""

    model_config = ConfigDict(populate_by_name=True)

    local_status: Literal["local_hit", "insufficient", "no_match"] = Field(
        alias="localStatus"
    )
    matches: list[KnowledgeMatch] = Field(default_factory=list)


class KnowledgeEvidence(BaseModel):
    """回答中的知识块（仅 reviewed 条目）。"""

    model_config = ConfigDict(populate_by_name=True)

    entry_id: str = Field(alias="entryId")
    topic: str
    surfaces: list[str] = Field(default_factory=list)
    excluded_surfaces: list[str] = Field(default_factory=list, alias="excludedSurfaces")
    reviewed_at: str = Field(alias="reviewedAt")
    steps: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    prohibited_actions: list[str] = Field(
        default_factory=list, alias="prohibitedActions"
    )
    stop_conditions: list[str] = Field(default_factory=list, alias="stopConditions")
    tag_condition: str = Field(default="", alias="tagCondition")
    sources: list[SourceRef] = Field(default_factory=list)
    confidence: Literal["reviewed"]


KnowledgeStatus = Literal[
    "local_hit",
    "local_hit_no_inventory",
    "external_hit",
    "insufficient",
    "no_match",
    "external_fail",
]
