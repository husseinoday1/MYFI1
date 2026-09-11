import { Platform } from 'react-native';
import { DEFAULT_FONT_ID, fontFamilyFor } from '../ui/typography';

// Legacy screens use `font(weight)` below; it now resolves to the approved
// IBM Plex Sans Arabic face for that weight (see src/ui/typography.js).
export const FONT_FAMILY = fontFamilyFor(DEFAULT_FONT_ID, 400);

export const TYPE = {
  hero: 28,
  title: 22,
  section: 14,
  body: 14,
  meta: 12,
  tiny: 12,
  caption: 12,
};

export const CONTROL = {
  touch: 44,
  compact: 40,
};

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  huge: 32,
  screen: 20,
};

export const RADIUS = {
  // The product uses generous, calm surfaces: small controls remain compact,
  // while cards and sheets clearly separate groups without heavy shadows.
  // Keeping this scale central prevents legacy square-card geometry from
  // leaking back into newly rebuilt screens.
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  sheet: 28,
  pill: 999,
};

// Tinted rounded container behind an action icon (Quick Add circles, list-row
// leading icons). Formalizes the ad hoc per-screen pattern noted in
// docs/design/04_MAALFLOW_DESIGN_TOKEN_CATALOG.md ("icon.container.*").
export const ICON_CONTAINER = {
  sm: { size: 30, radius: RADIUS.md },
  md: { size: 38, radius: RADIUS.md },
  lg: { size: 52, radius: RADIUS.lg },
};

export const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.06,
      shadowRadius: 7,
      shadowOffset: { width: 0, height: 3 },
    },
    android: { elevation: 1 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.06,
      shadowRadius: 7,
      shadowOffset: { width: 0, height: 3 },
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    android: { elevation: 1 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
  }),
  float: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
    },
    android: { elevation: 9 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.16,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 9 },
    },
  }),
};

// The family already carries the weight. Adding `fontWeight` on top would make
// Android synthesize bold over a bold face and makes iOS fall back to the
// system font for a custom single-face family.
export const font = (value = '700') => ({
  fontFamily: fontFamilyFor(DEFAULT_FONT_ID, value),
});

export const weight = font;
