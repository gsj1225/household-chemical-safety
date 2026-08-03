/**
 * Intake ViewModel — v2.0
 *
 * 处理补拍合并、重复候选展示和表单数据转换。
 * 所有合并/缩放/错误映射逻辑为纯函数，可被测试直接导入。
 */

import type { RecognitionDraft, ProductCategory } from '../types/inventory';
import type { DuplicateCandidate } from '../types/compatibility';

// ── 品类归一化 ────────────────────────────────────

const VALID_CATEGORIES: ProductCategory[] = [
  'kitchen_cleaner', 'bathroom_cleaner', 'toilet_cleaner', 'descaler',
  'drain_cleaner', 'disinfectant', 'bleach', 'laundry',
  'fabric_softener', 'stain_remover', 'pesticide', 'insect_repellent', 'other',
];

const CATEGORY_ALIAS_MAP: Record<string, ProductCategory> = {
  '厨房清洁': 'kitchen_cleaner', '厨房清洁剂': 'kitchen_cleaner',
  '浴室清洁': 'bathroom_cleaner', '浴室清洁剂': 'bathroom_cleaner',
  '洁厕': 'toilet_cleaner', '洁厕剂': 'toilet_cleaner', '洁厕灵': 'toilet_cleaner',
  '除垢': 'descaler', '除垢剂': 'descaler',
  '管道疏通': 'drain_cleaner', '管道疏通剂': 'drain_cleaner',
  '消毒': 'disinfectant', '消毒液': 'disinfectant', '消毒剂': 'disinfectant',
  '漂白': 'bleach', '漂白剂': 'bleach', '漂白水': 'bleach',
  '洗衣': 'laundry', '洗衣液': 'laundry', '洗衣剂': 'laundry',
  '柔顺': 'fabric_softener', '柔顺剂': 'fabric_softener',
  '去渍': 'stain_remover', '去渍剂': 'stain_remover',
  '杀虫': 'pesticide', '杀虫剂': 'pesticide',
  '驱虫': 'insect_repellent', '驱虫剂': 'insect_repellent',
  '其他': 'other',
};

/**
 * 将 AI 返回的品类值归一化为后端枚举值。
 * 返回 null 表示无法识别，调用方应要求用户手动选择。
 */
export function normalizeCategory(raw: string): ProductCategory | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '未知') return null;
  if (VALID_CATEGORIES.includes(trimmed as ProductCategory)) return trimmed as ProductCategory;
  const aliased = CATEGORY_ALIAS_MAP[trimmed];
  if (aliased) return aliased;
  return null;
}

// ── 常量 ──────────────────────────────────────────

/** 标量观察字段：同一字段的多次观察会互相覆盖/冲突 */
export const SCALAR_OBSERVATION_FIELDS = new Set([
  'brand', 'name', 'category', 'production_date', 'expiry_date',
]);

/** 表单中的标量字段名 */
export const SCALAR_FORM_FIELDS = [
  'name', 'brand', 'category', 'productionDate', 'expiryDate',
] as const;

/** 表单中的列表字段名 */
export const LIST_FORM_FIELDS = [
  'ingredients', 'storageReqs', 'hazardNotes', 'labelWarnings',
] as const;

// ── 纯工具函数 ────────────────────────────────────

/**
 * 将顿号/逗号/换行分隔的字符串解析为数组
 */
export function parseListString(text: string): string[] {
  return text.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean);
}

// ── 补拍合并：观察记录 ────────────────────────────

export interface MergedObservation {
  field: string;
  displayValue: string;
  confidence: string;
  source: string;
  conflicting?: boolean;
  previousValue?: string;
}

/**
 * 合并多次识别的观察结果。
 *
 * - 标量字段（brand/name/category/production_date/expiry_date）：
 *   用 field 作为唯一键，同字段不同值产生冲突标记。
 * - 列表字段（ingredients/storage_requirements/hazard_notes/label_warnings）：
 *   用 field + display_value 作为唯一键，多条记录共存，去重不覆盖。
 */
