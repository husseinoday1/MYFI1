import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import WalletBalanceCard from '../components/WalletBalanceCard';
import ChoiceSheet from '../components/ChoiceSheet';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { buildFinancialReport, calcStats, catSpend, debtSummary } from '../utils/calc';
import { buildLeakInsights } from '../lib/localIntelligence';
import { generateFinancialReportPDF } from '../lib/pdf';
import { RADIUS, SHADOW, weight } from '../lib/tokens';
import { isRTL, rowDirFor, textAlignFor, writingDirectionFor } from '../lib/layout';
import { filterByActiveScope, filterFeatureEntities, getActiveScope, getModules, transactionFeatureEnabled } from '../lib/modules';
import { getWalletLabel } from '../lib/wallets';
import { formatMonthLabel, monthNames } from '../lib/months';

const CHART_COLORS = ['#138A57', '#447FC1', '#C18428', '#C25761', '#6E68B5', '#4E8975'];

const dateOf = (item) => {
  const date = new Date(`${item?.dateISO || ''}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const money = (value, lang, currency = 'IQD') => formatMoneyNumber(value, currency, lang);

const chartMoney = (value) => {
  const amount = Math.abs(Number(value) || 0);
  if (amount >= 1_000_000_000) return `${Math.round((amount / 1_000_000_000) * 10) / 10}B`;
  if (amount >= 1_000_000) return `${Math.round((amount / 1_000_000) * 10) / 10}M`;
  if (amount >= 1_000) return `${Math.round((amount / 1_000) * 10) / 10}K`;
  return String(Math.round(amount));
};

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    period: ar ? 'الفترة' : 'Period',
    periodHint: ar ? 'اضغط لتغيير الفترة' : 'Tap to change the period',
    choosePeriod: ar ? 'اختيار الفترة' : 'Choose period',
    chooseYear: ar ? 'اختر السنة أولاً' : 'Choose a year first',
    monthPeriod: ar ? 'تقرير شهري' : 'Monthly report',
    yearPeriod: ar ? 'تقرير سنوي' : 'Annual report',
    allTime: ar ? 'الفترة كاملة' : 'All time',
    allTimeDetail: ar ? 'جميع الحركات المسجلة' : 'All recorded transactions',
    export: ar ? 'مشاركة' : 'Share',
    exportHint: ar ? 'اختر المعلومات التي تريدها' : 'Choose exactly what to include',
    exportTitle: ar ? 'مركز مشاركة التقارير' : 'Report sharing center',
    selectContent: ar ? 'حدد محتوى ملف PDF' : 'Choose PDF contents',
    summarySection: ar ? 'ملخص الدخل والمصروف والصافي' : 'Income, expense, and net summary',
    debtsSection: ar ? 'دين عليّ ودين لي' : 'Debt I owe and debt owed to me',
    categoriesSection: ar ? 'توزيع المصروفات' : 'Expense breakdown',
    transactionsSection: ar ? 'تفاصيل الحركات' : 'Transaction details',
    comparisonSection: ar ? 'المقارنة المحددة' : 'Selected comparison',
    comparisonChart: ar ? 'مخطط المقارنة' : 'Comparison chart',
    comparisonDetails: ar ? 'تفاصيل المقارنة' : 'Comparison details',
    selectAll: ar ? 'تحديد الكل' : 'Select all',
    clearAll: ar ? 'إلغاء الكل' : 'Clear all',
    sharePdf: ar ? 'إنشاء ومشاركة PDF' : 'Create and share PDF',
    selectAtLeastOne: ar ? 'حدد معلومة واحدة على الأقل.' : 'Select at least one item.',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'المصروف' : 'Expense',
    net: ar ? 'صافي الدخل' : 'Net income',
    compared: ar ? 'مقارنة الفترات' : 'Period comparison',
    comparisonTitle: ar ? 'مقارنة الأداء' : 'Performance comparison',
    comparisonSubtitle: ar ? 'قارن فترتين أو أكثر بنفس المؤشرات وبعرض موحّد.' : 'Compare two or more periods using the same metrics and layout.',
    comparisonHint: ar ? 'قارن الفترات بنفس التعريف وبنفس أسلوب العرض.' : 'Compare periods using the same definition and presentation.',
    monthlyComparison: ar ? 'شهرية' : 'Monthly',
    annualComparison: ar ? 'سنوية' : 'Annual',
    chartView: ar ? 'الرسم' : 'Chart',
    detailsView: ar ? 'التفاصيل' : 'Details',
    expandChart: ar ? 'تكبير المخطط' : 'Expand chart',
    closeChart: ar ? 'إغلاق المخطط' : 'Close chart',
    addComparison: ar ? 'إضافة مقارنة' : 'Add comparison',
    removeComparison: ar ? 'حذف المقارنة' : 'Remove comparison',
    choosePeriods: ar ? 'اختر الفترات' : 'Choose periods',
    editPeriods: ar ? 'تعديل الفترات' : 'Edit periods',
    selectedPeriodsLabel: ar ? 'الفترات المختارة' : 'Selected periods',
    startComparisonHint: ar ? 'اختر شهري أو سنوي، ثم حدد الفترات التي تريد مقارنتها.' : 'Choose monthly or annual, then select the periods to compare.',
    selectedPeriods: ar ? 'فترات محددة' : 'periods selected',
    monthlyLimit: ar ? 'يمكنك مقارنة ما يصل إلى 12 شهراً' : 'Compare up to 12 months',
    annualLimit: ar ? 'يمكنك مقارنة ما يصل إلى 10 سنوات' : 'Compare up to 10 years',
    done: ar ? 'تم' : 'Done',
    noComparison: ar ? 'لا توجد بيانات كافية للمقارنة' : 'Not enough data to compare',
    topSpending: ar ? 'أين تذهب مصروفاتك؟' : 'Where your money goes',
    topSpendingHint: ar ? 'أكبر البنود مرتبة من الأعلى إلى الأقل' : 'Largest categories, ranked from highest to lowest',
    noData: ar ? 'لا توجد بيانات ضمن هذه الفترة' : 'No data in this period',
    smartTitle: ar ? 'التحليل والاتجاهات' : 'Insights from your activity',
    smartHint: ar ? 'تحليل محلي للاتجاهات حتى نهاية الفترة المختارة، ولا يغيّر الأرقام الأساسية.' : 'Local forecasts and rules; your data is not sent to an external model',
    confidence: ar ? 'ثقة التحليل' : 'Analysis confidence',
    confidenceHigh: ar ? 'عالية' : 'High',
    confidenceMedium: ar ? 'متوسطة' : 'Medium',
    confidenceLow: ar ? 'منخفضة' : 'Low',
    needData: ar ? 'أضف 7 حركات على 4 أيام على الأقل للحصول على استنتاجات أدق.' : 'Add at least 7 entries across 4 days for more reliable insights.',
    exportFailed: ar ? 'تعذر إنشاء الملف أو فتح المشاركة. حاول مرة أخرى.' : 'Could not create the file or open sharing. Try again.',
    walletScope: ar ? 'المحفظة' : 'Wallet',
    allWallets: ar ? 'كل المحافظ' : 'All wallets',
    liquidityTitle: ar ? 'رصيدك الآن' : 'Your balance now',
    liquidityHint: ar ? 'يوضح ما تملكه في المحافظ، وما هو محجوز للتوفير، وما يمكن صرفه.' : 'Shows wallet cash, reserved savings, and what is available to spend.',
    physicalBalance: ar ? 'الرصيد الفعلي' : 'Physical balance',
    reservedSavings: ar ? 'محجوز للتوفير' : 'Reserved savings',
    availableBalance: ar ? 'المتاح للصرف' : 'Available to spend',
    netPosition: ar ? 'صافي المركز المالي بنهاية الفترة' : 'Net position at period end',
    cashFlowTitle: ar ? 'التدفق النقدي' : 'Cash flow',
    cashIn: ar ? 'النقد الداخل' : 'Cash in',
    cashOut: ar ? 'النقد الخارج' : 'Cash out',
    cashNet: ar ? 'صافي حركة النقد' : 'Net cash movement',
    cashFlowHint: ar ? 'حركة النقد الفعلية خلال الفترة؛ التوفير المحجوز لا يُعامل كمصروف.' : 'Physical cash movement in the period; reserved savings is not treated as spending.',
    forecastTitle: ar ? 'توقع نهاية الشهر' : 'Month-end forecast',
    forecastHint: ar ? 'تقدير محلي يجمع المصروف الحالي والالتزامات غير المسددة ونمط الأشهر السابقة.' : 'A local estimate combining current spending, unpaid commitments, and recent history.',
    projectedExpense: ar ? 'المصروف المتوقع' : 'Projected expense',
    forecastCommitments: ar ? 'التزامات متبقية' : 'Commitments left',
    forecastAvailable: ar ? 'المتاح اليوم' : 'Available today',
    inflow: ar ? 'داخل' : 'Inflow',
    outflow: ar ? 'خارج' : 'Outflow',
    debtsDueTitle: ar ? 'الديون والاستحقاقات' : 'Debts and dues',
    debtsDueHint: ar ? 'المبالغ المتبقية حالياً والالتزامات النشطة.' : 'Current outstanding amounts and active commitments.',
    owedRemaining: ar ? 'دين عليّ متبقٍ' : 'Debt I owe',
    receivableRemaining: ar ? 'دين لي متبقٍ' : 'Owed to me',
    activeCommitments: ar ? 'التزامات نشطة' : 'Active commitments',
    goalsTitle: ar ? 'الأهداف والتوفير' : 'Goals and savings',
    goalsHint: ar ? 'تقدم أهداف التوفير النشطة دون احتساب المبلغ المحجوز كأصل إضافي.' : 'Progress of active saving goals without counting reserved cash as an extra asset.',
    savedAmount: ar ? 'مدخر' : 'Saved',
    goalRemaining: ar ? 'متبقي للأهداف' : 'Goal remaining',
    goalTarget: ar ? 'إجمالي الأهداف' : 'Goal target',
    expandSection: ar ? 'إظهار التفاصيل' : 'Show details',
    collapseSection: ar ? 'إخفاء التفاصيل' : 'Hide details',
  };
};

export default function ReportsScreen() {
  const { trans, debts, goals, wallets, commitments, cats, cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const C = copy(cfg.lang);
  const ar = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const monthStyle = cfg.monthNameStyle || 'numeric';
  const fullMonths = monthNames({ style: monthStyle, length: 'long' });
  const sym = getSymbol(cfg.currency);
  const modules = getModules(cfg);
  const allScopedTrans = filterByActiveScope(trans, cfg);
  const viewTrans = allScopedTrans.filter(item => transactionFeatureEnabled(item, cfg));
  const featureData = filterFeatureEntities({ debts, goals, commitments, cfg });
  const viewDebts = featureData.debts;
  const viewGoals = featureData.goals;
  const viewCommitments = featureData.commitments;
  const archiveSummaries = Array.isArray(cfg.archiveSummaries) ? cfg.archiveSummaries : [];
  const activeDataScope = getActiveScope(cfg);
  const scopedArchiveSummaries = archiveSummaries.filter(item => (
    activeDataScope === 'all'
    || (item.scope || 'personal') === activeDataScope
  ));
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const previousNow = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const previousMonthKey = `${previousNow.getFullYear()}-${String(previousNow.getMonth() + 1).padStart(2, '0')}`;
  const [scope, setScope] = useState('month');
  const [walletFilter, setWalletFilter] = useState('all');
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [comparisonMode, setComparisonMode] = useState('none');
  const [comparisonView, setComparisonView] = useState('chart');
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [comparisonPeriods, setComparisonPeriods] = useState([currentMonthKey, previousMonthKey]);
  const [sheet, setSheet] = useState(null);
  const [shareSections, setShareSections] = useState(['summary', 'categories']);

  const monthOptions = useMemo(() => {
    const keys = new Set();
    Array.from({ length: 12 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - index, 15);
      keys.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    });
    viewTrans.forEach(item => {
      const date = dateOf(item);
      if (date) keys.add(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    });
    return [...keys].sort((a, b) => b.localeCompare(a)).map(key => {
      const [year, month] = key.split('-').map(Number);
      return { value: key, label: formatMonthLabel(year, month - 1, { style: monthStyle, length: 'short' }), icon: 'calendar-outline' };
    });
  }, [trans, monthStyle, now.getMonth(), now.getFullYear()]);
  const yearOptions = useMemo(() => {
    const years = new Set(Array.from({ length: 10 }, (_, index) => now.getFullYear() - index));
    viewTrans.forEach(item => {
      const date = dateOf(item);
      if (date) years.add(date.getFullYear());
    });
    scopedArchiveSummaries.forEach(item => years.add(Number(item.year)));
    return [...years].sort((a, b) => b - a).map(year => ({
      value: String(year),
      label: String(year),
      icon: 'calendar-number-outline',
    }));
  }, [trans, scopedArchiveSummaries, now.getFullYear()]);
  const scopedWallets = filterByActiveScope(wallets, cfg);
  const walletOptions = useMemo(() => ([
    { value: 'all', label: C.allWallets, icon: 'wallet-outline' },
    ...scopedWallets.map(wallet => ({
      value: wallet.id,
      label: getWalletLabel(wallet, cfg.lang),
      detail: wallet.currency || cfg.currency,
      icon: 'wallet-outline',
    })),
  ]), [wallets, cfg.activeScope, cfg.profileType, cfg.lang, cfg.currency]);

  useEffect(() => {
    if (walletFilter !== 'all' && !scopedWallets.some(wallet => wallet.id === walletFilter)) {
      setWalletFilter('all');
    }
  }, [walletFilter, wallets, cfg.activeScope, cfg.profileType]);

  const matchesWallet = (item) => {
    if (walletFilter === 'all') return true;
    if (item?.kind === 'transfer') {
      return item.fromWalletId === walletFilter || item.toWalletId === walletFilter;
    }
    return (item?.walletId || cfg.defaultWalletId) === walletFilter;
  };

  const selectedMonth = useMemo(() => {
    const [year, month] = selectedMonthKey.split('-').map(Number);
    return new Date(year, month - 1, 15);
  }, [selectedMonthKey]);
  const selectedMonthLabel = formatMonthLabel(selectedMonth.getFullYear(), selectedMonth.getMonth(), { style: monthStyle, length: 'short' });
  const periodLabel = scope === 'month'
    ? selectedMonthLabel
    : scope === 'year' ? String(selectedMonth.getFullYear()) : C.allTime;

  const periodTrans = useMemo(() => viewTrans.filter(item => {
    if (!matchesWallet(item)) return false;
    const date = dateOf(item);
    if (!date) return false;
    if (scope === 'month') return date.getMonth() === selectedMonth.getMonth() && date.getFullYear() === selectedMonth.getFullYear();
    if (scope === 'year') return date.getFullYear() === selectedMonth.getFullYear();
    return true;
  }), [viewTrans, scope, selectedMonth, walletFilter, cfg.defaultWalletId]);

  const comparisonTrans = (key, mode) => viewTrans.filter(item => {
    if (!matchesWallet(item)) return false;
    const date = dateOf(item);
    if (!date || item.kind === 'transfer') return false;
    if (mode === 'year') return date.getFullYear() === Number(key);
    const [year, month] = String(key).split('-').map(Number);
    return date.getFullYear() === year && date.getMonth() === month - 1;
  });
  const intelligenceDate = useMemo(() => (
    selectedMonthKey === currentMonthKey
      ? now
      : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0, 12)
  ), [selectedMonthKey, currentMonthKey, selectedMonth, now.getFullYear(), now.getMonth(), now.getDate()]);
  const walletScopedTrans = useMemo(
    () => viewTrans.filter(matchesWallet),
    [viewTrans, walletFilter, cfg.defaultWalletId],
  );
  const intelligence = useMemo(
    () => buildLeakInsights(walletScopedTrans, cats, intelligenceDate),
    [walletScopedTrans, cats, intelligenceDate],
  );
  const confidence = intelligence.history?.baselineMonthCount >= 6 && intelligence.history?.transactionCount >= 30
    ? 'high'
    : intelligence.history?.baselineMonthCount >= 2 && intelligence.history?.transactionCount >= 10 ? 'medium' : 'low';
  const snapshotWallets = walletFilter === 'all'
    ? scopedWallets
    : scopedWallets.filter(wallet => wallet.id === walletFilter);
  const reportDate = selectedMonthKey === currentMonthKey ? now : selectedMonth;
  const financialReport = useMemo(() => buildFinancialReport({
    trans: walletScopedTrans,
    debts: viewDebts,
    goals: viewGoals,
    wallets: snapshotWallets,
    commitments: viewCommitments,
    cats,
    currency: cfg.currency,
    defaultWalletId: cfg.defaultWalletId,
    scope,
  }, reportDate), [
    walletScopedTrans, viewDebts, viewGoals, snapshotWallets, viewCommitments, cats,
    cfg.currency, cfg.defaultWalletId, scope, reportDate,
  ]);
  const snapshot = financialReport;
  const periodCashFlow = financialReport.periodCashFlow;
  const stats = useMemo(() => {
    const active = financialReport.stats;
    const archived = walletFilter === 'all'
      ? scopedArchiveSummaries.filter(item => (
          scope === 'all' || (scope === 'year' && Number(item.year) === selectedMonth.getFullYear())
        ))
      : [];
    return archived.reduce((total, item) => ({
      inc: total.inc + Number(item.income || 0),
      exp: total.exp + Number(item.expense || 0),
      bal: total.bal + Number(item.net || 0),
    }), active);
  }, [financialReport.stats, scopedArchiveSummaries, scope, selectedMonth, walletFilter]);
  const activeCommitmentTotal = useMemo(
    () => viewCommitments
      .filter(item => item.active !== false)
      .reduce((sum, item) => sum + Number(item.amt || 0), 0),
    [viewCommitments],
  );
  const insightItems = useMemo(() => {
    const rows = [];
    if (scope === 'month' && selectedMonthKey === currentMonthKey && periodTrans.length >= 3) {
      const forecast = snapshot.forecast;
      rows.push({
        icon: forecast.projectedNet < 0 ? 'trending-down-outline' : 'analytics-outline',
        tone: forecast.projectedNet < 0 ? 'danger' : 'primary',
        text: cfg.lang === 'ar'
          ? `إذا استمر نفس النمط، صافي نهاية الشهر المتوقع ${forecast.projectedNet < 0 ? '-' : '+'}${money(forecast.projectedNet, cfg.lang, cfg.currency)} ${sym}.`
          : `At the current pace, projected month-end net is ${forecast.projectedNet < 0 ? '-' : '+'}${money(forecast.projectedNet, cfg.lang, cfg.currency)} ${sym}.`,
      });
    }
    if (intelligence.topLeak?.previousSpent > 0) {
      const cat = cfg.lang === 'ar' ? intelligence.topLeak.label : intelligence.topLeak.labelEn;
      rows.push({
        icon: 'trending-up-outline', tone: 'danger',
        legacyText: cfg.lang === 'ar'
          ? `أكبر ارتفاع عن الشهر السابق في ${cat || 'تصنيف'}: ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym}.`
          : `Projected spending in ${cat || 'a category'} is ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym} above your historical average.`,
        text: cfg.lang === 'ar'
          ? `\u0627\u0644\u0635\u0631\u0641 \u0627\u0644\u0645\u062a\u0648\u0642\u0639 \u0641\u064a ${cat || '\u062a\u0635\u0646\u064a\u0641'} \u0623\u0639\u0644\u0649 \u0645\u0646 \u0645\u062a\u0648\u0633\u0637 \u0633\u062c\u0644\u0643 \u0628\u0645\u0642\u062f\u0627\u0631 ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym}.`
          : `Projected spending in ${cat || 'a category'} is ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym} above your historical average.`,
      });
    }
    if (scope === 'month' && intelligence.topSpend?.spent > 0) {
      const cat = cfg.lang === 'ar' ? intelligence.topSpend.label : intelligence.topSpend.labelEn;
      rows.push({
        icon: 'pie-chart-outline', tone: 'warning',
        text: cfg.lang === 'ar'
          ? `${cat || 'أكبر تصنيف'} يمثل ${intelligence.topSpend.share}% من صرف هذا الشهر.`
          : `${cat || 'The top category'} represents ${intelligence.topSpend.share}% of this month's spending.`,
      });
    }
    if (stats.inc > 0) {
      const rate = Math.round(((stats.inc - stats.exp) / stats.inc) * 100);
      rows.push({
        icon: rate >= 0 ? 'shield-checkmark-outline' : 'alert-circle-outline',
        tone: rate >= 0 ? 'success' : 'danger',
        text: cfg.lang === 'ar' ? `نسبة الادخار/الفائض لهذه الفترة ${rate}%.` : `Savings/surplus rate for this period is ${rate}%.`,
      });
    }
    if (confidence === 'low') rows.push({ icon: 'information-circle-outline', tone: 'muted', text: C.needData });
    return rows.slice(0, 4);
  }, [scope, selectedMonthKey, currentMonthKey, periodTrans, snapshot, intelligence, stats, confidence, cfg.lang, cfg.currency, sym]);
  const debtInfo = useMemo(() => debtSummary(viewDebts), [debts, cfg.activeScope, cfg.profileType, modules.debtsOwed, modules.debtsReceivable]);
  const receivableInfo = useMemo(() => debtSummary(viewDebts, 'receivable'), [debts, cfg.activeScope, cfg.profileType, modules.debtsOwed, modules.debtsReceivable]);
  const categories = useMemo(() => {
    const rows = catSpend(periodTrans, cats).sort((a, b) => Number(b.spent || 0) - Number(a.spent || 0));
    const total = rows.reduce((sum, item) => sum + Number(item.spent || 0), 0);
    return rows.map((item, index) => ({
      ...item,
      color: item.color || CHART_COLORS[index % CHART_COLORS.length],
      percent: total ? Math.round((Number(item.spent || 0) / total) * 100) : 0,
    }));
  }, [periodTrans, cats]);
  const comparisonOptions = comparisonMode === 'month' ? monthOptions : yearOptions;
  const comparisonLimit = comparisonMode === 'month' ? 12 : 10;
  const comparisonSeries = useMemo(() => comparisonPeriods
    .map(key => {
      const option = comparisonOptions.find(item => item.value === key);
      const periodStats = calcStats(comparisonTrans(key, comparisonMode));
      return {
        key,
        label: option?.label || key,
        shortLabel: comparisonMode === 'month'
          ? (() => {
              const [year, month] = String(key).split('-').map(Number);
              return formatMonthLabel(year, month - 1, { style: monthStyle, length: 'short', svgSafe: true });
            })()
          : String(key),
        ...periodStats,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key)), [viewTrans, comparisonPeriods, comparisonMode, comparisonOptions, walletFilter, cfg.defaultWalletId, monthStyle]);

  const changeComparisonMode = (mode) => {
    setComparisonMode(mode);
    if (mode === 'none') return;
    if (mode === 'year') {
      setComparisonPeriods([String(selectedMonth.getFullYear()), String(selectedMonth.getFullYear() - 1)]);
    } else {
      setComparisonPeriods([selectedMonthKey, previousMonthKey]);
    }
  };
  const toggleComparisonPeriod = (value) => {
    setComparisonPeriods(current => current.includes(value)
      ? (current.length > 1 ? current.filter(item => item !== value) : current)
      : (current.length < comparisonLimit ? [...current, value] : current));
  };
  const shareOptions = [
    { value: 'summary', label: C.summarySection, icon: 'stats-chart-outline' },
    (modules.debtsOwed || modules.debtsReceivable) ? { value: 'debts', label: C.debtsSection, icon: 'card-outline' } : null,
    { value: 'categories', label: C.categoriesSection, icon: 'pie-chart-outline' },
    { value: 'transactions', label: C.transactionsSection, icon: 'receipt-outline' },
    comparisonMode !== 'none' && comparisonSeries.length
      ? { value: 'comparison_chart', label: `${C.comparisonChart} (${comparisonSeries.length})`, icon: 'analytics-outline' }
      : null,
    comparisonMode !== 'none' && comparisonSeries.length
      ? { value: 'comparison_details', label: `${C.comparisonDetails} (${comparisonSeries.length})`, icon: 'list-outline' }
      : null,
  ].filter(Boolean);

  const toggleShareSection = (value) => {
    setShareSections(current => current.includes(value)
      ? current.filter(item => item !== value)
      : [...current, value]);
  };

  const exportReport = async () => {
    const allowed = new Set(shareOptions.map(item => item.value));
    const selected = shareSections.filter(item => allowed.has(item));
    if (!selected.length) {
      Alert.alert('', C.selectAtLeastOne);
      return;
    }
    setSheet(null);
    try {
      await generateFinancialReportPDF({
        title: periodLabel,
        trans: periodTrans,
        cats,
        stats,
        debts: debtInfo,
        receivables: receivableInfo,
        debtRows: viewDebts.filter(item => item.direction !== 'receivable'),
        receivableRows: viewDebts.filter(item => item.direction === 'receivable'),
        topCategories: categories,
        comparison: comparisonSeries,
        cfg,
        sections: selected,
      });
    } catch {
      Alert.alert('', C.exportFailed);
    }
  };

  const selectPeriod = (value) => {
    if (/^\d{4}-\d{2}$/.test(value)) {
      setSelectedMonthKey(value);
      setScope('month');
    } else if (String(value).startsWith('year:')) {
      const year = Number(String(value).slice(5));
      setSelectedMonthKey(`${year}-${String(selectedMonth.getMonth() + 1).padStart(2, '0')}`);
      setScope('year');
    } else {
      setScope(value);
    }
    setSheet(null);
  };

  return (
    <>
      <ScrollView style={{ flex: 1, backgroundColor: th.bg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={s.screen}>
        <View style={[s.reportTopRow, { flexDirection: rowDir }]}>
          <TouchableOpacity
            onPress={() => setSheet('scope')}
            style={[s.periodCard, { flex: 1, backgroundColor: th.primaryContainer, borderColor: `${th.primary}45`, flexDirection: rowDir }]}
          >
            <View style={[s.periodIcon, { backgroundColor: th.primary }]}>
              <Ionicons name="calendar-outline" size={22} color={th.onPrimary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.periodLabel, { color: th.primary, textAlign: align }]}>
                {scope === 'month' ? C.monthPeriod : scope === 'year' ? C.yearPeriod : C.allTime}
              </Text>
              <Text
                style={[s.periodValue, { color: th.text, textAlign: align, writingDirection: writingDirectionFor(cfg.lang) }]}
                numberOfLines={1}
              >
                {periodLabel}
              </Text>
              <Text style={[s.periodHint, { color: th.faint, textAlign: align }]}>{C.periodHint}</Text>
            </View>
            <View style={[s.periodAction, { backgroundColor: th.primSoft }]}>
              <Ionicons name="options-outline" size={18} color={th.primary} />
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSheet('share')}
            accessibilityLabel={C.exportTitle}
            style={[s.shareCenterBtn, { backgroundColor: th.primary, borderColor: th.primary }]}
          >
            <Ionicons name="share-social-outline" size={21} color={th.onPrimary} />
            <Text style={[s.shareCenterLabel, { color: th.onPrimary }]}>{C.export}</Text>
          </TouchableOpacity>
        </View>

        {modules.wallets && walletOptions.length > 1 ? (
          <TouchableOpacity
            onPress={() => setSheet('wallet')}
            style={[s.walletFilterBar, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
          >
            <View style={[s.walletFilterIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="wallet-outline" size={17} color={th.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.walletFilterLabel, { color: th.sub, textAlign: align }]}>{C.walletScope}</Text>
              <Text style={[s.walletFilterValue, { color: th.text, textAlign: align }]} numberOfLines={1}>
                {walletOptions.find(item => item.value === walletFilter)?.label || C.allWallets}
              </Text>
            </View>
            <Ionicons name="chevron-down-outline" size={17} color={th.faint} />
          </TouchableOpacity>
        ) : null}

        {modules.wallets ? (
        <SectionCard
            th={th}
            title={C.liquidityTitle}
            subtitle={`${C.availableBalance}: ${money(snapshot.availableCash, cfg.lang, cfg.currency)} ${sym} · ${C.reservedSavings}: ${money(snapshot.reservedSavings, cfg.lang, cfg.currency)} ${sym}`}
            icon="wallet-outline"
            lang={cfg.lang}
          >
          {/* MYFI_REPORT_WALLET_INLINE */}
          <WalletBalanceCard
            cfg={cfg}
            compact
            summary={{
              physical: Number(snapshot?.cashBalance || 0),
              available: Number(snapshot?.availableCash || 0),
              reserved: Number(snapshot?.reservedSavings || 0),
            }}
            title={cfg.lang === 'ar' ? 'رصيد المحافظ بنهاية الفترة' : 'Wallet balance at period end'}
          />
            <View style={[s.summaryGrid, { flexDirection: rowDir, marginBottom: 0 }]}>
              <SummaryMetric label={C.physicalBalance} value={snapshot.cashBalance} color={th.text} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.reservedSavings} value={snapshot.reservedSavings} color={snapshot.reservedSavings > 0 ? th.warn : th.sub} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.availableBalance} value={snapshot.availableCash} color={snapshot.availableCash >= 0 ? th.inc : th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            </View>
            {walletFilter === 'all' ? (
              <View style={[s.netPositionRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                <Text style={[s.netPositionLabel, { color: th.sub, textAlign: align }]}>{C.netPosition}</Text>
                <Text style={[s.netPositionValue, { color: snapshot.netWorth >= 0 ? th.inc : th.exp }]}>
                  {money(snapshot.netWorth, cfg.lang, cfg.currency)} {sym}
                </Text>
              </View>
            ) : null}
          </SectionCard>
        ) : null}

        <SectionCard
          th={th}
          title={C.cashFlowTitle}
          subtitle={`${C.cashNet}: ${money(periodCashFlow.net, cfg.lang, cfg.currency)} ${sym}`}
          icon="swap-vertical-outline"
          lang={cfg.lang}
        >
          <Text style={[s.reportExplanation, { color: th.sub, textAlign: align }]}>{C.cashFlowHint}</Text>
          <View style={[s.summaryGrid, { flexDirection: rowDir, marginBottom: 0 }]}>
            <SummaryMetric label={C.cashIn} value={periodCashFlow.inflow} color={th.inc} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            <SummaryMetric label={C.cashOut} value={periodCashFlow.outflow} color={th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            <SummaryMetric label={C.cashNet} value={periodCashFlow.net} color={periodCashFlow.net >= 0 ? th.inc : th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
          </View>
        </SectionCard>

        {scope === 'month' && selectedMonthKey === currentMonthKey ? (
          <SectionCard
            th={th}
            title={C.forecastTitle}
            subtitle={C.forecastHint}
            icon="trending-up-outline"
            lang={cfg.lang}
          >
            <View style={[s.summaryGrid, { flexDirection: rowDir, marginBottom: 0 }]}>
              <SummaryMetric label={C.projectedExpense} value={snapshot.forecast.projected} color={snapshot.forecast.status === 'danger' ? th.exp : th.text} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.forecastCommitments} value={snapshot.forecast.remainingCommitments} color={th.warn} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.forecastAvailable} value={snapshot.forecast.availableToday} color={snapshot.forecast.availableToday >= 0 ? th.inc : th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            </View>
          </SectionCard>
        ) : null}

        {walletFilter === 'all' && (modules.debtsOwed || modules.debtsReceivable || modules.commitments) ? (
          <SectionCard
            th={th}
            title={C.debtsDueTitle}
            subtitle={`${C.owedRemaining}: ${money(snapshot.debts.remaining, cfg.lang, cfg.currency)} ${sym} · ${C.receivableRemaining}: ${money(snapshot.receivables.remaining, cfg.lang, cfg.currency)} ${sym}`}
            icon="card-outline"
            lang={cfg.lang}
          >
            <Text style={[s.reportExplanation, { color: th.sub, textAlign: align }]}>{C.debtsDueHint}</Text>
            <View style={[s.summaryGrid, { flexDirection: rowDir, marginBottom: 0 }]}>
              <SummaryMetric label={C.owedRemaining} value={snapshot.debts.remaining} color={th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.receivableRemaining} value={snapshot.receivables.remaining} color={th.inc} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.activeCommitments} value={activeCommitmentTotal} color={th.warn} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            </View>
          </SectionCard>
        ) : null}

        {walletFilter === 'all' && modules.goals ? (
          <SectionCard
            th={th}
            title={C.goalsTitle}
            subtitle={`${C.savedAmount}: ${money(snapshot.goals.saved, cfg.lang, cfg.currency)} ${sym} · ${C.goalRemaining}: ${money(snapshot.goals.remaining, cfg.lang, cfg.currency)} ${sym}`}
            icon="flag-outline"
            lang={cfg.lang}
          >
            <Text style={[s.reportExplanation, { color: th.sub, textAlign: align }]}>{C.goalsHint}</Text>
            <View style={[s.summaryGrid, { flexDirection: rowDir, marginBottom: 0 }]}>
              <SummaryMetric label={C.savedAmount} value={snapshot.goals.saved} color={th.primary} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.goalRemaining} value={snapshot.goals.remaining} color={th.warn} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
              <SummaryMetric label={C.goalTarget} value={snapshot.goals.target} color={th.text} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
            </View>
          </SectionCard>
        ) : null}

        <SectionCard th={th} title={C.smartTitle} subtitle={C.smartHint} icon="sparkles-outline" lang={cfg.lang}>
          <View style={s.insightList}>
            <View style={[s.confidenceRow, { flexDirection: rowDir, backgroundColor: th.cardHigh }]}>
              <Text style={[s.confidenceLabel, { color: th.sub, textAlign: align }]}>{C.confidence}</Text>
              <Text style={[s.confidenceValue, { color: confidence === 'high' ? th.inc : confidence === 'medium' ? th.warn : th.faint }]}>
                {confidence === 'high' ? C.confidenceHigh : confidence === 'medium' ? C.confidenceMedium : C.confidenceLow} · {intelligence.history?.transactionCount || 0}/{intelligence.history?.monthCount || 0}
              </Text>
            </View>
            {insightItems.map((item, index) => {
              const color = item.tone === 'danger' ? th.exp : item.tone === 'success' ? th.inc : item.tone === 'warning' ? th.warn : item.tone === 'muted' ? th.faint : th.primary;
              return (
                <View key={`${item.icon}-${index}`} style={[s.insightRow, { flexDirection: rowDir, borderColor: th.border }]}>
                  <View style={[s.insightIcon, { backgroundColor: `${color}1F` }]}><Ionicons name={item.icon} size={18} color={color} /></View>
                  <Text style={[s.insightText, { color: th.text, textAlign: align, writingDirection: writingDirectionFor(cfg.lang) }]}>{item.text}</Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard th={th} title={C.topSpending} subtitle={C.topSpendingHint} icon="pie-chart-outline" lang={cfg.lang}>
          {categories.length ? (
            <View style={s.categoryList}>
              {categories.slice(0, 5).map(item => (
                <CategoryRow key={item.id} item={item} th={th} lang={cfg.lang} sym={sym} />
              ))}
            </View>
          ) : <Empty th={th} text={C.noData} />}
        </SectionCard>

        {/* MYFI_COMPARISON_PRO_V3 */}
        <SectionCard
          th={th}
          title={C.comparisonTitle}
          subtitle={C.comparisonSubtitle}
          icon="git-compare-outline"
          lang={cfg.lang}
        >
          <View style={[s.proCompareModeBar, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
            {[
              { value: 'month', label: C.monthlyComparison, icon: 'calendar-outline' },
              { value: 'year', label: C.annualComparison, icon: 'calendar-number-outline' },
            ].map(option => {
              const active = comparisonMode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => changeComparisonMode(option.value)}
                  style={[
                    s.proCompareModeBtn,
                    {
                      backgroundColor: active ? th.card : 'transparent',
                      borderColor: active ? th.border : 'transparent',
                      flexDirection: rowDir,
                    },
                  ]}
                >
                  <Ionicons name={option.icon} size={16} color={active ? th.primary : th.sub} />
                  <Text style={[s.proCompareModeText, { color: active ? th.primary : th.sub }]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {comparisonMode === 'none' ? (
            <TouchableOpacity
              onPress={() => changeComparisonMode('month')}
              style={[s.proCompareEmpty, { backgroundColor: th.cardHigh, borderColor: th.border }]}
            >
              <View style={[s.proCompareHeroIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="git-compare-outline" size={23} color={th.primary} />
              </View>
              <Text style={[s.proCompareEmptyTitle, { color: th.text }]}>
                {C.addComparison}
              </Text>
              <Text style={[s.proCompareEmptyHint, { color: th.sub }]}>
                {C.startComparisonHint}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setSheet('comparisonPeriods')}
                style={[
                  s.proComparePicker,
                  {
                    backgroundColor: th.cardHigh,
                    borderColor: th.border,
                    flexDirection: rowDir,
                  },
                ]}
              >
                <View style={[s.proComparePickerIcon, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="calendar-clear-outline" size={18} color={th.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.proComparePickerLabel, { color: th.sub, textAlign: align }]}>
                    {C.selectedPeriodsLabel}
                  </Text>
                  <Text
                    style={[s.proComparePickerValue, { color: th.text, textAlign: align }]}
                    numberOfLines={3}
                    adjustsFontSizeToFit
                    minimumFontScale={0.82}
                  >
                    {comparisonPeriods
                      .map(value => comparisonOptions.find(option => option.value === value)?.label || value)
                      .join(' · ')}
                  </Text>
                </View>
                <View style={[s.proCompareEditPill, { backgroundColor: th.primSoft }]}>
                  <Text style={[s.proCompareEditText, { color: th.primary }]}>{C.editPeriods}</Text>
                  <Ionicons name="chevron-down" size={14} color={th.primary} />
                </View>
              </TouchableOpacity>

              <View style={[s.proCompareViewBar, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {[
                  { value: 'chart', label: C.chartView, icon: 'analytics-outline' },
                  { value: 'details', label: C.detailsView, icon: 'list-outline' },
                ].map(option => {
                  const active = comparisonView === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setComparisonView(option.value)}
                      style={[
                        s.proCompareViewBtn,
                        {
                          backgroundColor: active ? th.primary : 'transparent',
                          flexDirection: rowDir,
                        },
                      ]}
                    >
                      <Ionicons name={option.icon} size={15} color={active ? th.onPrimary : th.sub} />
                      <Text style={[s.proCompareViewText, { color: active ? th.onPrimary : th.sub }]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {comparisonSeries.length ? (
                comparisonView === 'chart' ? (
                  <View style={[s.proCompareResultBox, { borderColor: th.border }]}>
                    <TouchableOpacity
                      onPress={() => setComparisonExpanded(true)}
                      style={[s.proCompareExpandBtn, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}
                    >
                      <Ionicons name="expand-outline" size={15} color={th.primary} />
                      <Text style={[s.proCompareExpandText, { color: th.primary }]}>{C.expandChart}</Text>
                    </TouchableOpacity>
                    <TrendChart data={comparisonSeries} th={th} lang={cfg.lang} />
                    <View style={[s.legend, { flexDirection: rowDir }]}>
                      <Legend color={th.inc} label={C.income} th={th} />
                      <Legend color={th.exp} label={C.expense} th={th} />
                    </View>
                  </View>
                ) : (
                  <View style={s.proCompareDetails}>
                    {comparisonSeries.map((item, index) => (
                      <View
                        key={item.key}
                        style={[
                          s.proComparePeriodCard,
                          {
                            backgroundColor: th.cardHigh,
                            borderColor: index === comparisonSeries.length - 1 ? `${th.primary}55` : th.border,
                          },
                        ]}
                      >
                        <View style={[s.proComparePeriodHead, { flexDirection: rowDir }]}>
                          <View style={[s.proComparePeriodMark, { backgroundColor: th.primSoft }]}>
                            <Ionicons
                              name={comparisonMode === 'month' ? 'calendar-outline' : 'calendar-number-outline'}
                              size={16}
                              color={th.primary}
                            />
                          </View>
                          <Text style={[s.proComparePeriodTitle, { color: th.text, textAlign: align }]}>
                            {item.label}
                          </Text>
                          {index === comparisonSeries.length - 1 ? (
                            <View style={[s.proCompareLatest, { backgroundColor: th.primSoft }]}>
                              <Text style={[s.proCompareLatestText, { color: th.primary }]}>
                                {ar ? 'الأحدث' : 'Latest'}
                              </Text>
                            </View>
                          ) : null}
                        </View>

                        <View style={[s.proCompareMetrics, { flexDirection: rowDir }]}>
                          <View style={[s.proCompareMetric, { borderColor: th.border }]}>
                            <Text style={[s.proCompareMetricLabel, { color: th.sub }]}>{C.income}</Text>
                            <Text style={[s.proCompareMetricValue, { color: th.inc }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                              {money(item.inc, cfg.lang, cfg.currency)} {sym}
                            </Text>
                          </View>
                          <View style={[s.proCompareMetric, { borderColor: th.border }]}>
                            <Text style={[s.proCompareMetricLabel, { color: th.sub }]}>{C.expense}</Text>
                            <Text style={[s.proCompareMetricValue, { color: th.exp }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                              {money(item.exp, cfg.lang, cfg.currency)} {sym}
                            </Text>
                          </View>
                          <View style={[s.proCompareMetric, { borderColor: th.border }]}>
                            <Text style={[s.proCompareMetricLabel, { color: th.sub }]}>
                              {ar ? 'صافي الدخل' : 'Net income'}
                            </Text>
                            <Text
                              style={[s.proCompareMetricValue, { color: item.bal >= 0 ? th.inc : th.exp }]}
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                            >
                              {money(item.bal, cfg.lang, cfg.currency)} {sym}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )
              ) : <Empty th={th} text={C.noComparison} />}

              <TouchableOpacity
                onPress={() => changeComparisonMode('none')}
                style={[s.proCompareRemove, { borderColor: th.border, flexDirection: rowDir }]}
              >
                <Ionicons name="close-circle-outline" size={16} color={th.sub} />
                <Text style={[s.proCompareRemoveText, { color: th.sub }]}>{C.removeComparison}</Text>
              </TouchableOpacity>
            </>
          )}
        </SectionCard>
      </ScrollView>

      <ReportPeriodSheet
        visible={sheet === 'scope'}
        onClose={() => setSheet(null)}
        onSelect={selectPeriod}
        scope={scope}
        selectedMonthKey={selectedMonthKey}
        yearOptions={yearOptions}
        monthNamesList={fullMonths}
        th={th}
        lang={cfg.lang}
      />
      <ChoiceSheet
        visible={sheet === 'wallet'}
        title={C.walletScope}
        options={walletOptions}
        value={walletFilter}
        onSelect={value => setWalletFilter(value)}
        onClose={() => setSheet(null)}
        th={th}
        lang={cfg.lang}
      />

      <ComparisonPeriodSheet
        visible={sheet === 'comparisonPeriods'}
        onClose={() => setSheet(null)}
        options={comparisonOptions}
        values={comparisonPeriods}
        onToggle={toggleComparisonPeriod}
        limit={comparisonLimit}
        mode={comparisonMode}
        monthStyle={monthStyle}
        th={th}
        lang={cfg.lang}
      />
<ReportShareSheet
        visible={sheet === 'share'}
        onClose={() => setSheet(null)}
        onShare={exportReport}
        options={shareOptions}
        values={shareSections}
        onToggle={toggleShareSection}
        onSelectAll={() => setShareSections(shareOptions.map(item => item.value))}
        onClear={() => setShareSections([])}
        th={th}
        lang={cfg.lang}
      />
      <Modal visible={comparisonExpanded} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setComparisonExpanded(false)}>
        <View style={[s.expandedChartOverlay, { backgroundColor: th.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setComparisonExpanded(false)} />
          <View style={[s.expandedChartPanel, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.expandedChartHead, { flexDirection: rowDir }]}>
              <View style={[s.expandedChartIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="analytics-outline" size={19} color={th.primary} />
              </View>
              <Text style={[s.expandedChartTitle, { color: th.text, textAlign: align }]}>{C.comparisonTitle}</Text>
              <TouchableOpacity onPress={() => setComparisonExpanded(false)} style={[s.expandedChartClose, { backgroundColor: th.cardHigh }]}>
                <Ionicons name="chevron-down" size={18} color={th.sub} />
              </TouchableOpacity>
            </View>
            <TrendChart data={comparisonSeries} th={th} lang={cfg.lang} expanded />
            <View style={[s.legend, { flexDirection: rowDir }]}>
              <Legend color={th.inc} label={C.income} th={th} />
              <Legend color={th.exp} label={C.expense} th={th} />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ComparisonPeriodSheet({ visible, onClose, options, values, onToggle, limit, mode, monthStyle = 'numeric', th, lang }) {
  const ar = lang === 'ar';
  const C = copy(lang);
  const currentYear = new Date().getFullYear();
  const selectedYears = values
    .map(value => Number(String(value).slice(0, 4)))
    .filter(Number.isFinite);
  const [year, setYear] = useState(selectedYears[selectedYears.length - 1] || currentYear);

  useEffect(() => {
    if (!visible) return;
    const nextYears = values
      .map(value => Number(String(value).slice(0, 4)))
      .filter(Number.isFinite);
    setYear(nextYears[nextYears.length - 1] || currentYear);
  }, [visible, mode]);

  const years = useMemo(() => {
    const set = new Set();
    options.forEach(option => {
      const y = Number(String(option.value).slice(0, 4));
      if (Number.isFinite(y)) set.add(y);
    });
    if (!set.size) Array.from({ length: 10 }, (_, index) => set.add(currentYear - index));
    return [...set].sort((a, b) => b - a);
  }, [options, currentYear]);

  const monthOptionsForYear = useMemo(() => {
    if (mode !== 'month') return [];
    return Array.from({ length: 12 }, (_, index) => {
      const value = `${year}-${String(index + 1).padStart(2, '0')}`;
      const option = options.find(item => item.value === value);
      return {
        value,
        label: option?.label || formatMonthLabel(year, index, { style: monthStyle, length: 'short' }),
        monthLabel: monthNames({ style: monthStyle, length: 'long' })[index],
      };
    });
  }, [mode, year, options, monthStyle]);

  const selectedCount = values.length;
  const canSelectMore = selectedCount < limit;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[s.periodOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.proCompareSheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.proCompareSheetHandle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.proCompareSheetHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={[s.proCompareSheetIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="git-compare-outline" size={20} color={th.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.proCompareSheetTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>
                {C.choosePeriods}
              </Text>
              <Text style={[s.proCompareSheetHint, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>
                {mode === 'month' ? C.monthlyLimit : C.annualLimit}
              </Text>
            </View>
            <View style={[s.proCompareSheetCount, { backgroundColor: th.primSoft }]}>
              <Text style={[s.proCompareSheetCountText, { color: th.primary }]}>
                {selectedCount}/{limit}
              </Text>
            </View>
          </View>

          {mode === 'month' ? (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ direction: ar ? 'rtl' : 'ltr' }}
                contentContainerStyle={s.proCompareYearRail}
              >
                {years.map(item => {
                  const active = year === item;
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => setYear(item)}
                      style={[
                        s.proCompareYearChip,
                        {
                          backgroundColor: active ? th.primary : th.cardHigh,
                          borderColor: active ? th.primary : th.border,
                        },
                      ]}
                    >
                      <Text style={[s.proCompareYearText, { color: active ? th.onPrimary : th.text }]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.proCompareMonthScroll}
              >
                <View style={s.proCompareMonthGrid}>
                  {monthOptionsForYear.map(option => {
                    const active = values.includes(option.value);
                    const disabled = !active && !canSelectMore;
                    return (
                      <TouchableOpacity
                        key={option.value}
                        disabled={disabled}
                        onPress={() => onToggle(option.value)}
                        style={[
                          s.proCompareMonthTile,
                          {
                            backgroundColor: active ? th.primSoft : th.cardHigh,
                            borderColor: active ? th.primary : th.border,
                            opacity: disabled ? 0.42 : 1,
                          },
                        ]}
                      >
                        <View
                          style={[
                            s.proCompareMonthCheck,
                            {
                              backgroundColor: active ? th.primary : 'transparent',
                              borderColor: active ? th.primary : th.border,
                            },
                          ]}
                        >
                          {active ? <Ionicons name="checkmark" size={12} color={th.onPrimary} /> : null}
                        </View>
                        <Text
                          numberOfLines={2}
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                          style={[s.proCompareMonthText, { color: active ? th.primary : th.text }]}
                        >
                          {option.monthLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.proCompareMonthScroll}>
              <View style={s.proCompareYearGrid}>
                {years.map(item => {
                  const value = String(item);
                  const active = values.includes(value);
                  const disabled = !active && !canSelectMore;
                  return (
                    <TouchableOpacity
                      key={value}
                      disabled={disabled}
                      onPress={() => onToggle(value)}
                      style={[
                        s.proCompareYearTile,
                        {
                          backgroundColor: active ? th.primSoft : th.cardHigh,
                          borderColor: active ? th.primary : th.border,
                          opacity: disabled ? 0.42 : 1,
                        },
                      ]}
                    >
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'calendar-number-outline'}
                        size={18}
                        color={active ? th.primary : th.sub}
                      />
                      <Text style={[s.proCompareYearTileText, { color: active ? th.primary : th.text }]}>
                        {item}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <View style={[s.proCompareSheetFooter, { borderTopColor: th.border }]}>
            <Text style={[s.proCompareSelectionSummary, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>
              {C.selectedPeriodsLabel}: {selectedCount}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={[s.proCompareDoneBtn, { backgroundColor: th.primary }]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color={th.onPrimary} />
              <Text style={[s.proCompareDoneText, { color: th.onPrimary }]}>
                {C.done}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ReportShareSheet({ visible, onClose, onShare, options, values, onToggle, onSelectAll, onClear, th, lang }) {
  const ar = lang === 'ar';
  const C = copy(lang);
  const selectedCount = options.filter(item => values.includes(item.value)).length;
  const allSelected = options.length > 0 && selectedCount === options.length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.shareOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.shareSheet, { backgroundColor: th.card }]}>
          <View style={[s.shareHandle, { backgroundColor: th.cardHigh }]} />
          <View style={[s.shareHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={[s.shareHeadIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="share-social-outline" size={19} color={th.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.shareTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{C.exportTitle}</Text>
              <Text style={[s.shareSubtitle, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{C.selectContent}</Text>
            </View>
          </View>

          <View style={[s.shareBulk, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={allSelected ? onClear : onSelectAll} style={[s.shareBulkBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name={allSelected ? 'checkbox' : 'checkbox-outline'} size={16} color={th.primary} />
              <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{allSelected ? C.clearAll : C.selectAll}</Text>
            </TouchableOpacity>
            <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{selectedCount}/{options.length}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: 4 }}>
            {options.map(option => {
              const active = values.includes(option.value);
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => onToggle(option.value)}
                  style={[s.shareOption, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border, flexDirection: ar ? 'row-reverse' : 'row' }]}
                >
                  <View style={[s.shareOptionIcon, { backgroundColor: active ? th.primary : th.card }]}>
                    <Ionicons name={option.icon} size={18} color={active ? th.onPrimary : th.sub} />
                  </View>
                  <Text style={[s.shareOptionText, { color: active ? th.primary : th.text, textAlign: ar ? 'right' : 'left' }]}>{option.label}</Text>
                  <View style={[s.shareCheck, { backgroundColor: active ? th.primary : 'transparent', borderColor: active ? th.primary : th.border }]}>
                    {active ? <Ionicons name="checkmark" size={13} color={th.onPrimary} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <TouchableOpacity
            disabled={!selectedCount}
            onPress={onShare}
            style={[s.shareSubmit, { backgroundColor: th.primary, opacity: selectedCount ? 1 : 0.45 }]}
          >
            <Ionicons name="document-text-outline" size={18} color={th.onPrimary} />
            <Text style={{ color: th.onPrimary, fontSize: 14, ...weight('900') }}>{C.sharePdf}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function ReportPeriodSheet({ visible, onClose, onSelect, scope, selectedMonthKey, yearOptions, monthNamesList, th, lang }) {
  const ar = lang === 'ar';
  const C = copy(lang);
  const selectedYear = Number(String(selectedMonthKey).slice(0, 4)) || new Date().getFullYear();
  const [mode, setMode] = useState(scope);
  const [monthYear, setMonthYear] = useState(selectedYear);
  const monthNamesListSafe = Array.isArray(monthNamesList) && monthNamesList.length === 12
    ? monthNamesList
    : monthNames({ style: 'numeric', length: 'long' });
  const years = useMemo(
    () => yearOptions.map(option => Number(option.value)).filter(Number.isFinite),
    [yearOptions],
  );

  useEffect(() => {
    if (!visible) return;
    setMode(scope);
    setMonthYear(selectedYear);
  }, [visible, scope, selectedYear]);

  const modes = [
    { value: 'month', label: C.monthPeriod, icon: 'calendar-outline' },
    { value: 'year', label: C.yearPeriod, icon: 'calendar-number-outline' },
    { value: 'all', label: C.allTime, icon: 'infinite-outline' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[s.periodOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.periodSheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.periodSheetHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={[s.periodSheetMark, { backgroundColor: th.primSoft }]}>
              <Ionicons name="calendar-outline" size={20} color={th.primary} />
            </View>
            <Text style={[s.periodSheetTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{C.choosePeriod}</Text>
          </View>

          <View style={[s.periodModes, { backgroundColor: th.cardHigh, flexDirection: ar ? 'row-reverse' : 'row' }]}>
            {modes.map(option => {
              const active = mode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setMode(option.value)}
                  style={[s.periodMode, { backgroundColor: active ? th.primary : 'transparent' }]}
                >
                  <Ionicons name={option.icon} size={16} color={active ? th.onPrimary : th.sub} />
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    style={[s.periodModeText, { color: active ? th.onPrimary : th.sub }]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {mode === 'month' ? (
            <>
              <Text style={[s.periodGroupLabel, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{C.chooseYear}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.yearRail}>
                {years.map(year => {
                  const active = monthYear === year;
                  return (
                    <TouchableOpacity
                      key={year}
                      onPress={() => setMonthYear(year)}
                      style={[s.yearChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                    >
                      <Text style={[s.yearChipText, { color: active ? th.primary : th.sub }]}>{year}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              <View style={s.monthGrid}>
                {monthNamesListSafe.map((label, index) => {
                  const value = `${monthYear}-${String(index + 1).padStart(2, '0')}`;
                  const active = scope === 'month' && selectedMonthKey === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => onSelect(value)}
                      style={[s.monthTile, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                    >
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        style={[s.monthTileText, { color: active ? th.primary : th.text }]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}

          {mode === 'year' ? (
            <View style={s.yearGrid}>
              {years.map(year => {
                const active = scope === 'year' && selectedYear === year;
                return (
                  <TouchableOpacity
                    key={year}
                    onPress={() => onSelect(`year:${year}`)}
                    style={[s.yearTile, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                  >
                    <Text style={[s.yearTileText, { color: active ? th.primary : th.text }]}>{year}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {mode === 'all' ? (
            <TouchableOpacity
              onPress={() => onSelect('all')}
              style={[s.allPeriod, { backgroundColor: scope === 'all' ? th.primSoft : th.cardHigh, borderColor: scope === 'all' ? th.primary : 'transparent' }]}
            >
              <View style={[s.allPeriodIcon, { backgroundColor: th.card }]}>
                <Ionicons name="infinite-outline" size={27} color={th.primary} />
              </View>
              <Text style={[s.allPeriodTitle, { color: th.text }]}>{C.allTime}</Text>
              <Text style={[s.allPeriodHint, { color: th.sub }]}>{C.allTimeDetail}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function SectionCard({ th, title, subtitle, icon, lang, children, defaultExpanded = false }) {
  const ar = lang === 'ar';
  const [expanded, setExpanded] = useState(defaultExpanded);
  const C = copy(lang);
  return (
    <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={expanded ? C.collapseSection : C.expandSection}
        onPress={() => setExpanded(value => !value)}
        style={[s.sectionHead, { flexDirection: ar ? 'row-reverse' : 'row', marginBottom: expanded ? 15 : 0 }]}
      >
        <View style={[s.sectionIcon, { backgroundColor: th.primSoft }]}>
          <Ionicons name={icon} size={18} color={th.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
          {!!subtitle && <Text style={[s.sectionSubtitle, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{subtitle}</Text>}
        </View>
        <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={18} color={th.faint} />
      </TouchableOpacity>
      {expanded ? children : null}
    </View>
  );
}

function SummaryMetric({ label, value, color, th, lang, currency, sym }) {
  return (
    <View style={[s.summaryMetric, { backgroundColor: th.card, borderColor: th.border }]}>
      <Text style={[s.summaryMetricLabel, { color: th.sub }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.summaryMetricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {money(value, lang, currency)} {sym}
      </Text>
    </View>
  );
}

function ComparisonMetric({ label, value, color, lang, currency, sym }) {
  return (
    <View style={s.comparisonMetric}>
      <Text style={[s.comparisonMetricLabel, { color }]}>{label}</Text>
      <Text style={[s.comparisonMetricValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.68}>{money(value, lang, currency)} {sym}</Text>
    </View>
  );
}

function TrendChart({ data, th, lang, expanded = false }) {
  const width = Math.max(expanded ? 620 : 360, data.length * (expanded ? 156 : 128));
  const height = expanded ? 250 : 190;
  const top = 24;
  const bottom = expanded ? 205 : 150;
  const max = Math.max(1, ...data.flatMap(item => [item.inc, item.exp]));
  const step = width / data.length;
  const barHeight = expanded ? 148 : 98;
  const labelY = expanded ? 232 : 176;
  const gridStep = (bottom - top) / 2;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chartScroll}>
      <View style={[s.chartWrap, { width }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2].map(index => <Line key={index} x1="0" x2={width} y1={top + index * gridStep} y2={top + index * gridStep} stroke={th.border} strokeWidth="1" />)}
        {data.map((item, index) => {
          const x = index * step;
          const incomeHeight = (Number(item.inc || 0) / max) * barHeight;
          const expenseHeight = (Number(item.exp || 0) / max) * barHeight;
          const incomeY = bottom - incomeHeight;
          const expenseY = bottom - expenseHeight;
          return (
            <React.Fragment key={`${item.label}-${index}`}>
              <SvgText x={x + 34} y={Math.max(13, incomeY - 5)} fontSize="10" fill={th.inc} textAnchor="middle">{chartMoney(item.inc)}</SvgText>
              <SvgText x={x + 94} y={Math.max(13, expenseY - 5)} fontSize="10" fill={th.exp} textAnchor="middle">{chartMoney(item.exp)}</SvgText>
              <Rect x={x + 24} y={incomeY} width="20" height={Math.max(2, incomeHeight)} rx="4" fill={th.inc} opacity=".88" />
              <Rect x={x + 84} y={expenseY} width="20" height={Math.max(2, expenseHeight)} rx="4" fill={th.exp} opacity=".78" />
              <SvgText x={x + 64} y={labelY} fontSize={expanded ? '12' : '11'} fill={th.sub} textAnchor="middle">{item.shortLabel || item.label}</SvgText>
            </React.Fragment>
          );
        })}
      </Svg>
      </View>
    </ScrollView>
  );
}

function Legend({ color, label, th }) {
  return (
    <View style={s.legendItem}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={[s.legendText, { color: th.sub }]}>{label}</Text>
    </View>
  );
}

function CategoryRow({ item, th, lang, sym }) {
  const ar = lang === 'ar';
  const label = (ar ? item.label : item.labelEn) || item.label || item.labelEn;
  return (
    <View style={s.categoryRow}>
      <View style={[s.categoryHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <View style={[s.categoryIdentity, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
          <View style={[s.categoryDot, { backgroundColor: item.color }]} />
          <Text style={[s.categoryName, { color: th.text, textAlign: ar ? 'right' : 'left' }]} numberOfLines={1}>{label}</Text>
        </View>
        <View style={{ alignItems: ar ? 'flex-start' : 'flex-end' }}>
          <Text style={[s.categoryAmount, { color: th.text }]}>{money(item.spent, lang)} {sym}</Text>
          <Text style={[s.categoryPercent, { color: th.sub }]}>{item.percent}%</Text>
        </View>
      </View>
      <View style={[s.track, { backgroundColor: th.cardHigh }]}>
        <View style={[s.fill, { backgroundColor: item.color, width: `${Math.min(100, item.percent)}%`, alignSelf: ar ? 'flex-end' : 'flex-start' }]} />
      </View>
    </View>
  );
}

function Empty({ th, text }) {
  return (
    <View style={[s.empty, { borderColor: th.border }]}>
      <Ionicons name="analytics-outline" size={22} color={th.faint} />
      <Text style={[s.emptyText, { color: th.sub }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 92 },
  reportTopRow: { alignItems: 'stretch', gap: 8 },
  shareCenterBtn: { width: 58, minHeight: 78, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 10, ...SHADOW.card },
  shareCenterLabel: { fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: 'center' },
  periodCard: { minHeight: 78, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center', gap: 10, marginBottom: 10, overflow: 'hidden', ...SHADOW.card },
  periodIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { fontSize: 11, lineHeight: 16, ...weight('800') },
  periodValue: { fontSize: 16, lineHeight: 22, ...weight('900'), marginTop: 0 },
  periodHint: { fontSize: 10, lineHeight: 14, ...weight('700'), marginTop: 0 },
  periodAction: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { gap: 7, marginBottom: 10 },
  walletFilterBar: { minHeight: 50, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', gap: 9, marginBottom: 10, ...SHADOW.card },
  walletFilterIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  walletFilterLabel: { fontSize: 11, lineHeight: 16, ...weight('800') },
  walletFilterValue: { fontSize: 13, lineHeight: 19, ...weight('900'), marginTop: 1 },
  netPositionRow: { minHeight: 42, borderRadius: RADIUS.md, paddingHorizontal: 11, marginTop: 10, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  netPositionLabel: { flex: 1, fontSize: 12, ...weight('800') },
  netPositionValue: { fontSize: 13, ...weight('900') },
  reportExplanation: { fontSize: 11, lineHeight: 18, ...weight('700'), marginBottom: 10 },
  summaryMetric: { flex: 1, minWidth: 0, minHeight: 66, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 9, justifyContent: 'center', ...SHADOW.card },
  summaryMetricLabel: { fontSize: 11, lineHeight: 16, ...weight('800'), textAlign: 'center' },
  summaryMetricValue: { fontSize: 14, lineHeight: 21, ...weight('900'), textAlign: 'center', marginTop: 4 },
  insightList: { gap: 8 },
  confidenceRow: { minHeight: 38, borderRadius: RADIUS.md, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  confidenceLabel: { flex: 1, fontSize: 11, lineHeight: 16, ...weight('800') },
  confidenceValue: { fontSize: 11, lineHeight: 16, ...weight('900') },
  insightRow: { minHeight: 54, borderRadius: RADIUS.md, borderWidth: 1, padding: 10, alignItems: 'center', gap: 10 },
  insightIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  insightText: { flex: 1, fontSize: 12, lineHeight: 19, ...weight('700') },
  periodOverlay: { flex: 1, justifyContent: 'flex-end' },
  periodSheet: { maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 18, paddingBottom: 28, ...SHADOW.card },
  periodSheetHead: { alignItems: 'center', gap: 10, marginBottom: 14 },
  periodSheetMark: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  periodSheetTitle: { flex: 1, fontSize: 17, lineHeight: 23, ...weight('900') },
  periodModes: { borderRadius: RADIUS.lg, padding: 4, gap: 4, marginBottom: 16 },
  periodMode: { flex: 1, minWidth: 0, minHeight: 50, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 3, paddingHorizontal: 4 },
  periodModeText: { fontSize: 11, lineHeight: 16, textAlign: 'center', ...weight('900') },
  periodGroupLabel: { fontSize: 12, lineHeight: 18, ...weight('800'), marginBottom: 8 },
  yearRail: { gap: 8, paddingBottom: 14 },
  yearChip: { minWidth: 72, minHeight: 38, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  yearChipText: { fontSize: 12, lineHeight: 17, ...weight('900') },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8 },
  monthTile: { width: '31.8%', minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  monthTileText: { fontSize: 12, lineHeight: 18, textAlign: 'center', ...weight('900') },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 9 },
  yearTile: { width: '31.8%', minHeight: 52, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  yearTileText: { fontSize: 14, lineHeight: 20, ...weight('900') },
  allPeriod: { minHeight: 170, borderRadius: RADIUS.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  allPeriodIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  allPeriodTitle: { fontSize: 17, lineHeight: 23, ...weight('900') },
  allPeriodHint: { fontSize: 12, lineHeight: 18, textAlign: 'center', ...weight('700'), marginTop: 4 },
  compareFieldLabel: { fontSize: 12, ...weight('800') },
  comparisonPanel: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14, marginBottom: 12, ...SHADOW.card },
  addComparisonCard: { minHeight: 58, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', gap: 10, marginBottom: 12, ...SHADOW.card },
  addComparisonLabel: { flex: 1, fontSize: 13, ...weight('900') },
  comparisonHead: { alignItems: 'center', gap: 8, marginBottom: 12 },
  comparisonIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  comparisonRemoveBtn: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  comparisonModes: { borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: 10 },
  comparisonModeBtn: { flex: 1, minHeight: 44, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  comparisonViewSwitch: { borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: 12 },
  comparisonViewBtn: { flex: 1, minHeight: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', gap: 6 },
  comparisonViewText: { fontSize: 12, ...weight('900') },
  periodPicker: { minHeight: 68, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9, alignItems: 'center', gap: 10, marginBottom: 12 },
  periodPickerValue: { fontSize: 13, lineHeight: 18, ...weight('900'), marginTop: 2 },
  periodPickerHint: { fontSize: 12, lineHeight: 17, ...weight('700'), marginTop: 2 },
  periodCardTitle: { fontSize: 13, lineHeight: 18, ...weight('900'), marginBottom: 7 },
  comparisonMetric: { flex: 1, minWidth: 0, marginBottom: 6 },
  comparisonMetricLabel: { fontSize: 12, lineHeight: 16, ...weight('800') },
  comparisonMetricValue: { fontSize: 13, lineHeight: 18, ...weight('900'), marginTop: 1 },
  comparisonDetails: { gap: 8 },
  comparisonDetailRow: { borderRadius: RADIUS.md, borderWidth: 1, padding: 12 },
  comparisonDetailHead: { alignItems: 'center', marginBottom: 10 },
  comparisonDetailMetrics: { gap: 10 },
  card: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 12, marginBottom: 10, ...SHADOW.card },
  sectionHead: { alignItems: 'center', gap: 9, marginBottom: 12 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, lineHeight: 21, ...weight('900') },
  sectionSubtitle: { fontSize: 12, lineHeight: 18, ...weight('700'), marginTop: 2 },
  chartScroll: { paddingVertical: 2 },
  chartWrap: { alignItems: 'flex-start', overflow: 'hidden' },
  legend: { justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 14, marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 3 },
  legendText: { fontSize: 11, ...weight('800') },
  categoryList: { gap: 16 },
  categoryRow: { gap: 8 },
  categoryHead: { alignItems: 'center', gap: 12 },
  categoryIdentity: { flex: 1, alignItems: 'center', gap: 8 },
  categoryDot: { width: 10, height: 10, borderRadius: 4 },
  categoryName: { flex: 1, fontSize: 12, ...weight('900') },
  categoryAmount: { fontSize: 12, ...weight('900') },
  categoryPercent: { fontSize: 11, ...weight('800'), marginTop: 1 },
  track: { height: 7, borderRadius: 8, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 8 },
  shareOverlay: { flex: 1, justifyContent: 'flex-end' },
  shareSheet: { maxHeight: '82%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 24, ...SHADOW.card },
  shareHandle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  shareHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  shareHeadIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shareTitle: { fontSize: 17, lineHeight: 23, ...weight('900') },
  shareSubtitle: { fontSize: 12, lineHeight: 18, ...weight('700'), marginTop: 2 },
  shareBulk: { minHeight: 38, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  shareBulkBtn: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  shareOption: { minHeight: 58, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', gap: 10, marginBottom: 7 },
  shareOptionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shareOptionText: { flex: 1, fontSize: 13, lineHeight: 19, ...weight('900') },
  shareCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareSubmit: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.lg, minHeight: 96, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', ...weight('700') },
  comparisonActionRow: { alignItems: 'center', gap: 8, marginBottom: 10 },
  compareStartBtn: { minHeight: 72, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center', gap: 10 },
  compareStartIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  compareStartTitle: { fontSize: 13, lineHeight: 19, ...weight('900') },
  compareStartHint: { fontSize: 11, lineHeight: 16, ...weight('700'), marginTop: 2 },
  comparePickerIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },

  compareSheetSubtitle: { fontSize: 11, lineHeight: 16, ...weight('700'), marginTop: 2 },
  compareCountPill: { minWidth: 48, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 9 },
  compareCountText: { fontSize: 11, ...weight('900') },
  comparePeriodsScroll: { paddingTop: 4, paddingBottom: 10, gap: 7 },
  comparePeriodOption: { minHeight: 56, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', gap: 10 },
  comparePeriodOptionIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  comparePeriodText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, ...weight('900') },
  comparePeriodCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  compareDone: { minHeight: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, marginTop: 4 },
  compareDoneText: { fontSize: 13, ...weight('900') },

  /* MYFI_COMPARE_PRO_STYLES_V3_START */
  proCompareModeBar: { minHeight: 46, borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: 12 },
  proCompareModeBtn: { flex: 1, minWidth: 0, minHeight: 38, borderRadius: RADIUS.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  proCompareModeText: { fontSize: 12, lineHeight: 17, ...weight('900') },

  proCompareEmpty: { borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: 18, paddingVertical: 22, alignItems: 'center' },
  proCompareHeroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  proCompareEmptyTitle: { fontSize: 14, lineHeight: 20, ...weight('900'), textAlign: 'center' },
  proCompareEmptyHint: { fontSize: 12, lineHeight: 19, ...weight('700'), textAlign: 'center', marginTop: 5, maxWidth: 290 },

  proComparePicker: { minHeight: 86, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 10, alignItems: 'flex-start', gap: 10 },
  proComparePickerIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  proComparePickerLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  proComparePickerValue: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 2 },
  proCompareEditPill: { minHeight: 32, borderRadius: 16, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, flexShrink: 0 },
  proCompareEditText: { fontSize: 10, lineHeight: 14, ...weight('900') },

  proCompareViewBar: { minHeight: 44, borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: 12 },
  proCompareViewBtn: { flex: 1, minHeight: 36, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', gap: 6 },
  proCompareViewText: { fontSize: 11, lineHeight: 16, ...weight('900') },

  proCompareResultBox: { borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: 8, paddingTop: 7, paddingBottom: 9 },
  proCompareExpandBtn: { alignSelf: 'flex-end', minHeight: 32, borderRadius: 16, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 6 },
  proCompareExpandText: { fontSize: 10, lineHeight: 14, ...weight('900') },
  proCompareDetails: { gap: 9 },
  proComparePeriodCard: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 11 },
  proComparePeriodHead: { alignItems: 'center', gap: 8, marginBottom: 10 },
  proComparePeriodMark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  proComparePeriodTitle: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, ...weight('900') },
  proCompareLatest: { minHeight: 24, borderRadius: 12, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  proCompareLatestText: { fontSize: 9, lineHeight: 13, ...weight('900') },
  proCompareMetrics: { gap: 6 },
  proCompareMetric: { flex: 1, minWidth: 0, borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 7, paddingVertical: 8 },
  proCompareMetricLabel: { fontSize: 9, lineHeight: 13, ...weight('800'), textAlign: 'center' },
  proCompareMetricValue: { fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: 'center', marginTop: 3 },

  proCompareRemove: { alignSelf: 'center', minHeight: 34, borderWidth: 1, borderRadius: 17, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  proCompareRemoveText: { fontSize: 10, lineHeight: 14, ...weight('800') },

  proCompareSheet: { width: '100%', maxHeight: '86%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 16 },
  proCompareSheetHandle: { width: 42, height: 4, borderRadius: 4, alignSelf: 'center', marginBottom: 13 },
  proCompareSheetHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  proCompareSheetIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  proCompareSheetTitle: { fontSize: 16, lineHeight: 22, ...weight('900') },
  proCompareSheetHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  proCompareSheetCount: { minWidth: 46, height: 30, borderRadius: 15, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  proCompareSheetCountText: { fontSize: 10, ...weight('900') },

  proCompareYearRail: { gap: 7, paddingBottom: 10 },
  proCompareYearChip: { minWidth: 68, height: 34, borderRadius: 17, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  proCompareYearText: { fontSize: 11, ...weight('900') },

  proCompareMonthScroll: { paddingBottom: 8 },
  proCompareMonthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  proCompareMonthTile: { width: '31%', minHeight: 66, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  proCompareMonthCheck: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  proCompareMonthText: { fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: 'center', paddingHorizontal: 3 },

  proCompareYearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  proCompareYearTile: { width: '31%', minHeight: 58, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5 },
  proCompareYearTileText: { fontSize: 12, lineHeight: 17, ...weight('900') },

  proCompareSheetFooter: { borderTopWidth: 1, paddingTop: 11, marginTop: 4 },
  proCompareSelectionSummary: { fontSize: 10, lineHeight: 15, ...weight('800'), marginBottom: 8 },
  proCompareDoneBtn: { minHeight: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  proCompareDoneText: { fontSize: 13, ...weight('900') },
  expandedChartOverlay: { flex: 1 },
  expandedChartPanel: { flex: 1, width: '100%', borderWidth: 0, paddingHorizontal: 14, paddingTop: 48, paddingBottom: 24, ...SHADOW.float },
  expandedChartHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  expandedChartIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expandedChartTitle: { flex: 1, fontSize: 16, lineHeight: 22, ...weight('900') },
  expandedChartClose: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  /* MYFI_COMPARE_PRO_STYLES_V3_END */

});
