import React from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { semanticColors, rawTokens, componentTokens } from '../../theme/tokens';
import AppText from '../primitives/AppText';

interface ProductPhotoProps {
  /** 本地封面缩略图 URI，null 表示缺失 */
  uri: string | null;
  /** 产品名称，用于占位符显示 */
  productName: string;
  /** 容器宽度，默认 160 */
  width?: number;
}

/**
 * 产品照片组件——3:4 容器 contain 展示
 * 缺失图片时显示占位状态
 */
export default function ProductPhoto({
  uri,
  productName,
  width = 160,
}: ProductPhotoProps) {
  const height = (width * 4) / 3;

  if (!uri) {
    return (
      <View
        style={[styles.placeholder, { width, height }]}
        accessibilityLabel={`产品照片缺失：${productName}`}
        accessibilityRole="image"
      >
        <AppText variant="caption" color="muted" align="center">
          暂无照片
        </AppText>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { width, height }]}
      accessibilityLabel={`产品照片：${productName}`}
      accessibilityRole="image"
    >
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: rawTokens.radius.large,
    overflow: 'hidden',
    backgroundColor: semanticColors.surface.subtle,
  },
  image: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    borderRadius: componentTokens.surface.radius,
    backgroundColor: semanticColors.surface.subtle,
    borderWidth: 2,
    borderColor: semanticColors.border.default,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
