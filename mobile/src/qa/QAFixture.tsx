/**
 * QAFixture — 开发环境确定性状态夹具
 *
 * 仅用于 Stage 7 Visual QA 截图，不进入正式导航。
 * 直接向 Zustand store 注入预设状态，渲染各页面/组件。
 * 不修改 API、Store 契约或业务流程。
 *
 * URL 参数：
 *   ?qa=1&scene=<name>         选择场景（显示 QA 调试栏）
 *   ?qa=1&scene=<name>&capture=1  截图模式（隐藏 QA 调试栏）
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { semanticColors, rawTokens } from '../theme/tokens';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import AppDialog from '../components/primitives/AppDialog';

import { useInventoryStore } from '../store/inventoryStore';
import { useCompatibilityStore } from '../store/compatibilityStore';
import { useIntakeStore, type ReviewForm } from '../store/intakeStore';
import type { FormConflict } from '../view-models/intake';
import { toRelationVM, type RelationVM } from '../view-models/compatibility';

import { inventoryApi } from '../services/inventoryApi';
import { photoAssetService } from '../services/photoAssetService';

import InventoryScreen from '../screens/InventoryScreen';
import CompatibilityScreen from '../screens/CompatibilityScreen';
import IntakeFlowScreen from '../screens/IntakeFlowScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import ProductEditScreen from '../screens/ProductEditScreen';
import RelationDetailScreen from '../screens/RelationDetailScreen';
import IntakeReviewStep from '../components/features/intake/IntakeReviewStep';
import IntakePhotoStep from '../components/features/intake/IntakePhotoStep';
import PermissionDeniedView from '../components/features/intake/PermissionDeniedView';

import type { InventoryProduct, RecognitionDraft } from '../types/inventory';
import type { CompatibilitySummary, CompatibilityApiRelation, ProductMutationResult } from '../types/compatibility';
import type { RootStackParamList } from '../types';

// ── 工厂函数 ──────────────────────────────────────

function makeProduct(overrides: Partial<InventoryProduct> = {}): InventoryProduct {
  return {
    productId: 'test-1',
    revision: 1,
    brand: '威猛先生',
    name: '威猛先生厨房清洁剂',
    category: 'kitchen_cleaner',
    barcode: null,
    production_date: { value: '2025-03', precision: 'month', source: 'label' },
    expiry_date: { value: '2027-03', precision: 'month', source: 'label' },
    shelf_life_text: '24个月',
    ingredients: [
      { display_value: '次氯酸钠', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '水', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    label_warnings: [
      { display_value: '远离儿童', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '不可食用', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    storage_requirements: [
      { text: '避光阴凉处保存', source: 'label', rule_id: null },
      { text: '远离热源', source: 'label', rule_id: null },
    ],
    hazards: [
      { text: '腐蚀性液体，避免接触皮肤', source: 'label', rule_id: null },
    ],
    incompatibility_targets: [
      { text: '含氨清洁剂', source: 'label', rule_id: null },
      { text: '酸性清洁剂', source: 'label', rule_id: null },
    ],
    identification_confidence: 'user_confirmed',
    information_status: 'needs_information',
    created_at: '2026-08-03T12:00:00Z',
    updated_at: '2026-08-03T12:00:00Z',
    ...overrides,
  };
}

function makeLongTextProduct(): InventoryProduct {
  return makeProduct({
    productId: 'test-long',
    name: '超长名称的清洁剂品牌威猛先生厨房重油污清洁剂柠檬香型超大容量装',
    brand: '超长品牌名称有限公司',
    ingredients: [
      { display_value: '次氯酸钠', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '表面活性剂', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '水', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '香精', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
      { display_value: '着色剂', normalized_value: null, source: 'label', confirmation: 'confirmed', audit_source: null },
    ],
    hazards: [
      { text: '腐蚀性液体，避免接触皮肤和眼睛', source: 'label', rule_id: null },
      { text: '不可与酸性产品混用，会产生有毒气体', source: 'label', rule_id: null },
      { text: '远离火源和热源', source: 'label', rule_id: null },
    ],
    storage_requirements: [
      { text: '避光阴凉处保存', source: 'label', rule_id: null },
      { text: '远离儿童和宠物', source: 'label', rule_id: null },
      { text: '使用后密封保存', source: 'label', rule_id: null },
    ],
  });
}

function makeMinimalProduct(): InventoryProduct {
  return makeProduct({
    productId: 'test-minimal',
    name: '未知清洁剂',
    brand: null,
    category: 'other',
    production_date: { value: null, precision: 'unknown', source: 'label' },
    expiry_date: { value: null, precision: 'unknown', source: 'label' },
    shelf_life_text: null,
    ingredients: [],
    label_warnings: [],
    storage_requirements: [],
    hazards: [],
    incompatibility_targets: [],
    information_status: 'needs_information',
  });
}

function makeSummary(overrides: Partial<CompatibilitySummary> = {}): CompatibilitySummary {
  return {
    status: 'no_registered_conflict',
    totalRelations: 0,
    criticalCount: 0,
    attentionCount: 0,
    unknownCount: 0,
    needsInformationCount: 0,
    totalProducts: 4,
    boundaryNotice: '库内存在相关产品，不表示它们正在共同存放或混用。',
    ...overrides,
  };
}

function makeRelation(overrides: Partial<CompatibilityApiRelation> = {}): CompatibilityApiRelation {
  return {
    relation_id: 'rel-1',
    product_a_id: 'p1',
    product_b_id: 'p2',
    relation_type: 'do_not_mix',
    severity: 'critical',
    rule_id: 'rule-bleach-acid-001',
    rule_version: '1.0',
    payload: {
      title: '含氯消毒剂 × 酸性清洁剂',
      rationale: '含氯消毒剂与酸性清洁剂混合会产生有毒氯气，可能导致呼吸道损伤。',
      recommended_action: '不要混合使用。更换产品前充分冲洗并保持通风。',
      evidence_status: 'verified',
      sources: [],
    },
    updated_at: '2026-08-03T12:00:00Z',
    ...overrides,
  };
}

function makeMutationResult(product: InventoryProduct): ProductMutationResult {
  return {
    product,
    compatibilitySummary: makeSummary({ totalProducts: 4 }),
    changedRelations: [],
  };
}

function makeDraft(overrides: Partial<RecognitionDraft> = {}): RecognitionDraft {
  return {
    draftId: 'draft-1',
    observations: [
      { field: 'name', display_value: '威猛先生厨房清洁剂', confidence: 'high', source: 'label' },
      { field: 'brand', display_value: '威猛先生', confidence: 'high', source: 'label' },
      { field: 'category', display_value: '未知', confidence: 'low', source: 'model_observation' },
    ],
    proposedProduct: {
      brand: '威猛先生',
      name: '威猛先生厨房清洁剂',
      category: '未知',
      production_date: '2025-03',
      expiry_date: '2027-03',
      ingredients: ['次氯酸钠', '水'],
      storage_requirements: ['避光阴凉处保存'],
      hazard_notes: ['腐蚀性'],
      label_warnings: ['远离儿童'],
    },
    missingRequiredFields: [],
    lowConfidenceFields: ['category'],
    duplicateCandidates: [],
    created_at: '2026-08-03T12:00:00Z',
    ...overrides,
  };
}

function makeReviewForm(overrides: Partial<ReviewForm> = {}): ReviewForm {
  return {
    name: '威猛先生厨房清洁剂',
    brand: '威猛先生',
    category: null,
    ingredients: '次氯酸钠、水',
    productionDate: '2025-03',
    expiryDate: '2027-03',
    storageReqs: '避光阴凉处保存',
    hazardNotes: '腐蚀性',
    labelWarnings: '远离儿童',
    ...overrides,
  };
}

function makeConflict(overrides: Partial<FormConflict> = {}): FormConflict {
  return {
    id: 'conflict-1',
    field: 'name',
    originalValue: '威猛先生厨房清洁剂',
    supplementValue: '威猛先生清洁剂',
    resolved: null,
    ...overrides,
  };
}

// ── 状态注入器 ────────────────────────────────────

function injectInventoryState(state: {
  items?: InventoryProduct[];
  total?: number;
  summary?: CompatibilitySummary | null;
  loadState?: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string | null;
  searchQuery?: string | null;
}) {
  const store = useInventoryStore as unknown as { setState: (partial: Record<string, unknown>) => void };
  store.setState({
    items: state.items ?? [],
    total: state.total ?? (state.items?.length ?? 0),
    summary: state.summary ?? null,
    loadState: state.loadState ?? 'success',
    errorMessage: state.errorMessage ?? null,
    searchQuery: state.searchQuery ?? null,
    load: async () => {},
    refresh: async () => {},
  });
}

function injectCompatibilityState(state: {
  relations?: CompatibilityApiRelation[];
  summary?: CompatibilitySummary | null;
  loadState?: 'idle' | 'loading' | 'success' | 'error';
  errorMessage?: string | null;
  productMap?: Record<string, InventoryProduct>;
}) {
  const store = useCompatibilityStore as unknown as { setState: (partial: Record<string, unknown>) => void };
  const productMap = state.productMap ?? {};
  const rawRelations = state.relations ?? [];
  const relations: RelationVM[] = rawRelations.map(toRelationVM);
  store.setState({
    rawRelations,
    relations,
    summary: state.summary ?? null,
    loadState: state.loadState ?? 'success',
    errorMessage: state.errorMessage ?? null,
    productMap,
    total: rawRelations.length,
    severityFilter: 'all',
    load: async () => {},
    loadSummary: async () => {},
    refresh: async () => {},
  });
}

function injectIntakeState(state: {
  step?: string;
  errorMessage?: string | null;
  draft?: RecognitionDraft | null;
  reviewForm?: ReviewForm | null;
  formConflicts?: FormConflict[];
  coverSaveFailed?: boolean;
  rescanProductId?: string | null;
}) {
  const store = useIntakeStore as unknown as { setState: (partial: Record<string, unknown>) => void };
  store.setState({
    step: state.step ?? 'review',
    errorMessage: state.errorMessage ?? null,
    draft: state.draft ?? null,
    reviewForm: state.reviewForm ?? null,
    formConflicts: state.formConflicts ?? [],
    coverSaveFailed: state.coverSaveFailed ?? false,
    rescanProductId: state.rescanProductId ?? null,
    // 覆盖 actions 为空操作，防止 IntakeFlowScreen useEffect 自动调用 start/startRescan 覆盖注入状态
    start: async () => {},
    startRescan: async () => {},
    reset: () => {},
  });
}

// ── API 猴补丁（仅 QA 环境） ─────────────────────

const originalGetDetail = inventoryApi.getDetail.bind(inventoryApi);
const originalGetById = inventoryApi.getById.bind(inventoryApi);
const originalGetCoverUri = photoAssetService.getCoverUri.bind(photoAssetService);

function patchApiForScene(scene: string) {
  inventoryApi.getDetail = originalGetDetail;
  inventoryApi.getById = originalGetById;
  photoAssetService.getCoverUri = originalGetCoverUri;

  // QA 环境始终 mock 封面 URI，避免文件系统访问
  photoAssetService.getCoverUri = async () => null;

  if (scene === 'detail-loading') {
    inventoryApi.getDetail = () => new Promise<ProductMutationResult>(() => {});
  } else if (scene === 'detail-error') {
    inventoryApi.getDetail = async () => { throw new Error('网络连接失败，请检查后重试'); };
  } else if (scene === 'detail-full') {
    inventoryApi.getDetail = async () => makeMutationResult(makeProduct());
  } else if (scene === 'detail-minimal') {
    inventoryApi.getDetail = async () => makeMutationResult(makeMinimalProduct());
  } else if (scene === 'detail-long-text') {
    inventoryApi.getDetail = async () => makeMutationResult(makeLongTextProduct());
  } else if (scene === 'edit-form') {
    inventoryApi.getById = async () => makeProduct();
  }
}

// ── 导航包装器 ────────────────────────────────────

const QAStack = createNativeStackNavigator<RootStackParamList>();

function QAFullNavigator({ initialRoute, productId }: { initialRoute: keyof RootStackParamList; productId?: string }) {
  const initialParams = productId ? { productId } : undefined;
  return (
    <NavigationContainer>
      <QAStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <QAStack.Screen name="Inventory" component={InventoryScreen} />
        <QAStack.Screen name="IntakeFlow" component={IntakeFlowScreen} />
        <QAStack.Screen name="ProductDetail" component={ProductDetailScreen} initialParams={initialParams} />
        <QAStack.Screen name="ProductEdit" component={ProductEditScreen} initialParams={initialParams} />
        <QAStack.Screen name="Compatibility" component={CompatibilityScreen} />
        <QAStack.Screen name="RelationDetail" component={RelationDetailScreen} />
      </QAStack.Navigator>
    </NavigationContainer>
  );
}

// ── 删除确认对话框场景（使用生产 AppDialog） ──────

function QADeleteDialogScene() {
  return (
    <View style={styles.root}>
      <View style={styles.qaWrapper}>
        <StateMessage title="产品详情" description="威猛先生厨房清洁剂 · 厨房清洁" tone="neutral" />
      </View>
      <AppDialog
        visible={true}
        title="确认删除"
        description={'确定要删除"威猛先生厨房清洁剂"吗？此操作不可撤销。'}
        variant="destructive"
        confirmLabel="删除"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </View>
  );
}

function QAUnsavedDialogScene() {
  return (
    <View style={styles.root}>
      <View style={styles.qaWrapper}>
        <StateMessage title="编辑产品" description="威猛先生厨房清洁剂" tone="neutral" />
      </View>
      <AppDialog
        visible={true}
        title="未保存的修改"
        description="你有未保存的修改，确定要离开吗？"
        variant="unsaved"
        unsavedHint="离开后修改将丢失"
        confirmLabel="离开"
        cancelLabel="继续编辑"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    </View>
  );
}

// ── 场景定义 ──────────────────────────────────────

const SCENES: string[] = [
  'inventory-empty',
  'inventory-content',
  'inventory-loading',
  'inventory-error',
  'inventory-no-results',
  'intake-review-normal',
  'intake-category-unknown',
  'intake-conflict',
  'intake-permission-denied',
  'intake-partial-success',
  'detail-full',
  'detail-minimal',
  'detail-long-text',
  'detail-loading',
  'detail-error',
  'edit-form',
  'edit-unsaved-dialog',
  'detail-delete-dialog',
  'compat-critical',
  'compat-attention',
  'compat-unknown',
  'compat-empty',
  'compat-loading',
  'compat-error',
];

function setupScene(scene: string) {
  patchApiForScene(scene);

  injectInventoryState({ items: [], summary: null, loadState: 'idle', errorMessage: null, searchQuery: null });
  injectCompatibilityState({ relations: [], summary: null, loadState: 'idle', errorMessage: null });
  injectIntakeState({ step: 'idle', draft: null, reviewForm: null, formConflicts: [], errorMessage: null });

  const products = [
    makeProduct({ productId: 'p1' }),
    makeProduct({ productId: 'p2', name: '超威杀虫气雾剂', brand: '超威', category: 'pesticide' }),
    makeProduct({ productId: 'p3', name: '蓝月亮洗手液', brand: '蓝月亮', category: 'disinfectant' }),
    makeProduct({ productId: 'p4', name: '威白洁厕灵', brand: '威白', category: 'toilet_cleaner' }),
  ];

  switch (scene) {
    case 'inventory-empty':
      injectInventoryState({ items: [], total: 0, summary: makeSummary({ totalProducts: 0 }), loadState: 'success' });
      break;
    case 'inventory-content':
      injectInventoryState({ items: products, total: 4, summary: makeSummary({ totalProducts: 4, criticalCount: 2, status: 'has_conflict' }), loadState: 'success' });
      break;
    case 'inventory-loading':
      injectInventoryState({ items: [], summary: null, loadState: 'loading' });
      break;
    case 'inventory-error':
      injectInventoryState({ items: [], summary: null, loadState: 'error', errorMessage: '无法连接服务，请检查网络后重试' });
      break;
    case 'inventory-no-results':
      injectInventoryState({ items: [], total: 0, summary: makeSummary({ totalProducts: 4 }), loadState: 'success', searchQuery: '不存在的' });
      break;

    case 'intake-review-normal':
      injectIntakeState({ step: 'review', draft: makeDraft(), reviewForm: makeReviewForm({ category: 'kitchen_cleaner' }) });
      break;
    case 'intake-category-unknown':
      injectIntakeState({ step: 'review', draft: makeDraft(), reviewForm: makeReviewForm({ category: null }) });
      break;
    case 'intake-conflict':
      injectIntakeState({
        step: 'review',
        draft: makeDraft(),
        reviewForm: makeReviewForm({ category: 'kitchen_cleaner' }),
        formConflicts: [
          makeConflict({ id: 'c1', field: 'name', originalValue: '威猛先生厨房清洁剂', supplementValue: '威猛先生清洁剂' }),
          makeConflict({ id: 'c2', field: 'brand', originalValue: '威猛先生', supplementValue: '威猛', resolved: 'original' }),
        ],
      });
      break;
    case 'intake-permission-denied':
      // 使用生产 PermissionDeniedView 组件，不复制文案
      break;
    case 'intake-partial-success':
      // 使用真实 IntakeFlowScreen + Store 注入（step=success, coverSaveFailed=true）
      injectIntakeState({ step: 'success', coverSaveFailed: true });
      break;

    case 'detail-full':
    case 'detail-minimal':
    case 'detail-long-text':
    case 'detail-loading':
    case 'detail-error':
      break;

    case 'edit-form':
      break;

    case 'edit-unsaved-dialog':
    case 'detail-delete-dialog':
      break;

    case 'compat-critical':
      injectCompatibilityState({
        relations: [makeRelation()],
        summary: makeSummary({ status: 'has_conflict', totalRelations: 1, criticalCount: 1 }),
        productMap: { 'p1': products[0], 'p2': products[1] },
      });
      break;
    case 'compat-attention':
      injectCompatibilityState({
        relations: [makeRelation({
          severity: 'attention',
          relation_type: 'separate_storage',
          payload: { title: '漂白剂 × 还原剂', rationale: '建议分开存放，避免意外接触。', recommended_action: '分开存放，避免意外接触。', evidence_status: 'verified', sources: [] },
        })],
        summary: makeSummary({ status: 'has_conflict', totalRelations: 1, attentionCount: 1 }),
        productMap: { 'p1': products[0], 'p2': products[1] },
      });
      break;
    case 'compat-unknown':
      injectCompatibilityState({
        relations: [makeRelation({
          severity: 'unknown',
          relation_type: 'needs_information',
          payload: { title: '消毒液 × 清洁剂', rationale: '成分信息不完整，无法判断相容性。', recommended_action: '补充产品成分信息后重新检测。', evidence_status: 'needs_review', sources: [] },
        })],
        summary: makeSummary({ status: 'needs_information', totalRelations: 1, unknownCount: 1, needsInformationCount: 1 }),
        productMap: { 'p1': products[0], 'p2': products[1] },
      });
      break;
    case 'compat-empty':
      injectCompatibilityState({ relations: [], summary: makeSummary({ totalProducts: 0 }), loadState: 'success' });
      break;
    case 'compat-loading':
      injectCompatibilityState({ relations: [], summary: null, loadState: 'loading' });
      break;
    case 'compat-error':
      injectCompatibilityState({ relations: [], summary: null, loadState: 'error', errorMessage: '加载相容性数据失败，请重试' });
      break;
  }
}

// ── QA 夹具组件 ───────────────────────────────────

export default function QAFixture() {
  const [currentScene, setCurrentScene] = useState<string>('');
  const [capture, setCapture] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const scene = params.get('scene');
      const cap = params.get('capture');
      if (scene) {
        setupScene(scene);
        setCurrentScene(scene);
        setCapture(cap === '1');
      }
    }
  }, []);

  const selectScene = (scene: string) => {
    setupScene(scene);
    setCurrentScene(scene);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `?qa=1&scene=${scene}`);
    }
  };

  const renderScene = () => {
    if (!currentScene) {
      return (
        <ScreenScroll variant="list">
          <View style={styles.sceneList}>
            <AppText variant="title">QA Fixture — 选择场景</AppText>
            {SCENES.map((s) => (
              <Pressable
                key={s}
                onPress={() => selectScene(s)}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <View style={styles.sceneItem}>
                  <AppText variant="label">{s}</AppText>
                </View>
              </Pressable>
            ))}
          </View>
        </ScreenScroll>
      );
    }

    // 详情场景
    if (currentScene.startsWith('detail-') && currentScene !== 'detail-delete-dialog') {
      return <QAFullNavigator initialRoute="ProductDetail" productId="test-1" />;
    }

    // 编辑表单
    if (currentScene === 'edit-form') {
      return <QAFullNavigator initialRoute="ProductEdit" productId="test-1" />;
    }

    // 对话框场景
    if (currentScene === 'detail-delete-dialog') {
      return <QADeleteDialogScene />;
    }
    if (currentScene === 'edit-unsaved-dialog') {
      return <QAUnsavedDialogScene />;
    }

    // 入库场景
    if (currentScene === 'intake-permission-denied') {
      // 使用生产 PermissionDeniedView 组件
      return (
        <View style={styles.qaWrapper}>
          <PermissionDeniedView />
        </View>
      );
    }
    if (currentScene === 'intake-partial-success') {
      // 使用真实 IntakeFlowScreen + Store 注入
      return <QAFullNavigator initialRoute="IntakeFlow" />;
    }
    if (currentScene.startsWith('intake-')) {
      return <IntakeReviewStep />;
    }

    // 仓库场景
    if (currentScene.startsWith('inventory-')) {
      return <QAFullNavigator initialRoute="Inventory" />;
    }

    // 相容性场景
    if (currentScene.startsWith('compat-')) {
      return <QAFullNavigator initialRoute="Compatibility" />;
    }

    return (
      <View style={styles.centering}>
        <AppText variant="body" color="secondary">场景: {currentScene}</AppText>
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        {/* capture 模式下隐藏 QA 调试栏，截图为真实布局 */}
        {currentScene && !capture ? (
          <View style={styles.sceneBar}>
            <AppText variant="caption" color="muted">QA: {currentScene}</AppText>
            <Pressable onPress={() => {
              setCurrentScene('');
              if (typeof window !== 'undefined') {
                window.history.replaceState(null, '', window.location.pathname);
              }
            }}>
              <AppText variant="caption" color="action">← 返回场景列表</AppText>
            </Pressable>
          </View>
        ) : null}
        <View style={styles.content}>
          {renderScene()}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
  sceneBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: rawTokens.space[3],
    paddingVertical: rawTokens.space[1],
    backgroundColor: semanticColors.surface.subtle,
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.border.subtle,
  },
  content: {
    flex: 1,
  },
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  sceneList: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[4],
  },
  sceneItem: {
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.subtle,
  },
  pressed: {
    opacity: 0.7,
  },
  qaWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[4],
  },
});
