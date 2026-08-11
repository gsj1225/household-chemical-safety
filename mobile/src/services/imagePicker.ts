/** 系统相册单图选择 / 相机拍照（含权限拒绝结果）。 */

import * as ImagePicker from 'expo-image-picker';

export type PhotoPickResult =
  | { status: 'picked'; uri: string }
  | { status: 'cancelled' }
  | { status: 'denied' };

async function launch(options: ImagePicker.ImagePickerOptions): Promise<PhotoPickResult> {
  const result = await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { status: 'cancelled' };
  const uri = result.assets[0]?.uri;
  return uri ? { status: 'picked', uri } : { status: 'cancelled' };
}

/** 从系统相册选择一张图片。 */
export async function pickImageFromLibrary(): Promise<PhotoPickResult> {
  return launch({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });
}

/**
 * 用系统相机拍照。
 * 权限被拒绝时返回 { status: 'denied' }，由调用方提示用户。
 */
export async function takePhotoFromCamera(): Promise<PhotoPickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    return { status: 'denied' };
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
  });
  if (result.canceled) return { status: 'cancelled' };
  const uri = result.assets[0]?.uri;
  return uri ? { status: 'picked', uri } : { status: 'cancelled' };
}
