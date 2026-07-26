import { byMonth, calcStats, catSpend } from '../utils/calc';
import { isExpenseFlow, isIncomeFlow } from './modules';

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

const toLatinDigits = (value = '') =>
  String(value)
    .replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));

const parseAmount = (value = '') => {
  const normalized = toLatinDigits(value);
  const matches = [...normalized.matchAll(/(?:^|\s)([+-]?\d[\d,. \t]*)(?:\s*(?:د\.ع|دينار|ريال|ر\.س|درهم|دولار|\$|iqd|sar|aed|usd))?(?=\s|$)/gi)];
  if (matches.length === 0) return null;
  const match = matches[matches.length - 1];
  let numberText = match[1].replace(/[ \t٬،]/g, '');
  const separators = [...numberText.matchAll(/[.,]/g)];
  if (separators.length) {
    const lastIndex = separators[separators.length - 1].index;
    const decimalDigits = numberText.length - lastIndex - 1;
    if (decimalDigits > 0 && decimalDigits <= 2) {
      numberText = `${numberText.slice(0, lastIndex).replace(/[.,]/g, '')}.${numberText.slice(lastIndex + 1).replace(/[.,]/g, '')}`;
    } else {
      numberText = numberText.replace(/[.,]/g, '');
    }
  }
  const amount = Math.abs(Number(numberText));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    amount,
    index: match.index,
    length: match[0].length,
    signed: String(match[1]).trim().startsWith('-') ? 'exp' : String(match[1]).trim().startsWith('+') ? 'inc' : null,
  };
};

const keywordMap = {
  food: ['اكل', 'طعام', 'مطعم', 'قهوة', 'كافي', 'غداء', 'عشاء', 'فطور', 'food', 'coffee', 'cafe', 'restaurant'],
  rent: ['ايجار', 'اجار', 'rent', 'house', 'home'],
  salary: ['راتب', 'معاش', 'salary', 'income', 'payroll'],
  transport: ['تكسي', 'تاكسي', 'بنزين', 'وقود', 'مواصلات', 'transport', 'taxi', 'fuel', 'gas'],
  health: ['صيدلية', 'طبيب', 'دواء', 'علاج', 'health', 'doctor', 'pharmacy'],
  clothes: ['ملابس', 'حذاء', 'clothes', 'shirt', 'shoe'],
  entertain: ['ترفيه', 'سينما', 'لعبة', 'اشتراك', 'netflix', 'game', 'cinema'],
};

export const parseQuickEntry = (input = '', cats = [], history = []) => {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const amountInfo = parseAmount(raw);
  if (!amountInfo) return null;

  const title = `${raw.slice(0, amountInfo.index)} ${raw.slice(amountInfo.index + amountInfo.length)}`
    .replace(/\s+/g, ' ')
    .trim();
  const source = normalize(title || raw);
  const learned = suggestCategoryFromHistory(source, history);
  const keyword = Object.entries(keywordMap).find(([, words]) => words.some(word => source.includes(word)));
  const labelMatch = cats.find(cat => {
    const ar = normalize(cat.label || '');
    const en = normalize(cat.labelEn || '');
    return (ar && source.includes(ar)) || (en && source.includes(en));
  });
  const catId = learned || labelMatch?.id || keyword?.[0] || cats.find(c => c.id === 'other')?.id || cats[0]?.id || 'other';
  const incomeWords = ['راتب', 'دخل', 'استلام', 'تحصيل', 'salary', 'income', 'received'];
  const expenseWords = ['صرف', 'دفع', 'شراء', 'قهوة', 'اكل', 'paid', 'buy'];
  const type = amountInfo.signed ||
    (incomeWords.some(word => source.includes(word))
    ? 'inc'
    : expenseWords.some(word => source.includes(word))
      ? 'exp'
      : keyword?.[0] === 'salary' ? 'inc' : 'exp');

  return {
    title: title || raw.replace(/\d+/g, '').trim() || (type === 'inc' ? 'Income' : 'Expense'),
    amount: amountInfo.amount,
    type,
    catId,
    confidence: learned ? 'history' : labelMatch ? 'category' : keyword ? 'keyword' : 'fallback',
  };
};

