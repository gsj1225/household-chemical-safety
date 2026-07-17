import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ViewProps,
} from 'react-native';
import { componentTokens, semanticColors } from '../../theme/tokens';
import { AppText } from '../primitives';

export type PhotoAnnotationTone = 'current' | 'upcoming';

export interface PhotoAnnotation {
  id: string;
  bbox: [number, number, number, number];
  label: string;
  accessibilityLabel: string;
  tone?: PhotoAnnotationTone;
  labelPlacement?: 'start' | 'end';
}

interface PhotoFrameProps extends ViewProps {
  uri: string;
  aspectRatio?: number;
  resizeMode?: ImageResizeMode;
  accessibilityLabel: string;
  annotations?: PhotoAnnotation[];
  children?: React.ReactNode;
}

const percent = (value: number): `${number}%` =>
  `${(Math.max(0, Math.min(999, value)) / 999) * 100}%`;

export default function PhotoFrame({
  uri,
  aspectRatio = componentTokens.photo.panoramaAspectRatio,
  resizeMode = 'contain',
  accessibilityLabel,
  annotations = [],
  children,
  style,
  ...props
}: PhotoFrameProps) {
  return (
    <View
      {...props}
      style={[styles.frame, { aspectRatio }, style]}
    >
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode={resizeMode}
        accessibilityLabel={accessibilityLabel}
      />
      {annotations.map((annotation) => {
        const [x1, y1, x2, y2] = annotation.bbox;
        const tone = annotation.tone ?? 'upcoming';
        return (
          <View
            key={annotation.id}
            accessible
            accessibilityLabel={annotation.accessibilityLabel}
            style={[
              styles.annotation,
              tone === 'current' ? styles.currentAnnotation : styles.upcomingAnnotation,
              {
                left: percent(x1),
                top: percent(y1),
                width: percent(x2 - x1),
                height: percent(y2 - y1),
              },
            ]}
          >
            <View
              style={[
                styles.annotationLabel,
                tone === 'current' ? styles.currentLabel : styles.upcomingLabel,
                annotation.labelPlacement === 'end' ? styles.labelEnd : styles.labelStart,
              ]}
            >
              <AppText variant="caption" color="inverse" style={styles.labelText}>
                {annotation.label}
              </AppText>
            </View>
          </View>
        );
      })}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: componentTokens.photo.radius,
    backgroundColor: componentTokens.photo.background,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  annotation: {
    position: 'absolute',
    minWidth: componentTokens.photo.annotationMinimumSize,
    minHeight: componentTokens.photo.annotationMinimumSize,
  },
  currentAnnotation: {
    borderWidth: componentTokens.photo.annotationCurrentBorderWidth,
    borderColor: semanticColors.action.primary,
    backgroundColor: semanticColors.overlay.annotationCurrent,
  },
  upcomingAnnotation: {
    borderWidth: componentTokens.photo.annotationUpcomingBorderWidth,
    borderColor: semanticColors.border.onInverse,
    borderStyle: 'dashed',
    backgroundColor: semanticColors.overlay.annotationUpcoming,
  },
  annotationLabel: {
    position: 'absolute',
    top: 0,
    borderRadius: componentTokens.input.radius,
    paddingHorizontal: componentTokens.photo.annotationLabelHorizontalPadding,
    paddingVertical: componentTokens.photo.annotationLabelVerticalPadding,
  },
  labelStart: {
    left: 0,
  },
  labelEnd: {
    right: 0,
  },
  currentLabel: {
    backgroundColor: semanticColors.action.primary,
  },
  upcomingLabel: {
    backgroundColor: semanticColors.overlay.label,
  },
  labelText: {
    fontWeight: '700',
  },
});
