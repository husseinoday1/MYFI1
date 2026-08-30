import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable, StyleSheet, Image, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { CURRENCIES, getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { buildFinancialSnapshot, getUpcomingRecurring, pct, today } from '../utils/calc';
import AddTransModal from '../components/AddTransModal';
import { filterByActiveScope, filterFeatureEntities, filterTransactionsByEnabledFeatures, getActiveScope, getModules, getTransactionDisplayAmount } from '../lib/modules';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletBaseAvailableTotal, getWalletLabel, normalizeWallets } from '../lib/wallets';
import { formatCommitmentDate, formatCommitmentMonth, getUpcomingCommitments } from '../lib/commitments';
import { FinancialDirectionMark, SectionTitle, Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, TYPE, weight } from '../lib/tokens';
import ActionMenu from '../components/ActionMenu';
import { describeSmartSource } from '../lib/smartEntry';
import NotificationCenterModal from '../components/NotificationCenterModal';
import HomeCenterModal from '../components/HomeCenterModal';
import { buildNotificationItems, filterDismissedNotifications, NOTIFICATION_DISMISSED_STORAGE_KEY, notificationReadKey, pruneNotificationKeys, sanitizeNotificationReadKeys } from '../lib/notificationCenter';
import { isRTL, rowDirFor, textAlignFor } from '../lib/layout';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { getTransactionTagMeta } from '../lib/transactionTags';
import { getSemanticTypeLabel, getTransactionSemanticKind, TRANSACTION_SEMANTIC_KIND } from '../lib/transactionSemantics';
import { isCurrentMonthTransaction } from '../lib/transactionAccess';
import TransactionDetailsModal from '../components/TransactionDetailsModal';
import { formatMonthLabel } from '../lib/months';
import { deriveDisplayName } from '../lib/accountIdentity';
import { getMonthTransactionsByKey, getRecentTransactions, getTransactionIndex } from '../lib/transactionIndex';
import { averageGoalProgress, summarizeCommitmentCurrencies, summarizeGoalCurrencies } from '../lib/entityCurrencySummary';
import { getLedgerNamespace, queryLedgerSummary, queryLedgerTransactions, queryLedgerWalletPositions } from '../lib/activeLedgerRepository';
import { getLedgerDb, runLedgerReadTransaction } from '../lib/ledgerDatabase';
import { getFinancialWorkspaceStateV7 } from '../lib/financialLedgerV7Repository';
const noop = () => {};

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    overview: ar ? 'نظرة عامة' : 'Overview',
    allTransactions: ar ? 'عرض كل الحركات' : 'View all transactions',
    currentMoney: ar ? 'المتبقي بعد الصرف' : 'Left after spending',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    periodDay: ar ? 'اليوم' : 'Today',
    periodWeek: ar ? 'هذا الاسبوع' : 'This week',
    periodMonth: ar ? 'هذا الشهر' : 'This month',
    monthEnd: ar ? 'نهاية الشهر' : 'Month end',
    dailyRoom: ar ? 'المتاح يومياً' : 'Daily room',
    afterDebts: ar ? 'بعد استحقاقات دين عليّ' : 'After debts due',
    debtsLeft: ar ? 'دين عليّ متبقٍ' : 'Debt remaining',
    goalsSaved: ar ? 'تقدّم التوفير' : 'Saving progress',
    debtProgress: ar ? 'تقدّم سداد دين عليّ' : 'Debt repayment progress',
    paid: ar ? 'مسدّد' : 'Paid',
    saved: ar ? 'مدّخر' : 'Saved',
    savingThisMonth: ar ? 'التوفير' : 'Savings',
    left: ar ? 'متبقي' : 'Left',
    noDebts: ar ? 'لا يوجد دين عليّ نشط' : 'No active debts',
    noGoals: ar ? 'لا توجد أهداف توفير نشطة' : 'No active saving goals',
    remaining: ar ? 'متبقي' : 'Remaining',
    over: ar ? 'متجاوز' : 'Over',
    upcoming: ar ? 'متكرر' : 'Recurring',
    commitments: ar ? 'مستحقات' : 'Due',
    attention: ar ? 'الحالات المهمة' : 'Important states',
    attentionSubtitle: ar ? 'تنبيهات ومواعيد تحتاج قراراً' : 'Alerts and due items that need a decision',
    allClear: ar ? 'هادئة' : 'Clear',
    commitmentWord: ar ? 'مستحقات' : 'Due',
    recurringWord: ar ? 'متكرر' : 'Repeat',
    goalsWord: ar ? 'توفير' : 'Savings',
    markPaid: ar ? 'دفع' : 'Pay',
    postpone: ar ? 'تأجيل' : 'Postpone',
    postponeChoose: ar ? 'اختر مدة التأجيل' : 'Choose how long to postpone',
    postponeDay: ar ? 'يوم واحد' : '1 day',
    postpone3Days: ar ? '3 أيام' : '3 days',
    postponeNextMonth: ar ? 'الشهر القادم' : 'Next month',
    reviewRecurring: ar ? 'راجعها قبل الإضافة' : 'Review before adding',
    dueToday: ar ? 'مستحقة اليوم' : 'Due today',
    overdue: ar ? 'متأخرة' : 'Overdue',
    dueIn: ar ? 'بعد' : 'In',
    days: ar ? 'يوم' : 'days',
    dueThisMonth: ar ? 'مستحق هذا الشهر' : 'Due this month',
    dueMonth: ar ? 'شهر الاستحقاق' : 'Due month',
    transactionType: ar ? 'نوع المعاملة' : 'Transaction type',
    select: ar ? 'تحديد' : 'Select',
    linkedDeleteTitle: ar ? 'معاملة مرتبطة' : 'Linked transaction',
    linkedDeleteBody: ar
      ? 'حذف هذه المعاملة يلغي الحركة من المتابعة المرتبطة بها.'
      : 'Deleting this transaction also updates the linked tracker.',
    emptyTitle: ar ? 'ابدأ بأول معاملة' : 'Start with one entry',
    emptyBody: ar
      ? 'بعد إضافة دخل أو مصروف ستظهر هنا نظرة شاملة على أموالك.'
      : 'Add income or an expense to see a clear overview of your finances.',
    safe: ar ? 'وضعك هذا الشهر مستقر.' : 'This month looks stable.',
    warning: ar ? 'انتبه، الصرف أو المستحقات تحتاج متابعة.' : 'Spending or tracked amounts need attention.',
    danger: ar ? 'المؤشر يقول إن نهاية الشهر قد تكون سالبة.' : 'The month-end forecast may go negative.',
    watch: ar ? 'سجل دخلك حتى تصبح القراءة أدق.' : 'Add income for a clearer reading.',
    neutral: ar ? 'أضف أول حركة لبدء القراءة المالية.' : 'Add your first entry to start the financial reading.',
    walletSummary: ar ? 'موزعة على' : 'Across',
    walletsWord: ar ? 'محافظ' : 'wallets',
    walletsTitle: ar ? 'المحافظ' : 'Wallets',
    defaultWallet: ar ? 'افتراضية' : 'Default',
    availableBalance: ar ? 'الرصيد المتاح' : 'Available balance',
    hideDetails: ar ? 'إخفاء' : 'Hide',
    showDetails: ar ? 'إظهار' : 'Show',
    netMonth: ar ? 'صافي الشهر' : 'Month net',
    dueSoon: ar ? 'مستحقات' : 'Due',
    monthSummary: ar ? 'ملخص الشهر' : 'Month summary',
    netWord: ar ? 'الصافي' : 'Net',
    showBalance: ar ? 'إظهار' : 'Show',
    hideBalance: ar ? 'إخفاء' : 'Hide',
    hiddenAmount: '****',
    ledgerUnavailable: ar ? 'تعذر تحديث الرصيد الآن' : 'Could not refresh balance',
    ledgerUnavailableHint: ar ? 'لم نعرض رقمًا قديمًا. تحقق من الاتصال ثم أعد المحاولة.' : 'We did not show an older number. Check your connection and try again.',
    retryLedger: ar ? 'إعادة المحاولة' : 'Try again',
    noActiveGoals: ar ? 'لا توجد أهداف نشطة' : 'No active goals',
    quickActions: ar ? 'الإضافة السريعة' : 'Quick add',
    quickExpense: ar ? 'إضافة مصروف' : 'Add expense',
    quickIncome: ar ? 'إضافة دخل' : 'Add income',
    quickTransfer: ar ? 'تحويل بين المحافظ' : 'Transfer between wallets',
    quickTracker: ar ? 'متابعة جديدة' : 'New tracker',
    quickDebt: ar ? 'سداد دين عليّ' : 'Pay debt',
    quickGoal: ar ? 'ادخار لهدف' : 'Save toward goal',
    quickCommitment: ar ? 'دفع التزام' : 'Pay commitment',
    quickExpenseHint: ar ? 'سجل الصرف اليومي بسرعة' : 'Capture spending fast',
    quickIncomeHint: ar ? 'أدخل الدخل بسرعة' : 'Log income quickly',
    quickTransferHint: ar ? 'انقل الرصيد بين المحافظ' : 'Move money across wallets',
    quickTrackerHint: ar ? 'أضف هدفاً أو دين عليّ أو دين لي أو التزاماً' : 'Add a goal, debt, or commitment',
    quickDebtHint: ar ? 'سدّد أول دين عليّ نشط' : 'Pay your first active debt',
    quickGoalHint: ar ? 'ادعم أول هدف نشط' : 'Top up your first active goal',
    quickCommitmentHint: ar ? 'سدّد أقرب التزام قادم' : 'Pay the next due commitment',
    smartEntry: ar ? 'ذكي' : 'Smart',
    currenciesWord: ar ? 'عملات' : 'currencies',
    goalsWordShort: ar ? 'أهداف' : 'goals',
  };
};

