import React from 'react';
import { StyleSheet, View } from 'react-native';
import { componentTokens } from '../../theme/tokens';
import { AppText, StatusBadge, Surface } from '../primitives';

interface ProgressSummaryProps {
  current: number;
  total: number;
  mineCount: number;
}

export default function ProgressSummary({
  current,
  total,
  mineCount,
}: ProgressSummaryProps) {
  const safeTotal = Math.max(0, total);
  const safeCurrent = safeTotal === 0
    ? 0
    : Math.min(Math.max(1, current), safeTotal);

  return (
    <Surface
      variant="subtle"
      style={styles.container}
      accessibilityLabel={`当前细拍区域 ${safeCurrent}，共 ${safeTotal} 个区域；已发现 ${mineCount} 个雷点`}
    >
      <View style={styles.copy}>
        <AppText variant="caption" color="secondary">当前进度</AppText>
        <AppText variant="titleSmall">
          区域 {safeCurrent} / {safeTotal}
        </AppText>
      </View>
      <StatusBadge
        label={`已发现 ${mineCount} 个雷点`}
        tone="neutral"
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: componentTokens.progressSummary.gap,
    padding: componentTokens.progressSummary.padding,
  },
  copy: {
    flexShrink: 1,
  },
});
