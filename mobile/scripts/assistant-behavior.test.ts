/**
 * Assistant 行为测试 — Stage 4
 *
 * 直接导入生产纯函数（view-models/assistant.ts、services/assistantApi.ts），
 * 不复制逻辑。覆盖方案 4 移动端 14 项中的纯逻辑部分；
 * UI 表现（徽章、按钮、跳转）在 Agent C 通过 Expo Web + 真机截图 QA 验证。
 *
 * 覆盖：
 * - Assistant 导航参数可选 contextProductId（编译期校验）
 * - 文本发送 user → assistant 顺序
 * - 照片+文字同时发送
 * - 空输入不可发送
 * - 失败保留用户消息、重试不重复追加
 * - history 只保留最近 12 条
 * - inventoryAdvice productId / generalAdvice / critical / outOfScope 数据流转
 * - contextProductId 带入、发送中禁用、会话可恢复
 * - 上传模块 web 路径（含照片 FormData）与错误映射
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { RootStackParamList } from '../src/types';
import {
  buildAssistantMessage,
  buildSendRequest,
  buildUserMessage,
  canSend,
  applySendStart,
  applySendSuccess,
  applySendFailure,
  attachPhoto,
  clearAttachment,
  setContext,
  toHistoryPayload,
  retryRequest,
  MAX_HISTORY,
  type AssistantUiState,
} from '../src/view-models/assistant.ts';
import {
  uploadAssistantQuestion,
  buildTextFields,
  type AssistantUploadDeps,
} from '../src/services/assistantApi.ts';
import type {
  AssistantMessage,
  AssistantResponse,
} from '../src/types/assistant.ts';

// 编译期校验：Assistant 导航参数接受可选 contextProductId（item 1 / 14）
const _assistantWithContext: RootStackParamList['Assistant'] = { contextProductId: 'p-1' };
const _assistantUndefined: RootStackParamList['Assistant'] = undefined;
void _assistantWithContext;
void _assistantUndefined;

function baseState(over: Partial<AssistantUiState> = {}): AssistantUiState {
  return {
    messages: [],
    draft: '',
    pendingImageUri: null,
    contextProductId: undefined,
    sending: false,
    error: null,
    ...over,
  };
}

const sampleResponse: AssistantResponse = {
  answer: '根据你家仓库，可以用 84 消毒液。',
  needsClarification: false,
  clarificationQuestions: [],
  inventoryAdvice: [
    {
      productId: 'p-84',
      recommendation: 'recommended',
      reason: '84 消毒液适合表面消毒。',
      steps: ['1:10 稀释后使用'],
      cautions: ['避免与洁厕灵混用'],
    },
  ],
  generalAdvice: ['日常表面可用稀释消毒液擦拭。'],
  safetyWarnings: [
    {
      severity: 'critical',
      title: '禁止与洁厕灵混用',
      description: '会产生氯气。',
      relationId: 'r-1',
      recommendedAction: '分开存放',
    },
  ],
  outOfScope: false,
  evidence: ['家庭化学品相容性数据库'],
};

const criticalResponse: AssistantResponse = {
  ...sampleResponse,
  safetyWarnings: [
    {
      severity: 'critical',
      title: '禁止混用',
      description: '会产生有毒气体。',
      relationId: 'r-2',
      recommendedAction: '严禁混用',
    },
  ],
  inventoryAdvice: [],
};

const outOfScopeResponse: AssistantResponse = {
  answer: '这属于紧急情况。',
  needsClarification: false,
  clarificationQuestions: [],
  inventoryAdvice: [],
  generalAdvice: [],
  safetyWarnings: [],
  outOfScope: true,
  evidence: [],
};

// ── 文本发送顺序 ─────────────────────────────────

describe('发送流程', () => {
  test('文本发送形成 user → assistant 消息顺序', () => {
    let s = applySendStart(baseState({ draft: '能和84一起用吗' }));
    assert.equal(s.messages.length, 1);
    assert.equal(s.messages[0].role, 'user');
    assert.equal(s.messages[0].text, '能和84一起用吗');
    assert.equal(s.sending, true);

    s = applySendSuccess(s, sampleResponse);
    assert.equal(s.messages.length, 2);
    assert.equal(s.messages[1].role, 'assistant');
    assert.equal(s.messages[1].response?.answer, sampleResponse.answer);
    assert.equal(s.sending, false);
  });

  test('照片和文字同时发送', () => {
    const s = baseState({ draft: '看看这个', pendingImageUri: 'file:///a.jpg' });
    const req = buildSendRequest(s);
    assert.ok(req);
    assert.equal(req.question, '看看这个');
    assert.equal(req.imageUri, 'file:///a.jpg');

    const started = applySendStart(s);
    assert.equal(started.messages[0].text, '看看这个');
    assert.equal(started.messages[0].imageUri, 'file:///a.jpg');
    assert.equal(started.pendingImageUri, null);
  });

  test('空输入不可发送', () => {
    assert.equal(canSend('', null, false), false);
    assert.equal(buildSendRequest(baseState()), null);
    // 发送中禁用重复发送
    assert.equal(canSend('问题', null, true), false);
  });

  test('失败保留用户消息并显示错误（可重试）', () => {
    let s = applySendStart(baseState({ draft: '问题' }));
    s = applySendFailure(s, '网络错误');
    assert.equal(s.sending, false);
    assert.equal(s.error, '网络错误');
    assert.equal(s.messages.length, 1);
    assert.equal(s.messages[0].role, 'user');
    assert.equal(s.messages[0].text, '问题');
  });

  test('重试不会重复追加用户消息', () => {
    let s = applySendStart(baseState({ draft: '问题' }));
    s = applySendFailure(s, '网络错误');

    const retryReq = retryRequest(s);
    assert.ok(retryReq);
    assert.equal(retryReq.question, '问题');

    // 重试成功只追加 assistant，不再加 user
    s = applySendSuccess(s, sampleResponse);
    const userCount = s.messages.filter((m) => m.role === 'user').length;
    assert.equal(userCount, 1);
    assert.equal(s.messages.length, 2);
  });

  test('发送中按钮禁用（sending 时不可再发）', () => {
    assert.equal(buildSendRequest(baseState({ draft: 'x', sending: true })), null);
    assert.equal(canSend('x', null, true), false);
  });

  test('页面离开后会话状态可恢复', () => {
    let s = applySendStart(baseState({ draft: '问题' }));
    s = applySendSuccess(s, sampleResponse);
    // 模拟重新进入：仅换 context，不重置 messages
    s = setContext(s, 'p-1');
    assert.equal(s.messages.length, 2);
    assert.equal(s.contextProductId, 'p-1');
  });
});

// ── History 截断 ─────────────────────────────────

describe('History 截断', () => {
  test('只保留最近 12 条', () => {
    const many: AssistantMessage[] = Array.from({ length: 15 }, (_, i) =>
      buildUserMessage(`消息${i}`, null),
    );
    const payload = toHistoryPayload(many);
    assert.equal(payload.length, MAX_HISTORY);
    assert.equal(payload[0].text, '消息3');
    assert.equal(payload[payload.length - 1].text, '消息14');
  });

  test('空文本消息不进入 history', () => {
    const msgs = [buildUserMessage('   ', null), buildUserMessage('有效', null)];
    const payload = toHistoryPayload(msgs);
    assert.equal(payload.length, 1);
    assert.equal(payload[0].text, '有效');
  });
});

// ── 响应数据流转 ─────────────────────────────────

describe('响应数据流转', () => {
  test('inventoryAdvice 的 productId 可跳转详情', () => {
    const msg = buildAssistantMessage(sampleResponse);
    assert.ok(msg.response);
    const advice = msg.response.inventoryAdvice[0];
    assert.equal(advice.productId, 'p-84');
    assert.ok(advice.productId.length > 0);
  });

  test('generalAdvice 携带非库存建议', () => {
    const msg = buildAssistantMessage(sampleResponse);
    assert.ok(msg.response);
    assert.ok(msg.response.generalAdvice.length > 0);
  });

  test('critical 警告存在且无库存混用步骤', () => {
    const msg = buildAssistantMessage(criticalResponse);
    assert.ok(msg.response);
    const critical = msg.response.safetyWarnings.find((w) => w.severity === 'critical');
    assert.ok(critical);
    assert.equal(msg.response.inventoryAdvice.length, 0);
  });

  test('outOfScope 不显示产品推荐操作', () => {
    const msg = buildAssistantMessage(outOfScopeResponse);
    assert.ok(msg.response);
    assert.equal(msg.response.outOfScope, true);
    assert.equal(msg.response.inventoryAdvice.length, 0);
  });
});

// ── 上下文与附件 ─────────────────────────────────

describe('上下文与附件', () => {
  test('contextProductId 从详情页带入', () => {
    const s = setContext(baseState(), 'p-detail');
    assert.equal(s.contextProductId, 'p-detail');
  });

  test('附件可挂载与清除', () => {
    const s = attachPhoto(baseState(), 'file:///x.jpg');
    assert.equal(s.pendingImageUri, 'file:///x.jpg');
    const cleared = clearAttachment(s);
    assert.equal(cleared.pendingImageUri, null);
  });
});

// ── 上传模块（web 路径）─────────────────────────

describe('上传模块 web 路径', () => {
  function webDeps(fetchFn: typeof fetch): AssistantUploadDeps {
    return {
      platform: 'web',
      apiBase: 'http://test/api',
      headers: { Authorization: 'Bearer t' },
      fetchFn,
    };
  }

  test('文本字段组装正确（含 JSON history 与 contextProductId）', () => {
    const fields = buildTextFields({
      question: '能混用吗',
      history: [{ role: 'user', text: 'hi' }],
      contextProductId: 'p-1',
    });
    assert.equal(fields.question, '能混用吗');
    assert.equal(fields.contextProductId, 'p-1');
    assert.deepEqual(JSON.parse(fields.history), [{ role: 'user', text: 'hi' }]);
  });

  test('文字+照片经 web FormData 上传并返回解析结果', async () => {
    const fakeFetch = (async (input: any, init: any) => {
      // 第一次调用是抓取 blob 源，无 init
      if (!init) {
        return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
      }
      assert.equal(init.method, 'POST');
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('question'), '能混用吗');
      assert.ok(init.body.get('image'), '应包含 image 字段');
      return new Response(JSON.stringify(sampleResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await uploadAssistantQuestion(
      { question: '能混用吗', history: [], imageUri: 'blob:fake' },
      webDeps(fakeFetch),
    );
    assert.equal(result.answer, sampleResponse.answer);
    assert.equal(result.inventoryAdvice[0].productId, 'p-84');
  });

  test('非 2xx 映射为 ApiError 并提取错误信息', async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({ error: { message: '提问过于频繁，请 30 秒后重试' } }),
        { status: 429 },
      )) as typeof fetch;

    await assert.rejects(
      uploadAssistantQuestion({ question: 'q', history: [] }, webDeps(fakeFetch)),
      (err: any) => err.status === 429 && err.message.includes('提问过于频繁'),
    );
  });
});
