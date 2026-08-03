/**
 * PhotoAssetService — Web 实现
 *
 * Web 平台使用 Blob URL 和 IndexedDB 替代文件系统。
 * 与 Native 实现保持相同接口。
 */

const COVERS_DB = 'covers-db';
const COVERS_STORE = 'covers';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(COVERS_DB, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COVERS_STORE)) {
        db.createObjectStore(COVERS_STORE);
      }
    };
  });
}

async function getFromDb(productId: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COVERS_STORE, 'readonly');
      const store = tx.objectStore(COVERS_STORE);
      const req = store.get(productId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function putToDb(productId: string, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COVERS_STORE, 'readwrite');
    const store = tx.objectStore(COVERS_STORE);
    store.put(blob, productId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromDb(productId: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(COVERS_STORE, 'readwrite');
      const store = tx.objectStore(COVERS_STORE);
      store.delete(productId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // 忽略删除失败
  }
}

async function getAllKeys(): Promise<string[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(COVERS_STORE, 'readonly');
    const store = tx.objectStore(COVERS_STORE);
    const req = store.getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

export interface SavedCover {
  uri: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.7;

async function compressImage(uri: string): Promise<{ blob: Blob; width: number; height: number }> {
  // 加载图片
  const img = new Image();
  img.src = uri;
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  // 计算缩放
  let { width, height } = img;
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    if (width >= height) {
      height = Math.round((height * MAX_DIMENSION) / width);
      width = MAX_DIMENSION;
    } else {
      width = Math.round((width * MAX_DIMENSION) / height);
      height = MAX_DIMENSION;
    }
  }

  // 绘制到 canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, width, height);

  // 转 Blob
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
      'image/jpeg',
      JPEG_QUALITY,
    );
  });

  return { blob, width, height };
}

export const photoAssetService = {
  async saveCover(productId: string, sourceUri: string): Promise<SavedCover> {
    const { blob, width, height } = await compressImage(sourceUri);
    await putToDb(productId, blob);
    const uri = URL.createObjectURL(blob);
    return { uri, width, height };
  },

  async getCoverUri(productId: string): Promise<string | null> {
    const blob = await getFromDb(productId);
    if (!blob) return null;
    return URL.createObjectURL(blob);
  },

  async deleteCover(productId: string): Promise<void> {
    await deleteFromDb(productId);
  },

  async cleanupOrphanCovers(validProductIds: string[]): Promise<number> {
    const validSet = new Set(validProductIds);
    const keys = await getAllKeys();
    let deleted = 0;
    for (const key of keys) {
      if (!validSet.has(key)) {
        await deleteFromDb(key);
        deleted++;
      }
    }
    return deleted;
  },

  async compressForUpload(sourceUri: string): Promise<{ uri: string; type: string; name: string }> {
    const { blob } = await compressImage(sourceUri);
    const uri = URL.createObjectURL(blob);
    return { uri, type: 'image/jpeg', name: 'photo.jpg' };
  },
};
