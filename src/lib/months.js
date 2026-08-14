const AR_LONG = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const AR_SHORT = ['ك2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت1', 'ت2', 'ك1'];
const EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const MONTH_NAME_STYLES = ['system', 'numeric', 'arabic', 'english'];

export const normalizeMonthNameStyle = (value) => (
  MONTH_NAME_STYLES.includes(value) ? value : 'system'
);

const systemLocale = () => {
  try {
    return Intl?.DateTimeFormat?.().resolvedOptions?.().locale || undefined;
  } catch {
    return undefined;
  }
};

const systemUsesArabic = () => String(systemLocale() || '').toLowerCase().startsWith('ar');

const systemMonth = (monthIndex, length = 'short') => {
  try {
    const date = new Date(2026, monthIndex, 1, 12, 0, 0);
    return new Intl.DateTimeFormat(undefined, {
      month: length === 'long' ? 'long' : 'short',
    }).format(date);
  } catch {
    return String(monthIndex + 1).padStart(2, '0');
  }
};

export const monthStyleLabel = (style = 'system', lang = 'ar') => {
  const ar = lang === 'ar';
  if (style === 'system') return ar ? 'حسب الجهاز' : 'Follow device';
  if (style === 'arabic') return ar ? 'عربي' : 'Arabic';
  if (style === 'english') return 'English';
  return ar ? 'أرقام' : 'Numbers';
};

export const monthName = (monthIndex, { style = 'system', length = 'short', svgSafe = false } = {}) => {
  const safeIndex = Math.max(0, Math.min(11, Number(monthIndex) || 0));
  const safeStyle = normalizeMonthNameStyle(style);

  if (safeStyle === 'system') {
    if (svgSafe && systemUsesArabic()) return String(safeIndex + 1).padStart(2, '0');
    return systemMonth(safeIndex, length);
  }

  if (safeStyle === 'numeric' || (svgSafe && safeStyle === 'arabic')) {
    return String(safeIndex + 1).padStart(2, '0');
  }
  if (safeStyle === 'english') return (length === 'long' ? EN_LONG : EN_SHORT)[safeIndex];
  return (length === 'long' ? AR_LONG : AR_SHORT)[safeIndex];
};

export const monthNames = ({ style = 'system', length = 'long', svgSafe = false } = {}) => (
  Array.from({ length: 12 }, (_, index) => monthName(index, { style, length, svgSafe }))
);

export const formatMonthLabel = (year, monthIndex, { style = 'system', length = 'short', includeYear = true, svgSafe = false } = {}) => {
  const safeStyle = normalizeMonthNameStyle(style);

  if (safeStyle === 'system' && !(svgSafe && systemUsesArabic())) {
    try {
      const date = new Date(Number(year), Number(monthIndex), 1, 12, 0, 0);
      return new Intl.DateTimeFormat(undefined, {
        month: length === 'long' ? 'long' : 'short',
        ...(includeYear ? { year: 'numeric' } : {}),
      }).format(date);
    } catch {
      // Fall through to the stable numeric representation.
    }
  }

  const month = monthName(monthIndex, { style: safeStyle, length, svgSafe });
  if (!includeYear) return month;
  if (
    safeStyle === 'numeric'
    || (svgSafe && safeStyle === 'arabic')
    || (svgSafe && safeStyle === 'system' && systemUsesArabic())
  ) {
    return `${String(monthIndex + 1).padStart(2, '0')}/${year}`;
  }
  return `${month} ${year}`;
};
