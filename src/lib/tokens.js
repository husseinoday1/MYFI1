import { Platform } from 'react-native';

export const FONT_FAMILY = 'MYFI-Cairo';

export const TYPE = {
  hero: 32,
  title: 24,
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
  sm: 10,
  md: 14,
  lg: 18,
  xl: 22,
  sheet: 28,
  pill: 999,
};

export const SHADOW = {
  card: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    android: { elevation: 2 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.10,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
  }),
  subtle: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
    },
    android: { elevation: 1 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
    },
  }),
  float: Platform.select({
    ios: {
      shadowColor: '#02080F',
      shadowOpacity: 0.26,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 18 },
    },
    android: { elevation: 16 },
    default: {
      shadowColor: '#02080F',
      shadowOpacity: 0.24,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 16 },
    },
  }),
};

export const font = (value = '700') => ({
  fontFamily: FONT_FAMILY,
  fontWeight: String(value),
});

export const weight = font;
