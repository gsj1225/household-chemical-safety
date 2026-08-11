/**
 * QuestionComposer — 问答输入区
 * 文本 + 照片可同时存在；未输入文字且无照片时发送按钮禁用。
 */

import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { rawTokens, semanticColors } from '../../../theme/tokens';
import AppText from '../../primitives/AppText';
import TextField from '../../primitives/TextField';
import AppButton from '../../primitives/AppButton';

interface QuestionComposerProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  pendingImageUri: string | null;
  onAttach: () => void;
  onClearAttachment: () => void;
  sending: boolean;
  canSend: boolean;
  onSend: () => void;
}

export default function QuestionComposer({
  draft,
  onChangeDraft,
  pendingImageUri,
  onAttach,
  onClearAttachment,
  sending,
  canSend,
  onSend,
}: QuestionComposerProps) {
  return (
    <View style={styles.container}>
      <TextField
        label=""
        value={draft}
        onChangeText={onChangeDraft}
        placeholder="问点什么，例如：洁厕灵能和84一起用吗？"
        multiline
        editable={!sending}
      />

      {pendingImageUri ? (
        <View style={styles.attachment}>
          <Image source={{ uri: pendingImageUri }} style={styles.thumbnail} />
          <Pressable onPress={onClearAttachment} disabled={sending}>
            <AppText variant="caption" color="action">移除照片</AppText>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actions}>
        <AppButton
          label="添加照片"
          variant="secondary"
          onPress={onAttach}
          disabled={sending || pendingImageUri != null}
        />
        <AppButton
          label={sending ? '发送中…' : '发送'}
          variant="primary"
          onPress={onSend}
          disabled={!canSend}
          loading={sending}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: rawTokens.space[2],
  },
  attachment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
  },
  thumbnail: {
    width: 56,
    height: 56,
    borderRadius: rawTokens.radius.medium,
    backgroundColor: semanticColors.surface.muted,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: rawTokens.space[2],
  },
});
