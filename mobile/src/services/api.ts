/**
 * API 客户端
 * 对接后端 FastAPI 接口
 */

import * as ImageManipulator from 'expo-image-manipulator';
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
  ) {
    super(requestId ? `${message}（追踪号：${requestId.slice(0, 8)}）` : message);
    this.name = 'ApiError';
  }
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
      throw new ApiError(detail, response.status, code, requestId);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试');
    }
    throw new ApiError('无法连接服务器，请检查网络和 API 地址');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 压缩图片，返回适合 FormData 的对象
 */
async function compressImage(uri: string): Promise<{ uri: string; type: string; name: string }> {
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
    const formData = new FormData();
    await appendImage(formData, imageUri);
    formData.append('challenge_id', challengeId);

    return request<PanoramaResult>('/scan/panorama', {
      method: 'POST',
      body: formData,
    }, AI_SCAN_TIMEOUT_MS);
  },

  /**
   * 细拍扫描
   */
  async identifyProduct(
    imageUri: string,
    challengeId: string,
    areaId: string
  ): Promise<IdentificationDraft> {
    const formData = new FormData();
    await appendImage(formData, imageUri);
    formData.append('challenge_id', challengeId);
    formData.append('area_id', areaId);

    return request<IdentificationDraft>('/scan/identify', {
      method: 'POST',
      body: formData,
    }, AI_SCAN_TIMEOUT_MS);
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
