/**
 * 结果页 - 评分展示组件
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../primitives';
import { ChemicalProfileCard } from '../composites';
import { selectChemicalProfile } from '../../utils/chemicalProfile';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../../theme/tokens';

interface ScoreDisplayProps {
  score: number;
  totalMines: number;
  safeItems: number;
  sceneLabel: string;
}

export default function ScoreDisplay({
  score,
  totalMines,
  safeItems,
  sceneLabel,
}: ScoreDisplayProps) {
  const profile = selectChemicalProfile(score, totalMines);
  const conclusion = totalMines === 0
    ? '本轮没有\n命中规则'
    : `还有 ${totalMines} 处\n需要注意`;
  const totalChecked = totalMines + safeItems;

  return (
    <View style={styles.container}>
      <View style={styles.reportHead}>
        <View
          style={styles.scoreRing}
          accessible
          accessibilityLabel={`规则评分 ${score} 分，满分 100 分`}
        >
          <AppText variant="display">{score}</AppText>
        </View>
        <View style={styles.conclusion}>
          <AppText variant="caption" style={styles.completed}>
            ✓ 检查完成
          </AppText>
          <AppText variant="titleSmall">{conclusion}</AppText>
          <AppText variant="caption" color="secondary">
            {sceneLabel || '当前场景'} · 基于本次照片识别与现有规则生成
          </AppText>
        </View>
      </View>

      <ChemicalProfileCard label={profile.label} note={profile.note} />

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <AppText variant="titleSmall">{totalMines}</AppText>
          <AppText variant="caption" color="secondary">雷点</AppText>
        </View>
        <View style={styles.statItem}>
          <AppText variant="titleSmall">{safeItems}</AppText>
          <AppText variant="caption" color="secondary">当前未命中</AppText>
        </View>
        <View style={[styles.statItem, styles.statItemLast]}>
          <AppText variant="titleSmall">{totalChecked}</AppText>
          <AppText variant="caption" color="secondary">已检查</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[4],
  },
  reportHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[4],
  },
  scoreRing: {
    width: componentTokens.report.scoreRingSize,
    height: componentTokens.report.scoreRingSize,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: componentTokens.report.scoreRingBorderWidth,
    borderColor: semanticColors.border.strong,
  },
  conclusion: {
    flex: 1,
    gap: rawTokens.space[2],
  },
  completed: {
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    overflow: 'hidden',
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.strong,
    borderRadius: componentTokens.surface.radius,
  },
  statItem: {
    flex: 1,
    minHeight: componentTokens.report.statMinHeight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: rawTokens.space[1],
    paddingHorizontal: rawTokens.space[1],
    borderRightWidth: componentTokens.surface.borderWidth,
    borderRightColor: semanticColors.border.strong,
  },
  statItemLast: {
    borderRightWidth: 0,
  },
});
