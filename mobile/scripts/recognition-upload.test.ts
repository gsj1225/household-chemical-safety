/**
 * recognitionUpload 生产逻辑测试
 *
 * 直接导入 src/services/recognitionUpload.ts（该模块不依赖 react-native/expo，
 * 平台能力全部通过 deps 注入）。
 *
 * 覆盖（对应 Android 真机修复）：
 * - 原生路径调用 uploadFn（uploadAsync 封装）
 * - Authorization 请求头注入原生上传
 * - multipart 字段名为 image、URL 拼接正确
 * - 非 2xx 状态映射（含 error.message 提取）
 * - 返回体非法 JSON 映射 INVALID_RESPONSE
 * - 45 秒超时映射 REQUEST_TIMEOUT
 * - Web 路径使用 fetch + FormData
 * - 网络错误映射 NETWORK_UNAVAILABLE
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  uploadRecognitionPhoto,
  RECOGNITION_TIMEOUT_MS,
  type NativeUploadFn,
  type RecognitionUploadDeps,
  type UploadPhoto,
} from '../src/services/recognitionUpload.ts';
import { ApiError } from '../src/services/errors.ts';
import type { RecognitionDraft } from '../src/types/inventory.ts';

// ── 公共夹具 ──────────────────────────────────────

const PHOTO: UploadPhoto = { uri: 'file:///cache/compressed.jpg', type: 'image/jpeg', name: 'photo.jpg' };

const MOCK_DRAFT = {
  draftId: 'draft-test-1',
  observations: [],
  proposedProduct: { brand: '84', name: '消毒液', category: 'disinfectant' },
  missingRequiredFields: [],
  lowConfidenceFields: [],
  duplicateCandidates: [],
  createdAt: '2026-08-06T00:00:00.000Z',
} as unknown as RecognitionDraft;

function baseDeps(overrides: Partial<RecognitionUploadDeps> = {}): RecognitionUploadDeps {
  return {
    platform: 'android',
    apiBase: 'https://api.example.com/api',
    headers: { Authorization: 'Bearer test-token' },
    ...overrides,
  };
}

// ── 原生路径 ──────────────────────────────────────

describe('原生路径（uploadAsync）', () => {
  test('调用 uploadFn，URL、字段名、MIME、Authorization 均正确', async () => {
    let captured: { url: string; fileUri: string; options: Record<string, unknown> } | null = null;
    const uploadFn: NativeUploadFn = (url, fileUri, options) => {
      captured = { url, fileUri, options: options as Record<string, unknown> };
      return Promise.resolve({ status: 200, body: JSON.stringify(MOCK_DRAFT) });
    };

    const result = await uploadRecognitionPhoto(PHOTO, baseDeps({ uploadFn }));

    assert.deepStrictEqual(result, MOCK_DRAFT);
    assert.ok(captured !== null);
    assert.strictEqual(captured!.url, 'https://api.example.com/api/inventory/recognition/recognize');
    assert.strictEqual(captured!.fileUri, PHOTO.uri);
    assert.strictEqual(captured!.options.httpMethod, 'POST');
    assert.strictEqual(captured!.options.uploadType, 'multipart');
    assert.strictEqual(captured!.options.fieldName, 'image');
    assert.strictEqual(captured!.options.mimeType, 'image/jpeg');
    assert.deepStrictEqual(captured!.options.headers, { Authorization: 'Bearer test-token' });
  });

  test('非 2xx 状态映射 ApiError，提取 error.message', async () => {
    const uploadFn: NativeUploadFn = () =>
      Promise.resolve({
        status: 429,
        body: JSON.stringify({ error: { code: 'RATE_LIMITED', message: '识别请求过于频繁，请 30 秒后重试' } }),
      });

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ uploadFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 429);
        assert.strictEqual(err.message, '识别请求过于频繁，请 30 秒后重试');
        return true;
      },
    );
  });

  test('非 2xx 且无 error.message 时使用默认详情', async () => {
    const uploadFn: NativeUploadFn = () =>
      Promise.resolve({ status: 500, body: 'Internal Server Error' });

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ uploadFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 500);
        assert.strictEqual(err.message, '识别失败 (500)');
        return true;
      },
    );
  });

  test('2xx 但返回体非法 JSON 映射 INVALID_RESPONSE', async () => {
    const uploadFn: NativeUploadFn = () =>
      Promise.resolve({ status: 200, body: '<html>not json</html>' });

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ uploadFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.code, 'INVALID_RESPONSE');
        return true;
      },
    );
  });

  test('超时映射 REQUEST_TIMEOUT（默认 45 秒）', async () => {
    let capturedDelay: number | null = null;
    let abortFn: (() => void) | null = null;
    const setTimeoutFn = ((fn: () => void, delay: number) => {
      capturedDelay = delay;
      abortFn = fn;
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout;

    // uploadFn 永不 resolve，只能靠超时打断
    const uploadFn: NativeUploadFn = () => new Promise(() => {});

    const promise = uploadRecognitionPhoto(
      PHOTO,
      baseDeps({ uploadFn, setTimeoutFn, clearTimeoutFn: (() => {}) as typeof clearTimeout }),
    );

    assert.strictEqual(capturedDelay, RECOGNITION_TIMEOUT_MS);
    assert.strictEqual(RECOGNITION_TIMEOUT_MS, 45_000);
    assert.ok(abortFn !== null);
    abortFn!();

    await assert.rejects(promise, (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.strictEqual(err.code, 'REQUEST_TIMEOUT');
      assert.strictEqual(err.message, '识别超时，请重试');
      return true;
    });
  });

  test('原生上传抛错映射 NETWORK_UNAVAILABLE', async () => {
    const uploadFn: NativeUploadFn = () => Promise.reject(new Error('Network request failed'));

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ uploadFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.code, 'NETWORK_UNAVAILABLE');
        assert.strictEqual(err.message, '无法连接识别服务');
        return true;
      },
    );
  });

  test('未注入 uploadFn 时报配置错误', async () => {
    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps()),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.code, 'UPLOAD_NOT_CONFIGURED');
        return true;
      },
    );
  });
});

// ── Web 路径 ──────────────────────────────────────

describe('Web 路径（fetch + FormData）', () => {
  test('使用 fetch 发送 FormData，不调用 uploadFn', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = ((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === PHOTO.uri) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])])) });
      }
      return Promise.resolve(
        new Response(JSON.stringify(MOCK_DRAFT), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    let uploadFnCalled = false;
    const uploadFn: NativeUploadFn = () => {
      uploadFnCalled = true;
      return Promise.resolve({ status: 200, body: '{}' });
    };

    const result = await uploadRecognitionPhoto(
      PHOTO,
      baseDeps({ platform: 'web', fetchFn, uploadFn }),
    );

    assert.deepStrictEqual(result, MOCK_DRAFT);
    assert.strictEqual(uploadFnCalled, false);
    // 第一次 fetch 取照片 blob，第二次 POST 识别
    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].url, PHOTO.uri);
    assert.strictEqual(calls[1].url, 'https://api.example.com/api/inventory/recognition/recognize');
    assert.strictEqual(calls[1].init?.method, 'POST');
    assert.ok(calls[1].init?.body instanceof FormData);
    assert.deepStrictEqual(calls[1].init?.headers, { Authorization: 'Bearer test-token' });
  });

  test('Web 非 2xx 响应提取 error.message', async () => {
    const fetchFn = ((url: string) => {
      if (url === PHOTO.uri) {
        return Promise.resolve({ blob: () => Promise.resolve(new Blob([new Uint8Array([1])])) });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: '无效或缺失的访问令牌' } }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }) as unknown as typeof fetch;

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ platform: 'web', fetchFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.status, 401);
        assert.strictEqual(err.message, '无效或缺失的访问令牌');
        return true;
      },
    );
  });

  test('Web fetch 网络错误映射 NETWORK_UNAVAILABLE', async () => {
    const fetchFn = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;

    await assert.rejects(
      () => uploadRecognitionPhoto(PHOTO, baseDeps({ platform: 'web', fetchFn })),
      (err: unknown) => {
        assert.ok(err instanceof ApiError);
        assert.strictEqual(err.code, 'NETWORK_UNAVAILABLE');
        return true;
      },
    );
  });
});
