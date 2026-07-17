import React from 'react';
import {
  Image,
  StyleSheet,
  View,
  type ImageResizeMode,
  type ViewProps,
} from 'react-native';
import { componentTokens } from '../../theme/tokens';

interface PhotoFrameProps extends ViewProps {
  uri: string;
  aspectRatio?: number;
  resizeMode?: ImageResizeMode;
  accessibilityLabel: string;
  children?: React.ReactNode;
}

export default function PhotoFrame({
  uri,
  aspectRatio = componentTokens.photo.panoramaAspectRatio,
  resizeMode = 'contain',
  accessibilityLabel,
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
});
