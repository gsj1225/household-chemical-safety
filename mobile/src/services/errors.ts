/**
 * API 错误类型 — v2.0
 *
 * 从原 api.ts 中提取，供所有 V2 服务和 store 共享。
 */

export class ApiError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(
    message: string,
    status?: number,
    code?: string,
    requestId?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
