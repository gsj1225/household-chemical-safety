/**
 * Intake Store — v2.0 扫描入库流程
 *
 * 状态机：
 * photo → recognizing → review → checking_duplicates →
 *   ├─ duplicate (有重复候选) → update_existing / create_another / go_back / cancel
 *   └─ creating (无重复) → success / error
 *
 * 补拍：photo → recognizing → supplement (合并观察) → review
 *
 * 表单状态和操作 ID 存储在 store 中，组件卸载/重装不丢失。
 * 合并/缩放/错误映射逻辑提取为 intake.ts 中的纯函数，测试直接导入。
 */

import { create } from 'zustand';
import { Platform } from 'react-native';
import { ApiError } from '../services/errors';
import { photoAssetService } from '../services/photoAssetService';
import { useInventoryStore } from './inventoryStore';
import {
  mergeObservations,
  applyMergedToProduct,
  mergeFormValues,
  applyConflictResolution,
  hasUnresolvedConflicts,
  mapMutationError,
  parseListString,
  normalizeCategory,
  type FormConflict,
} from '../view-models/intake';
import type { RecognitionDraft, ProductCreateRequest, ProductUpdateRequest, InventoryProduct, ProductCategory } from '../types/inventory';
import type { ProductMutationResult, DuplicateCandidate } from '../types/compatibility';

// ── 内部：通过 inventoryApi 获取已有产品 ────────

