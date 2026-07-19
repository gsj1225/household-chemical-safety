"""挑战相关数据模型"""

from pydantic import BaseModel, Field
from datetime import datetime, timezone
import uuid


class ChallengeStart(BaseModel):
    """挑战开始请求"""
    pass


class ChallengeInfo(BaseModel):
    """挑战信息"""
    challenge_id: str = Field(default_factory=lambda: f"ch-{uuid.uuid4().hex[:12]}")
    guide_message: str = Field(
        default="好，挑战开始！先拍一张你家最可能有化学品的地方——"
        "厨房水槽下面、卫生间柜子，都是重灾区。"
    )
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ChallengeState(BaseModel):
    """挑战运行时状态（内存存储）"""
    challenge_id: str
    created_at: datetime
    scanned_products: list[dict] = Field(default_factory=list)
    """已识别的产品列表，用于交叉风险评估"""
    scan_results: list[dict] = Field(default_factory=list)
    """所有扫描结果"""
    scene_label: str | None = None
    """当前全景图的展示标签；旧记录缺失时保持为空"""
    panorama_areas: list[dict] = Field(default_factory=list)
    """当前全景图对应的细拍区域，不包含原始图片"""
    pending_identifications: dict[str, dict] = Field(default_factory=dict)
    """等待用户确认的识别草稿，不含图片"""
    total_mines: int = 0
    """累计雷点数"""
    is_completed: bool = False
    mock_scan_index: int = 0
    report: dict | None = None


class ChallengeHistoryItem(BaseModel):
    """历史挑战摘要。"""
    challenge_id: str
    created_at: datetime
    total_mines: int
    is_completed: bool
    score: int | None = None
    scene_label: str = "历史场景"
