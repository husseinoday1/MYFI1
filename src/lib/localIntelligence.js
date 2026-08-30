import { byMonth, calcStats, catSpend } from '../utils/calc';
import { isExpenseFlow, isIncomeFlow } from './modules';
import {
  adaptiveVariableProjection,
  getEligibleHistoricalVariableSpendMonths,
  getCategoryHistoricalAverageTransaction,
  isFixedExpenseTransaction,
  isEligibleVariableSpendTransaction,
  monthKeyForDate,
  outstandingExpenseCommitments,
} from './financialForecast';

const normalize = (value = '') =>
  String(value)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ');

export const shouldShowWhyChangedCard = ({
  currentAmount = 0,
  referenceAmount = 0,
  historicalAvgTxn = null,
  eligibleTransactionCount = 0,
  percentThreshold = 15,
  noiseDivisor = 3,
} = {}) => {
  const average = Number(historicalAvgTxn);
  if (!Number.isFinite(average) || average <= 0) {
    return { show: false, reason: 'insufficient_data', wording: null };
  }
  const difference = Math.abs(Number(currentAmount || 0) - Number(referenceAmount || 0));
  const percentChange = Math.abs(Number(referenceAmount || 0)) > 0
    ? (difference / Math.abs(Number(referenceAmount))) * 100
    : 0;
  const absolute = difference >= average;
  const relative = percentChange >= Number(percentThreshold || 15)
    && difference >= average / Math.max(1, Number(noiseDivisor) || 3);
  if (!absolute && !relative) return { show: false, reason: 'not_significant', wording: null };
  return {
    show: true,
    reason: absolute ? 'absolute' : 'relative',
    wording: Number(eligibleTransactionCount || 0) <= 1 ? 'single_event' : 'pattern',
  };
};

