import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { componentTokens, semanticColors } from '../../theme/tokens';
import AppText from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

interface AppButtonProps extends Omit<PressableProps, 'children' | 'disabled' | 'style'> {
  label: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  leading?: React.ReactNode;
  /** 透传到 Pressable 的布局样式（如 flex，用于均匀铺满） */
  style?: StyleProp<ViewStyle>;
}

export default function AppButton({
  label,
  variant = 'primary',
  loading = false,
  disabled = false,
  leading,
  accessibilityLabel,
  style: customStyle,
  ...props
}: AppButtonProps) {
  const unavailable = disabled || loading;
  const foreground = unavailable
    ? 'muted'
    : variant === 'primary' || variant === 'danger'
      ? 'onAction'
      : 'action';

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !unavailable ? styles[`${variant}Pressed`] : undefined,
        unavailable ? styles.disabled : undefined,
        customStyle,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' || variant === 'danger'
            ? semanticColors.text.onAction
            : semanticColors.action.primary}
        />
      ) : (
        <View style={styles.content}>
          {leading}
          <AppText variant="label" color={foreground}>{label}</AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: componentTokens.button.minHeight,
    borderRadius: componentTokens.button.radius,
    paddingHorizontal: componentTokens.button.horizontalPadding,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: componentTokens.button.gap,
  },
  primary: {
    backgroundColor: semanticColors.action.primary,
  },
  primaryPressed: {
    backgroundColor: semanticColors.action.primaryPressed,
  },
  secondary: {
    backgroundColor: semanticColors.surface.page,
    borderColor: semanticColors.action.primary,
  },
  secondaryPressed: {
    backgroundColor: semanticColors.action.secondaryPressed,
  },
  quiet: {
    minHeight: componentTokens.button.compactMinHeight,
    backgroundColor: 'transparent',
  },
  quietPressed: {
    backgroundColor: semanticColors.surface.muted,
  },
  danger: {
    backgroundColor: semanticColors.status.error,
  },
  dangerPressed: {
    opacity: 0.86,
  },
  disabled: {
    backgroundColor: semanticColors.action.disabledBackground,
    borderColor: semanticColors.action.disabledBackground,
    opacity: 1,
  },
});
