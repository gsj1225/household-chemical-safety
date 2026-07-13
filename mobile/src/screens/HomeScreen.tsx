/**
 * 首页——挑战入口
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { fontSize, spacing, borderRadius } from '../theme/spacing';
import { useChallengeStore } from '../store/challengeStore';
import { api } from '../services/api';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function HomeScreen({ navigation }: Props) {
  const { setChallengeId, reset } = useChallengeStore();
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      reset();
      const challenge = await api.startChallenge();
      setChallengeId(challenge.challenge_id);
      navigation.navigate('Scan');
    } catch (err) {
      Alert.alert('暂时无法开始', err instanceof Error ? err.message : '请稍后重试');
    } finally {
      setStarting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 标题区 */}
        <View style={styles.header}>
          <Text style={styles.title}>我家到底{'\n'}有多少雷？</Text>
          <View style={styles.titleUnderline} />
          <Text style={styles.subtitle}>家庭化学品排雷大挑战</Text>
        </View>

        {/* 中央视觉区 */}
        <View style={styles.visualArea}>
          <View style={styles.bombCircle}>
            <Text style={styles.bombEmoji}>💣</Text>
          </View>
          <Text style={styles.visualHint}>
            拍照扫描家里的化学品{'\n'}发现隐藏的安全雷点
          </Text>
        </View>

        {/* 开始按钮 */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStart}
          disabled={starting}
          activeOpacity={0.85}
        >
          {starting ? (
            <ActivityIndicator color={colors.textWhite} />
          ) : (
            <>
              <Text style={styles.startButtonText}>开始挑战</Text>
              <Text style={styles.startButtonArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.historyButton}
          onPress={() => navigation.navigate('History')}
          activeOpacity={0.8}
        >
          <Text style={styles.historyButtonText}>查看历史报告</Text>
          <Text style={styles.historyButtonArrow}>›</Text>
        </TouchableOpacity>

        {/* 玩法说明 */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>怎么玩？</Text>
          <View style={styles.infoStep}>
            <Text style={styles.stepNum}>1</Text>
            <Text style={styles.infoText}>拍一张你家化学品集中区域的全景照</Text>
          </View>
          <View style={styles.infoStep}>
            <Text style={styles.stepNum}>2</Text>
            <Text style={styles.infoText}>AI会告诉你哪些地方需要细查</Text>
          </View>
          <View style={styles.infoStep}>
            <Text style={styles.stepNum}>3</Text>
            <Text style={styles.infoText}>逐个靠近拍照，发现雷点</Text>
          </View>
          <View style={styles.infoStep}>
            <Text style={styles.stepNum}>4</Text>
            <Text style={styles.infoText}>获得排雷评分，晒出你的成绩</Text>
          </View>
        </View>

        {/* 底部 */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>出题方：无毒先锋 Toxics-Free Corps</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginTop: spacing.xxl + spacing.md,
  },
  title: {
    fontSize: fontSize.mega,
    fontWeight: 'bold',
    color: colors.textPrimary,
    textAlign: 'center',
    lineHeight: 72,
  },
  titleUnderline: {
    width: 60,
    height: 4,
    backgroundColor: colors.primary,
    borderRadius: 2,
    marginTop: spacing.md,
  },
  subtitle: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  visualArea: {
    alignItems: 'center',
    marginVertical: spacing.xxl,
  },
  bombCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  bombEmoji: {
    fontSize: 72,
  },
  visualHint: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  startButton: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.lg + 2,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xl,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  startButtonText: {
    color: colors.textWhite,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    marginRight: spacing.sm,
  },
  startButtonArrow: {
    color: colors.textWhite,
    fontSize: fontSize.lg,
    fontWeight: 'bold',
  },
  historyButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: -spacing.md,
    marginBottom: spacing.md,
  },
  historyButtonText: {
    color: colors.primary,
    fontSize: fontSize.md,
    fontWeight: '600',
  },
  historyButtonArrow: {
    color: colors.primary,
    fontSize: fontSize.xl,
    marginLeft: spacing.xs,
  },
  infoCard: {
    backgroundColor: colors.bgSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginTop: spacing.md,
  },
  infoTitle: {
    fontSize: fontSize.md,
    fontWeight: 'bold',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  infoStep: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    color: colors.textWhite,
    fontSize: fontSize.xs,
    fontWeight: 'bold',
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: 24,
    marginRight: spacing.md,
    overflow: 'hidden',
  },
  infoText: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 22,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  footerText: {
    fontSize: fontSize.xs,
    color: colors.textLight,
  },
});