const monthId = (date = new Date()) => {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const expenseAmount = (tx = {}) => (
  isExpenseFlow(tx) ? Math.abs(Number(tx?.amt || 0)) : 0
);

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

export const suggestCategoryForText = (value = '', cats = []) => {
  const source = normalize(value);
  const list = Array.isArray(cats) ? cats : [];
  if (!source) return list.find(cat => cat.id === 'other')?.id || list[0]?.id || 'other';

  const labelMatch = list.find(cat => {
    const ar = normalize(cat.label || '');
    const en = normalize(cat.labelEn || '');
    return (ar && source.includes(ar)) || (en && source.includes(en));
  });
  if (labelMatch?.id) return labelMatch.id;

  const keyword = Object.entries(keywordMap).find(([, words]) => (
    words.some(word => source.includes(normalize(word)))
  ));
  if (keyword?.[0] && list.some(cat => cat.id === keyword[0])) return keyword[0];

  return list.find(cat => cat.id === 'other')?.id || list[0]?.id || 'other';
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
  const keyword = Object.entries(keywordMap).find(([, words]) => words.some(word => source.includes(normalize(word))));
  const labelMatch = cats.find(cat => {
    const ar = normalize(cat.label || '');
    const en = normalize(cat.labelEn || '');
    return (ar && source.includes(ar)) || (en && source.includes(en));
  });
  const catId = learned || labelMatch?.id || keyword?.[0] || cats.find(c => c.id === 'other')?.id || cats[0]?.id || 'other';
  const incomeWords = ['راتب', 'دخل', 'استلام', 'تحصيل', 'salary', 'income', 'received'];
  const expenseWords = ['صرف', 'دفع', 'شراء', 'قهوة', 'اكل', 'paid', 'buy'];
  const type = amountInfo.signed ||
    (incomeWords.some(word => source.includes(normalize(word)))
    ? 'inc'
    : expenseWords.some(word => source.includes(normalize(word)))
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

export const suggestCategoryFromHistory = (query = '', history = [], { flow = 'expense' } = {}) => {
  const q = normalize(query);
  if (!q) return null;
  const tokens = q.split(' ').filter(token => token.length > 1);
  const scores = new Map();
  history.forEach(tx => {
    const matchesFlow = flow === 'income' ? isIncomeFlow(tx) : isExpenseFlow(tx);
    if (!tx?.cat || !matchesFlow) return;
    const hay = normalize(`${tx.title || ''} ${tx.note || ''}`);
    const score = tokens.reduce((sum, token) => sum + (hay.includes(token) ? 1 : 0), 0);
    if (score > 0) scores.set(tx.cat, (scores.get(tx.cat) || 0) + score);
  });
  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

export const suggestBudgetsFromHistory = (trans = [], cats = [], now = new Date()) => {
  const current = monthId(now);
  const eligibleMonths = [...new Set(trans
    .map(tx => String(tx?.dateISO || '').slice(0, 7))
    .filter(key => /^\d{4}-\d{2}$/.test(key) && key < current))]
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 6);
  const perCategoryMonthly = new Map();
  trans.forEach((tx) => {
    const key = String(tx?.dateISO || '').slice(0, 7);
    const amount = expenseAmount(tx);
    if (!amount || !eligibleMonths.includes(key)) return;
    const cat = tx.cat || 'other';
    const monthly = perCategoryMonthly.get(cat) || new Map();
    monthly.set(key, (monthly.get(key) || 0) + amount);
    perCategoryMonthly.set(cat, monthly);
  });
  const validCats = new Set(cats.map(cat => cat.id));
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  return Object.fromEntries([...perCategoryMonthly.entries()]
    .filter(([cat]) => validCats.has(cat))
    .map(([cat, monthly]) => {
      const values = eligibleMonths.map(month => monthly.get(month) || 0).filter(v => v > 0);
      return values.length ? [cat, Math.round(median(values) / 1000) * 1000] : [cat, 0];
    })
    .filter(([, value]) => value > 0));
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

const spendByDay = (items = [], commitments = [], { variableOnly = false } = {}) => {
  const days = new Map();
  items.forEach(tx => {
    if (!tx?.dateISO || !isExpenseFlow(tx)) return;
    if (variableOnly && isFixedExpenseTransaction(tx, commitments)) return;
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

export const buildLeakInsights = (trans = [], cats = [], date = new Date(), commitments = []) => {
  const analysisDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const currentKey = monthKeyForDate(analysisDate);
  const periodEnd = new Date(analysisDate.getFullYear(), analysisDate.getMonth() + 1, 0, 23, 59, 59, 999);
  const relevant = trans.filter(tx => {
    if (tx?.kind === 'transfer' || !tx?.dateISO) return false;
    const txDate = new Date(`${tx.dateISO}T12:00:00`);
    return !Number.isNaN(txDate.getTime()) && txDate <= periodEnd;
  });
  const current = byMonth(relevant, analysisDate.getMonth(), analysisDate.getFullYear());
  const monthly = new Map();
  relevant.forEach(tx => {
    const key = String(tx.dateISO).slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    const list = monthly.get(key) || [];
    list.push(tx);
    monthly.set(key, list);
  });
  const catById = new Map(cats.map(c => [c.id, c]));
  const currentSpend = catSpend(current, cats);
  const currentById = new Map(currentSpend.map(row => [row.id, row.spent]));

  const currentFixedById = new Map();
  current.filter(tx => isExpenseFlow(tx) && isFixedExpenseTransaction(tx, commitments)).forEach(tx => {
    const id = tx.cat || 'other';
    currentFixedById.set(id, (currentFixedById.get(id) || 0) + Math.abs(Number(tx.amt || 0)));
  });

  const remainingFixedById = new Map();
  outstandingExpenseCommitments(commitments, current, currentKey).forEach(commitment => {
    const id = commitment.cat || 'other';
    remainingFixedById.set(id, (remainingFixedById.get(id) || 0) + Math.abs(Number(commitment.amt || 0)));
  });

  const baselineMonths = getEligibleHistoricalVariableSpendMonths(relevant, analysisDate, commitments, { limit: 6 });
  const baselineMonthCount = baselineMonths.length;

  const decay = 0.7;
  const baselineById = new Map();
  const baselineVariableById = new Map();
  const weightTotalById = new Map();
  baselineMonths.forEach(([, rows], index) => {
    const weight = Math.pow(decay, baselineMonthCount - 1 - index);
    const totalByCat = new Map();
    const variableByCat = new Map();

    rows.filter(isExpenseFlow).forEach(tx => {
      const id = tx.cat || 'other';
      const amount = Math.abs(Number(tx.amt || 0));
      totalByCat.set(id, (totalByCat.get(id) || 0) + amount);
      if (!isFixedExpenseTransaction(tx, commitments)) {
        variableByCat.set(id, (variableByCat.get(id) || 0) + amount);
      }
    });

    new Set([...totalByCat.keys(), ...variableByCat.keys()]).forEach(id => {
      baselineById.set(id, (baselineById.get(id) || 0) + (totalByCat.get(id) || 0) * weight);
      baselineVariableById.set(id, (baselineVariableById.get(id) || 0) + (variableByCat.get(id) || 0) * weight);
      weightTotalById.set(id, (weightTotalById.get(id) || 0) + weight);
    });
  });

  const daysElapsed = Math.max(1, Math.min(
    analysisDate.getDate(),
    new Date(analysisDate.getFullYear(), analysisDate.getMonth() + 1, 0).getDate(),
  ));
  const daysInMonth = new Date(analysisDate.getFullYear(), analysisDate.getMonth() + 1, 0).getDate();
  const categoryIds = new Set([
    ...currentById.keys(),
    ...baselineById.keys(),
    ...remainingFixedById.keys(),
  ]);
  const categoryMovement = [...categoryIds].map(id => {
    const source = catById.get(id) || { id, label: id, labelEn: id, color: '#8E8E93', icon: 'ellipse-outline' };
    const spent = currentById.get(id) || 0;
    const fixedSpent = Math.min(spent, currentFixedById.get(id) || 0);
    const remainingFixed = remainingFixedById.get(id) || 0;
    const variableSpent = Math.max(0, spent - fixedSpent);
    const previousSpent = weightTotalById.get(id) ? (baselineById.get(id) || 0) / weightTotalById.get(id) : 0;
    const historicalVariable = weightTotalById.get(id)
      ? (baselineVariableById.get(id) || 0) / weightTotalById.get(id)
      : 0;
    const variableForecast = adaptiveVariableProjection({
      currentSpent: variableSpent,
      historicalSpent: historicalVariable,
      daysElapsed,
      daysInMonth,
      baselineMonthCount,
      fallbackScaleCap: 2,
    });
    const projectedSpent = fixedSpent + remainingFixed + variableForecast.projected;
    const historical = getCategoryHistoricalAverageTransaction(relevant, analysisDate, commitments, id, { limit: 6 });
    const eligibleVariableTransactionCount = current.filter(tx => isEligibleVariableSpendTransaction(tx, commitments, id)).length;
    const whyChanged = shouldShowWhyChangedCard({
      currentAmount: variableSpent,
      referenceAmount: historicalVariable,
      historicalAvgTxn: historical.average,
      eligibleTransactionCount: eligibleVariableTransactionCount,
    });
    return {
      ...source,
      spent,
      fixedSpent,
      remainingFixed,
      variableSpent,
      historicalVariable,
      projectedVariable: variableForecast.projected,
      forecastBasis: variableForecast.basis,
      projectedSpent,
      previousSpent,
      baselineSpent: previousSpent,
      delta: projectedSpent - previousSpent,
      actualVariableDelta: variableSpent - historicalVariable,
      historicalAvgTxn: historical.average,
      historicalEligibleMonthCount: historical.eligibleMonthCount,
      eligibleVariableTransactionCount,
      whyChanged,
    };
  });
  const totalSpent = currentSpend.reduce((sum, cat) => sum + Number(cat.spent || 0), 0);
  const stats = calcStats(current);
  const baselineStats = baselineMonths.map(([, rows]) => calcStats(rows));
  const previousStats = baselineStats.reduce((total, item) => ({
    inc: total.inc + Number(item.inc || 0) / Math.max(1, baselineMonthCount),
    exp: total.exp + Number(item.exp || 0) / Math.max(1, baselineMonthCount),
    bal: total.bal + Number(item.bal || 0) / Math.max(1, baselineMonthCount),
  }), { inc: 0, exp: 0, bal: 0 });
  const hasHistoricalBaseline = baselineMonthCount >= 2 && previousStats.exp > 0;
  const leaks = hasHistoricalBaseline
    ? categoryMovement.filter(cat => cat.delta > 0 && cat.previousSpent > 0).sort((a, b) => b.delta - a.delta)
    : [];
  const improvements = hasHistoricalBaseline
    ? categoryMovement.filter(cat => cat.delta < 0 && cat.previousSpent > 0).sort((a, b) => a.delta - b.delta)
    : [];
  const topSpend = categoryMovement.filter(cat => cat.spent > 0).sort((a, b) => b.spent - a.spent)[0] || null;
  const whyChanged = categoryMovement
    .filter(item => item.whyChanged?.show && Math.abs(Number(item.actualVariableDelta || 0)) > 0)
    .sort((a, b) => Math.abs(Number(b.actualVariableDelta || 0)) - Math.abs(Number(a.actualVariableDelta || 0)));
  const currentDays = spendByDay(current, commitments, { variableOnly: true }).filter(day => day.spent > 0);
  const historicalDays = spendByDay(
    relevant.filter(tx => String(tx.dateISO).slice(0, 7) !== currentKey),
    commitments,
    { variableOnly: true },
  );
  const activeDailyAverage = historicalDays.length
    ? historicalDays.reduce((sum, day) => sum + day.spent, 0) / historicalDays.length
    : 0;
  const dailyVariance = historicalDays.length > 1
    ? historicalDays.reduce((sum, day) => sum + (day.spent - activeDailyAverage) ** 2, 0) / (historicalDays.length - 1)
    : 0;
  const dailyStdDev = Math.sqrt(dailyVariance);
  const unusualThreshold = activeDailyAverage + (dailyStdDev > 0 ? 2 * dailyStdDev : activeDailyAverage * 0.8);
  const unusualDays = historicalDays.length >= 4
    ? currentDays.filter(day => day.spent > unusualThreshold).sort((a, b) => b.spent - a.spent).slice(0, 3)
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
    recurring: detectRecurringCandidates(relevant),
    whyChanged,
    stats,
    previousStats,
    history: {
      transactionCount: relevant.length,
      monthCount: monthly.size,
      baselineMonthCount,
      activeDays: historicalDays.length,
      hasHistoricalBaseline,
    },
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
