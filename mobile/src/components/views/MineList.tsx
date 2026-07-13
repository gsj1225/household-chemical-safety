/**
 * 结果页 - 雷点列表组件
 */

import React from 'react';
import { Linking, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { colors, riskLevelColor } from '../../theme/colors';
import { fontSize, spacing, borderRadius } from '../../theme/spacing';
import type { MineSummary } from '../../types';

interface MineListProps {
  mines: MineSummary[];
  breakdown: { critical: number; medium: number; low: number };
}

export default function MineList({ mines, breakdown }: MineListProps) {
  return (
    <>
      <View style={styles.breakdownCard}>
        <Text style={styles.sectionTitle}>雷点分布</Text>
        <View style={styles.breakdownRow}>
          <BreakdownItem label="高危" count={breakdown.critical} color={colors.critical} />
          <BreakdownItem label="中危" count={breakdown.medium} color={colors.medium} />
          <BreakdownItem label="低危" count={breakdown.low} color={colors.low} />
        </View>
      </View>

      <View style={styles.mineListSection}>
        <Text style={styles.sectionTitle}>雷点详情</Text>
        {mines.map((mine, i) => (
          <View key={i} style={styles.mineItem}>
            <View style={[styles.mineLevelDot, { backgroundColor: riskLevelColor[mine.level] || colors.medium }]} />
            <View style={styles.mineInfo}>
              <Text style={styles.mineType}>{mine.type}</Text>
              <Text style={styles.mineProducts}>{mine.products.join(' + ')}</Text>
              {mine.confirmed_by_user && (
                <Text style={styles.confirmedText}>✓ 产品信息经用户确认</Text>
              )}
              <Text style={styles.mineDesc}>{mine.description}</Text>
              <Text style={styles.mineAdvice}>建议：{mine.advice}</Text>
              <Text style={[styles.evidenceStatus, mine.evidence_status === 'verified' ? styles.verified : styles.review]}>
                {mine.evidence_status === 'verified' ? '✓ 权威资料支持' : '△ 资料待复核'}
              </Text>
              {(mine.sources ?? []).map((source) => (
                <TouchableOpacity key={source.url} onPress={() => void Linking.openURL(source.url)}>
                  <Text style={styles.sourceLink}>{source.organization}：{source.title}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

function BreakdownItem({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <View style={styles.breakdownItem}>
      <View style={[styles.breakdownDot, { backgroundColor: color }]} />
      <Text style={styles.breakdownCount}>{count}</Text>
      <Text style={styles.breakdownLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  breakdownCard: {
    backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: fontSize.md, fontWeight: 'bold',
    color: colors.textPrimary, marginBottom: spacing.md,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-around' },
  breakdownItem: { alignItems: 'center' },
  breakdownDot: { width: 16, height: 16, borderRadius: 8, marginBottom: spacing.xs },
  breakdownCount: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textPrimary },
  breakdownLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  mineListSection: { marginBottom: spacing.lg },
  mineItem: {
    flexDirection: 'row', backgroundColor: colors.bgSecondary,
    borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.sm,
  },
  mineLevelDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, marginRight: spacing.md },
  mineInfo: { flex: 1 },
  mineType: { fontSize: fontSize.sm, fontWeight: '600', color: colors.textSecondary },
  mineProducts: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.textPrimary, marginTop: 2 },
  confirmedText: { color: colors.safe, fontSize: fontSize.xs, fontWeight: '600', marginTop: spacing.xs },
  mineDesc: { fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 22, marginTop: spacing.xs },
  mineAdvice: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs, lineHeight: 20 },
  evidenceStatus: { fontSize: fontSize.xs, fontWeight: 'bold', marginTop: spacing.sm },
  verified: { color: colors.safe },
  review: { color: colors.medium },
  sourceLink: { color: colors.primary, fontSize: fontSize.xs, lineHeight: 18, marginTop: spacing.xs },
});
