/**
 * Assistant 纯状态逻辑 — Stage 4
 *
 * 与 store/assistantStore.ts 配合的纯函数集合：
 * - 消息构建、history 截断、可发送判定
 * - 发送开始/成功/失败的状态迁移
 *
 * 不 import 任何 react-native / zustand，可在 Node 测试中直接导入。
 */

import type {
  AssistantHistoryMessage,
  AssistantMessage,
  AssistantResponse,
  AssistantWarningSeverity,
  KnowledgeStatus,
  SourceRef,
} from '../types/assistant.ts';

// ── 会话状态 ──────────────────────────────────────

export interface AssistantUiState {
  messages: AssistantMessage[];
  draft: string;
  pendingImageUri: string | null;
  contextProductId?: string;
  sending: boolean;
  error: string | null;
}

/** 本地消息 ID 生成（测试环境不可用 crypto.randomUUID 时退化） */
export function createMessageId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── 消息构建 ──────────────────────────────────────

export function buildUserMessage(
  question: string,
  imageUri: string | null,
): AssistantMessage {
  return {
    id: createMessageId(),
    role: 'user',
    text: question.trim(),
    imageUri: imageUri ?? undefined,
  };
}

export function buildAssistantMessage(
  response: AssistantResponse,
): AssistantMessage {
  // 归一化：旧后端缺失 Stage 3 字段时补齐安全默认值
  const normalized = normalizeAssistantResponse(response);
  return {
    id: createMessageId(),
    role: 'assistant',
    text: normalized.answer,
    response: normalized,
  };
}

// ── Stage 3 字段安全降级 ─────────────────────────

/** 旧后端缺少 knowledge 等字段时的默认状态 */
export const DEFAULT_KNOWLEDGE_STATUS: KnowledgeStatus = 'no_match';

/** 安全警告展示优先级：critical → attention → unknown */
const WARNING_RANK: Record<AssistantWarningSeverity, number> = {
  critical: 0,
  attention: 1,
  unknown: 2,
};

/** 安全警告按优先级排序（critical 优先显示，稳定排序） */
export function sortWarningsBySeverity<T extends { severity: AssistantWarningSeverity }>(
  warnings: T[],
): T[] {
  return [...warnings].sort(
    (a, b) => (WARNING_RANK[a.severity] ?? 9) - (WARNING_RANK[b.severity] ?? 9),
  );
}

/** 归一化后字段必填的响应类型（Stage 3 字段均已补齐） */
export type NormalizedAssistantResponse = AssistantResponse & {
  knowledge: NonNullable<AssistantResponse['knowledge']>;
  knowledgeStatus: NonNullable<AssistantResponse['knowledgeStatus']>;
  externalSources: NonNullable<AssistantResponse['externalSources']>;
  sources: NonNullable<AssistantResponse['sources']>;
  pendingKnowledgeNotice: string;
};

/**
 * 归一化助手响应：补齐 Stage 3 新增字段的安全默认值。
 * 旧后端没有这些字段时，移动端使用默认值而非崩溃。
 */
export function normalizeAssistantResponse(
  response: AssistantResponse,
): NormalizedAssistantResponse {
  return {
    ...response,
    knowledge: response.knowledge ?? [],
    knowledgeStatus: response.knowledgeStatus ?? DEFAULT_KNOWLEDGE_STATUS,
    externalSources: response.externalSources ?? [],
    sources: response.sources ?? [],
    pendingKnowledgeNotice: response.pendingKnowledgeNotice ?? '',
    // critical 警告优先显示
    safetyWarnings: sortWarningsBySeverity(response.safetyWarnings),
  };
}

// ── 来源分层（SourceLayersCard）───────────────────

/** 来源固定展示顺序：local_kb → warehouse → rule → external */
export const SOURCE_ORDER: SourceRef['type'][] = [
  'local_kb',
  'warehouse',
  'rule',
  'external',
];

/**
 * 按 (type, ref) 去重，保持首次出现顺序。
 * 不同知识条目的来源 ref 不同，去重不会丢失。
 */
