/**
 * KnowledgeAdviceCard — 知识库建议卡（仅渲染 reviewed 知识）
 *
 * 展示：主题、适用材质、可执行步骤、安全提醒入口、来源；
 * entryId/version/来源放在「查看依据」展开区。
 *
 * 安全约束：
 * - 只渲染 confidence === 'reviewed' 的条目；
 * - 严禁把 provisional 或 pendingKnowledgeNotice 当作知识卡渲染；
 * - 不展示未经审核的步骤/比例/时间或化学操作。
 */

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import SemanticBadge from '../../primitives/SemanticBadge';
import type { KnowledgeEvidence } from '../../../types/assistant';

interface KnowledgeAdviceCardProps {
  knowledge: KnowledgeEvidence;
}

/** 获取该知识的版本号（取首个 local_kb 来源的 version，缺失时用占位） */
function entryVersion(k: KnowledgeEvidence): string {
  const local = k.sources.find((s) => s.type === 'local_kb');
  return local?.version || '—';
}

export default function KnowledgeAdviceCard({
  knowledge,
}: KnowledgeAdviceCardProps) {
  const [showEvidence, setShowEvidence] = useState(false);

  // 仅渲染 reviewed 知识；provisional 不入卡
  if (knowledge.confidence !== 'reviewed') {
    return null;
  }

  const safetyItems = [
    ...knowledge.warnings,
    ...knowledge.prohibitedActions,
    ...knowledge.stopConditions,
  ].filter(Boolean);

  return (
    <Surface variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <AppText variant="label" style={styles.topic}>
          {knowledge.topic || '知识建议'}
        </AppText>
        <SemanticBadge label="知识库" tone="info" />
      </View>

      {knowledge.surfaces.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="caption" color="secondary">适用材质</AppText>
          <View style={styles.chips}>
            {knowledge.surfaces.map((s, i) => (
              <View key={i} style={styles.chip}>
                <AppText variant="caption" color="secondary">{s}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {knowledge.steps.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="caption" color="secondary">处理步骤</AppText>
          {knowledge.steps.map((s, i) => (
            <AppText key={i} variant="caption" color="primary">· {s}</AppText>
          ))}
        </View>
      ) : null}

      {safetyItems.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="caption" color="warning">安全提醒</AppText>
          {safetyItems.map((item, i) => (
            <AppText key={i} variant="caption" color="warning">· {item}</AppText>
          ))}
        </View>
      ) : null}

      {knowledge.sources.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="caption" color="secondary">来源</AppText>
          {knowledge.sources.map((src, i) => (
            <AppText key={i} variant="caption" color="secondary">
              · {src.title || src.type}
            </AppText>
          ))}
        </View>
      ) : null}

      <AppText
        variant="caption"
        color="action"
        style={styles.link}
        onPress={() => setShowEvidence((v) => !v)}
      >
        {showEvidence ? '收起依据 ↑' : '查看依据 ↓'}
      </AppText>

      {showEvidence ? (
        <View style={styles.evidence}>
          <AppText variant="caption" color="muted">entryId：{knowledge.entryId}</AppText>
          <AppText variant="caption" color="muted">version：{entryVersion(knowledge)}</AppText>
          <AppText variant="caption" color="muted">审核日期：{knowledge.reviewedAt || '—'}</AppText>
          {knowledge.excludedSurfaces.length > 0 ? (
            <AppText variant="caption" color="muted">
              不适用材质：{knowledge.excludedSurfaces.join('、')}
            </AppText>
          ) : null}
          {knowledge.tagCondition ? (
            <AppText variant="caption" color="muted">{knowledge.tagCondition}</AppText>
          ) : null}
        </View>
      ) : null}
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
  topic: {
    flexShrink: 1,
  },
  section: {
    gap: rawTokens.space[1],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: rawTokens.space[1],
  },
  chip: {
    paddingHorizontal: rawTokens.space[2],
    paddingVertical: rawTokens.space[1],
    borderRadius: rawTokens.radius.round,
    backgroundColor: rawTokens.palette.neutral[50],
  },
  link: {
    textDecorationLine: 'underline',
    marginTop: rawTokens.space[1],
  },
  evidence: {
    gap: rawTokens.space[1],
    paddingTop: rawTokens.space[1],
    borderTopWidth: 1,
    borderTopColor: rawTokens.palette.neutral[100],
  },
});
