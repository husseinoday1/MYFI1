import { currencyFractionDigits } from './money.js';

export const NUMBER_INPUT_FORMATS = Object.freeze({
  SYSTEM: 'system',
  DOT_DECIMAL: 'dotDecimal',
  COMMA_DECIMAL: 'commaDecimal',
  ARABIC_NATIVE: 'arabicNative',
});

const digitMap = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

const knownFormats = new Set(Object.values(NUMBER_INPUT_FORMATS));
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const asciiDigits = value => String(value || '').replace(/[٠-٩۰-۹]/g, digit => digitMap[digit] || digit);
const formatError = (reason, raw) => ({ ok: false, value: null, normalized: null, reason, raw: String(raw ?? '') });

// Resolve System from the separators the runtime reports, never from a
// language-name guess. It also makes ar-IQ-u-nu-latn correctly dot-decimal.
export const resolveSystemNumberInputFormat = (locale) => {
  try {
    const parts = new Intl.NumberFormat(locale).formatToParts(1234.56);
    const decimal = parts.find(part => part.type === 'decimal')?.value;
    const group = parts.find(part => part.type === 'group')?.value;
    if (decimal === '٫' && group === '٬') return NUMBER_INPUT_FORMATS.ARABIC_NATIVE;
    if (decimal === '.') return NUMBER_INPUT_FORMATS.DOT_DECIMAL;
    if (decimal === ',') return NUMBER_INPUT_FORMATS.COMMA_DECIMAL;
  } catch {
    // Use the documented safe fallback below when Intl is incomplete.
  }
  return NUMBER_INPUT_FORMATS.DOT_DECIMAL;
};

export const resolveNumberInputFormat = (format = NUMBER_INPUT_FORMATS.SYSTEM, locale) => {
  const requested = knownFormats.has(format) ? format : NUMBER_INPUT_FORMATS.SYSTEM;
  return requested === NUMBER_INPUT_FORMATS.SYSTEM
    ? resolveSystemNumberInputFormat(locale)
    : requested;
};

const separatorsFor = format => {
  if (format === NUMBER_INPUT_FORMATS.COMMA_DECIMAL) return { decimal: ',', group: '.' };
  if (format === NUMBER_INPUT_FORMATS.ARABIC_NATIVE) return { decimal: '٫', group: '٬' };
  return { decimal: '.', group: ',' };
};

const resolveDigits = ({ currency, fractionDigits }) => (
  Number.isInteger(fractionDigits) && fractionDigits >= 0
    ? fractionDigits
    : currency ? currencyFractionDigits(currency) : null
);

const validateInteger = (integer, group) => {
  if (!integer) return { ok: true, digits: '0' };
  if (!integer.includes(group)) return /^\d+$/.test(integer) ? { ok: true, digits: integer } : { ok: false };
  const chunks = integer.split(group);
  if (!chunks.length || !/^\d{1,3}$/.test(chunks[0]) || chunks.slice(1).some(chunk => !/^\d{3}$/.test(chunk))) return { ok: false };
  return { ok: true, digits: chunks.join('') };
};

