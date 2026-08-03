import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from 'react-native';
import { componentTokens, semanticColors } from '../../theme/tokens';

type IconButtonVariant = 'default' | 'destructive';

interface IconButtonProps extends Omit<PressableProps, 'children' | 'disabled' | 'style'> {
  /** 图标节点 */
  icon: React.ReactNode;
  /** 可访问名称（必需，给屏幕阅读器朗读） */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  loading?: boolean;
  disabled?: boolean;
}

export default function IconButton({
  icon,
  accessibilityLabel,
  variant = 'default',
  loading = false,
  disabled = false,
  ...props
}: IconButtonProps) {
  const unavailable = disabled || loading;

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: unavailable, busy: loading }}
      disabled={unavailable}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !unavailable ? styles[`${variant}Pressed`] : undefined,
        unavailable ? styles.disabled : undefined,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'destructive'
            ? semanticColors.status.error
            : semanticColors.action.primary}
        />
      ) : (
        icon
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: componentTokens.button.compactMinHeight,
    height: componentTokens.button.compactMinHeight,
    borderRadius: componentTokens.button.radius,
    alignItems: 'center',
    justifyContent: 'center',
  },
  default: {
    backgroundColor: 'transparent',
  },
  defaultPressed: {
    backgroundColor: semanticColors.surface.muted,
  },
  destructive: {
    backgroundColor: 'transparent',
  },
  destructivePressed: {
    backgroundColor: semanticColors.surface.errorSubtle,
  },
  disabled: {
    opacity: 0.4,
  },
});
