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
  normalizeAssistantResponse,
  dedupeSources,
  orderedSources,
  canOpenExternalSource,
  canRenderInventoryAdvice,
  DEFAULT_KNOWLEDGE_STATUS,
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
  KnowledgeEvidence,
  SourceRef,
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
      productName: '84消毒液',
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

  test('productName 由后端提供并用于卡片标题', () => {
    const msg = buildAssistantMessage(sampleResponse);
    assert.ok(msg.response);
    assert.equal(msg.response.inventoryAdvice[0].productName, '84消毒液');
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

// ── Stage 3 知识状态与来源分层 ────────────────────

const localKbRef: SourceRef = {
  type: 'local_kb',
  title: '家庭安全知识库',
  domain: '',
  url: '',
  retrievedAt: null,
  ref: 'lime',
  version: '1.0',
};
const warehouseRef: SourceRef = {
  type: 'warehouse',
  title: '洁厕灵',
  domain: '',
  url: '',
  retrievedAt: null,
  ref: 'p-jc',
  version: '',
};
const ruleRef: SourceRef = {
  type: 'rule',
  title: '禁止混用',
  domain: '',
  url: '',
  retrievedAt: null,
  ref: 'r-1',
  version: '',
};
const externalRef: SourceRef = {
  type: 'external',
  title: 'CDC',
  domain: 'example.com',
  url: 'https://example.com/bleach',
  retrievedAt: '2026-08-12',
  ref: 'c-1',
  version: '',
};

const reviewedKnowledge: KnowledgeEvidence = {
  entryId: 'lime',
  topic: '水垢',
  surfaces: ['马桶'],
  excludedSurfaces: ['铝制表面'],
  steps: ['保持通风', '按标签使用'],
  warnings: ['避免接触皮肤'],
  prohibitedActions: [],
  stopConditions: ['若变色立即停止'],
  tagCondition: '',
  reviewedAt: '2026-07-20',
  sources: [localKbRef],
  confidence: 'reviewed',
};

function kbResponse(over: Partial<AssistantResponse> = {}): AssistantResponse {
  return {
    ...sampleResponse,
    knowledgeStatus: 'local_hit',
    knowledge: [reviewedKnowledge],
    sources: [warehouseRef, localKbRef],
    externalSources: [],
    pendingKnowledgeNotice: '',
    ...over,
  };
}

describe('知识状态渲染数据', () => {
  test('local_hit 携带 reviewed 知识（渲染知识卡）', () => {
    const msg = buildAssistantMessage(kbResponse());
    assert.ok(msg.response);
    assert.equal(msg.response.knowledgeStatus, 'local_hit');
    assert.equal(msg.response.knowledge?.length, 1);
    assert.equal(msg.response.knowledge?.[0].entryId, 'lime');
    assert.equal(msg.response.knowledge?.[0].confidence, 'reviewed');
  });

  test('reviewedAt 字段映射与缺失安全降级', () => {
    // 字段映射：后端 reviewedAt 透传到知识卡
    const withDate = kbResponse();
    assert.equal(withDate.knowledge?.[0].reviewedAt, '2026-07-20');
    // 归一化后仍保留
    const normalized = normalizeAssistantResponse(withDate);
    assert.equal(normalized.knowledge?.[0].reviewedAt, '2026-07-20');

    // 缺失降级：旧后端无 reviewedAt 时不崩溃，UI 用占位符
    const legacy = kbResponse({
      knowledge: [{ ...reviewedKnowledge, reviewedAt: undefined }],
    });
    const normalizedLegacy = normalizeAssistantResponse(legacy);
    assert.equal(normalizedLegacy.knowledge?.[0].reviewedAt, undefined);
  });

  test('local_hit_no_inventory 无库存但有知识', () => {
    const r = kbResponse({ knowledgeStatus: 'local_hit_no_inventory', inventoryAdvice: [] });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.knowledgeStatus, 'local_hit_no_inventory');
    assert.ok(msg.response?.knowledge?.length, '应有知识');
    assert.equal(msg.response?.inventoryAdvice.length, 0);
  });

  test('insufficient 无 knowledge、可携带 pendingKnowledgeNotice', () => {
    const r = kbResponse({
      knowledgeStatus: 'insufficient',
      knowledge: [],
      inventoryAdvice: [],
      pendingKnowledgeNotice: '存在待审核资料，尚未通过审核，暂不提供操作建议。',
    });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.knowledgeStatus, 'insufficient');
    assert.equal(msg.response?.knowledge?.length, 0);
    assert.ok(msg.response?.pendingKnowledgeNotice);
  });

  test('provisional 只显示 pendingKnowledgeNotice（不渲染知识卡）', () => {
    // provisional 不进入 knowledge；仅 pendingNotice 固定文案
    const r = kbResponse({
      knowledgeStatus: 'insufficient',
      knowledge: [],
      inventoryAdvice: [],
      pendingKnowledgeNotice: '存在待审核资料，尚未通过审核，暂不提供操作建议。',
    });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.knowledge?.length, 0, 'provisional 不应进入 knowledge');
    assert.ok(msg.response?.pendingKnowledgeNotice);
  });

  test('no_match 不渲染产品建议', () => {
    const r = kbResponse({ knowledgeStatus: 'no_match', knowledge: [], inventoryAdvice: [], externalSources: [] });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.inventoryAdvice.length, 0);
    assert.equal(msg.response?.knowledge?.length, 0);
  });

  test('external_hit 携带 externalSources', () => {
    const r = kbResponse({ knowledgeStatus: 'external_hit', knowledge: [], inventoryAdvice: [], externalSources: [externalRef] });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.knowledgeStatus, 'external_hit');
    assert.equal(msg.response?.externalSources?.length, 1);
    assert.equal(msg.response?.externalSources?.[0].domain, 'example.com');
  });

  test('external_fail 不显示外部来源', () => {
    const r = kbResponse({ knowledgeStatus: 'external_fail', knowledge: [], inventoryAdvice: [], externalSources: [] });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.knowledgeStatus, 'external_fail');
    assert.equal(msg.response?.externalSources?.length, 0);
  });

  test('outOfScope 隐藏所有产品与操作建议', () => {
    const r = kbResponse({
      outOfScope: true,
      inventoryAdvice: [],
      knowledge: [],
      generalAdvice: [],
      externalSources: [],
      safetyWarnings: [],
    });
    const msg = buildAssistantMessage(r);
    assert.equal(msg.response?.outOfScope, true);
    assert.equal(msg.response?.inventoryAdvice.length, 0);
    assert.equal(msg.response?.knowledge?.length, 0);
  });

  test('critical 警告优先（存在且排在 attention 前）', () => {
    const r = kbResponse({
      safetyWarnings: [
        { severity: 'attention', title: '注意', description: 'x', relationId: null, recommendedAction: '' },
        { severity: 'critical', title: '禁止混用', description: 'y', relationId: 'r-2', recommendedAction: '分开' },
      ],
    });
    const msg = buildAssistantMessage(r);
    assert.ok(msg.response);
    const critIdx = msg.response.safetyWarnings.findIndex((w) => w.severity === 'critical');
    const attnIdx = msg.response.safetyWarnings.findIndex((w) => w.severity === 'attention');
    assert.ok(critIdx !== -1);
    assert.ok(critIdx < attnIdx, 'critical 应优先显示');
  });
});

