/**
 * 放大镜小人动画组件
 * 识别等待期间显示——小人在物品上查来查去 + 趣味旁白
 */

import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing, ImageBackground,
} from 'react-native';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';
import NarrationBubble from './NarrationBubble';

interface MagnifierAnimationProps {
  narrations: string[];
  imageUri: string | null;
}

export default function MagnifierAnimation({
  narrations, imageUri,
}: MagnifierAnimationProps) {
  const moveAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  // 小人左右移动 + 缓动
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(moveAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(moveAnim, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [moveAnim]);

  // 缩放（呼吸感）
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.2,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scaleAnim]);

  // 轻微旋转（摇头晃脑）
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rotateAnim]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scanAnim, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scanAnim, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [scanAnim]);

  const translateX = moveAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-50, 50],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-15deg', '0deg', '15deg'],
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
    >
      <View style={styles.overlay} />
      <View style={styles.content}>
        <View style={styles.statusBadge}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>正在分析这张照片</Text>
        </View>

        {/* 动画区域 */}
        <View style={styles.animationArea}>
          <Animated.View
            style={[styles.scanLine, { transform: [{ translateY: scanTranslateY }] }]}
          />

          {/* 放大镜小人 */}
          <Animated.View
            style={[
              styles.magnifierContainer,
              {
                transform: [
                  { translateX },
                  { scale: scaleAnim },
                  { rotate },
                ],
              },
            ]}
          >
            <Text style={styles.magnifierEmoji}>🔍</Text>
          </Animated.View>

          <View style={styles.itemOutline} />
        </View>

        <View style={styles.narrationArea}>
          <NarrationBubble narrations={narrations} />
        </View>

        <Text style={styles.loadingText}>正在识别物品和包装文字…</Text>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
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
    backgroundColor: 'rgba(8, 16, 30, 0.48)',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 999,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
    marginRight: spacing.sm,
  },
  statusText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  animationArea: {
    width: '92%',
    maxWidth: 520,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
    borderRadius: 1,
    shadowColor: colors.primary,
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  magnifierContainer: {
    zIndex: 2,
  },
  magnifierEmoji: {
    fontSize: 64,
  },
  itemOutline: {
    position: 'absolute',
    bottom: 45,
    width: 130,
    height: 82,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    borderRadius: 12,
    borderStyle: 'dashed',
  },
  narrationArea: {
    minHeight: 80,
    justifyContent: 'center',
    width: '100%',
    marginBottom: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textWhite,
    marginTop: spacing.sm,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowRadius: 4,
  },
});
