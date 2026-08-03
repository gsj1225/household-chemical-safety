import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '../primitives';
import { rawTokens, semanticColors } from '../../theme/tokens';

export default function ReportGeneratingView() {
  return (
    <SafeAreaView style={styles.container}>
      <View
        style={styles.content}
        accessibilityRole="progressbar"
        accessibilityLabel="正在生成排雷报告"
      >
        <ActivityIndicator size="large" color={semanticColors.action.primary} />
        <AppText variant="titleSmall" align="center">正在生成排雷报告</AppText>
        <AppText color="secondary" align="center">
          正在汇总风险等级和安全建议，请稍候…
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    gap: rawTokens.space[3],
    padding: rawTokens.space[8],
  },
});
