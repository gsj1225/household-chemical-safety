/**
 * ExternalSourceCard — 外部资料卡
 * 仅当 knowledgeStatus === 'external_hit' 且 externalSources 非空时渲染。
 *
 * 展示：来源标题、域名、检索日期、「外部资料」标签、「打开来源」按钮。
 *
 * 安全要求：
 * - 不直接展示长 URL；
 * - 只允许 https，非法 URL 不允许打开；
 * - 无效来源只显示文本，不触发跳转；
 * - 首期不提供外部来源编辑或写入知识库功能。
 */

import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import SemanticBadge from '../../primitives/SemanticBadge';
import { canOpenExternalSource } from '../../../view-models/assistant';
import type { SourceRef } from '../../../types/assistant';
import { EXTERNAL_SOURCE_ALLOWLIST } from '../../../config/externalAllowlist';

interface ExternalSourceCardProps {
  source: SourceRef;
  /** 外部域名白名单，默认使用全局安全配置；可由上层传入自定义受控白名单。 */
  allowlist?: readonly string[];
}

export default function ExternalSourceCard({
  source,
  allowlist = EXTERNAL_SOURCE_ALLOWLIST,
}: ExternalSourceCardProps) {
  const openable = canOpenExternalSource(source.url, allowlist);

  const handleOpen = () => {
    if (!openable) return;
    Linking.openURL(source.url).catch(() => {
      /* 打开失败不抛出到 UI */
    });
  };

  return (
    <Surface variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <AppText variant="label" style={styles.title}>
          {source.title || '外部资料'}
        </AppText>
        <SemanticBadge label="外部资料" tone="info" />
      </View>

      <View style={styles.meta}>
        <AppText variant="caption" color="secondary">
          {source.domain || '未知域名'}
        </AppText>
        {source.retrievedAt ? (
          <AppText variant="caption" color="muted">
            检索于 {source.retrievedAt}
          </AppText>
        ) : null}
      </View>

      {openable ? (
        <AppText
          variant="caption"
          color="action"
          style={styles.link}
          onPress={handleOpen}
        >
          打开来源 ↗
        </AppText>
      ) : (
        <AppText variant="caption" color="muted">
          来源不可访问
        </AppText>
      )}
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
  title: {
    flexShrink: 1,
  },
  meta: {
    gap: rawTokens.space[1],
  },
  link: {
    textDecorationLine: 'underline',
    marginTop: rawTokens.space[1],
  },
});
