/**
 * CompatibilityScreen — 相容性列表
 *
 * F6: 展示所有相容性关系，按严重等级排序。
 * 支持严重等级筛选，点击关系进入详情。
 */

import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { rawTokens, semanticColors, componentTokens } from '../theme/tokens';
import ScreenSafeArea from '../components/primitives/ScreenSafeArea';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import SemanticBadge from '../components/primitives/SemanticBadge';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import Surface from '../components/primitives/Surface';
import useReducedMotion from '../hooks/useReducedMotion';
import {
  useCompatibilityStore,
  selectFilteredRelations,
  selectCompatibilityView,
} from '../store/compatibilityStore';
import { toCompatibilityOverviewVM } from '../view-models/compatibility';
import type { Severity } from '../types/compatibility';

const SEVERITY_FILTERS: { value: 'all' | Severity; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'critical', label: '严重' },
  { value: 'attention', label: '注意' },
  { value: 'unknown', label: '未知' },
];

export default function CompatibilityScreen() {
  const navigation = useNavigation<any>();
  const {
    summary,
    loadState,
    errorMessage,
    severityFilter,
    load,
    loadSummary,
    setSeverityFilter,
    productMap,
  } = useCompatibilityStore();

  const viewState = useCompatibilityStore(selectCompatibilityView);
  const reducedMotion = useReducedMotion();
  const filteredRelations = useCompatibilityStore(selectFilteredRelations);

  useEffect(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  const handlePressRelation = useCallback(
    (relationId: string) => {
      navigation.navigate('RelationDetail', { relationId });
    },
    [navigation],
  );

  const handleRetry = useCallback(() => {
    load();
    loadSummary();
  }, [load, loadSummary]);

  const overview = summary ? toCompatibilityOverviewVM(summary) : null;

  return (
    <ScreenSafeArea>
      <View style={styles.header}>
        <AppText variant="title">相容性</AppText>
        <AppButton label="返回" variant="quiet" onPress={() => navigation.goBack()} />
      </View>

      <ScreenScroll variant="list">
        {/* 概览卡片 */}
        {overview ? (
          <Surface variant="subtle" style={styles.overviewCard}>
            <View style={styles.overviewHeader}>
              <AppText variant="titleSmall">{overview.statusLabel}</AppText>
              <SemanticBadge
                label={
                  overview.isClean ? '未发现已登记禁忌' :
                  overview.hasConflict ? '有冲突' : '待补充'
                }
                tone={
                  overview.isClean ? 'neutral' :
                  overview.hasConflict ? 'critical' : 'attention'
                }
              />
            </View>
            <AppText variant="caption" color="secondary">
              {overview.boundaryNotice}
            </AppText>
            <View style={styles.overviewStats}>
              <StatBlock label="产品" value={overview.totalProducts} />
              <StatBlock label="关系" value={overview.totalRelations} />
              {overview.criticalCount > 0 ? (
                <StatBlock label="严重" value={overview.criticalCount} tone="critical" />
              ) : null}
              {overview.attentionCount > 0 ? (
                <StatBlock label="注意" value={overview.attentionCount} tone="attention" />
              ) : null}
            </View>
          </Surface>
        ) : null}

        {/* 筛选条 */}
        <View style={styles.filterBar}>
          {SEVERITY_FILTERS.map((f) => (
            <AppButton
              key={f.value}
              label={f.label}
              variant={severityFilter === f.value ? 'primary' : 'secondary'}
              onPress={() => setSeverityFilter(f.value)}
            />
          ))}
        </View>

        {/* 内容区域 */}
        {viewState === 'loading' ? (
          <View style={styles.centering}>
            <StateMessage title="加载中" description="正在获取相容性数据…" tone="neutral" />
          </View>
        ) : null}

        {viewState === 'error' ? (
          <View style={styles.centering}>
            <StateMessage
              title="加载失败"
              description={errorMessage ?? '请检查网络后重试'}
              tone="error"
              actions={<AppButton label="重试" variant="secondary" onPress={handleRetry} />}
            />
          </View>
        ) : null}

        {viewState === 'empty' ? (
          <View style={styles.centering}>
            <StateMessage
              title="暂无相容性关系"
              description="添加更多产品后，系统将自动检测成分间的相容性"
              tone="neutral"
            />
          </View>
        ) : null}

        {viewState === 'content' ? (
          <View style={styles.relationList}>
            {filteredRelations.map((rel) => (
              <Pressable
                key={rel.relationId}
                onPress={() => handlePressRelation(rel.relationId)}
                style={({ pressed }) => pressed && (reducedMotion ? styles.pressedReduced : styles.pressed)}
              >
                <Surface variant="outlined" style={styles.relationCard}>
                  <View style={styles.relationHeader}>
                    <SemanticBadge label={rel.severityLabel} tone={severityToTone(rel.severity)} />
                    <SemanticBadge label={rel.relationTypeLabel} tone="info" />
                  </View>
                  <View style={styles.productPair}>
                    <AppText variant="label" numberOfLines={1}>
                      {productMap[rel.productAId]?.name ?? rel.productAId}
                    </AppText>
                    <AppText variant="caption" color="muted">×</AppText>
                    <AppText variant="label" numberOfLines={1}>
                      {productMap[rel.productBId]?.name ?? rel.productBId}
                    </AppText>
                  </View>
                  <AppText variant="caption" color="secondary" numberOfLines={2}>
                    {rel.rationale}
                  </AppText>
                  <View style={styles.relationFooter}>
                    <AppText variant="caption" color="muted">
                      {rel.evidenceStatusLabel}
                    </AppText>
                    <AppText variant="caption" color="muted">
                      {rel.updatedAtDisplay}
                    </AppText>
                  </View>
                </Surface>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScreenScroll>
    </ScreenSafeArea>
  );
}

// ── 辅助组件 ──────────────────────────────────────

function StatBlock({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: 'critical' | 'attention';
}) {
  const color = tone === 'critical' ? 'error' : tone === 'attention' ? 'warning' : 'primary';
  return (
    <View style={styles.statBlock}>
      <AppText variant="caption" color="muted">{label}</AppText>
      <AppText variant="titleSmall" color={color}>{value}</AppText>
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

// ── 样式 ──────────────────────────────────────────

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
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  overviewCard: {
    gap: rawTokens.space[3],
    marginBottom: rawTokens.space[3],
  },
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  overviewStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[4],
  },
  statBlock: {
    gap: rawTokens.space[1],
  },
  filterBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[3],
  },
  relationList: {
    gap: rawTokens.space[3],
    paddingBottom: rawTokens.space[6],
  },
  relationCard: {
    gap: rawTokens.space[2],
    borderRadius: componentTokens.surface.radius,
    ...componentTokens.elevation.card,
  },
  productPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[2],
    flexWrap: 'wrap',
  },
  relationHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
  },
  relationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: rawTokens.space[1],
  },
  pressed: {
    ...componentTokens.interaction.cardPressed,
  },
  pressedReduced: {
    ...componentTokens.interaction.cardPressedReduced,
  },
});
