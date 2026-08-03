import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRecoveryCopy,
  shortTraceId,
  toAppFailure,
} from '../src/utils/recovery.ts';

test('maps timeouts without exposing the raw error message', () => {
  const failure = toAppFailure({
    message: '模型内部连接细节',
    code: 'AI_TIMEOUT',
    status: 504,
    requestId: '1234567890abcdef',
  });

  assert.equal(failure.kind, 'timeout');
  assert.equal(shortTraceId(failure.requestId), '12345678');
  assert.equal(
    getRecoveryCopy('panorama', failure).description.includes('内部连接'),
    false,
  );
});

test('maps invalid image errors to replacement-first recovery', () => {
  const failure = toAppFailure({
    message: 'payload rejected',
    code: 'IMAGE_TOO_LARGE',
    status: 413,
  });

  assert.equal(failure.kind, 'invalid_photo');
  assert.match(getRecoveryCopy('panorama', failure).description, /文件过大/);
});

test('maps connection failures to retryable network recovery', () => {
  const failure = toAppFailure({
    message: '无法连接检查服务',
    code: 'IMAGE_UPLOAD_FAILED',
  });

  assert.equal(failure.kind, 'network');
  assert.match(getRecoveryCopy('panorama', failure).description, /重试同一张/);
});

test('does not mistake a generic validation failure for a bad photo', () => {
  const failure = toAppFailure({
    message: 'request fields rejected',
    code: 'VALIDATION_ERROR',
    status: 422,
  });

  assert.equal(failure.kind, 'unknown');
});

test('maps expired challenge errors to restart recovery', () => {
  const failure = toAppFailure({
    message: 'not found',
    code: 'CHALLENGE_NOT_FOUND',
    status: 404,
  });

  assert.equal(failure.kind, 'challenge_expired');
  assert.match(getRecoveryCopy('panorama', failure).title, /已经失效/);
});

test('uses retry-after in rate-limit copy', () => {
  const failure = toAppFailure({
    code: 'RATE_LIMITED',
    status: 429,
    retryAfterSeconds: 12,
  });

  assert.equal(failure.kind, 'rate_limited');
  assert.match(getRecoveryCopy('start', failure).description, /12 秒/);
});