export const suggestCategoryFromHistory = (query = '', history = []) => {
  const q = normalize(query);
  if (!q) return null;
  const tokens = q.split(' ').filter(token => token.length > 1);
  const scores = new Map();
  history.forEach(tx => {
    if (!tx?.cat || !isExpenseFlow(tx)) return;
    const hay = normalize(`${tx.title || ''} ${tx.note || ''}`);
    const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
    if (score > 0) scores.set(tx.cat, (scores.get(tx.cat) || 0) + score);
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

export const detectRecurringCandidates = (trans = []) => {
  const groups = new Map();
  trans
    .filter(tx => (isExpenseFlow(tx) || isIncomeFlow(tx)) && tx.dateISO && Math.abs(Number(tx.amt || 0)) > 0)
    .forEach(tx => {
      const key = `${normalize(tx.title)}|${tx.cat}|${Math.sign(Number(tx.amt || 0))}`;
      const row = groups.get(key) || [];
      row.push(tx);
      groups.set(key, row);
    });

  return [...groups.values()]
    .filter(items => items.length >= 3)
    .map(items => {
      const sorted = [...items].sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
      const amount = Math.round(sorted.reduce((sum, tx) => sum + Math.abs(Number(tx.amt || 0)), 0) / sorted.length);
      return {
        title: sorted[0].title,
        cat: sorted[0].cat,
        count: sorted.length,
        amount,
        lastDateISO: sorted[sorted.length - 1].dateISO,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
};

const spendByDay = (items = []) => {
  const days = new Map();
  items.forEach(tx => {
    if (!tx?.dateISO || !isExpenseFlow(tx)) return;
    const d = new Date(`${tx.dateISO}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    const key = tx.dateISO;
    const row = days.get(key) || { dateISO: key, day: d.getDate(), spent: 0, count: 0 };
    row.spent += Math.abs(Number(tx.amt || 0));
    row.count += 1;
    days.set(key, row);
  });
  return [...days.values()].sort((a, b) => String(a.dateISO).localeCompare(String(b.dateISO)));
};

const savingRate = (stats) =>
  stats.inc > 0 ? Math.round(((Number(stats.inc || 0) - Number(stats.exp || 0)) / Number(stats.inc || 1)) * 100) : 0;

export const buildLeakInsights = (trans = [], cats = [], date = new Date()) => {
  const current = byMonth(trans, date.getMonth(), date.getFullYear()).filter(tx => tx.kind !== 'transfer');
  const prevDate = new Date(date.getFullYear(), date.getMonth() - 1, 15);
  const previous = byMonth(trans, prevDate.getMonth(), prevDate.getFullYear()).filter(tx => tx.kind !== 'transfer');
  const currentSpend = catSpend(current, cats);
  const previousSpend = catSpend(previous, cats);
  const catById = new Map(cats.map(cat => [cat.id, cat]));
  const currentById = new Map(currentSpend.map(cat => [cat.id, Number(cat.spent || 0)]));
  const prevById = new Map(previousSpend.map(cat => [cat.id, Number(cat.spent || 0)]));
  const categoryIds = new Set([...currentById.keys(), ...prevById.keys()]);
  const categoryMovement = [...categoryIds].map(id => {
    const source = catById.get(id) || { id, label: id, labelEn: id, color: '#8E8E93', icon: 'ellipse-outline' };
    const spent = currentById.get(id) || 0;
    const previousSpent = prevById.get(id) || 0;
    return {
      ...source,
      spent,
      previousSpent,
      delta: spent - previousSpent,
    };
  });
  const totalSpent = currentSpend.reduce((sum, cat) => sum + Number(cat.spent || 0), 0);
  const stats = calcStats(current);
  const previousStats = calcStats(previous);
  const hasPreviousSpend = previousStats.exp > 0;
  const leaks = hasPreviousSpend
    ? categoryMovement
      .filter(cat => cat.delta > 0)
      .sort((a, b) => b.delta - a.delta)
    : [];
  const improvements = hasPreviousSpend
    ? categoryMovement
      .filter(cat => cat.delta < 0 && cat.previousSpent > 0)
      .sort((a, b) => a.delta - b.delta)
    : [];
  const topSpend = categoryMovement
    .filter(cat => cat.spent > 0)
    .sort((a, b) => b.spent - a.spent)[0] || null;
  const daily = spendByDay(current);
  const activeDays = daily.filter(day => day.spent > 0);
  const activeDailyAverage = activeDays.length
    ? activeDays.reduce((sum, day) => sum + day.spent, 0) / activeDays.length
    : 0;
  const unusualDays = activeDays.length >= 3
    ? activeDays
      .filter(day => day.spent > activeDailyAverage * 1.6)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 3)
      .map(day => ({ ...day, average: activeDailyAverage }))
    : [];
  return {
    topLeak: leaks[0] || null,
    bestImprovement: improvements[0] ? { ...improvements[0], saved: Math.abs(improvements[0].delta) } : null,
    topSpend: topSpend ? {
      ...topSpend,
      share: Math.round((Number(topSpend.spent || 0) / Math.max(1, totalSpent)) * 100),
    } : null,
    unusualDays,
    recurring: detectRecurringCandidates(trans),
    stats,
    previousStats,
    deltas: {
      income: stats.inc - previousStats.inc,
      expense: stats.exp - previousStats.exp,
      net: stats.bal - previousStats.bal,
      savingsRate: savingRate(stats) - savingRate(previousStats),
    },
    categoryMovement,
    totalSpent,
    savingRate: savingRate(stats),
    previousSavingRate: savingRate(previousStats),
  };
};
