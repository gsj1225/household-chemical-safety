/**
 * Legacy theme compatibility.
 *
 * New components use semanticColors/componentTokens from tokens.ts.
 * Existing screens keep these exports until their migration slice.
 */

import { rawTokens } from './tokens';

export const colors = {
  primary: rawTokens.palette.brand.legacy,
  primaryDark: rawTokens.palette.brand.legacyDark,
  primaryLight: rawTokens.palette.brand.legacyLight,

  critical: rawTokens.palette.legacyRisk.critical,
  medium: rawTokens.palette.legacyRisk.medium,
  low: rawTokens.palette.legacyRisk.low,
  safe: rawTokens.palette.legacyRisk.safe,

  bgPrimary: rawTokens.palette.neutral[0],
  bgSecondary: rawTokens.palette.neutral[50],
  bgDark: '#1A1A2E',

  textPrimary: '#1A1A2E',
  textSecondary: '#6C757D',
  textLight: '#ADB5BD',
  textWhite: rawTokens.palette.neutral[0],

  border: '#E9ECEF',
  overlay: 'rgba(0, 0, 0, 0.6)',
  shadow: 'rgba(0, 0, 0, 0.1)',
};

export const riskLevelColor: Record<string, string> = {
  critical: colors.critical,
  medium: colors.medium,
  low: colors.low,
  safe: colors.safe,
  high: colors.critical,
};
