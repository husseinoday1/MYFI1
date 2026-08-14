const ARABIC_RE = /[\u0600-\u06FF]/;

const normalizeArabic = (value = '') => String(value)
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
  .replace(/\u0640/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ؤ/g, 'و')
  .replace(/ئ/g, 'ي')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه');

const normalizeToken = (value = '') => normalizeArabic(String(value).toLowerCase())
  .replace(/[^\p{L}\p{N}.]+/gu, '')
  .trim();

const UNIT_VALUES = new Map(Object.entries({
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,

  صفر: 0,
  واحد: 1, واحده: 1, احد: 1,
  اثنين: 2, اثنان: 2, اثنتين: 2, اثنتان: 2, ثنين: 2,
  ثلاث: 3, ثلاثه: 3,
  اربع: 4, اربعه: 4,
  خمس: 5, خمسه: 5,
  ست: 6, سته: 6,
  سبع: 7, سبعه: 7,
  ثمان: 8, ثمانيه: 8, ثمن: 8, ثمنيه: 8,
  تسع: 9, تسعه: 9,
  عشر: 10, عشره: 10,
  احدعش: 11, احدعشر: 11,
  اثنعش: 12, اثناعش: 12, اثنعشر: 12,
  ثلاثطعش: 13, ثلاثتعش: 13,
  اربعطعش: 14, اربعتعش: 14,
  خمسطعش: 15, خمستعش: 15,
  ستطعش: 16, ستتعش: 16,
  سبعطعش: 17, سبعتعش: 17,
  ثمنطعش: 18, ثمنتعش: 18, ثمانطعش: 18,
  تسعطعش: 19, تسعتعش: 19,
  عشرين: 20, ثلاثين: 30, اربعين: 40, خمسين: 50,
  ستين: 60, سبعين: 70, ثمانين: 80, تسعين: 90,

  ميتين: 200, مئتين: 200, مائتين: 200, ميتان: 200, مئتان: 200,
  ثلاثميه: 300, ثلاثمئه: 300,
  اربعمية: 400, اربعمئه: 400, اربعميه: 400,
  خمسميه: 500, خمسمئه: 500,
  ستميه: 600, ستمئه: 600,
  سبعميه: 700, سبعمئه: 700,
  ثمانميه: 800, ثمانمئه: 800, ثمنميه: 800,
  تسعميه: 900, تسعمئه: 900,
}));

const HUNDRED_TOKENS = new Set(['hundred', 'ميه', 'مئه', 'مايه', 'مائه']);
const SCALE_VALUES = new Map(Object.entries({
  thousand: 1_000,
  million: 1_000_000,
  billion: 1_000_000_000,
  الف: 1_000,
  الاف: 1_000,
  تالاف: 1_000,
  تلاف: 1_000,
  مليون: 1_000_000,
  ملايين: 1_000_000,
  مليار: 1_000_000_000,
  مليارات: 1_000_000_000,
}));
const DUAL_SCALES = new Map(Object.entries({
  الفين: { value: 2_000, base: 1_000 },
  مليونين: { value: 2_000_000, base: 1_000_000 },
  مليارين: { value: 2_000_000_000, base: 1_000_000_000 },
}));

const CONNECTORS = new Set(['and', 'a', 'و']);
const EXCEPT_TOKENS = new Set(['الا', 'ناقص', 'minus', 'less']);
const DECIMAL_TOKENS = new Set(['point', 'فاصله', 'فاصل']);
const FRACTION_VALUES = new Map(Object.entries({
  half: 0.5,
  halves: 0.5,
  نصف: 0.5,
  نص: 0.5,
  quarter: 0.25,
  quarters: 0.25,
  ربع: 0.25,
  third: 1 / 3,
  thirds: 1 / 3,
  ثلث: 1 / 3,
  ثلثين: 2 / 3,
}));

const CURRENCY_WORDS = new Set([
  'دينار', 'دنانير', 'دولار', 'دولارات', 'ريال', 'ريالات', 'درهم', 'دراهم',
  'iqd', 'usd', 'eur', 'sar', 'aed', 'dinar', 'dinars', 'dollar', 'dollars',
  'euro', 'euros', 'riyal', 'dirham',
]);

