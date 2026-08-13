"""助手问答领域模型 — Stage 4 共享契约

productId 必须来自数据库，不允许由 LLM 只返回产品名称。
所有模型开启 populate_by_name=True，保持移动端 camelCase 契约。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.knowledge import (
    KnowledgeEvidence,
    KnowledgeStatus,
    SourceRef,
)

# ── 会话消息 ──────────────────────────────────────

class AssistantHistoryMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)

# ── 产品建议 ──────────────────────────────────────

class AssistantProductAdvice(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = Field(..., alias="productId")
    # 产品名必须来自数据库，不允许由 LLM 返回；后端 _assemble 阶段由库存回填
    product_name: str = Field(default="", alias="productName")
    recommendation: Literal["recommended", "not_recommended", "needs_information"]
    reason: str
    steps: list[str] = Field(default_factory=list)
    cautions: list[str] = Field(default_factory=list)

# ── 安全警告 ──────────────────────────────────────

class AssistantSafetyWarning(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    severity: Literal["critical", "attention", "unknown"]
    title: str
    description: str
    relation_id: str | None = Field(None, alias="relationId")
    rule_id: str | None = Field(None, alias="ruleId")
    recommended_action: str

# ── 最终响应 ──────────────────────────────────────

class AssistantResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    answer: str
    needs_clarification: bool = Field(alias="needsClarification")
    clarification_questions: list[str] = Field(
        default_factory=list, alias="clarificationQuestions"
    )
    inventory_advice: list[AssistantProductAdvice] = Field(
        default_factory=list, alias="inventoryAdvice"
    )
    general_advice: list[str] = Field(default_factory=list, alias="generalAdvice")
    safety_warnings: list[AssistantSafetyWarning] = Field(
        default_factory=list, alias="safetyWarnings"
    )
    out_of_scope: bool = Field(False, alias="outOfScope")
    evidence: list[str] = Field(default_factory=list)
    # ── 知识库优先（Stage 3）新增 ──
    knowledge: list[KnowledgeEvidence] = Field(default_factory=list, alias="knowledge")
    knowledge_status: KnowledgeStatus = Field("no_match", alias="knowledgeStatus")
    external_sources: list[SourceRef] = Field(default_factory=list, alias="externalSources")
    sources: list[SourceRef] = Field(default_factory=list)
    pending_knowledge_notice: str = Field(default="", alias="pendingKnowledgeNotice")

# ── Legacy AI 候选草稿（已废弃，新知识库优先流程不调用）──

class LegacyAssistantDraft(BaseModel):
    """[legacy] 旧版单次 LLM 输出草稿。

    仅被旧接口 answer_household_question 使用；新问答流程不使用本模型，
    也不会用其 product_advice/safety_warnings/out_of_scope 覆盖 AssistantResponse。
    新流程只使用 KnowledgeIntentDraft 与 AssistantNarrativeDraft。
    """

    model_config = ConfigDict(populate_by_name=True)

    answer: str = ""
    needs_clarification: bool = False
    clarification_questions: list[str] = Field(default_factory=list)
    product_advice: list[AssistantProductAdvice] = Field(default_factory=list)
    general_advice: list[str] = Field(default_factory=list)
    safety_warnings: list[AssistantSafetyWarning] = Field(default_factory=list)
    out_of_scope: bool = False
