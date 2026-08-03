import React from 'react';
import {
  ScrollView,
  StyleSheet,
  type ScrollViewProps,
} from 'react-native';
import { rawTokens } from '../../theme/tokens';

type ScrollVariant = 'list' | 'form' | 'detail';

interface ScreenScrollProps extends ScrollViewProps {
  variant?: ScrollVariant;
  /** 底部安全间距（避免被TabBar/FAB遮挡） */
  bottomInset?: number;
}

const variantPadding: Record<ScrollVariant, { horizontal: number; top: number }> = {
  list: { horizontal: rawTokens.space[3], top: rawTokens.space[2] },
  form: { horizontal: rawTokens.space[4], top: rawTokens.space[4] },
  detail: { horizontal: rawTokens.space[4], top: rawTokens.space[3] },
};

export default function ScreenScroll({
  variant = 'list',
  bottomInset = rawTokens.space[6],
  children,
  contentContainerStyle,
  ...props
}: ScreenScrollProps) {
  const pad = variantPadding[variant];

  return (
    <ScrollView
      {...props}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: pad.horizontal,
          paddingTop: pad.top,
          paddingBottom: bottomInset,
        },
        contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
});
