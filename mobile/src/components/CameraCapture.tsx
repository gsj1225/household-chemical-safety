/**
 * 拍照组件
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme/colors';
import { fontSize, spacing, borderRadius } from '../theme/spacing';

interface CameraCaptureProps {
  onCapture: (uri: string) => void;
  onSelectFromAlbum: () => void;
  onCancel: () => void;
  hint?: string;
}

const DEMO_IMAGE_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

export default function CameraCapture({
  onCapture, onSelectFromAlbum, onCancel, hint,
}: CameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [taking, setTaking] = useState(false);

  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>需要相机权限才能拍照</Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>授权相机</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.albumPermissionBtn} onPress={onSelectFromAlbum}>
          <Text style={styles.demoBtnText}>从相册选择照片</Text>
        </TouchableOpacity>
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
      if (photo) {
        onCapture(photo.uri);
      }
    } catch (err) {
      Alert.alert('拍照失败', '没有成功获取照片，请重新拍摄');
    } finally {
      setTaking(false);
    }
  };

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
      />

      {/* 顶部提示 */}
      {hint && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>{hint}</Text>
        </View>
      )}

      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={taking}>
        <Text style={styles.cancelBtnText}>取消</Text>
      </TouchableOpacity>

      {/* 底部拍照按钮 */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={takePhoto}
          disabled={taking}
        >
          {taking ? (
            <ActivityIndicator size="small" color={colors.textWhite} />
          ) : (
            <View style={styles.captureInner} />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.webDemoBtn}
          onPress={onSelectFromAlbum}
          disabled={taking}
        >
          <Text style={styles.webDemoBtnText}>从相册选择照片</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <TouchableOpacity style={styles.webDemoBtn} onPress={() => onCapture(DEMO_IMAGE_URI)}>
            <Text style={styles.webDemoBtnText}>电脑演示：使用示例照片</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.privacyText}>照片仅用于本次分析，当前版本不保存原图</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
  },
  camera: {
    flex: 1,
  },
  hintBar: {
    position: 'absolute',
    top: 50,
    left: spacing.md,
    right: spacing.md,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  hintText: {
    color: colors.textWhite,
    fontSize: fontSize.sm,
    textAlign: 'center',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  cancelBtn: {
    position: 'absolute',
    top: 50,
    left: spacing.md,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.round,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cancelBtnText: { color: colors.textWhite, fontSize: fontSize.sm, fontWeight: '600' },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: colors.textWhite,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.textWhite,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.bgPrimary,
    padding: spacing.xl,
  },
  permissionText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
  permissionBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  permissionBtnText: {
    color: colors.textWhite,
    fontSize: fontSize.md,
  },
  albumPermissionBtn: { marginTop: spacing.md, padding: spacing.md },
  demoBtnText: { color: colors.primary, fontSize: fontSize.md },
  webDemoBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  webDemoBtnText: { color: colors.textWhite, fontSize: fontSize.sm },
  privacyText: {
    marginTop: spacing.md,
    color: colors.textWhite,
    fontSize: fontSize.xs,
    backgroundColor: colors.overlay,
    borderRadius: borderRadius.round,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    overflow: 'hidden',
  },
});
