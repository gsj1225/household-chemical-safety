import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PhotoFrame } from '../composites';
import { AppButton, StateMessage } from '../primitives';
import { rawTokens } from '../../theme/tokens';

interface PanoramaEmptyViewProps {
  imageUri: string;
  onRetry: () => void;
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
}

export default function PanoramaEmptyView({
  imageUri,
  onRetry,
  onStartCamera,
  onSelectFromAlbum,
}: PanoramaEmptyViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <StateMessage
        title="暂时没有定位到可细拍区域"
        description="这不代表照片中没有化学品。模型没有找到足够明确的瓶罐或包装，你可以换一张更清晰、范围更集中的照片。"
      />

      <PhotoFrame
        uri={imageUri}
        accessibilityLabel="刚才用于全景分析的照片"
        style={styles.photoFrame}
      />

      <View style={styles.actions}>
        <AppButton label="从相册换一张" onPress={onSelectFromAlbum} />
        <AppButton label="重新拍照" variant="secondary" onPress={onStartCamera} />
        <AppButton
          label="重新分析这张照片（会再次调用模型）"
          variant="quiet"
          onPress={onRetry}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: rawTokens.space[5],
    gap: rawTokens.space[5],
  },
  actions: {
    gap: rawTokens.space[3],
  },
  photoFrame: {
    maxWidth: 520,
    alignSelf: 'center',
  },
});
