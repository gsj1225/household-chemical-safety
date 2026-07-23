import React, { type RefObject } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  View,
  type View as NativeView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ShareCardData } from '../../utils/shareCard';
import { rawTokens, semanticColors } from '../../theme/tokens';
import { AppButton, AppText, Surface } from '../primitives';
import ShareCard from './ShareCard';

export type ShareCardAction = 'idle' | 'capturing' | 'sharing' | 'saving';

interface ShareCardPreviewModalProps {
  visible: boolean;
  data: ShareCardData;
  cardRef: RefObject<NativeView | null>;
  action: ShareCardAction;
  feedback: string | null;
  supportsImageShare: boolean;
  onClose: () => void;
  onShare: () => void;
  onSave: () => void;
}

export default function ShareCardPreviewModal({
  visible,
  data,
  cardRef,
  action,
  feedback,
  supportsImageShare,
  onClose,
  onShare,
  onSave,
}: ShareCardPreviewModalProps) {
  const busy = action !== 'idle';
  const primaryLabel = supportsImageShare ? '分享图片卡' : '分享文字摘要';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={busy ? undefined : onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="titleSmall">结果分享卡</AppText>
            <AppText variant="caption" color="secondary">分享前先确认公开内容</AppText>
          </View>
          <AppButton
            label="关闭"
            variant="quiet"
            disabled={busy}
            onPress={onClose}
            accessibilityHint="关闭分享卡预览并返回报告"
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <ShareCard ref={cardRef} data={data} />

          <Surface variant="subtle" style={styles.privacyPanel}>
            <AppText variant="label">隐私边界</AppText>
            <AppText variant="caption" color="secondary">
              仅展示场景名、规则评分、数量统计和娱乐化标签；不包含原始照片、产品名称、地址或检查编号。
            </AppText>
          </Surface>

          {feedback ? (
            <View accessibilityLiveRegion="polite" style={styles.feedback}>
              <AppText variant="caption" align="center">{feedback}</AppText>
            </View>
          ) : null}

          <View style={styles.actions}>
            <AppButton
              label={primaryLabel}
              loading={action === 'capturing' || action === 'sharing'}
              disabled={busy && action === 'saving'}
              onPress={onShare}
            />
            {supportsImageShare ? (
              <AppButton
                label="保存到相册"
                variant="secondary"
                loading={action === 'saving'}
                disabled={busy && action !== 'saving'}
                onPress={onSave}
              />
            ) : (
              <AppText variant="caption" color="secondary" align="center">
                网页版不能把本地图片直接交给系统分享，已自动降级为文字摘要；Android 和 iOS 可分享或保存图片。
              </AppText>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
  header: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[3],
    paddingHorizontal: rawTokens.space[5],
    borderBottomWidth: 1,
    borderBottomColor: semanticColors.border.subtle,
  },
  headerCopy: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: rawTokens.space[5],
    paddingBottom: rawTokens.space[8],
    gap: rawTokens.space[4],
  },
  privacyPanel: {
    gap: rawTokens.space[1],
  },
  feedback: {
    paddingHorizontal: rawTokens.space[3],
  },
  actions: {
    gap: rawTokens.space[2],
  },
});
