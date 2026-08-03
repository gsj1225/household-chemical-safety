/**
 * Inventory 领域类型 — v2.0 共享契约
 * 与后端 models/inventory.py 一一对应
 */

// ── 枚举 ──────────────────────────────────────────

export type ProductCategory =
  | 'kitchen_cleaner'
  | 'bathroom_cleaner'
  | 'toilet_cleaner'
  | 'descaler'
  | 'drain_cleaner'
  | 'disinfectant'
  | 'bleach'
  | 'laundry'
  | 'fabric_softener'
  | 'stain_remover'
  | 'pesticide'
  | 'insect_repellent'
  | 'other';

export type DatePrecision = 'day' | 'month' | 'year' | 'unknown';

export type FactSource = 'label' | 'user' | 'model_observation' | 'rule';

export type ConfirmationStatus = 'confirmed' | 'unknown';

export type IdentificationConfidence = 'high' | 'medium' | 'low' | 'unknown' | 'user_confirmed';

export type InformationStatus = 'complete' | 'needs_information';

export type PhotoRole = 'front' | 'back' | 'date' | 'other';

export type DuplicateDecision = 'check_first' | 'create_another' | 'update_existing';

// ── 部分日期 ──────────────────────────────────────

export interface PartialDate {
  value: string | null;
  precision: DatePrecision;
  source: FactSource;
}

// ── 事实记录 ──────────────────────────────────────

export interface ConfirmedFact {
  display_value: string;
  normalized_value: string | null;
  source: FactSource;
  confirmation: ConfirmationStatus;
  audit_source: FactSource | null;
}

export interface SafetyStatement {
  text: string;
  source: FactSource;
  rule_id: string | null;
}

// ── 库存产品 ──────────────────────────────────────

export interface InventoryProduct {
  productId: string;
  revision: number;
  brand: string | null;
  name: string;
  category: ProductCategory;
  barcode: string | null;
  production_date: PartialDate;
  expiry_date: PartialDate;
  shelf_life_text: string | null;
  ingredients: ConfirmedFact[];
  label_warnings: ConfirmedFact[];
  storage_requirements: SafetyStatement[];
  hazards: SafetyStatement[];
  incompatibility_targets: SafetyStatement[];
  identification_confidence: IdentificationConfidence;
  information_status: InformationStatus;
  created_at: string;
  updated_at: string;
}

// ── 识别草稿 ──────────────────────────────────────

export interface DraftFact {
  field: string;
  display_value: string;
  confidence: IdentificationConfidence;
  source: FactSource;
  conflicting?: boolean;
  previous_value?: string;
}

export interface ProductSnapshot {
  productId: string;
  name: string;
  category: ProductCategory;
  brand: string | null;
  coverThumbnailUri: string | null;
  match_reason: string | null;
}

export interface ProductFormValue {
  brand: string;
  name: string;
  category: string;
  production_date?: string;
  expiry_date?: string;
  ingredients: string[];
  storage_requirements: string[];
  hazard_notes: string[];
  label_warnings: string[];
}

export interface RecognitionDraft {
  draftId: string;
  observations: DraftFact[];
  proposedProduct: ProductFormValue;
  missingRequiredFields: string[];
  lowConfidenceFields: string[];
  duplicateCandidates: ProductSnapshot[];
  created_at: string;
}

// ── 创建/修改请求 ─────────────────────────────────

export interface ProductCreateRequest {
  productId: string;
  operationId: string;
  revision: number;
  brand?: string;
  name: string;
  category: ProductCategory;
  barcode?: string;
  production_date: PartialDate;
  expiry_date: PartialDate;
  shelf_life_text?: string;
  ingredients: ConfirmedFact[];
  label_warnings: ConfirmedFact[];
  storage_requirements: SafetyStatement[];
  hazards: SafetyStatement[];
  incompatibility_targets: SafetyStatement[];
  identification_confidence: IdentificationConfidence;
  information_status: InformationStatus;
  duplicateDecision: DuplicateDecision;
}

export interface ProductUpdateRequest {
  expectedRevision: number;
  operationId: string;
  brand?: string;
  name: string;
  category: ProductCategory;
  barcode?: string;
  production_date: PartialDate;
  expiry_date: PartialDate;
  shelf_life_text?: string;
  ingredients: ConfirmedFact[];
  label_warnings: ConfirmedFact[];
  storage_requirements: SafetyStatement[];
  hazards: SafetyStatement[];
  incompatibility_targets: SafetyStatement[];
  identification_confidence: IdentificationConfidence;
  information_status: InformationStatus;
}

export interface ProductDeleteRequest {
  expectedRevision: number;
  operationId: string;
}

// ── 查询参数 ──────────────────────────────────────

export interface InventoryFilters {
  query?: string;
  category?: ProductCategory;
  expiry_status?: 'expiring_soon' | 'unknown' | 'all';
  safety_status?: 'has_conflict' | 'needs_info' | 'has_hazard' | 'all';
  sort_by?: 'updated_at' | 'name' | 'expiry';
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// ── 列表响应 ──────────────────────────────────────

export interface InventoryListResponse {
  items: InventoryProduct[];
  total: number;
  summary: import('./compatibility').CompatibilitySummary;
}

// ── 错误信封 ──────────────────────────────────────

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string;
    retry_after_seconds?: number;
  };
}

// ── 稳定错误码 ────────────────────────────────────

export const ERROR_CODES = {
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  DUPLICATE_CANDIDATE: 'DUPLICATE_CANDIDATE',
  PRODUCT_VERSION_CONFLICT: 'PRODUCT_VERSION_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  INVENTORY_VALIDATION_ERROR: 'INVENTORY_VALIDATION_ERROR',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
  UNSUPPORTED_IMAGE_TYPE: 'UNSUPPORTED_IMAGE_TYPE',
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];
