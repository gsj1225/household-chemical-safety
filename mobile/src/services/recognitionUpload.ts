/**
 * 识别照片上传 — 可独立测试的上传模块
 *
 * 背景：RN fetch + FormData 在 Android release 构建下 multipart 上传会
 * 静默失败（"Network request failed"，请求不发出，服务器无日志）。
 * 原生端改用 expo-file-system 的 uploadAsync（Expo 官方推荐路径），
 * Web 端保留 fetch + FormData（浏览器无此缺陷）。
 *
 * 本模块不 import 任何 react-native / expo 包，所有平台相关能力通过
 * RecognitionUploadDeps 注入，因此可以在 Node 测试中直接导入。
 */

import { ApiError } from './errors.ts';
import type { RecognitionDraft } from '../types/inventory.ts';

/** 识别请求超时（Qwen 处理通常 20~40 秒） */
export const RECOGNITION_TIMEOUT_MS = 45_000;

/** 压缩后的待上传照片信息（由 photoAssetService.compressForUpload 产出） */
export interface UploadPhoto {
  uri: string;
  type: string;
  name: string;
}

/** 原生 uploadAsync 返回结构（对齐 expo-file-system FileSystemUploadResult） */
export interface NativeUploadResult {
  status: number;
  body: string;
}

/** 原生上传函数签名（对齐 FileSystem.uploadAsync 的 MULTIPART 用法） */
export type NativeUploadFn = (
  url: string,
  fileUri: string,
  options: {
    httpMethod: 'POST';
    uploadType: 'multipart';
    fieldName: string;
    mimeType: string;
    headers: Record<string, string>;
  },
) => Promise<NativeUploadResult>;

export interface RecognitionUploadDeps {
  /** Platform.OS：'web' 走 fetch，其余走 uploadFn */
  platform: string;
  /** API 基础地址，末尾不带斜杠 */
  apiBase: string;
  /** 鉴权请求头（由 authHeaders() 产出） */
  headers: Record<string, string>;
  /** 超时毫秒数，默认 RECOGNITION_TIMEOUT_MS */
  timeoutMs?: number;
  /** Web 路径的 fetch（默认可用 globalThis.fetch） */
  fetchFn?: typeof fetch;
  /** 原生路径的上传函数（生产环境注入 FileSystem.uploadAsync 的封装） */
  uploadFn?: NativeUploadFn;
  /** 测试用：注入定时器以便验证超时时长 */
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

/** 从响应体中提取错误详情（对齐后端 error.message 契约） */
function extractErrorDetail(status: number, rawBody: string): string {
  let detail = `识别失败 (${status})`;
  try {
    const body = JSON.parse(rawBody);
    if (body?.error?.message) detail = body.error.message;
  } catch { /* 非 JSON 响应体，使用默认详情 */ }
  return detail;
}

/** 识别接口相对路径 */
const RECOGNIZE_PATH = '/inventory/recognition/recognize';

/**
 * 上传压缩后的照片进行识别。
 *
 * 错误契约：
 * - 非 2xx → ApiError(detail, status)
 * - 超时   → ApiError('识别超时，请重试', code=REQUEST_TIMEOUT)
 * - 网络/其他错误 → ApiError('无法连接识别服务', code=NETWORK_UNAVAILABLE)
 */
export async function uploadRecognitionPhoto(
  photo: UploadPhoto,
  deps: RecognitionUploadDeps,
): Promise<RecognitionDraft> {
  const timeoutMs = deps.timeoutMs ?? RECOGNITION_TIMEOUT_MS;
  const setTimeoutImpl = deps.setTimeoutFn ?? setTimeout;
  const clearTimeoutImpl = deps.clearTimeoutFn ?? clearTimeout;
  const url = `${deps.apiBase}${RECOGNIZE_PATH}`;

  const controller = new AbortController();
  const timer = setTimeoutImpl(() => controller.abort(), timeoutMs);

  try {
    if (deps.platform === 'web') {
      return await uploadViaWebFetch(photo, url, deps, controller.signal);
    }
    return await uploadViaNative(photo, url, deps, controller, timeoutMs);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('识别超时，请重试', undefined, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('无法连接识别服务', undefined, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeoutImpl(timer);
  }
}

/** Web：fetch + Blob FormData（浏览器 fetch 无 Android 的 multipart 缺陷） */
async function uploadViaWebFetch(
  photo: UploadPhoto,
  url: string,
  deps: RecognitionUploadDeps,
  signal: AbortSignal,
): Promise<RecognitionDraft> {
  const fetchImpl = deps.fetchFn ?? fetch;

  const blobResponse = await fetchImpl(photo.uri);
  const blob = await blobResponse.blob();
  const formData = new FormData();
  formData.append('image', blob, photo.name);

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

  return (await response.json()) as RecognitionDraft;
}

/** 原生：FileSystem.uploadAsync（uploadAsync 不支持 AbortSignal，用 race 实现超时） */
async function uploadViaNative(
  photo: UploadPhoto,
  url: string,
  deps: RecognitionUploadDeps,
  controller: AbortController,
  timeoutMs: number,
): Promise<RecognitionDraft> {
  if (!deps.uploadFn) {
    throw new ApiError('原生上传通道未配置', undefined, 'UPLOAD_NOT_CONFIGURED');
  }

  const uploadPromise = deps.uploadFn(url, photo.uri, {
    httpMethod: 'POST',
    uploadType: 'multipart',
    fieldName: 'image',
    mimeType: photo.type,
    headers: deps.headers,
  });

  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => {
      reject(Object.assign(new Error('识别超时，请重试'), { name: 'AbortError' }));
    });
  });

  // timeoutMs 仅用于文档化 race 语义；实际超时由 controller 触发
  void timeoutMs;
  const result = await Promise.race([uploadPromise, timeoutPromise]);

  if (result.status < 200 || result.status >= 300) {
    throw new ApiError(extractErrorDetail(result.status, result.body), result.status);
  }

  try {
    return JSON.parse(result.body) as RecognitionDraft;
  } catch {
    throw new ApiError('识别服务返回异常', undefined, 'INVALID_RESPONSE');
  }
}
