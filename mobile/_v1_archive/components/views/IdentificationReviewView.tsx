import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { IdentificationDraft, ProductIdentification } from '../../types';
import { componentTokens, rawTokens } from '../../theme/tokens';
import { PhotoFrame } from '../composites';
import {
  AppButton,
  AppText,
  StateMessage,
  StatusBadge,
  Surface,
  TextField,
} from '../primitives';
import type { StatusBadgeTone } from '../primitives/StatusBadge';

interface Props {
  draft: IdentificationDraft;
  imageUri: string;
  submitting: boolean;
  errorMessage?: string | null;
  onConfirm: (product: ProductIdentification) => void;
  onRetake: () => void;
  onSelectFromAlbum: () => void;
}

const confidenceMeta: Record<
  ProductIdentification['confidence'],
  { label: string; tone: StatusBadgeTone }
> = {
  high: { label: '识别置信度：高', tone: 'success' },
  medium: { label: '识别置信度：中，请核对', tone: 'warning' },
  low: { label: '识别置信度：低，建议重拍', tone: 'error' },
};

export default function IdentificationReviewView({
  draft,
  imageUri,
  submitting,
  errorMessage,
  onConfirm,
  onRetake,
  onSelectFromAlbum,
}: Props) {
  const [brand, setBrand] = useState(draft.product.brand);
  const [name, setName] = useState(draft.product.name);
  const [category, setCategory] = useState(draft.product.category);
  const [ingredients, setIngredients] = useState(draft.product.ingredients.join('、'));

  useEffect(() => {
    setBrand(draft.product.brand);
    setName(draft.product.name);
    setCategory(draft.product.category);
    setIngredients(draft.product.ingredients.join('、'));
  }, [draft]);

  const nameError = name.trim().length === 0 ? '请输入包装上的产品名' : undefined;
  const categoryError = category.trim().length === 0 ? '请输入产品品类' : undefined;
  const canConfirm = !nameError && !categoryError;
  const confidence = confidenceMeta[draft.product.confidence];

  const confirm = () => {
    if (!canConfirm || submitting) return;
    onConfirm({
      brand: brand.trim() || '未知',
      name: name.trim(),
      category: category.trim(),
      ingredients: ingredients
        .split(/[、，,;；\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
      confidence: draft.product.confidence,
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.heading}>
        <AppText variant="title" align="center">核对识别结果</AppText>
        <AppText color="secondary" align="center">
          先确认模型看到的产品事实，再由本地规则评估风险
        </AppText>
      </View>

      <View style={styles.photoWrap}>
        <PhotoFrame
          uri={imageUri}
          aspectRatio={componentTokens.photo.detailAspectRatio}
          accessibilityLabel="本次待核对的单品照片"
        />
      </View>

      {errorMessage ? (
        <StateMessage
          title="提交没有成功"
          description={errorMessage}
          tone="error"
          accessibilityLiveRegion="assertive"
        />
      ) : null}

      <Surface
        variant={draft.requires_review ? 'outlined' : 'subtle'}
        style={styles.confidenceCard}
      >
        <StatusBadge label={confidence.label} tone={confidence.tone} />
        <AppText variant="label" color="secondary">{draft.guide_message}</AppText>
        {draft.requires_review ? (
          <AppText variant="caption" color="warning">
            关键内容可能不完整，请逐项对照包装；看不清时建议重新拍照。
          </AppText>
        ) : null}
      </Surface>

      <View style={styles.form}>
        <TextField
          label="品牌"
          value={brand}
          onChangeText={setBrand}
          editable={!submitting}
          placeholder="没有品牌时可保留未知"
        />
        <TextField
          label="产品名"
          required
          value={name}
          onChangeText={setName}
          editable={!submitting}
          error={nameError}
          placeholder="请根据包装核对"
        />
        <TextField
          label="品类"
          required
          value={category}
          onChangeText={setCategory}
          editable={!submitting}
          error={categoryError}
          placeholder="例如洁厕剂、消毒剂"
        />
        <TextField
          label="成分"
          value={ingredients}
          onChangeText={setIngredients}
          editable={!submitting}
          multiline
          helpText="多个成分可用顿号、逗号或换行分隔"
          placeholder="请根据包装核对或补充"
        />
      </View>

      <AppButton
        label="确认信息并评估风险"
        onPress={confirm}
        loading={submitting}
        disabled={!canConfirm}
        accessibilityHint="提交核对后的产品事实，由本地规则进行风险评估"
      />

      <View style={styles.secondaryActions}>
        <AppButton
          label="重新拍照"
          variant="secondary"
          onPress={onRetake}
          disabled={submitting}
        />
        <AppButton
          label="从相册换一张"
          variant="quiet"
          onPress={onSelectFromAlbum}
          disabled={submitting}
        />
      </View>

      <Surface variant="subtle">
        <AppText variant="caption" color="secondary" align="center">
          你只能修正产品事实。风险等级和证据来源仍由本地规则库生成，识别结果不能代替包装说明或专业检测。
        </AppText>
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: rawTokens.space[5],
    paddingBottom: rawTokens.space[8],
    gap: rawTokens.space[4],
  },
  heading: {
    gap: rawTokens.space[1],
  },
  photoWrap: {
    width: '100%',
    maxWidth: componentTokens.photo.wideMaxWidth,
    alignSelf: 'center',
  },
  confidenceCard: {
    gap: rawTokens.space[2],
  },
  form: {
    gap: rawTokens.space[4],
  },
  secondaryActions: {
    gap: rawTokens.space[2],
  },
});
