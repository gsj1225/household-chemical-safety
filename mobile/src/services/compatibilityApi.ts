/**
 * Compatibility API 客户端 — v2.0
 *
 * 对接后端 /api/inventory/compatibility/* 接口。
 */

import { apiRequest } from './apiClient';
import type {
  CompatibilitySummary,
  CompatibilityListApiResponse,
  CompatibilityApiRelation,
} from '../types/compatibility';

// request 函数已统一到 apiClient.apiRequest

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
    return apiRequest<CompatibilitySummary>('/inventory/compatibility/summary');
  },

  /**
   * 获取相容性关系列表
   * GET /api/inventory/compatibility/relations
   */
  async listRelations(params: CompatibilityListParams = {}): Promise<CompatibilityListApiResponse> {
    return apiRequest<CompatibilityListApiResponse>(
      `/inventory/compatibility/relations${buildQueryString(params)}`,
    );
  },

  /**
   * 获取单个关系详情
   * GET /api/inventory/compatibility/relations/{relationId}
   */
  async getRelationDetail(relationId: string): Promise<CompatibilityApiRelation> {
    return apiRequest<CompatibilityApiRelation>(
      `/inventory/compatibility/relations/${encodeURIComponent(relationId)}`,
    );
  },
};
