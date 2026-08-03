/**
 * RelationDetailScreen — 相容性关系详情
 *
 * F6: 展示单个相容性关系的完整信息：
 * 标题、类型、严重等级、原理说明、建议操作、证据来源。
 */

import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Linking, Pressable } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { rawTokens, semanticColors } from '../theme/tokens';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import SemanticBadge from '../components/primitives/SemanticBadge';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import Surface from '../components/primitives/Surface';
import { compatibilityApi } from '../services/compatibilityApi';
import { inventoryApi } from '../services/inventoryApi';
import type { InventoryProduct } from '../types/inventory';
import { toRelationVM, type RelationVM } from '../view-models/compatibility';
import type { RootStackParamList } from '../types';

export default function RelationDetailScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'RelationDetail'>>();
  const navigation = useNavigation<any>();
  const { relationId } = route.params;

  const [relation, setRelation] = useState<RelationVM | null>(null);
  const [productMap, setProductMap] = useState<Record<string, InventoryProduct>>({});
  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      try {
        const [raw, productsResponse] = await Promise.all([
          compatibilityApi.getRelationDetail(relationId),
          inventoryApi.list({ limit: 500 }),
        ]);
        if (cancelled) return;
        const pMap: Record<string, InventoryProduct> = {};
        for (const p of productsResponse.items) {
          pMap[p.productId] = p;
        }
        setProductMap(pMap);
        setRelation(toRelationVM(raw));
        setLoadState('success');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : '加载失败');
        setLoadState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [relationId]);

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      // 无法打开链接
    }
  }, []);

  if (loadState === 'loading') {
    return (
      <View style={styles.screen}>
        <View style={styles.centering}>
          <StateMessage title="加载中" description="正在获取关系详情…" tone="neutral" />
        </View>
      </View>
    );
  }

  if (loadState === 'error' || !relation) {
    return (
      <View style={styles.screen}>
        <View style={styles.centering}>
          <StateMessage
            title="加载失败"
            description={errorMessage ?? '关系不存在'}
            tone="error"
            actions={
              <AppButton label="返回" variant="secondary" onPress={() => navigation.goBack()} />
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <AppText variant="titleSmall">关系详情</AppText>
        <AppButton label="返回" variant="quiet" onPress={() => navigation.goBack()} />
      </View>

      <ScreenScroll variant="detail">
        {/* 标题与徽章 */}
        <View style={styles.titleSection}>
          <AppText variant="title">{relation.title}</AppText>
          <View style={styles.badgeRow}>
            <SemanticBadge
              label={relation.severityLabel}
              tone={severityToTone(relation.severity)}
            />
            <SemanticBadge label={relation.relationTypeLabel} tone="info" />
            <SemanticBadge label={relation.evidenceStatusLabel} tone="neutral" />
          </View>
        </View>

        {/* 涉及产品 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">涉及产品</AppText>
          <View style={styles.productRow}>
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: relation.productAId })}
            >
              <View style={styles.productChip}>
                <AppText variant="label" color="primary" style={styles.link}>
                  {productMap[relation.productAId]?.name ?? '产品 A'}
                </AppText>
                {productMap[relation.productAId]?.brand ? (
                  <AppText variant="caption" color="secondary">
                    {productMap[relation.productAId].brand}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
            <AppText variant="caption" color="muted">⇄</AppText>
            <Pressable
              onPress={() => navigation.navigate('ProductDetail', { productId: relation.productBId })}
            >
              <View style={styles.productChip}>
                <AppText variant="label" color="primary" style={styles.link}>
                  {productMap[relation.productBId]?.name ?? '产品 B'}
                </AppText>
                {productMap[relation.productBId]?.brand ? (
                  <AppText variant="caption" color="secondary">
                    {productMap[relation.productBId].brand}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          </View>
        </Surface>

        {/* 原理说明 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">原理说明</AppText>
          <AppText variant="body" color="secondary">
            {relation.rationale}
          </AppText>
        </Surface>

        {/* 建议操作 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">建议操作</AppText>
          <AppText variant="body" color="secondary">
            {relation.recommendedAction}
          </AppText>
        </Surface>

        {/* 证据来源 */}
        {relation.sources.length > 0 ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label">证据来源</AppText>
            <View style={styles.sourceList}>
              {relation.sources.map((src, i) => (
                <View key={i} style={styles.sourceItem}>
                  <AppText variant="label">
                    {src.organization}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {src.title}
                  </AppText>
                  {src.url ? (
                    <Pressable onPress={() => handleOpenUrl(src.url!)}>
                      <AppText variant="caption" color="primary" style={styles.link}>
                        {src.url}
                      </AppText>
                    </Pressable>
                  ) : null}
                  {src.reviewed_at ? (
                    <AppText variant="caption" color="muted">
                      审核日期：{new Date(src.reviewed_at).toLocaleDateString('zh-CN')}
                    </AppText>
                  ) : null}
                </View>
              ))}
            </View>
          </Surface>
        ) : null}

        {/* 规则信息 */}
        <Surface variant="subtle" style={styles.section}>
          <AppText variant="label">规则信息</AppText>
          <View style={styles.ruleRow}>
            <AppText variant="caption" color="muted">规则ID</AppText>
            <AppText variant="caption" color="secondary">
              {relation.ruleId ?? '—'}
            </AppText>
          </View>
          <View style={styles.ruleRow}>
            <AppText variant="caption" color="muted">规则版本</AppText>
            <AppText variant="caption" color="secondary">
              {relation.ruleVersion}
            </AppText>
          </View>
          <View style={styles.ruleRow}>
            <AppText variant="caption" color="muted">更新时间</AppText>
            <AppText variant="caption" color="secondary">
              {relation.updatedAtDisplay}
            </AppText>
          </View>
        </Surface>
      </ScreenScroll>
    </View>
  );
}

function severityToTone(severity: string): 'critical' | 'attention' | 'info' | 'unknown' {
  switch (severity) {
    case 'critical': return 'critical';
    case 'attention': return 'attention';
    case 'info': return 'info';
    default: return 'unknown';
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
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
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  titleSection: {
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[4],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
  },
  section: {
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[3],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
    flexWrap: 'wrap',
  },
  productChip: {
    gap: rawTokens.space[1],
    padding: rawTokens.space[2],
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.subtle,
  },
  link: {
    textDecorationLine: 'underline',
  },
  sourceList: {
    gap: rawTokens.space[3],
  },
  sourceItem: {
    gap: rawTokens.space[1],
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
