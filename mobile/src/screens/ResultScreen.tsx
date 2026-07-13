/**
 * 结果页——排雷评分 + 报告 + 分享
 * 评分展示拆分到 ScoreDisplay，雷点列表拆分到 MineList
 */

import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { fontSize, spacing, borderRadius } from '../theme/spacing';
import { useChallengeStore } from '../store/challengeStore';
import ScoreDisplay from '../components/views/ScoreDisplay';
import MineList from '../components/views/MineList';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Result'>;

export default function ResultScreen({ navigation }: Props) {
  const { report, reset } = useChallengeStore();

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <Text style={styles.errorText}>报告数据丢失，请重新挑战</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { reset(); navigation.navigate('Home'); }}
          >
            <Text style={styles.primaryBtnText}>返回首页</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    try {
      await Share.share({ message: report.share_text });
    } catch (err) {
      console.error('分享失败:', err);
    }
  };

  const handleRestart = () => {
    reset();
    navigation.navigate('Home');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScoreDisplay
          score={report.score}
          level={report.level}
          totalMines={report.total_mines}
          safeItems={report.safe_items}
        />

        {report.total_mines > 0 ? (
          <MineList mines={report.mines} breakdown={report.mine_breakdown} />
        ) : (
          <View style={styles.allClearCard}>
            <Text style={styles.allClearEmoji}>🎉</Text>
            <Text style={styles.allClearText}>
              你家化学品管理得很好！{'\n'}继续保持，定期检查。
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>分享我的排雷成绩</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.restartBtn} onPress={handleRestart}>
          <Text style={styles.restartBtnText}>再排一次</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    padding: spacing.xl,
  },
  errorText: {
    fontSize: fontSize.md, color: colors.textSecondary,
    textAlign: 'center', marginBottom: spacing.lg,
  },
  primaryBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginTop: spacing.xl,
  },
  primaryBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: 'bold' },
  allClearCard: {
    backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg,
    padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg,
  },
  allClearEmoji: { fontSize: 48, marginBottom: spacing.md },
  allClearText: {
    fontSize: fontSize.md, color: colors.textPrimary,
    textAlign: 'center', lineHeight: 24,
  },
  shareBtn: {
    backgroundColor: colors.primary, paddingVertical: spacing.lg,
    borderRadius: borderRadius.xl, alignItems: 'center', marginBottom: spacing.md,
  },
  shareBtnText: { color: colors.textWhite, fontSize: fontSize.lg, fontWeight: 'bold' },
  restartBtn: { paddingVertical: spacing.md, alignItems: 'center' },
  restartBtnText: { color: colors.textSecondary, fontSize: fontSize.md },
});
