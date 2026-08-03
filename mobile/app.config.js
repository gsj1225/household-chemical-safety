/**
 * app.config.js — Expo 动态配置
 *
 * 通过环境变量 APP_ENTRY=qa 切换到 QA 夹具入口
 */

export default ({ config }) => {
  const isQA = process.env.APP_ENTRY === 'qa';
  return {
    ...config,
    name: isQA ? 'QA Fixture' : config.name,
    entry: isQA ? './QAApp.tsx' : undefined,
  };
};
