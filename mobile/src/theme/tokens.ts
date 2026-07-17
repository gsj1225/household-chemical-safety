/**
 * Design tokens are split into raw values, semantic roles, and component recipes.
 * Exact brand styling remains provisional until the final visual-polish stage.
 */

export const rawTokens = {
  palette: {
    brand: {
      legacy: '#FF6B35',
      legacyDark: '#E5552B',
      legacyLight: '#FFE5DC',
      500: '#E95320',
      600: '#C83E13',
      700: '#A93212',
    },
    neutral: {
      0: '#FFFFFF',
      50: '#F8F9FA',
      100: '#F2F4F7',
      200: '#E4E7EC',
      300: '#D0D5DD',
      500: '#667085',
      600: '#475467',
      900: '#101828',
    },
    risk: {
      critical: '#B42318',
      medium: '#B54708',
      low: '#7A5F00',
      noRuleHit: '#067647',
    },
    legacyRisk: {
      critical: '#E63946',
      medium: '#F4A261',
      low: '#FFD23F',
      safe: '#06D6A0',
    },
  },
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
    10: 40,
    12: 48,
  },
  fontSize: {
    caption: 12,
    label: 14,
    body: 16,
    titleSmall: 20,
    title: 24,
    titleLarge: 28,
    display: 36,
    legacyLarge: 48,
    legacyHero: 64,
  },
  lineHeight: {
    caption: 18,
    label: 22,
    body: 24,
    titleSmall: 28,
    title: 32,
    titleLarge: 36,
    display: 44,
  },
  radius: {
    small: 8,
    medium: 12,
    large: 16,
    xlarge: 24,
    round: 999,
  },
  size: {
    touchMinimum: 44,
    inputMinimum: 48,
    primaryControl: 52,
  },
  duration: {
    fast: 160,
    normal: 240,
    scan: 800,
  },
} as const;

export const semanticColors = {
  surface: {
    page: rawTokens.palette.neutral[0],
    subtle: rawTokens.palette.neutral[50],
    muted: rawTokens.palette.neutral[100],
    inverse: rawTokens.palette.neutral[900],
    accentSubtle: '#FFF4ED',
    glass: 'rgba(255, 255, 255, 0.92)',
    glassSubtle: 'rgba(255, 255, 255, 0.08)',
    lens: 'rgba(255, 255, 255, 0.12)',
  },
  text: {
    primary: rawTokens.palette.neutral[900],
    secondary: rawTokens.palette.neutral[600],
    muted: rawTokens.palette.neutral[500],
    action: rawTokens.palette.brand[600],
    inverse: rawTokens.palette.neutral[0],
    onAction: rawTokens.palette.neutral[0],
  },
  action: {
    primary: rawTokens.palette.brand[600],
    primaryPressed: rawTokens.palette.brand[700],
    secondaryPressed: '#FFF4ED',
    decorativeAccent: rawTokens.palette.brand[500],
    disabledBackground: rawTokens.palette.neutral[200],
    disabledForeground: rawTokens.palette.neutral[500],
  },
  border: {
    default: rawTokens.palette.neutral[300],
    subtle: rawTokens.palette.neutral[200],
    focus: rawTokens.palette.brand[600],
    onInverse: 'rgba(255, 255, 255, 0.82)',
  },
  status: {
    error: rawTokens.palette.risk.critical,
    warning: rawTokens.palette.risk.medium,
    info: '#175CD3',
    noRuleHit: rawTokens.palette.risk.noRuleHit,
  },
  risk: {
    critical: rawTokens.palette.risk.critical,
    medium: rawTokens.palette.risk.medium,
    low: rawTokens.palette.risk.low,
    noRuleHit: rawTokens.palette.risk.noRuleHit,
  },
  overlay: {
    photo: 'rgba(8, 16, 30, 0.56)',
    photoStrong: 'rgba(8, 16, 30, 0.72)',
    label: 'rgba(16, 24, 40, 0.88)',
  },
} as const;

export const typographyTokens = {
  display: {
    fontSize: rawTokens.fontSize.display,
    lineHeight: rawTokens.lineHeight.display,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: rawTokens.fontSize.title,
    lineHeight: rawTokens.lineHeight.title,
    fontWeight: '700' as const,
  },
  titleSmall: {
    fontSize: rawTokens.fontSize.titleSmall,
    lineHeight: rawTokens.lineHeight.titleSmall,
    fontWeight: '700' as const,
  },
  body: {
    fontSize: rawTokens.fontSize.body,
    lineHeight: rawTokens.lineHeight.body,
    fontWeight: '400' as const,
  },
  label: {
    fontSize: rawTokens.fontSize.label,
    lineHeight: rawTokens.lineHeight.label,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: rawTokens.fontSize.caption,
    lineHeight: rawTokens.lineHeight.caption,
    fontWeight: '400' as const,
  },
} as const;

export const componentTokens = {
  button: {
    minHeight: rawTokens.size.primaryControl,
    compactMinHeight: rawTokens.size.touchMinimum,
    radius: rawTokens.radius.large,
    horizontalPadding: rawTokens.space[5],
    gap: rawTokens.space[2],
  },
  surface: {
    radius: rawTokens.radius.large,
    padding: rawTokens.space[4],
  },
  photo: {
    panoramaAspectRatio: 4 / 3,
    detailAspectRatio: 16 / 9,
    radius: rawTokens.radius.large,
    background: rawTokens.palette.neutral[900],
  },
  stateMessage: {
    gap: rawTokens.space[3],
    padding: rawTokens.space[5],
  },
} as const;