describe('来源去重与排序', () => {
  test('按 (type, ref) 去重', () => {
    const sources: SourceRef[] = [localKbRef, warehouseRef, localKbRef, localKbRef];
    const deduped = dedupeSources(sources);
    assert.equal(deduped.length, 2);
  });

  test('顺序 local_kb → warehouse → rule → external', () => {
    const sources: SourceRef[] = [externalRef, warehouseRef, ruleRef, localKbRef];
    const ordered = orderedSources(sources);
    assert.deepEqual(
      ordered.map((s) => s.type),
      ['local_kb', 'warehouse', 'rule', 'external'],
    );
  });

  test('外部 URL 需 https 且 hostname 完整命中白名单', () => {
    const allow = ['example.com', 'safe.gov'];
    assert.equal(canOpenExternalSource('https://example.com/x', allow), true);
    assert.equal(canOpenExternalSource('https://safe.gov/path', allow), true);
    // 协议不符
    assert.equal(canOpenExternalSource('http://example.com/x', allow), false);
    // 空/非法 URL
    assert.equal(canOpenExternalSource('', allow), false);
    assert.equal(canOpenExternalSource('not-a-url', allow), false);
    assert.equal(canOpenExternalSource('javascript:alert(1)', allow), false);
    assert.equal(canOpenExternalSource('data:text/html,x', allow), false);
    // 不在白名单
    assert.equal(canOpenExternalSource('https://evil.net/x', allow), false);
  });

  test('合法 https 默认端口通过', () => {
    const allow = ['example.com'];
    assert.equal(canOpenExternalSource('https://example.com/x', allow), true);
    assert.equal(canOpenExternalSource('https://example.com/path?q=1', allow), true);
  });

  test('非默认端口拒绝', () => {
    const allow = ['example.com'];
    assert.equal(canOpenExternalSource('https://example.com:8080/x', allow), false);
    assert.equal(canOpenExternalSource('https://example.com:8443/x', allow), false);
  });

  test('用户名密码拒绝', () => {
    const allow = ['example.com'];
    assert.equal(canOpenExternalSource('https://user:pass@example.com/x', allow), false);
    assert.equal(canOpenExternalSource('https://user@example.com/x', allow), false);
  });

  test('子域名与仿冒域名拒绝', () => {
    const allow = ['example.com'];
    // 子域名
    assert.equal(canOpenExternalSource('https://sub.example.com/x', allow), false);
    assert.equal(canOpenExternalSource('https://www.example.com/x', allow), false);
    // 仿冒域名
    assert.equal(canOpenExternalSource('https://notexample.com/x', allow), false);
    assert.equal(canOpenExternalSource('https://example.com.evil.net/x', allow), false);
  });

  test('大小写域名按规范化规则处理', () => {
    const allow = ['example.com'];
    // URL 解析将 hostname 小写化后精确匹配，大小写变体仍命中（非绕过）
    assert.equal(canOpenExternalSource('https://EXAMPLE.com/x', allow), true);
    assert.equal(canOpenExternalSource('https://Example.COM/x', allow), true);
    // 但 hostname 仍是 example.com，不构成子域名
    assert.equal(canOpenExternalSource('https://EXAMPLE.COM.EVIL.NET/x', allow), false);
  });

  test('白名单为空时全部拒绝', () => {
    assert.equal(canOpenExternalSource('https://example.com/x', []), false);
    assert.equal(canOpenExternalSource('https://safe.gov/x', []), false);
  });
});

