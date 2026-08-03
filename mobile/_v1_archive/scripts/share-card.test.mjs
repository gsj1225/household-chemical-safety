import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShareCardData } from '../src/utils/shareCard.ts';

const privateReport = {
  scene_label: '  厨房   水槽区和一个很长很长的私人描述  ',
  score: 68.4,
  level: 'medium',
  total_mines: 2,
  mine_breakdown: { critical: 0, medium: 1, low: 1 },
  mines: [{
    products: ['绝密产品名称'],
    type: '混用风险',
    level: 'medium',
    description: '这里可能包含家庭地址：秘密小区 1 号楼',
    advice: '不要混用',
    evidence_status: 'verified',
    evidence_level: 'authoritative',
    reviewed_at: null,
    sources: [{ organization: '机构', title: '资料', url: 'https://secret.invalid' }],
    confirmed_by_user: true,
  }],
  safe_items: 3,
  share_text: '后端原始分享文案可能包含不受控字段',
};

test('builds a compact, statistics-only share card payload', () => {
  const card = buildShareCardData(privateReport);

  assert.equal(card.score, 68);
  assert.equal(card.totalChecked, 5);
  assert.equal(card.sceneLabel.length <= 18, true);
  assert.deepEqual(Object.keys(card).sort(), [
    'conclusion',
    'disclaimer',
    'invitation',
    'privacyNote',
    'profileLabel',
    'profileNote',
    'riskSummary',
    'safeItems',
    'sceneLabel',
    'score',
    'totalChecked',
    'totalMines',
  ].sort());
});

test('does not leak report details outside the share whitelist', () => {
  const serialized = JSON.stringify(buildShareCardData(privateReport));

  for (const secret of [
    '绝密产品名称',
    '秘密小区',
    'https://secret.invalid',
    '后端原始分享文案',
  ]) {
    assert.equal(serialized.includes(secret), false);
  }
});

test('clamps invalid public counters before rendering', () => {
  const card = buildShareCardData({
    ...privateReport,
    score: 160,
    total_mines: -8,
    safe_items: Number.NaN,
  });

  assert.equal(card.score, 100);
  assert.equal(card.totalMines, 0);
  assert.equal(card.safeItems, 0);
  assert.match(card.conclusion, /未命中/);
});
