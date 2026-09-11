import { Platform } from 'react-native';

// Typography for the redesign.
//
// Fonts: tools.html offers six fonts under descriptive Arabic names. Each is
// stored by an internal id equal to its real Google Fonts family name, so the
// persisted setting stays meaningful if display names change. IBM Plex Sans
// Arabic ("الواضح") is the approved default (font-icon.html, 2026-09-11).
//
// Weights: React Native on Android cannot pick a weight out of one custom
// family registered at runtime, and a synthetic bold of the regular face looks
// nothing like the real SemiBold. So every bundled weight is registered as its
// own family and `fontFamilyFor` maps (font, weight) to the nearest bundled
// face. Text must therefore never rely on `fontWeight` alone — use <Txt>.

export const DEFAULT_FONT_ID = 'IBM Plex Sans Arabic';

// `faces` lists the weights actually bundled. Fonts without faces are drawn
// in the picker but not selectable until their files are added (tools.html step).
export const FONT_OPTIONS = [
  {
    id: 'IBM Plex Sans Arabic',
    labelAr: 'الواضح',
    labelEn: 'Clear',
    faces: {
      400: require('../../assets/fonts/IBMPlexSansArabic_400Regular.ttf'),
      500: require('../../assets/fonts/IBMPlexSansArabic_500Medium.ttf'),
      600: require('../../assets/fonts/IBMPlexSansArabic_600SemiBold.ttf'),
      700: require('../../assets/fonts/IBMPlexSansArabic_700Bold.ttf'),
    },
  },
  { id: 'Readex Pro', labelAr: 'المرن', labelEn: 'Flexible', faces: null },
  {
    id: 'Cairo',
    labelAr: 'الكلاسيكي',
    labelEn: 'Classic',
    // Cairo ships as one variable file, registered as a single face; every
    // requested weight resolves to it.
    faces: { 400: require('../../assets/fonts/Cairo.ttf') },
  },
  { id: 'Noto Sans Arabic', labelAr: 'الشامل', labelEn: 'Universal', faces: null },
  { id: 'Tajawal', labelAr: 'الأنيق', labelEn: 'Elegant', faces: null },
  { id: 'Almarai', labelAr: 'الجريء', labelEn: 'Bold', faces: null },
];

const familyName = (id, weight) => `MF-${id.replace(/\s+/g, '')}-${weight}`;

// Map for expo-font's useFonts().
export const fontAssets = FONT_OPTIONS.reduce((acc, option) => {
  if (!option.faces) return acc;
  Object.entries(option.faces).forEach(([weight, file]) => {
    acc[familyName(option.id, weight)] = file;
  });
  return acc;
}, {});

const optionById = (id) => FONT_OPTIONS.find((option) => option.id === id && option.faces)
  || FONT_OPTIONS.find((option) => option.id === DEFAULT_FONT_ID);

const WEIGHT_ALIASES = { normal: 400, bold: 700 };

export function fontFamilyFor(fontId, weight = 400) {
  const option = optionById(fontId);
  const wanted = Number(WEIGHT_ALIASES[weight] || weight) || 400;
  const available = Object.keys(option.faces).map(Number).sort((a, b) => a - b);
  // Nearest bundled face; ties resolve to the heavier face so emphasis survives.
  const nearest = available.reduce((best, candidate) => (
    Math.abs(candidate - wanted) <= Math.abs(best - wanted) ? candidate : best
  ), available[0]);
  return familyName(option.id, nearest);
}

export const isSelectableFont = (id) => FONT_OPTIONS.some((option) => option.id === id && option.faces);

// Font size setting (tools.html): one global multiplier over the designed
// size for every text — amounts, titles and labels alike, no per-screen
// exceptions. Bounded so a corrupted preference cannot break layout.
export const FONT_SCALE_MIN = 0.9;
export const FONT_SCALE_MAX = 1.4;
export const clampFontScale = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, n));
};

// Designed sizes, read from MaalFlow-Design-Board/mf.css.
export const TEXT_VARIANTS = {
  hero: { size: 28, weight: 600, color: 'text1' }, // .hero .hv
  amount: { size: 26, weight: 600, color: 'text2' }, // .amtbox .v
  screenTitle: { size: 15, weight: 600, color: 'text1' }, // .sbar .title
  emptyTitle: { size: 14.5, weight: 500, color: 'text2' }, // .empty .et
  button: { size: 14.5, weight: 500, color: 'onBrand' }, // .btn
  input: { size: 14, weight: 400, color: 'typed' }, // .inp
  body: { size: 14, weight: 400, color: 'text2' },
  row: { size: 13.5, weight: 400, color: 'text2' }, // .lrow .n, .kv
  chip: { size: 13, weight: 400, color: 'text3' }, // .optchip
  label: { size: 12.5, weight: 400, color: 'text3' }, // .field .fl, .sec, .hero .hl
  hint: { size: 12, weight: 400, color: 'text4' }, // .hint
  sub: { size: 11.5, weight: 400, color: 'text4' }, // .lrow .s
  tab: { size: 11, weight: 400, color: 'text4' }, // .tabs div
  tag: { size: 11, weight: 500, color: 'info' }, // .tag
};

export const baseTextStyle = Platform.OS === 'android' ? { includeFontPadding: false } : {};
