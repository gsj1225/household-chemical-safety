/**
 * PermissionDeniedView — 权限被拒绝时的共用提示
 *
 * 从 IntakePhotoStep 抽取，供生产页面和 QA 夹具共用，
 * 避免文案/布局副本漂移。
 */

import React from 'react';
import { Linking } from 'react-native';
import StateMessage from '../../primitives/StateMessage';
import AppButton from '../../primitives/AppButton';

export default function PermissionDeniedView() {
  return (
    <StateMessage
      title="权限被拒绝"
      description="需要相机或相册权限才能拍照。请在系统设置中开启权限后重试。"
      tone="error"
      actions={
        <AppButton
          label="前往设置"
          variant="secondary"
          onPress={() => Linking.openSettings()}
        />
      }
    />
  );
}
