import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PhotoInputActions } from '../composites';
import { AppText, Surface } from '../primitives';
import { rawTokens, semanticColors } from '../../theme/tokens';

interface PanoramaInputViewProps {
  onStartCamera: () => void;
  onSelectFromAlbum: () => void;
}

export default function PanoramaInputView({
  onStartCamera,
  onSelectFromAlbum,
}: PanoramaInputViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <AppText variant="title" align="center">拍一张全景照</AppText>
        <AppText color="secondary" align="center">
          拍下家里最可能集中存放化学品的区域，例如厨房水槽下方或卫生间柜子。
        </AppText>
      </View>

      <Surface variant="subtle" style={styles.guide}>
        <View style={styles.photoMark} accessible={false}>
          <View style={styles.photoMarkInner} />
        </View>
        <AppText variant="titleSmall" align="center">保留完整区域</AppText>
        <AppText variant="label" color="secondary" align="center">
          将瓶罐、包装和周围存放位置一起拍入画面，后续会在原图上标出需要靠近拍摄的地方。
        </AppText>
      </Surface>

      <PhotoInputActions
        onStartCamera={onStartCamera}
        onSelectFromAlbum={onSelectFromAlbum}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: rawTokens.space[5],
    paddingVertical: rawTokens.space[8],
    gap: rawTokens.space[6],
  },
  heading: {
    gap: rawTokens.space[3],
  },
  guide: {
    alignItems: 'center',
    gap: rawTokens.space[3],
    paddingVertical: rawTokens.space[6],
  },
  photoMark: {
    width: 96,
    height: 72,
    borderWidth: 3,
    borderRadius: rawTokens.radius.medium,
    borderColor: semanticColors.action.decorativeAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMarkInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: semanticColors.surface.accentSubtle,
    borderWidth: 2,
    borderColor: semanticColors.action.decorativeAccent,
  },
});
