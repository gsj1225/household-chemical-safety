import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import {
  componentTokens,
  semanticColors,
} from '../../theme/tokens';
import AppText from './AppText';

export type StatusBadgeTone = 'neutral' | 'info' | 'warning' | 'error' | 'success';

interface StatusBadgeProps extends ViewProps {
  label: string;
  tone?: StatusBadgeTone;
}

const toneIcon: Record<StatusBadgeTone, string> = {
  neutral: '•',
  info: 'i',
  warning: '!',
  error: '×',
  success: '✓',
};

export default function StatusBadge({
  label,
  tone = 'neutral',
  style,
  accessibilityLabel,
  ...props
}: StatusBadgeProps) {
  const textColor = tone === 'neutral' ? 'secondary' : tone;

  return (
    <View
      {...props}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.base, styles[tone], style]}
    >
      <AppText variant="caption" color={textColor} style={styles.icon}>
        {toneIcon[tone]}
      </AppText>
      <AppText variant="caption" color={textColor} style={styles.label}>
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
  neutral: {
    backgroundColor: semanticColors.surface.muted,
  },
  info: {
    backgroundColor: semanticColors.surface.infoSubtle,
  },
  warning: {
    backgroundColor: semanticColors.surface.warningSubtle,
  },
  error: {
    backgroundColor: semanticColors.surface.errorSubtle,
  },
  success: {
    backgroundColor: semanticColors.surface.successSubtle,
  },
  icon: {
    fontWeight: '700',
  },
  label: {
    fontWeight: '600',
    flexShrink: 1,
  },
});
