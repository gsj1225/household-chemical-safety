/**
 * Compatibility Store — v2.0
 *
 * 管理相容性关系列表和摘要状态。
 */

import { create } from 'zustand';
import { compatibilityApi, type CompatibilityListParams } from '../services/compatibilityApi';
import { inventoryApi } from '../services/inventoryApi';
import { ApiError } from '../services/errors';
import { toRelationVM, type RelationVM } from '../view-models/compatibility';
import type { CompatibilitySummary, CompatibilityApiRelation } from '../types/compatibility';
import type { InventoryProduct } from '../types/inventory';

// ── 状态类型 ──────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success' | 'error';
type SeverityFilter = 'all' | 'critical' | 'attention' | 'unknown' | 'info';

interface CompatibilityState {
  // 数据
  relations: RelationVM[];
  rawRelations: CompatibilityApiRelation[];
  summary: CompatibilitySummary | null;
  total: number;
  productMap: Record<string, InventoryProduct>;

  // 请求状态
  loadState: LoadState;
  errorMessage: string | null;

  // 筛选
  severityFilter: SeverityFilter;

  // Actions
  load: (params?: CompatibilityListParams) => Promise<void>;
  loadSummary: () => Promise<void>;
  setSeverityFilter: (filter: SeverityFilter) => void;
  refresh: () => Promise<void>;
  clearError: () => void;
}

// ── Store ────────────────────────────────────────

export const useCompatibilityStore = create<CompatibilityState>((set, get) => ({
  relations: [],
  rawRelations: [],
  summary: null,
  total: 0,
  productMap: {},
  loadState: 'idle',
  errorMessage: null,
  severityFilter: 'all',

  load: async (params?: CompatibilityListParams) => {
    set({ loadState: 'loading', errorMessage: null });

    try {
      const [response, productsResponse] = await Promise.all([
        compatibilityApi.listRelations(params ?? {}),
        inventoryApi.list({ limit: 500 }),
      ]);
      const relations = response.items.map(toRelationVM);

      // 构建 productId → product 映射
      const productMap: Record<string, InventoryProduct> = {};
      for (const p of productsResponse.items) {
        productMap[p.productId] = p;
      }

      set({
        relations,
        rawRelations: response.items,
        total: response.total,
        productMap,
        loadState: 'success',
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : '加载相容性数据失败';
      set({ loadState: 'error', errorMessage: message });
    }
  },

  loadSummary: async () => {
    try {
      const summary = await compatibilityApi.getSummary();
      set({ summary });
    } catch {
      // 摘要加载失败不阻塞列表
    }
  },

  setSeverityFilter: (filter) => {
    set({ severityFilter: filter });
  },

  refresh: async () => {
    const { severityFilter } = get();
    const params: CompatibilityListParams = {};
    if (severityFilter !== 'all') params.severity = severityFilter;
    await Promise.all([
      get().load(params),
      get().loadSummary(),
    ]);
  },

  clearError: () => {
    set({ errorMessage: null, loadState: 'idle' });
  },
}));

// ── 便捷选择器 ────────────────────────────────────

export const selectFilteredRelations = (state: CompatibilityState): RelationVM[] => {
  if (state.severityFilter === 'all') return state.relations;
  return state.relations.filter((r) => r.severity === state.severityFilter);
};

export const selectCompatibilityView = (state: CompatibilityState) => {
  switch (state.loadState) {
    case 'loading':
      return 'loading' as const;
    case 'error':
      return 'error' as const;
    case 'success':
      return state.relations.length === 0 ? 'empty' : 'content';
    default:
      return 'loading' as const;
  }
};
