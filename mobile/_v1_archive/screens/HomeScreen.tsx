/**
 * 首页——挑战入口
 */

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppButton, AppText, Surface } from '../components/primitives';
import { RecoveryPanel } from '../components/composites';
import { componentTokens, rawTokens, semanticColors } from '../theme/tokens';
import { useChallengeStore } from '../store/challengeStore';
import { api } from '../services/api';
import {
  getRecoveryCopy,
  recoveryAnnounceKey,
  shortTraceId,
  toAppFailure,
  type AppFailure,
} from '../utils/recovery';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const inspectionSteps = [
  '选择一个场景拍全景',
  '按原图提示细查 1–3 处',
  '核对信息并生成本场景报告',
] as const;

export default function HomeScreen({ navigation }: Props) {
  const { setChallengeId, reset } = useChallengeStore();
  const [starting, setStarting] = useState(false);
  const [startFailure, setStartFailure] = useState<AppFailure | null>(null);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    setStartFailure(null);
    try {
      reset();
      const challenge = await api.startChallenge();
      setChallengeId(challenge.challenge_id);
      navigation.navigate('Scan');
    } catch (err) {
      setStartFailure(toAppFailure(err));
    } finally {
      setStarting(false);
    }
  };

  const startRecoveryCopy = startFailure
    ? getRecoveryCopy('start', startFailure)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="label" style={styles.eyebrow}>
            家庭化学品安全检查
          </AppText>
          <AppText
            variant="display"
            accessibilityRole="header"
            style={styles.title}
          >
            我家到底{'\n'}有多少雷？
          </AppText>
          <AppText color="secondary" style={styles.subtitle}>
            一次只检查一个场景，发现需要注意的混用、包装与使用风险。
          </AppText>
        </View>

        <Surface variant="outlined" style={styles.auditCard}>
          <View style={styles.auditHeader}>
            <View
              style={styles.auditMark}
              accessible
              accessibilityLabel="检查提示"
            >
              <AppText variant="title" color="inverse">!</AppText>
            </View>
            <View accessible={false} style={styles.auditCode}>
              <AppText variant="caption" align="right">拍照 / 核对</AppText>
              <AppText variant="caption" align="right">评估 / 建议</AppText>
            </View>
          </View>

          <View style={styles.steps}>
            {inspectionSteps.map((step, index) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <AppText variant="caption" style={styles.stepNumberText}>
                    {index + 1}
                  </AppText>
                </View>
                <AppText variant="label" style={styles.stepText}>
                  {step}
                </AppText>
                <AppText
                  variant="label"
                  accessibilityLabel="已说明"
                  style={styles.stepCheck}
                >
                  ✓
                </AppText>
              </View>
            ))}
          </View>
        </Surface>

        <View style={styles.actions}>
          {startFailure && startRecoveryCopy ? (
            <RecoveryPanel
              title={startRecoveryCopy.title}
              description={startRecoveryCopy.description}
              traceId={shortTraceId(startFailure.requestId)}
              announceKey={recoveryAnnounceKey('start', startFailure)}
              primaryAction={{
                label: starting ? '正在重新连接' : '重新连接并开始',
                onPress: handleStart,
                loading: starting,
                accessibilityHint: '重新创建一次单场景检查并进入全景拍摄',
              }}
            />
          ) : (
            <AppButton
              label={starting ? '正在开始检查' : '检查一个场景'}
              loading={starting}
              onPress={handleStart}
              accessibilityHint="创建一次单场景检查并进入全景拍摄"
            />
          )}
          <AppButton
            label="查看历史报告"
            variant="secondary"
            onPress={() => navigation.navigate('History')}
            accessibilityHint="打开以前完成的排雷报告"
          />
          <AppText variant="caption" color="muted" align="center">
            照片仅用于本次分析，当前版本不保存原图
          </AppText>
        </View>
      </ScrollView>
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
    paddingHorizontal: rawTokens.space[5],
    paddingTop: rawTokens.space[6],
    paddingBottom: rawTokens.space[5],
  },
  header: {
    alignItems: 'flex-start',
    gap: rawTokens.space[3],
  },
  eyebrow: {
    letterSpacing: 0.5,
  },
  title: {
    letterSpacing: -1.4,
  },
  subtitle: {
    maxWidth: 520,
  },
  auditCard: {
    marginTop: rawTokens.space[6],
    padding: rawTokens.space[5],
  },
  auditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: rawTokens.space[4],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.strong,
  },
  auditMark: {
    width: 52,
    height: 52,
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: semanticColors.surface.inverse,
  },
  auditCode: {
    gap: rawTokens.space[1],
  },
  steps: {
    marginTop: rawTokens.space[1],
  },
  stepRow: {
    minHeight: rawTokens.size.touchMinimum,
    flexDirection: 'row',
    alignItems: 'center',
    gap: rawTokens.space[3],
    borderBottomWidth: componentTokens.surface.borderWidth,
    borderBottomColor: semanticColors.border.default,
  },
  stepNumber: {
    width: rawTokens.space[6],
    height: rawTokens.space[6],
    borderRadius: rawTokens.radius.round,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: componentTokens.surface.borderWidth,
    borderColor: semanticColors.border.strong,
  },
  stepNumberText: {
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
  },
  stepCheck: {
    fontWeight: '700',
  },
  actions: {
    marginTop: 'auto',
    paddingTop: rawTokens.space[8],
    gap: rawTokens.space[3],
  },
});
