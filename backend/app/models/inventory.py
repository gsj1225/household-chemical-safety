"""Inventory 领域模型 — v2.0 共享契约"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


# ── 枚举 ──────────────────────────────────────────

class ProductCategory(str, Enum):
    kitchen_cleaner = "kitchen_cleaner"
    bathroom_cleaner = "bathroom_cleaner"
    toilet_cleaner = "toilet_cleaner"
    descaler = "descaler"
    drain_cleaner = "drain_cleaner"
    disinfectant = "disinfectant"
    bleach = "bleach"
    laundry = "laundry"
    fabric_softener = "fabric_softener"
    stain_remover = "stain_remover"
    pesticide = "pesticide"
    insect_repellent = "insect_repellent"
    other = "other"


class DatePrecision(str, Enum):
    day = "day"
    month = "month"
    year = "year"
    unknown = "unknown"


class FactSource(str, Enum):
    label = "label"
    user = "user"
    model_observation = "model_observation"
    rule = "rule"


class ConfirmationStatus(str, Enum):
    confirmed = "confirmed"
    unknown = "unknown"


class IdentificationConfidence(str, Enum):
    high = "high"
    medium = "medium"
    low = "low"
    unknown = "unknown"
    user_confirmed = "user_confirmed"


class InformationStatus(str, Enum):
    complete = "complete"
    needs_information = "needs_information"


class PhotoRole(str, Enum):
    front = "front"
    back = "back"
    date = "date"
    other = "other"


class DuplicateDecision(str, Enum):
    check_first = "check_first"
    create_another = "create_another"
    update_existing = "update_existing"


# ── 部分日期 ──────────────────────────────────────

class PartialDate(BaseModel):
    value: Optional[str] = Field(None, description="ISO 格式或部分日期文本，如 2027-05 / 2027 / 未知")
    precision: DatePrecision = DatePrecision.unknown
    source: FactSource = FactSource.label


# ── 事实记录 ──────────────────────────────────────

class ConfirmedFact(BaseModel):
    display_value: str
    normalized_value: Optional[str] = None
    source: FactSource = FactSource.label
    confirmation: ConfirmationStatus = ConfirmationStatus.confirmed
    audit_source: Optional[FactSource] = None


class SafetyStatement(BaseModel):
    text: str
    source: FactSource = FactSource.label
    rule_id: Optional[str] = None


# ── 库存产品 ──────────────────────────────────────

class InventoryProduct(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(..., alias="productId", min_length=1, max_length=120)
    revision: int = Field(1, ge=1)
    brand: Optional[str] = Field(None, max_length=200)
    name: str = Field(..., min_length=1, max_length=120)
    category: ProductCategory
    barcode: Optional[str] = Field(None, max_length=100)
    production_date: PartialDate = Field(default_factory=PartialDate)
    expiry_date: PartialDate = Field(default_factory=PartialDate)
    shelf_life_text: Optional[str] = None
    ingredients: list[ConfirmedFact] = Field(default_factory=list)
    label_warnings: list[ConfirmedFact] = Field(default_factory=list)
    storage_requirements: list[SafetyStatement] = Field(default_factory=list)
    hazards: list[SafetyStatement] = Field(default_factory=list)
    incompatibility_targets: list[SafetyStatement] = Field(default_factory=list)
    identification_confidence: IdentificationConfidence = IdentificationConfidence.unknown
    information_status: InformationStatus = InformationStatus.needs_information
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── 识别草稿 ──────────────────────────────────────

class DraftFact(BaseModel):
    field: str
    display_value: str
    confidence: IdentificationConfidence = IdentificationConfidence.unknown
    source: FactSource = FactSource.model_observation


class ProductSnapshot(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = Field(..., alias="productId")
    name: str
    category: ProductCategory
    brand: Optional[str] = None
    cover_thumbnail_uri: Optional[str] = Field(None, alias="coverThumbnailUri")
    match_reason: Optional[str] = None


class ProductFormValue(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    brand: str = ""
    name: str = ""
    category: str = ""
    production_date: Optional[str] = None
    expiry_date: Optional[str] = None
    ingredients: list[str] = Field(default_factory=list)
    storage_requirements: list[str] = Field(default_factory=list)
    hazard_notes: list[str] = Field(default_factory=list)
    label_warnings: list[str] = Field(default_factory=list)


class RecognitionDraft(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    draft_id: str = Field(..., alias="draftId")
    observations: list[DraftFact] = Field(default_factory=list)
    proposed_product: ProductFormValue = Field(default_factory=ProductFormValue)
    missing_required_fields: list[str] = Field(default_factory=list)
    low_confidence_fields: list[str] = Field(default_factory=list)
    duplicate_candidates: list[ProductSnapshot] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# ── 创建/修改请求 ─────────────────────────────────

class ProductCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: str = Field(..., alias="productId", min_length=1, max_length=120)
    operation_id: str = Field(..., alias="operationId", min_length=1)
    revision: int = Field(1, ge=1)
    brand: Optional[str] = Field(None, max_length=200)
    name: str = Field(..., min_length=1, max_length=120)
    category: ProductCategory
    barcode: Optional[str] = Field(None, max_length=100)
    production_date: PartialDate = Field(default_factory=PartialDate)
    expiry_date: PartialDate = Field(default_factory=PartialDate)
    shelf_life_text: Optional[str] = None
    ingredients: list[ConfirmedFact] = Field(default_factory=list)
    label_warnings: list[ConfirmedFact] = Field(default_factory=list)
    storage_requirements: list[SafetyStatement] = Field(default_factory=list)
    hazards: list[SafetyStatement] = Field(default_factory=list)
    incompatibility_targets: list[SafetyStatement] = Field(default_factory=list)
    identification_confidence: IdentificationConfidence = IdentificationConfidence.unknown
    information_status: InformationStatus = InformationStatus.needs_information
    duplicate_decision: DuplicateDecision = Field(DuplicateDecision.check_first, alias="duplicateDecision")


class ProductUpdate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    expected_revision: int = Field(..., alias="expectedRevision", ge=1)
    operation_id: str = Field(..., alias="operationId", min_length=1)
    brand: Optional[str] = Field(None, max_length=200)
    name: str = Field(..., min_length=1, max_length=120)
    category: ProductCategory
    barcode: Optional[str] = Field(None, max_length=100)
    production_date: PartialDate = Field(default_factory=PartialDate)
    expiry_date: PartialDate = Field(default_factory=PartialDate)
    shelf_life_text: Optional[str] = None
    ingredients: list[ConfirmedFact] = Field(default_factory=list)
    label_warnings: list[ConfirmedFact] = Field(default_factory=list)
    storage_requirements: list[SafetyStatement] = Field(default_factory=list)
    hazards: list[SafetyStatement] = Field(default_factory=list)
    incompatibility_targets: list[SafetyStatement] = Field(default_factory=list)
    identification_confidence: IdentificationConfidence = IdentificationConfidence.unknown
    information_status: InformationStatus = InformationStatus.needs_information


class ProductDelete(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    expected_revision: int = Field(..., alias="expectedRevision", ge=1)
    operation_id: str = Field(..., alias="operationId", min_length=1)


# ── 查询参数 ──────────────────────────────────────

class InventoryListResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    items: list[InventoryProduct] = Field(default_factory=list)
    total: int = 0
    summary: "CompatibilitySummary"


class InventoryFilters(BaseModel):
    query: Optional[str] = None
    category: Optional[ProductCategory] = None
    expiry_status: Optional[str] = Field(None, description="expiring_soon | unknown | all")
    safety_status: Optional[str] = Field(None, description="has_conflict | needs_info | has_hazard | all")
    sort_by: str = Field("updated_at", description="updated_at | name | expiry")
    sort_order: str = Field("desc", description="asc | desc")
    limit: int = Field(500, ge=1, le=500)
    offset: int = Field(0, ge=0)


# 延迟导入避免循环
from app.models.compatibility import CompatibilitySummary  # noqa: E402

InventoryListResponse.model_rebuild()
