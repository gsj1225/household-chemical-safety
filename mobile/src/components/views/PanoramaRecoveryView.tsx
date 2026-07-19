import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { PhotoFrame, RecoveryPanel } from '../composites';
import { AppText } from '../primitives';
import {
  getRecoveryCopy,
  recoveryAnnounceKey,
  shortTraceId,
  type AppFailure,
} from '../../utils/recovery';
import { rawTokens } from '../../theme/tokens';

interface PanoramaRecoveryViewProps {
  imageUri: string;
  failure: AppFailure;
  busy: boolean;
  onRetrySamePhoto: () => void;
  onRetake: () => void;
  onSelectFromAlbum: () => void;
  onRestart: () => void;
}

export default function PanoramaRecoveryView({
  imageUri,
  failure,
  busy,
  onRetrySamePhoto,
  onRetake,
  onSelectFromAlbum,
  onRestart,
}: PanoramaRecoveryViewProps) {
  const copy = getRecoveryCopy('panorama', failure);
  const invalidPhoto = failure.kind === 'invalid_photo';
  const expired = failure.kind === 'challenge_expired';

  const primaryAction = expired
    ? {
        label: '返回首页重新开始',
        onPress: onRestart,
        loading: false,
        accessibilityHint: '清理当前失效检查并返回首页',
      }
    : invalidPhoto
      ? {
          label: '重新拍一张',
          onPress: onRetake,
          loading: busy,
          accessibilityHint: '打开相机替换当前无效的全景照片',
        }
      : {
          label: busy ? '正在重试这张照片' : '重试分析这张照片',
          onPress: onRetrySamePhoto,
          loading: busy,
          accessibilityHint: '保留当前全景照片并重新请求分析',
        };

  const secondaryAction = expired
    ? undefined
    : invalidPhoto
      ? {
          label: '从相册换一张',
          onPress: onSelectFromAlbum,
          loading: false,
          accessibilityHint: '从相册选择另一张全景照片',
        }
      : {
          label: '重新拍照',
          onPress: onRetake,
          loading: false,
          accessibilityHint: '打开相机重新拍摄全景照片',
        };

  const tertiaryAction = expired
    ? undefined
    : invalidPhoto
      ? {
          label: '仍然重试这张',
          onPress: onRetrySamePhoto,
          loading: busy,
          accessibilityHint: '仍使用当前照片重新请求分析',
        }
      : {
          label: '从相册换图',
          onPress: onSelectFromAlbum,
          loading: false,
          accessibilityHint: '从相册选择另一张全景照片',
        };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heading}>
        <AppText variant="label" color="secondary">
          全景分析未完成
        </AppText>
        <AppText variant="display">
          照片还在，{'\n'}可以直接恢复
        </AppText>
        <AppText color="secondary">
          不需要返回重新走流程。先确认这就是刚才的照片，再选择恢复方式。
        </AppText>
      </View>

      <PhotoFrame
        uri={imageUri}
        accessibilityLabel="刚才拍摄但尚未完成分析的全景照片"
      />

      <RecoveryPanel
        title={copy.title}
        description={copy.description}
        traceId={shortTraceId(failure.requestId)}
        announceKey={recoveryAnnounceKey('panorama', failure)}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        tertiaryAction={tertiaryAction}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: rawTokens.space[5],
    paddingTop: rawTokens.space[6],
    paddingBottom: rawTokens.space[5],
    gap: rawTokens.space[5],
  },
  heading: {
    alignItems: 'flex-start',
    gap: rawTokens.space[3],
  },
});
