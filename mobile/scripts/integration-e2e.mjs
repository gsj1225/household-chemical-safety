/**
 * Agent C 真实接口联调（移动端模块 -> 运行中后端）
 * 用法：后端已用 MockAI 启动在 127.0.0.1:8011，运行本脚本。
 */
import { uploadAssistantQuestion } from '../src/services/assistantApi.ts';
import {
  applySendStart,
  applySendSuccess,
  applySendFailure,
  retryRequest,
} from '../src/view-models/assistant.ts';

const base = {
  platform: 'web',
  apiBase: 'http://127.0.0.1:8011/api',
  headers: { Authorization: 'Bearer itoken' },
};

// 1) 真实端到端：移动端模块 -> 运行中的后端
const real = await uploadAssistantQuestion(
  { question: '怎么清理马桶', history: [] },
  base,
);
console.log('=== 移动端->后端 真实联调 ===');
console.log('answer:', real.answer);
console.log('productName:', real.inventoryAdvice?.[0]?.productName);

// 2) 网络失败：fetch 抛错 -> ApiError(NETWORK_UNAVAILABLE)
const failBase = {
  ...base,
  fetchFn: async () => { throw new Error('Network request failed'); },
};
let state = applySendStart({
  messages: [],
  draft: '洁厕灵能用吗',
  pendingImageUri: null,
  contextProductId: undefined,
  sending: false,
  error: null,
});
console.log('\n=== 网络失败 ===');
try {
  await uploadAssistantQuestion({ question: '洁厕灵能用吗', history: [] }, failBase);
} catch (e) {
  state = applySendFailure(state, e.message);
}
console.log('error:', state.error);
console.log('user消息保留:', state.messages.length === 1 && state.messages[0].role === 'user');

// 3) 重试：复用最后一条用户消息，不重复追加
const req = retryRequest(state);
console.log('\n=== 重试(不重复追加) ===');
console.log('retry question:', req.question, '| user消息数仍为:', state.messages.length);
state = applySendSuccess(state, real);
console.log('重试成功后消息数:', state.messages.length, '(user 1 + assistant 1)');
console.log('user消息重复数:', state.messages.filter((m) => m.role === 'user').length);
