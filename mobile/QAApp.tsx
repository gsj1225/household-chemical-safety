/**
 * QA App — 仅开发环境使用
 *
 * 通过环境变量 EXPO_PUBLIC_QA=1 或 URL 参数 ?qa=1 激活
 * 渲染 QAFixture 而非正式导航
 */

import React from 'react';
import QAFixture from './src/qa/QAFixture';

export default function QAApp() {
  return <QAFixture />;
}
