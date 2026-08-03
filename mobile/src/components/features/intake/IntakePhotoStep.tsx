/**
 * IntakePhotoStep — 拍照/选图步骤
 */

import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Linking } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import AppButton from '../../primitives/AppButton';
import StateMessage from '../../primitives/StateMessage';
import PermissionDeniedView from './PermissionDeniedView';
import { useIntakeStore } from '../../../store/intakeStore';

interface IntakePhotoStepProps {
  errorMessage?: string | null;
}

export default function IntakePhotoStep({ errorMessage }: IntakePhotoStepProps) {
  const { setPhoto, recognize, photoUri } = useIntakeStore();
  const [permissionDenied, setPermissionDenied] = useState(false);

  const takePhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  }, [setPhoto]);

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPermissionDenied(true);
      return;
    }
    setPermissionDenied(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setPhoto(result.assets[0].uri);
    }
  }, [setPhoto]);

  return (
    <View style={styles.container}>
      {errorMessage ? (
        <View style={styles.errorContainer}>
          <StateMessage title="操作失败" description={errorMessage} tone="error" />
        </View>
      ) : null}

      {permissionDenied ? (
        <View style={styles.errorContainer}>
          <PermissionDeniedView />
        </View>
      ) : null}

      <View style={styles.placeholder}>
        <AppText variant="body" color="secondary" align="center">
          拍一张产品正面照片，AI 将帮你识别品牌、名称和成分
        </AppText>
      </View>

      <View style={styles.actions}>
        <AppButton label="拍照" variant="primary" onPress={takePhoto} />
        <AppButton label="从相册选择" variant="secondary" onPress={pickFromLibrary} />
      </View>

      {photoUri ? (
        <View style={styles.previewSection}>
          <AppText variant="label" color="secondary">已选择照片</AppText>
          <AppButton label="开始识别" variant="primary" onPress={recognize} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[4],
  },
  errorContainer: {
    marginBottom: rawTokens.space[2],
  },
  placeholder: {
    padding: rawTokens.space[6],
    alignItems: 'center',
  },
  actions: {
    gap: rawTokens.space[2],
  },
  previewSection: {
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[2],
  },
});