async function fetchProductForRescan(productId: string): Promise<InventoryProduct> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(productId)}`, {
      signal: controller.signal,
    });
    if (!response.ok) throw new ApiError('加载产品失败', response.status);
    const result = await response.json() as ProductMutationResult;
    return result.product;
  } finally {
    clearTimeout(timeout);
  }
}

// ── 表单状态类型 ──────────────────────────────────

export interface ReviewForm {
  name: string;
  brand: string;
  category: ProductCategory | null;  // null 表示未识别，用户必须手动选择
  ingredients: string;        // 顿号分隔的字符串
  productionDate: string;
  expiryDate: string;
  storageReqs: string;        // 顿号分隔
  hazardNotes: string;        // 顿号分隔
  labelWarnings: string;      // 顿号分隔
}

function draftToForm(draft: RecognitionDraft): ReviewForm {
  const pp = draft.proposedProduct;
  const normalizedCat = normalizeCategory(pp.category ?? '');
  return {
    name: pp.name ?? '',
    brand: pp.brand ?? '',
    category: normalizedCat,
    ingredients: pp.ingredients?.join('、') ?? '',
    productionDate: pp.production_date ?? '',
    expiryDate: pp.expiry_date ?? '',
    storageReqs: pp.storage_requirements?.join('、') ?? '',
    hazardNotes: pp.hazard_notes?.join('、') ?? '',
    labelWarnings: pp.label_warnings?.join('、') ?? '',
  };
}

function productToForm(product: InventoryProduct): ReviewForm {
  return {
    name: product.name,
    brand: product.brand ?? '',
    category: product.category as ProductCategory | null,
    ingredients: product.ingredients.filter((i) => i.display_value).map((i) => i.display_value).join('、'),
    productionDate: product.production_date?.value ?? '',
    expiryDate: product.expiry_date?.value ?? '',
    storageReqs: product.storage_requirements?.map((s) => s.text).join('、') ?? '',
    hazardNotes: product.hazards?.map((s) => s.text).join('、') ?? '',
    labelWarnings: product.label_warnings?.filter((w) => w.display_value).map((w) => w.display_value).join('、') ?? '',
  };
}

function parseDate(val: string) {
  const trimmed = val.trim();
  if (!trimmed) return { value: null, precision: 'unknown' as const, source: 'label' as const };
  return { value: trimmed, precision: 'month' as const, source: 'label' as const };
}

function computeInformationStatus(form: ReviewForm): 'complete' | 'needs_information' {
  const hasName = form.name.trim().length > 0;
  const hasExpiry = form.expiryDate.trim().length > 0;
  const hasIngredients = parseListString(form.ingredients).length > 0;
  return (hasName && hasExpiry && hasIngredients) ? 'complete' : 'needs_information';
}

function buildCommonFields(form: ReviewForm) {
  const ingredientList = parseListString(form.ingredients);
  const storageList = parseListString(form.storageReqs);
  const hazardList = parseListString(form.hazardNotes);
  const warningList = parseListString(form.labelWarnings);

  return {
    name: form.name.trim(),
    brand: form.brand.trim() || undefined,
    category: form.category ?? 'other', // 提交时保证有值（confirmCreate/confirmUpdate 已校验非空）
    production_date: parseDate(form.productionDate),
    expiry_date: parseDate(form.expiryDate),
    ingredients: ingredientList.map((ing) => ({
      display_value: ing,
      normalized_value: null,
      source: 'label' as const,
      confirmation: 'confirmed' as const,
      audit_source: null,
    })),
    label_warnings: warningList.map((w) => ({
      display_value: w,
      normalized_value: null,
      source: 'label' as const,
      confirmation: 'confirmed' as const,
      audit_source: null,
    })),
    storage_requirements: storageList.map((text) => ({
      text,
      source: 'label' as const,
      rule_id: null,
    })),
    hazards: hazardList.map((text) => ({
      text,
      source: 'label' as const,
      rule_id: null,
    })),
    incompatibility_targets: [] as never[],
    identification_confidence: 'user_confirmed' as const,
    information_status: computeInformationStatus(form),
  };
}

// ── 状态类型 ──────────────────────────────────────

export type IntakeStep =
  | 'idle'
  | 'photo'
  | 'recognizing'
  | 'review'
  | 'supplement'
  | 'checking_duplicates'
  | 'duplicate'
  | 'creating'
  | 'updating'
  | 'success'
  | 'error';

export type DuplicateDecision = 'create_another' | 'update_existing' | 'go_back' | 'cancel';

interface IntakeState {
  step: IntakeStep;
  errorMessage: string | null;

  // 照片
  photoUri: string | null;
  supplementUri: string | null;

  // 识别草稿
  draft: RecognitionDraft | null;

  // 表单状态（持久化在 store 中，组件卸载不丢失）
  reviewForm: ReviewForm | null;
  // 记录用户手动编辑过的字段，补拍时不覆盖
  editedFields: Set<string>;

  // 补拍冲突（标量字段新旧值冲突，需用户选择）
  formConflicts: FormConflict[];

  // 稳定操作 ID（进入 review 时生成，重试不重新生成）
  pendingProductId: string | null;
  pendingOperationId: string | null;

  // 重复候选
  duplicateCandidates: DuplicateCandidate[];
  selectedDuplicateId: string | null;
  duplicateResolved: boolean;

  // 创建/更新结果
  mutationResult: ProductMutationResult | null;

  // 封面保存失败标记
  coverSaveFailed: boolean;

  // Actions
  start: () => void;
  startRescan: (productId: string) => Promise<void>;
  rescanProductId: string | null;
  rescanRevision: number;
  setPhoto: (uri: string) => void;
  setSupplementPhoto: (uri: string) => void;
  recognize: () => Promise<void>;
  startSupplement: () => void;
  recognizeSupplement: () => Promise<void>;
  updateReviewForm: (updates: Partial<ReviewForm>) => void;
  resolveConflict: (conflictId: string, choice: 'original' | 'supplement') => void;
  checkDuplicates: () => Promise<void>;
  resolveDuplicate: (decision: DuplicateDecision) => Promise<void>;
  selectDuplicate: (productId: string) => void;
  confirmCreate: () => Promise<void>;
  confirmUpdate: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
  retryFromError: () => void;
}

// ── API 配置 ──────────────────────────────────────

const API_BASE = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000/api'
).replace(/\/$/, '');
const AI_TIMEOUT_MS = 45_000;
const REQUEST_TIMEOUT_MS = 15_000;

// ── 内部请求函数 ──────────────────────────────────

async function uploadForRecognition(imageUri: string): Promise<RecognitionDraft> {
  const photo = await photoAssetService.compressForUpload(imageUri);

  const formData = new FormData();
  if (Platform.OS === 'web') {
    const blobResponse = await fetch(photo.uri);
    const blob = await blobResponse.blob();
    formData.append('image', blob, photo.name);
  } else {
    formData.append('image', {
      uri: photo.uri,
      type: photo.type,
      name: photo.name,
    } as unknown as Blob);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/inventory/recognition/recognize`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `识别失败 (${response.status})`;
      try {
        const body = await response.json();
        if (body?.error?.message) detail = body.error.message;
      } catch { /* 非 JSON */ }
      throw new ApiError(detail, response.status);
    }

    return (await response.json()) as RecognitionDraft;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError('识别超时，请重试', undefined, 'REQUEST_TIMEOUT');
    }
    throw new ApiError('无法连接识别服务', undefined, 'NETWORK_UNAVAILABLE');
  } finally {
    clearTimeout(timeout);
  }
}

