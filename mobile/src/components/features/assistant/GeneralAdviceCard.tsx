/**
 * GeneralAdviceCard — 通用处理建议卡
 * 明确标记为"非库存推荐"，不生成"点击使用该产品"操作。
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import SemanticBadge from '../../primitives/SemanticBadge';

interface GeneralAdviceCardProps {
  advice: string[];
}

export default function GeneralAdviceCard({ advice }: GeneralAdviceCardProps) {
  return (
    <Surface variant="subtle" style={styles.card}>
      <View style={styles.header}>
        <AppText variant="label">通用建议</AppText>
        <SemanticBadge label="非库存推荐" tone="info" />
      </View>
      {advice.map((item, i) => (
        <AppText key={i} variant="caption" color="secondary">· {item}</AppText>
      ))}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: rawTokens.space[1],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
});
