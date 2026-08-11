/**
 * SafetyWarningCard — 安全警告卡
 * critical 关系优先于 LLM 文本；可点击进入关系详情（有 relationId 时）。
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import SemanticBadge, { type SemanticTone } from '../../primitives/SemanticBadge';
import type { AssistantSafetyWarning } from '../../../types/assistant';

const severityMeta: Record<
  AssistantSafetyWarning['severity'],
  { tone: SemanticTone; label: string }
> = {
  critical: { tone: 'critical', label: '严重' },
  attention: { tone: 'attention', label: '注意' },
  unknown: { tone: 'unknown', label: '未知' },
};

interface SafetyWarningCardProps {
  warning: AssistantSafetyWarning;
  onPressRelation?: (relationId: string) => void;
}

export default function SafetyWarningCard({
  warning,
  onPressRelation,
}: SafetyWarningCardProps) {
  const meta = severityMeta[warning.severity];
  const clickable = warning.relationId != null && onPressRelation != null;

  return (
    <Surface
      variant="outlined"
      style={[styles.card, warning.severity === 'critical' && styles.criticalCard]}
    >
      <View style={styles.header}>
        <AppText variant="label" style={styles.title}>{warning.title}</AppText>
        <SemanticBadge label={meta.label} tone={meta.tone} />
      </View>
      <AppText variant="caption" color="secondary">
        {warning.description}
      </AppText>
      {warning.recommendedAction ? (
        <AppText variant="caption" color="warning" style={styles.action}>
          建议：{warning.recommendedAction}
        </AppText>
      ) : null}
      {clickable ? (
        <AppText
          variant="caption"
          color="action"
          style={styles.link}
          onPress={() => onPressRelation!(warning.relationId!)}
        >
          查看关系详情 →
        </AppText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: rawTokens.space[2],
  },
  criticalCard: {
    borderColor: semanticColors.border.error,
    borderWidth: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
  title: {
    flexShrink: 1,
  },
  action: {
    fontWeight: '600',
  },
  link: {
    textDecorationLine: 'underline',
    marginTop: rawTokens.space[1],
  },
});
