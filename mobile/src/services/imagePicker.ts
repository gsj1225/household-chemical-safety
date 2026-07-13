/** 系统相册单图选择。 */

import * as ImagePicker from 'expo-image-picker';

export async function pickImageFromLibrary(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    allowsMultipleSelection: false,
    quality: 1,
  });
  return result.canceled ? null : result.assets[0]?.uri ?? null;
}
