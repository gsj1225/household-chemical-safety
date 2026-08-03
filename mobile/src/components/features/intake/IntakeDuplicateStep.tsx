/**
 * IntakeDuplicateStep — 疑似重复展示与决策
 *
 * 用户可点击选择要更新的候选产品，然后选择操作。
 */

import React, { useCallback } from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import AppButton from '../../primitives/AppButton';
import SemanticBadge from '../../primitives/SemanticBadge';
import ScreenScroll from '../../primitives/ScreenScroll';
import { useIntakeStore } from '../../../store/intakeStore';
import { toDuplicateCandidateVM } from '../../../view-models/intake';
import type { DuplicateDecision } from '../../../view-models/intake';

export default function IntakeDuplicateStep() {
  const { duplicateCandidates, errorMessage, resolveDuplicate, selectedDuplicateId, selectDuplicate } = useIntakeStore();

  const candidateVMs = duplicateCandidates.map(toDuplicateCandidateVM);

  const handleDecision = useCallback(
    (decision: DuplicateDecision) => {
      resolveDuplicate(decision);
    },
    [resolveDuplicate],
  );

  return (
    <ScreenScroll variant="form">
      <View style={styles.header}>
        <AppText variant="titleSmall">发现疑似重复</AppText>
        <AppText variant="caption" color="secondary">
          库中已有相似产品，请选择如何处理
        </AppText>
      </View>

      {errorMessage ? (
        <View style={styles.errorBar}>
          <SemanticBadge label={errorMessage} tone="critical" />
        </View>
      ) : null}

      <View style={styles.candidateList}>
        {candidateVMs.map((c) => {
          const isSelected = selectedDuplicateId === c.productId;
          return (
            <Pressable
              key={c.productId}
              onPress={() => selectDuplicate(c.productId)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <View style={[
                styles.candidateCard,
                isSelected && styles.candidateCardSelected,
              ]}>
                <View style={styles.candidateHeader}>
                  <AppText variant="label">{c.name}</AppText>
                  <View style={styles.candidateBadges}>
                    {isSelected ? (
                      <SemanticBadge label="已选中" tone="positive" />
                    ) : null}
                    <SemanticBadge
                      label={c.matchStrengthLabel}
                      tone={c.matchStrength === 'strong' ? 'critical' : 'attention'}
                    />
                  </View>
                </View>
                <View style={styles.candidateMeta}>
                  <AppText variant="caption" color="secondary">{c.brand}</AppText>
                  <AppText variant="caption" color="muted">·</AppText>
                  <AppText variant="caption" color="secondary">{c.categoryLabel}</AppText>
                </View>
                <AppText variant="caption" color="muted">
                  匹配原因：{c.matchReason}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.decisionSection}>
        <AppText variant="label">请选择操作</AppText>

        <View style={styles.decisionItem}>
          <AppButton
            label="添加另一件"
            variant="primary"
            onPress={() => handleDecision('create_another')}
          />
          <AppText variant="caption" color="muted">这是不同的产品，直接添加到库中</AppText>
        </View>

        <View style={styles.decisionItem}>
          <AppButton
            label={selectedDuplicateId ? '更新选中的产品' : '更新已有产品'}
            variant="secondary"
            onPress={() => handleDecision('update_existing')}
          />
          <AppText variant="caption" color="muted">
            {selectedDuplicateId
              ? '将更新上方选中的产品记录'
              : '点击上方候选选择要更新的产品，或默认更新第一个'}
          </AppText>
        </View>

        <AppButton
          label="返回修改"
          variant="quiet"
          onPress={() => handleDecision('go_back')}
        />

        <AppButton
          label="取消"
          variant="quiet"
          onPress={() => handleDecision('cancel')}
        />
      </View>
    </ScreenScroll>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: rawTokens.space[1],
    marginBottom: rawTokens.space[3],
  },
  errorBar: {
    marginBottom: rawTokens.space[3],
  },
  candidateList: {
    gap: rawTokens.space[3],
    marginBottom: rawTokens.space[4],
  },
  candidateCard: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.large,
    borderWidth: 1,
    borderColor: semanticColors.border.default,
    backgroundColor: semanticColors.surface.subtle,
  },
  candidateCardSelected: {
    borderColor: semanticColors.border.default,
    borderWidth: 2,
    backgroundColor: semanticColors.surface.infoSubtle,
  },
  candidateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
  candidateBadges: {
    flexDirection: 'row',
    gap: rawTokens.space[1],
  },
  candidateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[1],
  },
  decisionSection: {
    gap: rawTokens.space[3],
    marginTop: rawTokens.space[2],
  },
  decisionItem: {
    gap: rawTokens.space[1],
  },
  pressed: {
    opacity: 0.85,
  },
});
