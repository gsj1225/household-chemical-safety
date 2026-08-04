/**
 * Inventory API 客户端 — v2.0
 *
 * 对接后端 /api/inventory/* 接口。
 */

import { apiRequest } from './apiClient.ts';
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

// request 函数已统一到 apiClient.apiRequest

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
    return apiRequest<InventoryListResponse>(
      `/inventory/products${buildQueryString(params)}`,
    );
  },

  /**
   * 获取单个产品详情（含相容性摘要和变更关系）
   * GET /api/inventory/products/{productId}
   */
  async getDetail(productId: string): Promise<ProductMutationResult> {
    return apiRequest<ProductMutationResult>(
      `/inventory/products/${encodeURIComponent(productId)}`,
    );
  },

  /**
   * 获取单个产品（仅产品实体）
   * GET /api/inventory/products/{productId}
   */
  async getById(productId: string): Promise<InventoryProduct> {
    const result = await apiRequest<ProductMutationResult>(
      `/inventory/products/${encodeURIComponent(productId)}`,
    );
    return result.product;
  },

  /**
   * 获取相容性摘要
   * GET /api/inventory/compatibility/summary
   */
  async getSummary(): Promise<CompatibilitySummary> {
    return apiRequest<CompatibilitySummary>(
      '/inventory/compatibility/summary',
    );
  },

  /**
   * 更新产品
   * PATCH /api/inventory/products/{productId}
   */
  async update(productId: string, data: ProductUpdateRequest): Promise<ProductMutationResult> {
    return apiRequest<ProductMutationResult>(
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
    return apiRequest<CompatibilitySummary>(
      `/inventory/products/${encodeURIComponent(productId)}`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
  },
};
