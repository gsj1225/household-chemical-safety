/** 全景分析成功但没有定位到区域时的可恢复页面。 */

import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/colors';
import { borderRadius, fontSize, spacing } from '../../theme/spacing';

interface Props {
  imageUri: string;
  onRetry: () => void;
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
}

export default function EmptyPanoramaView({
  imageUri, onRetry, onStartCamera, onSelectFromAlbum,
}: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>这张照片里暂时没定位到区域</Text>
      <Text style={styles.description}>
        模型没有找到足够明确的瓶罐或包装。你可以重新分析，或换一张更清晰、范围更集中的照片。
      </Text>

      <View style={styles.imageFrame}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onSelectFromAlbum}>
        <Text style={styles.primaryBtnText}>从相册换一张</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={onStartCamera}>
        <Text style={styles.secondaryBtnText}>重新拍照</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>重新分析这张照片（会再次调用模型）</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  title: {
    color: colors.textPrimary, fontSize: fontSize.xl, fontWeight: 'bold',
    textAlign: 'center', marginBottom: spacing.md,
  },
  description: {
    color: colors.textSecondary, fontSize: fontSize.sm, lineHeight: 22,
    textAlign: 'center', marginBottom: spacing.lg,
  },
  imageFrame: {
    width: '100%', aspectRatio: 4 / 3, backgroundColor: '#101828',
    borderRadius: borderRadius.lg, overflow: 'hidden', marginBottom: spacing.lg,
  },
  image: { width: '100%', height: '100%' },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginBottom: spacing.md,
  },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.md, fontWeight: 'bold' },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: borderRadius.xl, alignItems: 'center', marginBottom: spacing.sm,
  },
  secondaryBtnText: { color: colors.primary, fontSize: fontSize.md, fontWeight: '600' },
  retryBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  retryBtnText: { color: colors.textSecondary, fontSize: fontSize.xs },
});
