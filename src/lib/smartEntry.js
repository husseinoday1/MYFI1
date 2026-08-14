import { suggestCategoryFromHistory } from './localIntelligence';
import { getWalletLabel } from './wallets';
import { appendSpokenAmountHint } from './spokenNumbers';

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./,:+\-]/gu, ' ')
    .replace(/\s+/g, ' ');

const toLatinDigits = (value = '') =>
  String(value)
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0));

const keywordMap = {
  food: ['اكل', 'أكل', 'طعام', 'مطعم', 'قهوة', 'كافي', 'غداء', 'عشاء', 'فطور', 'food', 'coffee', 'cafe', 'restaurant'],
  rent: ['ايجار', 'إيجار', 'اجار', 'أجار', 'rent', 'house', 'home'],
  salary: ['راتب', 'معاش', 'دخل', 'salary', 'income', 'payroll'],
  transport: ['تكسي', 'تاكسي', 'بنزين', 'وقود', 'مواصلات', 'transport', 'taxi', 'fuel', 'gas'],
  health: ['صيدلية', 'طبيب', 'دواء', 'علاج', 'health', 'doctor', 'pharmacy'],
  clothes: ['ملابس', 'حذاء', 'clothes', 'shirt', 'shoe'],
  entertain: ['ترفيه', 'سينما', 'لعبة', 'اشتراك', 'netflix', 'game', 'cinema'],
};

const incomeWords = ['راتب', 'دخل', 'استلام', 'تحصيل', 'ايراد', 'إيراد', 'salary', 'income', 'received', 'revenue'];
const expenseWords = ['صرف', 'دفعت', 'دفع', 'شراء', 'اشتريت', 'قهوة', 'اكل', 'أكل', 'paid', 'buy', 'bought'];

const strongTotalWords = [
  'grand total', 'total due', 'amount due', 'final total', 'net total', 'balance due',
  'payable', 'total payable', 'spoken_amount',
  'الإجمالي النهائي', 'الاجمالي النهائي', 'المبلغ المستحق', 'المطلوب دفعه',
  'صافي المبلغ', 'الصافي', 'المجموع النهائي',
];

const totalWords = [
  'total', 'amount', 'الإجمالي', 'الاجمالي', 'المجموع', 'مجموع', 'المطلوب', 'المستحق',
];

const nonFinalAmountWords = [
  'subtotal', 'sub total', 'tax', 'vat', 'discount', 'change',
  'cash tendered', 'cash received', 'amount tendered', 'amount received',
  'tip', 'service', 'shipping', 'delivery fee',
  'المجموع الفرعي', 'قبل الخصم', 'الضريبة', 'ضريبة', 'خصم', 'الباقي',
  'نقد مستلم', 'نقد مدفوع', 'المبلغ المستلم', 'المبلغ المدفوع',
  'خدمة', 'توصيل',
];

const identifierWords = [
  'order', 'order no', 'order number', 'invoice', 'invoice no', 'receipt no',
  'check no', 'cheque no', 'check number', 'cheque number', 'reference', 'ref no',
  'transaction id', 'transaction no', 'terminal', 'auth', 'authorization', 'batch',
  'sku', 'barcode', 'item no', 'product no', 'serial',
  'رقم الطلب', 'طلب رقم', 'رقم الفاتورة', 'فاتورة رقم', 'رقم الايصال', 'رقم الإيصال',
  'رقم الشيك', 'رقم الصك', 'رقم المرجع', 'رقم العملية', 'رقم المعاملة',
  'رقم الجهاز', 'رقم التفويض', 'باركود', 'رقم الصنف', 'رقم المادة', 'رقم المنتج',
];

const quantityWords = [
  'qty', 'quantity', 'unit', 'unit price', 'price each',
  'كمية', 'الكمية', 'عدد', 'سعر الوحدة',
];

const structuredCategoryIds = new Set(['food', 'transport', 'rent', 'health', 'clothes', 'entertainment', 'other', 'salary']);

