/**
 * InventoryScreen — v2.0 库存入口
 *
 * I1: 接入真实 inventoryStore，替换 F2 的 Mock 数据。
 */

import React, { useEffect, useCallback, useState, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { rawTokens, semanticColors } from '../theme/tokens';
import AppText from '../components/primitives/AppText';
import ScreenSafeArea from '../components/primitives/ScreenSafeArea';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import Surface from '../components/primitives/Surface';
import AppButton from '../components/primitives/AppButton';
import TextField from '../components/primitives/TextField';
import ProductGrid, { type ProductGridItem } from '../components/composites/ProductGrid';
import { photoAssetService } from '../services/photoAssetService';
import {
  useInventoryStore,
  selectInventoryView,
} from '../store/inventoryStore';
import type { InventoryProduct } from '../types/inventory';
import type { CompatibilitySummary } from '../types/compatibility';

export default function InventoryScreen() {
  const { items, summary, loadState, errorMessage, searchQuery, load, refresh, setSearch } =
    useInventoryStore();
  const navigation = useNavigation<any>();

  const viewState = useInventoryStore(selectInventoryView);
  const [coverUris, setCoverUris] = useState<Record<string, string | null>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  // 防抖搜索：输入后 350ms 触发服务端查询
  const handleSearchChange = useCallback((v: string) => {
    const trimmed = v.trim() || null;
    setSearch(trimmed);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      refresh();
    }, 350);
  }, [setSearch, refresh]);

  const handleClearSearch = useCallback(() => {
    setSearch(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    refresh();
  }, [setSearch, refresh]);

  // 异步加载产品封面
  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    (async () => {
      const uris: Record<string, string | null> = {};
      await Promise.all(
        items.map(async (p) => {
          try {
            uris[p.productId] = await photoAssetService.getCoverUri(p.productId);
          } catch {
            uris[p.productId] = null;
          }
        })
      );
      if (!cancelled) setCoverUris(uris);
    })();
    return () => { cancelled = true; };
  }, [items]);

  const handleRetry = useCallback(() => {
    refresh();
  }, [refresh]);

  const gridItems: ProductGridItem[] = items.map((p: InventoryProduct) => ({
    product: p,
    coverUri: coverUris[p.productId] ?? null,
  }));

  const handleAddProduct = useCallback(() => {
    navigation.navigate('IntakeFlow');
  }, [navigation]);

  const handlePressProduct = useCallback((productId: string) => {
    navigation.navigate('ProductDetail', { productId });
  }, [navigation]);

  const handleOpenCompatibility = useCallback(() => {
    navigation.navigate('Compatibility');
  }, [navigation]);

  return (
    <ScreenSafeArea>
      <View style={styles.header}>
        <AppText variant="title">我的化学品库</AppText>
        <View style={styles.headerActions}>
          <AppButton label="相容性" variant="secondary" onPress={handleOpenCompatibility} />
          <AppButton label="+ 添加" variant="primary" onPress={handleAddProduct} />
        </View>
      </View>
      <ScreenScroll variant="list">
        {/* 搜索栏 */}
        <View style={styles.searchBar}>
          <TextField
            label=""
            value={searchQuery ?? ''}
            onChangeText={handleSearchChange}
            placeholder="搜索产品名称…"
          />
          {searchQuery ? (
            <AppButton label="清除" variant="quiet" onPress={handleClearSearch} />
          ) : null}
        </View>
        <InventoryContent
          viewState={viewState}
          items={gridItems}
          summary={summary}
          errorMessage={errorMessage}
          searchQuery={searchQuery}
          onRetry={handleRetry}
          onPressProduct={handlePressProduct}
        />
      </ScreenScroll>
    </ScreenSafeArea>
  );
}

// ── 内容渲染 ──────────────────────────────────────

interface InventoryContentProps {
  viewState: 'loading' | 'empty' | 'error' | 'content' | 'noResults';
  items: ProductGridItem[];
  summary: CompatibilitySummary | null;
  errorMessage: string | null;
  searchQuery: string | null;
  onRetry: () => void;
  onPressProduct?: (productId: string) => void;
}

function InventoryContent({
  viewState,
  items,
  summary,
  errorMessage,
  searchQuery,
  onRetry,
  onPressProduct,
}: InventoryContentProps) {
  if (viewState === 'loading') {
    return (
      <View style={styles.centering}>
        <StateMessage
          title="加载中"
          description="正在获取库存数据…"
          tone="neutral"
        />
      </View>
    );
  }

  if (viewState === 'error') {
    return (
      <View style={styles.centering}>
        <StateMessage
          title="加载失败"
          description={errorMessage ?? '请检查网络后重试'}
          tone="error"
          actions={<AppButton label="重试" variant="secondary" onPress={onRetry} />}
        />
      </View>
    );
  }

  if (viewState === 'empty') {
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

  if (viewState === 'noResults') {
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

  // content
  return (
    <View style={styles.content}>
      {summary && summary.totalProducts > 0 ? (
        <Surface variant="subtle" style={styles.summaryBar}>
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
        </Surface>
      ) : null}
      <ProductGrid items={items} onPressProduct={onPressProduct} />
    </View>
  );
}

const styles = StyleSheet.create({

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rawTokens.space[4],
    paddingTop: rawTokens.space[4],
    paddingBottom: rawTokens.space[2],
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: rawTokens.space[2],
  },
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
  searchBar: {
    marginBottom: rawTokens.space[2],
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  summaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[3],
    padding: rawTokens.space[3],
    maxWidth: 520,
    alignSelf: 'center',
    width: '100%',
  },
});
