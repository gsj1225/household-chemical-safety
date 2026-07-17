import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MagnifierAnimation from '../MagnifierAnimation';
import { semanticColors } from '../../theme/tokens';

interface AnalysisViewProps {
  imageUri: string | null;
  narrations: string[];
}

export default function AnalysisView({
  imageUri,
  narrations,
}: AnalysisViewProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <MagnifierAnimation imageUri={imageUri} narrations={narrations} />
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
  },
});
