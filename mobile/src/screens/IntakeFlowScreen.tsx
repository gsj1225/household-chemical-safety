/**
 * IntakeFlowScreen — 扫描入库流程入口
 *
 * 完整状态机：
 * photo → recognizing → review → checking_duplicates →
 *   ├─ duplicate (有重复候选) → update_existing / create_another / go_back / cancel
 *   └─ creating (无重复) → success / error
 * 补拍：photo → recognizing → review → supplement → recognizing → review
 */

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { rawTokens, semanticColors } from '../theme/tokens';
import AppText from '../components/primitives/AppText';
import StateMessage from '../components/primitives/StateMessage';
import AppButton from '../components/primitives/AppButton';
import IntakePhotoStep from '../components/features/intake/IntakePhotoStep';
import IntakeReviewStep from '../components/features/intake/IntakeReviewStep';
import IntakeSupplementStep from '../components/features/intake/IntakeSupplementStep';
import IntakeDuplicateStep from '../components/features/intake/IntakeDuplicateStep';
import { useIntakeStore } from '../store/intakeStore';
import type { RootStackParamList } from '../types';

export default function IntakeFlowScreen() {
  const { step, errorMessage, reset, start, startRescan, rescanProductId, retryFromError, coverSaveFailed } = useIntakeStore();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'IntakeFlow'>>();

  useEffect(() => {
    const params = route.params;
    if (params?.rescanProductId) {
      startRescan(params.rescanProductId);
    } else {
      start();
    }
  }, [start, startRescan, route.params]);

  const handleDone = () => {
    reset();
    navigation.navigate('Inventory');
  };

  const handleCancel = () => {
    reset();
    navigation.goBack();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <AppText variant="titleSmall">{rescanProductId ? '重新扫描' : '添加产品'}</AppText>
        <AppButton label="取消" variant="quiet" onPress={handleCancel} />
      </View>

      <View style={styles.content}>
        {step === 'photo' || step === 'idle' ? (
          <IntakePhotoStep errorMessage={errorMessage} />
        ) : null}

        {step === 'recognizing' ? (
          <View style={styles.centering}>
            <StateMessage
              title="正在识别"
              description="AI 正在分析照片中的产品信息…"
              tone="neutral"
            />
          </View>
        ) : null}

        {step === 'review' ? <IntakeReviewStep /> : null}

        {step === 'supplement' ? <IntakeSupplementStep /> : null}

        {step === 'checking_duplicates' ? (
          <View style={styles.centering}>
            <StateMessage
              title="正在检查重复"
              description="检查库中是否已有相同产品…"
              tone="neutral"
            />
          </View>
        ) : null}

        {step === 'duplicate' ? <IntakeDuplicateStep /> : null}

        {step === 'creating' ? (
          <View style={styles.centering}>
            <StateMessage
              title="正在创建"
              description="正在将产品添加到你的化学品库…"
              tone="neutral"
            />
          </View>
        ) : null}

        {step === 'updating' ? (
          <View style={styles.centering}>
            <StateMessage
              title="正在更新"
              description="正在更新已有产品记录…"
              tone="neutral"
            />
          </View>
        ) : null}

        {step === 'success' ? (
          <View style={styles.centering}>
            <StateMessage
              title={coverSaveFailed ? '部分成功' : (rescanProductId ? '更新成功' : '添加成功')}
              description={coverSaveFailed
                ? '产品已保存，但照片保存失败。你可以在产品详情中重新扫描封面。'
                : (rescanProductId ? '产品信息已更新' : '产品已添加到你的化学品库')}
              tone={coverSaveFailed ? 'error' : 'neutral'}
              actions={
                <View style={styles.errorActions}>
                  <AppButton label="完成" variant="primary" onPress={handleDone} />
                </View>
              }
            />
          </View>
        ) : null}

        {step === 'error' && errorMessage ? (
          <View style={styles.centering}>
            <StateMessage
              title="操作失败"
              description={errorMessage}
              tone="error"
              actions={
                <View style={styles.errorActions}>
                  <AppButton label="重试" variant="secondary" onPress={retryFromError} />
                  <AppButton label="取消" variant="quiet" onPress={handleCancel} />
                </View>
              }
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: semanticColors.surface.page,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: rawTokens.space[4],
    paddingTop: rawTokens.space[4],
    paddingBottom: rawTokens.space[2],
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  content: {
    flex: 1,
  },
  centering: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: rawTokens.space[5],
  },
  errorActions: {
    gap: rawTokens.space[2],
  },
});
