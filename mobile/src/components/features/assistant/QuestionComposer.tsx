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
import {
  COMPOSER_ACTION_GAP,
  ATTACH_BUTTON_MIN_WIDTH,
  CAMERA_BUTTON_MIN_WIDTH,
  SEND_BUTTON_MIN_WIDTH,
} from '../../../view-models/composerLayout';

interface QuestionComposerProps {
  draft: string;
  onChangeDraft: (text: string) => void;
  pendingImageUri: string | null;
  onAttach: () => void;
  onTakePhoto: () => void;
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
  onTakePhoto,
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
        placeholder="问点什么"
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
          label="相册"
          variant="secondary"
          onPress={onAttach}
          disabled={sending || pendingImageUri != null}
          style={styles.attachButton}
        />
        <AppButton
          label="拍照"
          variant="secondary"
          onPress={onTakePhoto}
          disabled={sending || pendingImageUri != null}
          style={styles.cameraButton}
        />
        <AppButton
          label={sending ? '发送中…' : '发送'}
          variant="primary"
          onPress={onSend}
          disabled={!canSend}
          loading={sending}
          style={styles.sendButton}
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
    justifyContent: 'flex-start',
    gap: COMPOSER_ACTION_GAP,
  },
  attachButton: {
    minWidth: ATTACH_BUTTON_MIN_WIDTH,
  },
  cameraButton: {
    minWidth: CAMERA_BUTTON_MIN_WIDTH,
  },
  sendButton: {
    minWidth: SEND_BUTTON_MIN_WIDTH,
  },
});
