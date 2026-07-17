/**
 * 排雷页面——核心交互页面
 * 流程：拍全景 → 引导细拍 → 识别中 → 结果 → 下一个/完成
 * 各状态的UI拆分到 components/views/ 目录下
 */

import React, { useState, useCallback } from 'react';
import { StyleSheet, Alert, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { useChallengeStore } from '../store/challengeStore';
import { api } from '../services/api';
import { pickImageFromLibrary } from '../services/imagePicker';
import CameraCaptureView from '../components/views/CameraCaptureView';
import PanoramaInputView from '../components/views/PanoramaInputView';
import GuideView from '../components/views/GuideView';
import ResultView from '../components/views/ResultView';
import PanoramaEmptyView from '../components/views/PanoramaEmptyView';
import IdentificationReviewView from '../components/views/IdentificationReviewView';
import AnalysisView from '../components/views/AnalysisView';
import ReportGeneratingView from '../components/views/ReportGeneratingView';
import type { IdentificationDraft, ProductIdentification, RootStackParamList, ScanResult } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Scan'>;

export default function ScanScreen({ navigation }: Props) {
  const {
    challengeId, pageStatus, areas, currentAreaIndex,
    scanResults, mineCount, guideMessage,
    setPanoramaAreas, addScanResult, nextArea,
    setPageStatus, setReport,
  } = useChallengeStore();

  const [showCamera, setShowCamera] = useState(false);
  const [narrations, setNarrations] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [analysisImageUri, setAnalysisImageUri] = useState<string | null>(null);
  const [panoramaImageUri, setPanoramaImageUri] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<IdentificationDraft | null>(null);
  const [pendingDetailImageUri, setPendingDetailImageUri] = useState<string | null>(null);
  const [confirmingIdentification, setConfirmingIdentification] = useState(false);

  // 拍照处理
  const handleCapture = async (uri: string) => {
    setShowCamera(false);
    setAnalysisImageUri(uri);
    const isPanorama = pageStatus === 'panorama' || pageStatus === 'panorama_empty';
    const wasIdentificationReview = pageStatus === 'identification_review';
    if (isPanorama) setPanoramaImageUri(uri);
    setPageStatus('analyzing');
    void fetchNarrations();

    try {
      if (isPanorama) {
        const result = await api.scanPanorama(uri, challengeId!);
        if (result.areas.length === 0) {
          setPageStatus('panorama_empty');
        } else {
          setPanoramaImageUri(uri);
          setPanoramaAreas(result.areas, result.guide_message);
        }
      } else {
        const currentArea = areas[currentAreaIndex];
        const draft = await api.identifyProduct(
          uri, challengeId!, currentArea?.area_id || ''
        );
        setPendingDraft(draft);
        setPendingDetailImageUri(uri);
        setPageStatus('identification_review');
      }
    } catch (err) {
      Alert.alert('扫描失败', err instanceof Error ? err.message : '请重试');
      setPageStatus(
        isPanorama ? 'panorama' : (wasIdentificationReview ? 'identification_review' : 'guide')
      );
    } finally {
      setAnalysisImageUri(null);
    }
  };

  const handleConfirmIdentification = async (product: ProductIdentification) => {
    if (!pendingDraft || confirmingIdentification) return;
    setConfirmingIdentification(true);
    try {
      const result = await api.confirmProduct(
        challengeId!, pendingDraft.draft_id, product
      );
      setLastResult(result);
      setPendingDraft(null);
      setPendingDetailImageUri(null);
      addScanResult(result);
    } catch (err) {
      Alert.alert('确认失败', err instanceof Error ? err.message : '请重试');
    } finally {
      setConfirmingIdentification(false);
    }
  };

  const handleSelectFromAlbum = async () => {
    try {
      const uri = await pickImageFromLibrary();
      if (uri) await handleCapture(uri);
    } catch {
      Alert.alert('选择照片失败', '无法打开相册，请稍后重试。');
    }
  };

  const fetchNarrations = async () => {
    try {
      const currentArea = areas[currentAreaIndex];
      const res = await api.generateNarration(
        challengeId!, currentArea?.description || '全景扫描', scanResults.length
      );
      setNarrations(res.narrations);
    } catch {
      setNarrations(['让我看看这是什么……']);
    }
  };

  const handleFinish = useCallback(async () => {
    if (finishing) return;
    setFinishing(true);
    setPageStatus('finishing');
    try {
      const report = await api.getResult(challengeId!);
      setReport(report);
      setPanoramaImageUri(null);
      navigation.navigate('Result');
    } catch (err) {
      Alert.alert('生成报告失败', err instanceof Error ? err.message : '请重试');
      setPageStatus('single_result');
    } finally {
      setFinishing(false);
    }
  }, [challengeId, finishing, navigation, setPageStatus, setReport]);

  const handleContinue = () => {
    if (finishing) return;
    setLastResult(null);
    setPendingDraft(null);
    setPendingDetailImageUri(null);
    const isLastArea = currentAreaIndex + 1 >= areas.length;
    if (isLastArea) {
      handleFinish();
    } else {
      nextArea();
    }
  };

  if (showCamera) {
    const hint = pageStatus === 'panorama' || pageStatus === 'panorama_empty'
      ? '拍一张你家化学品集中的区域全景'
      : guideMessage || '靠近拍一下';
    return <CameraCaptureView
      onCapture={handleCapture}
      onSelectFromAlbum={handleSelectFromAlbum}
      onCancel={() => setShowCamera(false)}
      hint={hint}
    />;
  }

  if (pageStatus === 'finishing') {
    return <ReportGeneratingView />;
  }

  if (pageStatus === 'analyzing') {
    return <AnalysisView narrations={narrations} imageUri={analysisImageUri} />;
  }

  if (pageStatus === 'panorama_empty' && panoramaImageUri) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}><PanoramaEmptyView
          imageUri={panoramaImageUri}
          onRetry={() => void handleCapture(panoramaImageUri)}
          onStartCamera={() => setShowCamera(true)}
          onSelectFromAlbum={handleSelectFromAlbum}
        /></View>
      </SafeAreaView>
    );
  }

  if (
    pageStatus === 'identification_review'
    && pendingDraft
    && pendingDetailImageUri
  ) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}><IdentificationReviewView
          draft={pendingDraft}
          imageUri={pendingDetailImageUri}
          submitting={confirmingIdentification}
          onConfirm={handleConfirmIdentification}
          onRetake={() => setShowCamera(true)}
          onSelectFromAlbum={handleSelectFromAlbum}
        /></View>
      </SafeAreaView>
    );
  }

  if (pageStatus === 'single_result' && lastResult) {
    const hasNextArea = currentAreaIndex + 1 < areas.length;
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}><ResultView
          result={lastResult}
          hasNextArea={hasNextArea}
          onContinue={handleContinue}
          submitting={finishing}
        /></View>
      </SafeAreaView>
    );
  }

  if (pageStatus === 'guide') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.content}><GuideView
          areas={areas}
          currentAreaIndex={currentAreaIndex}
          guideMessage={guideMessage}
          mineCount={mineCount}
          scanResults={scanResults}
          panoramaImageUri={panoramaImageUri}
          onStartCamera={() => setShowCamera(true)}
          onSelectFromAlbum={handleSelectFromAlbum}
          onSkip={handleContinue}
        /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}><PanoramaInputView
        onStartCamera={() => setShowCamera(true)}
        onSelectFromAlbum={handleSelectFromAlbum}
      /></View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
});
