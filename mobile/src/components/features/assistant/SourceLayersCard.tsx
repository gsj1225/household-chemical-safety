/**
 * SourceLayersCard — 来源分层卡
 *
 * 按固定顺序展示来源：local_kb → warehouse → rule → external；
 * 按 (type, ref) 去重，不重复显示同一来源。
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import { orderedSources } from '../../../view-models/assistant';
import type { SourceRef, SourceRefType } from '../../../types/assistant';

const layerMeta: Record<SourceRefType, { label: string; tone: 'info' | 'positive' | 'attention' | 'neutral' }> = {
  local_kb: { label: '本地知识库', tone: 'info' },
  warehouse: { label: '我家仓库', tone: 'positive' },
  rule: { label: '安全规则', tone: 'attention' },
  external: { label: '外部资料', tone: 'neutral' },
};

interface SourceLayersCardProps {
  sources: SourceRef[];
}

export default function SourceLayersCard({ sources }: SourceLayersCardProps) {
  const ordered = orderedSources(sources);
  if (ordered.length === 0) return null;

  return (
    <Surface variant="subtle" style={styles.card}>
      <AppText variant="label">来源</AppText>
      {ordered.map((s, i) => {
        const meta = layerMeta[s.type] ?? { label: s.type, tone: 'neutral' as const };
        return (
          <View key={`${s.type}:${s.ref}:${i}`} style={styles.row}>
            <AppText variant="caption" color={meta.tone === 'info' ? 'info' : meta.tone === 'attention' ? 'warning' : meta.tone === 'positive' ? 'success' : 'secondary'}>
              {meta.label}
            </AppText>
            <AppText variant="caption" color="secondary" style={styles.title}>
              {s.title || '—'}
            </AppText>
          </View>
        );
      })}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: rawTokens.space[2],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[2],
  },
  title: {
    flexShrink: 1,
  },
});
