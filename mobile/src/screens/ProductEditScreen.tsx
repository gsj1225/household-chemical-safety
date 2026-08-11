/**
 * ProductEditScreen — 编辑产品
 *
 * F5: 修改已有产品信息，使用 PATCH + expectedRevision 乐观并发。
 * 支持编辑：名称、品牌、品类、成分、生产日期、有效期、储存条件、危险性说明
 * 拦截导航离开（返回键/手势/浏览器返回），有未保存修改时弹出确认。
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { generateStableOperationId, shouldResetOperationId } from '../utils/operationId';
import { StyleSheet, View, BackHandler } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { rawTokens, semanticColors } from '../theme/tokens';
import ScreenSafeArea from '../components/primitives/ScreenSafeArea';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import TextField from '../components/primitives/TextField';
import SemanticBadge from '../components/primitives/SemanticBadge';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import AppDialog from '../components/primitives/AppDialog';
import { inventoryApi } from '../services/inventoryApi';
import { useInventoryStore } from '../store/inventoryStore';
import type { RootStackParamList } from '../types';
import type {
  ProductCategory,
  InventoryProduct,
  ConfirmedFact,
  FactSource,
  ConfirmationStatus,
} from '../types/inventory';

const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: 'disinfectant', label: '消毒' },
  { value: 'bleach', label: '漂白' },
  { value: 'kitchen_cleaner', label: '厨房清洁' },
  { value: 'bathroom_cleaner', label: '浴室清洁' },
  { value: 'toilet_cleaner', label: '洁厕' },
  { value: 'laundry', label: '洗衣' },
  { value: 'fabric_softener', label: '柔顺' },
  { value: 'pesticide', label: '杀虫' },
  { value: 'other', label: '其他' },
];

export default function ProductEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ProductEdit'>>();
  const navigation = useNavigation<any>();
  const { productId } = route.params;
  const { refresh } = useInventoryStore();

  const [loadState, setLoadState] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const originalRef = useRef<InventoryProduct | null>(null);
  const [revision, setRevision] = useState(1);

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState<ProductCategory>('other');
  const [ingredients, setIngredients] = useState('');
  const [productionDate, setProductionDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [storageReqs, setStorageReqs] = useState('');
  const [hazardNotes, setHazardNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState(false);
  const [cancelDialogVisible, setCancelDialogVisible] = useState(false);

  // 稳定操作 ID：首次保存时生成，重试复用，成功/取消/内容改变后重置
  const operationIdRef = useRef<string | null>(null);
  // 上次保存尝试的表单快照（用于检测内容是否改变）
  const lastSaveSnapshotRef = useRef<string | null>(null);

  // 真实 dirty 判断：比较当前值与原始值
  const isDirty = useCallback(() => {
    const original = originalRef.current;
    if (!original) return false;
    const origIngredients = original.ingredients
      .filter((i) => i.display_value)
      .map((i) => i.display_value)
      .join('、');
    const origStorage = original.storage_requirements?.map((s) => s.text).join('、') ?? '';
    const origHazards = original.hazards?.map((s) => s.text).join('、') ?? '';
    const origProdDate = original.production_date?.value ?? '';
    const origExpDate = original.expiry_date?.value ?? '';

    return (
      name !== original.name ||
      brand !== (original.brand ?? '') ||
      category !== original.category ||
      ingredients !== origIngredients ||
      productionDate !== origProdDate ||
      expiryDate !== origExpDate ||
      storageReqs !== origStorage ||
      hazardNotes !== origHazards
    );
  }, [name, brand, category, ingredients, productionDate, expiryDate, storageReqs, hazardNotes]);

  // 拦截导航离开
  const handleNavigationLeave = useCallback(() => {
    if (isDirty()) {
      setCancelDialogVisible(true);
      return true; // 阻止默认行为
    }
    return false; // 允许导航
  }, [isDirty]);

  // Android 硬件返回键拦截
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      return handleNavigationLeave();
    });
    return () => subscription.remove();
  }, [handleNavigationLeave]);

  // React Navigation beforeRemove 事件拦截
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: any) => {
      if (!isDirty()) return; // 没有修改，不拦截
      // 阻止导航离开
      e.preventDefault();
      setCancelDialogVisible(true);
    });
    return unsubscribe;
  }, [navigation, isDirty]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadState('loading');
      try {
        const product = await inventoryApi.getById(productId);
        if (cancelled) return;
        originalRef.current = product;
        setName(product.name);
        setBrand(product.brand ?? '');
        setCategory(product.category);
        setIngredients(
          product.ingredients
            .filter((i) => i.display_value)
            .map((i) => i.display_value)
            .join('、'),
        );
        setProductionDate(product.production_date?.value ?? '');
        setExpiryDate(product.expiry_date?.value ?? '');
        setStorageReqs(
          product.storage_requirements?.map((s) => s.text).join('、') ?? '',
        );
        setHazardNotes(
          product.hazards?.map((s) => s.text).join('、') ?? '',
        );
        setRevision(product.revision);
        setLoadState('success');
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : '加载失败');
        setLoadState('error');
      }
    })();
    return () => { cancelled = true; };
  }, [productId]);

  const handleSave = useCallback(async () => {
    const original = originalRef.current;
    if (!original) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      return;
    }
    setNameError(false);

    setSaving(true);
    setErrorMessage(null);

    // 检测表单内容是否与上次保存尝试不同；如不同则重置 operationId
    const currentSnapshot = JSON.stringify({
      name: trimmedName, brand, category, ingredients,
      productionDate, expiryDate, storageReqs, hazardNotes,
    });
    if (shouldResetOperationId(currentSnapshot, lastSaveSnapshotRef.current)) {
      operationIdRef.current = null; // 内容改变，生成新 ID
    }
    lastSaveSnapshotRef.current = currentSnapshot;

    try {
      const ingredientList = ingredients
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const storageList = storageReqs
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const hazardList = hazardNotes
        .split(/[、,，\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const confirmedIngredients: ConfirmedFact[] = ingredientList.map((ing) => ({
        display_value: ing,
        normalized_value: null,
        source: 'user' as FactSource,
        confirmation: 'confirmed' as ConfirmationStatus,
        audit_source: null,
      }));

      const parseDate = (val: string) => {
        const trimmed = val.trim();
        if (!trimmed) return { value: null, precision: 'unknown' as const, source: 'user' as const };
        return { value: trimmed, precision: 'month' as const, source: 'user' as const };
      };

      await inventoryApi.update(productId, {
        expectedRevision: revision,
        operationId: operationIdRef.current ?? (operationIdRef.current = generateStableOperationId('op-edit')),
        name: trimmedName,
        brand: brand.trim() || undefined,
        category,
        barcode: original.barcode ?? undefined,
        production_date: parseDate(productionDate),
        expiry_date: parseDate(expiryDate),
        shelf_life_text: original.shelf_life_text ?? undefined,
        ingredients: confirmedIngredients,
        label_warnings: original.label_warnings,
        storage_requirements: storageList.map((text) => ({
          text,
          source: 'user' as FactSource,
          rule_id: null,
        })),
        hazards: hazardList.map((text) => ({
          text,
          source: 'user' as FactSource,
          rule_id: null,
        })),
        incompatibility_targets: original.incompatibility_targets,
        identification_confidence: 'user_confirmed',
        information_status: (trimmedName && expiryDate.trim() && ingredientList.length > 0) ? 'complete' : 'needs_information',
      });

      // 保存成功后，清除 dirty 状态、操作 ID 和快照以允许导航
      operationIdRef.current = null;
      lastSaveSnapshotRef.current = null;
      originalRef.current = null;
      await refresh();
      navigation.popTo('Inventory');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  }, [productId, revision, name, brand, category, ingredients, productionDate, expiryDate, storageReqs, hazardNotes, refresh, navigation]);

  const handleCancelPress = useCallback(() => {
    if (isDirty()) {
      setCancelDialogVisible(true);
    } else {
      navigation.goBack();
    }
  }, [isDirty, navigation]);

  const handleConfirmExit = useCallback(() => {
    // 清除 dirty 状态、操作 ID 和快照以允许导航
    operationIdRef.current = null;
    lastSaveSnapshotRef.current = null;
    originalRef.current = null;
    setCancelDialogVisible(false);
    navigation.goBack();
  }, [navigation]);

  if (loadState === 'loading') {
    return (
      <ScreenSafeArea>
        <View style={styles.centering}>
          <StateMessage title="加载中" description="正在获取产品信息…" tone="neutral" />
        </View>
      </ScreenSafeArea>
    );
  }

  if (loadState === 'error') {
    return (
    <ScreenSafeArea>
      <View style={styles.centering}>
        <StateMessage
          title="加载失败"
          description={errorMessage ?? '产品不存在'}
            tone="error"
            actions={
              <AppButton label="返回" variant="secondary" onPress={() => navigation.goBack()} />
            }
          />
        </View>
      </ScreenSafeArea>
    );
  }

  return (
    <ScreenSafeArea>
      <View style={styles.header}>
        <AppText variant="titleSmall">编辑产品</AppText>
        <AppButton label="取消" variant="quiet" onPress={handleCancelPress} />
      </View>

      <ScreenScroll variant="form">
        {errorMessage ? (
          <View style={styles.errorBar}>
            <SemanticBadge label={errorMessage} tone="critical" />
          </View>
        ) : null}

        <View style={styles.form}>
          <TextField
            label="产品名称"
            required
            value={name}
            onChangeText={(v) => { setName(v); setNameError(false); }}
            placeholder="请输入产品名称"
          />
          {nameError ? (
            <AppText variant="caption" color="error">
              产品名称不能为空
            </AppText>
          ) : null}

          <TextField
            label="品牌"
            value={brand}
            onChangeText={setBrand}
            placeholder="请输入品牌"
          />

          <View style={styles.field}>
            <AppText variant="label">品类</AppText>
            <View style={styles.categoryRow}>
              {CATEGORY_OPTIONS.map((opt) => (
                <AppButton
                  key={opt.value}
                  label={opt.label}
                  variant={category === opt.value ? 'primary' : 'secondary'}
                  onPress={() => setCategory(opt.value)}
                />
              ))}
            </View>
          </View>

          <TextField
            label="成分（用顿号分隔）"
            value={ingredients}
            onChangeText={setIngredients}
            placeholder="次氯酸钠、水"
            multiline
          />

          <TextField
            label="生产日期（如 2025-05）"
            value={productionDate}
            onChangeText={setProductionDate}
            placeholder="2025-05"
          />

          <TextField
            label="有效期至（如 2027-05）"
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="2027-05"
          />

          <TextField
            label="储存条件（用顿号分隔）"
            value={storageReqs}
            onChangeText={setStorageReqs}
            placeholder="避光阴凉、远离儿童"
            multiline
          />

          <TextField
            label="危险性说明（用顿号分隔）"
            value={hazardNotes}
            onChangeText={setHazardNotes}
            placeholder="腐蚀性、不可混用"
            multiline
          />
        </View>

        <View style={styles.actions}>
          <AppButton
            label="保存"
            variant="primary"
            onPress={handleSave}
            loading={saving}
          />
        </View>
      </ScreenScroll>

      {/* 未保存退出确认 */}
      <AppDialog
        visible={cancelDialogVisible}
        title="确认退出"
        description="您有未保存的修改，确定要退出吗？"
        confirmLabel="退出"
        onConfirm={handleConfirmExit}
        onCancel={() => setCancelDialogVisible(false)}
      />
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rawTokens.space[4],
    paddingTop: rawTokens.space[4],
    paddingBottom: rawTokens.space[2],
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  errorBar: {
    marginBottom: rawTokens.space[3],
  },
  form: {
    gap: rawTokens.space[4],
  },
  field: {
    gap: rawTokens.space[2],
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[2],
  },
  actions: {
    marginTop: rawTokens.space[4],
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[6],
  },
});
