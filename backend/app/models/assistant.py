"""助手问答领域模型 — Stage 4 共享契约

productId 必须来自数据库，不允许由 LLM 只返回产品名称。
所有模型开启 populate_by_name=True，保持移动端 camelCase 契约。
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ── 会话消息 ──────────────────────────────────────

class AssistantHistoryMessage(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: Literal["user", "assistant"]
    text: str = Field(max_length=4000)

# ── 产品建议 ──────────────────────────────────────

class AssistantProductAdvice(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = Field(..., alias="productId")
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

# ── AI 候选草稿（未经验证，不能直接作为安全结论）──

class AssistantDraft(BaseModel):
    """LLM 输出的结构化候选，需经 AssistantService 校验后才能进入 AssistantResponse。

    - productId 必须属于当前库存，否则丢弃；
    - 关系为 critical 时强制生成 safetyWarnings 并删除混用步骤；
    - needs_information 产品不能被标记为 recommended。
    """

    model_config = ConfigDict(populate_by_name=True)

    answer: str = ""
    needs_clarification: bool = False
    clarification_questions: list[str] = Field(default_factory=list)
    product_advice: list[AssistantProductAdvice] = Field(default_factory=list)
    general_advice: list[str] = Field(default_factory=list)
    safety_warnings: list[AssistantSafetyWarning] = Field(default_factory=list)
    out_of_scope: bool = False
