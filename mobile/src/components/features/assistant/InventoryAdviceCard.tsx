/**
 * InventoryAdviceCard — 库存产品建议卡
 * 结合"我家仓库"的推荐/不推荐/待补充信息。
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import SemanticBadge, { type SemanticTone } from '../../primitives/SemanticBadge';
import type { AssistantProductAdvice } from '../../../types/assistant';

const recommendationMeta: Record<
  AssistantProductAdvice['recommendation'],
  { tone: SemanticTone; label: string }
> = {
  recommended: { tone: 'positive', label: '推荐' },
  not_recommended: { tone: 'critical', label: '不推荐' },
  needs_information: { tone: 'unknown', label: '待补充' },
};

interface InventoryAdviceCardProps {
  advice: AssistantProductAdvice;
  onPress: (productId: string) => void;
}

export default function InventoryAdviceCard({
  advice,
  onPress,
}: InventoryAdviceCardProps) {
  const meta = recommendationMeta[advice.recommendation];

  return (
    <Surface variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <AppText variant="label" style={styles.name}>
          {advice.productName || '产品'}
        </AppText>
        <SemanticBadge label={meta.label} tone={meta.tone} />
      </View>
      <AppText variant="caption" color="secondary">
        {advice.reason}
      </AppText>
      {advice.steps.length > 0 ? (
        <View style={styles.list}>
          <AppText variant="caption" color="secondary">使用步骤</AppText>
          {advice.steps.map((s, i) => (
            <AppText key={i} variant="caption" color="primary">· {s}</AppText>
          ))}
        </View>
      ) : null}
      {advice.cautions.length > 0 ? (
        <View style={styles.list}>
          <AppText variant="caption" color="warning">注意事项</AppText>
          {advice.cautions.map((c, i) => (
            <AppText key={i} variant="caption" color="warning">· {c}</AppText>
          ))}
        </View>
      ) : null}
      <AppText
        variant="caption"
        color="action"
        style={styles.link}
        onPress={() => onPress(advice.productId)}
      >
        查看产品 →
      </AppText>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: rawTokens.space[2],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
  name: {
    flexShrink: 1,
  },
  list: {
    gap: rawTokens.space[1],
  },
  link: {
    textDecorationLine: 'underline',
    marginTop: rawTokens.space[1],
  },
});
