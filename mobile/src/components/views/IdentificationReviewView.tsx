/** 产品 OCR 草稿确认与纠错。 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import type { IdentificationDraft, ProductIdentification } from '../../types';
import { colors } from '../../theme/colors';
import { borderRadius, fontSize, spacing } from '../../theme/spacing';

interface Props {
  draft: IdentificationDraft;
  imageUri: string;
  submitting: boolean;
  onConfirm: (product: ProductIdentification) => void;
  onRetake: () => void;
  onSelectFromAlbum: () => void;
}

const confidenceText = { high: '高', medium: '中', low: '低' } as const;

export default function IdentificationReviewView({
  draft, imageUri, submitting, onConfirm, onRetake, onSelectFromAlbum,
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

  const canConfirm = name.trim().length > 0 && category.trim().length > 0;
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
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>核对识别结果</Text>
      <Text style={styles.subtitle}>确认后才会进行风险评估并写入报告</Text>

      <View style={styles.imageFrame}>
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="contain" />
      </View>

      <View style={[styles.confidenceCard, draft.requires_review && styles.warningCard]}>
        <Text style={styles.confidenceText}>
          识别置信度：{confidenceText[draft.product.confidence]}
        </Text>
        <Text style={styles.reviewMessage}>{draft.guide_message}</Text>
      </View>

      <Field label="品牌" value={brand} onChangeText={setBrand} />
      <Field label="产品名 *" value={name} onChangeText={setName} />
      <Field label="品类 *" value={category} onChangeText={setCategory} />
      <Field
        label="成分（用顿号或逗号分隔）"
        value={ingredients}
        onChangeText={setIngredients}
        multiline
      />

      <TouchableOpacity
        style={[styles.primaryBtn, (!canConfirm || submitting) && styles.disabledBtn]}
        onPress={confirm}
        disabled={!canConfirm || submitting}
      >
        {submitting ? <ActivityIndicator color={colors.textWhite} /> : (
          <Text style={styles.primaryBtnText}>确认信息并评估风险</Text>
        )}
      </TouchableOpacity>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onRetake} disabled={submitting}>
          <Text style={styles.secondaryText}>重新拍照</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={onSelectFromAlbum} disabled={submitting}>
          <Text style={styles.secondaryText}>从相册换一张</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.ruleNote}>你只能修正产品信息，风险等级和证据仍由本地规则库生成。</Text>
    </ScrollView>
  );
}

function Field(props: {
  label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        style={[styles.input, props.multiline && styles.multilineInput]}
        value={props.value}
        onChangeText={props.onChangeText}
        multiline={props.multiline}
        placeholder="请根据包装核对或补充"
        placeholderTextColor={colors.textLight}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl },
  title: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center' },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  imageFrame: { width: '100%', aspectRatio: 16 / 9, borderRadius: borderRadius.lg, overflow: 'hidden', backgroundColor: colors.bgDark },
  image: { width: '100%', height: '100%' },
  confidenceCard: { backgroundColor: colors.bgSecondary, borderRadius: borderRadius.md, padding: spacing.md, marginVertical: spacing.md },
  warningCard: { backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primary },
  confidenceText: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: 'bold' },
  reviewMessage: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18, marginTop: spacing.xs },
  field: { marginBottom: spacing.md },
  label: { color: colors.textPrimary, fontSize: fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bgPrimary, borderRadius: borderRadius.md, padding: spacing.md, color: colors.textPrimary, fontSize: fontSize.md },
  multilineInput: { minHeight: 80, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: colors.primary, paddingVertical: spacing.lg, borderRadius: borderRadius.xl, alignItems: 'center', marginTop: spacing.sm },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.md, fontWeight: 'bold' },
  disabledBtn: { opacity: 0.55 },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  secondaryBtn: { flex: 1, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: spacing.md, alignItems: 'center' },
  secondaryText: { color: colors.primary, fontSize: fontSize.sm, fontWeight: '600' },
  ruleNote: { color: colors.textSecondary, fontSize: fontSize.xs, lineHeight: 18, textAlign: 'center', marginTop: spacing.md },
});