export default function HomeScreen({
  onAddExpense = noop,
  onAddIncome = noop,
  onTransfer = noop,
  onNewTracker = noop,
  onQuickPay = noop,
  onQuickSave = noop,
  onQuickCommitment = noop,
  onSmartEntry = noop,
  onOpenTab = noop,
  onOpenSettingsPage = noop,
  onNotificationAction = noop,
}) {
  const { trans, debts, goals, wallets, commitments, cats, cfg, notif, user, setCfg, editTrans, deleteTrans, deleteTransMany, deferCommitment, financialLedgerV7Cutover, workspaceNamespace } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const C   = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const isAr = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const modules = getModules(cfg);
  const accountName = deriveDisplayName({ user, cfg }) || (isAr ? 'حساب محلي' : 'Local account');
  const accountInitial = (accountName || 'M').trim().charAt(0).toUpperCase();
  const scopedTransAll = useMemo(
    () => filterByActiveScope(trans, cfg),
    [trans, cfg.activeScope, cfg.profileType],
  );
  const scopedTrans = useMemo(
    () => filterTransactionsByEnabledFeatures(scopedTransAll, cfg),
    [scopedTransAll, cfg.enabledModules],
  );
  const scopedWallets = useMemo(
    () => filterByActiveScope(wallets, cfg),
    [wallets, cfg.activeScope, cfg.profileType],
  );
  const featureData = filterFeatureEntities({ debts, goals, commitments, cfg });
  const scopedDebts = featureData.debts;
  const scopedGoals = featureData.goals;
  const scopedCommitments = featureData.commitments;
  const homeCardsCfg = Array.isArray(cfg.homeCards) ? cfg.homeCards : [];
  const homeSectionsCfg = Array.isArray(cfg.homeSections) ? cfg.homeSections : [];
  const recentLimit = 3;

  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const [savingsExpanded, setSavingsExpanded] = useState(false);
  const [recentExpanded, setRecentExpanded] = useState(false);
  const [walletsExpanded, setWalletsExpanded] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [details, setDetails] = useState(null);
  const [expandedRecentId, setExpandedRecentId] = useState(null);
  const [recurringDraft, setRecurringDraft] = useState(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [centerMode, setCenterMode] = useState(null);
  const [readNotificationKeys, setReadNotificationKeys] = useState([]);
  const [dismissedNotificationKeys, setDismissedNotificationKeys] = useState([]);
  const snapshot = useMemo(
    () => buildFinancialSnapshot({
      trans: scopedTransAll,
      debts: scopedDebts,
      goals: scopedGoals,
      cats,
      wallets: scopedWallets,
      commitments: scopedCommitments,
      currency: cfg.currency,
      defaultWalletId: cfg.defaultWalletId,
    }),
    [trans, debts, goals, wallets, commitments, cats, cfg.activeScope, cfg.profileType, cfg.enabledModules, cfg.currency, cfg.defaultWalletId],
  );
  const upcoming = useMemo(() => modules.recurring ? getUpcomingRecurring(scopedTrans) : [], [trans, cfg.activeScope, cfg.profileType, modules.recurring]);
  const upcomingCommitments = useMemo(
    () => modules.commitments ? getUpcomingCommitments(scopedCommitments) : [],
    [commitments, cfg.activeScope, cfg.profileType, modules.commitments],
  );
  const [sqlHome, setSqlHome] = useState(null);
  const [sqlHomeError, setSqlHomeError] = useState(false);
  const [ledgerRetry, setLedgerRetry] = useState(0);
  const currentMonthKey = today().slice(0, 7);
  const ledgerReadFailed = financialLedgerV7Cutover && sqlHomeError;
  useEffect(() => {
    let cancelled = false;
    if (!financialLedgerV7Cutover) {
      setSqlHome(null);
      setSqlHomeError(false);
      return () => { cancelled = true; };
    }
    const run = async () => {
      const namespace = getLedgerNamespace(workspaceNamespace, cfg);
      const scope = getActiveScope(cfg);
      const [year, month] = currentMonthKey.split('-').map(Number);
      const lastDay = new Date(year, month, 0).getDate();
      const db = await getLedgerDb();
      if (!db) throw new Error('home_ledger_database_unavailable');
      // Make schema readiness and the source-of-truth check explicit before the
      // queued snapshot. The query helpers intentionally fall back for screens
      // that still support the legacy ledger; Home must never do that after a V7
      // cutover because it would make a real balance silently stale.
      const ledgerState = await getFinancialWorkspaceStateV7({ namespace, database: db });
      if (ledgerState?.source_mode !== 'sqlite') {
        throw new Error(`home_ledger_source_mismatch namespace=${namespace} source_mode=${ledgerState?.source_mode || 'missing'}`);
      }
      // Home asks three related questions of one SQLite connection.  They must
      // be read as one queued snapshot: parallel implicit statements can race
      // the sync/mirror writer and make an otherwise valid balance unavailable.
      return runLedgerReadTransaction(db, async (txn) => {
        const summary = await queryLedgerSummary({
          namespace,
          fromDate: `${currentMonthKey}-01`,
          toDate: `${currentMonthKey}-${String(lastDay).padStart(2, '0')}`,
          scope,
          database: txn,
        });
        const recentPage = await queryLedgerTransactions({ namespace, limit: recentLimit, scope, archived: false, database: txn });
        const positions = await queryLedgerWalletPositions({ namespace, scope, database: txn });
        if (summary?.supported !== true || recentPage?.supported !== true || positions?.supported !== true) {
          const describe = value => [
            value?.supported === true ? 'ok' : 'unsupported',
            value?.source || 'no_source',
            value?.reason || 'no_reason',
          ].join(':');
          throw new Error(`home_ledger_read_unsupported summary=${describe(summary)} recent=${describe(recentPage)} wallets=${describe(positions)}`);
        }
        return { summary, recent: recentPage?.rows || [], positions: positions?.rows || [] };
      });
    };
    void run()
      .then((result) => {
        if (cancelled) return;
        setSqlHome(result);
        setSqlHomeError(false);
      })
      .catch((error) => {
        console.warn('[MYFI:HOME_LEDGER_READ]', String(error?.message || error || 'home_ledger_read_failed'));
        if (cancelled) return;
        setSqlHome(null);
        setSqlHomeError(true);
      });
    return () => { cancelled = true; };
  }, [financialLedgerV7Cutover, workspaceNamespace, cfg.activeScope, cfg.profileType, cfg.currency, currentMonthKey, ledgerRetry]);
  const recent = useMemo(
    () => ledgerReadFailed ? [] : financialLedgerV7Cutover && sqlHome?.recent?.length ? sqlHome.recent : getRecentTransactions(scopedTrans, recentLimit),
    [ledgerReadFailed, financialLedgerV7Cutover, sqlHome, scopedTrans, recentLimit],
  );
  const scopedTransactionIndex = useMemo(() => getTransactionIndex(scopedTrans), [scopedTrans]);
  const recentSelection = useMultiSelect(recent
    .filter(item => getTransactionSemanticKind(item) !== TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE)
    .map(item => item.id));
  const defaultWalletId = useMemo(
    () => getDefaultWalletId(scopedWallets.length ? scopedWallets : wallets, cfg.currency, cfg.defaultWalletId),
    [wallets, cfg.currency, cfg.defaultWalletId, cfg.activeScope, cfg.profileType],
  );
  const fallbackWalletRows = useMemo(
    () => getWalletAvailableBalances(scopedWallets.length ? scopedWallets : wallets, scopedTransAll, cfg.currency, defaultWalletId)
      .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0)),
    [wallets, trans, cfg.currency, defaultWalletId, cfg.activeScope, cfg.profileType],
  );
  const walletRows = useMemo(() => {
    if (financialLedgerV7Cutover && sqlHomeError) return [];
    if (!financialLedgerV7Cutover || !sqlHome?.positions?.length) return fallbackWalletRows;
    const byId = new Map((scopedWallets.length ? scopedWallets : wallets).map(item => [String(item.id), item]));
    return sqlHome.positions.map(position => ({
      ...(byId.get(String(position.id)) || {}),
      ...position,
      balance: position.physicalBalance,
    })).sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0));
  }, [financialLedgerV7Cutover, sqlHome, sqlHomeError, fallbackWalletRows, scopedWallets, wallets, defaultWalletId]);
  const walletMap = useMemo(() => {
    const normalized = normalizeWallets(scopedWallets.length ? scopedWallets : wallets, cfg.currency);
    return new Map(normalized.map(wallet => [wallet.id, wallet]));
  }, [wallets, cfg.currency]);
  const homeSectionsMap = useMemo(
    () => new Map(homeSectionsCfg.map(item => [item.key, item.visible !== false])),
    [homeSectionsCfg],
  );

  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);
  const signed = (n) => Number(n || 0) === 0 ? `0 ${sym}` : `${n > 0 ? '+' : '-'}${fmt(n)} ${sym}`;
  const healthColor = snapshot.health === 'danger'
    ? th.exp
    : snapshot.health === 'warning' || snapshot.health === 'watch'
      ? th.warn
      : th.inc;
  // The health pill moved out of the hero card into Needs Attention (Planning
  // & Audit ruling, 2026-08-27) — "only when it has meaning" per the Home
  // spec, i.e. not for 'safe'/'neutral'. 'neutral' is the empty-account
  // state, not a problem to flag.
  const healthNeedsAttention = snapshot.health === 'danger' || snapshot.health === 'warning' || snapshot.health === 'watch';
  const canTransfer = walletRows.length > 1;
  const heroBalance = getWalletBaseAvailableTotal(walletRows, cfg.currency);
  const heroBalanceText = ledgerReadFailed ? '—' : `${heroBalance < 0 ? '-' : ''}${cfg.currency} ${fmt(Math.abs(heroBalance))}`;
  const walletCount = walletRows.length;
  const activeGoals = scopedGoals.filter(goal => goal.active !== false && Number(goal.target || 0) > 0);
  const goalCurrencyGroups = useMemo(
    () => summarizeGoalCurrencies(activeGoals, cfg.currency, { activeOnly: true }),
    [activeGoals, cfg.currency],
  );
  const goalsProgress = averageGoalProgress(activeGoals);
  const goalSummaryText = goalCurrencyGroups.length === 1
    ? `${formatMoneyNumber(goalCurrencyGroups[0].saved, goalCurrencyGroups[0].currency, cfg.lang)} / ${formatMoneyNumber(goalCurrencyGroups[0].target, goalCurrencyGroups[0].currency, cfg.lang)} ${getSymbol(goalCurrencyGroups[0].currency)}`
    : `${activeGoals.length} ${C.goalsWordShort} · ${goalCurrencyGroups.length} ${C.currenciesWord}`;
  const currentMonthName = formatMonthLabel(new Date().getFullYear(), new Date().getMonth(), {
    style: cfg.monthNameStyle,
    length: 'long',
    includeYear: false,
  });
  const dueCommitments = upcomingCommitments.filter(item => (
    item.actionable
    || Number(item.monthsUntil || 0) <= 0
    || String(item.dueISO || '').startsWith(currentMonthKey)
  ));
  const dueCommitmentGroups = useMemo(
    () => summarizeCommitmentCurrencies(dueCommitments, cfg.currency, { activeOnly: false }),
    [dueCommitments, cfg.currency],
  );
  const dueCommitmentText = dueCommitmentGroups.length === 0
    ? `0 ${sym}`
    : dueCommitmentGroups.length === 1
      ? `${formatMoneyNumber(dueCommitmentGroups[0].amount, dueCommitmentGroups[0].currency, cfg.lang)} ${getSymbol(dueCommitmentGroups[0].currency)}`
      : `${dueCommitmentGroups.length} ${C.currenciesWord}`;
  const currentMonthRows = getMonthTransactionsByKey(scopedTrans, currentMonthKey);
  const monthSavingTotal = currentMonthRows
    .filter(item => item.isGoalSaving)
    .reduce((sum, item) => {
      const entityCurrency = String(item.entityCurrencyCode || item.currencyCode || cfg.currency).toUpperCase();
      const historicalBase = Number(item.allocationBaseAmount);
      if (Number.isFinite(historicalBase)) return sum + Math.abs(historicalBase);
      return entityCurrency === String(cfg.currency).toUpperCase()
        ? sum + Math.abs(Number(item.allocationAmount || 0))
        : sum;
    }, 0);
  const attentionItems = useMemo(() => ([
    ...dueCommitments.map(item => ({ ...item, attentionType: 'commitment', sortDays: item.monthsUntil * 32 })),
    ...upcoming.filter(item => item.daysUntil <= 31).map(item => ({ ...item, attentionType: 'recurring', sortDays: item.daysUntil })),
  ]).sort((a, b) => a.sortDays - b.sortDays), [upcoming, dueCommitments]);
  const hidden = cfg.homeBalancesHidden === true;
  const moneyText = (value) => (hidden ? C.hiddenAmount : value);
  const findCat = (catId) => cats.find(c => c.id === catId) || cats.find(c => c.id === 'other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];
  const isHomeSectionVisible = (key) => homeSectionsMap.get(key) !== false;
  const effectiveMonthSummary = financialLedgerV7Cutover && sqlHome?.summary?.supported !== false && sqlHome?.summary
    ? { inc: Number(sqlHome.summary.income || 0), exp: Number(sqlHome.summary.expense || 0), net: Number(sqlHome.summary.net || 0), count: Number(sqlHome.summary.count || 0) }
    : { inc: Number(snapshot.month.inc || 0), exp: Number(snapshot.month.exp || 0), net: Number(snapshot.month.net || 0), count: currentMonthRows.length };
  const monthFlowTotal = Math.abs(effectiveMonthSummary.inc) + Math.abs(effectiveMonthSummary.exp);
  const monthIncomeShare = monthFlowTotal > 0 ? pct(Math.abs(effectiveMonthSummary.inc), monthFlowTotal, { cap: true }) : 0;
  const homeCards = homeCardsCfg.map((item) => {
    if (item.key === 'income') {
      return {
        ...item,
        direction: 'income',
        label: L.income,
        value: effectiveMonthSummary.inc === 0 ? `0 ${sym}` : `+${fmt(effectiveMonthSummary.inc)} ${sym}`,
        color: th.inc,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'expense') {
      return {
        ...item,
        direction: 'expense',
        label: L.expense,
        value: effectiveMonthSummary.exp === 0 ? `0 ${sym}` : `-${fmt(effectiveMonthSummary.exp)} ${sym}`,
        color: th.exp,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'saving') {
      return {
        ...item,
        icon: 'flag-outline',
        label: C.savingThisMonth,
        value: `${fmt(monthSavingTotal)} ${sym}`,
        color: th.primary,
        onPress: () => onOpenTab('trackers'),
      };
    }
    if (item.key === 'net') {
      return {
        ...item,
        icon: 'pulse-outline',
        label: C.netWord,
        value: signed(effectiveMonthSummary.net),
        color: effectiveMonthSummary.net >= 0 ? th.inc : th.exp,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'dueSoon') {
      return {
        ...item,
        icon: 'calendar-outline',
        label: C.commitmentWord,
        value: dueCommitmentText,
        color: dueCommitments.length > 0 ? th.warn : th.inc,
        onPress: () => onOpenTab('trackers'),
      };
    }
    return null;
  }).filter(Boolean);
  const computedNotificationItems = useMemo(
    () => buildNotificationItems({
      trans: scopedTrans,
      debts: scopedDebts,
      goals: scopedGoals,
      commitments: scopedCommitments,
      wallets: scopedWallets,
      cats,
      cfg,
      notif,
      symbol: sym,
    }).slice(0, 8),
    [trans, debts, goals, commitments, wallets, cats, cfg, notif, sym],
  );
  const notificationItems = useMemo(
    () => filterDismissedNotifications(computedNotificationItems, dismissedNotificationKeys),
    [computedNotificationItems, dismissedNotificationKeys],
  );
  const notificationKeys = useMemo(
    () => notificationItems.map(notificationReadKey),
    [notificationItems],
  );
  const unreadNotificationCount = notificationKeys.filter(key => !readNotificationKeys.includes(key)).length;
  const pendingSmartReviewCount = scopedTransactionIndex.pendingSmartReviewCount;
  const notificationBadgeCount = unreadNotificationCount + pendingSmartReviewCount;

  useEffect(() => {
    AsyncStorage.getItem('MYFI_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (!raw) return;
        const safe = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw)));
        setReadNotificationKeys(safe);
        AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(safe)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATION_DISMISSED_STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        setDismissedNotificationKeys(pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw))));
      })
      .catch(() => {});
  }, []);

  const openNotificationCenter = () => {
    const next = Array.from(new Set([...readNotificationKeys, ...notificationKeys])).slice(-80);
    setReadNotificationKeys(next);
    setNotificationsOpen(true);
    AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(next)).catch(() => {});
  };

  const dismissNotifications = (keys = []) => {
    const next = pruneNotificationKeys(Array.from(new Set([...dismissedNotificationKeys, ...keys])).slice(-200));
    setDismissedNotificationKeys(next);
    AsyncStorage.setItem(NOTIFICATION_DISMISSED_STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };
  const confirmDeleteRow = (t) => {
    const linked = t.isDebtPayment || t.isGoalSaving || t.isCommitmentPayment;
    const editable = !linked && isCurrentMonthTransaction(t);
    Alert.alert(linked ? C.linkedDeleteTitle : L.delete, linked ? C.linkedDeleteBody : L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteTrans(t.id) },
    ]);
  };

  const confirmDeleteRecent = () => {
    if (!recentSelection.selectedCount) return;
    const linked = recent.some(item => (
      recentSelection.selected.has(item.id)
      && (item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment)
    ));
    const body = isAr
      ? `سيتم حذف ${recentSelection.selectedCount} حركة نهائياً${linked ? ' وتحديث العناصر المرتبطة بها.' : '.'}`
      : `Delete ${recentSelection.selectedCount} transactions permanently${linked ? ' and update linked items.' : '?'}`;
    Alert.alert(L.delete, body, [
      { text: L.no, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteTransMany(recentSelection.selectedIds);
          recentSelection.cancel();
        },
      },
    ]);
  };

  const renderProgress = (value, color) => (
    <View style={[s.progressBg, { backgroundColor: th.cardHigh }]}>
      <View style={[s.progressFg, { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }]} />
    </View>
  );

  const renderRow = (t, index) => {
    const cat = findCat(t.cat);
    const amount = getTransactionDisplayAmount(t);
    const wallet = findWallet(t.walletId);
    const isTransfer = t.kind === 'transfer';
    const semanticKind = getTransactionSemanticKind(t);
    const openingBalance = semanticKind === TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE;
    const balanceAdjustment = semanticKind === TRANSACTION_SEMANTIC_KIND.BALANCE_ADJUSTMENT;
    const protectedOpening = openingBalance;
    const fromWallet = findWallet(t.fromWalletId);
    const toWallet = findWallet(t.toWalletId);
    const linked = t.isDebtPayment || t.isGoalSaving || t.isCommitmentPayment;
    const title = isTransfer ? (cfg.lang === 'ar' ? 'تحويل بين المحافظ' : 'Wallet transfer') : t.title;
    const smartBadge = !isTransfer ? describeSmartSource(t.smartSource, cfg.lang) : null;
    const transactionTag = getTransactionTagMeta(t);
    const smartTone = t.smartSource?.mode === 'voice' ? th.warn : t.smartSource?.mode === 'receipt' ? th.primary : th.inc;
    const editable = !linked && !openingBalance && !balanceAdjustment && isCurrentMonthTransaction(t);
    const expanded = expandedRecentId === t.id;
    const transferLabel = cfg.lang === 'ar' ? 'تحويل' : 'Transfer';
    const fromLabel = cfg.lang === 'ar' ? 'من' : 'From';
    const toLabel = cfg.lang === 'ar' ? 'إلى' : 'To';
    const walletLabel = cfg.lang === 'ar' ? 'المحفظة' : 'Wallet';
    const categoryLabel = cfg.lang === 'ar' ? 'التصنيف' : 'Category';
    const typeText = getSemanticTypeLabel(semanticKind, cfg.lang);
    const semanticColor = balanceAdjustment ? th.warn : openingBalance || isTransfer ? th.primary : amount > 0 ? th.inc : th.exp;
    return (
      <View
        key={t.id}
        style={[
          s.row,
          s.recentRow,
          {
            backgroundColor: recentSelection.selected.has(t.id) ? th.primSoft : th.card,
            borderColor: recentSelection.selected.has(t.id) ? th.primary : th.border,
            borderBottomWidth: index === recent.length - 1 ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <View style={[s.rowShell, { flexDirection: rowDir }]}>
          <Pressable
            onLongPress={protectedOpening ? undefined : () => recentSelection.toggle(t.id)}
            onPress={() => {
              if (recentSelection.selecting && !protectedOpening) recentSelection.toggle(t.id);
            }}
            style={[s.rowMain, { flexDirection: rowDir }]}
          >
            <View style={[s.catDot, { backgroundColor: `${semanticColor}22`, borderColor: semanticColor }]}>
              <Ionicons name={openingBalance ? 'flag-outline' : balanceAdjustment ? 'git-compare-outline' : isTransfer ? 'swap-horizontal-outline' : (cat.icon || 'cube-outline')} size={18} color={semanticColor} />
            </View>
            <View style={{ flex: 1, marginHorizontal: 10 }}>
              <View style={[s.titleRow, { flexDirection: rowDir }]}>
                <Text style={{ color: th.text, ...weight('700'), fontSize: 14, textAlign: align, flex: 1 }} numberOfLines={1}>
                  {title}
                </Text>
                {smartBadge ? (
                  <View style={[s.smartBadge, { backgroundColor: `${smartTone}18`, borderColor: `${smartTone}36`, flexDirection: rowDir }]}>
                    <Ionicons name={smartBadge.icon} size={11} color={smartTone} />
                    <Text style={{ color: smartTone, fontSize: 11, ...weight('900') }}>{smartBadge.label}</Text>
                  </View>
                ) : null}
              </View>
              {transactionTag.id !== 'none' ? (
                <View style={[s.transactionTagLine, { flexDirection: rowDir }]}>
                  <Ionicons name={transactionTag.icon} size={11} color={th.primary} />
                  <Text style={{ color: th.primary, fontSize: 10, ...weight('900') }} numberOfLines={1}>
                    {cfg.lang === 'ar' ? transactionTag.label : transactionTag.labelEn}
                  </Text>
                </View>
              ) : null}
              <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align }} numberOfLines={2}>
                {isTransfer
                  ? `${getWalletLabel(fromWallet, cfg.lang)} -> ${getWalletLabel(toWallet, cfg.lang)} - ${t.dateISO}`
                  : `${cfg.lang === 'ar' ? cat.label : cat.labelEn} - ${t.dateISO}${modules.wallets && t.walletId ? ` - ${getWalletLabel(wallet, cfg.lang)}` : ''}${t.recurring ? ` - ${cfg.lang === 'ar' ? 'متكرر' : 'recurring'}` : ''}`}
              </Text>
            </View>
            <Text style={{ color: semanticColor, ...weight('900'), fontSize: 15, writingDirection: 'ltr' }}>
              {moneyText(`${isTransfer ? fmt(t.transferAmount) : `${amount > 0 ? '+' : '-'}${fmt(amount)}`} ${sym}`)}
            </Text>
          </Pressable>
          {recentSelection.selecting ? (
            <SelectionCheckbox th={th} selected={recentSelection.selected.has(t.id)} onPress={() => recentSelection.toggle(t.id)} />
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setExpandedRecentId(expanded ? null : t.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                style={[s.detailsToggle, { backgroundColor: expanded ? th.primSoft : th.cardHigh }]}
              >
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={expanded ? th.primary : th.sub} />
              </TouchableOpacity>
              <ActionMenu
                th={th}
                lang={cfg.lang}
                title={title}
                buttonStyle={{ backgroundColor: th.cardHigh, width: 32, height: 32, borderRadius: 10 }}
                items={[
                  !protectedOpening ? { label: C.select, icon: 'checkmark-circle-outline', color: th.primary, onPress: () => recentSelection.toggle(t.id) } : null,
                  { label: cfg.lang === 'ar' ? 'التفاصيل' : 'Details', icon: 'reader-outline', color: th.primary, onPress: () => setDetails(t) },
                  editable ? { label: L.editTrans, icon: 'create-outline', color: th.primary, onPress: () => setEditing(t) } : null,
                  !protectedOpening ? { label: L.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteRow(t) } : null,
                ]}
              />
            </>
          )}
        </View>
        {expanded ? (
          <View style={[s.inlineDetails, { borderTopColor: th.border }]}>
            <View style={[s.inlineDetailGrid, { flexDirection: rowDir }]}>
              <View style={[s.inlineDetailItem, { backgroundColor: th.cardHigh }]}>
                <Text style={[s.inlineDetailLabel, { color: th.sub, textAlign: align }]}>{cfg.lang === 'ar' ? 'النوع' : 'Type'}</Text>
                <Text style={[s.inlineDetailValue, { color: th.text, textAlign: align }]} numberOfLines={1}>{typeText}</Text>
              </View>
              <View style={[s.inlineDetailItem, { backgroundColor: th.cardHigh }]}>
                <Text style={[s.inlineDetailLabel, { color: th.sub, textAlign: align }]}>{cfg.lang === 'ar' ? 'التاريخ' : 'Date'}</Text>
                <Text style={[s.inlineDetailValue, { color: th.text, textAlign: align }]} numberOfLines={1}>{t.dateISO || '-'}</Text>
              </View>
              <View style={[s.inlineDetailItem, { backgroundColor: th.cardHigh }]}>
                <Text style={[s.inlineDetailLabel, { color: th.sub, textAlign: align }]}>{isTransfer ? fromLabel : walletLabel}</Text>
                <Text style={[s.inlineDetailValue, { color: th.text, textAlign: align }]} numberOfLines={1}>
                  {isTransfer ? getWalletLabel(fromWallet, cfg.lang) : getWalletLabel(wallet, cfg.lang)}
                </Text>
              </View>
              <View style={[s.inlineDetailItem, { backgroundColor: th.cardHigh }]}>
                <Text style={[s.inlineDetailLabel, { color: th.sub, textAlign: align }]}>{isTransfer ? toLabel : categoryLabel}</Text>
                <Text style={[s.inlineDetailValue, { color: th.text, textAlign: align }]} numberOfLines={1}>
                  {isTransfer ? getWalletLabel(toWallet, cfg.lang) : (cfg.lang === 'ar' ? cat.label : cat.labelEn)}
                </Text>
              </View>
            </View>
            {t.note || t.recurring || linked ? (
              <Text style={[s.inlineDetailNote, { color: th.sub, textAlign: align }]}>
                {[t.recurring ? (cfg.lang === 'ar' ? 'متكرر شهرياً' : 'Monthly recurring') : null, linked ? (cfg.lang === 'ar' ? 'مرتبطة بمتابعة' : 'Linked to tracker') : null, t.note].filter(Boolean).join(' · ')}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  const openRecurringDraft = (item) => {
    setRecurringDraft({
      ...item,
      id: null,
      dateISO: item.dueISO || item.dateISO,
      recurring: true,
      recurringGroupId: item.recurringGroupId || item.id,
    });
  };

  const renderRecurringRow = (item) => {
    const cat = findCat(item.cat);
    const amount = Number(item.amt || 0);
    const dueText = item.daysUntil < 0
      ? `${C.overdue} ${Math.abs(item.daysUntil)} ${C.days}`
      : item.daysUntil === 0
        ? C.dueToday
        : `${C.dueIn} ${item.daysUntil} ${C.days}`;
    return (
      <TouchableOpacity
        key={item.recurringGroupId || item.id}
        onPress={() => openRecurringDraft(item)}
        style={[s.row, { backgroundColor: th.card, borderColor: th.primary, flexDirection: rowDir }]}
      >
        <View style={[s.catDot, { backgroundColor: `${cat.color || th.primary}22`, borderColor: cat.color || th.primary }]}>
          <Ionicons name="repeat" size={18} color={cat.color || th.primary} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={{ color: th.text, ...weight('800'), fontSize: 14, textAlign: align }} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align }} numberOfLines={2}>
            {C.reviewRecurring} · {dueText} · {item.dueISO}
          </Text>
        </View>
        <Text style={{ color: amount > 0 ? th.inc : th.exp, ...weight('900'), fontSize: 15 }}>
          {moneyText(`${amount > 0 ? '+' : '-'}${fmt(amount)} ${sym}`)}
        </Text>
      </TouchableOpacity>
    );
  };


  const renderMoneyTile = ({ icon, direction, label, value, color, onPress, separatorStyle }) => (
    <TouchableOpacity
      style={[s.monthMetric, separatorStyle]}
      onPress={onPress}
    >
      <View style={[s.monthMetricLabelRow, { flexDirection: rowDir }]}>
        {direction
          ? <FinancialDirectionMark kind={direction} color={color} size={15} lang={cfg.lang} />
          : <Ionicons name={icon} size={14} color={color} />}
        <Text style={[s.monthMetricLabel, { color: th.sub, textAlign: align }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={[s.monthMetricValue, { color, textAlign: align, writingDirection: 'ltr' }]} numberOfLines={1} adjustsFontSizeToFit>
        {moneyText(value)}
      </Text>
    </TouchableOpacity>
  );

  // If the user has a ledger, the configured Month summary stays visible even
  // when the current month is still zero. Only a truly empty ledger uses the
  // first-entry state. This keeps Home faithful to the user's Home settings.
  const hasLedgerEntries = ledgerReadFailed
    ? false
    : financialLedgerV7Cutover && sqlHome?.summary ? Number(sqlHome.summary.count || 0) > 0 || recent.length > 0 : scopedTrans.length > 0;
  const visibleHomeCards = hasLedgerEntries
    ? homeCards.filter(item => item.visible !== false)
    : [];
  const quickEntryActions = [
    {
      key: 'income', label: isAr ? 'دخل' : 'Income', hint: isAr ? 'سجّل الوارد' : 'Record incoming',
      direction: 'income', color: th.inc, onPress: onAddIncome,
    },
    {
      key: 'expense', label: isAr ? 'مصروف' : 'Expense', hint: isAr ? 'سجّل الصرف' : 'Record spending',
      direction: 'expense', color: th.exp, onPress: onAddExpense,
    },
    {
      key: 'transfer', label: isAr ? 'تحويل' : 'Transfer', hint: isAr ? 'بين المحافظ' : 'Between wallets',
      icon: 'swap-horizontal-outline', color: th.transfer,
      onPress: canTransfer ? onTransfer : () => Alert.alert(
        isAr ? 'أضف محفظة ثانية أولاً' : 'Add a second wallet first',
        isAr ? 'التحويل يحتاج محفظتين على الأقل. يمكنك إضافتها من إدارة المحافظ.' : 'A transfer needs at least two wallets. You can add one from wallet management.',
        [
          { text: isAr ? 'ليس الآن' : 'Not now', style: 'cancel' },
          { text: isAr ? 'إدارة المحافظ' : 'Manage wallets', onPress: () => onOpenTab('wallets') },
        ],
      ),
    },
    {
      key: 'smart', label: C.smartEntry, hint: isAr ? 'ساعدني أسجّلها' : 'Help me record it',
      icon: 'sparkles-outline', color: th.warn, onPress: onSmartEntry,
    },
  ].filter(Boolean);
  const orderedQuickEntryActions = isAr ? [...quickEntryActions].reverse() : quickEntryActions;
  const topGoalRows = [...activeGoals]
    .sort((a, b) => (Number(b.cur || 0) / Math.max(1, Number(b.target || 0))) - (Number(a.cur || 0) / Math.max(1, Number(a.target || 0))))
    .slice(0, 2);
  const orderedHomeSections = homeSectionsCfg
    .filter(item => (item.visible !== false || (item.key === 'attention' && (attentionItems.length > 0 || healthNeedsAttention))) && item.key !== 'hero')
    .filter(item => item.key !== 'wallets' || modules.wallets)
    // This gate predates the health banner and originally only guarded
    // due-commitment/recurring rows; keep it from also hiding a meaningful
    // health status for a user who has both those modules turned off.
    .filter(item => item.key !== 'attention' || modules.recurring || modules.commitments || healthNeedsAttention)
    .filter(item => item.key !== 'goals' || modules.goals);

  const dueTextFor = (item) => {
    if (item.attentionType === 'commitment') {
      if (item.isDeferred && !item.actionable) {
        return `${cfg.lang === 'ar' ? 'مؤجل إلى' : 'Deferred to'} ${formatCommitmentDate(item.dueISO, cfg.lang)}`;
      }
      const label = formatCommitmentMonth(item.dueISO, cfg.lang);
      if (item.monthsUntil < 0) return `${C.overdue} - ${label}`;
      if (item.monthsUntil === 0) return C.dueThisMonth;
      return `${C.dueMonth}: ${label}`;
    }
    return item.daysUntil < 0
      ? `${C.overdue} ${Math.abs(item.daysUntil)} ${C.days}`
      : item.daysUntil === 0
        ? C.dueToday
        : `${C.dueIn} ${item.daysUntil} ${C.days}`;
  };

  const postponeCommitmentFromHome = (item) => {
    if (!item?.id) return;
    Alert.alert(
      C.postpone,
      C.postponeChoose,
      [
        { text: C.postponeDay, onPress: () => deferCommitment?.(item.id, 'day') },
        { text: C.postpone3Days, onPress: () => deferCommitment?.(item.id, 'three_days') },
        { text: C.postponeNextMonth, onPress: () => deferCommitment?.(item.id, 'next_month') },
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
      ],
      { cancelable: true },
    );
  };

  const stopRecurringFromHome = (item) => {
    if (!item?.id) return;
    Alert.alert(
      isAr ? 'إيقاف التكرار؟' : 'Stop recurring?',
      isAr
        ? 'ستبقى الحركات السابقة في السجل، ولن يُنشأ هذا الدخل أو الصرف تلقائياً في الأشهر القادمة.'
        : 'Past entries stay in History, and this income or expense will no longer repeat in future months.',
      [
        { text: isAr ? 'رجوع' : 'Back', style: 'cancel' },
        {
          text: isAr ? 'إيقاف التكرار' : 'Stop recurring',
          style: 'destructive',
          onPress: () => editTrans?.(item.id, { recurring: false }),
        },
      ],
      { cancelable: true },
    );
  };

  const renderAttentionRow = (item) => {
    const isCommitment = item.attentionType === 'commitment';
    const wallet = isCommitment ? findWallet(item.walletId) : null;
    const amount = Math.abs(Number(item.amt || 0));
    const dueText = dueTextFor(item);
    const overdue = (isCommitment ? item.monthsUntil : item.daysUntil) < 0;
    const tone = overdue ? th.exp : isCommitment ? th.warn : th.primary;
    const deferredLocked = isCommitment && item.isDeferred && item.actionable === false;

    if (!isCommitment) {
      const recurringAmountColor = Number(item.amt || 0) >= 0 ? th.inc : th.exp;
      return (
        <View
          key={`${item.attentionType}-${item.id || item.recurringGroupId}`}
          style={[importantS.card, { backgroundColor: th.cardHigh, borderColor: `${tone}44` }]}
        >
          <View style={[importantS.top, { flexDirection: rowDir }]}>
            <View style={[importantS.icon, { backgroundColor: `${tone}16` }]}>
              <Ionicons name="repeat-outline" size={16} color={tone} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: th.text, ...weight('900'), fontSize: 13, textAlign: align }} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={{ color: th.sub, fontSize: 10, lineHeight: 15, textAlign: align, marginTop: 1 }} numberOfLines={1}>
                {dueText} · {item.dueISO}
              </Text>
            </View>
            <Text style={{ color: recurringAmountColor, ...weight('900'), fontSize: 13 }} numberOfLines={1}>
              {moneyText(`${Number(item.amt || 0) >= 0 ? '+' : '-'}${fmt(amount)} ${sym}`)}
            </Text>
          </View>
          <View style={[importantS.actions, { flexDirection: rowDir }]}>
            <TouchableOpacity
              onPress={() => openRecurringDraft(item)}
              style={[importantS.action, { backgroundColor: th.primary }]}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color={th.onPrimary} />
              <Text style={{ color: th.onPrimary, fontSize: 11, ...weight('900') }}>
                {isAr ? 'تسجيل الآن' : 'Record now'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => stopRecurringFromHome(item)}
              style={[importantS.action, { backgroundColor: th.expBg, borderColor: `${th.exp}55`, borderWidth: 1 }]}
            >
              <Ionicons name="stop-circle-outline" size={14} color={th.exp} />
              <Text style={{ color: th.exp, fontSize: 11, ...weight('900') }}>
                {isAr ? 'إيقاف التكرار' : 'Stop recurring'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View
        key={`commitment-${item.id}`}
        style={[importantS.card, { backgroundColor: th.cardHigh, borderColor: `${tone}44` }]}
      >
        {/* STAGE3_FINAL_IMPORTANT_DECISION */}
        {/* STAGE4_COMPACT_IMPORTANT_DECISION */}
        <View style={[importantS.top, { flexDirection: rowDir }]}>
          <View style={[importantS.icon, { backgroundColor: `${tone}16` }]}>
            <Ionicons name={deferredLocked ? 'time-outline' : 'calendar-outline'} size={15} color={tone} />
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: th.text, fontSize: 13, lineHeight: 18, ...weight('900'), textAlign: align }} numberOfLines={1}>
              {item.name}
            </Text>
            <Text style={{ color: th.sub, fontSize: 10, lineHeight: 15, ...weight('700'), textAlign: align, marginTop: 1 }} numberOfLines={1}>
              {dueText}{modules.wallets ? ` · ${getWalletLabel(wallet, cfg.lang)}` : ''}
            </Text>
          </View>

          <View style={importantS.amountBlock}>
            <Text style={{ color: th.exp, fontSize: 13, lineHeight: 18, ...weight('900'), textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {moneyText(`-${fmt(amount)} ${sym}`)}
            </Text>
            <View style={[importantS.statePill, { backgroundColor: `${tone}14` }]}>
              <Text style={{ color: tone, fontSize: 9, lineHeight: 12, ...weight('900') }} numberOfLines={1}>
                {deferredLocked ? (isAr ? 'مؤجل' : 'Deferred') : overdue ? C.overdue : C.commitmentWord}
              </Text>
            </View>
          </View>
        </View>

        {deferredLocked ? (
          <View style={[importantS.deferred, { backgroundColor: th.warnBg, flexDirection: rowDir }]}>
            <Ionicons name="time-outline" size={13} color={th.warn} />
            <Text style={{ flex: 1, color: th.warn, fontSize: 10, lineHeight: 15, ...weight('900'), textAlign: align }} numberOfLines={1}>
              {dueText}
            </Text>
          </View>
        ) : item.actionable !== false ? (
          <View style={[importantS.actions, { flexDirection: rowDir }]}>
            <TouchableOpacity
              onPress={() => onQuickCommitment(item.id)}
              style={[importantS.action, { backgroundColor: th.primary }]}
            >
              <Ionicons name="checkmark-circle-outline" size={14} color={th.onPrimary} />
              <Text style={{ color: th.onPrimary, fontSize: 11, ...weight('900') }}>{C.markPaid}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => postponeCommitmentFromHome(item)}
              style={[importantS.action, { backgroundColor: th.warnBg, borderColor: `${th.warn}55`, borderWidth: 1 }]}
            >
              <Ionicons name="time-outline" size={14} color={th.warn} />
              <Text style={{ color: th.warn, fontSize: 11, ...weight('900') }}>{C.postpone}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  const renderAttentionSection = () => (
    <View style={[s.attentionPanel, importantS.panel, { backgroundColor: th.warnBg, borderColor: `${th.warn}44` }]}>
      <TouchableOpacity
        onPress={() => setAttentionExpanded(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: attentionExpanded }}
        accessibilityLabel={`${attentionExpanded ? C.hideDetails : C.showDetails} ${C.attention}`}
        style={[s.attentionHeader, importantS.header, { flexDirection: rowDir, marginBottom: attentionExpanded ? 6 : 0 }]}
      >
        <View style={[s.attentionHeaderTitle, { flexDirection: rowDir }]}>
          <View style={[s.attentionHeaderIcon, importantS.headerIcon, { backgroundColor: th.warnBg }]}>
            <Ionicons name="alert-circle-outline" size={18} color={th.warn} />
          </View>
          <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: align, flex: 1 }}>
            {C.attention}
          </Text>
        </View>
        {attentionItems.length ? (
          <View style={[s.attentionCount, { backgroundColor: th.warnBg }]}>
            <Text style={{ color: th.warn, fontSize: 11, ...weight('900') }}>{attentionItems.length}</Text>
          </View>
        ) : null}
        <Ionicons name={attentionExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={th.warn} />
      </TouchableOpacity>

      {attentionExpanded && healthNeedsAttention ? (
        <View style={[importantS.card, { backgroundColor: `${healthColor}12`, borderColor: `${healthColor}44`, flexDirection: rowDir, alignItems: 'center', gap: 8 }]}>
          <Ionicons name="pulse-outline" size={16} color={healthColor} />
          <Text style={{ color: healthColor, fontSize: 12, ...weight('800'), flex: 1, textAlign: align }}>
            {C[snapshot.health] || C.neutral}
          </Text>
        </View>
      ) : null}

      {attentionExpanded && attentionItems.length === 0 ? (
        healthNeedsAttention ? null : (
          <View style={[s.clearPanel, importantS.clearPanel, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
            <Ionicons name="checkmark-circle-outline" size={19} color={th.inc} />
            <Text style={{ color: th.inc, fontSize: 13, ...weight('900') }}>{C.allClear}</Text>
          </View>
        )
      ) : attentionExpanded ? (
        <View style={importantS.items}>
          {attentionItems.slice(0, 4).map(renderAttentionRow)}
        </View>
      ) : null}
    </View>
  );

  const renderSavingsHeader = () => (
    <TouchableOpacity
      onPress={() => setSavingsExpanded(value => !value)}
      accessibilityRole="button"
      accessibilityState={{ expanded: savingsExpanded }}
      accessibilityLabel={`${savingsExpanded ? C.hideDetails : C.showDetails} ${C.savingThisMonth}`}
      style={[s.savingHeader, { flexDirection: rowDir, marginBottom: savingsExpanded ? 7 : 0 }]}
    >
      <View style={[s.savingHeaderIcon, { backgroundColor: th.card }]}>
        <Ionicons name="flag-outline" size={17} color={th.primary} />
      </View>
      <Text style={[s.savingTitle, { color: th.text, textAlign: align }]}>{C.savingThisMonth}</Text>
      {activeGoals.length ? (
        <View style={[s.savingCount, { backgroundColor: th.card }]}>
          <Text style={{ color: th.primary, fontSize: 10, ...weight('900') }}>{activeGoals.length}</Text>
        </View>
      ) : null}
      <Ionicons name={savingsExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={th.primary} />
    </TouchableOpacity>
  );

  const renderGoalsSection = () => {
    if (!activeGoals.length) return (
      <View style={[s.savingPanel, { backgroundColor: th.primSoft, borderColor: `${th.primary}44` }]}>
        {renderSavingsHeader()}
        {savingsExpanded ? <View style={[s.savingEmpty, { backgroundColor: th.cardHigh }]}>
          <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), textAlign: 'center' }}>{C.noActiveGoals}</Text>
        </View> : null}
      </View>
    );

    return (
      <View style={[s.savingPanel, { backgroundColor: th.primSoft, borderColor: `${th.primary}44` }]}>
        {renderSavingsHeader()}

        {savingsExpanded ? <><View style={[s.savingSummary, { flexDirection: rowDir }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.savingSummaryLabel, { color: th.sub, textAlign: align }]}>{C.saved}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              style={[s.savingSummaryValue, { color: th.text, textAlign: align }]}
            >
              {moneyText(goalSummaryText)}
            </Text>
          </View>
          <Text style={[s.savingPercent, { color: th.primary }]}>{hidden ? C.hiddenAmount : `${goalsProgress}%`}</Text>
        </View>
        {renderProgress(goalsProgress, th.primary)}

        <View style={s.savingGoalList}>
          {topGoalRows.map((goal, index) => {
            const progress = pct(goal.cur, goal.target, { cap: true });
            return (
              <View
                key={goal.id}
                style={[
                  s.savingGoalRow,
                  {
                    borderTopColor: th.border,
                    flexDirection: rowDir,
                    borderTopWidth: index === 0 ? 0 : 1,
                  },
                ]}
              >
                <View style={[s.savingGoalDot, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="flag-outline" size={13} color={th.primary} />
                </View>
                <Text style={[s.savingGoalName, { color: th.text, textAlign: align }]} numberOfLines={1}>{goal.name}</Text>
                <Text style={[s.savingGoalProgress, { color: th.sub }]}>{hidden ? C.hiddenAmount : `${progress}%`}</Text>
              </View>
            );
          })}
        </View></> : null}
      </View>
    );
  };

  // Wallets are part of the balance context, but their detailed cards belong
  // in a focused sheet so they never push the month summary below the fold.
  const renderWalletStrip = () => {
    if (walletRows.length === 0) return null;
    const defaultWallet = walletRows.find(wallet => wallet.id === defaultWalletId) || walletRows[0];
    const renderWalletCard = (wallet) => {
      const currencyCode = wallet.currency || cfg.currency;
      const currencyMeta = CURRENCIES.find(item => item.code === currencyCode);
      const currencyName = currencyMeta ? (isAr ? currencyMeta.name : currencyMeta.nameEn) : currencyCode;
      const selected = wallet.id === defaultWalletId;
      const reserved = Number(wallet.reservedBalance || 0);
      const balanceText = hidden ? C.hiddenAmount : `${formatMoneyNumber(wallet.availableBalance, currencyCode, cfg.lang)} ${currencyCode}`;
      return (
        <TouchableOpacity
          key={wallet.id}
          onPress={() => setCfg({ defaultWalletId: wallet.id })}
          accessibilityRole="radio"
          accessibilityState={{ checked: selected, selected }}
          accessibilityLabel={`${getWalletLabel(wallet, cfg.lang)}${selected ? (isAr ? '، المحفظة الافتراضية' : ', default wallet') : (isAr ? '، اختيار كمحفظة افتراضية' : ', set as default wallet')}`}
          style={[
            s.walletSheetCard,
            { backgroundColor: selected ? th.primSoft : th.card, borderColor: selected ? `${th.primary}88` : th.border },
          ]}
        >
          <View style={[s.walletSheetCardTop, { flexDirection: rowDir }]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={[s.walletStripTop, { flexDirection: rowDir }]}>
                <Text style={[s.walletStripName, { color: th.text, textAlign: align }]} numberOfLines={1}>{getWalletLabel(wallet, cfg.lang)}</Text>
                {selected ? <View style={[s.walletDefaultPill, { backgroundColor: `${th.primary}22` }]}><Text style={{ color: th.primary, fontSize: 9, ...weight('900') }}>{isAr ? 'افتراضية' : 'Default'}</Text></View> : null}
              </View>
              <Text style={[s.walletSheetTotal, { color: th.sub, textAlign: align }]} numberOfLines={1}>{isAr ? 'الإجمالي' : 'Total'} · {hidden ? C.hiddenAmount : `${formatMoneyNumber(wallet.balance, currencyCode, cfg.lang)} ${currencyCode}`}</Text>
            </View>
            <View style={[s.walletStripIcon, { backgroundColor: selected ? th.primary : th.cardHigh }]}>
              <Ionicons name={selected ? 'star' : 'wallet-outline'} size={17} color={selected ? th.onPrimary : th.primary} />
            </View>
          </View>
          <View style={[s.walletSheetAmountRow, { flexDirection: rowDir }]}>
            <Text style={[s.walletSheetAvailableLabel, { color: th.sub, textAlign: align }]}>{isAr ? 'المتاح' : 'Available'}</Text>
            <Text style={[s.walletSheetAmount, { color: selected ? th.primary : th.text, textAlign: align }]} numberOfLines={1} adjustsFontSizeToFit>{balanceText}</Text>
          </View>
          {reserved > 0 ? <View style={[s.walletReservedPill, { backgroundColor: `${th.warn}18` }]}><Ionicons name="lock-closed-outline" size={11} color={th.warn} /><Text style={{ color: th.warn, fontSize: 10, ...weight('900') }}>{isAr ? `محجوز ${formatMoneyNumber(reserved, currencyCode, cfg.lang)} ${currencyCode}` : `${formatMoneyNumber(reserved, currencyCode, cfg.lang)} ${currencyCode} reserved`}</Text></View> : null}
          <Text style={[s.walletStripCurrency, { color: th.faint, textAlign: align }]} numberOfLines={1}>{currencyName}</Text>
        </TouchableOpacity>
      );
    };
    return (
      <Modal visible={walletsExpanded} transparent animationType="slide" onRequestClose={() => setWalletsExpanded(false)}>
        <View style={[s.walletSheetOverlay, { backgroundColor: th.overlay || 'rgba(0,0,0,.55)' }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setWalletsExpanded(false)} />
          <View style={[s.walletSheet, { backgroundColor: th.bg, borderColor: th.border }]}>
            <View style={[s.walletSheetHead, { flexDirection: rowDir }]}>
              <TouchableOpacity onPress={() => setWalletsExpanded(false)} style={[s.walletSheetClose, { backgroundColor: th.cardHigh }]} accessibilityLabel={isAr ? 'إغلاق' : 'Close'}><Ionicons name="chevron-down" size={21} color={th.text} /></TouchableOpacity>
              <Text style={[s.walletSheetTitle, { color: th.text, textAlign: align }]}>{isAr ? 'المحافظ والأرصدة' : 'Wallets & balances'}</Text>
            </View>
            <View style={[s.walletSheetIntro, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}>
              <View style={[s.walletStripIcon, { backgroundColor: th.primSoft }]}><Ionicons name="wallet-outline" size={17} color={th.primary} /></View>
              <Text style={[s.walletSheetIntroText, { color: th.text, textAlign: align }]}>{isAr ? 'اختيار المحفظة الافتراضية' : 'Choose the default wallet'}</Text>
              <View style={[s.walletCountPill, { backgroundColor: th.cardHigh }]}><Text style={{ color: th.text, ...weight('900') }}>{walletCount}</Text></View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.walletSheetList}>
              {walletRows.map(renderWalletCard)}
            </ScrollView>
            <TouchableOpacity onPress={() => { setWalletsExpanded(false); onOpenTab('wallets'); }} style={[s.walletManage, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}>
              <Ionicons name="settings-outline" size={17} color={th.primary} />
              <Text style={[s.walletManageText, { color: th.primary }]}>{isAr ? 'إدارة المحافظ' : 'Manage wallets'}</Text>
              <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.primary} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  // Collapsible like Needs Attention / Savings — same header-toggle pattern,
  // defaulting to closed. `recent` is already capped to recentLimit (3)
  // upstream; this section never fetches or renders more than that inline —
  // "View all transactions" below routes to the existing History screen.
  const renderRecentSection = () => (
    <View style={[s.recentPanel, { backgroundColor: th.card, borderColor: th.border }]}>
      <TouchableOpacity
        onPress={() => {
          if (recentExpanded && recentSelection.selecting) recentSelection.cancel();
          setRecentExpanded(value => !value);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: recentExpanded }}
        accessibilityLabel={`${recentExpanded ? C.hideDetails : C.showDetails} ${L.recent}`}
        style={[s.recentHead, { flexDirection: rowDir, marginBottom: recentExpanded ? 7 : 0 }]}
      >
        <View style={[s.recentHeadTitle, { flexDirection: rowDir }]}>
          <View style={[s.recentHeadIcon, { backgroundColor: th.card }]}>
            <Ionicons name="receipt-outline" size={17} color={th.primary} />
          </View>
          <Text style={[s.recentTitle, { color: th.text, textAlign: align }]}>{L.recent}</Text>
        </View>
        {recent.length ? (
          <View style={[s.recentCount, { backgroundColor: th.cardHigh }]}>
            <Text style={{ color: th.primary, fontSize: 10, ...weight('900') }}>{recent.length}</Text>
          </View>
        ) : null}
        <Ionicons name={recentExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={th.primary} />
      </TouchableOpacity>

      {recentExpanded ? (
        <>
          <MultiSelectBar
            th={th}
            lang={cfg.lang}
            active={recentSelection.selecting}
            count={recentSelection.selectedCount}
            total={recent.length}
            allSelected={recentSelection.allSelected}
            onStart={recentSelection.start}
            onToggleAll={recentSelection.toggleAll}
            onDelete={confirmDeleteRecent}
            onCancel={recentSelection.cancel}
          />
          {recent.length === 0 ? (
            <View style={[s.empty, { borderColor: th.border }]}>
              <Ionicons name="receipt-outline" size={34} color={th.faint} />
              <Text style={{ color: th.text, ...weight('900'), fontSize: 15, marginTop: 10, textAlign: 'center' }}>
                {C.emptyTitle}
              </Text>
              <Text style={{ color: th.sub, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                {C.emptyBody}
              </Text>
              <View style={[s.emptyActions, { flexDirection: rowDir }]}>
                <TouchableOpacity onPress={onAddIncome} style={[s.emptyAction, { backgroundColor: th.incBg, borderColor: `${th.inc}44` }]}>
                  <FinancialDirectionMark kind="income" color={th.inc} size={17} lang={cfg.lang} />
                  <Text style={{ color: th.inc, fontSize: 11, ...weight('900') }}>{isAr ? 'إضافة دخل' : 'Add income'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onAddExpense} style={[s.emptyAction, { backgroundColor: th.expBg, borderColor: `${th.exp}44` }]}>
                  <FinancialDirectionMark kind="expense" color={th.exp} size={17} lang={cfg.lang} />
                  <Text style={{ color: th.exp, fontSize: 11, ...weight('900') }}>{isAr ? 'إضافة مصروف' : 'Add expense'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              <View style={[s.recentList, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                {recent.map(renderRow)}
              </View>
              <TouchableOpacity
                onPress={() => onOpenTab('history')}
                accessibilityRole="button"
                style={[s.recentAllLink, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}
              >
                <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{C.allTransactions}</Text>
                <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={15} color={th.primary} />
              </TouchableOpacity>
            </>
          )}
        </>
      ) : null}
    </View>
  );

  const renderQuickEntry = () => (
    cfg.entryMode === 'quick' ? (
      <View style={s.quickEntry}>
        <View style={[s.quickEntryHead, { flexDirection: rowDir }]}>
          <Text style={[s.quickEntryTitle, { color: th.text, textAlign: align }]}>{C.quickActions}</Text>
          <Text style={[s.quickEntryPrompt, { color: th.sub, textAlign: isAr ? 'left' : 'right' }]} numberOfLines={1}>
            {isAr ? 'اختر الحركة' : 'Choose a transaction'}
          </Text>
        </View>
        <View style={[s.quickEntrySurface, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.quickEntryRow, { flexDirection: rowDir }]}>
            {orderedQuickEntryActions.map(action => (
              <TouchableOpacity
                key={action.key}
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={`${action.label}. ${action.hint}`}
                style={[
                  s.quickEntryAction,
                  { backgroundColor: `${action.color}10`, borderColor: `${action.color}3e` },
                ]}
              >
                <View style={[s.quickEntryIcon, { backgroundColor: `${action.color}18`, borderColor: `${action.color}44` }]}>
                  {action.direction
                    ? <FinancialDirectionMark kind={action.direction} color={action.color} size={20} lang={cfg.lang} />
                    : <Ionicons name={action.icon} size={18} color={action.color} />}
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[s.quickEntryLabel, { color: th.text }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    ) : null
  );

  const renderHomeSection = (item) => {
    if (item.key === 'attention') return (attentionItems.length || healthNeedsAttention) ? <React.Fragment key={item.key}>{renderAttentionSection()}</React.Fragment> : null;
    if (item.key === 'goals') return activeGoals.length ? <React.Fragment key={item.key}>{renderGoalsSection()}</React.Fragment> : null;
    if (item.key === 'recentTransactions') return recent.length > 0 ? <React.Fragment key={item.key}>{renderRecentSection()}</React.Fragment> : null;
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: 112 }}>
        <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={openNotificationCenter}
            style={[s.notifyBtn, { backgroundColor: th.card, borderColor: th.border }]}
          >
            <Ionicons name="notifications-outline" size={18} color={th.primary} />
            {notificationBadgeCount > 0 ? (
              <View
                style={[
                  s.notifyBadge,
                  {
                    backgroundColor: th.primary,
                    right: cfg.lang === 'ar' ? undefined : -4,
                    left: cfg.lang === 'ar' ? -4 : undefined,
                  },
                ]}
              >
                <Text style={{ color: th.onPrimary, fontSize: 11, ...weight('900') }}>
                  {Math.min(notificationBadgeCount, 9)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <View style={s.brandLockup}>
            <Text style={[s.brandTitle, { color: th.primary }]}>MYFI</Text>
          </View>
          <TouchableOpacity
            onPress={() => setCenterMode('profile')}
            style={[s.profileButton, { backgroundColor: th.card, borderColor: th.border }]}
            accessibilityRole="button"
            accessibilityLabel={isAr ? 'فتح الحساب' : 'Open account'}
          >
            <View style={[s.profileAvatar, { backgroundColor: th.primSoft }]}>
              {cfg.avatarUri ? <Image source={{ uri: cfg.avatarUri }} style={s.profileAvatarImage} /> : <Text style={{ color: th.primary, fontSize: 13, ...weight('900') }}>{accountInitial}</Text>}
              {user ? <View style={[s.profileStatus, { backgroundColor: th.inc, borderColor: th.card }]} /> : null}
            </View>
          </TouchableOpacity>
        </View>

        {isHomeSectionVisible('hero') ? (
        <View style={[s.hero, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.heroTop, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <View style={[s.heroLabelRow, { flexDirection: rowDir }]}>
                <Text style={[s.heroLabel, { color: th.sub, textAlign: align }]}>{isAr ? 'الرصيد المتاح' : 'Available balance'}</Text>
                <TouchableOpacity
                  onPress={() => setCfg({ homeBalancesHidden: !hidden })}
                  style={s.heroVisibilityBtn}
                  hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={hidden ? C.showBalance : C.hideBalance}
                >
                  <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={14} color={th.sub} />
                </TouchableOpacity>
              </View>
              <Text style={[s.heroAmount, { color: th.text, textAlign: align, writingDirection: 'ltr' }]} numberOfLines={1} adjustsFontSizeToFit>
                {moneyText(heroBalanceText)}
              </Text>
            </View>
          </View>
          <View style={[s.heroRule, { backgroundColor: th.primary }]} />
          {ledgerReadFailed ? (
            <View style={[s.ledgerReadError, { backgroundColor: th.warnBg, borderColor: `${th.warn}44`, flexDirection: rowDir }]}>
              <Ionicons name="cloud-offline-outline" size={16} color={th.warn} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.ledgerReadErrorTitle, { color: th.warn, textAlign: align }]}>{C.ledgerUnavailable}</Text>
                <Text style={[s.ledgerReadErrorHint, { color: th.sub, textAlign: align }]}>{C.ledgerUnavailableHint}</Text>
              </View>
              <TouchableOpacity onPress={() => setLedgerRetry(value => value + 1)} accessibilityLabel={C.retryLedger} style={[s.ledgerRetry, { backgroundColor: th.card }]}>
                <Ionicons name="refresh-outline" size={16} color={th.primary} />
              </TouchableOpacity>
            </View>
          ) : <Text style={[s.heroMeta, { color: th.sub, textAlign: align }]}>{isAr ? 'المتاح للاستخدام الآن' : 'Ready to use now'}</Text>}
          {walletCount > 0 ? <TouchableOpacity
            onPress={() => setWalletsExpanded(true)}
            accessibilityRole="button"
            accessibilityLabel={isAr ? `فتح المحافظ والأرصدة، ${walletCount} محافظ` : `Open wallets and balances, ${walletCount} wallets`}
            style={[s.heroWalletTrigger, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}
          >
            <View style={[s.walletStripIcon, { backgroundColor: th.primSoft }]}><Ionicons name="wallet-outline" size={16} color={th.primary} /></View>
            <Text style={[s.heroWalletText, { color: th.text, textAlign: align }]}>{isAr ? `${walletCount} محافظ` : `${walletCount} wallets`}</Text>
            <Text style={[s.heroWalletAction, { color: th.primary }]}>{isAr ? 'إظهار' : 'Show'}</Text>
          </TouchableOpacity> : null}
        </View>
        ) : null}

        {renderWalletStrip()}

        {visibleHomeCards.length > 0 ? (
        <View style={s.monthMetricsBlock}>
          <View style={[s.monthMetricsHead, { flexDirection: rowDir }]}>
            <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: align, flex: 1 }}>
              {C.monthSummary}
            </Text>
            <View style={[s.monthBadge, { backgroundColor: th.primSoft }]}>
              <Text style={{ color: th.primary, fontSize: 10, ...weight('900') }}>
                {currentMonthName}
              </Text>
            </View>
          </View>
          <View style={[s.monthSummarySurface, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.monthMetricGrid, { flexDirection: rowDir }]}>
              {visibleHomeCards.map((item, index) => (
                <React.Fragment key={item.key}>{renderMoneyTile({
                  ...item,
                  separatorStyle: {
                    borderColor: th.border,
                    borderTopWidth: index >= 2 ? 1 : 0,
                    ...(index % 2 === 1 ? (isAr ? { borderRightWidth: 1 } : { borderLeftWidth: 1 }) : {}),
                  },
                })}</React.Fragment>
              ))}
            </View>
            <View style={[s.monthFlowBar, { backgroundColor: th.cardHigh }]}>
              {monthFlowTotal > 0 ? (
                <>
                  <View style={{ width: `${monthIncomeShare}%`, height: '100%', backgroundColor: th.inc }} />
                  <View style={{ flex: 1, height: '100%', backgroundColor: th.exp }} />
                </>
              ) : null}
            </View>
          </View>
        </View>
        ) : null}
        {renderQuickEntry()}
        {orderedHomeSections.map(renderHomeSection)}
      </ScrollView>

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <TransactionDetailsModal visible={!!details} transaction={details} cats={cats} wallets={wallets} debts={debts} goals={goals} commitments={commitments} cfg={cfg} onClose={() => setDetails(null)} />
      <AddTransModal visible={!!recurringDraft} onClose={() => setRecurringDraft(null)} draftData={recurringDraft} />
      <NotificationCenterModal
        visible={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        onItemPress={(item) => {
          setNotificationsOpen(false);
          onNotificationAction(item);
        }}
        onDismissItems={dismissNotifications}
        items={notificationItems}
        smartReviewCount={pendingSmartReviewCount}
        onOpenReview={() => { setNotificationsOpen(false); setCenterMode('review'); }}
        th={th}
        lang={cfg.lang}
      />
      <HomeCenterModal
        visible={!!centerMode}
        mode={centerMode || 'profile'}
        onClose={() => setCenterMode(null)}
        onMode={setCenterMode}
        onOpenTab={onOpenTab}
        onOpenSettingsPage={onOpenSettingsPage}
        onEditTransaction={setEditing}
        onOpenTransactionDetails={setDetails}
      />
    </View>
  );
}

const s = StyleSheet.create({
  topBar:       { alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  topBarSpacer: { width: 44 },
  notifyBtn:    { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  notifyBadge:  { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, position: 'absolute', top: -4, right: -4 },
  brandLockup:  { flexDirection: 'row', alignItems: 'center' },

  profileButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileAvatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexShrink: 0, position: 'relative' },
  profileAvatarImage: { width: '100%', height: '100%', borderRadius: 16 },
  profileStatus: { width: 9, height: 9, borderRadius: 5, borderWidth: 2, position: 'absolute', bottom: -1, right: -1 },



  brandTitle:   { fontSize: 23, lineHeight: 28, ...weight('900'), letterSpacing: 0 },
  hero:         { borderRadius: RADIUS.sheet, borderWidth: 1, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, marginBottom: 10, ...SHADOW.card },
  heroTop:      { alignItems: 'flex-start', gap: 8 },
  heroLabelRow: { alignItems: 'center', gap: 7 },
  heroLabel:    { fontSize: TYPE.meta, lineHeight: 17, ...weight('900') },
  heroVisibilityBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  heroAmount:   { fontSize: 29, lineHeight: 36, ...weight('900'), marginTop: 2 },
  heroRule:     { height: 4, borderRadius: 2, marginTop: 9 },
  heroMeta:     { fontSize: 10, lineHeight: 14, ...weight('800'), marginTop: 6 },
  heroWalletTrigger: { minHeight: 44, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 10, marginTop: 8 },
  heroWalletText: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, ...weight('900') },
  heroWalletAction: { fontSize: 12, lineHeight: 17, ...weight('900') },
  ledgerReadError: { borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', gap: 8, padding: 9, marginTop: 9 },
  ledgerReadErrorTitle: { fontSize: 11, lineHeight: 16, ...weight('900') },
  ledgerReadErrorHint: { fontSize: 9, lineHeight: 14, ...weight('700'), marginTop: 1 },
  ledgerRetry: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  heroFact:     { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 54, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  factDivider:  { width: 1, height: 30 },
  quickEntry:   { marginBottom: 10 },
  quickEntrySurface:{ borderWidth: 1, borderRadius: RADIUS.lg, padding: 8 },
  quickEntryHead:{ minHeight: 28, alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5, paddingHorizontal: 2 },
  quickEntryTitle:{ flex: 1, fontSize: 14, lineHeight: 19, ...weight('900') },
  quickEntryPrompt:{ maxWidth: '48%', fontSize: 10, lineHeight: 14, ...weight('800') },
  quickEntryRow: { alignItems: 'stretch', justifyContent: 'space-between', gap: 5 },
  quickEntryAction:{ flex: 1, flexBasis: 0, minWidth: 0, minHeight: 72, borderRadius: 12, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 2 },
  quickEntryIcon:{ width: 34, height: 34, borderRadius: 17, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  quickEntryLabel:{ fontSize: 10, lineHeight: 14, ...weight('900'), textAlign: 'center', maxWidth: '100%' },
  walletSummary:{ alignItems: 'center', gap: 8, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, marginTop: 10 },
  walletStripBlock: { marginBottom: 10 },
  walletStripSummary: { minHeight: 54, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', gap: 9, paddingHorizontal: 11, ...SHADOW.card },
  walletStripHead: { minHeight: 30, alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 2, marginTop: 7, marginBottom: 6 },
  walletStripTitle: { fontSize: 14, lineHeight: 19, ...weight('900') },
  walletStripDefault: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 1 },
  walletStripDetailTitle: { flex: 1, fontSize: 10, lineHeight: 15, ...weight('800') },
  walletStripLink: { minWidth: 58, minHeight: 30, alignItems: 'center', justifyContent: 'center' },
  walletStripRail: { gap: 8, paddingBottom: 2 },
  walletStripGrid: { gap: 8 },
  walletStripCard: { minHeight: 98, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'space-between', gap: 3, ...SHADOW.card },
  walletStripSoloCard: { minHeight: 78 },
  walletStripGridCard: { flex: 1, flexBasis: 0, minWidth: 0 },
  walletStripTop: { alignItems: 'center', gap: 7 },
  walletStripIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletStripName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, ...weight('900') },
  walletStripBalance: { fontSize: 14, lineHeight: 20, ...weight('900'), writingDirection: 'ltr' },
  walletStripCurrency: { fontSize: 10, lineHeight: 14, ...weight('700') },
  walletSheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  walletSheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, padding: 16, paddingBottom: 24, maxHeight: '76%' },
  walletSheetHead: { alignItems: 'center', gap: 12, marginBottom: 14 },
  walletSheetClose: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  walletSheetTitle: { flex: 1, fontSize: 21, lineHeight: 28, ...weight('900') },
  walletSheetIntro: { minHeight: 58, borderWidth: 1, borderRadius: RADIUS.lg, alignItems: 'center', gap: 9, paddingHorizontal: 11, marginBottom: 10 },
  walletSheetIntroText: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, ...weight('900') },
  walletCountPill: { minWidth: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  walletSheetList: { gap: 9, paddingBottom: 10 },
  walletSheetCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 13, gap: 7, ...SHADOW.card },
  walletSheetCardTop: { alignItems: 'center', gap: 8 },
  walletDefaultPill: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  walletSheetTotal: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 3 },
  walletSheetAmountRow: { alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  walletSheetAvailableLabel: { fontSize: 10, lineHeight: 15, ...weight('800') },
  walletSheetAmount: { flex: 1, minWidth: 0, fontSize: 20, lineHeight: 27, ...weight('900'), writingDirection: 'ltr' },
  walletReservedPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 4 },
  walletManage: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 3, paddingHorizontal: 12 },
  walletManageText: { flex: 1, fontSize: 12, lineHeight: 17, ...weight('900') },
  walletStripDots: { alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 8 },
  walletStripDot: { width: 6, height: 6, borderRadius: 3 },
  monthMetricsBlock:{ marginBottom: 10 },
  monthMetricsHead:{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2, gap: 8 },
  monthBadge:{ minHeight: 26, borderRadius: 13, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  monthSummarySurface: { borderWidth: 1, borderRadius: RADIUS.lg, overflow: 'hidden' },
  monthMetricGrid: { flexWrap: 'wrap' },
  monthMetric: { width: '50%', minHeight: 61, paddingHorizontal: 10, paddingVertical: 7, justifyContent: 'center' },
  monthMetricLabelRow: { alignItems: 'center', gap: 6, marginBottom: 4 },
  monthMetricLabel: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 16, ...weight('800') },
  monthMetricValue: { fontSize: 14, lineHeight: 20, ...weight('900') },
  monthFlowBar: { height: 5, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', marginHorizontal: 9, marginTop: 3, marginBottom: 4 },
  walletPanel:  { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', marginBottom: 12, ...SHADOW.card },
  walletPanelHead:{ minHeight: 54, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderBottomWidth: 1 },
  walletPanelTitle:{ alignItems: 'center', gap: 9 },
  walletPanelIcon:{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  walletCountBadge:{ minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  walletRow:    { minHeight: 84, alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 12, borderBottomWidth: 1 },
  walletRowIcon:{ width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  walletMain:   { flex: 1, minWidth: 0 },
  walletNameRow:{ alignItems: 'center', gap: 7, minWidth: 0 },
  walletName:   { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, ...weight('900') },
  defaultWalletBadge:{ minHeight: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7, flexShrink: 0 },
  walletMetaRow:{ alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  walletMetaChip:{ minHeight: 24, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4, justifyContent: 'center', maxWidth: '100%' },
  walletMetaText:{ fontSize: 10, lineHeight: 14, ...weight('800') },
  walletAvailableBlock:{ width: 112, maxWidth: '34%', flexShrink: 0 },
  walletAvailableLabel:{ fontSize: 10, lineHeight: 14, ...weight('800'), marginBottom: 3 },
  walletAvailableValue:{ fontSize: 15, lineHeight: 20, ...weight('900') },
  stripLabel:   { fontSize: 12, ...weight('700') },
  stripValue:   { fontSize: 15, ...weight('900'), marginTop: 4 },
  stripDivider: { width: 1 },
  progressBg:   { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 10 },
  progressFg:   { height: 6, borderRadius: 6 },
  attentionPanel:{ borderRadius: RADIUS.lg, borderWidth: 1, padding: 8, marginTop: 2, marginBottom: 6 },
  attentionHeader:{ alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  attentionHeaderTitle:{ flex: 1, alignItems: 'center', gap: 8 },
  attentionHeaderIcon:{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  attentionCount:{ minWidth: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  clearPanel:   { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 9 },
  savingPanel:  { borderRadius: 16, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 8, marginTop: 2, marginBottom: 6 },
  savingHeader: { minHeight: 30, alignItems: 'center', gap: 8, marginBottom: 5 },
  savingHeaderIcon:{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  savingTitle:  { flex: 1, fontSize: 13, lineHeight: 18, ...weight('900') },
  savingCount:  { minWidth: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  savingSummary:{ alignItems: 'center', gap: 10, paddingHorizontal: 2, marginBottom: 7 },
  savingSummaryLabel:{ fontSize: 10, lineHeight: 14, ...weight('800') },
  savingSummaryValue:{ fontSize: 14, lineHeight: 20, ...weight('900'), marginTop: 1 },
  savingPercent:{ fontSize: 16, lineHeight: 21, ...weight('900'), flexShrink: 0 },
  savingGoalList:{ marginTop: 7 },
  savingGoalRow:{ minHeight: 34, alignItems: 'center', gap: 7, paddingHorizontal: 2, paddingVertical: 6 },
  savingGoalDot:{ width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  savingGoalName:{ flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, ...weight('800') },
  savingGoalProgress:{ fontSize: 11, lineHeight: 16, ...weight('900') },
  savingEmpty:{ minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  sectionTitle: { fontSize: 12, ...weight('900'), marginBottom: 8, marginTop: 4 },
  row:          { minHeight: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 6, gap: 8 },
  recentPanel:  { borderRadius: RADIUS.lg, borderWidth: 1, padding: 8, marginTop: 2, marginBottom: 6 },
  recentHead:   { minHeight: 30, alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recentHeadTitle:{ flex: 1, alignItems: 'center', gap: 8, minWidth: 0 },
  recentHeadIcon:{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recentTitle:  { flex: 1, fontSize: 14, lineHeight: 20, ...weight('900') },
  recentCount:  { minWidth: 25, height: 25, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  recentAllLink:{ minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, marginTop: 8, marginBottom: 2, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  recentList:   { borderRadius: RADIUS.lg, borderWidth: 1, overflow: 'hidden' },
  recentRow:    { borderWidth: 0, borderRadius: 0, marginBottom: 0, paddingVertical: 9 },
  rowShell:     { width: '100%', alignItems: 'center', gap: 8 },
  rowMain:      { flex: 1, alignItems: 'center' },
  detailsToggle:{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  inlineDetails:{ width: '100%', borderTopWidth: 1, paddingTop: 8, marginTop: 1 },
  inlineDetailGrid:{ flexWrap: 'wrap', gap: 7 },
  inlineDetailItem:{ width: '48.5%', minHeight: 50, borderRadius: RADIUS.sm, paddingHorizontal: 9, paddingVertical: 7, justifyContent: 'center' },
  inlineDetailLabel:{ fontSize: 10, lineHeight: 14, ...weight('800'), marginBottom: 2 },
  inlineDetailValue:{ fontSize: 12, lineHeight: 17, ...weight('900') },
  inlineDetailNote:{ fontSize: 11, lineHeight: 17, ...weight('800'), marginTop: 7 },
  titleRow:     { alignItems: 'center', gap: 8, marginBottom: 2 },
  typePill:     { minHeight: 20, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  smartBadge:   { minHeight: 22, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  transactionTagLine: { alignSelf: 'flex-start', minHeight: 20, alignItems: 'center', gap: 4, borderRadius: RADIUS.sm, marginBottom: 2 },
  catDot:       { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  empty:        { alignItems: 'center', padding: 24, borderWidth: 1, borderRadius: RADIUS.xl, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.02)' },
  emptyActions: { width: '100%', gap: 8, marginTop: 14 },
  emptyAction:  { flex: 1, minHeight: 40, borderRadius: 13, paddingHorizontal: 10, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
});

// STAGE3_IMPORTANT_VISUAL_FINAL
const importantS = StyleSheet.create({
  panel: { borderRadius: 16, padding: 8, marginTop: 4, marginBottom: 8 },
  header: { minHeight: 32, marginBottom: 6 },
  headerIcon: { width: 28, height: 28, borderRadius: 9 },
  items: { gap: 6 },
  card: { borderRadius: 14, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 7 },
  recurringCard: { minHeight: 54, borderRadius: 13, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 9, paddingVertical: 7 },
  top: { alignItems: 'center', gap: 7 },
  icon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  amountBlock: { width: 90, minWidth: 82, maxWidth: '31%', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statePill: { minHeight: 18, borderRadius: 9, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  actions: { width: '100%', gap: 6, marginTop: 6 },
  action: { flex: 1, flexBasis: 0, minWidth: 0, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  deferred: { minHeight: 28, borderRadius: 9, alignItems: 'center', gap: 5, paddingHorizontal: 8, marginTop: 6 },
  clearPanel: { minHeight: 42, marginBottom: 0 },
});
