/**
 * Assistant API 客户端 — Stage 4
 *
 * 对接后端 POST /api/assistant/ask（multipart/form-data）。
 * 文字 + 可选照片。可独立测试（不 import 任何 react-native / expo 包），
 * 平台相关能力通过 AssistantUploadDeps 注入：
 * - Web：fetch + FormData（浏览器无 Android multipart 缺陷）
 * - 原生：带图时用 expo-file-system uploadAsync（含 parameters 字段），
 *   纯文字时用 fetch + FormData（无文件，规避 Android 文件上传静默失败）
 */

import { ApiError } from './errors.ts';
import type {
  AssistantHistoryMessage,
  AssistantResponse,
} from '../types/assistant.ts';

/** 请求超时（Qwen 处理通常 5~15 秒） */
export const ASSISTANT_TIMEOUT_MS = 15_000;

/** 原生 uploadAsync 返回结构（对齐 expo-file-system FileSystemUploadResult） */
export interface NativeUploadResult {
  status: number;
  body: string;
}

/** 原生上传函数签名（对齐 FileSystem.uploadAsync 的 MULTIPART + parameters 用法） */
export type AssistantNativeUploadFn = (
  url: string,
  fileUri: string,
  options: {
    httpMethod: 'POST';
    uploadType: 'multipart';
    fieldName: string;
    mimeType: string;
    parameters: Record<string, string>;
    headers: Record<string, string>;
  },
) => Promise<NativeUploadResult>;

