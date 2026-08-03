/**
 * Inventory ViewModel — v2.0
 *
 * DTO → ViewModel 统一处理日期、风险摘要和适用边界。
 * 前端组件只消费 ViewModel，不直接使用 DTO。
 */

import type { InventoryProduct } from '../types/inventory';
import type { CompatibilitySummary } from '../types/compatibility';

// ── ViewModel 类型 ────────────────────────────────

export interface ProductCardViewModel {
  productId: string;
  name: string;
  brand: string | null;
  brandDisplay: string;
  category: string;
  categoryLabel: string;
  coverUri: string | null;
  needsInfo: boolean;
  expiryDisplay: string;
  productionDisplay: string;
  identificationConfidence: 'high' | 'medium' | 'low' | 'unknown' | 'user_confirmed';
}

export interface SummaryViewModel {
  status: CompatibilitySummary['status'];
  totalProducts: number;
  totalRelations: number;
  criticalCount: number;
  attentionCount: number;
  needsInformationCount: number;
  boundaryNotice: string;
  hasConflict: boolean;
  hasNeedsInfo: boolean;
}

export interface InventoryGridViewModel {
  products: ProductCardViewModel[];
  summary: SummaryViewModel | null;
  total: number;
}

// ── 品类中文映射 ──────────────────────────────────

const categoryLabels: Record<string, string> = {
  kitchen_cleaner: '厨房清洁',
  bathroom_cleaner: '浴室清洁',
  toilet_cleaner: '洁厕',
  descaler: '除垢',
  drain_cleaner: '管道疏通',
  disinfectant: '消毒',
  bleach: '漂白',
  laundry: '洗衣',
  fabric_softener: '柔顺',
  stain_remover: '去渍',
  pesticide: '杀虫',
  insect_repellent: '驱虫',
  other: '其他',
};

// ── 日期格式化 ────────────────────────────────────

function formatPartialDate(
  value: string | null,
  precision: string,
): string {
  if (!value) return '未知';
  switch (precision) {
    case 'day':
      return value;
    case 'month':
      return value;
    case 'year':
      return value;
    default:
      return '未知';
  }
}

// ── 映射函数 ──────────────────────────────────────

export function toProductCardVM(
  product: InventoryProduct,
  coverUri: string | null = null,
): ProductCardViewModel {
  return {
    productId: product.productId,
    name: product.name,
    brand: product.brand,
    brandDisplay: product.brand ?? '未知品牌',
    category: product.category,
    categoryLabel: categoryLabels[product.category] ?? product.category,
    coverUri,
    needsInfo: product.information_status === 'needs_information',
    expiryDisplay: formatPartialDate(
      product.expiry_date.value,
      product.expiry_date.precision,
    ),
    productionDisplay: formatPartialDate(
      product.production_date.value,
      product.production_date.precision,
    ),
    identificationConfidence: product.identification_confidence,
  };
}

export function toSummaryVM(
  summary: CompatibilitySummary,
): SummaryViewModel {
  return {
    status: summary.status,
    totalProducts: summary.totalProducts,
    totalRelations: summary.totalRelations,
    criticalCount: summary.criticalCount,
    attentionCount: summary.attentionCount,
    needsInformationCount: summary.needsInformationCount,
    boundaryNotice: summary.boundaryNotice,
    hasConflict: summary.status === 'has_conflict',
    hasNeedsInfo: summary.status === 'needs_information',
  };
}

export function toInventoryGridVM(
  items: InventoryProduct[],
  summary: CompatibilitySummary | null,
  total: number,
  coverResolver?: (productId: string) => string | null,
): InventoryGridViewModel {
  return {
    products: items.map((p) =>
      toProductCardVM(p, coverResolver?.(p.productId) ?? null),
    ),
    summary: summary ? toSummaryVM(summary) : null,
    total,
  };
}
