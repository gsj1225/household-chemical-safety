/**
 * 结果页 - 评分展示组件
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { fontSize, spacing, borderRadius } from '../../theme/spacing';

interface ScoreDisplayProps {
  score: number;
  level: string;
  totalMines: number;
  safeItems: number;
}

export default function ScoreDisplay({ score, level, totalMines, safeItems }: ScoreDisplayProps) {
  const scoreColor =
    score >= 70 ? colors.safe :
    score >= 50 ? colors.medium :
    colors.critical;

  return (
    <>
      <View style={styles.scoreArea}>
        <View style={[styles.scoreCircle, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreNumber, { color: scoreColor }]}>{score}</Text>
          <Text style={styles.scoreLabel}>排雷评分</Text>
        </View>
        <Text style={styles.levelText}>{level}</Text>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{totalMines}</Text>
          <Text style={styles.statLabel}>雷点</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statNumber, { color: colors.safe }]}>{safeItems}</Text>
          <Text style={styles.statLabel}>安全物品</Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  scoreArea: { alignItems: 'center', marginVertical: spacing.xl },
  scoreCircle: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 6, justifyContent: 'center', alignItems: 'center',
  },
  scoreNumber: { fontSize: fontSize.mega, fontWeight: 'bold' },
  scoreLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  levelText: {
    fontSize: fontSize.lg, fontWeight: '600',
    color: colors.textPrimary, textAlign: 'center', marginTop: spacing.lg,
  },
  statsRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg },
  statCard: {
    flex: 1, backgroundColor: colors.bgSecondary,
    borderRadius: borderRadius.lg, padding: spacing.lg, alignItems: 'center',
  },
  statNumber: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.critical },
  statLabel: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
});
