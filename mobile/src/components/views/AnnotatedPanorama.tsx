/** 在原全景图上绘制 Qwen3-VL 归一化区域框。 */

import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { PanoramaArea } from '../../types';
import { colors } from '../../theme/colors';
import { borderRadius, fontSize, spacing } from '../../theme/spacing';

interface Props {
  imageUri: string;
  areas: PanoramaArea[];
  currentAreaIndex: number;
}

const percent = (value: number): `${number}%` =>
  `${Math.max(0, Math.min(999, value)) / 9.99}%`;

export default function AnnotatedPanorama({
  imageUri, areas, currentAreaIndex,
}: Props) {
  const [aspectRatio, setAspectRatio] = useState(4 / 3);

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

  const visibleAreas = areas
    .map((area, index) => ({ area, index }))
    .filter(({ area, index }) => area.bbox_2d && index >= currentAreaIndex);

  return (
    <View>
      <View style={[styles.imageFrame, { aspectRatio }]}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
        {visibleAreas.map(({ area, index }) => {
          const [x1, y1, x2, y2] = area.bbox_2d!;
          const isCurrent = index === currentAreaIndex;
          return (
            <View
              key={area.area_id}
              style={[
                styles.box,
                isCurrent ? styles.currentBox : styles.upcomingBox,
                {
                  left: percent(x1),
                  top: percent(y1),
                  width: percent(x2 - x1),
                  height: percent(y2 - y1),
                },
              ]}
            >
              <View style={[styles.label, !isCurrent && styles.upcomingLabel]}>
                <Text style={styles.labelText}>
                  {isCurrent ? `请拍这里 ${index + 1}` : `${index + 1}`}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
      {visibleAreas.length === 0 && (
        <Text style={styles.fallbackText}>未取得精确位置，请按下方文字描述靠近拍摄</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  imageFrame: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: borderRadius.lg,
    backgroundColor: '#101828',
  },
  image: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    width: '100%', height: '100%',
  },
  box: {
    position: 'absolute',
    borderRadius: borderRadius.md,
    minWidth: 24,
    minHeight: 24,
  },
  currentBox: {
    borderWidth: 4,
    borderColor: colors.primary,
    backgroundColor: 'rgba(255, 102, 51, 0.12)',
  },
  upcomingBox: {
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.78)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0, 0, 0, 0.10)',
  },
  label: {
    position: 'absolute',
    top: -2,
    left: -2,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  upcomingLabel: { backgroundColor: 'rgba(17, 24, 39, 0.82)' },
  labelText: { color: colors.textWhite, fontSize: fontSize.xs, fontWeight: 'bold' },
  fallbackText: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    textAlign: 'center',
  },
});
