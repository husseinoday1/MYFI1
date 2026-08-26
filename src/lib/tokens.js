import { Platform } from 'react-native';

export const FONT_FAMILY = 'MYFI-Cairo';

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
  sm: 6,
  md: 8,
  lg: 8,
  xl: 8,
  sheet: 18,
  pill: 999,
};

// Tinted rounded container behind an action icon (Quick Add circles, list-row
// leading icons). Formalizes the ad hoc per-screen pattern noted in
// docs/design/04_MYFI_DESIGN_TOKEN_CATALOG.md ("icon.container.*").
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

export const font = (value = '700') => ({
  fontFamily: FONT_FAMILY,
  fontWeight: String(value),
});

export const weight = font;
