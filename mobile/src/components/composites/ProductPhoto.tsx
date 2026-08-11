import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Image, ActivityIndicator } from 'react-native';
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

type LoadStatus = 'loading' | 'loaded' | 'error';

/** 加载失败后的本地重试次数上限（Android 冷启动首次解码可能失败） */
const MAX_LOCAL_RETRY = 1;
/** 失败后重试延迟（ms） */
const RETRY_DELAY_MS = 200;

/**
 * 产品照片组件——3:4 容器 contain 展示
 * 缺失图片时显示占位状态；图片加载含 loading/loaded/error 三态，
 * 失败时本地延迟重试一次，避免 Android 冷启动首次解码竞态导致空白灰块。
 */
export default function ProductPhoto({
  uri,
  productName,
  width = 160,
}: ProductPhotoProps) {
  const height = (width * 4) / 3;
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [retryCount, setRetryCount] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URI 改变时重置加载状态和重试计数
  useEffect(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    setStatus('loading');
    setRetryCount(0);
  }, [uri]);

  // 加载失败后本地延迟重试一次（不无限重试）
  useEffect(() => {
    if (status === 'error' && retryCount < MAX_LOCAL_RETRY) {
      retryTimer.current = setTimeout(() => {
        setRetryCount((c) => c + 1);
        setStatus('loading');
      }, RETRY_DELAY_MS);
      return () => {
        if (retryTimer.current) clearTimeout(retryTimer.current);
      };
    }
  }, [status, retryCount]);

  // 卸载时清理定时器
  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, []);

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

  const showErrorPlaceholder = status === 'error' && retryCount >= MAX_LOCAL_RETRY;

  return (
    <View
      style={[styles.container, { width, height }]}
      accessibilityLabel={`产品照片：${productName}`}
      accessibilityRole="image"
    >
      <Image
        key={`${uri}-${retryCount}`}
        source={{ uri }}
        style={styles.image}
        resizeMode="cover"
        onLoadStart={() => {
          console.log(`[ProductPhoto] onLoadStart: ${productName} ${uri}`);
          setStatus('loading');
        }}
        onLoad={() => {
          console.log(`[ProductPhoto] onLoad: ${productName}`);
          setStatus('loaded');
        }}
        onError={(e) => {
          console.log(`[ProductPhoto] onError: ${productName} ${uri}`, e.nativeEvent?.error);
          setStatus('error');
        }}
      />
      {status === 'loading' ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="small" color={semanticColors.text.secondary} />
        </View>
      ) : null}
      {showErrorPlaceholder ? (
        <View style={styles.overlay} pointerEvents="none">
          <AppText variant="caption" color="muted" align="center">
            图片加载失败
          </AppText>
        </View>
      ) : null}
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.subtle,
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
