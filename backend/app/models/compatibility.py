"""Compatibility 领域模型 — v2.0 共享契约"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class RelationType(str, Enum):
    do_not_mix = "do_not_mix"
    separate_storage = "separate_storage"
    usage_interval = "usage_interval"
    needs_information = "needs_information"


class Severity(str, Enum):
    critical = "critical"
    attention = "attention"
    info = "info"
    unknown = "unknown"


class EvidenceStatus(str, Enum):
    verified = "verified"
    needs_review = "needs_review"


class CompatibilitySummaryStatus(str, Enum):
    has_conflict = "has_conflict"
    needs_information = "needs_information"
    no_registered_conflict = "no_registered_conflict"


class EvidenceSource(BaseModel):
    organization: str
    title: str
    url: Optional[str] = None
    reviewed_at: Optional[str] = None


class CompatibilityRelation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., alias="relationId")
    product_a_id: str = Field(..., alias="productAId")
    product_b_id: str = Field(..., alias="productBId")
    relation_type: RelationType = Field(..., alias="relationType")
    severity: Severity
    title: str
    rationale: str
    recommended_action: str = Field(..., alias="recommendedAction")
    rule_id: Optional[str] = Field(None, alias="ruleId")
    rule_version: str = Field(..., alias="ruleVersion")
    evidence_status: EvidenceStatus = Field(..., alias="evidenceStatus")
    sources: list[EvidenceSource] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CompatibilitySummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    status: CompatibilitySummaryStatus
    total_relations: int = Field(0, alias="totalRelations")
    critical_count: int = Field(0, alias="criticalCount")
    attention_count: int = Field(0, alias="attentionCount")
    unknown_count: int = Field(0, alias="unknownCount")
    needs_information_count: int = Field(0, alias="needsInformationCount")
    total_products: int = Field(0, alias="totalProducts")
    boundary_notice: str = "库内存在相关产品，不表示它们正在共同存放或混用。"


class ProductMutationResult(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product: "InventoryProduct"
    compatibility_summary: CompatibilitySummary = Field(..., alias="compatibilitySummary")
    changed_relations: list[CompatibilityRelation] = Field(default_factory=list, alias="changedRelations")


# 延迟导入避免循环
from app.models.inventory import InventoryProduct  # noqa: E402

ProductMutationResult.model_rebuild()


class DuplicateCandidate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = Field(..., alias="productId")
    name: str
    category: str
    brand: Optional[str] = None
    match_reason: str = Field(..., alias="matchReason")
    match_strength: str = Field(..., alias="matchStrength", description="strong | normal")


class DuplicateCheckRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1)
    brand: Optional[str] = None
    category: Optional[str] = None
    barcode: Optional[str] = None
    ingredients: list[str] = Field(default_factory=list)


class DuplicateCheckResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    candidates: list[DuplicateCandidate] = Field(default_factory=list)
    has_candidates: bool = Field(False, alias="hasCandidates")


class CompatibilityRelationFilters(BaseModel):
    product_id: Optional[str] = Field(None, description="筛选特定产品的关系")
    relation_type: Optional[RelationType] = None
    severity: Optional[Severity] = None
    sort_by: str = Field("severity")
    sort_order: str = Field("desc")
    limit: int = Field(500, ge=1, le=500)
    offset: int = Field(0, ge=0)
