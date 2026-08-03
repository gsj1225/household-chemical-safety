/** 历史挑战列表。 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { api } from '../services/api';
import { useChallengeStore } from '../store/challengeStore';
import { colors } from '../theme/colors';
import { borderRadius, fontSize, spacing } from '../theme/spacing';
import type { ChallengeHistoryItem, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

export default function HistoryScreen({ navigation }: Props) {
  const setReport = useChallengeStore((state) => state.setReport);
  const [items, setItems] = useState<ChallengeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setItems(await api.getChallengeHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : '历史记录加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void loadHistory(); }, [loadHistory]));

  const openReport = async (item: ChallengeHistoryItem) => {
    if (!item.is_completed || item.score === null || openingId) return;
    setOpeningId(item.challenge_id);
    try {
      const report = await api.getResult(item.challenge_id);
      setReport(report);
      navigation.navigate('Result');
    } catch (err) {
      Alert.alert('报告打开失败', err instanceof Error ? err.message : '请重试');
    } finally {
      setOpeningId(null);
    }
  };

  const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void loadHistory(true)} />
        }
      >
        <Text style={styles.title}>历史场景报告</Text>
        <Text style={styles.subtitle}>每张全景图独立成一份报告，不代表整套住宅已经检查</Text>

        {loading ? (
          <ActivityIndicator style={styles.state} size="large" color={colors.primary} />
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>加载失败</Text>
            <Text style={styles.stateText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => void loadHistory()}>
              <Text style={styles.retryText}>重新加载</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.stateTitle}>还没有历史报告</Text>
            <Text style={styles.stateText}>完成第一次单场景检查后，就能在这里重新查看。</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate('Home')}>
              <Text style={styles.retryText}>去检查一个场景</Text>
            </TouchableOpacity>
          </View>
        ) : (
          items.map((item, index) => {
            const available = item.is_completed && item.score !== null;
            return (
              <TouchableOpacity
                key={item.challenge_id}
                style={[styles.card, !available && styles.cardDisabled]}
                onPress={() => void openReport(item)}
                disabled={!available || openingId !== null}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeading}>
                    <Text style={styles.cardTitle}>
                      {item.scene_label || '历史场景'}
                    </Text>
                    <Text style={styles.cardSequence}>
                      第 {items.length - index} 次检查
                    </Text>
                  </View>
                  <Text style={[styles.badge, available ? styles.doneBadge : styles.progressBadge]}>
                    {available ? '已完成' : '未完成'}
                  </Text>
                </View>
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                <View style={styles.metrics}>
                  <View><Text style={styles.metricValue}>{item.score ?? '--'}</Text><Text style={styles.metricLabel}>安全分</Text></View>
                  <View><Text style={styles.metricValue}>{item.total_mines}</Text><Text style={styles.metricLabel}>雷点</Text></View>
                  <Text style={styles.openText}>{openingId === item.challenge_id ? '打开中…' : available ? '查看报告 ›' : '未生成报告'}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', padding: spacing.xl },
  title: { fontSize: fontSize.xxl, fontWeight: 'bold', color: colors.textPrimary },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.xl },
  state: { marginTop: spacing.xxl },
  stateCard: { backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg, padding: spacing.xl, alignItems: 'center', marginTop: spacing.xl },
  emptyEmoji: { fontSize: 44, marginBottom: spacing.md },
  stateTitle: { fontSize: fontSize.lg, fontWeight: 'bold', color: colors.textPrimary },
  stateText: { fontSize: fontSize.sm, lineHeight: 22, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  retryButton: { backgroundColor: colors.primary, borderRadius: borderRadius.xl, paddingVertical: spacing.md, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  retryText: { color: colors.textWhite, fontSize: fontSize.md, fontWeight: 'bold' },
  card: { backgroundColor: colors.bgSecondary, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardDisabled: { opacity: 0.62 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeading: { flex: 1 },
  cardTitle: { fontSize: fontSize.md, fontWeight: 'bold', color: colors.textPrimary },
  cardSequence: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  badge: { overflow: 'hidden', borderRadius: borderRadius.round, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, fontSize: fontSize.xs },
  doneBadge: { color: colors.safe, backgroundColor: '#DDF8EF' },
  progressBadge: { color: colors.textSecondary, backgroundColor: colors.border },
  date: { fontSize: fontSize.xs, color: colors.textLight, marginTop: spacing.xs },
  metrics: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg, gap: spacing.xl },
  metricValue: { fontSize: fontSize.xl, fontWeight: 'bold', color: colors.textPrimary },
  metricLabel: { fontSize: fontSize.xs, color: colors.textSecondary, marginTop: spacing.xs },
  openText: { marginLeft: 'auto', color: colors.primary, fontSize: fontSize.sm, fontWeight: '600', alignSelf: 'center' },
});
