"""报告相关数据模型"""

from pydantic import BaseModel, Field


class MineSummary(BaseModel):
    """雷点摘要"""
    products: list[str] = Field(default_factory=list, description="涉及的产品的产品名")
    type: str = Field(description="风险类型")
    level: str = Field(description="风险等级")
    description: str = Field(description="风险说明")
    advice: str = Field(description="排雷建议")
    evidence_status: str = "needs_review"
    evidence_level: str = "unverified"
    reviewed_at: str | None = None
    sources: list[dict] = Field(default_factory=list)
    confirmed_by_user: bool = False


class ReportData(BaseModel):
    """排雷报告"""
    score: int = Field(description="排雷评分 0-100")
    level: str = Field(description="评级文案")
    total_mines: int = Field(description="总雷点数")
    mine_breakdown: dict[str, int] = Field(
        default_factory=lambda: {"critical": 0, "medium": 0, "low": 0},
        description="雷点分布"
    )
    mines: list[MineSummary] = Field(default_factory=list, description="雷点列表")
    safe_items: int = Field(default=0, description="安全物品数")
    share_text: str = Field(description="分享文案")


class NarrationResponse(BaseModel):
    """趣味旁白响应"""
    narrations: list[str] = Field(description="旁白文本列表，逐条显示")
