export type RecoverableOperation =
  | 'start'
  | 'panorama'
  | 'detail'
  | 'confirm'
  | 'report';

export type FailureKind =
  | 'network'
  | 'timeout'
  | 'rate_limited'
  | 'invalid_photo'
  | 'challenge_expired'
  | 'service'
  | 'unknown';

export interface AppFailure {
  kind: FailureKind;
  code?: string;
  requestId?: string;
  retryAfterSeconds?: number;
}

export interface RecoveryCopy {
  title: string;
  description: string;
}

interface ErrorShape {
  name?: unknown;
  message?: unknown;
  status?: unknown;
  code?: unknown;
  requestId?: unknown;
  retryAfterSeconds?: unknown;
}

const INVALID_PHOTO_CODES = new Set([
  'BAD_REQUEST',
  'EMPTY_IMAGE',
  'IMAGE_PROCESSING_FAILED',
  'IMAGE_TOO_LARGE',
  'INVALID_IMAGE',
  'UNSUPPORTED_IMAGE_TYPE',
]);

const EXPIRED_CONTEXT_CODES = new Set([
  'CHALLENGE_COMPLETED',
  'CHALLENGE_NOT_FOUND',
  'IDENTIFICATION_DRAFT_INVALID',
  'PANORAMA_LOCKED',
  'SCAN_LIMIT_REACHED',
]);

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function toAppFailure(error: unknown): AppFailure {
  const source: ErrorShape =
    typeof error === 'object' && error !== null ? error : {};
  const code = asString(source.code);
  const status = asNumber(source.status);
  const message = asString(source.message) ?? '';
  const requestId = asString(source.requestId);
  const retryAfterSeconds = asNumber(source.retryAfterSeconds);

  let kind: FailureKind = 'unknown';

  if (
    code === 'REQUEST_TIMEOUT'
    || code === 'AI_TIMEOUT'
    || source.name === 'AbortError'
    || message.includes('超时')
  ) {
    kind = 'timeout';
  } else if (
    INVALID_PHOTO_CODES.has(code ?? '')
    || status === 413
    || status === 415
  ) {
    kind = 'invalid_photo';
  } else if (EXPIRED_CONTEXT_CODES.has(code ?? '')) {
    kind = 'challenge_expired';
  } else if (code === 'RATE_LIMITED' || status === 429) {
    kind = 'rate_limited';
  } else if (
    code === 'IMAGE_UPLOAD_FAILED'
    || code === 'NETWORK_UNAVAILABLE'
    || message.includes('无法连接')
    || message.includes('网络')
  ) {
    kind = 'network';
  } else if (typeof status === 'number' && status >= 500) {
    kind = 'service';
  }

  return {
    kind,
    code,
    requestId,
    retryAfterSeconds,
  };
}

const invalidPhotoDescription = (failure: AppFailure): string => {
  if (failure.code === 'IMAGE_TOO_LARGE') {
    return '这张照片文件过大。请重新拍摄，或从相册选择一张更小的照片。';
  }
  if (failure.code === 'UNSUPPORTED_IMAGE_TYPE') {
    return '这张照片的格式暂不支持。请使用相机重新拍摄，或选择 JPEG、PNG、WEBP 照片。';
  }
  return '当前照片过暗、模糊、遮挡严重或暂时无法处理。请换一张更完整、清晰的照片。';
};

export function getRecoveryCopy(
  operation: RecoverableOperation,
  failure: AppFailure,
): RecoveryCopy {
  if (failure.kind === 'challenge_expired') {
    return {
      title: '这次检查已经失效',
      description: '当前内容无法继续提交。返回首页重新开始，不会生成不完整的报告。',
    };
  }

  if (operation === 'start') {
    if (failure.kind === 'rate_limited') {
      return {
        title: '开始得有点频繁',
        description: failure.retryAfterSeconds
          ? `请等待约 ${failure.retryAfterSeconds} 秒后再试。首页内容和历史报告仍可使用。`
          : '请稍等片刻后再试。首页内容和历史报告仍可使用。',
      };
    }
    return {
      title: '暂时没连上检查服务',
      description: '首页内容没有丢失。请检查网络后直接重试。',
    };
  }

  if (failure.kind === 'invalid_photo') {
    return {
      title: '这张图不适合继续分析',
      description: invalidPhotoDescription(failure),
    };
  }

  if (operation === 'panorama') {
    if (failure.kind === 'rate_limited') {
      return {
        title: '这张照片还在排队',
        description: failure.retryAfterSeconds
          ? `照片仍然保留。请等待约 ${failure.retryAfterSeconds} 秒后重试同一张。`
          : '照片仍然保留。请稍等片刻后重试同一张。',
      };
    }
    return {
      title: '这张照片还没分析完成',
      description: failure.kind === 'timeout'
        ? '等待时间超过预期，照片仍然保留。可以直接重试，不需要重新拍摄。'
        : '上传或分析暂时中断，照片仍然保留。可以直接重试同一张。',
    };
  }

  if (operation === 'detail') {
    return {
      title: '这张细拍还没识别成功',
      description: '当前区域和进度已经保留，可以重试这张照片，也可以换一张。',
    };
  }

  if (operation === 'confirm') {
    return {
      title: '这次确认还没有写入',
      description: '你修改的内容已经保留，可以直接再次确认。',
    };
  }

  return {
    title: '报告暂时没有生成',
    description: '已经确认的结果没有丢失，重试只会重新生成报告。',
  };
}

export const shortTraceId = (requestId?: string): string | undefined =>
  requestId ? requestId.slice(0, 8) : undefined;

export const recoveryAnnounceKey = (
  operation: RecoverableOperation,
  failure: AppFailure,
): string =>
  [operation, failure.kind, failure.code, failure.requestId]
    .filter(Boolean)
    .join(':');
