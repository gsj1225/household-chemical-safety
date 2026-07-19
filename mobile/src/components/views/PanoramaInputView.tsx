import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PhotoInputActions } from '../composites';
import { AppText, Surface } from '../primitives';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../../theme/tokens';

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
        <AppText variant="label" style={styles.eyebrow}>
          扫描 01 / 全景取证
        </AppText>
        <AppText variant="display" style={styles.title}>
          先拍全景，{'\n'}再逐个细查
        </AppText>
        <AppText color="secondary" style={styles.description}>
          这次只检查这张照片里的一个场景。拍下化学品较集中的完整区域，稍后会在原图圈出 1–3 个细拍位置。
        </AppText>
      </View>

      <Surface variant="outlined" style={styles.guide}>
        <View style={styles.guideHeader}>
          <View style={styles.guideNumber} accessible={false}>
            <AppText variant="label" color="inverse">01</AppText>
          </View>
          <View style={styles.guideTitle}>
            <AppText variant="titleSmall">保留完整区域</AppText>
            <AppText variant="caption" color="secondary">
              这张照片会成为后续圈选位置的底图
            </AppText>
          </View>
        </View>

        <View style={styles.guideRows}>
          <View style={styles.guideRow}>
            <AppText variant="caption" color="secondary">画面要有</AppText>
            <AppText variant="label" align="right" style={styles.guideValue}>
              瓶罐、包装、周围存放位置
            </AppText>
          </View>
          <View style={styles.guideRow}>
            <AppText variant="caption" color="secondary">后续会做</AppText>
            <AppText variant="label" align="right" style={styles.guideValue}>
              在这张原图圈出细拍区域
            </AppText>
          </View>
        </View>
      </Surface>

      <View style={styles.actions}>
        <PhotoInputActions
          onStartCamera={onStartCamera}
          onSelectFromAlbum={onSelectFromAlbum}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: rawTokens.space[5],
    paddingTop: rawTokens.space[6],
    paddingBottom: rawTokens.space[5],
    gap: rawTokens.space[6],
  },
  heading: {
    gap: rawTokens.space[3],
    alignItems: 'flex-start',
  },
  eyebrow: {
    letterSpacing: 0.5,
  },
  title: {
    letterSpacing: -1.4,
  },
  description: {
    maxWidth: 520,
  },
  guide: {
    gap: rawTokens.space[4],
    padding: rawTokens.space[5],
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
    paddingBottom: rawTokens.space[4],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.strong,
  },
  guideNumber: {
    width: rawTokens.size.touchMinimum,
    height: rawTokens.size.touchMinimum,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.inverse,
  },
  guideTitle: {
    flex: 1,
    gap: rawTokens.space[1],
  },
  guideRows: {
    gap: rawTokens.space[3],
  },
  guideRow: {
    minHeight: rawTokens.size.touchMinimum,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: rawTokens.space[3],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.default,
  },
  guideValue: {
    flex: 1,
  },
  actions: {
    marginTop: 'auto',
    paddingTop: rawTokens.space[6],
  },
});
