/**
 * Legacy theme compatibility.
 *
 * New components use semanticColors/componentTokens from tokens.ts.
 * Existing screens keep these exports until their migration slice.
 */

import { rawTokens, semanticColors } from './tokens';

export const colors = {
  primary: semanticColors.action.primary,
  primaryDark: semanticColors.action.primaryPressed,
  primaryLight: semanticColors.surface.subtle,

  critical: rawTokens.palette.legacyRisk.critical,
  medium: rawTokens.palette.legacyRisk.medium,
  low: rawTokens.palette.legacyRisk.low,
  safe: rawTokens.palette.legacyRisk.safe,

  bgPrimary: semanticColors.surface.page,
  bgSecondary: semanticColors.surface.subtle,
  bgDark: semanticColors.surface.inverse,

  textPrimary: semanticColors.text.primary,
  textSecondary: semanticColors.text.secondary,
  textLight: semanticColors.text.muted,
  textWhite: semanticColors.text.inverse,

  border: semanticColors.border.default,
  overlay: semanticColors.overlay.photo,
  shadow: 'rgba(8, 9, 10, 0.12)',
};

export const riskLevelColor: Record<string, string> = {
  critical: colors.critical,
  medium: colors.medium,
  low: colors.low,
  safe: colors.safe,
  high: colors.critical,
};
