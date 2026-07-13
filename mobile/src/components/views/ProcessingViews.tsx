/** 扫描流程中的纯等待状态。 */

import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MagnifierAnimation from '../MagnifierAnimation';
import { colors } from '../../theme/colors';

export function AnalysisView(props: { imageUri: string | null; narrations: string[] }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <MagnifierAnimation imageUri={props.imageUri} narrations={props.narrations} />
      </View>
    </SafeAreaView>
  );
}

export function FinishingView() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.finishingBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.finishingTitle}>正在生成排雷报告</Text>
          <Text style={styles.finishingText}>正在汇总风险等级和安全建议，请稍候…</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  finishingBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  finishingTitle: { marginTop: 24, fontSize: 20, fontWeight: 'bold', color: colors.textPrimary },
  finishingText: { marginTop: 8, fontSize: 14, lineHeight: 22, color: colors.textSecondary, textAlign: 'center' },
});
