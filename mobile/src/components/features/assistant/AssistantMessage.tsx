/**
 * AssistantMessage — 单条会话消息
 * - user：文字 + 可选照片缩略图
 * - assistant：答案文字 + 库存建议/通用建议/安全警告/追问子卡
 *   超范围回复显示拒答卡，不显示库存操作按钮。
 */

import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import InventoryAdviceCard from './InventoryAdviceCard';
import GeneralAdviceCard from './GeneralAdviceCard';
import SafetyWarningCard from './SafetyWarningCard';
import ClarificationPrompt from './ClarificationPrompt';
import type { AssistantMessage as AssistantMessageType } from '../../../types/assistant';

interface AssistantMessageProps {
  message: AssistantMessageType;
  onPressProduct: (productId: string) => void;
  onPressRelation: (relationId: string) => void;
  onAskClarification: (question: string) => void;
}

export default function AssistantMessage({
  message,
  onPressProduct,
  onPressRelation,
  onAskClarification,
}: AssistantMessageProps) {
  if (message.role === 'user') {
    return (
      <View style={[styles.row, styles.userRow]}>
        <View style={[styles.bubble, styles.userBubble]}>
          {message.text ? (
            <AppText variant="body">{message.text}</AppText>
          ) : null}
          {message.imageUri ? (
            <Image source={{ uri: message.imageUri }} style={styles.userImage} />
          ) : null}
        </View>
      </View>
    );
  }

  const response = message.response;
  if (!response) {
    return null;
  }

  return (
    <View style={[styles.row, styles.assistantRow]}>
      <View style={styles.assistantBlock}>
        {message.text ? (
          <AppText variant="body">{message.text}</AppText>
        ) : null}

        {response.outOfScope ? (
          <Surface variant="subtle" style={styles.section}>
            <AppText variant="label" color="warning">超出回答范围</AppText>
            <AppText variant="caption" color="secondary">
              误食、中毒、吸入或身体不适等紧急情况，请立即联系医生或当地急救，不要依赖本应用的化学建议。
            </AppText>
          </Surface>
        ) : (
          <>
            {response.inventoryAdvice.map((advice, i) => (
              <InventoryAdviceCard
                key={i}
                advice={advice}
                onPress={onPressProduct}
              />
            ))}
            {response.generalAdvice.length > 0 ? (
              <GeneralAdviceCard advice={response.generalAdvice} />
            ) : null}
            {response.safetyWarnings.map((warning, i) => (
              <SafetyWarningCard
                key={i}
                warning={warning}
                onPressRelation={onPressRelation}
              />
            ))}
            {response.needsClarification &&
            response.clarificationQuestions.length > 0 ? (
              <ClarificationPrompt
                questions={response.clarificationQuestions}
                onAsk={onAskClarification}
              />
            ) : null}
          </>
        )}

        {response.evidence.length > 0 ? (
          <AppText variant="caption" color="muted" style={styles.evidence}>
            依据：{response.evidence.join('；')}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: '100%',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '100%',
    padding: rawTokens.space[3],
    borderRadius: rawTokens.radius.large,
  },
  userBubble: {
    backgroundColor: semanticColors.surface.inverse,
    gap: rawTokens.space[2],
  },
  userImage: {
    width: 160,
    height: 120,
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.muted,
  },
  assistantBlock: {
    width: '100%',
    gap: rawTokens.space[2],
  },
  section: {
    gap: rawTokens.space[1],
  },
  evidence: {
    marginTop: rawTokens.space[1],
  },
});
