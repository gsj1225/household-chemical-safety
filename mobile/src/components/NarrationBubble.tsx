/**
 * 趣味旁白气泡组件
 * 逐条显示旁白文本，带淡入效果
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors } from '../theme/colors';
import { fontSize, spacing, borderRadius } from '../theme/spacing';

interface NarrationBubbleProps {
  narrations: string[];
}

export default function NarrationBubble({ narrations }: NarrationBubbleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (narrations.length === 0) return;
    setCurrentIndex(0);
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    const timers: ReturnType<typeof setTimeout>[] = [];
    narrations.forEach((_, i) => {
      if (i === 0) return;
      timers.push(
        setTimeout(() => {
          fadeAnim.setValue(0);
          setCurrentIndex(i);
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, i * 1200)
      );
    });
    return () => timers.forEach(clearTimeout);
  }, [narrations]);

  if (narrations.length === 0) return null;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.bubble, { opacity: fadeAnim }]}
      >
        <Text style={styles.text}>
          {narrations[currentIndex] || narrations[0]}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  bubble: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    maxWidth: '90%',
  },
  text: {
    color: colors.textWhite,
    fontSize: fontSize.md,
    textAlign: 'center',
    lineHeight: 24,
  },
});
