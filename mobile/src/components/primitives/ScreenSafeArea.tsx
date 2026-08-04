/**
 * ScreenSafeArea — 页面级安全区容器
 *
 * 使用 react-native-safe-area-context 的 SafeAreaView，
 * 默认处理 top/right/bottom/left 四个方向。
 * 样式只负责 flex: 1 和语义页面背景。
 *
 * 各页面原有 header 的 paddingTop 作为安全区之后的视觉间距保留。
 * ScreenScroll 的底部间距也继续保持。
 * 不使用 StatusBar.currentHeight、硬编码 paddingTop 或 translucent=false。
 */

import React, { type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { semanticColors } from '../../theme/tokens';
import type { Edge } from 'react-native-safe-area-context';

interface ScreenSafeAreaProps {
  children: ReactNode;
  /** 需要应用安全区插值的边，默认四边全部 */
  edges?: Edge[];
  /** 覆盖页面背景色，默认使用 semanticColors.surface.page */
  backgroundColor?: string;
}

export default function ScreenSafeArea({
  children,
  edges,
  backgroundColor,
}: ScreenSafeAreaProps) {
  return (
    <SafeAreaView
      edges={edges ?? ['top', 'right', 'bottom', 'left']}
      style={[
        styles.root,
        { backgroundColor: backgroundColor ?? semanticColors.surface.page },
      ]}
    >
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});