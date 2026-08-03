import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, View } from 'react-native';
import type { PanoramaArea, ScanResult } from '../../types';
import { componentTokens, rawTokens } from '../../theme/tokens';
import {
  PhotoFrame,
  PhotoInputActions,
  ProgressSummary,
} from '../composites';
import type { PhotoAnnotation } from '../composites/PhotoFrame';
import {
  AppButton,
  AppText,
  StateMessage,
  StatusBadge,
  Surface,
} from '../primitives';

interface AreaGuideViewProps {
  areas: PanoramaArea[];
  currentAreaIndex: number;
  guideMessage: string;
  mineCount: number;
  scanResults: ScanResult[];
  panoramaImageUri: string | null;
  errorMessage?: string | null;
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
  onSkip: () => void;
}

const priorityMeta: Record<string, string> = {
  high: '拍摄优先级：高',
  medium: '拍摄优先级：中',
  low: '拍摄优先级：低',
};

export default function AreaGuideView({
  areas,
  currentAreaIndex,
  guideMessage,
  mineCount,
  scanResults,
  panoramaImageUri,
  errorMessage,
  onStartCamera,
  onSelectFromAlbum,
  onSkip,
}: AreaGuideViewProps) {
  const [aspectRatio, setAspectRatio] = useState(
    componentTokens.photo.panoramaAspectRatio,
  );
  const currentArea = areas[currentAreaIndex];

  useEffect(() => {
    if (!panoramaImageUri) return undefined;
    let active = true;
    Image.getSize(
      panoramaImageUri,
      (width, height) => {
        if (active && width > 0 && height > 0) setAspectRatio(width / height);
      },
      () => undefined,
    );
    return () => { active = false; };
  }, [panoramaImageUri]);

  if (!currentArea) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <StateMessage
          title="没有可继续拍摄的区域"
          description="当前区域信息已经失效，可以继续生成报告或返回重新开始。"
          tone="error"
          actions={<AppButton label="继续" onPress={onSkip} />}
        />
      </ScrollView>
    );
  }

  const annotations: PhotoAnnotation[] = areas
    .map((area, index) => ({ area, index }))
    .filter(({ area, index }) => Boolean(area.bbox_2d) && index >= currentAreaIndex)
    .map(({ area, index }) => ({
      id: area.area_id,
      bbox: area.bbox_2d!,
      label: index === currentAreaIndex ? `请拍这里 ${index + 1}` : `${index + 1}`,
      accessibilityLabel: index === currentAreaIndex
        ? `当前拍摄区域 ${index + 1}：${area.description}`
        : `后续拍摄区域 ${index + 1}：${area.description}`,
      tone: index === currentAreaIndex ? 'current' : 'upcoming',
      labelPlacement: area.bbox_2d![0] > 650 ? 'end' : 'start',
    }));
  const priority = priorityMeta[currentArea.risk_level] ?? '拍摄优先级：待确认';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ProgressSummary
        current={currentAreaIndex + 1}
        total={areas.length}
        mineCount={mineCount}
      />

      {errorMessage ? (
        <StateMessage
          title="刚才没有识别成功"
          description={errorMessage}
          tone="error"
          accessibilityLiveRegion="assertive"
        />
      ) : null}

      {panoramaImageUri ? (
        <View style={styles.photoWrap}>
          <View style={styles.photoHeading}>
            <AppText variant="titleSmall">按原图黑框位置靠近拍摄</AppText>
            <AppText variant="caption" color="secondary">
              实线是当前区域，虚线是后续区域
            </AppText>
          </View>
          <PhotoFrame
            uri={panoramaImageUri}
            aspectRatio={aspectRatio}
            annotations={annotations}
            accessibilityLabel={`全景照片，当前需要拍摄：${currentArea.description}`}
          />
          {annotations.length === 0 ? (
            <AppText variant="caption" color="secondary" align="center">
              未取得精确位置，请按下方文字描述靠近拍摄
            </AppText>
          ) : null}
        </View>
      ) : null}

      <Surface variant="outlined" style={styles.areaCard}>
        <StatusBadge label={priority} tone="neutral" />
        <AppText variant="titleSmall">{currentArea.description}</AppText>
        <AppText color="secondary">{currentArea.items_hint}</AppText>
      </Surface>

      <AppText align="center">{guideMessage || currentArea.guide_message}</AppText>

      <PhotoInputActions
        onStartCamera={onStartCamera}
        onSelectFromAlbum={onSelectFromAlbum}
        cameraLabel="拍照识别"
        albumLabel="从相册选择单品照片"
        cameraHint={`打开相机，靠近拍摄${currentArea.description}`}
        albumHint={`从系统相册选择${currentArea.description}的清晰照片`}
        privacyText="请让包装文字和产品名称清晰可见；照片仅用于本次分析"
      />

      <AppButton
        label="跳过这个区域"
        variant="quiet"
        onPress={onSkip}
        accessibilityHint="不识别当前区域；如果本场景全部跳过，将进入证据不足提示"
      />

      {scanResults.length > 0 ? (
        <Surface variant="outlined" style={styles.scannedList}>
          <AppText variant="label">已确认产品</AppText>
          {scanResults.map((result) => (
            <View key={result.scan_id} style={styles.scannedItem}>
              <StatusBadge
                label={result.status === 'mine' ? '发现雷点' : '当前规则未发现雷点'}
                tone={result.status === 'mine' ? 'error' : 'success'}
              />
              <AppText style={styles.productName}>
                {result.product.brand} {result.product.name}
              </AppText>
            </View>
          ))}
        </Surface>
      ) : null}
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
  photoWrap: {
    width: '100%',
    maxWidth: componentTokens.photo.wideMaxWidth,
    alignSelf: 'center',
    gap: rawTokens.space[3],
  },
  photoHeading: {
    gap: rawTokens.space[1],
  },
  areaCard: {
    gap: rawTokens.space[2],
  },
  scannedList: {
    gap: rawTokens.space[3],
  },
  scannedItem: {
    gap: rawTokens.space[2],
    paddingTop: rawTokens.space[2],
  },
  productName: {
    flexShrink: 1,
  },
});
