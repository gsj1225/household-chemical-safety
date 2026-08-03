/**
 * 稳定操作 ID 管理
 *
 * 在一次编辑/删除尝试中，首次触发时生成 operationId，
 * 后续重试复用同一 ID，确保服务端幂等检测能正确识别。
 * 操作成功、取消或请求内容改变后重置。
 */

let _counter = 0;

export function generateStableOperationId(prefix: string = 'op'): string {
  _counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_counter.toString(36)}`;
}

/**
 * 决定是否应该重置操作 ID。
 *
 * 当请求内容与上次尝试不同时，应重置以避免服务端幂等冲突。
 *
 * @param currentSnapshot 当前请求内容的快照字符串
 * @param lastSnapshot 上次保存尝试的快照字符串（null 表示首次尝试）
 * @returns true 表示应重置操作 ID
 */
export function shouldResetOperationId(
  currentSnapshot: string,
  lastSnapshot: string | null,
): boolean {
  if (lastSnapshot === null) return false; // 首次尝试，不需要重置
  return currentSnapshot !== lastSnapshot; // 内容改变，需要重置
}
