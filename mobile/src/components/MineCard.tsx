/**
 * 雷点卡片组件
 * 踩雷时弹出——展示风险信息
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Linking,
  TouchableOpacity,
} from 'react-native';
import { colors, riskLevelColor } from '../theme/colors';
import { fontSize, spacing, borderRadius } from '../theme/spacing';
import type { RiskResult } from '../types';

interface MineCardProps {
  risk: RiskResult;
}

export default function MineCard({ risk }: MineCardProps) {
  const color = riskLevelColor[risk.level] || colors.medium;

  return (
    <View style={[styles.container, { borderColor: color }]}>
      {/* 雷点等级标签 */}
      <View style={[styles.levelBadge, { backgroundColor: color }]}>
        <Text style={styles.levelBadgeText}>
          {risk.level === 'critical' ? '高危' : risk.level === 'medium' ? '中危' : '低危'}
        </Text>
      </View>

      {/* 炸弹图标 */}
      <Text style={styles.bombEmoji}>💣</Text>

      {/* 标题 */}
      <Text style={styles.title}>{risk.title}</Text>

      {/* 风险类型 */}
      <View style={[styles.typeTag, { backgroundColor: color + '20' }]}>
        <Text style={[styles.typeText, { color }]}>{risk.type}</Text>
      </View>

      {/* 说明 */}
      <Text style={styles.description}>{risk.description}</Text>

      {/* 建议 */}
      <View style={styles.adviceBox}>
        <Text style={styles.adviceTitle}>排雷建议</Text>
        <Text style={styles.adviceText}>{risk.advice}</Text>
      </View>

      <View style={styles.evidenceBox}>
        <Text style={[styles.evidenceStatus, risk.evidence_status === 'verified' ? styles.verified : styles.review]}>
          {risk.evidence_status === 'verified' ? '✓ 权威资料支持' : '△ 资料待复核'}
        </Text>
        {(risk.sources ?? []).map((source) => (
          <TouchableOpacity key={source.url} onPress={() => void Linking.openURL(source.url)}>
            <Text style={styles.sourceLink}>{source.organization}：{source.title}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgPrimary,
    borderRadius: borderRadius.xl,
    borderWidth: 2,
    padding: spacing.lg,
    margin: spacing.md,
  },
  levelBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  levelBadgeText: {
    color: colors.textWhite,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
  },
  bombEmoji: {
    fontSize: 48,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  typeTag: {
    alignSelf: 'center',
    paddingVertical: 4,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.round,
    marginBottom: spacing.md,
  },
  typeText: {
    fontSize: fontSize.xs,
    fontWeight: '600',
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  adviceBox: {
    backgroundColor: colors.bgSecondary,
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  adviceTitle: {
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  adviceText: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  evidenceBox: { marginTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  evidenceStatus: { fontSize: fontSize.xs, fontWeight: 'bold' },
  verified: { color: colors.safe },
  review: { color: colors.medium },
  sourceLink: { color: colors.primary, fontSize: fontSize.xs, lineHeight: 18, marginTop: spacing.xs },
});
