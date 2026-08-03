/**
 * Compatibility 领域类型 — v2.0 共享契约
 * 与后端 models/compatibility.py 一一对应
 */

import type { InventoryProduct } from './inventory';

// ── 枚举 ──────────────────────────────────────────

export type RelationType =
  | 'do_not_mix'
  | 'separate_storage'
  | 'usage_interval'
  | 'needs_information';

export type Severity = 'critical' | 'attention' | 'info' | 'unknown';

export type EvidenceStatus = 'verified' | 'needs_review';

export type CompatibilitySummaryStatus =
  | 'has_conflict'
  | 'needs_information'
  | 'no_registered_conflict';

// ── 证据来源 ──────────────────────────────────────

export interface EvidenceSource {
  organization: string;
  title: string;
  url: string | null;
  reviewed_at: string | null;
}

// ── 相容性关系 ────────────────────────────────────

export interface CompatibilityRelation {
  relationId: string;
  productAId: string;
  productBId: string;
  relationType: RelationType;
  severity: Severity;
  title: string;
  rationale: string;
  recommendedAction: string;
  ruleId: string | null;
  ruleVersion: string;
  evidenceStatus: EvidenceStatus;
  sources: EvidenceSource[];
  updated_at: string;
}

// ── 摘要 ──────────────────────────────────────────

export interface CompatibilitySummary {
  status: CompatibilitySummaryStatus;
  totalRelations: number;
  criticalCount: number;
  attentionCount: number;
  unknownCount: number;
  needsInformationCount: number;
  totalProducts: number;
  boundaryNotice: string;
}

// ── 写操作结果 ────────────────────────────────────

export interface ProductMutationResult {
  product: InventoryProduct;
  compatibilitySummary: CompatibilitySummary;
  changedRelations: CompatibilityRelation[];
}

// ── 疑似重复 ──────────────────────────────────────

export interface DuplicateCandidate {
  productId: string;
  name: string;
  category: string;
  brand: string | null;
  matchReason: string;
  matchStrength: 'strong' | 'normal';
}

export interface DuplicateCheckRequest {
  name: string;
  brand?: string;
  category?: string;
  barcode?: string;
  ingredients: string[];
}

export interface DuplicateCheckResponse {
  candidates: DuplicateCandidate[];
  hasCandidates: boolean;
}

// ── API 原始响应（snake_case + nested payload）────────

export interface CompatibilityApiRelation {
  relation_id: string;
  product_a_id: string;
  product_b_id: string;
  relation_type: RelationType;
  severity: Severity;
  rule_id: string | null;
  rule_version: string;
  payload: {
    title: string;
    rationale: string;
    recommended_action: string;
    evidence_status: EvidenceStatus;
    sources: EvidenceSource[];
  };
  updated_at: string;
}

export interface CompatibilityListApiResponse {
  items: CompatibilityApiRelation[];
  total: number;
}

// ── 查询参数 ──────────────────────────────────────

export interface CompatibilityRelationFilters {
  product_id?: string;
  relation_type?: RelationType;
  severity?: Severity;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// ── 列表响应 ──────────────────────────────────────

export interface CompatibilityListResponse {
  items: CompatibilityRelation[];
  total: number;
}
