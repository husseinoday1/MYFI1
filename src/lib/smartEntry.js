import { today } from '../utils/calc';
import { suggestCategoryFromHistory } from './localIntelligence';
import { getWalletLabel } from './wallets';

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s./,:+-]/gu, ' ')
    .replace(/\s+/g, ' ');

const toLatinDigits = (value = '') =>
  String(value)
    .replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) - 0x06F0));

const moneyPattern = /(?:^|\s)([+-]?\d[\d,. \t\u066C\u060C]*)(?:\s*(?:د\.ع|دينار|ريال|ر\.س|درهم|دولار|\$|iqd|sar|aed|usd))?(?=\s|$)/gi;

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
const totalWords = ['total', 'amount', 'net', 'grand', 'الإجمالي', 'اجمالي', 'المجموع', 'مجموع', 'الصافي', 'المطلوب', 'المستحق'];
const structuredCategoryIds = new Set(['food', 'transport', 'rent', 'health', 'clothes', 'entertainment', 'other', 'salary']);

const structuredField = (raw = '', field = '') => {
  const match = String(raw).match(new RegExp(`^\\s*${field}\\s*:\\s*(.+)$`, 'im'));
  return String(match?.[1] || '').trim();
};

const parseNumber = (value = '') => {
  let cleaned = toLatinDigits(value).replace(/[ \t\u066C\u060C]/g, '');
  const separators = [...cleaned.matchAll(/[.,]/g)];
  if (separators.length) {
    const lastIndex = separators[separators.length - 1].index;
    const decimalDigits = cleaned.length - lastIndex - 1;
    if (decimalDigits > 0 && decimalDigits <= 2) {
      const integer = cleaned.slice(0, lastIndex).replace(/[.,]/g, '');
      const decimal = cleaned.slice(lastIndex + 1).replace(/[.,]/g, '');
      cleaned = `${integer}.${decimal}`;
    } else {
      cleaned = cleaned.replace(/[.,]/g, '');
    }
  }
  const n = Math.abs(Number(cleaned));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const findAmounts = (raw = '') => {
  const text = toLatinDigits(raw);
  return [...text.matchAll(moneyPattern)]
    .map(match => ({
      amount: parseNumber(match[1]),
      index: match.index,
      length: match[0].length,
      signed: String(match[1]).trim().startsWith('-') ? 'exp' : String(match[1]).trim().startsWith('+') ? 'inc' : null,
      source: match[0],
    }))
    .filter(item => item.amount > 0);
};

const pickAmount = (raw = '', amounts = []) => {
  if (amounts.length === 0) return null;
  const source = String(raw);
  const totalAmounts = amounts.filter(item => {
    const lineStart = source.lastIndexOf('\n', item.index) + 1;
    const nextBreak = source.indexOf('\n', item.index + item.length);
    const lineEnd = nextBreak < 0 ? source.length : nextBreak;
    const normalized = normalize(source.slice(lineStart, lineEnd));
    return totalWords.some(word => normalized.includes(normalize(word)));
  });
  if (totalAmounts.length > 0) return totalAmounts.sort((a, b) => b.amount - a.amount)[0];
  if (amounts.length === 1) return amounts[0];
  return [...amounts].sort((a, b) => b.amount - a.amount)[0];
};

const stripAmount = (raw = '', amountInfo) => {
  if (!amountInfo) return String(raw || '').trim();
  return `${raw.slice(0, amountInfo.index)} ${raw.slice(amountInfo.index + amountInfo.length)}`
    .replace(/\s+/g, ' ')
    .trim();
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

  const keyword = Object.entries(keywordMap).find(([, words]) => words.some(word => normalized.includes(normalize(word))));
  if (keyword) return { catId: keyword[0], confidence: 'keyword' };

  return { catId: cats.find(c => c.id === 'other')?.id || cats[0]?.id || 'other', confidence: 'fallback' };
};

const detectType = (source, amountInfo, catId) => {
  const normalized = normalize(source);
  if (amountInfo?.signed) return amountInfo.signed;
  if (incomeWords.some(word => normalized.includes(normalize(word)))) return 'inc';
  if (expenseWords.some(word => normalized.includes(normalize(word)))) return 'exp';
  if (catId === 'salary') return 'inc';
  return 'exp';
};

const detectWallet = (source, wallets = [], lang = 'ar') => {
  const normalized = normalize(source);
  return wallets.find(wallet => {
    const label = normalize(getWalletLabel(wallet, lang));
    const ar = normalize(wallet.name || '');
    const en = normalize(wallet.nameEn || '');
    return (label && normalized.includes(label)) || (ar && normalized.includes(ar)) || (en && normalized.includes(en));
  })?.id || null;
};

const detectDate = (source) => {
  const normalized = normalize(source);
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(normalized)) return normalized.match(/\b\d{4}-\d{2}-\d{2}\b/)[0];
  if (normalized.includes('امس') || normalized.includes('أمس') || normalized.includes('yesterday')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return today();
};

const fallbackTitle = (type, catId, cats = [], lang = 'ar') => {
  const cat = cats.find(item => item.id === catId) || cats.find(item => item.id === 'other') || {};
  const label = (lang === 'ar' ? cat.label : cat.labelEn) || cat.label || cat.labelEn || (lang === 'ar' ? 'عام' : 'General');
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
  const structuredMerchant = structuredField(raw, 'MERCHANT');
  const structuredCategory = structuredField(raw, 'CATEGORY').toLowerCase();
  const amounts = findAmounts(raw);
  const amountInfo = pickAmount(raw, amounts);
  if (!amountInfo) return null;
  const sourceWithoutAmount = stripAmount(raw, amountInfo);
  const source = sourceWithoutAmount || raw;
  const detected = detectCategory(source, cats, history);
  const catId = structuredCategoryIds.has(structuredCategory)
    && cats.some(item => item.id === structuredCategory)
    ? structuredCategory
    : detected.catId;
  const confidence = catId === structuredCategory ? 'structured' : detected.confidence;
  const type = detectType(source, amountInfo, catId);
  const walletId = detectWallet(source, wallets, lang);
  const title = (structuredMerchant || sourceWithoutAmount)
    .replace(/\b(من|from|على|to)\b\s+\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    raw,
    title: title || fallbackTitle(type, catId, cats, lang),
    amount: amountInfo.amount,
    type,
    catId,
    walletId,
    dateISO: detectDate(raw),
    confidence,
    needsReview: confidence === 'fallback' || amounts.length > 1,
  };
};

export const buildSmartSourceMeta = ({
  mode = 'text',
  text = '',
  automated = false,
} = {}) => ({
  mode,
  preview: String(text || '').trim().slice(0, 160),
  automated: !!automated,
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