export function mergeObservations(
  existing: RecognitionDraft['observations'],
  incoming: RecognitionDraft['observations'],
): MergedObservation[] {
  const merged: MergedObservation[] = [];

  // 标量观察：按 field 去重/冲突
  const scalarMap = new Map<string, MergedObservation>();
  // 列表观察：按 field::display_value 去重
  const listKeys = new Set<string>();

  // 先放入已有观察
  for (const obs of existing) {
    if (SCALAR_OBSERVATION_FIELDS.has(obs.field)) {
      const mo: MergedObservation = {
        field: obs.field,
        displayValue: obs.display_value,
        confidence: obs.confidence,
        source: obs.source,
      };
      scalarMap.set(obs.field, mo);
      merged.push(mo);
    } else {
      const key = `${obs.field}::${obs.display_value}`;
      if (!listKeys.has(key)) {
        listKeys.add(key);
        merged.push({
          field: obs.field,
          displayValue: obs.display_value,
          confidence: obs.confidence,
          source: obs.source,
        });
      }
    }
  }

  // 合并新观察
  for (const obs of incoming) {
    if (SCALAR_OBSERVATION_FIELDS.has(obs.field)) {
      const existingMo = scalarMap.get(obs.field);
      if (existingMo) {
        if (existingMo.displayValue !== obs.display_value) {
          existingMo.conflicting = true;
          existingMo.previousValue = existingMo.displayValue;
          existingMo.displayValue = obs.display_value;
          existingMo.confidence = obs.confidence;
          existingMo.source = obs.source;
        }
      } else {
        const mo: MergedObservation = {
          field: obs.field,
          displayValue: obs.display_value,
          confidence: obs.confidence,
          source: obs.source,
        };
        scalarMap.set(obs.field, mo);
        merged.push(mo);
      }
    } else {
      const key = `${obs.field}::${obs.display_value}`;
      if (!listKeys.has(key)) {
        listKeys.add(key);
        merged.push({
          field: obs.field,
          displayValue: obs.display_value,
          confidence: obs.confidence,
          source: obs.source,
        });
      }
    }
  }

  return merged;
}

/**
 * 将合并后的观察应用到 proposedProduct（保留所有字段）
 */
export function applyMergedToProduct(
  product: RecognitionDraft['proposedProduct'],
  merged: MergedObservation[],
): RecognitionDraft['proposedProduct'] {
  const updated = {
    ...product,
    ingredients: [...(product.ingredients ?? [])],
    storage_requirements: [...(product.storage_requirements ?? [])],
    hazard_notes: [...(product.hazard_notes ?? [])],
    label_warnings: [...(product.label_warnings ?? [])],
  };

  for (const obs of merged) {
    if (!obs.displayValue || obs.displayValue === '未知') continue;

    switch (obs.field) {
      case 'brand':
        updated.brand = obs.displayValue;
        break;
      case 'name':
        updated.name = obs.displayValue;
        break;
      case 'category':
        updated.category = obs.displayValue;
        break;
      case 'production_date':
        updated.production_date = obs.displayValue;
        break;
      case 'expiry_date':
        updated.expiry_date = obs.displayValue;
        break;
      case 'ingredients': {
        const set = new Set(updated.ingredients);
        if (!set.has(obs.displayValue)) {
          updated.ingredients = [...updated.ingredients, obs.displayValue];
        }
        break;
      }
      case 'storage_requirements': {
        const set = new Set(updated.storage_requirements);
        if (!set.has(obs.displayValue)) {
          updated.storage_requirements = [...updated.storage_requirements, obs.displayValue];
        }
        break;
      }
      case 'hazard_notes': {
        const set = new Set(updated.hazard_notes);
        if (!set.has(obs.displayValue)) {
          updated.hazard_notes = [...updated.hazard_notes, obs.displayValue];
        }
        break;
      }
      case 'label_warnings': {
        const set = new Set(updated.label_warnings);
        if (!set.has(obs.displayValue)) {
          updated.label_warnings = [...updated.label_warnings, obs.displayValue];
        }
        break;
      }
    }
  }

  return updated;
}

// ── 补拍合并：表单值（纯函数，可测试） ────────────

let _conflictIdCounter = 0;

export function nextConflictId(): string {
  _conflictIdCounter += 1;
  return `conflict-${_conflictIdCounter}`;
}

export function resetConflictIdCounter(): void {
  _conflictIdCounter = 0;
}

export interface FormConflict {
  id: string;
  field: string;
  originalValue: string;
  supplementValue: string;
  resolved: 'original' | 'supplement' | null;
}

/**
 * 合并补拍表单值到当前表单。
 *
 * - 标量字段：用户未编辑且当前为空 → 直接填充；
 *   用户未编辑且当前有值但补拍值不同 → 产生冲突（不自动覆盖）；
 *   用户已编辑 → 不动。
 * - 列表字段：去重合并，不产生冲突。
 *
 * @param current 当前表单值（Record<string, string>）
 * @param supplement 补拍表单值
 * @param editedFields 用户已手动编辑过的字段集合
 * @returns 合并后的表单值 + 未解决冲突列表
 */
