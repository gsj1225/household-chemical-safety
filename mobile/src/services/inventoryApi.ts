/**
 * Inventory API 客户端 — v2.0
 *
 * 对接后端 /api/inventory/* 接口。
 */

import { ApiError } from './errors';
import type {
  InventoryProduct,
  ProductUpdateRequest,
  ProductDeleteRequest,
} from '../types/inventory';
import type {
  CompatibilitySummary,
  ProductMutationResult,
} from '../types/compatibility';

// ── 响应类型 ──────────────────────────────────────

export interface InventoryListResponse {
  items: InventoryProduct[];
  total: number;
  summary: CompatibilitySummary;
}

// ── 查询参数 ──────────────────────────────────────

export interface InventoryListParams {
  query?: string;
  category?: string;
  expiry_status?: string;
  safety_status?: string;
  sort_by?: string;
  sort_order?: string;
  limit?: number;
  offset?: number;
}

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
      } catch {
        // 非 JSON 错误响应
      }
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

// ── 查询字符串构建 ────────────────────────────────

function buildQueryString(params: InventoryListParams): string {
  const parts: string[] = [];
  if (params.query) parts.push(`query=${encodeURIComponent(params.query)}`);
  if (params.category) parts.push(`category=${encodeURIComponent(params.category)}`);
  if (params.expiry_status) parts.push(`expiry_status=${encodeURIComponent(params.expiry_status)}`);
  if (params.safety_status) parts.push(`safety_status=${encodeURIComponent(params.safety_status)}`);
  if (params.sort_by) parts.push(`sort_by=${encodeURIComponent(params.sort_by)}`);
  if (params.sort_order) parts.push(`sort_order=${encodeURIComponent(params.sort_order)}`);
  if (params.limit) parts.push(`limit=${params.limit}`);
  if (params.offset) parts.push(`offset=${params.offset}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

// ── API 方法 ──────────────────────────────────────

export const inventoryApi = {
  /**
   * 获取库存产品列表
   * GET /api/inventory/products
   */
  async list(params: InventoryListParams = {}): Promise<InventoryListResponse> {
    return request<InventoryListResponse>(
      `/inventory/products${buildQueryString(params)}`,
    );
  },

  /**
   * 获取单个产品详情（含相容性摘要和变更关系）
   * GET /api/inventory/products/{productId}
   */
  async getDetail(productId: string): Promise<ProductMutationResult> {
    return request<ProductMutationResult>(
      `/inventory/products/${encodeURIComponent(productId)}`,
    );
  },

  /**
   * 获取单个产品（仅产品实体）
   * GET /api/inventory/products/{productId}
   */
  async getById(productId: string): Promise<InventoryProduct> {
    const result = await request<ProductMutationResult>(
      `/inventory/products/${encodeURIComponent(productId)}`,
    );
    return result.product;
  },

  /**
   * 获取相容性摘要
   * GET /api/inventory/compatibility/summary
   */
  async getSummary(): Promise<CompatibilitySummary> {
    return request<CompatibilitySummary>(
      '/inventory/compatibility/summary',
    );
  },

  /**
   * 更新产品
   * PATCH /api/inventory/products/{productId}
   */
  async update(productId: string, data: ProductUpdateRequest): Promise<ProductMutationResult> {
    return request<ProductMutationResult>(
      `/inventory/products/${encodeURIComponent(productId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
  },

  /**
   * 删除产品
   * DELETE /api/inventory/products/{productId}
   */
  async delete(productId: string, data: ProductDeleteRequest): Promise<CompatibilitySummary> {
    return request<CompatibilitySummary>(
      `/inventory/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
  },
};
