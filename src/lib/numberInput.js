const arabicDigits = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

export const normalizeNumberInput = (value) => {
  const normalized = String(value ?? '')
    .replace(/[٠-٩۰-۹]/g, digit => arabicDigits[digit] || digit)
    .replace(/[٬،\s]/g, '')
    .replace(/٫/g, '.')
    .replace(/,/g, '');
  const firstDot = normalized.indexOf('.');
  const singleDecimal = firstDot < 0
    ? normalized
    : `${normalized.slice(0, firstDot + 1)}${normalized.slice(firstDot + 1).replace(/\./g, '')}`;
  return singleDecimal.replace(/[^0-9.-]/g, '');
};

export const parseNumberInput = (value) => {
  const parsed = Number(normalizeNumberInput(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatNumberInput = (value, { decimals = 2, allowNegative = false } = {}) => {
  const normalized = normalizeNumberInput(value);
  if (!normalized) return '';

  const negative = allowNegative && normalized.startsWith('-');
  const unsigned = normalized.replace(/-/g, '');
  const hasDecimal = unsigned.includes('.');
  const [rawInteger = '', rawFraction = ''] = unsigned.split('.');
  const integerDigits = rawInteger.replace(/\D/g, '');
  const fractionDigits = rawFraction.replace(/\D/g, '').slice(0, Math.max(0, decimals));
  const grouped = (integerDigits || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = hasDecimal && decimals > 0 ? `.${fractionDigits}` : '';
  return `${negative ? '-' : ''}${grouped}${fraction}`;
};
