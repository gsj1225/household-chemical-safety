import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors } from '../../theme/tokens';
import AppText from '../primitives/AppText';
import StateMessage from '../primitives/StateMessage';
import AppButton from '../primitives/AppButton';
import ProductGrid, { type ProductGridItem } from '../composites/ProductGrid';
import type { InventoryProduct } from '../../types/inventory';
import type { CompatibilitySummary } from '../../types/compatibility';

export type InventoryViewState =
  | 'loading'
  | 'empty'
  | 'error'
  | 'content'
  | 'noResults'
  | 'imageMissing';

interface InventoryViewProps {
  state: InventoryViewState;
  items: ProductGridItem[];
  summary?: CompatibilitySummary | null;
  errorMessage?: string;
  searchQuery?: string;
  onRetry?: () => void;
  onPressProduct?: (productId: string) => void;
}

// ── Mock 数据（F2 阶段使用，I1 替换为真实数据） ─────

export const mockProducts: InventoryProduct[] = [
  {
    productId: 'mock-001',
    revision: 1,
    brand: '威露',
    name: '84消毒液',
    category: 'disinfectant',
    barcode: '6901234567890',
    production_date: { value: '2025-05', precision: 'month', source: 'label' },
    expiry_date: { value: '2027-05', precision: 'month', source: 'label' },
    shelf_life_text: null,
    ingredients: [
      { display_value: '次氯酸钠', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '水', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    label_warnings: [],
    storage_requirements: [{ text: '避光阴凉', source: 'label', rule_id: null }],
    hazards: [],
    incompatibility_targets: [],
    identification_confidence: 'high',
    information_status: 'complete',
    created_at: '2026-01-15T08:00:00Z',
    updated_at: '2026-01-15T08:00:00Z',
  },
  {
    productId: 'mock-002',
    revision: 1,
    brand: '蓝月亮',
    name: '洁厕灵',
    category: 'toilet_cleaner',
    barcode: '6900987654321',
    production_date: { value: '2025-03', precision: 'month', source: 'label' },
    expiry_date: { value: '2027-03', precision: 'month', source: 'label' },
    shelf_life_text: null,
    ingredients: [
      { display_value: '盐酸', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    label_warnings: [],
    storage_requirements: [],
    hazards: [],
    incompatibility_targets: [],
    identification_confidence: 'medium',
    information_status: 'needs_information',
    created_at: '2026-01-16T10:00:00Z',
    updated_at: '2026-01-16T10:00:00Z',
  },
  {
    productId: 'mock-003',
    revision: 1,
    brand: '立白',
    name: '洗洁精',
    category: 'kitchen_cleaner',
    barcode: null,
    production_date: { value: null, precision: 'unknown', source: 'label' },
    expiry_date: { value: null, precision: 'unknown', source: 'label' },
    shelf_life_text: null,
    ingredients: [
      { display_value: '表面活性剂', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    label_warnings: [],
    storage_requirements: [],
    hazards: [],
    incompatibility_targets: [],
    identification_confidence: 'low',
    information_status: 'needs_information',
    created_at: '2026-01-17T12:00:00Z',
    updated_at: '2026-01-17T12:00:00Z',
  },
  {
    productId: 'mock-004',
    revision: 1,
    brand: '超能',
    name: '衣物柔顺剂',
    category: 'fabric_softener',
    barcode: '6901111222233',
    production_date: { value: '2025-06', precision: 'month', source: 'label' },
    expiry_date: { value: '2028-06', precision: 'month', source: 'label' },
    shelf_life_text: null,
    ingredients: [
      { display_value: '季铵盐', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    label_warnings: [],
    storage_requirements: [],
    hazards: [],
    incompatibility_targets: [],
    identification_confidence: 'high',
    information_status: 'complete',
    created_at: '2026-01-18T14:00:00Z',
    updated_at: '2026-01-18T14:00:00Z',
  },
];

export const mockGridItems: ProductGridItem[] = mockProducts.map((p, i) => ({
  product: p,
  coverUri: i % 3 === 2 ? null : `mock://cover/${p.productId}`,
}));

export const mockSummary: CompatibilitySummary = {
  status: 'has_conflict',
  totalRelations: 1,
  criticalCount: 1,
  attentionCount: 0,
  unknownCount: 0,
  needsInformationCount: 1,
  totalProducts: 4,
  boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
};

// ── 组件 ──────────────────────────────────────────

export default function InventoryView({
  state,
  items,
  summary,
  errorMessage,
  searchQuery,
  onRetry,
  onPressProduct,
}: InventoryViewProps) {
  if (state === 'loading') {
    return (
      <View style={styles.centering} accessibilityLiveRegion="polite">
        <StateMessage
          title="加载中"
          description="正在获取库存数据…"
          tone="neutral"
        />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centering}>
        <StateMessage
          title="加载失败"
          description={errorMessage ?? '请检查网络后重试'}
          tone="error"
          actions={onRetry ? <AppButton label="重试" variant="secondary" onPress={onRetry} /> : undefined}
        />
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <View style={styles.centering}>
        <StateMessage
          title="库存为空"
          description="扫描添加第一件家庭化学品，开始建立你的安全库存"
          tone="neutral"
        />
      </View>
    );
  }

  if (state === 'noResults') {
    return (
      <View style={styles.centering}>
        <StateMessage
          title="未找到匹配产品"
          description={searchQuery ? `没有名称包含"${searchQuery}"的产品` : '请尝试其他搜索条件'}
          tone="neutral"
        />
      </View>
    );
  }

  // content 或 imageMissing 状态
  return (
    <View style={styles.content}>
      {summary && summary.totalProducts > 0 ? (
        <View style={styles.summaryBar}>
          <AppText variant="caption" color="secondary">
            共 {summary.totalProducts} 件产品
          </AppText>
          {summary.criticalCount > 0 ? (
            <AppText variant="caption" color="error">
              {summary.criticalCount} 项严重冲突
            </AppText>
          ) : null}
          {summary.needsInformationCount > 0 ? (
            <AppText variant="caption" color="warning">
              {summary.needsInformationCount} 件待补充
            </AppText>
          ) : null}
        </View>
      ) : null}
      <ProductGrid items={items} onPressProduct={onPressProduct} />
    </View>
  );
}

const styles = StyleSheet.create({
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  content: {
    flex: 1,
    gap: rawTokens.space[2],
  },
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[3],
    paddingVertical: rawTokens.space[2],
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
});
