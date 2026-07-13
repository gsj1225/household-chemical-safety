/**
 * 排雷页面 - 全景拍照状态
 * 从 ScanScreen 拆出，负责初始全景拍照引导
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { fontSize, spacing, borderRadius } from '../../theme/spacing';

interface PanoramaViewProps {
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
}

export default function PanoramaView({
  onStartCamera, onSelectFromAlbum,
}: PanoramaViewProps) {
  return (
    <View style={styles.content}>
      <Text style={styles.pageTitle}>拍一张全景照</Text>
      <Text style={styles.pageDesc}>
        拍一张你家最可能有化学品的地方——{'\n'}
        厨房水槽下面、卫生间柜子，都是重灾区。
      </Text>

      <View style={styles.illustration}>
        <Text style={styles.illustrationEmoji}>📷</Text>
        <Text style={styles.illustrationHint}>对准化学品集中区域{'\n'}拍一张大范围的照片</Text>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onStartCamera}>
        <Text style={styles.primaryBtnText}>开始拍照</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.albumBtn} onPress={onSelectFromAlbum}>
        <Text style={styles.albumBtnText}>从相册选择照片</Text>
      </TouchableOpacity>
      <Text style={styles.privacyText}>照片仅用于本次分析，当前版本不保存原图</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  pageTitle: {
    fontSize: fontSize.xxl, fontWeight: 'bold',
    color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md,
  },
  pageDesc: {
    fontSize: fontSize.md, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 26, marginBottom: spacing.xl,
  },
  illustration: { alignItems: 'center', marginVertical: spacing.xl },
  illustrationEmoji: { fontSize: 64, marginBottom: spacing.md },
  illustrationHint: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 22,
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginVertical: spacing.md,
  },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: 'bold' },
  albumBtn: {
    borderWidth: 1, borderColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginBottom: spacing.md,
  },
  albumBtnText: { color: colors.primary, fontSize: fontSize.lg, fontWeight: 'bold' },
  privacyText: { color: colors.textSecondary, fontSize: fontSize.xs, textAlign: 'center' },
});
