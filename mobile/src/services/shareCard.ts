import { Platform, type View } from 'react-native';
import type React from 'react';

export type SaveShareCardResult = 'saved' | 'permission-denied' | 'unavailable';
export type ShareImageResult = 'shared' | 'unavailable';

export const supportsNativeImageShare = Platform.OS === 'android' || Platform.OS === 'ios';

export async function captureShareCard(
  target: React.RefObject<View | null>,
): Promise<string> {
  if (!supportsNativeImageShare || !target.current) {
    throw new Error('SHARE_CARD_CAPTURE_UNAVAILABLE');
  }

  const { captureRef } = await import('react-native-view-shot');
  return captureRef(target, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
    width: 1080,
    height: 1440,
  });
}

export async function shareShareCardImage(uri: string): Promise<ShareImageResult> {
  if (!supportsNativeImageShare) {
    return 'unavailable';
  }

  const Sharing = await import('expo-sharing');
  if (!(await Sharing.isAvailableAsync())) {
    return 'unavailable';
  }

  await Sharing.shareAsync(uri, {
    dialogTitle: '分享我的家庭化学品检查结果',
    mimeType: 'image/png',
    UTI: 'public.png',
  });
  return 'shared';
}

export async function saveShareCardImage(uri: string): Promise<SaveShareCardResult> {
  if (!supportsNativeImageShare) {
    return 'unavailable';
  }

  const MediaLibrary = await import('expo-media-library');
  const permission = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (!permission.granted) {
    return 'permission-denied';
  }

  await MediaLibrary.Asset.create(uri);
  return 'saved';
}