export function mergeFormValues(
  current: Record<string, string>,
  supplement: Record<string, string>,
  editedFields: Set<string>,
  scalarFields: readonly string[] = SCALAR_FORM_FIELDS,
  listFields: readonly string[] = LIST_FORM_FIELDS,
): { merged: Record<string, string>; conflicts: FormConflict[] } {
  const merged: Record<string, string> = { ...current };
  const conflicts: FormConflict[] = [];

  for (const field of scalarFields) {
    const cur = (current[field] ?? '').trim();
    const sup = (supplement[field] ?? '').trim();
    if (!sup || sup === '未知') continue;

    if (!editedFields.has(field)) {
      if (!cur) {
        merged[field] = supplement[field];
      } else if (cur !== sup) {
        conflicts.push({
          id: nextConflictId(),
          field,
          originalValue: cur,
          supplementValue: sup,
          resolved: null,
        });
      }
    }
  }

  for (const field of listFields) {
    const existingItems = parseListString(current[field] ?? '');
    const newItems = parseListString(supplement[field] ?? '');
    const combined = Array.from(new Set([...existingItems, ...newItems]));
    merged[field] = combined.join('\u3001');
  }

  return { merged, conflicts };
}

/**
 * 根据冲突解决结果应用表单值
 */
export function applyConflictResolution(
  form: Record<string, string>,
  conflict: FormConflict,
): Record<string, string> {
  const updated = { ...form };
  if (conflict.resolved === 'supplement') {
    updated[conflict.field] = conflict.supplementValue;
  } else if (conflict.resolved === 'original') {
    updated[conflict.field] = conflict.originalValue;
  }
  return updated;
}

/**
 * 检查是否存在未解决的冲突
 */
export function hasUnresolvedConflicts(conflicts: FormConflict[]): boolean {
  return conflicts.some((c) => c.resolved === null);
}

// ── 照片缩放决策（纯函数） ────────────────────────

/**
 * 根据原始宽高决定缩放操作。
 * 横图（含正方形）限制宽度，竖图限制高度，避免同时设置 width+height 导致变形。
 * 如果最长边已不超过 maxDimension，返回 null 表示不需要缩放。
 */
export function decideResizeDimension(
  width: number,
  height: number,
  maxDimension: number,
): { resize: { width: number } } | { resize: { height: number } } | null {
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxDimension) {
    return null; // 小图不放大
  }
  if (width >= height) {
    return { resize: { width: maxDimension } };
  }
  return { resize: { height: maxDimension } };
}

// ── 请求错误映射（纯函数） ────────────────────────

/**
 * 将 create/update 请求中的 catch 错误映射为用户可见消息
 */
export function mapMutationError(error: unknown): { message: string; isTimeout: boolean } {
  if (error instanceof Error && error.name === 'AbortError') {
    return { message: '请求超时，请检查网络后重试', isTimeout: true };
  }
  return { message: '无法连接服务，请检查网络后重试', isTimeout: false };
}

// ── 重复候选展示 ──────────────────────────────────

export interface DuplicateCandidateVM {
  productId: string;
  name: string;
  brand: string;
  categoryLabel: string;
  matchReason: string;
  matchStrength: 'strong' | 'normal';
  matchStrengthLabel: string;
}

const categoryLabels: Record<string, string> = {
  kitchen_cleaner: '厨房清洁',
  bathroom_cleaner: '浴室清洁',
  toilet_cleaner: '洁厕',
  descaler: '除垢',
  drain_cleaner: '管道疏通',
  disinfectant: '消毒',
  bleach: '漂白',
  laundry: '洗衣',
  fabric_softener: '柔顺',
  stain_remover: '去渍',
  pesticide: '杀虫',
  insect_repellent: '驱虫',
  other: '其他',
};

export function toDuplicateCandidateVM(
  candidate: DuplicateCandidate,
): DuplicateCandidateVM {
  return {
    productId: candidate.productId,
    name: candidate.name,
    brand: candidate.brand ?? '未知品牌',
    categoryLabel: categoryLabels[candidate.category] ?? candidate.category,
    matchReason: candidate.matchReason,
    matchStrength: candidate.matchStrength,
    matchStrengthLabel: candidate.matchStrength === 'strong' ? '高度匹配' : '可能匹配',
  };
}

// ── 重复决策类型 ──────────────────────────────────

export type DuplicateDecision = 'create_another' | 'update_existing' | 'go_back' | 'cancel';

export const duplicateDecisionLabels: Record<DuplicateDecision, string> = {
  create_another: '添加另一件',
  update_existing: '更新已有产品',
  go_back: '返回修改',
  cancel: '取消',
};
