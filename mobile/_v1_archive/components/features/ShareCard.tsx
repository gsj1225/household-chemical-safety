import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ShareCardData } from '../../utils/shareCard';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../../theme/tokens';
import { AppText } from '../primitives';

interface ShareCardProps {
  data: ShareCardData;
}

const ShareCard = forwardRef<View, ShareCardProps>(function ShareCard({ data }, ref) {
  return (
    <View
      ref={ref}
      collapsable={false}
      style={styles.card}
      accessible
      accessibilityLabel={`${data.sceneLabel}家庭化学品检查结果，${data.score}分，${data.conclusion}，化学人格${data.profileLabel}`}
    >
      <View style={styles.header}>
        <AppText variant="caption" style={styles.kicker}>家庭化学品安全检查 / 结果档案</AppText>
        <View style={styles.indexMark}>
          <AppText variant="caption" color="inverse">01</AppText>
        </View>
      </View>

      <View style={styles.scoreSection}>
        <View style={styles.scoreRing}>
          <AppText variant="display">{data.score}</AppText>
          <AppText variant="caption" color="secondary">/ 100</AppText>
        </View>
        <View style={styles.conclusion}>
          <AppText variant="caption" style={styles.completed}>✓ 本场景检查完成</AppText>
          <AppText variant="titleSmall" numberOfLines={2}>{data.conclusion}</AppText>
          <AppText variant="caption" color="secondary" numberOfLines={1}>
            {data.sceneLabel} · 规则评分
          </AppText>
        </View>
      </View>

      <View style={styles.profile}>
        <AppText variant="caption" color="inverse" style={styles.profileKicker}>
          YOUR CHEMICAL TYPE
        </AppText>
        <AppText variant="titleSmall" color="inverse" numberOfLines={1}>
          {data.profileLabel}
        </AppText>
        <AppText variant="caption" color="inverse" numberOfLines={2} style={styles.profileNote}>
          {data.profileNote}
        </AppText>
      </View>

      <View style={styles.stats}>
        {[
          [data.totalMines, '雷点'],
          [data.safeItems, '当前未命中'],
          [data.totalChecked, '已检查'],
        ].map(([value, label], index) => (
          <View key={String(label)} style={[styles.stat, index === 2 && styles.statLast]}>
            <AppText variant="titleSmall">{value}</AppText>
            <AppText variant="caption" color="secondary">{label}</AppText>
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <AppText variant="label">! 检查备注</AppText>
        <AppText variant="caption" numberOfLines={2}>{data.riskSummary}</AppText>
        <AppText variant="caption" color="secondary" numberOfLines={2}>{data.disclaimer}</AppText>
      </View>

      <View style={styles.footer}>
        <View style={styles.rule} />
        <AppText variant="label" numberOfLines={1}>{data.invitation}</AppText>
        <AppText variant="caption" color="secondary" numberOfLines={1}>{data.privacyNote}</AppText>
      </View>
    </View>
  );
});

export default ShareCard;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    aspectRatio: componentTokens.shareCard.aspectRatio,
    maxWidth: componentTokens.shareCard.previewMaxWidth,
    alignSelf: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
    padding: componentTokens.shareCard.padding,
    backgroundColor: semanticColors.surface.page,
    borderColor: semanticColors.border.strong,
    borderWidth: componentTokens.shareCard.borderWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
  kicker: {
    flex: 1,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  indexMark: {
    width: rawTokens.space[8],
    height: rawTokens.space[8],
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: rawTokens.radius.round,
    backgroundColor: semanticColors.surface.inverse,
  },
  scoreSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[4],
  },
  scoreRing: {
    width: componentTokens.shareCard.scoreRingSize,
    height: componentTokens.shareCard.scoreRingSize,
    borderRadius: rawTokens.radius.round,
    borderWidth: componentTokens.shareCard.scoreRingBorderWidth,
    borderColor: semanticColors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  conclusion: {
    flex: 1,
    gap: rawTokens.space[1],
  },
  completed: {
    fontWeight: '700',
  },
  profile: {
    gap: rawTokens.space[1],
    paddingVertical: rawTokens.space[2],
    paddingHorizontal: rawTokens.space[3],
    backgroundColor: semanticColors.surface.inverse,
  },
  profileKicker: {
    opacity: 0.72,
    letterSpacing: 1,
  },
  profileNote: {
    opacity: 0.86,
  },
  stats: {
    flexDirection: 'row',
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.strong,
  },
  stat: {
    flex: 1,
    minHeight: componentTokens.shareCard.statMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: rawTokens.space[1],
    borderRightWidth: componentTokens.surface.borderWidth,
    borderRightColor: semanticColors.border.strong,
  },
  statLast: {
    borderRightWidth: 0,
  },
  summary: {
    gap: rawTokens.space[1],
    padding: rawTokens.space[2],
    borderWidth: componentTokens.shareCard.summaryBorderWidth,
    borderLeftWidth: componentTokens.shareCard.summaryAccentWidth,
    borderColor: semanticColors.border.strong,
  },
  footer: {
    gap: rawTokens.space[1],
  },
  rule: {
    height: componentTokens.shareCard.ruleWidth,
    marginBottom: rawTokens.space[1],
    backgroundColor: semanticColors.border.strong,
  },
});
