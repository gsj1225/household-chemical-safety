import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppButton, AppText, StateMessage } from '../primitives';
import { componentTokens, rawTokens, semanticColors } from '../../theme/tokens';

interface CameraCaptureViewProps {
  onCapture: (uri: string) => void;
  onSelectFromAlbum: () => void;
  onCancel: () => void;
  hint?: string;
}

const DEMO_IMAGE_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export default function CameraCaptureView({
  onCapture,
  onSelectFromAlbum,
  onCancel,
  hint,
}: CameraCaptureViewProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);
  const insets = useSafeAreaInsets();

  if (!permission) {
    return (
      <View
        style={styles.centered}
        accessibilityRole="progressbar"
        accessibilityLabel="正在检查相机权限"
      >
        <ActivityIndicator size="large" color={semanticColors.action.primary} />
        <AppText color="secondary" align="center">正在检查相机权限…</AppText>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionPage}>
        <StateMessage
          title="需要相机权限"
          description={permission.canAskAgain
            ? '授权后才能直接拍照；你也可以继续从相册选择照片。'
            : '相机权限已被系统关闭。你可以前往系统设置开启，或继续从相册选择照片。'}
          tone="permission"
          actions={(
            <>
              {permission.canAskAgain ? (
                <AppButton label="授权相机" onPress={() => void requestPermission()} />
              ) : Platform.OS !== 'web' ? (
                <AppButton label="打开系统设置" onPress={() => void Linking.openSettings()} />
              ) : null}
              <AppButton
                label="从相册选择照片"
                variant="secondary"
                onPress={onSelectFromAlbum}
              />
              {Platform.OS === 'web' ? (
                <AppButton
                  label="电脑演示：使用示例照片"
                  variant="secondary"
                  onPress={() => onCapture(DEMO_IMAGE_URI)}
                />
              ) : null}
              <AppButton label="返回" variant="quiet" onPress={onCancel} />
            </>
          )}
        />
      </View>
    );
  }

  const takePhoto = async () => {
    if (!cameraRef.current || taking) return;
    setTaking(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.7,
        skipProcessing: false,
      });
      if (photo) onCapture(photo.uri);
    } catch {
      Alert.alert('拍照失败', '没有成功获取照片，请重新拍摄');
    } finally {
      setTaking(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <View style={[styles.topControls, { top: insets.top + rawTokens.space[3] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="取消拍照"
          accessibilityState={{ disabled: taking }}
          disabled={taking}
          onPress={onCancel}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.overlayPressed]}
        >
          <AppText variant="label" color="inverse">取消</AppText>
        </Pressable>
        {hint ? (
          <View style={styles.hintBar} accessibilityLiveRegion="polite">
            <AppText variant="label" color="inverse" align="center">{hint}</AppText>
          </View>
        ) : null}
      </View>

      <View style={[styles.bottomBar, { bottom: Math.max(insets.bottom + 12, 28) }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={taking ? '正在拍照' : '拍摄照片'}
          accessibilityState={{ disabled: taking, busy: taking }}
          disabled={taking}
          onPress={() => void takePhoto()}
          style={({ pressed }) => [
            styles.captureButton,
            pressed && !taking ? styles.capturePressed : undefined,
          ]}
        >
          {taking ? (
            <ActivityIndicator size="small" color={semanticColors.text.inverse} />
          ) : (
            <View style={styles.captureInner} />
          )}
        </Pressable>

        <View style={styles.secondaryActions}>
          <AppButton
            label="从相册选择照片"
            variant="secondary"
            disabled={taking}
            onPress={onSelectFromAlbum}
          />
          {Platform.OS === 'web' ? (
            <AppButton
              label="电脑演示：使用示例照片"
              variant="secondary"
              disabled={taking}
              onPress={() => onCapture(DEMO_IMAGE_URI)}
            />
          ) : null}
        </View>

        <View style={styles.privacyPill}>
          <AppText variant="caption" color="inverse" align="center">
            照片仅用于本次分析，当前版本不保存原图
          </AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: componentTokens.photo.background,
  },
  camera: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: rawTokens.space[4],
    padding: rawTokens.space[5],
    backgroundColor: semanticColors.surface.page,
  },
  permissionPage: {
    flex: 1,
    justifyContent: 'center',
    padding: rawTokens.space[5],
    backgroundColor: semanticColors.surface.page,
  },
  topControls: {
    position: 'absolute',
    left: rawTokens.space[4],
    right: rawTokens.space[4],
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: rawTokens.space[3],
  },
  cancelButton: {
    minWidth: rawTokens.size.touchMinimum,
    minHeight: rawTokens.size.touchMinimum,
    borderRadius: rawTokens.radius.round,
    paddingHorizontal: rawTokens.space[4],
    justifyContent: 'center',
    backgroundColor: semanticColors.overlay.label,
  },
  hintBar: {
    flex: 1,
    minHeight: rawTokens.size.touchMinimum,
    justifyContent: 'center',
    borderRadius: rawTokens.radius.medium,
    paddingHorizontal: rawTokens.space[4],
    backgroundColor: semanticColors.overlay.label,
  },
  overlayPressed: {
    opacity: 0.78,
  },
  bottomBar: {
    position: 'absolute',
    left: rawTokens.space[4],
    right: rawTokens.space[4],
    alignItems: 'center',
    gap: rawTokens.space[3],
  },
  captureButton: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: semanticColors.text.inverse,
    backgroundColor: semanticColors.overlay.label,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capturePressed: {
    transform: [{ scale: 0.96 }],
  },
  captureInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: semanticColors.text.inverse,
  },
  secondaryActions: {
    width: '100%',
    maxWidth: 420,
    gap: rawTokens.space[2],
  },
  privacyPill: {
    borderRadius: rawTokens.radius.round,
    paddingVertical: rawTokens.space[2],
    paddingHorizontal: rawTokens.space[4],
    backgroundColor: semanticColors.overlay.label,
  },
});
