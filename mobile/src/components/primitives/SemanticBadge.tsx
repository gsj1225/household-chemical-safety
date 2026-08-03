import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import {
  componentTokens,
  semanticColors,
} from '../../theme/tokens';
import AppText from './AppText';

/**
 * 语义徽章——使用 v2 领域语义色名
 *
 * 与 StatusBadge 的区别：
 * - StatusBadge 使用通用状态色（neutral/info/warning/error/success）
 * - SemanticBadge 使用 v2 领域语义色（critical/attention/info/positive/unknown/neutral）
 *   对应相容性关系中的 severity 和 evidence 概念
 */
export type SemanticTone =
  | 'critical'
  | 'attention'
  | 'info'
  | 'positive'
  | 'unknown'
  | 'neutral';

interface SemanticBadgeProps extends ViewProps {
  label: string;
  tone?: SemanticTone;
}

const toneConfig: Record<
  SemanticTone,
  { bg: string; fg: keyof typeof semanticColors.text; symbol: string }
> = {
  critical: {
    bg: semanticColors.surface.errorSubtle,
    fg: 'error',
    symbol: '×',
  },
  attention: {
    bg: semanticColors.surface.warningSubtle,
    fg: 'warning',
    symbol: '!',
  },
  info: {
    bg: semanticColors.surface.infoSubtle,
    fg: 'info',
    symbol: 'i',
  },
  positive: {
    bg: semanticColors.surface.successSubtle,
    fg: 'success',
    symbol: '✓',
  },
  unknown: {
    bg: semanticColors.surface.muted,
    fg: 'muted',
    symbol: '?',
  },
  neutral: {
    bg: semanticColors.surface.muted,
    fg: 'secondary',
    symbol: '•',
  },
};

export default function SemanticBadge({
  label,
  tone = 'neutral',
  style,
  accessibilityLabel,
  ...props
}: SemanticBadgeProps) {
  const config = toneConfig[tone];

  return (
    <View
      {...props}
      accessible
      accessibilityLabel={accessibilityLabel ?? `${tone}: ${label}`}
      style={[styles.base, { backgroundColor: config.bg }, style]}
    >
      <AppText variant="caption" color={config.fg} style={styles.symbol}>
        {config.symbol}
      </AppText>
      <AppText variant="caption" color={config.fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: componentTokens.badge.minHeight,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: componentTokens.badge.gap,
    borderRadius: componentTokens.badge.radius,
    paddingHorizontal: componentTokens.badge.horizontalPadding,
    paddingVertical: componentTokens.badge.verticalPadding,
  },
  symbol: {
    fontWeight: '700',
  },
  label: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
