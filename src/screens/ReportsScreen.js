import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import ChoiceSheet from '../components/ChoiceSheet';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { buildFinancialSnapshot, calcStats, catSpend, debtSummary } from '../utils/calc';
import { buildLeakInsights } from '../lib/localIntelligence';
import { generateFinancialReportPDF } from '../lib/pdf';
import { RADIUS, SHADOW, weight } from '../lib/tokens';
import { isRTL, rowDirFor, textAlignFor, writingDirectionFor } from '../lib/layout';
import { filterByActiveScope, filterFeatureEntities, getActiveScope, getModules, transactionFeatureEnabled } from '../lib/modules';
import { getBudgetRows, getBudgetSummary } from '../lib/budgets';

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_EN_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CHART_COLORS = ['#169B62', '#4F8EDC', '#D98D32', '#C85F68', '#766DD6', '#5F9B87'];

const dateOf = (item) => {
  const date = new Date(`${item?.dateISO || ''}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const money = (value, lang, currency = 'IQD') => formatMoneyNumber(value, currency, lang);

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
    budgetSection: ar ? 'الميزانية' : 'Budget',
    categoriesSection: ar ? 'توزيع المصروفات' : 'Expense breakdown',
    transactionsSection: ar ? 'تفاصيل الحركات' : 'Transaction details',
    comparisonSection: ar ? 'المقارنة المحددة' : 'Selected comparison',
    selectAll: ar ? 'تحديد الكل' : 'Select all',
    clearAll: ar ? 'إلغاء الكل' : 'Clear all',
    sharePdf: ar ? 'إنشاء ومشاركة PDF' : 'Create and share PDF',
    selectAtLeastOne: ar ? 'حدد معلومة واحدة على الأقل.' : 'Select at least one item.',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'المصروف' : 'Expense',
    net: ar ? 'الصافي' : 'Net',
    compared: ar ? 'مقارنة الفترات' : 'Period comparison',
    comparisonHint: ar ? 'اختر النوع والفترات التي تريد مراجعتها' : 'Choose the type and periods you want to review',
    monthlyComparison: ar ? 'شهرية' : 'Monthly',
    annualComparison: ar ? 'سنوية' : 'Annual',
    chartView: ar ? 'الرسم' : 'Chart',
    detailsView: ar ? 'التفاصيل' : 'Details',
    addComparison: ar ? 'إضافة مقارنة' : 'Add comparison',
    removeComparison: ar ? 'حذف المقارنة' : 'Remove comparison',
    choosePeriods: ar ? 'اختر الفترات' : 'Choose periods',
    selectedPeriods: ar ? 'فترات محددة' : 'periods selected',
    monthlyLimit: ar ? 'يمكنك مقارنة ما يصل إلى 12 شهراً' : 'Compare up to 12 months',
    annualLimit: ar ? 'يمكنك مقارنة ما يصل إلى 10 سنوات' : 'Compare up to 10 years',
    done: ar ? 'تم' : 'Done',
    noComparison: ar ? 'لا توجد بيانات كافية للمقارنة' : 'Not enough data to compare',
    topSpending: ar ? 'أين تذهب مصروفاتك؟' : 'Where your money goes',
    topSpendingHint: ar ? 'أكبر البنود مرتبة من الأعلى إلى الأقل' : 'Largest categories, ranked from highest to lowest',
    monthlyBudget: ar ? 'الميزانية الشهرية' : 'Monthly budget',
    budgetRemaining: ar ? 'متبقي' : 'remaining',
    budgetOf: ar ? 'من أصل' : 'of',
    budgetOnTrack: ar ? 'الصرف ضمن الحد المحدد' : 'Spending is within the set limit',
    budgetOver: ar ? 'تم تجاوز الحد المحدد' : 'The set limit has been exceeded',
    noData: ar ? 'لا توجد بيانات ضمن هذه الفترة' : 'No data in this period',
    smartTitle: ar ? 'استنتاجات حسب استخدامك' : 'Insights from your activity',
    smartHint: ar ? 'توقعات وقواعد محلية؛ لا تُرسل بياناتك إلى نموذج خارجي' : 'Local forecasts and rules; your data is not sent to an external model',
    confidence: ar ? 'ثقة التحليل' : 'Analysis confidence',
    confidenceHigh: ar ? 'عالية' : 'High',
    confidenceMedium: ar ? 'متوسطة' : 'Medium',
    confidenceLow: ar ? 'منخفضة' : 'Low',
    needData: ar ? 'أضف 7 حركات على 4 أيام على الأقل للحصول على استنتاجات أدق.' : 'Add at least 7 entries across 4 days for more reliable insights.',
    exportFailed: ar ? 'تعذر إنشاء الملف أو فتح المشاركة. حاول مرة أخرى.' : 'Could not create the file or open sharing. Try again.',
  };
};

export default function ReportsScreen() {
  const { trans, debts, goals, cats, cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const C = copy(cfg.lang);
  const ar = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const months = ar ? MONTHS_AR : MONTHS_EN;
  const sym = getSymbol(cfg.currency);
  const modules = getModules(cfg);
  const allScopedTrans = filterByActiveScope(trans, cfg);
  const viewTrans = allScopedTrans.filter(item => transactionFeatureEnabled(item, cfg));
  const featureData = filterFeatureEntities({ debts, goals, cfg });
  const viewDebts = featureData.debts;
  const viewGoals = featureData.goals;
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
  const [selectedMonthKey, setSelectedMonthKey] = useState(currentMonthKey);
  const [comparisonMode, setComparisonMode] = useState('none');
  const [comparisonView, setComparisonView] = useState('chart');
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
      return { value: key, label: `${months[month - 1]} ${year}`, icon: 'calendar-outline' };
    });
  }, [trans, months, now.getMonth(), now.getFullYear()]);
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
  const selectedMonth = useMemo(() => {
    const [year, month] = selectedMonthKey.split('-').map(Number);
    return new Date(year, month - 1, 15);
  }, [selectedMonthKey]);
  const selectedMonthLabel = `${months[selectedMonth.getMonth()]} ${selectedMonth.getFullYear()}`;
  const periodLabel = scope === 'month'
    ? selectedMonthLabel
    : scope === 'year' ? String(selectedMonth.getFullYear()) : C.allTime;

  const periodTrans = useMemo(() => viewTrans.filter(item => {
    const date = dateOf(item);
    if (!date) return false;
    if (scope === 'month') return date.getMonth() === selectedMonth.getMonth() && date.getFullYear() === selectedMonth.getFullYear();
    if (scope === 'year') return date.getFullYear() === selectedMonth.getFullYear();
    return true;
  }), [trans, scope, selectedMonth]);

  const comparisonTrans = (key, mode) => viewTrans.filter(item => {
    const date = dateOf(item);
    if (!date || item.kind === 'transfer') return false;
    if (mode === 'year') return date.getFullYear() === Number(key);
    const [year, month] = String(key).split('-').map(Number);
    return date.getFullYear() === year && date.getMonth() === month - 1;
  });
  const stats = useMemo(() => {
    const active = calcStats(periodTrans);
    const archived = scopedArchiveSummaries.filter(item => (
      scope === 'all' || (scope === 'year' && Number(item.year) === selectedMonth.getFullYear())
    ));
    return archived.reduce((total, item) => ({
      inc: total.inc + Number(item.income || 0),
      exp: total.exp + Number(item.expense || 0),
      bal: total.bal + Number(item.net || 0),
    }), active);
  }, [periodTrans, scopedArchiveSummaries, scope, selectedMonth]);
  const activeDays = useMemo(
    () => new Set(periodTrans.map(item => item.dateISO).filter(Boolean)).size,
    [periodTrans],
  );
  const confidence = periodTrans.length >= 20 && activeDays >= 10
    ? 'high'
    : periodTrans.length >= 7 && activeDays >= 4 ? 'medium' : 'low';
  const intelligence = useMemo(
    () => buildLeakInsights(viewTrans, cats, selectedMonth),
    [viewTrans, cats, selectedMonth],
  );
  const snapshot = useMemo(() => buildFinancialSnapshot({
    trans: viewTrans,
    debts: viewDebts,
    goals: viewGoals,
    cats,
  }, selectedMonthKey === currentMonthKey ? now : selectedMonth), [viewTrans, viewDebts, viewGoals, cats, selectedMonth, selectedMonthKey, currentMonthKey]);
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
    if (scope === 'month' && intelligence.topLeak?.previousSpent > 0) {
      const cat = cfg.lang === 'ar' ? intelligence.topLeak.label : intelligence.topLeak.labelEn;
      rows.push({
        icon: 'trending-up-outline', tone: 'danger',
        text: cfg.lang === 'ar'
          ? `أكبر ارتفاع عن الشهر السابق في ${cat || 'تصنيف'}: ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym}.`
          : `Largest increase from last month is ${cat || 'a category'}: ${money(intelligence.topLeak.delta, cfg.lang, cfg.currency)} ${sym}.`,
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
  const budgetRows = useMemo(
    () => getBudgetRows(viewTrans, cats, cfg.categoryBudgets, selectedMonth),
    [viewTrans, cats, cfg.categoryBudgets, selectedMonth],
  );
  const budgetSummary = useMemo(() => getBudgetSummary(budgetRows), [budgetRows]);
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
          ? `${String(option?.label || key).split(' ')[0].slice(0, 3)} ${String(key).slice(2, 4)}`
          : String(key),
        ...periodStats,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key)), [trans, comparisonPeriods, comparisonMode, comparisonOptions]);

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
    scope === 'month' && modules.budgets && budgetSummary.limit > 0 ? { value: 'budget', label: C.budgetSection, icon: 'speedometer-outline' } : null,
    { value: 'categories', label: C.categoriesSection, icon: 'pie-chart-outline' },
    { value: 'transactions', label: C.transactionsSection, icon: 'receipt-outline' },
    comparisonMode !== 'none' && comparisonSeries.length
      ? { value: 'comparison', label: `${C.comparisonSection} (${comparisonSeries.length})`, icon: 'git-compare-outline' }
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
        topCategories: categories,
        budget: budgetSummary,
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
      <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={s.screen}>
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

        <View style={[s.summaryGrid, { flexDirection: rowDir }]}>
          <SummaryMetric label={C.income} value={stats.inc} color={th.inc} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
          <SummaryMetric label={C.expense} value={stats.exp} color={th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
          <SummaryMetric label={C.net} value={stats.bal} color={stats.bal >= 0 ? th.inc : th.exp} th={th} lang={cfg.lang} currency={cfg.currency} sym={sym} />
        </View>

        <SectionCard th={th} title={C.smartTitle} subtitle={C.smartHint} icon="sparkles-outline" lang={cfg.lang}>
          <View style={s.insightList}>
            <View style={[s.confidenceRow, { flexDirection: rowDir, backgroundColor: th.cardHigh }]}>
              <Text style={[s.confidenceLabel, { color: th.sub, textAlign: align }]}>{C.confidence}</Text>
              <Text style={[s.confidenceValue, { color: confidence === 'high' ? th.inc : confidence === 'medium' ? th.warn : th.faint }]}>
                {confidence === 'high' ? C.confidenceHigh : confidence === 'medium' ? C.confidenceMedium : C.confidenceLow} · {periodTrans.length}/{activeDays}
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

        {scope === 'month' && modules.budgets && budgetSummary.limit > 0 ? (
          <View style={[s.budgetCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.budgetHead, { flexDirection: rowDir }]}>
              <View style={[s.budgetIcon, { backgroundColor: budgetSummary.over ? th.expBg : th.primSoft }]}>
                <Ionicons name="speedometer-outline" size={19} color={budgetSummary.over ? th.exp : th.primary} />
              </View>
              <Text style={[s.budgetTitle, { color: th.text, textAlign: align }]}>{C.monthlyBudget}</Text>
              <View style={[s.budgetStatus, { backgroundColor: budgetSummary.over ? th.expBg : th.incBg }]}>
                <Text style={[s.budgetStatusText, { color: budgetSummary.over ? th.exp : th.inc }]}>
                  {Math.round(budgetSummary.percent || 0)}%
                </Text>
              </View>
            </View>
            <View style={[s.budgetNumbers, { flexDirection: rowDir }]}>
              <Text style={[s.budgetSpent, { color: budgetSummary.over ? th.exp : th.text }]}>
                {money(budgetSummary.spent, cfg.lang, cfg.currency)} {sym}
              </Text>
              <Text style={[s.budgetLimit, { color: th.sub }]}>
                {C.budgetOf} {money(budgetSummary.limit, cfg.lang, cfg.currency)} {sym}
              </Text>
            </View>
            <View style={[s.budgetTrack, { backgroundColor: th.cardHigh }]}>
              <View
                style={[
                  s.budgetFill,
                  {
                    backgroundColor: budgetSummary.over ? th.exp : th.primary,
                    width: `${Math.min(100, budgetSummary.percent || 0)}%`,
                    alignSelf: ar ? 'flex-end' : 'flex-start',
                  },
                ]}
              />
            </View>
            <Text style={[s.budgetFoot, { color: th.sub, textAlign: align }]}>
              {budgetSummary.over
                ? C.budgetOver
                : `${C.budgetOnTrack} · ${C.budgetRemaining}: ${money(budgetSummary.remaining, cfg.lang, cfg.currency)} ${sym}`}
            </Text>
          </View>
        ) : null}

        <SectionCard th={th} title={C.topSpending} subtitle={C.topSpendingHint} icon="pie-chart-outline" lang={cfg.lang}>
          {categories.length ? (
            <View style={s.categoryList}>
              {categories.slice(0, 5).map(item => (
                <CategoryRow key={item.id} item={item} th={th} lang={cfg.lang} sym={sym} />
              ))}
            </View>
          ) : <Empty th={th} text={C.noData} />}
        </SectionCard>

        {comparisonMode === 'none' ? (
          <TouchableOpacity
            onPress={() => changeComparisonMode('month')}
            style={[s.addComparisonCard, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
          >
            <View style={[s.comparisonIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="git-compare-outline" size={19} color={th.primary} />
            </View>
            <Text style={[s.addComparisonLabel, { color: th.text, textAlign: align }]}>{C.addComparison}</Text>
            <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={18} color={th.faint} />
          </TouchableOpacity>
        ) : (
          <View style={[s.comparisonPanel, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.comparisonHead, { flexDirection: rowDir }]}>
              <View style={[s.comparisonIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="git-compare-outline" size={18} color={th.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.sectionTitle, { color: th.text, textAlign: align }]}>{C.compared}</Text>
                <Text style={[s.sectionSubtitle, { color: th.sub, textAlign: align }]}>{C.comparisonHint}</Text>
              </View>
              <TouchableOpacity
                accessibilityLabel={C.removeComparison}
                onPress={() => changeComparisonMode('none')}
                style={[s.comparisonRemoveBtn, { backgroundColor: th.expBg }]}
              >
                <Ionicons name="close" size={18} color={th.exp} />
              </TouchableOpacity>
            </View>

            <View style={[s.comparisonModes, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
              {[
                { value: 'month', label: C.monthlyComparison },
                { value: 'year', label: C.annualComparison },
              ].map(option => {
              const active = comparisonMode === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => changeComparisonMode(option.value)}
                  style={[s.comparisonModeBtn, { backgroundColor: active ? th.primary : 'transparent' }]}
                >
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9} style={{ color: active ? th.onPrimary : th.sub, fontSize: 12, ...weight('900') }}>{option.label}</Text>
                </TouchableOpacity>
              );
              })}
            </View>

            <>
              <TouchableOpacity
                onPress={() => setSheet('comparisonPeriods')}
                style={[s.periodPicker, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.compareFieldLabel, { color: th.sub, textAlign: align }]}>{C.choosePeriods}</Text>
                  <Text style={[s.periodPickerValue, { color: th.text, textAlign: align }]}>
                    {comparisonPeriods.length} {C.selectedPeriods}
                  </Text>
                  <Text style={[s.periodPickerHint, { color: th.faint, textAlign: align }]}>
                    {comparisonMode === 'month' ? C.monthlyLimit : C.annualLimit}
                  </Text>
                </View>
                <Ionicons name="options-outline" size={19} color={th.primary} />
              </TouchableOpacity>

              <View style={[s.comparisonViewSwitch, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {[
                  { value: 'chart', label: C.chartView, icon: 'analytics-outline' },
                  { value: 'details', label: C.detailsView, icon: 'list-outline' },
                ].map(option => {
                  const active = comparisonView === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      onPress={() => setComparisonView(option.value)}
                      style={[s.comparisonViewBtn, { backgroundColor: active ? th.card : 'transparent', flexDirection: rowDir }]}
                    >
                      <Ionicons name={option.icon} size={16} color={active ? th.primary : th.sub} />
                      <Text style={[s.comparisonViewText, { color: active ? th.primary : th.sub }]}>{option.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {comparisonSeries.length ? (
                comparisonView === 'chart' ? (
                  <>
                  <TrendChart data={comparisonSeries} th={th} lang={cfg.lang} />
                  <View style={[s.legend, { flexDirection: rowDir }]}>
                    <Legend color={th.inc} label={C.income} th={th} />
                    <Legend color={th.exp} label={C.expense} th={th} />
                  </View>
                  </>
                ) : (
                  <View style={s.comparisonDetails}>
                    {comparisonSeries.map(item => (
                        <View key={item.key} style={[s.comparisonDetailRow, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                          <View style={[s.comparisonDetailHead, { flexDirection: rowDir }]}>
                            <Text style={[s.periodCardTitle, { color: th.primary, textAlign: align }]}>{item.label}</Text>
                          </View>
                        <View style={[s.comparisonDetailMetrics, { flexDirection: rowDir }]}>
                          <ComparisonMetric label={C.income} value={item.inc} color={th.inc} lang={cfg.lang} sym={sym} />
                          <ComparisonMetric label={C.expense} value={item.exp} color={th.exp} lang={cfg.lang} sym={sym} />
                          <ComparisonMetric label={C.net} value={item.bal} color={item.bal >= 0 ? th.inc : th.exp} lang={cfg.lang} sym={sym} />
                        </View>
                      </View>
                    ))}
                  </View>
                )
              ) : <Empty th={th} text={C.noComparison} />}
            </>
          </View>
        )}
      </ScrollView>

      <ReportPeriodSheet
        visible={sheet === 'scope'}
        onClose={() => setSheet(null)}
        onSelect={selectPeriod}
        scope={scope}
        selectedMonthKey={selectedMonthKey}
        yearOptions={yearOptions}
        th={th}
        lang={cfg.lang}
      />
      <ChoiceSheet
        visible={sheet === 'comparisonPeriods'}
        title={`${C.choosePeriods} · ${comparisonPeriods.length}/${comparisonLimit}`}
        options={comparisonOptions}
        values={comparisonPeriods}
        multiple
        maxSelections={comparisonLimit}
        doneLabel={`${C.done} (${comparisonPeriods.length})`}
        onSelect={toggleComparisonPeriod}
        onClose={() => setSheet(null)}
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
    </>
  );
}

function ReportShareSheet({ visible, onClose, onShare, options, values, onToggle, onSelectAll, onClear, th, lang }) {
  const ar = lang === 'ar';
  const C = copy(lang);
  const selectedCount = options.filter(item => values.includes(item.value)).length;
  const allSelected = options.length > 0 && selectedCount === options.length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[s.shareOverlay, { backgroundColor: th.overlay }]} onPress={onClose}>
        <Pressable style={[s.shareSheet, { backgroundColor: th.card }]} onPress={() => {}}>
          <View style={[s.shareHandle, { backgroundColor: th.cardHigh }]} />
          <View style={[s.shareHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={[s.shareHeadIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="share-social-outline" size={19} color={th.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.shareTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{C.exportTitle}</Text>
              <Text style={[s.shareSubtitle, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{C.selectContent}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[s.shareClose, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.sub} />
            </TouchableOpacity>
          </View>

          <View style={[s.shareBulk, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={allSelected ? onClear : onSelectAll} style={[s.shareBulkBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name={allSelected ? 'checkbox' : 'checkbox-outline'} size={16} color={th.primary} />
              <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{allSelected ? C.clearAll : C.selectAll}</Text>
            </TouchableOpacity>
            <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{selectedCount}/{options.length}</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 4 }}>
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ReportPeriodSheet({ visible, onClose, onSelect, scope, selectedMonthKey, yearOptions, th, lang }) {
  const ar = lang === 'ar';
  const C = copy(lang);
  const selectedYear = Number(String(selectedMonthKey).slice(0, 4)) || new Date().getFullYear();
  const [mode, setMode] = useState(scope);
  const [monthYear, setMonthYear] = useState(selectedYear);
  const monthNames = ar ? MONTHS_AR : MONTHS_EN_FULL;
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
            <TouchableOpacity onPress={onClose} style={[s.periodClose, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.text} />
            </TouchableOpacity>
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
                {monthNames.map((label, index) => {
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

function SectionCard({ th, title, subtitle, icon, lang, children }) {
  const ar = lang === 'ar';
  return (
    <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
      <View style={[s.sectionHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
        <View style={[s.sectionIcon, { backgroundColor: th.primSoft }]}>
          <Ionicons name={icon} size={18} color={th.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{title}</Text>
          {!!subtitle && <Text style={[s.sectionSubtitle, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{subtitle}</Text>}
        </View>
      </View>
      {children}
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

function ComparisonMetric({ label, value, color, lang, sym }) {
  return (
    <View style={s.comparisonMetric}>
      <Text style={[s.comparisonMetricLabel, { color }]}>{label}</Text>
      <Text style={[s.comparisonMetricValue, { color }]} numberOfLines={1}>{money(value, lang)} {sym}</Text>
    </View>
  );
}

function TrendChart({ data, th, lang }) {
  const width = Math.max(340, data.length * 58);
  const height = 176;
  const top = 18;
  const bottom = 142;
  const max = Math.max(1, ...data.flatMap(item => [item.inc, item.exp]));
  const step = width / data.length;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chartScroll}>
      <View style={[s.chartWrap, { width }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2].map(index => <Line key={index} x1="0" x2={width} y1={top + index * 48} y2={top + index * 48} stroke={th.border} strokeWidth="1" />)}
        {data.map((item, index) => {
          const x = index * step + 10;
          const incomeHeight = (Number(item.inc || 0) / max) * 92;
          const expenseHeight = (Number(item.exp || 0) / max) * 92;
          return (
            <React.Fragment key={`${item.label}-${index}`}>
              <Rect x={x} y={bottom - incomeHeight} width="12" height={Math.max(2, incomeHeight)} rx="4" fill={th.inc} opacity=".88" />
              <Rect x={x + 14} y={bottom - expenseHeight} width="12" height={Math.max(2, expenseHeight)} rx="4" fill={th.exp} opacity=".78" />
              <SvgText x={x + 13} y="164" fontSize="11" fill={th.sub} textAnchor="middle">{item.shortLabel || item.label}</SvgText>
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
  screen: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 96 },
  reportTopRow: { alignItems: 'stretch', gap: 8 },
  shareCenterBtn: { width: 72, minHeight: 102, borderRadius: RADIUS.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 12, ...SHADOW.card },
  shareCenterLabel: { fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: 'center' },
  periodCard: { minHeight: 102, borderRadius: RADIUS.xl, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 16, alignItems: 'center', gap: 13, marginBottom: 12, overflow: 'hidden', ...SHADOW.card },
  periodIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  periodLabel: { fontSize: 11, lineHeight: 16, ...weight('800') },
  periodValue: { fontSize: 18, lineHeight: 25, ...weight('900'), marginTop: 1 },
  periodHint: { fontSize: 11, lineHeight: 16, ...weight('700'), marginTop: 1 },
  periodAction: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { gap: 8, marginBottom: 12 },
  summaryMetric: { flex: 1, minWidth: 0, minHeight: 76, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 11, justifyContent: 'center', ...SHADOW.card },
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
  periodClose: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
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
  budgetCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 15, marginBottom: 12, ...SHADOW.card },
  budgetHead: { alignItems: 'center', gap: 10, marginBottom: 14 },
  budgetIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  budgetTitle: { flex: 1, fontSize: 14, lineHeight: 20, ...weight('900') },
  budgetStatus: { minWidth: 48, minHeight: 30, borderRadius: 15, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  budgetStatusText: { fontSize: 12, lineHeight: 17, ...weight('900') },
  budgetNumbers: { alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  budgetSpent: { flexShrink: 1, fontSize: 18, lineHeight: 25, ...weight('900') },
  budgetLimit: { flexShrink: 1, fontSize: 11, lineHeight: 17, ...weight('700') },
  budgetTrack: { height: 8, borderRadius: 8, overflow: 'hidden', marginTop: 10 },
  budgetFill: { height: 8, borderRadius: 8 },
  budgetFoot: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 8 },
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
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 15, marginBottom: 12, ...SHADOW.card },
  sectionHead: { alignItems: 'center', gap: 10, marginBottom: 15 },
  sectionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
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
  shareClose: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  shareBulk: { minHeight: 38, alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  shareBulkBtn: { minHeight: 36, borderRadius: 11, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  shareOption: { minHeight: 58, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', gap: 10, marginBottom: 7 },
  shareOptionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  shareOptionText: { flex: 1, fontSize: 13, lineHeight: 19, ...weight('900') },
  shareCheck: { width: 22, height: 22, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  shareSubmit: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: RADIUS.lg, minHeight: 96, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  emptyText: { fontSize: 12, lineHeight: 18, textAlign: 'center', ...weight('700') },
});