export function dedupeSources(sources: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const out: SourceRef[] = [];
  for (const s of sources) {
    const key = `${s.type}:${s.ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/**
 * 去重 + 按固定顺序排序（local_kb → warehouse → rule → external）。
 * 同类型内保持原相对顺序。
 */
export function orderedSources(sources: SourceRef[]): SourceRef[] {
  const order = new Map(SOURCE_ORDER.map((t, i) => [t, i]));
  return dedupeSources(sources).sort((a, b) => {
    const ai = order.get(a.type) ?? 99;
    const bi = order.get(b.type) ?? 99;
    return ai - bi;
  });
}

// ── 外部来源安全 ──────────────────────────────────

/** 仅 https 的外部来源允许打开跳转 */
export function canOpenExternalSource(url: string): boolean {
  return typeof url === 'string' && url.startsWith('https://');
}

// ── 可发送判定 ────────────────────────────────────

/** 未输入文字且无照片时不可发送；发送中禁用重复发送 */
export function canSend(
  draft: string,
  pendingImageUri: string | null,
  sending: boolean,
): boolean {
  if (sending) return false;
  return draft.trim().length > 0 || (pendingImageUri !== null && pendingImageUri.length > 0);
}

// ── History 截断 ─────────────────────────────────

/** 仅发送带文字的消息，最多保留最近 MAX_HISTORY 条 */
export const MAX_HISTORY = 12;

export function toHistoryPayload(
  messages: AssistantMessage[],
  max: number = MAX_HISTORY,
): AssistantHistoryMessage[] {
  return messages
    .filter((m) => m.text && m.text.trim().length > 0)
    .map((m) => ({ role: m.role, text: m.text.trim() }))
    .slice(-max);
}

// ── 发送请求构建 ─────────────────────────────────

export interface AssistantSendRequest {
  question: string;
  imageUri: string | null;
  history: AssistantHistoryMessage[];
}

/** 从当前状态构建发送请求；不可发送时返回 null */
export function buildSendRequest(state: AssistantUiState): AssistantSendRequest | null {
  if (state.sending) return null;
  const question = state.draft.trim();
  if (!question && !state.pendingImageUri) return null;
  return {
    question,
    imageUri: state.pendingImageUri,
    history: toHistoryPayload(state.messages),
  };
}

// ── 状态迁移 ─────────────────────────────────────

/** 发送开始：把用户消息加入本地列表，清空输入框与附件，置 sending */
export function applySendStart(state: AssistantUiState): AssistantUiState {
  const userMessage = buildUserMessage(state.draft, state.pendingImageUri);
  return {
    ...state,
    messages: [...state.messages, userMessage],
    draft: '',
    pendingImageUri: null,
    sending: true,
    error: null,
  };
}

/** 发送成功：追加助手消息 */
export function applySendSuccess(
  state: AssistantUiState,
  response: AssistantResponse,
): AssistantUiState {
  return {
    ...state,
    messages: [...state.messages, buildAssistantMessage(response)],
    sending: false,
    error: null,
  };
}

/** 发送失败：保留用户消息，显示错误，允许重试 */
export function applySendFailure(
  state: AssistantUiState,
  error: string,
): AssistantUiState {
  return {
    ...state,
    sending: false,
    error,
  };
}

/**
 * 构建重试请求：复用最后一条用户消息，不重复追加用户消息。
 * history 排除当前失败的用户消息（与首次发送时一致）。
 */
export function retryRequest(state: AssistantUiState): AssistantSendRequest | null {
  const lastUser = [...state.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser) return null;
  const prior = state.messages.slice(0, -1);
  return {
    question: lastUser.text,
    imageUri: lastUser.imageUri ?? null,
    history: toHistoryPayload(prior),
  };
}

// ── 输入区操作 ───────────────────────────────────

export function attachPhoto(state: AssistantUiState, uri: string): AssistantUiState {
  return { ...state, pendingImageUri: uri, error: null };
}

export function clearAttachment(state: AssistantUiState): AssistantUiState {
  return { ...state, pendingImageUri: null };
}

export function setDraft(state: AssistantUiState, draft: string): AssistantUiState {
  return { ...state, draft, error: null };
}

export function setContext(state: AssistantUiState, productId?: string): AssistantUiState {
  return { ...state, contextProductId: productId };
}
