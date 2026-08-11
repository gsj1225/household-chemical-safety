/**
 * AssistantScreen — 家庭化学品助手问答页（Stage 4）
 *
 * 文字 + 可选照片的会话问答。会话保留在 Store，离开页面可继续。
 * 库存卡 → ProductDetail；风险卡 → RelationDetail；"查看仓库" → Inventory。
 */

import React, { useCallback, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import { rawTokens, semanticColors } from '../theme/tokens';
import AppText from '../components/primitives/AppText';
import AppButton from '../components/primitives/AppButton';
import ScreenSafeArea from '../components/primitives/ScreenSafeArea';
import ScreenScroll from '../components/primitives/ScreenScroll';
import StateMessage from '../components/primitives/StateMessage';
import Surface from '../components/primitives/Surface';
import { AssistantMessage, QuestionComposer } from '../components/features/assistant';
import { pickImageFromLibrary } from '../services/imagePicker';
import { useAssistantStore } from '../store/assistantStore';
import { canSend } from '../view-models/assistant';
import type { RootStackParamList } from '../types';

export default function AssistantScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'Assistant'>>();
  const {
    messages,
    draft,
    pendingImageUri,
    sending,
    error,
    setDraft,
    setContextProductId,
    attachPhoto,
    clearAttachment,
    send,
    retry,
  } = useAssistantStore();

  // 从路由带入上下文产品；会话消息保留在 Store 以便离开后继续
  useEffect(() => {
    setContextProductId(route.params?.contextProductId);
  }, [route.params?.contextProductId, setContextProductId]);

  const handleAttach = useCallback(async () => {
    const uri = await pickImageFromLibrary();
    if (uri) attachPhoto(uri);
  }, [attachPhoto]);

  const handleSend = useCallback(() => {
    send();
  }, [send]);

  const handleAskClarification = useCallback(
    (question: string) => {
      setDraft(question);
      send();
    },
    [setDraft, send],
  );

  const handlePressProduct = useCallback(
    (productId: string) => {
      navigation.navigate('ProductDetail', { productId });
    },
    [navigation],
  );

  const handlePressRelation = useCallback(
    (relationId: string) => {
      navigation.navigate('RelationDetail', { relationId });
    },
    [navigation],
  );

  const handleGoInventory = useCallback(() => {
    navigation.popTo('Inventory');
  }, [navigation]);

  return (
    <ScreenSafeArea>
      <View style={styles.header}>
        <AppText variant="title">家庭化学品助手</AppText>
        <AppButton label="查看仓库" variant="secondary" onPress={handleGoInventory} />
      </View>

      <ScreenScroll variant="list" style={styles.scroll}>
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <StateMessage
              title="开始提问"
              description="询问关于家里化学品的使用、储存或搭配问题。涉及误食、中毒等紧急情况请直接联系医生或急救。"
              tone="neutral"
            />
          </View>
        ) : (
          <View style={styles.messageList}>
            {messages.map((message) => (
              <AssistantMessage
                key={message.id}
                message={message}
                onPressProduct={handlePressProduct}
                onPressRelation={handlePressRelation}
                onAskClarification={handleAskClarification}
              />
            ))}
          </View>
        )}

        {error ? (
          <Surface variant="subtle" style={styles.error}>
            <AppText variant="caption" color="error">{error}</AppText>
            <AppButton label="重试" variant="secondary" onPress={retry} />
          </Surface>
        ) : null}
      </ScreenScroll>

      <View style={styles.composer}>
        <QuestionComposer
          draft={draft}
          onChangeDraft={setDraft}
          pendingImageUri={pendingImageUri}
          onAttach={handleAttach}
          onClearAttachment={clearAttachment}
          sending={sending}
          canSend={canSend(draft, pendingImageUri, sending)}
          onSend={handleSend}
        />
      </View>
    </ScreenSafeArea>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rawTokens.space[4],
    paddingTop: rawTokens.space[4],
    paddingBottom: rawTokens.space[2],
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  scroll: {
    flex: 1,
  },
  empty: {
    paddingVertical: rawTokens.space[8],
  },
  messageList: {
    gap: rawTokens.space[3],
  },
  error: {
    gap: rawTokens.space[2],
    marginTop: rawTokens.space[3],
    backgroundColor: semanticColors.surface.errorSubtle,
  },
  composer: {
    paddingHorizontal: rawTokens.space[4],
    paddingTop: rawTokens.space[2],
    paddingBottom: rawTokens.space[4],
    borderTopWidth: 1,
    borderTopColor: semanticColors.border.subtle,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
});
