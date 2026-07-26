// نظام تصميم موحد لكل الواجهة: مسافات، انحناءات، ظلال، أوزان خط Cairo.
// أي ملف جديد أو معدّل يستورد من هنا بدل أرقام حرة متفرقة بكل شاشة.

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 20,
  xxl: 28,
  pill: 999,
};

// ظل حقيقي بنفس الخاصية: iOS يقرأ shadow*، أندرويد يقرأ elevation ويتجاهل الباقي.
// none: بدون عمق · e1: كارد عادي · e2: مودال/شيت/نافبار عائم · e3: FAB وعنصر رئيسي عائم
const shadow = (opacity, radius, offsetY, elevation) => ({
  shadowColor: '#000',
  shadowOpacity: opacity,
  shadowRadius: radius,
  shadowOffset: { width: 0, height: offsetY },
  elevation,
});

export const ELEVATION = {
  none: shadow(0, 0, 0, 0),
  e1: shadow(0.06, 6, 2, 2),
  e2: shadow(0.12, 14, 6, 8),
  e3: shadow(0.30, 8, 4, 24), // نفس قيم DraggableFab الأصلية، موحّدة بمكان وحد
};

// أوزان خط Cairo — تُحمّل بـ App.js عبر @expo-google-fonts/cairo
export const FONT = {
  light: 'Cairo_300Light',
  regular: 'Cairo_400Regular',
  medium: 'Cairo_500Medium',
  semibold: 'Cairo_600SemiBold',
  bold: 'Cairo_700Bold',
  extrabold: 'Cairo_800ExtraBold',
  black: 'Cairo_900Black',
};

const WEIGHT_MAP = {
  '300': FONT.light,     light: FONT.light,
  '400': FONT.regular,   normal: FONT.regular,
  '500': FONT.medium,
  '600': FONT.semibold,
  '700': FONT.bold,      bold: FONT.bold,
  '800': FONT.extrabold,
  '900': FONT.black,
};

// بديل fontWeight: ...weight('900') بدل fontWeight:'900'
// خط ثابت الوزن (static) — fontWeight العادي ينكسر معه، كل وزن ملف/fontFamily لحاله.
export const weight = (w = '400') => ({ fontFamily: WEIGHT_MAP[String(w)] || FONT.regular });
