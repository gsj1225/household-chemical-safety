import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { componentTokens, semanticColors } from '../../theme/tokens';

type SurfaceVariant = 'plain' | 'subtle' | 'outlined' | 'inverse';

interface SurfaceProps extends ViewProps {
  variant?: SurfaceVariant;
  padded?: boolean;
}

export default function Surface({
  variant = 'plain',
  padded = true,
  style,
  ...props
}: SurfaceProps) {
  return (
    <View
      {...props}
      style={[
        styles.base,
        styles[variant],
        padded ? styles.padded : undefined,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: componentTokens.surface.radius,
  },
  padded: {
    padding: componentTokens.surface.padding,
  },
  plain: {
    backgroundColor: semanticColors.surface.page,
  },
  subtle: {
    backgroundColor: semanticColors.surface.subtle,
  },
  outlined: {
    backgroundColor: semanticColors.surface.page,
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.default,
  },
  inverse: {
    backgroundColor: semanticColors.surface.inverse,
  },
});
