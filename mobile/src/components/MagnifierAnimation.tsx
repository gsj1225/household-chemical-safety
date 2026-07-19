import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  ImageBackground,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import useReducedMotion from '../hooks/useReducedMotion';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../theme/tokens';
import { AppText } from './primitives';
import NarrationBubble from './NarrationBubble';

interface MagnifierAnimationProps {
  narrations: string[];
  imageUri: string | null;
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export default function MagnifierAnimation({
  narrations,
  imageUri,
}: MagnifierAnimationProps) {
  const reducedMotion = useReducedMotion();
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      scanAnim.setValue(0.5);
      return;
    }

    const scanLoop = Animated.loop(Animated.sequence([
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: rawTokens.duration.scan * 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scanAnim, {
        toValue: 0,
        duration: rawTokens.duration.scan * 2,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]));

    scanLoop.start();
    return () => {
      scanLoop.stop();
    };
  }, [reducedMotion, scanAnim]);

  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-110, 110],
  });

  return (
    <ImageBackground
      source={imageUri ? { uri: imageUri } : undefined}
      style={styles.container}
      imageStyle={styles.backgroundImage}
      resizeMode="cover"
      accessibilityLabel="正在分析用户选择的照片"
    >
      <View style={styles.overlay} />
      <View
        style={styles.content}
        accessibilityLiveRegion="polite"
        accessibilityRole="progressbar"
        accessibilityLabel="正在识别照片中的物品和包装文字"
      >
        <View style={styles.statusBadge}>
          <AppText variant="caption" style={styles.statusIndex}>01</AppText>
          <AppText variant="label">原图分析中</AppText>
        </View>

        <View
          style={styles.animationArea}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY: scanTranslateY }] }]}
          />
          <View style={styles.scanWindow}>
            <AppText variant="caption" color="inverse" style={styles.scanWindowLabel}>
              正在核对
            </AppText>
          </View>
          <View style={styles.scanTargets}>
            <AppText variant="caption" color="inverse">标签</AppText>
            <AppText variant="caption" color="inverse">包装</AppText>
            <AppText variant="caption" color="inverse">存放位置</AppText>
          </View>
        </View>

        <View style={styles.narrationArea}>
          <NarrationBubble narrations={narrations} />
        </View>

        <AppText variant="label" color="inverse" align="center" style={styles.loadingText}>
          正在识别物品和包装文字…
        </AppText>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.surface.inverse,
  },
  backgroundImage: {
    opacity: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: semanticColors.overlay.photo,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rawTokens.space[5],
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[2],
    backgroundColor: semanticColors.surface.glass,
    borderRadius: rawTokens.radius.medium,
    paddingVertical: rawTokens.space[2],
    paddingLeft: rawTokens.space[2],
    paddingRight: rawTokens.space[4],
    marginBottom: rawTokens.space[5],
  },
  statusIndex: {
    minWidth: componentTokens.analysis.statusIndexSize,
    minHeight: componentTokens.analysis.statusIndexSize,
    borderRadius: rawTokens.radius.small,
    color: semanticColors.text.inverse,
    backgroundColor: semanticColors.surface.inverse,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: componentTokens.analysis.statusIndexSize,
    fontWeight: '700',
  },
  animationArea: {
    width: '92%',
    maxWidth: componentTokens.analysis.maxWidth,
    height: componentTokens.analysis.frameHeight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rawTokens.space[6],
    position: 'relative',
    overflow: 'hidden',
    borderWidth: componentTokens.surface.strongBorderWidth,
    borderColor: semanticColors.border.onInverse,
    borderRadius: rawTokens.radius.xlarge,
    backgroundColor: semanticColors.surface.glassSubtle,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: componentTokens.analysis.scanLineWidth,
    backgroundColor: semanticColors.text.inverse,
  },
  scanWindow: {
    width: componentTokens.analysis.targetWidth,
    height: componentTokens.analysis.targetHeight,
    borderWidth: componentTokens.surface.strongBorderWidth,
    borderColor: semanticColors.border.onInverse,
    borderRadius: rawTokens.radius.medium,
    borderStyle: 'dashed',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  scanWindowLabel: {
    paddingVertical: rawTokens.space[1],
    paddingHorizontal: rawTokens.space[2],
    backgroundColor: semanticColors.overlay.label,
  },
  scanTargets: {
    position: 'absolute',
    bottom: rawTokens.space[4],
    flexDirection: 'row',
    gap: rawTokens.space[4],
  },
  narrationArea: {
    minHeight: 80,
    justifyContent: 'center',
    width: '100%',
    marginBottom: rawTokens.space[3],
  },
  loadingText: {
    textShadowColor: semanticColors.overlay.photoStrong,
    textShadowRadius: 4,
  },
});
