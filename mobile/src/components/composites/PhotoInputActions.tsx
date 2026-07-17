import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../theme/tokens';
import { AppButton, AppText } from '../primitives';

interface PhotoInputActionsProps {
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
  disabled?: boolean;
  cameraLabel?: string;
  albumLabel?: string;
  privacyText?: string;
}

export default function PhotoInputActions({
  onStartCamera,
  onSelectFromAlbum,
  disabled = false,
  cameraLabel = '开始拍照',
  albumLabel = '从相册选择照片',
  privacyText = '照片仅用于本次分析，当前版本不保存原图',
}: PhotoInputActionsProps) {
  return (
    <View style={styles.container}>
      <AppButton
        label={cameraLabel}
        onPress={onStartCamera}
        disabled={disabled}
        accessibilityHint="打开相机拍摄家庭化学品集中区域"
      />
      <AppButton
        label={albumLabel}
        variant="secondary"
        onPress={onSelectFromAlbum}
        disabled={disabled}
        accessibilityHint="打开系统相册选择一张照片"
      />
      <AppText variant="caption" color="secondary" align="center">
        {privacyText}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[3],
  },
});
