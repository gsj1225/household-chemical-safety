import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import type { PanoramaArea } from '../../types';
import { componentTokens, rawTokens } from '../../theme/tokens';
import { PhotoFrame } from '../composites';
import type { PhotoAnnotation } from '../composites/PhotoFrame';
import { AppButton, AppText, StateMessage, StatusBadge, Surface } from '../primitives';

interface EvidenceInsufficientViewProps {
  imageUri: string;
  sceneLabel: string;
  areas: PanoramaArea[];
  skippedCount: number;
  onReviewAreas: () => void;
  onReplacePanorama: () => void;
  onExit: () => void;
}

export default function EvidenceInsufficientView({
  imageUri,
  sceneLabel,
  areas,
  skippedCount,
  onReviewAreas,
  onReplacePanorama,
  onExit,
}: EvidenceInsufficientViewProps) {
  const [aspectRatio, setAspectRatio] = useState(
    componentTokens.photo.panoramaAspectRatio,
  );

  useEffect(() => {
    let active = true;
    Image.getSize(
      imageUri,
      (width, height) => {
        if (active && width > 0 && height > 0) setAspectRatio(width / height);
      },
      () => undefined,
    );
    return () => { active = false; };
  }, [imageUri]);

  const annotations: PhotoAnnotation[] = areas
    .filter((area) => Boolean(area.bbox_2d))
    .map((area, index) => ({
      id: area.area_id,
      bbox: area.bbox_2d!,
      label: `区域 ${index + 1}`,
      accessibilityLabel: `可重新检查的区域 ${index + 1}：${area.description}`,
      tone: 'current',
      labelPlacement: area.bbox_2d![0] > 650 ? 'end' : 'start',
    }));

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <StatusBadge label={sceneLabel || '当前场景'} tone="neutral" />
        <AppText variant="title" accessibilityRole="header">
          这次还不能打分
        </AppText>
        <AppText color="secondary">
          {skippedCount} 个细拍区域都被跳过了。至少确认一个近景识别结果，报告才有证据。
        </AppText>
      </View>

      <PhotoFrame
        uri={imageUri}
        aspectRatio={aspectRatio}
        annotations={annotations}
        accessibilityLabel={`${sceneLabel || '当前场景'}全景照片，标有 ${annotations.length} 个可重新检查区域`}
      />

      <StateMessage
        title="原图和区域都还在"
        description="可以从第一个区域重新检查，也可以换一张更清楚的全景图。系统不会把“全部跳过”算成 100 分。"
      />

      <Surface variant="outlined" style={styles.areaList}>
        <AppText variant="label">可重新检查的区域</AppText>
        {areas.map((area, index) => (
          <View key={area.area_id} style={styles.areaRow}>
            <AppText variant="caption">{String(index + 1).padStart(2, '0')}</AppText>
            <View style={styles.areaText}>
              <AppText variant="label">{area.description}</AppText>
              <AppText variant="caption" color="secondary">{area.items_hint}</AppText>
            </View>
          </View>
        ))}
      </Surface>

      <View style={styles.actions}>
        <AppButton
          label="重新看这些区域"
          onPress={onReviewAreas}
          accessibilityHint="回到第一个细拍区域并保留当前全景图"
        />
        <AppButton
          label="换一张全景图"
          variant="secondary"
          onPress={onReplacePanorama}
          accessibilityHint="清除当前区域标记并重新选择全景照片"
        />
        <AppButton
          label="退出本次检查"
          variant="quiet"
          onPress={onExit}
          accessibilityHint="放弃当前未评分的场景并返回首页"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: rawTokens.space[5],
    paddingBottom: rawTokens.space[8],
    gap: rawTokens.space[4],
  },
  heading: {
    alignItems: 'flex-start',
    gap: rawTokens.space[2],
  },
  areaList: {
    gap: rawTokens.space[3],
  },
  areaRow: {
    minHeight: rawTokens.size.touchMinimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
  },
  areaText: {
    flex: 1,
    gap: rawTokens.space[1],
  },
  actions: {
    gap: rawTokens.space[3],
  },
});
