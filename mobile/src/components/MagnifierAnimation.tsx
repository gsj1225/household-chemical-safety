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
import { rawTokens, semanticColors } from '../theme/tokens';
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
  const moveAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      moveAnim.setValue(0.5);
      scaleAnim.setValue(1);
      rotateAnim.setValue(0);
      scanAnim.setValue(0.5);
      return;
    }

    const moveLoop = Animated.loop(Animated.sequence([
      Animated.timing(moveAnim, {
        toValue: 1,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(moveAnim, {
        toValue: 0,
        duration: 900,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]));
    const scaleLoop = Animated.loop(Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.12,
        duration: 500,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]));
    const rotateLoop = Animated.loop(Animated.sequence([
      Animated.timing(rotateAnim, { toValue: 1, duration: 600, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(rotateAnim, { toValue: -1, duration: 1200, useNativeDriver: USE_NATIVE_DRIVER }),
      Animated.timing(rotateAnim, { toValue: 0, duration: 600, useNativeDriver: USE_NATIVE_DRIVER }),
    ]));
    const scanLoop = Animated.loop(Animated.sequence([
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
      Animated.timing(scanAnim, {
        toValue: 0,
        duration: 1600,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: USE_NATIVE_DRIVER,
      }),
    ]));

    moveLoop.start();
    scaleLoop.start();
    rotateLoop.start();
    scanLoop.start();
    return () => {
      moveLoop.stop();
      scaleLoop.stop();
      rotateLoop.stop();
      scanLoop.stop();
    };
  }, [moveAnim, reducedMotion, rotateAnim, scaleAnim, scanAnim]);

  const translateX = moveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 50],
  });
  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-12deg', '0deg', '12deg'],
  });
  const scanTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-125, 125],
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
          <View style={styles.statusDot} />
          <AppText variant="label">正在分析这张照片</AppText>
        </View>

        <View
          style={styles.animationArea}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY: scanTranslateY }] }]}
          />
          <Animated.View
            style={[
              styles.magnifier,
              { transform: [{ translateX }, { scale: scaleAnim }, { rotate }] },
            ]}
          >
            <View style={styles.lens} />
            <View style={styles.handle} />
          </Animated.View>
          <View style={styles.itemOutline} />
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
    backgroundColor: semanticColors.surface.glass,
    borderRadius: rawTokens.radius.round,
    paddingVertical: rawTokens.space[2],
    paddingHorizontal: rawTokens.space[4],
    marginBottom: rawTokens.space[5],
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: semanticColors.action.decorativeAccent,
    marginRight: rawTokens.space[2],
  },
  animationArea: {
    width: '92%',
    maxWidth: 520,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: rawTokens.space[6],
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: semanticColors.border.onInverse,
    borderRadius: rawTokens.radius.xlarge,
    backgroundColor: semanticColors.surface.glassSubtle,
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: semanticColors.action.decorativeAccent,
    shadowColor: semanticColors.action.decorativeAccent,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  magnifier: {
    width: 72,
    height: 72,
    zIndex: 2,
  },
  lens: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 6,
    borderColor: semanticColors.text.inverse,
    backgroundColor: semanticColors.surface.lens,
  },
  handle: {
    position: 'absolute',
    width: 34,
    height: 8,
    borderRadius: 4,
    right: -2,
    bottom: 8,
    backgroundColor: semanticColors.text.inverse,
    transform: [{ rotate: '45deg' }],
  },
  itemOutline: {
    position: 'absolute',
    bottom: 45,
    width: 130,
    height: 82,
    borderWidth: 2,
    borderColor: semanticColors.border.onInverse,
    borderRadius: rawTokens.radius.medium,
    borderStyle: 'dashed',
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
