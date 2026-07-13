/**
 * 排雷页面 - 单次扫描结果状态
 */

import React from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { fontSize, spacing, borderRadius } from '../../theme/spacing';
import MineCard from '../MineCard';
import type { ScanResult } from '../../types';

interface ResultViewProps {
  result: ScanResult;
  hasNextArea: boolean;
  onContinue: () => void;
  submitting?: boolean;
}

export default function ResultView({ result, hasNextArea, onContinue, submitting = false }: ResultViewProps) {
  const isMine = result.status === 'mine';

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.statusEmoji}>{isMine ? '💣' : '✅'}</Text>
      <Text style={[styles.statusText, { color: isMine ? colors.critical : colors.safe }]}>
        {isMine ? '踩雷了！' : '安全'}
      </Text>

      <View style={styles.productCard}>
        {result.confirmed_by_user && (
          <Text style={styles.confirmedBadge}>✓ 产品信息已由你确认</Text>
        )}
        <Text style={styles.productName}>
          {result.product.brand} {result.product.name}
        </Text>
        <Text style={styles.productCategory}>{result.product.category}</Text>
        {result.product.ingredients.length > 0 && (
          <Text style={styles.productIngredients}>
            成分：{result.product.ingredients.join('、')}
          </Text>
        )}
      </View>

      {isMine && result.risk && <MineCard risk={result.risk} />}

      <Text style={styles.guideText}>{result.guide_message}</Text>

      <TouchableOpacity style={[styles.primaryBtn, submitting && styles.disabledBtn]} onPress={onContinue} disabled={submitting}>
        {submitting ? <ActivityIndicator color={colors.textWhite} /> : (
          <Text style={styles.primaryBtnText}>
            {hasNextArea ? '继续排雷' : '查看排雷报告'}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl, justifyContent: 'center' },
  statusEmoji: { fontSize: 64, textAlign: 'center', marginBottom: spacing.sm },
  statusText: { fontSize: fontSize.xl, fontWeight: 'bold', textAlign: 'center', marginBottom: spacing.lg },
  productCard: {
    backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg,
    padding: spacing.lg, marginBottom: spacing.md,
  },
  confirmedBadge: { color: colors.safe, fontSize: fontSize.xs, fontWeight: 'bold', marginBottom: spacing.sm },
  productName: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.textPrimary },
  productCategory: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: 4 },
  productIngredients: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.sm },
  guideText: {
    fontSize: fontSize.md, color: colors.textPrimary,
    textAlign: 'center', lineHeight: 24, marginVertical: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginVertical: spacing.md,
  },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: 'bold' },
  disabledBtn: { opacity: 0.7 },
});
