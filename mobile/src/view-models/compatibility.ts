/**
 * Compatibility ViewModel — v2.0
 *
 * 将后端 raw API 响应（snake_case + nested payload）映射为
 * 前端友好的扁平 ViewModel，附带中文标签和展示逻辑。
 */

import type {
  CompatibilityApiRelation,
  RelationType,
  Severity,
  EvidenceStatus,
  EvidenceSource,
  CompatibilitySummary,
} from '../types/compatibility';

// ── ViewModel 类型 ────────────────────────────────

export interface RelationVM {
  relationId: string;
  productAId: string;
  productBId: string;
  relationType: RelationType;
  relationTypeLabel: string;
  severity: Severity;
  severityLabel: string;
  title: string;
  rationale: string;
  recommendedAction: string;
  evidenceStatus: EvidenceStatus;
  evidenceStatusLabel: string;
  sources: EvidenceSource[];
  ruleId: string | null;
  ruleVersion: string;
  updatedAt: string;
  updatedAtDisplay: string;
}

export interface CompatibilityOverviewVM {
  status: CompatibilitySummary['status'];
  statusLabel: string;
  totalProducts: number;
  totalRelations: number;
  criticalCount: number;
  attentionCount: number;
  unknownCount: number;
  needsInformationCount: number;
  boundaryNotice: string;
  hasConflict: boolean;
  hasNeedsInfo: boolean;
  isClean: boolean;
}

// ── 标签映射 ──────────────────────────────────────

const relationTypeLabels: Record<RelationType, string> = {
  do_not_mix: '禁止混用',
  separate_storage: '分开存放',
  usage_interval: '使用间隔',
  needs_information: '待补充信息',
};

const severityLabels: Record<Severity, string> = {
  critical: '严重',
  attention: '注意',
  info: '提示',
  unknown: '未知',
};

const evidenceStatusLabels: Record<EvidenceStatus, string> = {
  verified: '已验证',
  needs_review: '待复核',
};

const statusLabels: Record<CompatibilitySummary['status'], string> = {
  has_conflict: '存在冲突',
  needs_information: '待补充信息',
  no_registered_conflict: '当前未发现已登记禁忌',
};

// ── 日期格式化 ────────────────────────────────────

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString('zh-CN');
  } catch {
    return isoString;
  }
}

// ── 映射函数 ──────────────────────────────────────

export function toRelationVM(raw: CompatibilityApiRelation): RelationVM {
  return {
    relationId: raw.relation_id,
    productAId: raw.product_a_id,
    productBId: raw.product_b_id,
    relationType: raw.relation_type,
    relationTypeLabel: relationTypeLabels[raw.relation_type] ?? raw.relation_type,
    severity: raw.severity,
    severityLabel: severityLabels[raw.severity] ?? raw.severity,
    title: raw.payload.title,
    rationale: raw.payload.rationale,
    recommendedAction: raw.payload.recommended_action,
    evidenceStatus: raw.payload.evidence_status,
    evidenceStatusLabel: evidenceStatusLabels[raw.payload.evidence_status] ?? raw.payload.evidence_status,
    sources: raw.payload.sources ?? [],
    ruleId: raw.rule_id,
    ruleVersion: raw.rule_version,
    updatedAt: raw.updated_at,
    updatedAtDisplay: formatDate(raw.updated_at),
  };
}

export function toCompatibilityOverviewVM(summary: CompatibilitySummary): CompatibilityOverviewVM {
  return {
    status: summary.status,
    statusLabel: statusLabels[summary.status] ?? summary.status,
    totalProducts: summary.totalProducts,
    totalRelations: summary.totalRelations,
    criticalCount: summary.criticalCount,
    attentionCount: summary.attentionCount,
    unknownCount: summary.unknownCount,
    needsInformationCount: summary.needsInformationCount,
    boundaryNotice: summary.boundaryNotice,
    hasConflict: summary.status === 'has_conflict',
    hasNeedsInfo: summary.status === 'needs_information',
    isClean: summary.status === 'no_registered_conflict',
  };
}

// ── 便捷导出 ──────────────────────────────────────

export { relationTypeLabels, severityLabels, evidenceStatusLabels };
