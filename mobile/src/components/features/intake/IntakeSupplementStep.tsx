/**
 * IntakeSupplementStep — 补拍照片
 *
 * 用户拍照/选图后，调用 recognizeSupplement 进行二次识别，
 * 结果与首次识别的观察合并，冲突字段在 review 步骤中标注。
 */

import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import AppButton from '../../primitives/AppButton';
import StateMessage from '../../primitives/StateMessage';
import ScreenScroll from '../../primitives/ScreenScroll';
import { useIntakeStore } from '../../../store/intakeStore';

export default function IntakeSupplementStep() {
  const { supplementUri, setSupplementPhoto, recognizeSupplement, draft } = useIntakeStore();

  const takeSupplementPhoto = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setSupplementPhoto(result.assets[0].uri);
    }
  }, [setSupplementPhoto]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });
    if (!result.canceled && result.assets[0]) {
      setSupplementPhoto(result.assets[0].uri);
    }
  }, [setSupplementPhoto]);

  // 已有的低置信度字段提示
  const lowConfidenceFields = draft?.lowConfidenceFields ?? [];

  return (
    <ScreenScroll variant="form">
      <View style={styles.header}>
        <AppText variant="titleSmall">补拍识别</AppText>
        <AppText variant="caption" color="secondary">
          补拍一张照片可以补充缺失信息，AI 会合并两次识别结果
        </AppText>
      </View>

      {lowConfidenceFields.length > 0 ? (
        <View style={styles.hintBox}>
          <AppText variant="caption" color="secondary">
            以下字段置信度较低，建议补拍：
          </AppText>
          <View style={styles.fieldTags}>
            {lowConfidenceFields.map((field) => (
              <AppText key={field} variant="caption" color="muted">
                · {field}
              </AppText>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton label="拍照" variant="primary" onPress={takeSupplementPhoto} />
        <AppButton label="从相册选择" variant="secondary" onPress={pickFromLibrary} />
      </View>

      {supplementUri ? (
        <View style={styles.previewSection}>
          <AppText variant="label" color="secondary">已选择补拍照片</AppText>
          <AppButton
            label="开始补拍识别"
            variant="primary"
            onPress={recognizeSupplement}
          />
        </View>
      ) : null}
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: rawTokens.space[1],
    marginBottom: rawTokens.space[3],
  },
  hintBox: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.large,
    backgroundColor: 'rgba(0,0,0,0.02)',
    marginBottom: rawTokens.space[3],
  },
  fieldTags: {
    gap: rawTokens.space[1],
  },
  actions: {
    gap: rawTokens.space[2],
  },
  previewSection: {
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[3],
  },
});
