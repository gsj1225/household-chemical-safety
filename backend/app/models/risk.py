"""风险相关数据模型"""

from pydantic import BaseModel, Field
from enum import Enum
from typing import Literal


class EvidenceSource(BaseModel):
    organization: str
    title: str
    url: str


class RiskLevel(str, Enum):
    """风险等级"""
    SAFE = "safe"
    LOW = "low"
    MEDIUM = "medium"
    CRITICAL = "critical"


class RiskType(str, Enum):
    """风险类型"""
    CHEMICAL_CONFLICT = "化学品冲突"
    INGREDIENT_EXCEEDED = "成分超标"
    CHILDREN_RISK = "儿童风险"
    PREGNANCY_RISK = "孕妇风险"
    STORAGE_ISSUE = "存放不当"
    GENERAL = "通用风险"


class RiskResult(BaseModel):
    """单个风险评估结果"""
    level: RiskLevel = Field(description="风险等级")
    type: RiskType = Field(default=RiskType.GENERAL, description="风险类型")
    title: str = Field(default="", description="风险标题，如'致命组合！'")
    description: str = Field(default="", description="风险说明，具体有冲击力")
    advice: str = Field(default="", description="排雷建议")
    evidence_status: Literal["verified", "needs_review"] = "needs_review"
    evidence_level: Literal["authoritative", "secondary", "unverified"] = "unverified"
    reviewed_at: str | None = None
    sources: list[EvidenceSource] = Field(default_factory=list)


class RiskAssessment(BaseModel):
    """完整风险评估结果"""
    products: list[dict] = Field(default_factory=list, description="参与评估的产品列表")
    risks: list[RiskResult] = Field(default_factory=list, description="发现的风险列表")
    has_mine: bool = Field(default=False, description="是否踩雷")
    mine_count: int = Field(default=0, description="雷点数量")