export interface AssistantUploadDeps {
  /** Platform.OS：'web' 走 fetch，其余走原生上传通道 */
  platform: string;
  /** API 基础地址，末尾不带斜杠 */
  apiBase: string;
  /** 鉴权请求头（由 authHeaders() 产出） */
  headers: Record<string, string>;
  /** 超时毫秒数，默认 ASSISTANT_TIMEOUT_MS */
  timeoutMs?: number;
  /** Web 路径的 fetch（默认可用 globalThis.fetch） */
  fetchFn?: typeof fetch;
  /** 原生带图上传函数（生产环境注入 FileSystem.uploadAsync 的封装） */
  uploadFn?: AssistantNativeUploadFn;
  /** 测试用：注入定时器以便验证超时时长 */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface AssistantAskInput {
  question: string;
  history: AssistantHistoryMessage[];
  contextProductId?: string;
  imageUri?: string;
  /** 是否允许外部搜索（首期 UI 默认 false，不主动开启） */
  allowExternalSearch?: boolean;
  /** 是否允许将照片上传到外部服务（首期 UI 默认 false） */
  allowExternalPhotoUpload?: boolean;
}

/** 从响应体中提取错误详情（对齐后端 error.message 契约） */
function extractErrorDetail(status: number, rawBody: string): string {
  let detail = `提问失败 (${status})`;
  try {
    const body = JSON.parse(rawBody);
    if (body?.error?.message) detail = body.error.message;
  } catch { /* 非 JSON 响应体，使用默认详情 */ }
  return detail;
}

/** 组装 multipart 文本字段（纯函数，供 web 与原生共用） */
export function buildTextFields(input: AssistantAskInput): Record<string, string> {
  const fields: Record<string, string> = {
    question: input.question,
    history: JSON.stringify(input.history),
  };
  if (input.contextProductId) fields.contextProductId = input.contextProductId;
  // 默认 false：首期不主动开启外部搜索，也不默认上传照片到外部服务
  if (input.allowExternalSearch) fields.allowExternalSearch = 'true';
  if (input.allowExternalPhotoUpload) fields.allowExternalPhotoUpload = 'true';
  return fields;
}

const ASK_PATH = '/assistant/ask';

/**
 * 发送问答请求。
 *
 * 错误契约：
 * - 非 2xx → ApiError(detail, status)
 * - 超时   → ApiError('提问超时，请重试', code=REQUEST_TIMEOUT)
 * - 网络/其他错误 → ApiError('无法连接服务，请检查网络后重试', code=NETWORK_UNAVAILABLE)
 */
export async function uploadAssistantQuestion(
  input: AssistantAskInput,
  deps: AssistantUploadDeps,
): Promise<AssistantResponse> {
  const timeoutMs = deps.timeoutMs ?? ASSISTANT_TIMEOUT_MS;
  const setTimeoutImpl = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutImpl = deps.clearTimeoutFn ?? clearTimeout;
  const url = `${deps.apiBase}${ASK_PATH}`;

  const controller = new AbortController();
  const timer = setTimeoutImpl(() => controller.abort(), timeoutMs);

  try {
    if (deps.platform === 'web') {
      return await uploadViaWebFetch(input, url, deps, controller.signal);
    }
    if (input.imageUri) {
      return await uploadViaNativeWithImage(input, url, deps, controller, timeoutMs);
    }
    return await uploadViaNativeText(input, url, deps, controller.signal);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('提问超时，请重试', undefined, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('无法连接服务，请检查网络后重试', undefined, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeoutImpl(timer);
  }
}

/** Web：fetch + Blob FormData */
async function uploadViaWebFetch(
  input: AssistantAskInput,
  url: string,
  deps: AssistantUploadDeps,
  signal: AbortSignal,
): Promise<AssistantResponse> {
  const fetchImpl = deps.fetchFn ?? fetch;
  const formData = new FormData();
  const fields = buildTextFields(input);
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  if (input.imageUri) {
    const blobResponse = await fetchImpl(input.imageUri);
    const blob = await blobResponse.blob();
    formData.append('image', blob, 'photo.jpg');
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: deps.headers,
    body: formData,
    signal,
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    throw new ApiError(extractErrorDetail(response.status, rawBody), response.status);
  }

  return (await response.json()) as AssistantResponse;
}

/** 原生带图：FileSystem.uploadAsync（uploadAsync 不支持 AbortSignal，用 race 实现超时） */
async function uploadViaNativeWithImage(
  input: AssistantAskInput,
  url: string,
  deps: AssistantUploadDeps,
  controller: AbortController,
  timeoutMs: number,
): Promise<AssistantResponse> {
  if (!deps.uploadFn) {
    throw new ApiError('原生上传通道未配置', undefined, 'UPLOAD_NOT_CONFIGURED');
  }

  const uploadPromise = deps.uploadFn(url, input.imageUri as string, {
    httpMethod: 'POST',
    uploadType: 'multipart',
    fieldName: 'image',
    mimeType: 'image/jpeg',
    parameters: buildTextFields(input),
    headers: deps.headers,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('提问超时，请重试'), { name: 'AbortError' }));
    });
  });

  // timeoutMs 仅用于文档化 race 语义；实际超时由 controller 触发
  void timeoutMs;
  const result = await Promise.race([uploadPromise, timeoutPromise]);

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(extractErrorDetail(result.status, result.body), result.status);
  }

  try {
    return JSON.parse(result.body) as AssistantResponse;
  } catch {
    throw new ApiError('服务返回异常', undefined, 'INVALID_RESPONSE');
  }
}

/** 原生纯文字：fetch + FormData（无文件，规避 Android 文件上传静默失败） */
async function uploadViaNativeText(
  input: AssistantAskInput,
  url: string,
  deps: AssistantUploadDeps,
  signal: AbortSignal,
): Promise<AssistantResponse> {
  const fetchImpl = deps.fetchFn ?? fetch;
  const formData = new FormData();
  const fields = buildTextFields(input);
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }

  const response = await fetchImpl(url, {
    method: 'POST',
    headers: deps.headers,
    body: formData,
    signal,
  });

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    throw new ApiError(extractErrorDetail(response.status, rawBody), response.status);
  }

  return (await response.json()) as AssistantResponse;
}
