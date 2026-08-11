/**
 * PhotoAssetService — Native 实现
 *
 * 管理产品封面图片的本地存储：
 * - 压缩图片（最长边 1280px，JPEG 0.7）
 * - 去 EXIF
 * - 保存到应用文档目录
 * - 读取/替换/删除/孤儿清理
 */

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import { decideResizeDimension } from '../view-models/intake';

const COVERS_DIR = `${FileSystem.documentDirectory}covers/`;
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

async function ensureCoversDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(COVERS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(COVERS_DIR, { intermediates: true });
  }
}

/**
 * 构建仅限制最长边的缩放操作。
 * 使用 intake.ts 中的 decideResizeDimension 纯函数决定缩放维度。
 */
async function buildResizeAction(sourceUri: string): Promise<{ resize: { width: number } } | { resize: { height: number } } | null> {
  // 先用 manipulateAsync 不带 action 来读取图片信息
  const info = await ImageManipulator.manipulateAsync(sourceUri, [], {});
  return decideResizeDimension(info.width, info.height, MAX_DIMENSION);
}

export interface SavedCover {
  uri: string;
  width: number;
  height: number;
}

export const photoAssetService = {
  /**
   * 从原始 URI 创建并保存压缩封面
   * 去 EXIF，最长边 1280px，JPEG 0.7
   */
  async saveCover(productId: string, sourceUri: string): Promise<SavedCover> {
    await ensureCoversDir();

    const resizeAction = await buildResizeAction(sourceUri);
    const actions = resizeAction ? [resizeAction] : [];
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      actions,
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    const destUri = `${COVERS_DIR}${productId}.jpg`;
    const backupUri = `${COVERS_DIR}${productId}.bak.jpg`;

    // 安全替换：先备份旧封面，复制成功后再删除
    const existing = await FileSystem.getInfoAsync(destUri);
    if (existing.exists) {
      await FileSystem.moveAsync({ from: destUri, to: backupUri });
    }

    try {
      if (result.uri !== destUri) {
        await FileSystem.copyAsync({
          from: result.uri,
          to: destUri,
        });
        await FileSystem.deleteAsync(result.uri, { idempotent: true });
      }
      // 新封面保存成功，删除备份
      const backupInfo = await FileSystem.getInfoAsync(backupUri);
      if (backupInfo.exists) {
        await FileSystem.deleteAsync(backupUri, { idempotent: true });
      }
    } catch (err) {
      // 新封面保存失败，恢复备份
      const backupInfo = await FileSystem.getInfoAsync(backupUri);
      if (backupInfo.exists) {
        await FileSystem.moveAsync({ from: backupUri, to: destUri });
      }
      throw err;
    }

    return {
      uri: destUri,
      width: result.width,
      height: result.height,
    };
  },

  /**
   * 获取封面 URI（如果存在）
   */
  async getCoverUri(productId: string): Promise<string | null> {
    const uri = `${COVERS_DIR}${productId}.jpg`;
    const info = await FileSystem.getInfoAsync(uri);
    // TODO(DEBUG): 定位 Android 冷启动封面加载问题后删除
    console.log(`[getCoverUri] ${productId} exists=${info.exists} uri=${uri}`);
    return info.exists ? uri : null;
  },

  /**
   * 删除封面
   */
  async deleteCover(productId: string): Promise<void> {
    const uri = `${COVERS_DIR}${productId}.jpg`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
  },

  /**
   * 清理孤儿封面：删除不存在于产品列表中的封面文件
   */
  async cleanupOrphanCovers(validProductIds: string[]): Promise<number> {
    await ensureCoversDir();
    const validSet = new Set(validProductIds.map((id) => `${id}.jpg`));

    const files = await FileSystem.readDirectoryAsync(COVERS_DIR);
    let deleted = 0;

    for (const file of files) {
      if (!validSet.has(file)) {
        await FileSystem.deleteAsync(`${COVERS_DIR}${file}`, { idempotent: true });
        deleted++;
      }
    }

    return deleted;
  },

  /**
   * 压缩图片用于上传（临时，不保存）
   */
  async compressForUpload(sourceUri: string): Promise<{ uri: string; type: string; name: string }> {
    const resizeAction = await buildResizeAction(sourceUri);
    const actions = resizeAction ? [resizeAction] : [];
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      actions,
      {
        compress: JPEG_QUALITY,
        format: ImageManipulator.SaveFormat.JPEG,
      },
    );

    return {
      uri: result.uri,
      type: 'image/jpeg',
      name: 'photo.jpg',
    };
  },
};
