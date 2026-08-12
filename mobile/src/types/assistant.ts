/**
 * Assistant 领域类型 — Stage 4 共享契约
 * 与后端 models/assistant.py 一一对应（camelCase，populate_by_name=True）
 */

// ── 会话消息 ──────────────────────────────────────

export type AssistantRole = 'user' | 'assistant';

export interface AssistantHistoryMessage {
  role: AssistantRole;
  text: string;
}

// ── 产品建议 ──────────────────────────────────────

export type AssistantRecommendation =
  | 'recommended'
  | 'not_recommended'
  | 'needs_information';

export interface AssistantProductAdvice {
  productId: string;
  productName: string;
  recommendation: AssistantRecommendation;
  reason: string;
  steps: string[];
  cautions: string[];
}

// ── 安全警告 ──────────────────────────────────────

export type AssistantWarningSeverity = 'critical' | 'attention' | 'unknown';

export interface AssistantSafetyWarning {
  severity: AssistantWarningSeverity;
  title: string;
  description: string;
  relationId: string | null;
  recommendedAction: string;
}

// ── 来源引用（与后端 SourceRef 对齐，camelCase）──

export type SourceRefType = 'local_kb' | 'warehouse' | 'rule' | 'external';

export interface SourceRef {
  type: SourceRefType;
  title: string;
  domain: string;
  url: string;
  retrievedAt: string | null;
  ref: string;
  version: string;
}

// ── 知识证据（仅 reviewed 条目，与后端 KnowledgeEvidence 对齐）──

export interface KnowledgeEvidence {
  entryId: string;
  topic: string;
  surfaces: string[];
  excludedSurfaces: string[];
  steps: string[];
  warnings: string[];
  prohibitedActions: string[];
  stopConditions: string[];
  tagCondition: string;
  sources: SourceRef[];
  confidence: 'reviewed';
}

// ── 知识状态 ──────────────────────────────────────

export type KnowledgeStatus =
  | 'local_hit'
  | 'local_hit_no_inventory'
  | 'external_hit'
  | 'insufficient'
  | 'no_match'
  | 'external_fail';

// ── 最终响应 ──────────────────────────────────────

/**
 * 助手响应。Stage 3 新增字段在旧后端缺失时可选，运行时由
 * normalizeAssistantResponse 补齐安全默认值，避免崩溃。
 */
export interface AssistantResponse {
  answer: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
  inventoryAdvice: AssistantProductAdvice[];
  generalAdvice: string[];
  safetyWarnings: AssistantSafetyWarning[];
  outOfScope: boolean;
  evidence: string[];
  // ── Stage 3 知识库优先（旧后端缺失时安全降级）──
  knowledge?: KnowledgeEvidence[];
  knowledgeStatus?: KnowledgeStatus;
  externalSources?: SourceRef[];
  sources?: SourceRef[];
  pendingKnowledgeNotice?: string;
}

// ── 本地会话消息（含 UI 状态）────────────────────

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  imageUri?: string;
  response?: AssistantResponse;
}
