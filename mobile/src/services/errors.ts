/**
 * API 错误类型 — v2.0
 *
 * 从原 api.ts 中提取，供所有 V2 服务和 store 共享。
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly code?: string,
    public readonly requestId?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
