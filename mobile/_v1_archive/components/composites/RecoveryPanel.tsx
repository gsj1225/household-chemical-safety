import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { componentTokens, rawTokens, semanticColors } from '../../theme/tokens';
import { AppButton, AppText, Surface } from '../primitives';

export interface RecoveryAction {
  label: string;
  onPress: () => void;
  loading?: boolean;
  accessibilityHint: string;
}

interface RecoveryPanelProps extends Omit<ViewProps, 'children'> {
  title: string;
  description: string;
  traceId?: string;
  primaryAction: RecoveryAction;
  secondaryAction?: RecoveryAction;
  tertiaryAction?: RecoveryAction;
  announceKey: string;
}

export default function RecoveryPanel({
  title,
  description,
  traceId,
  primaryAction,
  secondaryAction,
  tertiaryAction,
  announceKey,
  style,
  ...props
}: RecoveryPanelProps) {
  return (
    <Surface
      {...props}
      variant="outlined"
      style={[styles.container, style]}
    >
      <View style={styles.messageRow}>
        <View
          accessible={false}
          importantForAccessibility="no"
          style={styles.mark}
        >
          <AppText
            variant="titleSmall"
            color="error"
            align="center"
            style={styles.markText}
          >
            !
          </AppText>
        </View>

        <View
          key={announceKey}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={`${title}。${description}`}
          style={styles.copy}
        >
          <AppText variant="titleSmall">{title}</AppText>
          <AppText variant="label" color="secondary">
            {description}
          </AppText>
        </View>
      </View>

      {traceId ? (
        <AppText
          variant="caption"
          color="muted"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          追踪号：{traceId}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          label={primaryAction.label}
          loading={primaryAction.loading}
          onPress={primaryAction.onPress}
          accessibilityHint={primaryAction.accessibilityHint}
        />
        {secondaryAction ? (
          <AppButton
            label={secondaryAction.label}
            variant="secondary"
            loading={secondaryAction.loading}
            onPress={secondaryAction.onPress}
            accessibilityHint={secondaryAction.accessibilityHint}
          />
        ) : null}
        {tertiaryAction ? (
          <AppButton
            label={tertiaryAction.label}
            variant="quiet"
            loading={tertiaryAction.loading}
            onPress={tertiaryAction.onPress}
            accessibilityHint={tertiaryAction.accessibilityHint}
          />
        ) : null}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: componentTokens.recoveryPanel.gap,
    padding: componentTokens.recoveryPanel.padding,
    borderWidth: componentTokens.recoveryPanel.borderWidth,
    borderColor: semanticColors.border.strong,
    backgroundColor: semanticColors.surface.page,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rawTokens.space[3],
  },
  mark: {
    width: componentTokens.recoveryPanel.iconSize,
    height: componentTokens.recoveryPanel.iconSize,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: componentTokens.surface.strongBorderWidth,
    borderColor: semanticColors.status.error,
  },
  markText: {
    fontWeight: '800',
  },
  copy: {
    flex: 1,
    gap: rawTokens.space[1],
  },
  actions: {
    gap: rawTokens.space[2],
  },
});
