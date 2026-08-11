/**
 * Agent C 移动端客户端集成联调 — 六状态可复现
 *
 * 自包含：不依赖运行中的后端服务器、不依赖任何未跟踪文件。
 * 通过模拟后端响应驱动真实移动端模块（services/assistantApi.ts +
 * view-models/assistant.ts）逐一验证六个生产状态：
 *   1. 库存产品推荐   2. 通用建议   3. 信息不足追问
 *   4. 禁止混用       5. 超范围拒答   6. 网络失败重试
 *
 * 任一断言失败会令 process.exitCode = 1（非零退出）。运行：
 *   cd mobile && node --experimental-strip-types scripts/integration-e2e.mjs
 */

import assert from 'node:assert/strict';
import { uploadAssistantQuestion, buildTextFields } from '../src/services/assistantApi.ts';
import {
  applySendStart,
  applySendSuccess,
  applySendFailure,
  buildSendRequest,
  retryRequest,
} from '../src/view-models/assistant.ts';

const base = {
  platform: 'web',
  apiBase: 'http://backend.invalid/api', // 不会真的请求
  headers: { Authorization: 'Bearer itoken' },
};

/** 用给定响应体模拟后端，返回 fetch 包装的 deps */
function depsWith(body) {
  return {
    ...base,
    fetchFn: async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  };
}

const states = {
  // 1. 库存推荐
  stock: {
    answer: '用洗衣液。',
    needsClarification: false,
    clarificationQuestions: [],
    inventoryAdvice: [
      { productId: 'p-xy', productName: '蓝月亮洗衣液', recommendation: 'recommended', reason: '适合', steps: ['佩戴手套'], cautions: [] },
    ],
    generalAdvice: ['通用建议：注意通风。'],
    safetyWarnings: [],
    outOfScope: false,
    evidence: [],
  },
  // 2. 通用建议
  general: {
    answer: '先看标签。',
    needsClarification: false,
    clarificationQuestions: [],
    inventoryAdvice: [],
    generalAdvice: ['通用建议：使用前阅读标签。'],
    safetyWarnings: [],
    outOfScope: false,
    evidence: [],
  },
  // 3. 追问
  clarify: {
    answer: '需要更多信息。',
    needsClarification: true,
    clarificationQuestions: ['你想处理什么场景？', '标签还有哪些成分？'],
    inventoryAdvice: [],
    generalAdvice: [],
    safetyWarnings: [],
    outOfScope: false,
    evidence: [],
  },
  // 4. 禁止混用（critical + 无混用步骤）
  mixing: {
    answer: '两件分开用。',
    needsClarification: false,
    clarificationQuestions: [],
    inventoryAdvice: [
      { productId: 'p-jc', productName: '威猛先生洁厕灵', recommendation: 'recommended', reason: '洁厕', steps: ['倒入洁厕剂'], cautions: [] },
      { productId: 'p-84', productName: '84消毒液', recommendation: 'recommended', reason: '消毒', steps: ['稀释后擦拭'], cautions: [] },
    ],
    generalAdvice: ['通用建议：注意通风。'],
    safetyWarnings: [{ severity: 'critical', title: '禁止混用', description: '会产生氯气', relationId: 'r-1', recommendedAction: '分开使用' }],
    outOfScope: false,
    evidence: ['禁止混用'],
  },
  // 5. 超范围
  out: {
    answer: '无法提供处理建议。',
    needsClarification: false,
    clarificationQuestions: [],
    inventoryAdvice: [],
    generalAdvice: [],
    safetyWarnings: [],
    outOfScope: true,
    evidence: [],
  },
};

async function run() {
  let failures = 0;
  async function check(name, fn) {
    try {
      await fn();
      console.log(`[PASS] ${name}`);
    } catch (e) {
      failures += 1;
      console.error(`[FAIL] ${name}`);
      console.error(`       ${e.message}`);
    }
  }

  // 1. 库存推荐
  await check('状态1 库存推荐：productName 由后端返回', async () => {
  const r = await uploadAssistantQuestion({ question: '怎么清理', history: [] }, depsWith(states.stock));
  assert.equal(r.inventoryAdvice[0].productName, '蓝月亮洗衣液');
  assert.equal(r.inventoryAdvice[0].recommendation, 'recommended');
});

  // 2. 通用建议
  await check('状态2 通用建议：generalAdvice 非空', async () => {
  const r = await uploadAssistantQuestion({ question: '怎么处理', history: [] }, depsWith(states.general));
  assert.ok(r.generalAdvice.length > 0);
});

  // 3. 追问
  await check('状态3 追问：needsClarification + 追问列表', async () => {
  const r = await uploadAssistantQuestion({ question: '不确定', history: [] }, depsWith(states.clarify));
  assert.equal(r.needsClarification, true);
  assert.ok(r.clarificationQuestions.length > 0);
  assert.equal(r.inventoryAdvice.length, 0);
});

  // 4. 禁止混用
  await check('状态4 禁止混用：critical 警告 + 无混用步骤', async () => {
  const r = await uploadAssistantQuestion({ question: '能混用吗', history: [] }, depsWith(states.mixing));
  const critical = r.safetyWarnings.find((w) => w.severity === 'critical');
  assert.ok(critical);
  const mixWords = ['混合', '一起用', '同时用', '连用'];
  for (const a of r.inventoryAdvice) {
    for (const s of a.steps) {
      assert.ok(!mixWords.some((w) => s.includes(w)), `步骤含混用关键词: ${s}`);
    }
  }
});

  // 5. 超范围
  await check('状态5 超范围：outOfScope 且无产品建议', async () => {
  const r = await uploadAssistantQuestion({ question: '误食怎么办', history: [] }, depsWith(states.out));
  assert.equal(r.outOfScope, true);
  assert.equal(r.inventoryAdvice.length, 0);
  assert.equal(r.generalAdvice.length, 0);
});

  // 6a. contextProductId 随请求发送
  await check('状态6a contextProductId 随请求发送', () => {
  const fields = buildTextFields({ question: 'q', history: [], contextProductId: 'p-84' });
  assert.equal(fields.contextProductId, 'p-84');
});

  // 6b. 网络失败重试（复用最后一条用户消息，不重复追加）
  await check('状态6b 网络失败：保留用户消息 + 重试不重复追加', async () => {
  const failDeps = { ...base, fetchFn: async () => { throw new Error('Network request failed'); } };
  let state = applySendStart({ messages: [], draft: '洁厕灵能用吗', pendingImageUri: null, contextProductId: undefined, sending: false, error: null });
  try {
    await uploadAssistantQuestion({ question: '洁厕灵能用吗', history: [] }, failDeps);
  } catch (e) {
    state = applySendFailure(state, e.message);
  }
  assert.ok(state.error, '应有错误信息');
  assert.equal(state.messages.length, 1, '用户消息应保留');
  assert.equal(state.messages[0].role, 'user');

  const req = retryRequest(state);
  assert.equal(req.question, '洁厕灵能用吗');
  assert.equal(state.messages.filter((m) => m.role === 'user').length, 1, '重试前不应重复用户消息');
  state = applySendSuccess(state, states.stock);
  assert.equal(state.messages.filter((m) => m.role === 'user').length, 1, '重试成功后用户消息仍只有1条');
  assert.equal(state.messages.length, 2, 'user + assistant 各一条');
});

  if (failures > 0) {
    console.error(`\n${failures} 项失败`);
    process.exitCode = 1;
  } else {
    console.log('\n六状态客户端集成全部通过');
  }
}

run();