const ACTION_WORDS = new Set([
  'دفعت', 'دفع', 'صرفت', 'صرف', 'اشتريت', 'شراء', 'شريت', 'سددت', 'حولت', 'ارسلت', 'ارسل',
  'استلمت', 'استلام', 'قبضت', 'دخل', 'راتب', 'اودعت', 'ايداع', 'سحبت', 'سحب',
  'paid', 'pay', 'spent', 'spend', 'bought', 'buy', 'sent', 'send', 'transferred', 'transfer',
  'received', 'receive', 'salary', 'deposited', 'deposit', 'withdrew', 'withdraw',
]);

const AMOUNT_WORDS = new Set([
  'مبلغ', 'المبلغ', 'المجموع', 'الاجمالي', 'الصافي', 'المستحق',
  'amount', 'total', 'due', 'paid',
]);

const IDENTIFIER_WORDS = new Set([
  'رقم', 'طلب', 'الطلب', 'فاتوره', 'الفاتوره', 'شيك', 'صك', 'مرجع', 'المرجع',
  'عمليه', 'العمليه', 'معامله', 'المعامله', 'باركود', 'صنف', 'ماده', 'منتج',
  'order', 'invoice', 'check', 'cheque', 'reference', 'ref', 'transaction', 'barcode', 'sku', 'item', 'product',
]);

const phraseReplacements = [
  [/\bone hundred and\b/g, 'one hundred '],
  [/احد\s+عشر/g, 'احدعش'],
  [/اثنا\s+عشر/g, 'اثنعش'],
  [/اثني\s+عشر/g, 'اثنعش'],
];

const isCoreNumericToken = token => (
  UNIT_VALUES.has(token)
  || HUNDRED_TOKENS.has(token)
  || SCALE_VALUES.has(token)
  || DUAL_SCALES.has(token)
  || FRACTION_VALUES.has(token)
  || CONNECTORS.has(token)
  || EXCEPT_TOKENS.has(token)
  || DECIMAL_TOKENS.has(token)
  || /^\d+(?:\.\d+)?$/.test(token)
  || token === 'ارباع'
  || token === 'quarters'
);

const splitArabicNumericClitic = token => {
  if (!token || token.length <= 1) return [token];

  // Iraqi/Arabic price phrases frequently attach "بـ" directly to the amount:
  // بألف، بمليون، بخمسمية، ب500.  Keep the preposition out of the numeric phrase.
  if (token.startsWith('ب') && isCoreNumericToken(token.slice(1))) {
    return ['ب', token.slice(1)];
  }

  // Combined conjunction + price preposition: وبألف / وب500.
  if (token.startsWith('وب') && token.length > 2 && isCoreNumericToken(token.slice(2))) {
    return ['و', 'ب', token.slice(2)];
  }

  return [token];
};

