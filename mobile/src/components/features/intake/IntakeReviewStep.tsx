/**
 * IntakeReviewStep — 用户核对识别草稿
 *
 * 表单状态存储在 intakeStore 中，组件卸载/重装不丢失。
 * 操作 ID 在进入 review 时生成，重试不重新生成（幂等）。
 * 补拍冲突需用户选择后才能确认入库/更新。
 */

import React, { useState, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors, componentTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import AppButton from '../../primitives/AppButton';
import TextField from '../../primitives/TextField';
import SemanticBadge from '../../primitives/SemanticBadge';
import ScreenScroll from '../../primitives/ScreenScroll';
import { useIntakeStore } from '../../../store/intakeStore';
import { hasUnresolvedConflicts } from '../../../view-models/intake';
import type { ProductCategory } from '../../../types/inventory';

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

const FIELD_LABELS: Record<string, string> = {
  name: '产品名称',
  brand: '品牌',
  category: '品类',
  productionDate: '生产日期',
  expiryDate: '有效期',
};

export default function IntakeReviewStep() {
  const {
    draft,
    reviewForm,
    formConflicts,
    updateReviewForm,
    resolveConflict,
    confirmCreate,
    confirmUpdate,
    startSupplement,
    checkDuplicates,
    rescanProductId,
    errorMessage,
  } = useIntakeStore();
  const currentStep = useIntakeStore((s) => s.step);

  const [nameError, setNameError] = useState(false);
  const [categoryError, setCategoryError] = useState(false);

  const missingFields = draft?.missingRequiredFields ?? [];
  const lowConfidenceFields = draft?.lowConfidenceFields ?? [];
  const unresolvedConflicts = hasUnresolvedConflicts(formConflicts);
  const missingCategory = !reviewForm?.category;

  const handleConfirm = useCallback(() => {
    if (!reviewForm) return;

    if (!reviewForm.name.trim()) {
      setNameError(true);
      return;
    }
    setNameError(false);

    if (!reviewForm.category) {
      setCategoryError(true);
      return;
    }
    setCategoryError(false);

    if (rescanProductId) {
      confirmUpdate();
    } else {
      confirmCreate();
    }
  }, [reviewForm, rescanProductId, confirmCreate, confirmUpdate]);

  if (!draft || !reviewForm) return null;

  const form = reviewForm;

  return (
    <ScreenScroll variant="form">
      <View style={styles.header}>
        <AppText variant="titleSmall">
          {rescanProductId ? '核对更新信息' : '核对产品信息'}
        </AppText>
        <AppText variant="caption" color="secondary">
          AI 识别结果仅供参考，请核对后确认
        </AppText>
      </View>

      {errorMessage ? (
        <View style={styles.warningBar}>
          <SemanticBadge label={errorMessage} tone="attention" />
        </View>
      ) : null}

      {missingFields.length > 0 ? (
        <View style={styles.warningBar}>
          <SemanticBadge label={`缺失 ${missingFields.length} 个必填项`} tone="attention" />
        </View>
      ) : null}

      {lowConfidenceFields.length > 0 ? (
        <View style={styles.warningBar}>
          <SemanticBadge label="识别置信度较低" tone="unknown" />
        </View>
      ) : null}

      {/* ── 补拍冲突卡片 ── */}
      {formConflicts.length > 0 ? (
        <View style={styles.conflictsSection}>
          <AppText variant="label">补拍冲突（请选择）</AppText>
          {formConflicts.map((conflict) => (
            <View key={conflict.id} style={styles.conflictCard}>
              <AppText variant="caption" color="secondary">
                {FIELD_LABELS[conflict.field] ?? conflict.field}
              </AppText>
              <View style={styles.conflictRow}>
                <View style={styles.conflictValue}>
                  <AppText variant="caption" color="muted">原值</AppText>
                  <AppText variant="body">{conflict.originalValue}</AppText>
                </View>
                <View style={styles.conflictValue}>
                  <AppText variant="caption" color="muted">补拍值</AppText>
                  <AppText variant="body">{conflict.supplementValue}</AppText>
                </View>
              </View>
              {conflict.resolved === null ? (
                <View style={styles.conflictActions}>
                  <AppButton
                    label="保留原值"
                    variant="secondary"
                    onPress={() => resolveConflict(conflict.id, 'original')}
                  />
                  <AppButton
                    label="使用补拍值"
                    variant="primary"
                    onPress={() => resolveConflict(conflict.id, 'supplement')}
                  />
                </View>
              ) : (
                <SemanticBadge
                  label={conflict.resolved === 'original' ? '已保留原值' : '已使用补拍值'}
                  tone="positive"
                />
              )}
            </View>
          ))}
          {unresolvedConflicts ? (
            <SemanticBadge label="存在未解决冲突，无法确认" tone="attention" />
          ) : null}
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="产品名称"
          required
          value={form.name}
          onChangeText={(v) => { updateReviewForm({ name: v }); setNameError(false); }}
          placeholder="请输入产品名称"
        />
        {nameError ? (
          <AppText variant="caption" color="error">
            产品名称不能为空
          </AppText>
        ) : null}

        <TextField
          label="品牌"
          value={form.brand}
          onChangeText={(v) => updateReviewForm({ brand: v })}
          placeholder="请输入品牌"
        />

        <View style={styles.field}>
          <AppText variant="label">品类{!form.category ? '（请选择）' : ''}</AppText>
          <View style={styles.categoryRow}>
            {CATEGORY_OPTIONS.map((opt) => (
              <AppButton
                key={opt.value}
                label={opt.label}
                variant={form.category === opt.value ? 'primary' : 'secondary'}
                onPress={() => { updateReviewForm({ category: opt.value }); setCategoryError(false); }}
              />
            ))}
          </View>
          {categoryError ? (
            <AppText variant="caption" color="error">
              请选择品类
            </AppText>
          ) : null}
        </View>

        <TextField
          label="成分（用顿号分隔）"
          value={form.ingredients}
          onChangeText={(v) => updateReviewForm({ ingredients: v })}
          placeholder="次氯酸钠、水"
          multiline
        />

        <TextField
          label="生产日期（如 2025-05）"
          value={form.productionDate}
          onChangeText={(v) => updateReviewForm({ productionDate: v })}
          placeholder="2025-05"
        />

        <TextField
          label="有效期至（如 2027-05）"
          value={form.expiryDate}
          onChangeText={(v) => updateReviewForm({ expiryDate: v })}
          placeholder="2027-05"
        />

        <TextField
          label="储存条件（用顿号分隔）"
          value={form.storageReqs}
          onChangeText={(v) => updateReviewForm({ storageReqs: v })}
          placeholder="避光阴凉、远离儿童"
          multiline
        />

        <TextField
          label="危险性说明（用顿号分隔）"
          value={form.hazardNotes}
          onChangeText={(v) => updateReviewForm({ hazardNotes: v })}
          placeholder="腐蚀性、不可混用"
          multiline
        />

        <TextField
          label="标签警示语（用顿号分隔）"
          value={form.labelWarnings}
          onChangeText={(v) => updateReviewForm({ labelWarnings: v })}
          placeholder="远离儿童、不可食用"
          multiline
        />

        <View style={styles.observations}>
          <AppText variant="label">AI 观察</AppText>
          {draft.observations.length > 0 ? (
            draft.observations.map((obs, i) => (
              <View key={i} style={styles.observationItem}>
                <AppText variant="caption" color="secondary">
                  {obs.field}: {obs.display_value}
                  {obs.conflicting ? ' ⚠️冲突' : ''}
                </AppText>
                <SemanticBadge
                  label={obs.confidence}
                  tone={obs.confidence === 'high' ? 'positive' : obs.confidence === 'low' ? 'unknown' : 'neutral'}
                />
              </View>
            ))
          ) : (
            <AppText variant="caption" color="muted">
              无观察记录
            </AppText>
          )}
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          label={rescanProductId ? '确认更新' : '确认入库'}
          variant="primary"
          onPress={handleConfirm}
          loading={currentStep === 'creating' || currentStep === 'updating'}
          disabled={unresolvedConflicts || missingCategory}
        />
        <AppButton
          label="检查重复"
          variant="secondary"
          onPress={checkDuplicates}
          loading={currentStep === 'checking_duplicates'}
        />
        <AppButton
          label="补拍识别"
          variant="quiet"
          onPress={startSupplement}
        />
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: rawTokens.space[1],
    marginBottom: rawTokens.space[3],
  },
  warningBar: {
    flexDirection: 'row',
    gap: rawTokens.space[2],
    marginBottom: rawTokens.space[2],
  },
  conflictsSection: {
    gap: rawTokens.space[3],
    marginBottom: rawTokens.space[3],
  },
  conflictCard: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[3],
    borderRadius: componentTokens.surface.radius,
    backgroundColor: semanticColors.surface.warningSubtle,
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.warning,
  },
  conflictRow: {
    flexDirection: 'row',
    gap: rawTokens.space[3],
  },
  conflictValue: {
    flex: 1,
    gap: rawTokens.space[1],
  },
  conflictActions: {
    flexDirection: 'row',
    gap: rawTokens.space[2],
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
  observations: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[3],
    borderRadius: componentTokens.surface.radius,
    backgroundColor: semanticColors.surface.subtle,
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.subtle,
  },
  observationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
  actions: {
    marginTop: rawTokens.space[4],
    gap: rawTokens.space[2],
  },
});
