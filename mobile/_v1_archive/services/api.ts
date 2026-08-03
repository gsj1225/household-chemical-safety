/**
 * API 客户端
 * 对接后端 FastAPI 接口
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import type {
  ChallengeInfo,
  PanoramaResult,
  ScanResult,
  ReportData,
  NarrationResponse,
  ChallengeHistoryItem,
  IdentificationDraft,
  ProductIdentification,
} from '../types';

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 15_000;
const AI_SCAN_TIMEOUT_MS = 45_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function parseRetryAfter(value?: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds) : undefined;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
    });
    if (!response.ok) {
      let detail = `请求失败 (${response.status})`;
      let code: string | undefined;
      let requestId = response.headers.get('X-Request-ID') ?? undefined;
      const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
      try {
        const body = await response.json();
        if (typeof body?.error?.message === 'string') detail = body.error.message;
        if (typeof body?.error?.code === 'string') code = body.error.code;
        if (typeof body?.error?.request_id === 'string') requestId = body.error.request_id;
        // 兼容尚未升级的旧后端。
        if (typeof body?.detail === 'string') detail = body.detail;
      } catch {
        // 非 JSON 错误响应使用状态码文案。
      }
      throw new ApiError(
        detail,
        response.status,
        code,
        requestId,
        retryAfterSeconds,
      );
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        '请求超时，请检查网络后重试',
        undefined,
        'REQUEST_TIMEOUT',
      );
    }
    throw new ApiError(
      '无法连接检查服务，请检查网络后重试',
      undefined,
      'NETWORK_UNAVAILABLE',
    );
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 压缩图片，返回适合 FormData 的对象
 */
async function compressImage(uri: string): Promise<{ uri: string; type: string; name: string }> {
  try {
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );

    return {
      uri: manipResult.uri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    };
  } catch {
    // A few Android/Expo Go combinations can return a camera URI before the
    // image manipulator is ready. The camera itself already produces JPEG, so
    // keep the inspection moving instead of dropping the upload entirely.
    if (Platform.OS !== 'web' && (uri.startsWith('file:') || uri.startsWith('content:'))) {
      return {
        uri,
        type: 'image/jpeg',
        name: 'camera-photo.jpg',
      };
    }
    throw new ApiError(
      '无法处理这张照片，请重新拍摄或从相册选择',
      undefined,
      'IMAGE_PROCESSING_FAILED',
    );
  }
}

async function appendImage(formData: FormData, uri: string): Promise<void> {
  const photo = await compressImage(uri);
  if (Platform.OS === 'web') {
    const blob = await (await fetch(photo.uri)).blob();
    formData.append('image', blob, photo.name);
    return;
  }
  formData.append('image', photo as any);
}

function apiErrorFromUpload(
  status: number,
  body: string,
  headers: Record<string, string>,
): ApiError {
  let detail = `请求失败 (${status})`;
  let code: string | undefined;
  let requestId = headers['X-Request-ID'] ?? headers['x-request-id'];
  const retryAfterSeconds = parseRetryAfter(
    headers['Retry-After'] ?? headers['retry-after'],
  );
  try {
    const payload = JSON.parse(body);
    if (typeof payload?.error?.message === 'string') detail = payload.error.message;
    if (typeof payload?.error?.code === 'string') code = payload.error.code;
    if (typeof payload?.error?.request_id === 'string') requestId = payload.error.request_id;
    if (typeof payload?.detail === 'string') detail = payload.detail;
  } catch {
    // Keep the status-based fallback for non-JSON responses.
  }
  return new ApiError(detail, status, code, requestId, retryAfterSeconds);
}

async function uploadImage<T>(
  path: string,
  imageUri: string,
  parameters: Record<string, string>,
  timeoutMs: number,
): Promise<T> {
  if (Platform.OS === 'web') {
    const formData = new FormData();
    await appendImage(formData, imageUri);
    for (const [key, value] of Object.entries(parameters)) {
      formData.append(key, value);
    }
    return request<T>(path, {
      method: 'POST',
      body: formData,
    }, timeoutMs);
  }

  const photo = await compressImage(imageUri);
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const upload = FileSystem.uploadAsync(`${API_BASE}${path}`, photo.uri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'image',
      mimeType: photo.type,
      parameters,
      headers: {
        Accept: 'application/json',
      },
    });
    const result = await Promise.race([
      upload,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new ApiError('请求超时，请检查网络后重试', undefined, 'REQUEST_TIMEOUT')),
          timeoutMs,
        );
      }),
    ]);

    if (result.status < 200 || result.status >= 300) {
      throw apiErrorFromUpload(result.status, result.body, result.headers);
    }
    return JSON.parse(result.body) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      '照片上传失败，请检查网络后重试',
      undefined,
      'IMAGE_UPLOAD_FAILED',
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const api = {
  /**
   * 开始挑战
   */
  async startChallenge(): Promise<ChallengeInfo> {
    return request<ChallengeInfo>('/challenge/start', {
      method: 'POST',
    });
  },

  async getChallengeHistory(): Promise<ChallengeHistoryItem[]> {
    return request<ChallengeHistoryItem[]>('/challenge/history');
  },

  /**
   * 全景扫描
   */
  async scanPanorama(imageUri: string, challengeId: string): Promise<PanoramaResult> {
    return uploadImage<PanoramaResult>(
      '/scan/panorama',
      imageUri,
      { challenge_id: challengeId },
      AI_SCAN_TIMEOUT_MS,
    );
  },

  /**
   * 细拍扫描
   */
  async identifyProduct(
    imageUri: string,
    challengeId: string,
    areaId: string
  ): Promise<IdentificationDraft> {
    return uploadImage<IdentificationDraft>(
      '/scan/identify',
      imageUri,
      {
        challenge_id: challengeId,
        area_id: areaId,
      },
      AI_SCAN_TIMEOUT_MS,
    );
  },

  async confirmProduct(
    challengeId: string,
    draftId: string,
    product: ProductIdentification,
  ): Promise<ScanResult> {
    return request<ScanResult>('/scan/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challenge_id: challengeId,
        draft_id: draftId,
        product,
      }),
    });
  },

  /**
   * 获取排雷报告
   */
  async getResult(challengeId: string): Promise<ReportData> {
    return request<ReportData>(
      `/challenge/result?challenge_id=${encodeURIComponent(challengeId)}`,
      { method: 'POST' }
    );
  },

  /**
   * 生成趣味旁白
   */
  async generateNarration(
    challengeId: string,
    currentArea: string,
    scanCount: number
  ): Promise<NarrationResponse> {
    return request<NarrationResponse>(
      `/narration/generate?challenge_id=${encodeURIComponent(challengeId)}&current_area=${encodeURIComponent(currentArea)}&scan_count=${scanCount}`,
      { method: 'POST' }
    );
  },
};
