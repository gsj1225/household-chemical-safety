import React from 'react';
import { Text, type TextProps, type TextStyle } from 'react-native';
import { semanticColors, typographyTokens } from '../../theme/tokens';

type TextVariant = keyof typeof typographyTokens;
type TextColor = keyof typeof semanticColors.text;

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
}

export default function AppText({
  variant = 'body',
  color = 'primary',
  align,
  style,
  ...props
}: AppTextProps) {
  return (
    <Text
      {...props}
      accessibilityRole={props.accessibilityRole ?? (variant.startsWith('title') ? 'header' : undefined)}
      style={[
        typographyTokens[variant],
        { color: semanticColors.text[color] },
        align ? { textAlign: align } : undefined,
        style,
      ]}
    />
  );
}
