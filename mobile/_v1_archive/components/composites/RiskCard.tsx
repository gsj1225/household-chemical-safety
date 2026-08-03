import React from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { EvidenceSource } from '../../types';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../../theme/tokens';
import { AppText, StatusBadge, Surface } from '../primitives';

interface RiskCardProps {
  level: string;
  type: string;
  title?: string;
  products?: string[];
  description: string;
  advice: string;
  evidenceStatus: 'verified' | 'needs_review';
  sources?: EvidenceSource[];
  confirmedByUser?: boolean;
  index?: number;
}

const levelLabel: Record<string, string> = {
  critical: '高危风险',
  medium: '中危风险',
  low: '低危风险',
};

export default function RiskCard({
  level,
  type,
  title,
  products = [],
  description,
  advice,
  evidenceStatus,
  sources = [],
  confirmedByUser = false,
  index,
}: RiskCardProps) {
  const evidenceLabel = evidenceStatus === 'verified'
    ? '证据状态：资料已核验'
    : '证据状态：资料待复核';

  return (
    <Surface
      variant="outlined"
      style={styles.container}
      accessibilityLabel={`${levelLabel[level] ?? '风险待确认'}，${title ?? type}`}
    >
      <View style={styles.header}>
        {typeof index === 'number' ? (
          <View style={styles.index}>
            <AppText variant="label" color="inverse">
              {String(index).padStart(2, '0')}
            </AppText>
          </View>
        ) : null}
        <View style={styles.headerCopy}>
          <StatusBadge label={levelLabel[level] ?? '风险待确认'} tone="neutral" />
          <AppText variant="caption" color="secondary">{type}</AppText>
        </View>
      </View>

      <AppText variant="titleSmall">{title ?? type}</AppText>

      {products.length > 0 ? (
        <View style={styles.products}>
          <AppText variant="caption" color="secondary">涉及产品</AppText>
          <AppText variant="label">{products.join(' + ')}</AppText>
          {confirmedByUser ? (
            <AppText variant="caption" color="secondary">
              产品信息已经用户确认
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View style={styles.fact}>
        <AppText variant="caption" color="secondary">风险事实</AppText>
        <AppText>{description}</AppText>
      </View>

      <Surface variant="subtle" style={styles.advice}>
        <AppText variant="label">处置建议</AppText>
        <AppText>{advice}</AppText>
      </Surface>

      <View style={styles.evidence}>
        <StatusBadge label={evidenceLabel} tone="neutral" />
        {sources.length > 0 ? (
          <View style={styles.sources}>
            {sources.map((source) => (
              <Pressable
                key={source.url}
                accessibilityRole="link"
                accessibilityLabel={`打开证据来源，${source.organization}，${source.title}`}
                accessibilityHint="将在外部浏览器打开"
                onPress={() => void Linking.openURL(source.url)}
                style={({ pressed }) => [
                  styles.source,
                  pressed ? styles.sourcePressed : undefined,
                ]}
              >
                <View style={styles.sourceCopy}>
                  <AppText variant="caption" color="secondary">
                    {source.organization}
                  </AppText>
                  <AppText variant="label">{source.title}</AppText>
                </View>
                <AppText variant="label" accessibilityElementsHidden>↗</AppText>
              </Pressable>
            ))}
          </View>
        ) : (
          <AppText variant="caption" color="secondary">
            当前报告未附可打开的外部来源
          </AppText>
        )}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[4],
    padding: rawTokens.space[5],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
    paddingBottom: rawTokens.space[4],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.strong,
  },
  index: {
    width: rawTokens.size.touchMinimum,
    height: rawTokens.size.touchMinimum,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.inverse,
  },
  headerCopy: {
    flex: 1,
    alignItems: 'flex-start',
    gap: rawTokens.space[1],
  },
  products: {
    gap: rawTokens.space[1],
  },
  fact: {
    gap: rawTokens.space[2],
  },
  advice: {
    gap: rawTokens.space[2],
  },
  evidence: {
    gap: rawTokens.space[3],
    paddingTop: rawTokens.space[4],
    borderTopWidth: componentTokens.surface.borderWidth,
    borderTopColor: semanticColors.border.default,
  },
  sources: {
    gap: rawTokens.space[2],
  },
  source: {
    minHeight: rawTokens.size.touchMinimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
    paddingVertical: rawTokens.space[2],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.default,
  },
  sourcePressed: {
    backgroundColor: semanticColors.surface.muted,
  },
  sourceCopy: {
    flex: 1,
    gap: rawTokens.space[1],
  },
});
