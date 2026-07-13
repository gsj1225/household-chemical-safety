/**
 * 颜色主题
 */

export const colors = {
  // 主色
  primary: '#FF6B35',        // 活力橙——警示但不压抑
  primaryDark: '#E5552B',
  primaryLight: '#FFE5DC',

  // 风险等级色
  critical: '#E63946',       // 高危红
  medium: '#F4A261',         // 中危橙
  low: '#FFD23F',            // 低危黄
  safe: '#06D6A0',           // 安全绿

  // 背景色
  bgPrimary: '#FFFFFF',
  bgSecondary: '#F8F9FA',
  bgDark: '#1A1A2E',

  // 文字色
  textPrimary: '#1A1A2E',
  textSecondary: '#6C757D',
  textLight: '#ADB5BD',
  textWhite: '#FFFFFF',

  // 功能色
  border: '#E9ECEF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

export const riskLevelColor: Record<string, string> = {
  critical: colors.critical,
  medium: colors.medium,
  low: colors.low,
  safe: colors.safe,
  high: colors.critical, // 兼容全景照风险预判
};
