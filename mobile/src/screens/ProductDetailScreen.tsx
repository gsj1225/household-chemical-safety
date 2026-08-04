/**
 * ProductDetailScreen — 产品详情
 *
 * F5: 展示单个产品完整信息，提供编辑/重新扫描/删除操作。
 */

import React, { useState, useCallback, useRef } from 'react';
import { generateStableOperationId } from '../utils/operationId';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { rawTokens, semanticColors, componentTokens } from '../theme/tokens';
import ScreenSafeArea from '../components/primitives/ScreenSafeArea';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import SemanticBadge from '../components/primitives/SemanticBadge';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import AppDialog from '../components/primitives/AppDialog';
import Surface from '../components/primitives/Surface';
import ProductPhoto from '../components/composites/ProductPhoto';
import { useInventoryStore } from '../store/inventoryStore';
import { inventoryApi } from '../services/inventoryApi';
import { photoAssetService } from '../services/photoAssetService';
import type { RootStackParamList } from '../types';
import type { InventoryProduct, ProductCategory } from '../types/inventory';
import type { ProductMutationResult } from '../types/compatibility';

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

export default function ProductDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ProductDetail'>>();
  const navigation = useNavigation<any>();
  const { productId } = route.params;
  const { refresh } = useInventoryStore();

  const [detail, setDetail] = useState<ProductMutationResult | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 稳定操作 ID：首次删除时生成，重试复用，成功/取消后重置
  const deleteOperationIdRef = useRef<string | null>(null);

  // 加载详情
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      try {
        const result = await inventoryApi.getDetail(productId);
        if (cancelled) return;
        setDetail(result);
        setLoadState('success');

        // 加载本地封面
        try {
          const uri = await photoAssetService.getCoverUri(productId);
          if (!cancelled) setCoverUri(uri);
        } catch {
          // 封面加载失败不影响详情
        }
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : '加载失败');
        setLoadState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const handleEdit = useCallback(() => {
    navigation.navigate('ProductEdit', { productId });
  }, [navigation, productId]);

  const handleRescan = useCallback(() => {
    // 重新扫描：跳转入库流程，传入已有产品ID
    navigation.navigate('IntakeFlow', { rescanProductId: productId });
  }, [navigation, productId]);

  const handleDelete = useCallback(async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      await inventoryApi.delete(productId, {
        expectedRevision: detail.product.revision,
        operationId: deleteOperationIdRef.current ?? (deleteOperationIdRef.current = generateStableOperationId('op-del')),
      });

      // 删除本地封面
      try {
        await photoAssetService.deleteCover(productId);
      } catch { /* 忽略 */ }

      await refresh();
      deleteOperationIdRef.current = null;
      setDeleteDialogVisible(false);
      navigation.navigate('Inventory');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '删除失败');
      // 不重置 operationId：重试应复用同一 ID
    } finally {
      setDeleting(false);
    }
  }, [detail, productId, refresh, navigation]);

  // ── 渲染 ──────────────────────────────────────

  if (loadState === 'loading') {
    return (
      <ScreenSafeArea>
        <View style={styles.centering}>
          <StateMessage title="加载中" description="正在获取产品详情…" tone="neutral" />
        </View>
      </ScreenSafeArea>
    );
  }

  if (loadState === 'error' || !detail) {
    return (
    <ScreenSafeArea>
      <View style={styles.centering}>
        <StateMessage
          title="加载失败"
            description={errorMessage ?? '产品不存在'}
            tone="error"
            actions={
              <AppButton
                label="返回"
                variant="secondary"
                onPress={() => navigation.goBack()}
              />
            }
          />
        </View>
      </ScreenSafeArea>
    );
  }

  const product = detail.product;
  const summary = detail.compatibilitySummary;
  const categoryLabel = categoryLabels[product.category] ?? product.category;
  const needsInfo = product.information_status === 'needs_information';
  const ingredients = product.ingredients.filter((i) => i.display_value);
  const labelWarnings = product.label_warnings.filter((w) => w.display_value);
  const hazards = product.hazards.filter((h) => h.text);
  const storageReqs = product.storage_requirements.filter((s) => s.text);
  const incompatTargets = product.incompatibility_targets.filter((s) => s.text);

  return (
    <ScreenSafeArea>
      <ScreenScroll variant="detail">
        {/* 头部：照片 + 名称 + 品牌 + 品类 */}
        <Surface variant="subtle" style={styles.headerCard}>
          {coverUri ? (
            <View style={styles.photoContainer}>
              <ProductPhoto uri={coverUri} productName={product.name} width={120} />
            </View>
          ) : null}
          <AppText variant="title">{product.name}</AppText>
          {product.brand ? (
            <AppText variant="body" color="secondary">{product.brand}</AppText>
          ) : null}
          <View style={styles.badges}>
            <SemanticBadge label={categoryLabel} tone="neutral" />
            {needsInfo ? <SemanticBadge label="待补充" tone="unknown" /> : null}
            {summary && summary.criticalCount > 0 ? (
              <SemanticBadge label={`${summary.criticalCount} 项冲突`} tone="critical" />
            ) : null}
          </View>
        </Surface>

        {/* 成分 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">成分</AppText>
          {ingredients.length > 0 ? (
            <View style={styles.tagList}>
              {ingredients.map((ing, i) => (
                <SemanticBadge
                  key={i}
                  label={ing.display_value}
                  tone="neutral"
                />
              ))}
            </View>
          ) : (
            <AppText variant="caption" color="muted">暂无成分信息</AppText>
          )}
        </Surface>

        {/* 标签警示语 */}
        {labelWarnings.length > 0 ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">标签警示语</AppText>
            <View style={styles.tagList}>
              {labelWarnings.map((w, i) => (
                <SemanticBadge key={i} label={w.display_value} tone="attention" />
              ))}
            </View>
          </Surface>
        ) : null}

        {/* 危害信息 */}
        {hazards.length > 0 ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">危害提示</AppText>
            <View style={styles.bulletList}>
              {hazards.map((h, i) => (
                <AppText key={i} variant="caption" color="secondary">
                  · {h.text}
                </AppText>
              ))}
            </View>
          </Surface>
        ) : null}

        {/* 储存条件 */}
        {storageReqs.length > 0 ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">储存条件</AppText>
            <View style={styles.bulletList}>
              {storageReqs.map((s, i) => (
                <AppText key={i} variant="caption" color="secondary">
                  · {s.text}
                </AppText>
              ))}
            </View>
          </Surface>
        ) : null}

        {/* 不可混用对象 */}
        {incompatTargets.length > 0 ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">不可混用对象</AppText>
            <View style={styles.tagList}>
              {incompatTargets.map((s, i) => (
                <SemanticBadge key={i} label={s.text} tone="critical" />
              ))}
            </View>
          </Surface>
        ) : null}

        {/* 日期信息 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">日期信息</AppText>
          <View style={styles.dateRow}>
            <View style={styles.dateItem}>
              <AppText variant="caption" color="muted">生产日期</AppText>
              <AppText variant="body">
                {product.production_date.value ?? '未知'}
              </AppText>
            </View>
            <View style={styles.dateItem}>
              <AppText variant="caption" color="muted">过期日期</AppText>
              <AppText variant="body">
                {product.expiry_date.value ?? '未知'}
              </AppText>
            </View>
          </View>
          {product.shelf_life_text ? (
            <AppText variant="caption" color="secondary">
              保质期：{product.shelf_life_text}
            </AppText>
          ) : null}
        </Surface>

        {/* 相容性状态 */}
        {summary ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">相容性状态</AppText>
            {summary.totalRelations > 0 ? (
              <>
                <View style={styles.summaryRow}>
                  {summary.criticalCount > 0 ? (
                    <SemanticBadge label={`${summary.criticalCount} 严重`} tone="critical" />
                  ) : null}
                  {summary.attentionCount > 0 ? (
                    <SemanticBadge label={`${summary.attentionCount} 注意`} tone="attention" />
                  ) : null}
                  {summary.needsInformationCount > 0 ? (
                    <SemanticBadge label={`${summary.needsInformationCount} 待补充`} tone="unknown" />
                  ) : null}
                </View>
                {detail.changedRelations && detail.changedRelations.length > 0 ? (
                  <View style={styles.bulletList}>
                    {detail.changedRelations.map((rel, i) => (
                      <AppText key={i} variant="caption" color="secondary">
                        · {rel.title}{rel.recommendedAction ? `——${rel.recommendedAction}` : ''}
                      </AppText>
                    ))}
                  </View>
                ) : null}
              </>
            ) : (
              <AppText variant="caption" color="muted">
                当前未发现已登记禁忌
              </AppText>
            )}
          </Surface>
        ) : null}

        {/* 元信息 */}
        <Surface variant="plain" style={styles.meta}>
          <AppText variant="caption" color="muted">
            创建于 {new Date(product.created_at).toLocaleDateString('zh-CN')}
          </AppText>
          <AppText variant="caption" color="muted">
            更新于 {new Date(product.updated_at).toLocaleDateString('zh-CN')}
          </AppText>
          <AppText variant="caption" color="muted">
            版本 v{product.revision}
          </AppText>
        </Surface>

        {/* 操作按钮 */}
        <View style={styles.actions}>
          <AppButton label="编辑" variant="primary" onPress={handleEdit} />
          <AppButton label="重新扫描" variant="secondary" onPress={handleRescan} />
          <AppButton
            label="删除"
            variant="danger"
            onPress={() => setDeleteDialogVisible(true)}
          />
        </View>
      </ScreenScroll>

      {/* 删除确认对话框 */}
      <AppDialog
        visible={deleteDialogVisible}
        title="确认删除"
        description={`确定要删除"${product.name}"吗？此操作不可撤销。`}
        variant="destructive"
        confirmLabel={deleting ? '删除中…' : '删除'}
        onConfirm={handleDelete}
        onCancel={() => {
          deleteOperationIdRef.current = null;
          setDeleteDialogVisible(false);
        }}
      />
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({

  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  headerCard: {
    gap: rawTokens.space[1],
    marginBottom: rawTokens.space[4],
    alignItems: 'center',
  },
  photoContainer: {
    marginBottom: rawTokens.space[3],
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[2],
  },
  section: {
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[3],
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
  },
  bulletList: {
    gap: rawTokens.space[1],
  },
  dateRow: {
    flexDirection: 'row',
    gap: rawTokens.space[4],
  },
  dateItem: {
    flex: 1,
    gap: rawTokens.space[1],
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.page,
  },
  summaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[1],
  },
  meta: {
    gap: rawTokens.space[1],
    padding: rawTokens.space[3],
    borderTopWidth: componentTokens.surface.borderWidth,
    borderTopColor: semanticColors.border.subtle,
  },
  actions: {
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[4],
    marginBottom: rawTokens.space[6],
    paddingTop: rawTokens.space[4],
    borderTopWidth: componentTokens.surface.borderWidth,
    borderTopColor: semanticColors.border.subtle,
  },
});