const tokenize = (input = '') => {
  let source = normalizeArabic(String(input).toLowerCase()).replace(/[-–—]/g, ' ');
  phraseReplacements.forEach(([pattern, replacement]) => {
    source = source.replace(pattern, replacement);
  });

  const raw = source
    .replace(/[،,;:!?()[\]{}"']/g, ' ')
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);

  const expanded = [];
  raw.forEach(token => {
    const cliticParts = splitArabicNumericClitic(token);
    cliticParts.forEach(part => {
      if (
        part.length > 1
        && part.startsWith('و')
        && isCoreNumericToken(part.slice(1))
      ) {
        expanded.push('و', part.slice(1));
      } else {
        expanded.push(part);
      }
    });
  });
  return expanded;
};

const stripConnectors = tokens => {
  const next = [...tokens];
  while (next.length && CONNECTORS.has(next[0])) next.shift();
  while (next.length && CONNECTORS.has(next[next.length - 1])) next.pop();
  return next;
};

const tokenNumber = token => {
  if (/^\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return UNIT_VALUES.has(token) ? UNIT_VALUES.get(token) : null;
};

const parseCardinalTokens = tokens => {
  const clean = stripConnectors(tokens);
  if (!clean.length) return null;

  let total = 0;
  let current = 0;
  let seen = false;

  for (const token of clean) {
    if (CONNECTORS.has(token)) continue;

    const direct = tokenNumber(token);
    if (direct !== null) {
      current += direct;
      seen = true;
      continue;
    }

    if (HUNDRED_TOKENS.has(token)) {
      current = (current || 1) * 100;
      seen = true;
      continue;
    }

    if (DUAL_SCALES.has(token)) {
      const meta = DUAL_SCALES.get(token);
      total += meta.value;
      current = 0;
      seen = true;
      continue;
    }

    if (SCALE_VALUES.has(token)) {
      const scale = SCALE_VALUES.get(token);
      total += (current || 1) * scale;
      current = 0;
      seen = true;
      continue;
    }

    return null;
  }

  return seen ? total + current : null;
};

const scaleHint = tokens => {
  let last = 1;
  tokens.forEach(token => {
    if (SCALE_VALUES.has(token)) last = SCALE_VALUES.get(token);
    if (DUAL_SCALES.has(token)) last = DUAL_SCALES.get(token).base;
  });
  return last;
};

const fractionAt = (tokens, index) => {
  const token = tokens[index];
  if (FRACTION_VALUES.has(token)) {
    return { value: FRACTION_VALUES.get(token), length: 1 };
  }

  if (
    index + 1 < tokens.length
    && ['three', 'ثلاث', 'ثلاثه'].includes(token)
    && ['quarters', 'ارباع'].includes(tokens[index + 1])
  ) {
    return { value: 0.75, length: 2 };
  }

  if (
    index + 1 < tokens.length
    && ['two', 'اثنين', 'اثنان', 'ثنين'].includes(token)
    && ['thirds', 'اثلاث'].includes(tokens[index + 1])
  ) {
    return { value: 2 / 3, length: 2 };
  }

  return null;
};

const decimalDigit = token => {
  const value = tokenNumber(token);
  if (value === null || value < 0 || value > 9 || !Number.isInteger(value)) return null;
  return value;
};

export const parseSpokenNumberPhrase = (phrase = '') => {
  const tokens = tokenize(phrase);
  if (!tokens.length) return null;

  const exceptIndex = tokens.findIndex(token => EXCEPT_TOKENS.has(token));
  if (exceptIndex > 0 && exceptIndex < tokens.length - 1) {
    const leftTokens = stripConnectors(tokens.slice(0, exceptIndex));
    const rightTokens = stripConnectors(tokens.slice(exceptIndex + 1));
    const left = parseCardinalTokens(leftTokens);
    if (left !== null) {
      const fraction = fractionAt(rightTokens, 0);
      if (fraction && fraction.length === rightTokens.length) {
        const basis = Math.max(1, scaleHint(leftTokens));
        return Math.max(0, left - (fraction.value * basis));
      }
      const right = parseCardinalTokens(rightTokens);
      if (right !== null) return Math.max(0, left - right);
    }
  }

  const decimalIndex = tokens.findIndex(token => DECIMAL_TOKENS.has(token));
  if (decimalIndex > 0 && decimalIndex < tokens.length - 1) {
    const leftTokens = stripConnectors(tokens.slice(0, decimalIndex));
    let rightTokens = stripConnectors(tokens.slice(decimalIndex + 1));
    let multiplier = 1;

    if (rightTokens.length && SCALE_VALUES.has(rightTokens[rightTokens.length - 1])) {
      multiplier = SCALE_VALUES.get(rightTokens[rightTokens.length - 1]);
      rightTokens = rightTokens.slice(0, -1);
    }

    const left = parseCardinalTokens(leftTokens);
    const digits = rightTokens.map(decimalDigit);
    if (left !== null && digits.length && digits.every(value => value !== null)) {
      const decimal = Number(`0.${digits.join('')}`);
      return (left + decimal) * multiplier;
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const fraction = fractionAt(tokens, index);
    if (!fraction) continue;

    const before = stripConnectors(tokens.slice(0, index));
    const after = stripConnectors(tokens.slice(index + fraction.length));

    if (after.length) {
      const afterValue = parseCardinalTokens(after);
      const afterScale = scaleHint(after);
      const afterIsPureScale = after.every(token => (
        SCALE_VALUES.has(token) || DUAL_SCALES.has(token) || CONNECTORS.has(token)
      ));

      if (afterIsPureScale && afterValue !== null) {
        const beforeValue = before.length ? parseCardinalTokens(before) : 0;
        if (beforeValue !== null) {
          const scale = Math.max(afterScale, afterValue);
          return (beforeValue + fraction.value) * scale;
        }
      }
    }

    const beforeValue = before.length ? parseCardinalTokens(before) : 0;
    if (beforeValue !== null) {
      const basis = Math.max(1, scaleHint(before));
      if (!after.length) return beforeValue + (fraction.value * basis);
    }
  }

  return parseCardinalTokens(tokens);
};

const candidateContextScore = (tokens, start, end) => {
  const before = tokens.slice(Math.max(0, start - 5), start);
  const after = tokens.slice(end + 1, Math.min(tokens.length, end + 6));
  const nearby = [...before, ...after];

  let score = 0;
  if (nearby.some(token => CURRENCY_WORDS.has(token))) score += 90;
  if (nearby.some(token => ACTION_WORDS.has(token))) score += 55;
  if (nearby.some(token => AMOUNT_WORDS.has(token))) score += 90;
  // Iraqi/Arabic price construction: بألف، ب500، بمليون...
  if (before.slice(-2).includes('ب')) score += 55;

  const identifierBefore = before.slice(-2).some(token => IDENTIFIER_WORDS.has(token));
  const identifierAfter = after.slice(0, 1).some(token => IDENTIFIER_WORDS.has(token));
  if (identifierBefore || identifierAfter) score -= 160;

  return score;
};

export const extractSpokenNumberCandidates = (text = '') => {
  const tokens = tokenize(text);
  const results = [];

  let index = 0;
  while (index < tokens.length) {
    if (!isCoreNumericToken(tokens[index]) || CONNECTORS.has(tokens[index])) {
      index += 1;
      continue;
    }

    let end = index;
    while (end + 1 < tokens.length && isCoreNumericToken(tokens[end + 1])) end += 1;

    const phraseTokens = tokens.slice(index, end + 1);
    const value = parseSpokenNumberPhrase(phraseTokens.join(' '));
    if (Number.isFinite(value) && value > 0) {
      results.push({
        value,
        phrase: phraseTokens.join(' '),
        start: index,
        end,
        score: candidateContextScore(tokens, index, end)
          + (scaleHint(phraseTokens) >= 1_000 ? 10 : 0),
      });
    }

    index = end + 1;
  }

  return results;
};

export const parseSpokenFinancialAmount = (text = '') => {
  const candidates = extractSpokenNumberCandidates(text)
    .filter(item => item.score >= 30)
    .sort((a, b) => b.score - a.score || b.value - a.value);

  if (!candidates.length) return null;
  if (
    candidates.length > 1
    && candidates[0].score === candidates[1].score
    && candidates[0].value !== candidates[1].value
  ) {
    return null;
  }

  return candidates[0];
};

const hasSpokenNumberWords = (text = '') => {
  const tokens = tokenize(text);
  return tokens.some(token => (
    (
      UNIT_VALUES.has(token)
      && !/^\d+(?:\.\d+)?$/.test(token)
    )
    || HUNDRED_TOKENS.has(token)
    || SCALE_VALUES.has(token)
    || DUAL_SCALES.has(token)
    || FRACTION_VALUES.has(token)
    || EXCEPT_TOKENS.has(token)
    || DECIMAL_TOKENS.has(token)
    || token === 'ارباع'
    || token === 'quarters'
  ));
};

export const appendSpokenAmountHint = (text = '') => {
  const raw = String(text || '').trim();
  if (!raw) return raw;

  // Critical separation of concerns:
  // digit-formatted values such as 75,000 IQD / 13,200.000 IQD are handled by
  // smartEntry's currency-aware numeric parser.  The spoken parser is allowed
  // to add a hint only when the source actually contains number WORDS/fractions.
  if (!hasSpokenNumberWords(raw)) return raw;

  const spoken = parseSpokenFinancialAmount(raw);
  if (!spoken?.value) return raw;
  return `${raw}\nSPOKEN_AMOUNT: ${spoken.value}`;
};

export const looksArabicSpeech = (text = '') => ARABIC_RE.test(String(text || ''));