async function checkDuplicatesApi(
  name: string,
  brand?: string,
  category?: string,
  barcode?: string,
): Promise<{ candidates: DuplicateCandidate[]; hasCandidates: boolean }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/inventory/duplicates/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, brand, category, barcode, ingredients: [] }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ApiError('重复检查失败', response.status);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function createProductApi(
  data: ProductCreateRequest,
): Promise<{ ok: boolean; status: number; data?: ProductMutationResult; candidates?: DuplicateCandidate[]; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/inventory/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, status: 200, data: await response.json() };
    }

    const body = await response.json().catch(() => ({}));
    const error = body?.error?.message ?? `创建失败 (${response.status})`;

    if (response.status === 409 && body?.error?.candidates) {
      return { ok: false, status: 409, candidates: body.error.candidates, error };
    }

    return { ok: false, status: response.status, error };
  } catch (error) {
    const { message } = mapMutationError(error);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateProductApi(
  productId: string,
  data: ProductUpdateRequest,
): Promise<{ ok: boolean; status: number; data?: ProductMutationResult; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/inventory/products/${encodeURIComponent(productId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true, status: 200, data: await response.json() };
    }

    const body = await response.json().catch(() => ({}));
    const error = body?.error?.message ?? `更新失败 (${response.status})`;
    return { ok: false, status: response.status, error };
  } catch (error) {
    const { message } = mapMutationError(error);
    return { ok: false, status: 0, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

// ── 辅助：生成稳定 ID ────────────────────────────

function generateProductId(): string {
  return `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function generateOperationId(): string {
  return `op-${Date.now().toString(36)}`;
}

// ── Store ────────────────────────────────────────

export const useIntakeStore = create<IntakeState>((set, get) => ({
  step: 'idle',
  errorMessage: null,
  photoUri: null,
  supplementUri: null,
  draft: null,
  reviewForm: null,
  editedFields: new Set<string>(),
  formConflicts: [],
  pendingProductId: null,
  pendingOperationId: null,
  duplicateCandidates: [],
  selectedDuplicateId: null,
  duplicateResolved: false,
  mutationResult: null,
  coverSaveFailed: false,
  rescanProductId: null,
  rescanRevision: 1,

  start: () => {
    set({
      step: 'photo',
      errorMessage: null,
      photoUri: null,
      supplementUri: null,
      draft: null,
      reviewForm: null,
      editedFields: new Set<string>(),
      formConflicts: [],
      pendingProductId: null,
      pendingOperationId: null,
      duplicateCandidates: [],
      selectedDuplicateId: null,
      duplicateResolved: false,
      mutationResult: null,
      coverSaveFailed: false,
      rescanProductId: null,
      rescanRevision: 1,
    });
  },

  startRescan: async (productId: string) => {
    set({
      step: 'recognizing',
      errorMessage: null,
      photoUri: null,
      supplementUri: null,
      draft: null,
      reviewForm: null,
      editedFields: new Set<string>(),
      formConflicts: [],
      pendingProductId: null,
      pendingOperationId: null,
      duplicateCandidates: [],
      selectedDuplicateId: null,
      duplicateResolved: false,
      mutationResult: null,
      coverSaveFailed: false,
      rescanProductId: productId,
      rescanRevision: 1,
    });

    try {
      const product = await fetchProductForRescan(productId);

      const draft: RecognitionDraft = {
        draftId: `rescan-${Date.now().toString(36)}`,
        observations: [],
        proposedProduct: {
          brand: product.brand ?? '',
          name: product.name,
          category: product.category,
          ingredients: product.ingredients
            .filter((i) => i.display_value)
            .map((i) => i.display_value),
          storage_requirements: product.storage_requirements?.map((s) => s.text) ?? [],
          hazard_notes: product.hazards?.map((s) => s.text) ?? [],
          label_warnings: product.label_warnings?.filter((w) => w.display_value).map((w) => w.display_value) ?? [],
          production_date: product.production_date?.value ?? '',
          expiry_date: product.expiry_date?.value ?? '',
        },
        missingRequiredFields: [],
        lowConfidenceFields: [],
        duplicateCandidates: [],
        created_at: new Date().toISOString(),
      };

      set({
        step: 'review',
        draft,
        reviewForm: productToForm(product),
        rescanRevision: product.revision,
        errorMessage: null,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '加载产品信息失败';
      set({ step: 'photo', errorMessage: message, rescanProductId: null });
    }
  },

  setPhoto: (uri) => set({ photoUri: uri }),

  setSupplementPhoto: (uri) => set({ supplementUri: uri }),

  startSupplement: () => {
    set({ step: 'supplement', supplementUri: null, errorMessage: null });
  },

  recognize: async () => {
    const { photoUri } = get();
    if (!photoUri) {
      set({ step: 'error', errorMessage: '请先拍照或选择照片' });
      return;
    }

    set({ step: 'recognizing', errorMessage: null });

    try {
      const draft = await uploadForRecognition(photoUri);
      // 生成稳定操作 ID，重试不重新生成
      set({
        step: 'review',
        draft,
        reviewForm: draftToForm(draft),
        formConflicts: [],
        pendingProductId: generateProductId(),
        pendingOperationId: generateOperationId(),
        errorMessage: null,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '识别失败，请重试';
      set({ step: 'photo', errorMessage: message });
    }
  },

  recognizeSupplement: async () => {
    const { supplementUri, draft, reviewForm, editedFields, formConflicts: existingConflicts } = get();
    if (!supplementUri || !draft) return;

    set({ step: 'recognizing', errorMessage: null });

    try {
      const supplementDraft = await uploadForRecognition(supplementUri);

      // 合并观察记录（用于显示）
      const merged = mergeObservations(draft.observations, supplementDraft.observations);
      const updatedProduct = applyMergedToProduct(draft.proposedProduct, merged);

      const mergedObservationsAsDraft = merged.map((m) => ({
        field: m.field,
        display_value: m.displayValue,
        confidence: m.confidence as 'high' | 'medium' | 'low',
        source: m.source as 'model_observation' | 'label' | 'user' | 'rule',
        conflicting: m.conflicting,
        previous_value: m.previousValue,
      }));

      // 直接从补拍 proposedProduct 生成表单值，再与当前表单合并
      const supplementForm = draftToForm({ ...draft, proposedProduct: updatedProduct });
      const currentForm = reviewForm ?? supplementForm;

      // 使用纯函数合并表单值（标量字段空值填充+冲突检测，列表字段去重合并）
      const { merged: mergedValues, conflicts: newConflicts } = mergeFormValues(
        currentForm as unknown as Record<string, string>,
        supplementForm as unknown as Record<string, string>,
        editedFields,
      );

      const mergedForm: ReviewForm = {
        name: mergedValues.name ?? '',
        brand: mergedValues.brand ?? '',
        category: (mergedValues.category as ProductCategory | null) ?? null,
        ingredients: mergedValues.ingredients ?? '',
        productionDate: mergedValues.productionDate ?? '',
        expiryDate: mergedValues.expiryDate ?? '',
        storageReqs: mergedValues.storageReqs ?? '',
        hazardNotes: mergedValues.hazardNotes ?? '',
        labelWarnings: mergedValues.labelWarnings ?? '',
      };

      set({
        step: 'review',
        draft: {
          ...draft,
          observations: mergedObservationsAsDraft,
          proposedProduct: updatedProduct,
          missingRequiredFields: updatedProduct.name ? [] : ['name'],
        },
        reviewForm: mergedForm,
        formConflicts: [...existingConflicts, ...newConflicts],
        supplementUri: null,
        errorMessage: newConflicts.length > 0
          ? `补拍发现 ${newConflicts.length} 个字段冲突，请选择保留原值或使用补拍值`
          : null,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '补拍识别失败，请重试';
      set({ step: 'review', errorMessage: message });
    }
  },

  updateReviewForm: (updates) => {
    const { reviewForm, editedFields } = get();
    if (!reviewForm) return;
    const newEdited = new Set(editedFields);
    for (const key of Object.keys(updates)) {
      newEdited.add(key);
    }
    set({ reviewForm: { ...reviewForm, ...updates }, editedFields: newEdited });
  },

  resolveConflict: (conflictId, choice) => {
    const { formConflicts, reviewForm } = get();
    if (!reviewForm) return;

    const conflict = formConflicts.find((c) => c.id === conflictId);
    if (!conflict) return;

    const updatedConflicts = formConflicts.map((c) =>
      c.id === conflictId ? { ...c, resolved: choice } : c,
    );

    const resolved = applyConflictResolution(
      reviewForm as unknown as Record<string, string>,
      { ...conflict, resolved: choice },
    );
    set({
      formConflicts: updatedConflicts,
      reviewForm: { ...reviewForm, ...resolved } as unknown as ReviewForm,
    });
  },

  checkDuplicates: async () => {
    const { reviewForm } = get();
    if (!reviewForm) return;

    set({ step: 'checking_duplicates', errorMessage: null });

    try {
      const result = await checkDuplicatesApi(
        reviewForm.name || '',
        reviewForm.brand || undefined,
        reviewForm.category || undefined,
      );

      if (result.hasCandidates && result.candidates.length > 0) {
        set({
          step: 'duplicate',
          duplicateCandidates: result.candidates,
          errorMessage: null,
        });
      } else {
        set({ step: 'review', errorMessage: null });
      }
    } catch {
      set({ step: 'review', errorMessage: null });
    }
  },

  selectDuplicate: (productId: string) => {
    set({ selectedDuplicateId: productId });
  },

  resolveDuplicate: async (decision) => {
    const { duplicateCandidates, selectedDuplicateId } = get();

    switch (decision) {
      case 'create_another':
        set({ step: 'review', duplicateCandidates: [], duplicateResolved: true, errorMessage: null });
        break;

      case 'update_existing': {
        // 使用用户选中的候选，或默认第一个
        const targetId = selectedDuplicateId ?? (duplicateCandidates.length > 0 ? duplicateCandidates[0].productId : null);
        if (targetId) {
          set({
            rescanProductId: targetId,
            selectedDuplicateId: targetId,
            step: 'review',
            errorMessage: null,
          });
          try {
            const product = await fetchProductForRescan(targetId);
            // 用已有产品数据填充表单
            const { reviewForm } = get();
            const productForm = productToForm(product);
            set({
              reviewForm: reviewForm ?? productForm,
              rescanRevision: product.revision,
            });
          } catch {
            // 加载失败不阻塞
          }
        }
        break;
      }

      case 'go_back':
        set({ step: 'review', duplicateCandidates: [], errorMessage: null });
        break;

      case 'cancel':
        set({
          step: 'idle',
          duplicateCandidates: [],
          errorMessage: null,
          draft: null,
          photoUri: null,
          reviewForm: null,
        });
        break;
    }
  },

  confirmCreate: async () => {
    const { reviewForm, pendingProductId, pendingOperationId, duplicateResolved, formConflicts } = get();
    if (!reviewForm || !pendingProductId || !pendingOperationId) return;

    // 空名称校验
    if (!reviewForm.name.trim()) {
      set({ step: 'review', errorMessage: '产品名称不能为空' });
      return;
    }

    // 品类校验：用户必须明确选择品类
    if (!reviewForm.category) {
      set({ step: 'review', errorMessage: '请选择品类' });
      return;
    }

    // 未解决冲突校验
    if (hasUnresolvedConflicts(formConflicts)) {
      set({ step: 'review', errorMessage: '请先解决所有冲突后再确认入库' });
      return;
    }

    set({ step: 'creating', errorMessage: null });

    const commonFields = buildCommonFields(reviewForm);

    const productData: ProductCreateRequest = {
      productId: pendingProductId,
      operationId: pendingOperationId,
      revision: 1,
      barcode: undefined,
      shelf_life_text: undefined,
      duplicateDecision: duplicateResolved ? 'create_another' : 'check_first',
      ...commonFields,
    };

    try {
      const result = await createProductApi(productData);

      if (!result.ok) {
        if (result.status === 409 && result.candidates) {
          set({
            step: 'duplicate',
            duplicateCandidates: result.candidates,
            errorMessage: result.error ?? '服务端检测到疑似重复',
          });
          return;
        }
        throw new ApiError(result.error ?? '创建失败', result.status);
      }

      // 保存封面
      const { photoUri } = get();
      let coverFailed = false;
      if (photoUri) {
        try {
          await photoAssetService.saveCover(pendingProductId, photoUri);
        } catch {
          coverFailed = true;
        }
      }

      await useInventoryStore.getState().refresh();

      set({
        step: 'success',
        mutationResult: result.data,
        coverSaveFailed: coverFailed,
        errorMessage: coverFailed ? '产品已创建，但照片保存失败' : null,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '创建产品失败，请重试';
      set({ step: 'error', errorMessage: message });
    }
  },

  confirmUpdate: async () => {
    const { reviewForm, pendingOperationId, rescanProductId, rescanRevision, formConflicts } = get();
    if (!reviewForm || !rescanProductId) return;

    if (!reviewForm.name.trim()) {
      set({ step: 'review', errorMessage: '产品名称不能为空' });
      return;
    }

    // 品类校验：用户必须明确选择品类
    if (!reviewForm.category) {
      set({ step: 'review', errorMessage: '请选择品类' });
      return;
    }

    // 未解决冲突校验
    if (hasUnresolvedConflicts(formConflicts)) {
      set({ step: 'review', errorMessage: '请先解决所有冲突后再确认更新' });
      return;
    }

    // 生成稳定操作 ID（重试沿用同一 ID）
    let operationId = pendingOperationId;
    if (!operationId) {
      operationId = generateOperationId();
      set({ pendingOperationId: operationId });
    }

    set({ step: 'updating', errorMessage: null });

    const commonFields = buildCommonFields(reviewForm);

    const updateData: ProductUpdateRequest = {
      expectedRevision: rescanRevision,
      operationId,
      ...commonFields,
    };

    try {
      const result = await updateProductApi(rescanProductId, updateData);

      if (!result.ok) {
        if (result.status === 409) {
          throw new ApiError(
            '该产品已被修改，请刷新后重试',
            409,
            'PRODUCT_VERSION_CONFLICT',
          );
        }
        throw new ApiError(result.error ?? '更新失败', result.status);
      }

      const { photoUri } = get();
      let coverFailed = false;
      if (photoUri) {
        try {
          await photoAssetService.saveCover(rescanProductId, photoUri);
        } catch {
          coverFailed = true;
        }
      }

      await useInventoryStore.getState().refresh();

      set({
        step: 'success',
        mutationResult: result.data,
        coverSaveFailed: coverFailed,
        errorMessage: coverFailed ? '产品已更新，但照片保存失败' : null,
      });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : '更新产品失败，请重试';
      set({ step: 'error', errorMessage: message });
    }
  },

  reset: () => {
    set({
      step: 'idle',
      errorMessage: null,
      photoUri: null,
      supplementUri: null,
      draft: null,
      reviewForm: null,
      editedFields: new Set<string>(),
      formConflicts: [],
      pendingProductId: null,
      pendingOperationId: null,
      duplicateCandidates: [],
      selectedDuplicateId: null,
      duplicateResolved: false,
      mutationResult: null,
      coverSaveFailed: false,
      rescanProductId: null,
      rescanRevision: 1,
    });
  },

  clearError: () => set({ errorMessage: null }),

  retryFromError: () => {
    const { reviewForm } = get();
    if (reviewForm) {
      set({ step: 'review', errorMessage: null });
    } else {
      set({ step: 'photo', errorMessage: null });
    }
  },
}));
