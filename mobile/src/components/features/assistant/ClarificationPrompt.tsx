/**
 * ClarificationPrompt — 追问提示
 * 点击选项后直接作为下一条用户消息发送。
 */

import React from 'react';
import { StyleSheet, View } from 'react-native';
import { rawTokens } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import Surface from '../../primitives/Surface';
import AppButton from '../../primitives/AppButton';

interface ClarificationPromptProps {
  questions: string[];
  onAsk: (question: string) => void;
}

export default function ClarificationPrompt({
  questions,
  onAsk,
}: ClarificationPromptProps) {
  return (
    <Surface variant="subtle" style={styles.card}>
      <AppText variant="label">需要你补充信息</AppText>
      <View style={styles.options}>
        {questions.map((q, i) => (
          <AppButton
            key={i}
            label={q}
            variant="secondary"
            onPress={() => onAsk(q)}
          />
        ))}
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: rawTokens.space[3],
  },
  options: {
    gap: rawTokens.space[2],
  },
});
