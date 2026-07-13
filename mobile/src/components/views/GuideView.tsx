/**
 * 排雷页面 - 引导细拍状态
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors, riskLevelColor } from '../../theme/colors';
import { fontSize, spacing, borderRadius } from '../../theme/spacing';
import type { PanoramaArea, ScanResult } from '../../types';
import AnnotatedPanorama from './AnnotatedPanorama';

interface GuideViewProps {
  areas: PanoramaArea[];
  currentAreaIndex: number;
  guideMessage: string;
  mineCount: number;
  scanResults: ScanResult[];
  panoramaImageUri: string | null;
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
  onSkip: () => void;
}

export default function GuideView({
  areas, currentAreaIndex, guideMessage, mineCount, scanResults,
  panoramaImageUri, onStartCamera, onSelectFromAlbum, onSkip,
}: GuideViewProps) {
  const currentArea = areas[currentAreaIndex];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          细拍 {currentAreaIndex + 1} / {areas.length}
        </Text>
        <Text style={styles.mineCountText}>
          已发现 {mineCount} 个雷
        </Text>
      </View>

      <View style={styles.areaCard}>
        <View style={[styles.riskDot, { backgroundColor: riskLevelColor[currentArea?.risk_level] || colors.medium }]} />
        <View style={styles.areaInfo}>
          <Text style={styles.areaDescription}>{currentArea?.description}</Text>
          <Text style={styles.areaHint}>{currentArea?.items_hint}</Text>
        </View>
      </View>

      {panoramaImageUri && (
        <AnnotatedPanorama
          imageUri={panoramaImageUri}
          areas={areas}
          currentAreaIndex={currentAreaIndex}
        />
      )}

      <Text style={styles.guideText}>{guideMessage}</Text>

      <TouchableOpacity style={styles.primaryBtn} onPress={onStartCamera}>
        <Text style={styles.primaryBtnText}>拍照识别</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.albumBtn} onPress={onSelectFromAlbum}>
        <Text style={styles.albumBtnText}>从相册选择照片</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipBtn} onPress={onSkip}>
        <Text style={styles.skipBtnText}>跳过这个区域</Text>
      </TouchableOpacity>

      {scanResults.length > 0 && (
        <View style={styles.scannedList}>
          <Text style={styles.scannedTitle}>已扫描</Text>
          {scanResults.map((r, i) => (
            <View key={i} style={styles.scannedItem}>
              <Text style={styles.scannedEmoji}>
                {r.status === 'mine' ? '💣' : '✅'}
              </Text>
              <Text style={styles.scannedName}>
                {r.product.brand} {r.product.name}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.lg },
  progressText: { fontSize: fontSize.sm, color: colors.textSecondary, fontWeight: '600' },
  mineCountText: { fontSize: fontSize.sm, color: colors.critical, fontWeight: '600' },
  areaCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  riskDot: { width: 12, height: 12, borderRadius: 6, marginRight: spacing.md },
  areaInfo: { flex: 1 },
  areaDescription: { fontSize: fontSize.md, fontWeight: '600', color: colors.textPrimary },
  areaHint: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 2 },
  guideText: {
    fontSize: fontSize.md, color: colors.textPrimary,
    textAlign: 'center', lineHeight: 24, marginVertical: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginVertical: spacing.md,
  },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: 'bold' },
  albumBtn: {
    borderWidth: 1, borderColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginBottom: spacing.sm,
  },
  albumBtnText: { color: colors.primary, fontSize: fontSize.lg, fontWeight: 'bold' },
  skipBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  skipBtnText: { color: colors.textSecondary, fontSize: fontSize.sm },
  scannedList: { marginTop: spacing.xl },
  scannedTitle: {
    fontSize: fontSize.sm, color: colors.textSecondary,
    fontWeight: '600', marginBottom: spacing.sm,
  },
  scannedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  scannedEmoji: { fontSize: 16, marginRight: spacing.sm },
  scannedName: { fontSize: fontSize.sm, color: colors.textPrimary },
});
