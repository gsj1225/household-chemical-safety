"""扫描相关数据模型"""

from pydantic import BaseModel, Field, field_validator
from enum import Enum
from datetime import datetime, timezone
import uuid
from typing import Literal


class ScanStatus(str, Enum):
    """单次扫描结果状态"""
    SAFE = "safe"
    MINE = "mine"


class IdentificationConfidence(str, Enum):
    """识别置信度"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ProductIdentification(BaseModel):
    """产品识别结果"""
    brand: str = Field(default="未知", description="品牌")
    name: str = Field(default="未知", description="产品名")
    category: str = Field(default="未知", description="品类")
    ingredients: list[str] = Field(default_factory=list, description="成分列表")
    confidence: IdentificationConfidence = Field(default=IdentificationConfidence.LOW)


class IdentificationDraft(BaseModel):
    """等待用户确认的产品识别草稿。"""
    draft_id: str = Field(default_factory=lambda: f"draft-{uuid.uuid4().hex[:12]}")
    challenge_id: str
    area_id: str = ""
    product: ProductIdentification
    requires_review: bool = True
    guide_message: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductConfirmationRequest(BaseModel):
    challenge_id: str
    draft_id: str
    product: ProductIdentification


class PanoramaArea(BaseModel):
    """全景照分析出的需细拍区域"""
    area_id: str = Field(default_factory=lambda: f"area-{uuid.uuid4().hex[:8]}")
    description: str = Field(description="位置描述，如'右侧水槽下方柜子'")
    items_hint: str = Field(description="物品提示，如'多瓶液体容器'")
    risk_level: Literal["high", "medium", "low"] = Field(
        description="风险预判：high/medium/low"
    )
    guide_message: str = Field(description="引导用户细拍的话术")
    bbox_2d: tuple[int, int, int, int] | None = Field(
        default=None,
        description="Qwen3-VL 归一化区域框 [x1,y1,x2,y2]，坐标范围 0-999",
    )

    @field_validator("bbox_2d")
    @classmethod
    def validate_bbox(cls, value):
        if value is None:
            return value
        x1, y1, x2, y2 = value
        if any(point < 0 or point > 999 for point in value):
            raise ValueError("bbox_2d 坐标必须在 0-999 范围内")
        if x2 <= x1 or y2 <= y1:
            raise ValueError("bbox_2d 必须满足 x2>x1 且 y2>y1")
        return value


class PanoramaResult(BaseModel):
    """全景照分析结果"""
    scan_id: str = Field(default_factory=lambda: f"scan-{uuid.uuid4().hex[:8]}")
    areas: list[PanoramaArea] = Field(default_factory=list, max_length=5)
    guide_message: str = Field(description="整体引导话术")


class ScanResult(BaseModel):
    """细拍照扫描结果"""
    scan_id: str = Field(default_factory=lambda: f"scan-{uuid.uuid4().hex[:8]}")
    challenge_id: str
    area_id: str = ""
    status: ScanStatus
    product: ProductIdentification
    risk: "RiskResult | None" = None
    guide_message: str = ""
    confirmed_by_user: bool = False
    created_at: datetime = Field(default_factory=datetime.now)


# 避免循环引用，手动引用
from app.models.risk import RiskResult  # noqa: E402

ScanResult.model_rebuild()
