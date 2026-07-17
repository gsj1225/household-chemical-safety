/**
 * Legacy spacing compatibility.
 *
 * Values remain unchanged while new components use rawTokens directly.
 */

import { rawTokens } from './tokens';

export const spacing = {
  xs: rawTokens.space[1],
  sm: rawTokens.space[2],
  md: rawTokens.space[4],
  lg: rawTokens.space[6],
  xl: rawTokens.space[8],
  xxl: rawTokens.space[12],
};

export const fontSize = {
  xs: rawTokens.fontSize.caption,
  sm: rawTokens.fontSize.label,
  md: rawTokens.fontSize.body,
  lg: rawTokens.fontSize.titleSmall,
  xl: rawTokens.fontSize.title,
  xxl: 32,
  huge: rawTokens.fontSize.legacyLarge,
  mega: rawTokens.fontSize.legacyHero,
};

export const borderRadius = {
  sm: rawTokens.radius.small,
  md: rawTokens.radius.medium,
  lg: rawTokens.radius.large,
  xl: rawTokens.radius.xlarge,
  round: rawTokens.radius.round,
};