const structuredField = (raw = '', field = '') => {
  const match = String(raw).match(new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`, 'im'));
  return String(match?.[1] || '').trim();
};

const CURRENCY_MINOR_DIGITS = {
  IQD: 3,
  KWD: 3,
  BHD: 3,
  JOD: 3,
  OMR: 3,
  TND: 3,
  LYD: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
  SAR: 2,
  AED: 2,
  QAR: 2,
  EGP: 2,
  TRY: 2,
  JPY: 0,
  KRW: 0,
};

const detectCurrencyCode = (line = '') => {
  const upper = String(line || '').toUpperCase();
  const direct = Object.keys(CURRENCY_MINOR_DIGITS).find(code => (
    new RegExp(`\\b${code}\\b`, 'i').test(upper)
  ));
  if (direct) return direct;

  if (/د\.?\s*ع|دينار\s*عراقي/i.test(line)) return 'IQD';
  if (/دولار/i.test(line)) return 'USD';
  if (/يورو/i.test(line)) return 'EUR';
  if (/ريال\s*سعودي/i.test(line)) return 'SAR';
  if (/درهم\s*اماراتي|درهم\s*إماراتي/i.test(line)) return 'AED';
  return null;
};

const normalizeNumericSeparators = (value = '') => (
  toLatinDigits(value)
    .replace(/\u066B/g, '.')
    .replace(/\u066C/g, ',')
    .replace(/\u060C/g, ',')
    .replace(/[\s']/g, '')
);

const parseNumber = (value = '', line = '') => {
  let cleaned = normalizeNumericSeparators(value).replace(/[^\d.,+\-]/g, '');
  if (!cleaned) return 0;

  const signless = cleaned.replace(/[+\-]/g, '');
  if (!signless) return 0;

  const currency = detectCurrencyCode(`${line} ${value}`);
  const minorDigits = currency ? CURRENCY_MINOR_DIGITS[currency] : null;

  const dotPositions = [...signless.matchAll(/\./g)].map(match => match.index);
  const commaPositions = [...signless.matchAll(/,/g)].map(match => match.index);
  const separators = [...dotPositions.map(index => ({ char: '.', index })), ...commaPositions.map(index => ({ char: ',', index }))]
    .sort((a, b) => a.index - b.index);

  let normalized = signless;

  if (separators.length) {
    const last = separators[separators.length - 1];
    const trailingDigits = signless.length - last.index - 1;
    const hasBothKinds = dotPositions.length > 0 && commaPositions.length > 0;
    const singleSeparatorKind = !hasBothKinds
      ? (dotPositions.length ? '.' : ',')
      : null;
    const separatorCount = separators.length;

    let decimalSeparator = null;

    if (minorDigits === 0) {
      decimalSeparator = null;
    } else if (hasBothKinds) {
      // Mixed punctuation is the least ambiguous case:
      // 13,200.000 IQD -> dot decimal, comma thousands
      // 1,234.56 USD   -> dot decimal, comma thousands
      // 1.234,56 EUR   -> comma decimal, dot thousands
      if (minorDigits != null && trailingDigits === minorDigits) {
        decimalSeparator = last.char;
      } else if (trailingDigits > 0 && trailingDigits <= 3) {
        decimalSeparator = last.char;
      }
    } else if (currency === 'IQD' && singleSeparatorKind === '.') {
      // The Iraqi banking screenshots used by MYFI show IQD minor units with a
      // dot: 660.000 IQD = 660, not 660000.
      // Keep this rule restricted to an explicit IQD currency context.
      if (separatorCount === 1 && trailingDigits === 3) {
        decimalSeparator = '.';
      }
    } else if (currency === 'IQD' && singleSeparatorKind === ',') {
      // A lone comma in an IQD amount is treated as thousands grouping:
      // 75,000 IQD = 75000, not 75.
      // This is intentionally different from the bank's dot-decimal form.
      decimalSeparator = null;
    } else if (minorDigits != null && trailingDigits === minorDigits && separatorCount === 1) {
      decimalSeparator = last.char;
    } else if (trailingDigits > 0 && trailingDigits <= 2 && separatorCount === 1) {
      decimalSeparator = last.char;
    }

    if (decimalSeparator) {
      const decimalIndex = signless.lastIndexOf(decimalSeparator);
      const integerPart = signless.slice(0, decimalIndex).replace(/[.,]/g, '');
      const decimalPart = signless.slice(decimalIndex + 1).replace(/[.,]/g, '');
      normalized = decimalPart ? `${integerPart || '0'}.${decimalPart}` : (integerPart || '0');
    } else {
      normalized = signless.replace(/[.,]/g, '');
    }
  }

  const n = Math.abs(Number(normalized));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const numericChunks = (line = '') => (
  toLatinDigits(line).match(/[+\-]?\d[\d\s.,\u066C\u060C]*/g) || []
);

const lineHasAny = (line, words = []) => {
  const value = normalize(line);
  return words.some(word => value.includes(normalize(word)));
};

const isIdentifierLine = (line = '') => (
  lineHasAny(line, identifierWords)
  || /^[#№]\s*\d+/.test(normalize(line))
);

const amountCandidates = (raw = '') => {
  const lines = String(raw || '').split(/\r?\n/);
  return lines.flatMap((line, lineIndex) => {
    const chunks = numericChunks(line);
    if (!chunks.length) return [];

    const identifier = isIdentifierLine(line);
    const strongTotal = lineHasAny(line, strongTotalWords);
    const total = lineHasAny(line, totalWords);
    const nonFinal = lineHasAny(line, nonFinalAmountWords);
    const quantity = lineHasAny(line, quantityWords);
    const currency = /(د\.?ع|دينار|ريال|درهم|دولار|\$|iqd|sar|aed|usd|eur|€)/i.test(line);

    return chunks.map(source => {
      const amount = parseNumber(source, line);
      if (!amount) return null;

      let score = 0;
      if (strongTotal) score += 130;
      else if (total) score += 75;
      if (currency) score += 20;
      if (identifier && !strongTotal && !total) score -= 180;
      if (nonFinal && !strongTotal) score -= 110;
      if (quantity && !strongTotal && !total) score -= 65;

      return {
        amount,
        line,
        lineIndex,
        source,
        score,
        strongTotal,
        total,
        currency,
        identifier,
        nonFinal,
      };
    }).filter(Boolean);
  });
};

const parseStructuredTotal = (raw = '') => {
  const value = structuredField(raw, 'TOTAL');
  if (!value) return null;
  const candidates = amountCandidates(`TOTAL: ${value}`);
  if (!candidates.length) return null;
  const best = [...candidates].sort((a, b) => b.score - a.score || b.amount - a.amount)[0];
  return best?.amount > 0
    ? { amount: best.amount, confidence: 'structured', source: value }
    : null;
};

const pickAmount = (raw = '') => {
  const structured = parseStructuredTotal(raw);
  if (structured) return structured;

  const candidates = amountCandidates(raw)
    .filter(item => !item.identifier || item.total || item.strongTotal)
    .filter(item => !item.nonFinal || item.strongTotal);

  if (!candidates.length) return null;

  const strong = candidates
    .filter(item => item.strongTotal)
    .sort((a, b) => b.score - a.score || b.lineIndex - a.lineIndex);
  if (strong.length) {
    return { amount: strong[0].amount, confidence: 'strong_total', source: strong[0].line };
  }

  const explicitTotals = candidates
    .filter(item => item.total && item.score >= 50)
    .sort((a, b) => b.score - a.score || b.lineIndex - a.lineIndex);
  if (explicitTotals.length) {
    return { amount: explicitTotals[0].amount, confidence: 'total', source: explicitTotals[0].line };
  }

  const plausible = candidates.filter(item => item.score >= 0);
  if (plausible.length === 1) {
    return { amount: plausible[0].amount, confidence: 'single', source: plausible[0].line };
  }

  const currencyCandidates = plausible.filter(item => item.currency);
  if (currencyCandidates.length === 1) {
    return { amount: currencyCandidates[0].amount, confidence: 'currency', source: currencyCandidates[0].line };
  }

  return null;
};

const datePartsValid = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d, 12, 0, 0);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
};

const isoFromParts = (year, month, day) => (
  `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const phoneDateOrder = () => {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(new Date(2001, 10, 22));
    return parts
      .filter(part => ['day', 'month', 'year'].includes(part.type))
      .map(part => part.type);
  } catch {
    return ['day', 'month', 'year'];
  }
};

const normalizeDateCandidate = (value = '') => {
  const source = toLatinDigits(value).trim();

  let match = source.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (match && datePartsValid(match[1], match[2], match[3])) {
    return isoFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
  }

  match = source.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (!match) return null;

  const a = Number(match[1]);
  const b = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  let day;
  let month;

  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else {
    const order = phoneDateOrder();
    const dayFirst = order.indexOf('day') < order.indexOf('month');
    day = dayFirst ? a : b;
    month = dayFirst ? b : a;
  }

  return datePartsValid(year, month, day) ? isoFromParts(year, month, day) : null;
};

const detectDate = (raw = '') => {
  const structured = structuredField(raw, 'DATE');
  const structuredISO = normalizeDateCandidate(structured);
  if (structuredISO) return { dateISO: structuredISO, confidence: 'structured' };

  const lines = String(raw || '').split(/\r?\n/);
  const dateLine = lines.find(line => /\bdate\b|التاريخ|تاريخ/i.test(line));
  const labeledISO = normalizeDateCandidate(dateLine || '');
  if (labeledISO) return { dateISO: labeledISO, confidence: 'labeled' };

  for (const line of lines) {
    if (isIdentifierLine(line)) continue;
    const parsed = normalizeDateCandidate(line);
    if (parsed) return { dateISO: parsed, confidence: 'visible' };
  }

  return { dateISO: null, confidence: 'none' };
};

const detectCategory = (source, cats = [], history = []) => {
  const normalized = normalize(source);
  const learned = suggestCategoryFromHistory(normalized, history);
  if (learned) return { catId: learned, confidence: 'history' };

  const labelMatch = cats.find(cat => {
    const ar = normalize(cat.label || '');
    const en = normalize(cat.labelEn || '');
    return (ar && normalized.includes(ar)) || (en && normalized.includes(en));
  });
  if (labelMatch) return { catId: labelMatch.id, confidence: 'category' };

  const keyword = Object.entries(keywordMap).find(([, words]) =>
    words.some(word => normalized.includes(normalize(word))),
  );
  if (keyword) return { catId: keyword[0], confidence: 'keyword' };

  return {
    catId: cats.find(c => c.id === 'other')?.id || cats[0]?.id || 'other',
    confidence: 'fallback',
  };
};

const detectType = (source, catId) => {
  const normalized = normalize(source);
  if (incomeWords.some(word => normalized.includes(normalize(word)))) return 'inc';
  if (expenseWords.some(word => normalized.includes(normalize(word)))) return 'exp';
  if (catId === 'salary') return 'inc';
  return 'exp';
};

const detectWallet = (source, wallets = [], lang = 'ar') => {
  const normalized = normalize(source);
  const namedWallet = wallets.find(wallet => {
    const label = normalize(getWalletLabel(wallet, lang));
    const ar = normalize(wallet.name || '');
    const en = normalize(wallet.nameEn || '');
    return (label && normalized.includes(label)) || (ar && normalized.includes(ar)) || (en && normalized.includes(en));
  });
  if (namedWallet) return namedWallet.id;

  const cardMentioned = /\b(card|visa|mastercard|master)\b/.test(normalized)
    || normalized.includes('بطاقة')
    || normalized.includes('فيزا')
    || normalized.includes('ماستر');
  if (!cardMentioned) return null;

  const cardWallets = wallets.filter(wallet => {
    const descriptor = normalize(`${wallet.type || ''} ${wallet.name || ''} ${wallet.nameEn || ''}`);
    return /\b(card|visa|mastercard|master|credit|debit)\b/.test(descriptor)
      || descriptor.includes('بطاقة')
      || descriptor.includes('فيزا')
      || descriptor.includes('ماستر');
  });
  return cardWallets.length === 1 ? cardWallets[0].id : null;
};

const cleanMerchant = (raw = '') => {
  const structured = structuredField(raw, 'MERCHANT');
  if (structured) return structured.slice(0, 80);

  const lines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const candidate = lines.find(line => (
    !/^(TOTAL|DATE|CATEGORY|RECEIPT TEXT|SPOKEN_AMOUNT)\s*:/i.test(line)
    && !/^(transaction details|transaction type|transaction date|amount|value date|account number|from account|to account|transaction reference|card number|atm auth\.? number)$/i.test(line)
    && !isIdentifierLine(line)
    && !lineHasAny(line, strongTotalWords)
    && !lineHasAny(line, nonFinalAmountWords)
    && !/^\d[\d\s.,:/\-]*$/.test(toLatinDigits(line))
  ));
  return String(candidate || '').slice(0, 80);
};

const fallbackTitle = (type, catId, cats = [], lang = 'ar') => {
  const cat = cats.find(item => item.id === catId) || cats.find(item => item.id === 'other') || {};
  const label = (lang === 'ar' ? cat.label : cat.labelEn)
    || cat.label
    || cat.labelEn
    || (lang === 'ar' ? 'عام' : 'General');
  return type === 'inc'
    ? (lang === 'ar' ? `دخل - ${label}` : `Income - ${label}`)
    : (lang === 'ar' ? `مصروف - ${label}` : `Expense - ${label}`);
};

export const analyzeSmartEntry = ({
  text = '',
  cats = [],
  history = [],
  wallets = [],
  lang = 'ar',
} = {}) => {
  const raw = String(text || '').trim();
  if (!raw) return null;

  const financialRaw = appendSpokenAmountHint(raw);
  const amountInfo = pickAmount(financialRaw);
  if (!amountInfo?.amount) return null;

  const structuredCategory = structuredField(raw, 'CATEGORY').toLowerCase();
  const merchant = cleanMerchant(raw);
  const categorySource = `${merchant}\n${raw}`;
  const detected = detectCategory(categorySource, cats, history);
  const catId = structuredCategoryIds.has(structuredCategory)
    && cats.some(item => item.id === structuredCategory)
    ? structuredCategory
    : detected.catId;
  const categoryConfidence = catId === structuredCategory ? 'structured' : detected.confidence;
  const type = detectType(categorySource, catId);
  const walletId = detectWallet(raw, wallets, lang);
  const date = detectDate(financialRaw);

  return {
    raw,
    title: merchant || fallbackTitle(type, catId, cats, lang),
    amount: amountInfo.amount,
    amountConfidence: amountInfo.confidence,
    type,
    catId,
    walletId,
    dateISO: date.dateISO,
    dateConfidence: date.confidence,
    confidence: categoryConfidence,
    needsReview: (
      categoryConfidence === 'fallback'
      || !['structured', 'strong_total', 'total', 'single', 'currency'].includes(amountInfo.confidence)
      || date.confidence === 'none'
    ),
  };
};

export const buildSmartSourceMeta = ({
  mode = 'text',
  text = '',
  automated = false,
  reviewedInline = false,
  reviewRequired = false,
  analysis = null,
} = {}) => ({
  mode,
  preview: String(text || '').trim().slice(0, 500),
  automated: !!automated,
  reviewedInline: !!reviewedInline,
  reviewRequired: !!reviewRequired,
  analysis: analysis && typeof analysis === 'object'
    ? {
        sourceType: analysis.sourceType || null,
        flow: analysis.flow || null,
        direction: analysis.direction || null,
        overallConfidence: Number(analysis.overallConfidence || 0) || null,
        warnings: Array.isArray(analysis.warnings) ? analysis.warnings.slice(0, 8) : [],
      }
    : null,
  createdAt: new Date().toISOString(),
});

export const describeSmartSource = (source, lang = 'ar') => {
  if (!source?.mode) return null;
  if (['receipt', 'camera', 'image'].includes(source.mode)) {
    return {
      icon: source.mode === 'camera' ? 'camera-outline' : 'image-outline',
      label: source.mode === 'camera'
        ? (lang === 'ar' ? 'تصوير' : 'Camera')
        : (lang === 'ar' ? 'صورة' : 'Image'),
    };
  }
  if (source.mode === 'voice') {
    return {
      icon: 'mic-outline',
      label: lang === 'ar' ? 'صوت' : 'Voice',
    };
  }
  return {
    icon: 'sparkles-outline',
    label: lang === 'ar' ? 'ذكي' : 'Smart',
  };
};
