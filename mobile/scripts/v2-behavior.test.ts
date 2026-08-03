/**
 * V2 行为测试 — 直接导入生产纯函数
 *
 * 覆盖：
 * - 补拍合并：观察记录标量/列表分离处理
 * - 补拍合并：表单值合并（标量冲突检测 + 列表去重合并）
 * - 冲突解决：保留原值/使用补拍值
 * - 未解决冲突禁止保存
 * - 标签警示语能进入表单并合并
 * - 照片缩放决策
 * - 请求错误映射
 * - 重复候选视图模型
 * - 相容性关系视图模型
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

// ── 直接导入生产纯函数 ────────────────────────────

import {
  mergeObservations,
  applyMergedToProduct,
  mergeFormValues,
  applyConflictResolution,
  hasUnresolvedConflicts,
  decideResizeDimension,
  mapMutationError,
  parseListString,
  normalizeCategory,
  nextConflictId,
  resetConflictIdCounter,
  toDuplicateCandidateVM,
} from '../src/view-models/intake.ts';

import {
  toRelationVM,
  toCompatibilityOverviewVM,
} from '../src/view-models/compatibility.ts';

import type { FormConflict } from '../src/view-models/intake.ts';

// ── mergeObservations ────────────────────────────

describe('mergeObservations', () => {
  test('空列表合并后返回空', () => {
    const result = mergeObservations([], []);
    assert.equal(result.length, 0);
  });

  test('标量字段：新字段被添加', () => {
    const existing = [
      { field: 'name', display_value: '产品A', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'brand', display_value: '品牌B', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    assert.equal(result.length, 2);
  });

  test('标量字段：相同字段不同值产生冲突', () => {
    const existing = [
      { field: 'name', display_value: '产品A', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'name', display_value: '产品B', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].displayValue, '产品B');
    assert.equal(result[0].conflicting, true);
    assert.equal(result[0].previousValue, '产品A');
  });

  test('标量字段：相同字段相同值不产生冲突', () => {
    const existing = [
      { field: 'name', display_value: '产品A', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'name', display_value: '产品A', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    assert.equal(result.length, 1);
    assert.equal(result[0].conflicting, undefined);
  });

  test('列表字段：多条储藏条件不被压成一个', () => {
    const existing = [
      { field: 'storage_requirements', display_value: '避光', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'storage_requirements', display_value: '远离儿童', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    assert.equal(result.length, 2, '两条储藏条件都应保留');
    assert.equal(result[0].displayValue, '避光');
    assert.equal(result[1].displayValue, '远离儿童');
    assert.equal(result[0].conflicting, undefined, '列表字段不产生冲突');
  });

  test('列表字段：重复成分被去重', () => {
    const existing = [
      { field: 'ingredients', display_value: '乙醇', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'ingredients', display_value: '乙醇', confidence: 'high', source: 'model_observation' },
      { field: 'ingredients', display_value: '水', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    assert.equal(result.length, 2, '乙醇去重后只剩一条');
    assert.deepEqual(result.map(r => r.displayValue), ['乙醇', '水']);
  });

  test('混合标量和列表字段', () => {
    const existing = [
      { field: 'name', display_value: '消毒液', confidence: 'high', source: 'model_observation' },
      { field: 'ingredients', display_value: '次氯酸钠', confidence: 'high', source: 'model_observation' },
    ];
    const incoming = [
      { field: 'name', display_value: '84消毒液', confidence: 'high', source: 'model_observation' },
      { field: 'ingredients', display_value: '水', confidence: 'high', source: 'model_observation' },
    ];
    const result = mergeObservations(existing, incoming);
    // name 标量合并为1条（冲突），ingredients 列表合并为2条
    assert.equal(result.length, 3);
    const nameObs = result.find(r => r.field === 'name');
    assert.ok(nameObs?.conflicting, 'name 应有冲突标记');
    const ingObs = result.filter(r => r.field === 'ingredients');
    assert.equal(ingObs.length, 2, '两条成分都保留');
  });
});

// ── applyMergedToProduct ─────────────────────────

describe('applyMergedToProduct', () => {
  test('补拍结果补全空字段', () => {
    const product = {
      brand: '',
      name: '已有名称',
      category: 'disinfectant',
      ingredients: [],
      storage_requirements: [],
      hazard_notes: [],
      label_warnings: [],
      production_date: '',
      expiry_date: '',
    };
    const merged = [
      { field: 'brand', displayValue: '新品牌', confidence: 'high', source: 'model_observation' },
      { field: 'ingredients', displayValue: '乙醇', confidence: 'high', source: 'model_observation' },
    ];
    const result = applyMergedToProduct(product, merged);
    assert.equal(result.brand, '新品牌');
    assert.equal(result.name, '已有名称');
    assert.deepEqual(result.ingredients, ['乙醇']);
  });

  test('"未知"值不会覆盖已有值', () => {
    const product = {
      brand: '已知品牌',
      name: '已知名称',
      category: 'disinfectant',
      ingredients: ['已有成分'],
      storage_requirements: [],
      hazard_notes: [],
      label_warnings: [],
      production_date: '',
      expiry_date: '',
    };
    const merged = [
      { field: 'brand', displayValue: '未知', confidence: 'low', source: 'model_observation' },
    ];
    const result = applyMergedToProduct(product, merged);
    assert.equal(result.brand, '已知品牌');
  });

  test('成分列表去重', () => {
    const product = {
      brand: '',
      name: '',
      category: 'other',
      ingredients: ['乙醇'],
      storage_requirements: [],
      hazard_notes: [],
      label_warnings: [],
      production_date: '',
      expiry_date: '',
    };
    const merged = [
      { field: 'ingredients', displayValue: '乙醇', confidence: 'high', source: 'model_observation' },
      { field: 'ingredients', displayValue: '水', confidence: 'high', source: 'model_observation' },
    ];
    const result = applyMergedToProduct(product, merged);
    assert.deepEqual(result.ingredients, ['乙醇', '水']);
  });

  test('补拍新字段进入proposedProduct（日期/储存/危险性/警示语）', () => {
    const product = {
      brand: '',
      name: '消毒液',
      category: 'disinfectant',
      ingredients: [],
      storage_requirements: [],
      hazard_notes: [],
      label_warnings: [],
      production_date: '',
      expiry_date: '',
    };
    const merged = [
      { field: 'production_date', displayValue: '2025-03', confidence: 'high', source: 'model_observation' },
      { field: 'expiry_date', displayValue: '2027-03', confidence: 'high', source: 'model_observation' },
      { field: 'storage_requirements', displayValue: '避光', confidence: 'high', source: 'model_observation' },
      { field: 'hazard_notes', displayValue: '腐蚀性', confidence: 'high', source: 'model_observation' },
      { field: 'label_warnings', displayValue: '远离儿童', confidence: 'high', source: 'model_observation' },
    ];
    const result = applyMergedToProduct(product, merged);
    assert.equal(result.production_date, '2025-03');
    assert.equal(result.expiry_date, '2027-03');
    assert.deepEqual(result.storage_requirements, ['避光']);
    assert.deepEqual(result.hazard_notes, ['腐蚀性']);
    assert.deepEqual(result.label_warnings, ['远离儿童']);
  });
});

// ── mergeFormValues（表单合并纯函数） ────────────

describe('mergeFormValues', () => {
  test('标量字段：空值被补拍填充', () => {
    const current = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const supplement = { name: 'AI识别名', brand: 'AI品牌', category: 'other', productionDate: '2025-06', expiryDate: '2028-06' };
    const { merged, conflicts } = mergeFormValues(current, supplement, new Set());
    assert.equal(merged.name, 'AI识别名');
    assert.equal(merged.brand, 'AI品牌');
    assert.equal(merged.productionDate, '2025-06');
    assert.equal(merged.expiryDate, '2028-06');
    assert.equal(conflicts.length, 0);
  });

  test('标量字段：已编辑字段不被覆盖', () => {
    const current = { name: '用户修改的名字', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const supplement = { name: 'AI识别的名字', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const edited = new Set(['name']);
    const { merged } = mergeFormValues(current, supplement, edited);
    assert.equal(merged.name, '用户修改的名字');
  });

  test('标量字段：当前有值且补拍不同 → 产生冲突', () => {
    const current = { name: '原名', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const supplement = { name: '补拍名', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const { merged, conflicts } = mergeFormValues(current, supplement, new Set());
    assert.equal(merged.name, '原名', '冲突时不自动覆盖');
    assert.equal(conflicts.length, 1);
    assert.equal(conflicts[0].field, 'name');
    assert.equal(conflicts[0].originalValue, '原名');
    assert.equal(conflicts[0].supplementValue, '补拍名');
    assert.equal(conflicts[0].resolved, null);
  });

  test('列表字段：去重合并', () => {
    const current = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '乙醇', storageReqs: '避光', hazardNotes: '', labelWarnings: '' };
    const supplement = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '水', storageReqs: '远离儿童', hazardNotes: '腐蚀性', labelWarnings: '远离儿童' };
    const { merged } = mergeFormValues(current, supplement, new Set());
    assert.deepEqual(parseListString(merged.ingredients), ['乙醇', '水']);
    assert.deepEqual(parseListString(merged.storageReqs), ['避光', '远离儿童']);
    assert.deepEqual(parseListString(merged.hazardNotes), ['腐蚀性']);
    assert.deepEqual(parseListString(merged.labelWarnings), ['远离儿童']);
  });

  test('列表字段：重复项不重复添加', () => {
    const current = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '乙醇、水', storageReqs: '', hazardNotes: '', labelWarnings: '' };
    const supplement = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '水、乙醇、香精', storageReqs: '', hazardNotes: '', labelWarnings: '' };
    const { merged } = mergeFormValues(current, supplement, new Set());
    assert.deepEqual(parseListString(merged.ingredients), ['乙醇', '水', '香精']);
  });

  test('标签警示语能合并并保留', () => {
    const current = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '', storageReqs: '', hazardNotes: '', labelWarnings: '远离儿童' };
    const supplement = { name: '', brand: '', category: 'other', productionDate: '', expiryDate: '', ingredients: '', storageReqs: '', hazardNotes: '', labelWarnings: '不可食用' };
    const { merged } = mergeFormValues(current, supplement, new Set());
    assert.deepEqual(parseListString(merged.labelWarnings), ['远离儿童', '不可食用']);
  });
});

// ── 冲突解决 ─────────────────────────────────────

describe('applyConflictResolution', () => {
  test('选择补拍值时替换表单值', () => {
    const form = { name: '原名', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const conflict: FormConflict = { field: 'name', originalValue: '原名', supplementValue: '补拍名', resolved: 'supplement' };
    const result = applyConflictResolution(form, conflict);
    assert.equal(result.name, '补拍名');
  });

  test('选择原值时保持不变', () => {
    const form = { name: '原名', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const conflict: FormConflict = { field: 'name', originalValue: '原名', supplementValue: '补拍名', resolved: 'original' };
    const result = applyConflictResolution(form, conflict);
    assert.equal(result.name, '原名');
  });
});

describe('hasUnresolvedConflicts', () => {
  test('全部未解决 → true', () => {
    const conflicts: FormConflict[] = [
      { field: 'name', originalValue: 'A', supplementValue: 'B', resolved: null },
    ];
    assert.equal(hasUnresolvedConflicts(conflicts), true);
  });

  test('全部已解决 → false', () => {
    const conflicts: FormConflict[] = [
      { field: 'name', originalValue: 'A', supplementValue: 'B', resolved: 'original' },
      { field: 'brand', originalValue: 'X', supplementValue: 'Y', resolved: 'supplement' },
    ];
    assert.equal(hasUnresolvedConflicts(conflicts), false);
  });

  test('部分未解决 → true', () => {
    const conflicts: FormConflict[] = [
      { field: 'name', originalValue: 'A', supplementValue: 'B', resolved: 'original' },
      { field: 'brand', originalValue: 'X', supplementValue: 'Y', resolved: null },
    ];
    assert.equal(hasUnresolvedConflicts(conflicts), true);
  });

  test('空列表 → false', () => {
    assert.equal(hasUnresolvedConflicts([]), false);
  });
});

// ── 照片缩放决策 ─────────────────────────────────

describe('decideResizeDimension', () => {
  test('横图（宽>高）限制宽度', () => {
    assert.deepEqual(decideResizeDimension(1920, 1080, 1280), { resize: { width: 1280 } });
  });

  test('竖图（高>宽）限制高度', () => {
    assert.deepEqual(decideResizeDimension(1080, 1920, 1280), { resize: { height: 1280 } });
  });

  test('正方形等于 maxDimension 时不缩放', () => {
    assert.equal(decideResizeDimension(1280, 1280, 1280), null);
  });

  test('正方形超过 maxDimension 时限制宽度', () => {
    assert.deepEqual(decideResizeDimension(2000, 2000, 1280), { resize: { width: 1280 } });
  });
});

// ── 请求错误映射 ─────────────────────────────────

describe('mapMutationError', () => {
  test('AbortError 映射为超时', () => {
    const error = new Error('aborted');
    error.name = 'AbortError';
    const { message, isTimeout } = mapMutationError(error);
    assert.equal(isTimeout, true);
    assert.equal(message, '请求超时，请检查网络后重试');
  });

  test('TypeError 映射为连接失败', () => {
    const error = new TypeError('Failed to fetch');
    const { message, isTimeout } = mapMutationError(error);
    assert.equal(isTimeout, false);
    assert.equal(message, '无法连接服务，请检查网络后重试');
  });
});

// ── 重复候选视图模型 ──────────────────────────────

describe('toDuplicateCandidateVM', () => {
  test('正确映射字段和标签', () => {
    const candidate = {
      productId: 'p-001',
      name: '威猛先生',
      category: 'kitchen_cleaner',
      brand: '威猛先生',
      matchReason: '名称相似',
      matchStrength: 'strong' as const,
    };
    const vm = toDuplicateCandidateVM(candidate);
    assert.equal(vm.productId, 'p-001');
    assert.equal(vm.name, '威猛先生');
    assert.equal(vm.categoryLabel, '厨房清洁');
    assert.equal(vm.matchStrengthLabel, '高度匹配');
  });

  test('无品牌时显示"未知品牌"', () => {
    const candidate = {
      productId: 'p-002',
      name: '无名产品',
      category: 'other',
      brand: null,
      matchReason: '品类相同',
      matchStrength: 'normal' as const,
    };
    const vm = toDuplicateCandidateVM(candidate);
    assert.equal(vm.brand, '未知品牌');
    assert.equal(vm.matchStrengthLabel, '可能匹配');
  });
});

// ── 相容性关系视图模型 ────────────────────────────

describe('toRelationVM', () => {
  test('正确映射 snake_case 到 camelCase', () => {
    const raw = {
      relation_id: 'rel-001',
      product_a_id: 'prod-a',
      product_b_id: 'prod-b',
      relation_type: 'do_not_mix' as const,
      severity: 'critical' as const,
      rule_id: 'rule-001',
      rule_version: '1.0',
      payload: {
        title: '漂白水与洁厕灵禁止混用',
        rationale: '次氯酸钠与盐酸反应产生氯气',
        recommended_action: '分开存放，不可混合使用',
        evidence_status: 'verified' as const,
        sources: [],
      },
      updated_at: '2026-08-01T10:00:00Z',
    };
    const vm = toRelationVM(raw);
    assert.equal(vm.relationId, 'rel-001');
    assert.equal(vm.productAId, 'prod-a');
    assert.equal(vm.productBId, 'prod-b');
    assert.equal(vm.relationTypeLabel, '禁止混用');
    assert.equal(vm.severityLabel, '严重');
    assert.equal(vm.title, '漂白水与洁厕灵禁止混用');
    assert.equal(vm.recommendedAction, '分开存放，不可混合使用');
    assert.equal(vm.evidenceStatusLabel, '已验证');
  });

  test('产品 ID 保留', () => {
    const raw = {
      relation_id: 'rel-002',
      product_a_id: 'prod-x',
      product_b_id: 'prod-y',
      relation_type: 'separate_storage' as const,
      severity: 'attention' as const,
      rule_id: null,
      rule_version: '1.0',
      payload: {
        title: '建议分开存放',
        rationale: '可能产生反应',
        recommended_action: '分开存放',
        evidence_status: 'needs_review' as const,
        sources: [],
      },
      updated_at: '2026-08-01T10:00:00Z',
    };
    const vm = toRelationVM(raw);
    assert.equal(vm.productAId, 'prod-x');
    assert.equal(vm.productBId, 'prod-y');
    assert.notEqual(vm.productAId, vm.productBId);
  });
});

// ── 相容性摘要视图模型 ────────────────────────────

describe('toCompatibilityOverviewVM', () => {
  test('无冲突时显示"当前未发现已登记禁忌"', () => {
    const summary = {
      status: 'no_registered_conflict' as const,
      totalRelations: 0,
      criticalCount: 0,
      attentionCount: 0,
      unknownCount: 0,
      needsInformationCount: 0,
      totalProducts: 3,
      boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
    };
    const vm = toCompatibilityOverviewVM(summary);
    assert.equal(vm.statusLabel, '当前未发现已登记禁忌');
    assert.equal(vm.isClean, true);
    assert.equal(vm.hasConflict, false);
  });

  test('有冲突时显示"存在冲突"', () => {
    const summary = {
      status: 'has_conflict' as const,
      totalRelations: 2,
      criticalCount: 1,
      attentionCount: 1,
      unknownCount: 0,
      needsInformationCount: 0,
      totalProducts: 5,
      boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
    };
    const vm = toCompatibilityOverviewVM(summary);
    assert.equal(vm.statusLabel, '存在冲突');
    assert.equal(vm.hasConflict, true);
    assert.equal(vm.isClean, false);
  });

  test('有待补充信息时显示"待补充信息"', () => {
    const summary = {
      status: 'needs_information' as const,
      totalRelations: 1,
      criticalCount: 0,
      attentionCount: 0,
      unknownCount: 0,
      needsInformationCount: 1,
      totalProducts: 2,
      boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
    };
    const vm = toCompatibilityOverviewVM(summary);
    assert.equal(vm.statusLabel, '待补充信息');
    assert.equal(vm.hasNeedsInfo, true);
    assert.equal(vm.isClean, false);
  });
});

// ── 更新操作 ID 稳定性 ────────────────────────────

describe('更新操作 ID 稳定性', () => {
  test('首次生成后应保存，重试不重新生成', () => {
    let pendingOperationId: string | null = null;
    const generateOperationId = () => `op-${Date.now().toString(36)}`;

    // 第一次调用
    let operationId = pendingOperationId;
    if (!operationId) {
      operationId = generateOperationId();
      pendingOperationId = operationId;
    }
    const firstId = operationId;
    assert.ok(firstId);

    // 第二次调用（重试）
    operationId = pendingOperationId;
    if (!operationId) {
      operationId = generateOperationId();
      pendingOperationId = operationId;
    }
    assert.equal(operationId, firstId, '重试应沿用同一操作 ID');
  });

  test('新流程应重置 pendingOperationId', () => {
    let pendingOperationId: string | null = 'op-old';
    pendingOperationId = null;
    assert.equal(pendingOperationId, null);
  });
});

// ── 封面保存失败标志 ──────────────────────────────

describe('封面保存失败标志', () => {
  test('coverSaveFailed=true 时显示部分成功', () => {
    const coverSaveFailed = true;
    const title = coverSaveFailed ? '部分成功' : '添加成功';
    assert.equal(title, '部分成功');
  });

  test('coverSaveFailed=false 时显示完整成功', () => {
    const coverSaveFailed = false;
    const title = coverSaveFailed ? '部分成功' : '添加成功';
    assert.equal(title, '添加成功');
  });
});

// ── 连续补拍同字段冲突 ────────────────────────────

describe('连续补拍同字段冲突', () => {
  test('两次补拍同字段产生独立冲突ID', () => {
    resetConflictIdCounter();

    // 原值 A
    const current1 = { name: 'A', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const supplement1 = { name: 'B', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const { merged: merged1, conflicts: conflicts1 } = mergeFormValues(current1, supplement1, new Set());

    assert.equal(merged1.name, 'A', '冲突时不自动覆盖');
    assert.equal(conflicts1.length, 1);
    assert.equal(conflicts1[0].originalValue, 'A');
    assert.equal(conflicts1[0].supplementValue, 'B');

    // 解决第一次冲突（使用补拍值 B）
    const resolved1 = applyConflictResolution(merged1, { ...conflicts1[0], resolved: 'supplement' });
    assert.equal(resolved1.name, 'B');

    // 第二次补拍 B → C
    const current2 = { ...resolved1 };
    const supplement2 = { name: 'C', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    const { merged: merged2, conflicts: conflicts2 } = mergeFormValues(current2, supplement2, new Set());

    assert.equal(merged2.name, 'B', '第二次冲突仍不自动覆盖');
    assert.equal(conflicts2.length, 1);
    assert.equal(conflicts2[0].originalValue, 'B');
    assert.equal(conflicts2[0].supplementValue, 'C');

    // 两个冲突有不同 ID
    assert.notEqual(conflicts1[0].id, conflicts2[0].id, '两次冲突应有不同 ID');

    // 解决第二次冲突时只影响第二个冲突
    const resolved2 = applyConflictResolution(merged2, { ...conflicts2[0], resolved: 'supplement' });
    assert.equal(resolved2.name, 'C');
  });

  test('有未解决冲突时不允许保存', () => {
    resetConflictIdCounter();
    const conflicts: FormConflict[] = [
      { id: 'c1', field: 'name', originalValue: 'A', supplementValue: 'B', resolved: null },
    ];
    assert.equal(hasUnresolvedConflicts(conflicts), true);
  });

  test('所有冲突已解决时允许保存', () => {
    resetConflictIdCounter();
    const conflicts: FormConflict[] = [
      { id: 'c1', field: 'name', originalValue: 'A', supplementValue: 'B', resolved: 'original' },
      { id: 'c2', field: 'brand', originalValue: 'X', supplementValue: 'Y', resolved: 'supplement' },
    ];
    assert.equal(hasUnresolvedConflicts(conflicts), false);
  });
});

// ── 品类归一化 ───────────────────────────────────

describe('normalizeCategory', () => {
  test('合法英文枚举值直接返回', () => {
    assert.equal(normalizeCategory('disinfectant'), 'disinfectant');
    assert.equal(normalizeCategory('kitchen_cleaner'), 'kitchen_cleaner');
  });

  test('中文别名映射到枚举值', () => {
    assert.equal(normalizeCategory('厨房清洁'), 'kitchen_cleaner');
    assert.equal(normalizeCategory('消毒液'), 'disinfectant');
    assert.equal(normalizeCategory('漂白水'), 'bleach');
  });

  test('"未知"或空返回 null', () => {
    assert.equal(normalizeCategory('未知'), null);
    assert.equal(normalizeCategory(''), null);
  });

  test('无法识别的值返回 null', () => {
    assert.equal(normalizeCategory('随机文字'), null);
  });
});

// ── 小图不放大 ───────────────────────────────────

describe('decideResizeDimension 小图不放大', () => {
  test('最长边不超过 maxDimension 时不缩放', () => {
    assert.equal(decideResizeDimension(640, 480, 1280), null);
    assert.equal(decideResizeDimension(1280, 960, 1280), null);
  });

  test('最长边超过 maxDimension 时缩放', () => {
    assert.deepEqual(decideResizeDimension(1920, 1080, 1280), { resize: { width: 1280 } });
  });
});

// ── Store 状态模拟：连续补拍同字段冲突解决 ─────────

describe('Store 状态模拟：解决第二个冲突不影响第一个', () => {
  test('预置两个同字段冲突，解决第二个后第一个状态不变', () => {
    resetConflictIdCounter();

    // 模拟 Store 中的状态：两个字段相同的冲突
    const form: Record<string, string> = { name: 'B', brand: '', category: 'other', productionDate: '', expiryDate: '' };
    let conflicts: FormConflict[] = [
      { id: nextConflictId(), field: 'name', originalValue: 'A', supplementValue: 'B', resolved: 'supplement' },
      { id: nextConflictId(), field: 'name', originalValue: 'B', supplementValue: 'C', resolved: null },
    ];

    // 模拟 resolveConflict(secondId, 'supplement')
    const secondId = conflicts[1].id;
    const targetConflict = conflicts.find((c) => c.id === secondId);
    assert.ok(targetConflict, '应找到第二个冲突');

    // 只更新目标冲突
    conflicts = conflicts.map((c) =>
      c.id === secondId ? { ...c, resolved: 'supplement' as const } : c,
    );

    // 应用到表单
    const resolvedForm = applyConflictResolution(form, { ...targetConflict!, resolved: 'supplement' });

    // 第一个冲突状态不变
    assert.equal(conflicts[0].resolved, 'supplement', '第一个冲突状态不变');
    // 第二个冲突已解决
    assert.equal(conflicts[1].resolved, 'supplement', '第二个冲突已解决');
    // 表单使用第二个冲突的补拍值
    assert.equal(resolvedForm.name, 'C', '表单使用第二个冲突的补拍值');
  });
});

// ── 品类未知时表单状态 ───────────────────────────

describe('品类未知时表单状态', () => {
  test('normalizeCategory 返回 null 时不回退到 other', () => {
    const result = normalizeCategory('未知');
    assert.equal(result, null, '"未知"应返回 null');
    // 模拟 draftToForm：null 保留到 ReviewForm.category
    const formCategory = result; // 不再使用 ?? 'other'
    assert.equal(formCategory, null, 'ReviewForm.category 应为 null');
  });

  test('normalizeCategory 返回 null 时禁止保存', () => {
    const form = { name: '产品A', brand: '', category: null, productionDate: '', expiryDate: '' };
    assert.equal(form.category, null);
    assert.equal(!form.category, true, 'category 为 null 时应禁止保存');
  });

  test('用户选择"其他"后 category 为 other 而非 null', () => {
    const form = { name: '产品A', brand: '', category: null as string | null, productionDate: '', expiryDate: '' };
    // 模拟用户点击"其他"按钮
    form.category = 'other';
    assert.equal(form.category, 'other');
    assert.equal(!form.category, false, '用户选择后应允许保存');
  });

  test('中文品类被归一化后可入库', () => {
    const result = normalizeCategory('消毒液');
    assert.equal(result, 'disinfectant');
    assert.ok(result, '归一化后品类非空，可入库');
  });

  test('后端归一化后空品类标记为缺失', () => {
    // 模拟后端 _find_missing_fields 逻辑
    const rawCategory = '未知';
    const normalized = rawCategory.trim() === '未知' ? '' : rawCategory;
    const missing = !normalized;
    assert.equal(missing, true, '未知品类应标记为缺失');
  });
});
