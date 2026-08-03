const THREE_DECIMAL = new Set(['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND']);
const ZERO_DECIMAL = new Set(['CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF']);

export const currencyFractionDigits = (currency = 'IQD') => {
  const code = String(currency || 'IQD').toUpperCase();
  if (THREE_DECIMAL.has(code)) return 3;
  if (ZERO_DECIMAL.has(code)) return 0;
  return 2;
};

export const roundCurrency = (value, currency = 'IQD') => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  const factor = 10 ** currencyFractionDigits(currency);
  return Math.round((amount + Number.EPSILON) * factor) / factor;
};

export const formatMoneyNumber = (
  value,
  currency = 'IQD',
  lang = 'ar',
  { absolute = true } = {},
) => {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  const normalized = absolute ? Math.abs(safe) : safe;
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', {
    useGrouping: true,
    minimumFractionDigits: 0,
    maximumFractionDigits: currencyFractionDigits(currency),
  }).format(normalized);
};
