/**
 * 排雷页面 - 单次扫描结果状态
 */

import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RiskCard } from '../composites';
import { AppButton, AppText, StatusBadge, Surface } from '../primitives';
import { rawTokens } from '../../theme/tokens';
import type { ScanResult } from '../../types';

interface ResultViewProps {
  result: ScanResult;
  hasNextArea: boolean;
  onContinue: () => void;
  submitting?: boolean;
}

export default function ResultView({ result, hasNextArea, onContinue, submitting = false }: ResultViewProps) {
  const isMine = result.status === 'mine';
  const conclusion = isMine ? '发现雷点' : '当前规则未发现雷点';
  const archiveNote = isMine
    ? '档案备注：说明书看过了，配伍关系可能还没互相认识。'
    : '档案备注：这轮没命中规则，先别急着给自己发安全证书。';

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <AppText variant="label" style={styles.eyebrow}>
          单品档案 / SCAN RESULT
        </AppText>
        <AppText variant="display">{conclusion}</AppText>
        <AppText color="secondary">{archiveNote}</AppText>
      </View>

      <Surface variant="outlined" style={styles.productCard}>
        {result.confirmed_by_user && (
          <StatusBadge label="产品信息已经你确认" tone="neutral" />
        )}
        <AppText variant="titleSmall">
          {result.product.brand} {result.product.name}
        </AppText>
        <AppText color="secondary">{result.product.category}</AppText>
        {result.product.ingredients.length > 0 && (
          <AppText variant="caption" color="secondary">
            成分：{result.product.ingredients.join('、')}
          </AppText>
        )}
      </Surface>

      {isMine && result.risk ? (
        <RiskCard
          level={result.risk.level}
          type={result.risk.type}
          title={result.risk.title}
          description={result.risk.description}
          advice={result.risk.advice}
          evidenceStatus={result.risk.evidence_status}
          sources={result.risk.sources}
        />
      ) : null}

      <Surface variant="subtle" style={styles.nextStep}>
        <AppText variant="label">下一步</AppText>
        <AppText>{result.guide_message}</AppText>
      </Surface>

      <View style={styles.actions}>
        <AppButton
          label={hasNextArea ? '继续检查下一区域' : '查看最终报告'}
          loading={submitting}
          onPress={onContinue}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: rawTokens.space[5],
    paddingBottom: rawTokens.space[8],
    gap: rawTokens.space[5],
  },
  heading: {
    gap: rawTokens.space[3],
  },
  eyebrow: {
    letterSpacing: 0.5,
  },
  productCard: {
    gap: rawTokens.space[2],
  },
  nextStep: {
    gap: rawTokens.space[2],
  },
  actions: {
    marginTop: 'auto',
    paddingTop: rawTokens.space[3],
  },
});
