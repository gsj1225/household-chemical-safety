/**
 * Compatibility API 客户端 — v2.0
 *
 * 对接后端 /api/inventory/compatibility/* 接口。
 */

import { ApiError } from './errors';
import type {
  CompatibilitySummary,
  CompatibilityListApiResponse,
  CompatibilityApiRelation,
} from '../types/compatibility';

// ── 配置 ──────────────────────────────────────────

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
).replace(/\/$/, '');
const REQUEST_TIMEOUT_MS = 15_000;

// ── 内部请求函数 ──────────────────────────────────

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
      try {
        const body = await response.json();
        if (typeof body?.error?.message === 'string') detail = body.error.message;
        if (typeof body?.error?.code === 'string') code = body.error.code;
      } catch { /* 非 JSON */ }
      throw new ApiError(detail, response.status, code);
    }
    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', undefined, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('无法连接服务，请检查网络后重试', undefined, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

// ── 查询参数 ──────────────────────────────────────

export interface CompatibilityListParams {
  product_id?: string;
  relation_type?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}

function buildQueryString(params: CompatibilityListParams): string {
  const parts: string[] = [];
  if (params.product_id) parts.push(`product_id=${encodeURIComponent(params.product_id)}`);
  if (params.relation_type) parts.push(`relation_type=${encodeURIComponent(params.relation_type)}`);
  if (params.severity) parts.push(`severity=${encodeURIComponent(params.severity)}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  if (params.offset) parts.push(`offset=${params.offset}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── API 方法 ──────────────────────────────────────

export const compatibilityApi = {
  /**
   * 获取相容性摘要
   * GET /api/inventory/compatibility/summary
   */
  async getSummary(): Promise<CompatibilitySummary> {
    return request<CompatibilitySummary>('/inventory/compatibility/summary');
  },

  /**
   * 获取相容性关系列表
   * GET /api/inventory/compatibility/relations
   */
  async listRelations(params: CompatibilityListParams = {}): Promise<CompatibilityListApiResponse> {
    return request<CompatibilityListApiResponse>(
      `/inventory/compatibility/relations${buildQueryString(params)}`,
    );
  },

  /**
   * 获取单个关系详情
   * GET /api/inventory/compatibility/relations/{relationId}
   */
  async getRelationDetail(relationId: string): Promise<CompatibilityApiRelation> {
    return request<CompatibilityApiRelation>(
      `/inventory/compatibility/relations/${encodeURIComponent(relationId)}`,
    );
  },
};
