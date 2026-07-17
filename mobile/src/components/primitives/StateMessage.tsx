import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { componentTokens } from '../../theme/tokens';
import AppText from './AppText';
import Surface from './Surface';

type StateTone = 'neutral' | 'error' | 'permission';

interface StateMessageProps extends ViewProps {
  title: string;
  description?: string;
  tone?: StateTone;
  actions?: React.ReactNode;
  accessibilityLiveRegion?: 'none' | 'polite' | 'assertive';
}

export default function StateMessage({
  title,
  description,
  tone = 'neutral',
  actions,
  accessibilityLiveRegion = 'polite',
  style,
  ...props
}: StateMessageProps) {
  return (
    <Surface
      {...props}
      variant={tone === 'neutral' ? 'subtle' : 'outlined'}
      accessibilityLiveRegion={accessibilityLiveRegion}
      style={[styles.container, style]}
    >
      <AppText variant="titleSmall" align="center">{title}</AppText>
      {description ? (
        <AppText variant="label" color="secondary" align="center">{description}</AppText>
      ) : null}
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: componentTokens.stateMessage.gap,
    padding: componentTokens.stateMessage.padding,
    alignItems: 'stretch',
  },
  actions: {
    gap: componentTokens.stateMessage.gap,
    marginTop: componentTokens.stateMessage.gap,
  },
});
