/**
 * 结果页——排雷评分 + 报告 + 分享
 * 评分展示拆分到 ScoreDisplay，雷点列表拆分到 MineList
 */

import React, { useLayoutEffect, useRef, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppButton, AppText, StateMessage, Surface } from '../components/primitives';
import {
  componentTokens,
  rawTokens,
  semanticColors,
} from '../theme/tokens';
import { useChallengeStore } from '../store/challengeStore';
import ScoreDisplay from '../components/views/ScoreDisplay';
import MineList from '../components/views/MineList';
import {
  ShareCardPreviewModal,
  type ShareCardAction,
} from '../components/features';
import { buildShareCardData } from '../utils/shareCard';
import {
  captureShareCard,
  saveShareCardImage,
  shareShareCardImage,
  supportsNativeImageShare,
} from '../services/shareCard';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ navigation }: Props) {
  const { report, reset } = useChallengeStore();
  const [showDetails, setShowDetails] = useState(false);
  const [shareCardVisible, setShareCardVisible] = useState(false);
  const [shareAction, setShareAction] = useState<ShareCardAction>('idle');
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const shareCardRef = useRef<View | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: '本场景报告',
      headerRight: () => (
        <AppText
          variant="caption"
          color="secondary"
          style={styles.headerComplete}
        >
          已完成
        </AppText>
      ),
    });
  }, [navigation]);

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.missingContent}>
          <StateMessage
            title="报告数据暂时不可用"
            description="本地没有找到这份报告，可以返回首页重新开始一次检查。"
            tone="error"
            actions={(
              <AppButton
                label="返回首页"
                onPress={() => { reset(); navigation.navigate('Home'); }}
              />
            )}
          />
        </View>
      </SafeAreaView>
    );
  }

  const shareCardData = buildShareCardData(report);

  const handleOpenShareCard = () => {
    setShareFeedback(null);
    setShareCardVisible(true);
  };

  const handleShare = async () => {
    if (!supportsNativeImageShare) {
      try {
        await Share.share({ message: report.share_text });
        setShareFeedback('已打开系统文字分享面板。');
      } catch {
        setShareFeedback('暂时无法打开分享面板，请稍后重试。');
      }
      return;
    }

    try {
      setShareFeedback(null);
      setShareAction('capturing');
      const uri = await captureShareCard(shareCardRef);
      setShareAction('sharing');
      const result = await shareShareCardImage(uri);
      setShareFeedback(result === 'shared'
        ? '图片分享操作已完成。'
        : '当前设备暂不支持图片分享。');
    } catch {
      setShareFeedback('生成或分享图片失败，请稍后重试。');
    } finally {
      setShareAction('idle');
    }
  };

  const handleSave = async () => {
    try {
      setShareFeedback(null);
      setShareAction('capturing');
      const uri = await captureShareCard(shareCardRef);
      setShareAction('saving');
      const result = await saveShareCardImage(uri);
      setShareFeedback(result === 'saved'
        ? '结果卡已保存到相册。'
        : result === 'permission-denied'
          ? '未获得相册写入权限，图片没有保存。'
          : '当前设备暂不支持保存图片。');
    } catch {
      setShareFeedback('保存图片失败，请检查相册权限后重试。');
    } finally {
      setShareAction('idle');
    }
  };

  const handleRestart = () => {
    reset();
    navigation.navigate('Home');
  };
  const primaryMine = report.mines[0];
  const primaryLevel = primaryMine?.level === 'critical'
    ? '高风险'
    : primaryMine?.level === 'medium'
      ? '中风险'
      : '低风险';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScoreDisplay
          score={report.score}
          totalMines={report.total_mines}
          safeItems={report.safe_items}
          sceneLabel={report.scene_label || '当前场景'}
        />

        {primaryMine ? (
          <Surface variant="outlined" style={styles.riskSummary}>
            <View style={styles.riskSummaryHeader}>
              <AppText variant="label" style={styles.riskSummaryTitle}>
                ! {primaryMine.type}
              </AppText>
              <AppText variant="caption">{primaryLevel}</AppText>
            </View>
            <AppText variant="caption" color="secondary">
              {primaryMine.description}
            </AppText>
            <AppText variant="caption" style={styles.riskSummaryAdvice}>
              建议：{primaryMine.advice}
            </AppText>
          </Surface>
        ) : (
          <Surface variant="outlined" style={styles.allClearCard}>
            <View style={styles.zeroMark}>
              <AppText variant="titleSmall" color="inverse">0</AppText>
            </View>
            <View style={styles.allClearCopy}>
              <AppText variant="titleSmall">本轮未命中已配置规则</AppText>
              <AppText color="secondary">
                这不是永久安全证明。以后新增产品、换包装或混合使用时，仍应重新核对标签和禁忌。
              </AppText>
            </View>
          </Surface>
        )}

        <View style={styles.actions}>
          <AppButton label="生成结果分享卡" onPress={handleOpenShareCard} />
          {report.total_mines > 0 ? (
            <AppButton
              label={showDetails ? '收起全部风险详情' : '查看全部风险详情'}
              variant="quiet"
              onPress={() => setShowDetails((current) => !current)}
            />
          ) : null}
          <AppButton
            label="检查另一个场景"
            variant="secondary"
            onPress={handleRestart}
            accessibilityHint="结束当前报告并返回首页开始新的单场景检查"
          />
          <AppText variant="caption" color="secondary" align="center">
            分享卡仅包含场景名、规则评分、数量统计和娱乐化标签，不包含原始照片、产品名称和家庭地址
          </AppText>
        </View>

        {showDetails ? (
          <View style={styles.details}>
            <MineList mines={report.mines} breakdown={report.mine_breakdown} />
          </View>
        ) : null}
      </ScrollView>
      <ShareCardPreviewModal
        visible={shareCardVisible}
        data={shareCardData}
        cardRef={shareCardRef}
        action={shareAction}
        feedback={shareFeedback}
        supportsImageShare={supportsNativeImageShare}
        onClose={() => setShareCardVisible(false)}
        onShare={handleShare}
        onSave={handleSave}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: rawTokens.space[5],
    paddingBottom: rawTokens.space[8],
    gap: rawTokens.space[4],
  },
  headerComplete: {
    marginRight: rawTokens.space[4],
  },
  missingContent: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  allClearCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[4],
    padding: rawTokens.space[5],
  },
  zeroMark: {
    width: rawTokens.size.primaryControl,
    height: rawTokens.size.primaryControl,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.inverse,
  },
  allClearCopy: {
    flex: 1,
    gap: rawTokens.space[2],
  },
  actions: {
    marginTop: 'auto',
    paddingTop: rawTokens.space[4],
    gap: rawTokens.space[2],
  },
  riskSummary: {
    gap: rawTokens.space[2],
    padding: rawTokens.space[4],
    borderWidth: componentTokens.report.summaryBorderWidth,
    borderLeftWidth: componentTokens.report.summaryAccentWidth,
    borderColor: semanticColors.border.strong,
  },
  riskSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: rawTokens.space[3],
  },
  riskSummaryTitle: {
    flex: 1,
  },
  riskSummaryAdvice: {
    fontWeight: '700',
  },
  details: {
    gap: rawTokens.space[5],
    paddingTop: rawTokens.space[4],
  },
});
