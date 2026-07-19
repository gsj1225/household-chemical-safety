import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import useReducedMotion from '../hooks/useReducedMotion';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../theme/tokens';
import { AppText } from './primitives';

interface NarrationBubbleProps {
  narrations: string[];
}

const USE_NATIVE_DRIVER = Platform.OS !== 'web';

export default function NarrationBubble({ narrations }: NarrationBubbleProps) {
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (narrations.length === 0) return;
    setCurrentIndex(0);

    if (reducedMotion) {
      fadeAnim.setValue(1);
    } else {
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: USE_NATIVE_DRIVER,
      }).start();
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    narrations.forEach((_, index) => {
      if (index === 0) return;
      timers.push(setTimeout(() => {
        setCurrentIndex(index);
        if (reducedMotion) {
          fadeAnim.setValue(1);
          return;
        }
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: USE_NATIVE_DRIVER,
        }).start();
      }, index * 1200));
    });

    return () => timers.forEach(clearTimeout);
  }, [fadeAnim, narrations, reducedMotion]);

  if (narrations.length === 0) return null;

  return (
    <View style={styles.container}>
      <Animated.View
        style={[styles.bubble, { opacity: fadeAnim }]}
        accessibilityLiveRegion="polite"
      >
        <AppText align="center">
          {narrations[currentIndex] || narrations[0]}
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: rawTokens.space[5],
  },
  bubble: {
    backgroundColor: semanticColors.surface.glass,
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.onInverse,
    borderRadius: rawTokens.radius.large,
    paddingVertical: rawTokens.space[3],
    paddingHorizontal: rawTokens.space[5],
    maxWidth: '90%',
  },
});
