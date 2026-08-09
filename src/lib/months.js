const AR_LONG = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول'];
const AR_SHORT = ['ك2', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'ت1', 'ت2', 'ك1'];
const EN_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EN_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const MONTH_NAME_STYLES = ['numeric', 'arabic', 'english'];

export const normalizeMonthNameStyle = (value) => (
  MONTH_NAME_STYLES.includes(value) ? value : 'numeric'
);

export const monthStyleLabel = (style = 'numeric', lang = 'ar') => {
  const ar = lang === 'ar';
  if (style === 'arabic') return ar ? 'عربي' : 'Arabic';
  if (style === 'english') return 'English';
  return ar ? 'أرقام' : 'Numbers';
};

export const monthName = (monthIndex, { style = 'numeric', length = 'short', svgSafe = false } = {}) => {
  const safeIndex = Math.max(0, Math.min(11, Number(monthIndex) || 0));
  const safeStyle = normalizeMonthNameStyle(style);
  if (safeStyle === 'numeric' || (svgSafe && safeStyle === 'arabic')) {
    return String(safeIndex + 1).padStart(2, '0');
  }
  if (safeStyle === 'english') return (length === 'long' ? EN_LONG : EN_SHORT)[safeIndex];
  return (length === 'long' ? AR_LONG : AR_SHORT)[safeIndex];
};

export const monthNames = ({ style = 'numeric', length = 'long', svgSafe = false } = {}) => (
  Array.from({ length: 12 }, (_, index) => monthName(index, { style, length, svgSafe }))
);

export const formatMonthLabel = (year, monthIndex, { style = 'numeric', length = 'short', includeYear = true, svgSafe = false } = {}) => {
  const month = monthName(monthIndex, { style, length, svgSafe });
  if (!includeYear) return month;
  if (normalizeMonthNameStyle(style) === 'numeric' || (svgSafe && normalizeMonthNameStyle(style) === 'arabic')) {
    return `${String(monthIndex + 1).padStart(2, '0')}/${year}`;
  }
  return `${month} ${year}`;
};
