import React from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import {
  componentTokens,
  semanticColors,
  typographyTokens,
} from '../../theme/tokens';
import AppText from './AppText';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  required?: boolean;
  error?: string;
  helpText?: string;
}

export default function TextField({
  label,
  required = false,
  error,
  helpText,
  multiline = false,
  editable = true,
  accessibilityLabel,
  accessibilityHint,
  ...props
}: TextFieldProps) {
  const supportingText = error ?? helpText;

  return (
    <View style={styles.container}>
      <AppText variant="label">
        {label}{required ? ' *' : ''}
      </AppText>
      <TextInput
        {...props}
        multiline={multiline}
        editable={editable}
        accessibilityLabel={accessibilityLabel ?? `${label}${required ? '，必填' : ''}`}
        accessibilityHint={accessibilityHint ?? supportingText}
        accessibilityState={{ disabled: !editable }}
        placeholderTextColor={semanticColors.text.muted}
        style={[
          styles.input,
          multiline ? styles.multiline : undefined,
          error ? styles.errorInput : undefined,
          !editable ? styles.disabledInput : undefined,
        ]}
      />
      {supportingText ? (
        <AppText
          variant="caption"
          color={error ? 'error' : 'secondary'}
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {supportingText}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: componentTokens.input.gap,
  },
  input: {
    minHeight: componentTokens.input.minHeight,
    borderRadius: componentTokens.input.radius,
    borderWidth: componentTokens.input.borderWidth,
    borderColor: semanticColors.border.default,
    backgroundColor: semanticColors.surface.page,
    paddingHorizontal: componentTokens.input.horizontalPadding,
    paddingVertical: componentTokens.input.verticalPadding,
    color: semanticColors.text.primary,
    ...typographyTokens.body,
  },
  multiline: {
    minHeight: componentTokens.input.multilineMinHeight,
    textAlignVertical: 'top',
  },
  errorInput: {
    borderColor: semanticColors.border.error,
  },
  disabledInput: {
    backgroundColor: semanticColors.surface.muted,
    color: semanticColors.text.muted,
  },
});