const parseWithSeparators = ({ raw, decimal, group, fractionDigits, allowNegative }) => {
  const compact = String(raw).replace(/[\s\u00A0\u202F'_]/g, '');
  if (!compact) return formatError('empty', raw);
  const negative = compact.startsWith('-');
  const unsigned = negative ? compact.slice(1) : compact;
  if ((negative && !allowNegative) || unsigned.includes('-')) return formatError('invalid_sign', raw);
  if (!unsigned) return formatError('empty', raw);
  if ([...unsigned].some(char => !(/[0-9٠-٩۰-۹]/.test(char) || char === decimal || char === group))) return formatError('invalid_character', raw);

  const decimalParts = unsigned.split(decimal);
  if (decimalParts.length > 2) return formatError('invalid_separator', raw);
  const [integerRaw, fractionRaw] = decimalParts;
  if (fractionRaw !== undefined && !fractionRaw) return formatError('invalid_fraction', raw);
  if (fractionRaw !== undefined && fractionRaw.includes(group)) return formatError('invalid_separator', raw);
  const integer = asciiDigits(integerRaw);
  const fraction = fractionRaw === undefined ? '' : asciiDigits(fractionRaw);
  const checkedInteger = validateInteger(integer, group);
  if (!checkedInteger.ok) return formatError('invalid_grouping', raw);
  if (fraction && !/^\d+$/.test(fraction)) return formatError('invalid_character', raw);
  if (fractionDigits !== null && fraction.length > fractionDigits) return formatError('too_many_fraction_digits', raw);
  const normalized = `${negative ? '-' : ''}${checkedInteger.digits}${fractionRaw === undefined ? '' : `.${fraction}`}`;
  const value = Number(normalized);
  if (!Number.isFinite(value) || !Number.isSafeInteger(Number(checkIntegerPart(normalized)))) return formatError('out_of_range', raw);
  return { ok: true, value, normalized, reason: null, raw: String(raw) };
};

// A decimal amount can be fractional, but the stored integer part must remain
// representable exactly before it becomes a JavaScript Number.
const checkIntegerPart = normalized => String(normalized).replace(/^-/, '').split('.')[0] || '0';

/**
 * Parses a financial amount without guessing separator meaning. The caller
 * receives an explicit result and must block saving when ok is false.
 */
export const parseMoneyInput = (value, {
  format = NUMBER_INPUT_FORMATS.SYSTEM,
  locale,
  currency,
  fractionDigits,
  allowNegative = true,
} = {}) => {
  const raw = String(value ?? '');
  if (!raw.trim()) return formatError('empty', raw);
  const resolved = resolveNumberInputFormat(format, locale);
  const containsArabicSeparators = /[٫٬]/.test(raw);
  const containsLatinSeparators = /[.,]/.test(raw);

  // Arabic separator glyphs have explicit meaning in every profile. A string
  // may use Arabic digits or Latin digits with them, but never two grammars.
  if (containsArabicSeparators) {
    if (containsLatinSeparators) return formatError('invalid_separator', raw);
    return parseWithSeparators({
      raw,
      ...separatorsFor(NUMBER_INPUT_FORMATS.ARABIC_NATIVE),
      fractionDigits: resolveDigits({ currency, fractionDigits }),
      allowNegative,
    });
  }
  if (resolved === NUMBER_INPUT_FORMATS.ARABIC_NATIVE && containsLatinSeparators) {
    return formatError('invalid_separator', raw);
  }
  return parseWithSeparators({
    raw,
    ...separatorsFor(resolved),
    fractionDigits: resolveDigits({ currency, fractionDigits }),
    allowNegative,
  });
};

// Compatibility helpers keep legacy callers from silently receiving zero.
// NaN fails Number.isFinite and ordinary amount guards instead of becoming 0.
export const normalizeNumberInput = (value, options = {}) => {
  const parsed = parseMoneyInput(value, options);
  return parsed.ok ? parsed.normalized : '';
};

export const parseNumberInput = (value, options = {}) => {
  const parsed = parseMoneyInput(value, options);
  return parsed.ok ? parsed.value : Number.NaN;
};

// Text inputs must preserve the user's draft. Validation and canonicalization
// happen on blur/save through parseMoneyInput, never while a separator is
// still being typed.
export const preserveNumberInputDraft = value => String(value ?? '');

export const formatNumberInput = (value, {
  decimals = 2,
  allowNegative = false,
  format = NUMBER_INPUT_FORMATS.SYSTEM,
  locale,
} = {}) => {
  const parsed = parseMoneyInput(value, { format, locale, fractionDigits: decimals, allowNegative });
  if (!parsed.ok) return '';
  const { decimal, group } = separatorsFor(resolveNumberInputFormat(format, locale));
  const negative = allowNegative && parsed.normalized.startsWith('-');
  const [integer = '0', fraction = ''] = parsed.normalized.replace(/^-/, '').split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  return `${negative ? '-' : ''}${grouped}${fraction ? `${decimal}${fraction}` : ''}`;
};
