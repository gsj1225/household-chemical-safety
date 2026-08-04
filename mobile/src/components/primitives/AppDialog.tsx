import React, { useCallback, useEffect } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { componentTokens, semanticColors, rawTokens } from '../../theme/tokens';
import AppText from './AppText';
import AppButton from './AppButton';
import useReducedMotion from '../../hooks/useReducedMotion';

type DialogVariant = 'confirm' | 'destructive' | 'unsaved';

interface AppDialogProps {
  visible: boolean;
  title: string;
  description?: string;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
  /** unsaved 变体时显示的额外提示 */
  unsavedHint?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AppDialog({
  visible,
  title,
  description,
  variant = 'confirm',
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  onCancel,
  unsavedHint,
}: AppDialogProps) {
  // Android 返回键关闭对话框
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onCancel();
      return true;
    });
    return () => subscription.remove();
  }, [visible, onCancel]);

  const handleConfirm = useCallback(() => {
    onConfirm();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  const reducedMotion = useReducedMotion();
  const confirmVariant = variant === 'destructive' ? 'danger' : 'primary';
  const isDestructive = variant === 'destructive';

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "fade"}
      onRequestClose={handleCancel}
      accessibilityViewIsModal
    >
      <Pressable style={styles.scrim} onPress={handleCancel}>
        <SafeAreaView edges={['bottom']} style={styles.dialogWrapper}>
        <Pressable
          style={styles.dialog}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="alert"
          accessibilityLabel={title}
          accessibilityHint={description}
        >
          {isDestructive ? <View style={styles.destructiveAccent} /> : null}
          <View style={styles.header}>
            <AppText variant="titleSmall" align="center">
              {title}
            </AppText>
            {description ? (
              <AppText variant="body" color="secondary" align="center">
                {description}
              </AppText>
            ) : null}
            {variant === 'unsaved' && unsavedHint ? (
              <AppText variant="caption" color="warning" align="center">
                {unsavedHint}
              </AppText>
            ) : null}
          </View>

          <View style={styles.actions}>
            <AppButton
              label={cancelLabel}
              variant="secondary"
              onPress={handleCancel}
            />
            <AppButton
              label={confirmLabel}
              variant={confirmVariant}
              onPress={handleConfirm}
            />
          </View>
        </Pressable>
        </SafeAreaView>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dialogWrapper: {
    width: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    padding: rawTokens.space[5],
  },
  scrim: {
    flex: 1,
    backgroundColor: semanticColors.surface.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: semanticColors.surface.page,
    borderRadius: componentTokens.dialog.radius,
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.subtle,
    padding: componentTokens.dialog.padding,
    maxWidth: componentTokens.dialog.maxWidth,
    width: '100%',
    gap: componentTokens.dialog.gap,
    ...componentTokens.elevation.dialog,
  },
  header: {
    gap: componentTokens.dialog.headerGap,
  },
  actions: {
    flexDirection: 'column',
    gap: componentTokens.dialog.actionGap,
  },
  destructiveAccent: {
    height: componentTokens.statusAccent.width,
    backgroundColor: semanticColors.status.error,
    borderRadius: 2,
    marginBottom: rawTokens.space[1],
  },
});
