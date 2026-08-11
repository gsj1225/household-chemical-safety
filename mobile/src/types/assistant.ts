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

// ── 最终响应 ──────────────────────────────────────

export interface AssistantResponse {
  answer: string;
  needsClarification: boolean;
  clarificationQuestions: string[];
  inventoryAdvice: AssistantProductAdvice[];
  generalAdvice: string[];
  safetyWarnings: AssistantSafetyWarning[];
  outOfScope: boolean;
  evidence: string[];
}

// ── 本地会话消息（含 UI 状态）────────────────────

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  text: string;
  imageUri?: string;
  response?: AssistantResponse;
}