describe('库存产品卡渲染判定', () => {
  test('仅 local_hit 渲染库存产品卡', () => {
    assert.equal(canRenderInventoryAdvice('local_hit'), true);
  });

  test('其他状态均不渲染库存产品卡（不泄漏）', () => {
    const blocked: Array<Parameters<typeof canRenderInventoryAdvice>[0]> = [
      'local_hit_no_inventory',
      'insufficient',
      'no_match',
      'external_hit',
      'external_fail',
    ];
    for (const status of blocked) {
      assert.equal(canRenderInventoryAdvice(status), false, status);
    }
  });
});

describe('旧后端字段安全降级', () => {
  test('缺失 Stage 3 字段时使用安全默认值', () => {
    // 模拟旧后端响应（无 knowledge/knowledgeStatus/externalSources/sources/pendingNotice）
    const legacy: AssistantResponse = {
      answer: '根据库存回答。',
      needsClarification: false,
      clarificationQuestions: [],
      inventoryAdvice: [],
      generalAdvice: [],
      safetyWarnings: [],
      outOfScope: false,
      evidence: [],
    };
    const normalized = normalizeAssistantResponse(legacy);
    assert.deepEqual(normalized.knowledge, []);
    assert.equal(normalized.knowledgeStatus, DEFAULT_KNOWLEDGE_STATUS);
    assert.deepEqual(normalized.externalSources, []);
    assert.deepEqual(normalized.sources, []);
    assert.equal(normalized.pendingKnowledgeNotice, '');
  });
});

describe('外部搜索/照片上传开关', () => {
  test('allowExternalSearch 默认 false（不发送字段）', () => {
    const fields = buildTextFields({ question: 'q', history: [] });
    assert.equal(fields.allowExternalSearch, undefined);
  });

  test('allowExternalPhotoUpload 默认 false（不发送字段）', () => {
    const fields = buildTextFields({ question: 'q', history: [] });
    assert.equal(fields.allowExternalPhotoUpload, undefined);
  });

  test('显式开启时发送 true', () => {
    const fields = buildTextFields({
      question: 'q',
      history: [],
      allowExternalSearch: true,
      allowExternalPhotoUpload: true,
    });
    assert.equal(fields.allowExternalSearch, 'true');
    assert.equal(fields.allowExternalPhotoUpload, 'true');
  });
});
