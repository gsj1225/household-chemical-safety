/**
 * 结果页 - 雷点列表组件
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RiskCard } from '../composites';
import { AppText, Surface } from '../primitives';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../../theme/tokens';
import type { MineSummary } from '../../types';

interface MineListProps {
  mines: MineSummary[];
  breakdown: { critical: number; medium: number; low: number };
}

export default function MineList({ mines, breakdown }: MineListProps) {
  return (
    <View style={styles.container}>
      <Surface variant="outlined" style={styles.breakdownCard}>
        <AppText variant="titleSmall">雷点分布</AppText>
        <View style={styles.breakdownRow}>
          <BreakdownItem code="H" label="高危" count={breakdown.critical} />
          <BreakdownItem code="M" label="中危" count={breakdown.medium} />
          <BreakdownItem code="L" label="低危" count={breakdown.low} />
        </View>
      </Surface>

      <View style={styles.mineListSection}>
        <View style={styles.sectionHeading}>
          <AppText variant="titleSmall">雷点详情</AppText>
          <AppText variant="caption" color="secondary">
            共 {mines.length} 条档案
          </AppText>
        </View>
        {mines.map((mine, i) => (
          <RiskCard
            key={`${mine.type}-${i}`}
            index={i + 1}
            level={mine.level}
            type={mine.type}
            products={mine.products}
            description={mine.description}
            advice={mine.advice}
            evidenceStatus={mine.evidence_status}
            sources={mine.sources}
            confirmedByUser={mine.confirmed_by_user}
          />
        ))}
      </View>
    </View>
  );
}

function BreakdownItem({
  code,
  label,
  count,
}: {
  code: string;
  label: string;
  count: number;
}) {
  return (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownCode}>
        <AppText variant="caption">{code}</AppText>
      </View>
      <AppText variant="titleSmall">{count}</AppText>
      <AppText variant="caption" color="secondary">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[5],
  },
  breakdownCard: {
    gap: rawTokens.space[4],
  },
  breakdownRow: {
    flexDirection: 'row',
    gap: rawTokens.space[3],
  },
  breakdownItem: {
    flex: 1,
    alignItems: 'center',
    gap: rawTokens.space[1],
    paddingVertical: rawTokens.space[3],
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.default,
    borderRadius: componentTokens.surface.radius,
  },
  breakdownCode: {
    minWidth: rawTokens.space[6],
    height: rawTokens.space[6],
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.strong,
  },
  mineListSection: {
    gap: rawTokens.space[4],
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: rawTokens.space[3],
  },
});
