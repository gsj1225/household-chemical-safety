/**
 * Inventory Store — v2.0
 *
 * 使用 Zustand 管理库存列表状态。
 * 加载实体、摘要和筛选；失败保留会话缓存。
 */

import { create } from 'zustand';
import { inventoryApi, type InventoryListParams } from '../services/inventoryApi';
import { ApiError } from '../services/errors';
import type { InventoryProduct } from '../types/inventory';
import type { CompatibilitySummary } from '../types/compatibility';

// ── 状态类型 ──────────────────────────────────────

type LoadState = 'idle' | 'loading' | 'success' | 'error';

interface InventoryState {
  // 数据
  items: InventoryProduct[];
  total: number;
  summary: CompatibilitySummary | null;

  // 请求状态
  loadState: LoadState;
  errorMessage: string | null;

  // 筛选
  searchQuery: string | null;
  selectedCategory: string | null;

  // Actions
  load: (params?: InventoryListParams) => Promise<void>;
  refresh: () => Promise<void>;
  setSearch: (query: string | null) => void;
  setCategory: (category: string | null) => void;
  clearError: () => void;
}

// ── 默认摘要 ──────────────────────────────────────

const emptySummary: CompatibilitySummary = {
  status: 'no_registered_conflict',
  totalRelations: 0,
  criticalCount: 0,
  attentionCount: 0,
  unknownCount: 0,
  needsInformationCount: 0,
  totalProducts: 0,
  boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
};

// ── Store ────────────────────────────────────────

export const useInventoryStore = create<InventoryState>((set, get) => ({
  items: [],
  total: 0,
  summary: null,

  loadState: 'idle',
  errorMessage: null,

  searchQuery: null,
  selectedCategory: null,

  load: async (params?: InventoryListParams) => {
    set({ loadState: 'loading', errorMessage: null });

    try {
      const response = await inventoryApi.list(params ?? {});

      set({
        items: response.items,
        total: response.total,
        summary: response.summary,
        loadState: 'success',
        errorMessage: null,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : '加载库存失败，请稍后重试';

      // 失败时保留会话缓存（不清空 items）
      set({
        loadState: 'error',
        errorMessage: message,
      });
    }
  },

  refresh: async () => {
    const { searchQuery, selectedCategory } = get();
    const params: InventoryListParams = {};
    if (searchQuery) params.query = searchQuery;
    if (selectedCategory) params.category = selectedCategory;
    await get().load(params);
  },

  setSearch: (query) => {
    set({ searchQuery: query });
  },

  setCategory: (category) => {
    set({ selectedCategory: category });
  },

  clearError: () => {
    set({ errorMessage: null, loadState: 'idle' });
  },
}));

// ── 便捷选择器 ────────────────────────────────────

export const selectInventoryView = (state: InventoryState) => {
  switch (state.loadState) {
    case 'loading':
      return 'loading' as const;
    case 'error':
      return 'error' as const;
    case 'success':
      if (state.items.length === 0) {
        return state.searchQuery ? 'noResults' : 'empty';
      }
      return 'content' as const;
    default:
      return 'loading' as const;
  }
};

export { emptySummary };
