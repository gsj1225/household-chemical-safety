/**
 * 统一 API 请求封装 — v2.0
 *
 * 所有 API 客户端（inventoryApi、compatibilityApi、intakeStore）
 * 共用此模块，自动注入 Bearer 演示令牌和基础 URL。
 *
 * 安全说明：
 * EXPO_PUBLIC_DEMO_ACCESS_TOKEN 编译时嵌入 APK，可被逆向提取。
 * 它不是正式安全秘密，仅用于比赛演示期间的访问控制。
 * 比赛后必须立即轮换后端 DEMO_ACCESS_TOKEN。
 * 正式产品必须改用用户认证（OAuth/OIDC）替代静态令牌。
 */

import { ApiError } from './errors.ts';

// ── 配置 ──────────────────────────────────────────

export const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
).replace(/\/$/, '');

export const DEMO_TOKEN = process.env.EXPO_PUBLIC_DEMO_ACCESS_TOKEN ?? '';

const REQUEST_TIMEOUT_MS = 15_000;

// ── 通用请求函数 ──────────────────────────────────

/**
 * 发送 API 请求，自动附加 Bearer 令牌和超时控制。
 *
 * 此函数为所有 API 请求的唯一出口，确保令牌注入的一致性。
 */
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // 合并 headers，注入 Authorization
  const headers = new Headers(init.headers);
  if (DEMO_TOKEN) {
    headers.set('Authorization', `Bearer ${DEMO_TOKEN}`);
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `请求失败 (${response.status})`;
      let code: string | undefined;
      try {
        const body = await response.json();
        if (typeof body?.error?.message === 'string') detail = body.error.message;
        if (typeof body?.error?.code === 'string') code = body.error.code;
      } catch {
        // 非 JSON 错误响应
      }
      throw new ApiError(detail, response.status, code);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('请求超时，请检查网络后重试', undefined, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('无法连接服务，请检查网络后重试', undefined, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 构建 Authorization 头（供 intakeStore 的原生 fetch 调用使用）。
 */
/**
 * 构建 Authorization 头（纯函数，可测试）。
 *
 * @param token - Bearer 令牌值
 * @param extra - 额外请求头
 * @returns 合并后的请求头对象
 */
export function buildAuthHeaders(token: string, extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 构建 Authorization 头（供 intakeStore 的原生 fetch 调用使用）。
 * 从环境变量读取令牌，委托给 buildAuthHeaders。
 */
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return buildAuthHeaders(DEMO_TOKEN, extra);
}
