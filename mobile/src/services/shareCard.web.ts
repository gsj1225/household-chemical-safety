import type React from 'react';
import type { View } from 'react-native';

export type SaveShareCardResult = 'saved' | 'permission-denied' | 'unavailable';
export type ShareImageResult = 'shared' | 'unavailable';

export const supportsNativeImageShare = false;

export async function captureShareCard(
  _target: React.RefObject<View | null>,
): Promise<string> {
  throw new Error('SHARE_CARD_CAPTURE_UNAVAILABLE');
}

export async function shareShareCardImage(_uri: string): Promise<ShareImageResult> {
  return 'unavailable';
}

export async function saveShareCardImage(_uri: string): Promise<SaveShareCardResult> {
  return 'unavailable';
}
