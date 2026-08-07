import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { buildFinancialSnapshot, getUpcomingRecurring, pct } from '../utils/calc';
import AddTransModal from '../components/AddTransModal';
import { filterByActiveScope, filterFeatureEntities, getModules, getTransactionDisplayAmount, transactionFeatureEnabled } from '../lib/modules';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletLabel, normalizeWallets } from '../lib/wallets';
import { getUpcomingCommitments } from '../lib/commitments';
import { MetricCard, SectionTitle, Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, TYPE, weight } from '../lib/tokens';
import ActionMenu from '../components/ActionMenu';
import { describeSmartSource } from '../lib/smartEntry';
import NotificationCenterModal from '../components/NotificationCenterModal';
import HomeCenterModal from '../components/HomeCenterModal';
import { buildNotificationItems, filterDismissedNotifications, NOTIFICATION_DISMISSED_STORAGE_KEY, notificationReadKey, sanitizeNotificationReadKeys } from '../lib/notificationCenter';
import { isRTL, rowDirFor, textAlignFor } from '../lib/layout';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { getTransactionTagMeta } from '../lib/transactionTags';
import { isCurrentMonthTransaction } from '../lib/transactionAccess';
import TransactionDetailsModal from '../components/TransactionDetailsModal';
const noop = () => {};

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    overview: ar ? 'نظرة عامة' : 'Overview',
    allTransactions: ar ? 'كل المعاملات' : 'All transactions',
    currentMoney: ar ? 'المتبقي بعد الصرف' : 'Left after spending',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    monthEnd: ar ? 'نهاية الشهر' : 'Month end',
    dailyRoom: ar ? 'المتاح يومياً' : 'Daily room',
    afterDebts: ar ? 'بعد استحقاقات دين عليّ' : 'After debts due',
    debtsLeft: ar ? 'دين عليّ متبقٍ' : 'Debt remaining',
    goalsSaved: ar ? 'تقدّم التوفير' : 'Saving progress',
    debtProgress: ar ? 'تقدّم سداد دين عليّ' : 'Debt repayment progress',
    paid: ar ? 'مسدّد' : 'Paid',
    saved: ar ? 'مدّخر' : 'Saved',
    left: ar ? 'متبقي' : 'Left',
    noDebts: ar ? 'لا يوجد دين عليّ نشط' : 'No active debts',
    noGoals: ar ? 'لا توجد أهداف توفير نشطة' : 'No active saving goals',
    remaining: ar ? 'متبقي' : 'Remaining',
    over: ar ? 'متجاوز' : 'Over',
    upcoming: ar ? 'متكرر' : 'Recurring',
    commitments: ar ? 'مستحقات' : 'Due',
    attention: ar ? 'تحتاج انتباه' : 'Needs attention',
    allClear: ar ? 'هادئة' : 'Clear',
    commitmentWord: ar ? 'مستحقات' : 'Due',
    recurringWord: ar ? 'متكرر' : 'Repeat',
    goalsWord: ar ? 'توفير' : 'Savings',
    markPaid: ar ? 'دفع' : 'Pay',
    reviewRecurring: ar ? 'راجعها قبل الإضافة' : 'Review before adding',
    dueToday: ar ? 'مستحقة اليوم' : 'Due today',
    overdue: ar ? 'متأخرة' : 'Overdue',
    dueIn: ar ? 'بعد' : 'In',
    days: ar ? 'يوم' : 'days',
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
    neutral: ar ? 'أضف بيانات أكثر حتى تظهر قراءة دقيقة.' : 'Add more data for a useful reading.',
    walletSummary: ar ? 'موزعة على' : 'Across',
    walletsWord: ar ? 'محافظ' : 'wallets',
    walletsTitle: ar ? 'المحافظ' : 'Wallets',
    defaultWallet: ar ? 'افتراضية' : 'Default',
    hideDetails: ar ? 'إخفاء' : 'Hide',
    showDetails: ar ? 'إظهار' : 'Show',
    netMonth: ar ? 'صافي الشهر' : 'Month net',
    dueSoon: ar ? 'مستحقات' : 'Due',
    monthSummary: ar ? '\u0645\u0644\u062e\u0635 \u0627\u0644\u0634\u0647\u0631' : 'Month summary',
    netWord: ar ? '\u0627\u0644\u0635\u0627\u0641\u064a' : 'Net',
    showBalance: ar ? 'إظهار' : 'Show',
    hideBalance: ar ? 'إخفاء' : 'Hide',
    hiddenAmount: '****',
    noActiveGoals: ar ? 'لا توجد أهداف نشطة' : 'No active goals',
    quickActions: ar ? 'إجراءات مباشرة' : 'Direct actions',
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
  onNotificationAction = noop,
}) {
  const { trans, debts, goals, wallets, commitments, cats, cfg, notif, setCfg, deleteTrans, deleteTransMany, payCommitment } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const C   = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const isAr = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const modules = getModules(cfg);
  const scopedTransAll = filterByActiveScope(trans, cfg);
  const scopedTrans = scopedTransAll.filter(item => transactionFeatureEnabled(item, cfg));
  const scopedWallets = filterByActiveScope(wallets, cfg);
  const featureData = filterFeatureEntities({ debts, goals, commitments, cfg });
  const scopedDebts = featureData.debts;
  const scopedGoals = featureData.goals;
  const scopedCommitments = featureData.commitments;
  const homeCardsCfg = Array.isArray(cfg.homeCards) ? cfg.homeCards : [];
  const homeSectionsCfg = Array.isArray(cfg.homeSections) ? cfg.homeSections : [];
  const recentLimit = 5;

  const [showWalletDetails, setShowWalletDetails] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [details, setDetails] = useState(null);
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
  const recent = useMemo(
    () => [...scopedTrans].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, recentLimit),
    [trans, cfg.activeScope, cfg.profileType, recentLimit],
  );
  const recentSelection = useMultiSelect(recent.map(item => item.id));
  const defaultWalletId = useMemo(
    () => getDefaultWalletId(scopedWallets.length ? scopedWallets : wallets, cfg.currency, cfg.defaultWalletId),
    [wallets, cfg.currency, cfg.defaultWalletId, cfg.activeScope, cfg.profileType],
  );
  const walletRows = useMemo(
    () => getWalletAvailableBalances(scopedWallets.length ? scopedWallets : wallets, scopedTransAll, cfg.currency, defaultWalletId)
      .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0)),
    [wallets, trans, cfg.currency, defaultWalletId, cfg.activeScope, cfg.profileType],
  );
  const walletMap = useMemo(() => {
    const normalized = normalizeWallets(scopedWallets.length ? scopedWallets : wallets, cfg.currency);
    return new Map(normalized.map(wallet => [wallet.id, wallet]));
  }, [wallets, cfg.currency]);
  const homeSectionsMap = useMemo(
    () => new Map(homeSectionsCfg.map(item => [item.key, item.visible !== false])),
    [homeSectionsCfg],
  );

  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);
  const signed = (n) => `${n >= 0 ? '+' : '-'}${fmt(n)} ${sym}`;
  const healthColor = snapshot.health === 'danger'
    ? th.exp
    : snapshot.health === 'warning' || snapshot.health === 'watch'
      ? th.warn
      : th.inc;
  const canTransfer = walletRows.length > 1;
  const heroBalance = walletRows.reduce((sum, wallet) => sum + Number(wallet.availableBalance || 0), 0);
  const activeGoals = scopedGoals.filter(goal => goal.active !== false && Number(goal.target || 0) > 0);
  const totalSaved = activeGoals.reduce((sum, goal) => sum + Number(goal.cur || 0), 0);
  const goalsTarget = activeGoals.reduce((sum, goal) => sum + Number(goal.target || 0), 0);
  const goalsProgress = pct(totalSaved, goalsTarget, { cap: true });
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const currentMonthName = new Intl.DateTimeFormat(isAr ? 'ar-IQ' : 'en-US', { month: 'long' }).format(new Date());
  const dueCommitments = upcomingCommitments.filter(item => String(item.dueISO || '').startsWith(currentMonthKey));
  const dueCommitmentTotal = dueCommitments
    .reduce((sum, item) => sum + Number(item.amt || 0), 0);
  const attentionItems = useMemo(() => ([
    ...dueCommitments.map(item => ({ ...item, attentionType: 'commitment', sortDays: item.daysUntil })),
    ...upcoming.filter(item => item.daysUntil <= 31).map(item => ({ ...item, attentionType: 'recurring', sortDays: item.daysUntil })),
  ]).sort((a, b) => a.sortDays - b.sortDays), [upcoming, dueCommitments]);
  const attentionTotal = attentionItems.reduce((sum, item) => sum + Math.abs(Number(item.amt || 0)), 0);
  const hidden = cfg.homeBalancesHidden === true;
  const moneyText = (value) => (hidden ? C.hiddenAmount : value);
  const findCat = (catId) => cats.find(c => c.id === catId) || cats.find(c => c.id === 'other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];
  const isHomeSectionVisible = (key) => homeSectionsMap.get(key) !== false;
  const showWalletStrip = isHomeSectionVisible('wallets') && modules.wallets && walletRows.length > 0 && (!isHomeSectionVisible('hero') || showWalletDetails);
  const homeCards = homeCardsCfg.map((item) => {
    if (item.key === 'income') {
      return {
        ...item,
        icon: 'arrow-down-circle-outline',
        label: L.income,
        value: `+${fmt(snapshot.month.inc)} ${sym}`,
        color: th.inc,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'expense') {
      return {
        ...item,
        icon: 'arrow-up-circle-outline',
        label: L.expense,
        value: `-${fmt(snapshot.month.exp)} ${sym}`,
        color: th.exp,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'net') {
      return {
        ...item,
        icon: 'pulse-outline',
        label: C.netWord,
        value: signed(snapshot.month.bal),
        color: snapshot.month.bal >= 0 ? th.inc : th.exp,
        onPress: () => onOpenTab('reports'),
      };
    }
    if (item.key === 'dueSoon') {
      return {
        ...item,
        icon: 'calendar-outline',
        label: C.commitmentWord,
        value: `${fmt(dueCommitmentTotal)} ${sym}`,
        color: dueCommitmentTotal > 0 ? th.warn : th.inc,
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

  useEffect(() => {
    AsyncStorage.getItem('MYFI_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (!raw) return;
        const safe = sanitizeNotificationReadKeys(JSON.parse(raw));
        setReadNotificationKeys(safe);
        AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(safe)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATION_DISMISSED_STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        setDismissedNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw)));
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
    const next = Array.from(new Set([...dismissedNotificationKeys, ...keys])).slice(-200);
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

  const renderRow = (t) => {
    const cat = findCat(t.cat);
    const amount = getTransactionDisplayAmount(t);
    const wallet = findWallet(t.walletId);
    const isTransfer = t.kind === 'transfer';
    const fromWallet = findWallet(t.fromWalletId);
    const toWallet = findWallet(t.toWalletId);
    const linked = t.isDebtPayment || t.isGoalSaving || t.isCommitmentPayment;
    const title = isTransfer ? (cfg.lang === 'ar' ? 'تحويل بين المحافظ' : 'Wallet transfer') : t.title;
    const smartBadge = !isTransfer ? describeSmartSource(t.smartSource, cfg.lang) : null;
    const transactionTag = getTransactionTagMeta(t);
    const smartTone = t.smartSource?.mode === 'voice' ? th.warn : t.smartSource?.mode === 'receipt' ? th.primary : th.inc;
    const editable = !linked && isCurrentMonthTransaction(t);
    return (
      <Pressable
        key={t.id}
        onLongPress={() => recentSelection.toggle(t.id)}
        onPress={() => {
          if (recentSelection.selecting) recentSelection.toggle(t.id);
        }}
        style={[
          s.row,
          {
            backgroundColor: recentSelection.selected.has(t.id) ? th.primSoft : th.card,
            borderColor: recentSelection.selected.has(t.id) ? th.primary : th.border,
            flexDirection: rowDir,
          },
        ]}
      >
        <View style={[s.rowMain, { flexDirection: rowDir }]}>
        <View style={[s.catDot, { backgroundColor: `${isTransfer ? th.primary : (cat.color || th.primary)}22`, borderColor: isTransfer ? th.primary : (cat.color || th.primary) }]}>
          <Ionicons name={isTransfer ? 'swap-horizontal-outline' : (cat.icon || 'cube-outline')} size={18} color={isTransfer ? th.primary : (cat.color || th.primary)} />
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
        <Text style={{ color: isTransfer ? th.primary : amount > 0 ? th.inc : th.exp, ...weight('900'), fontSize: 15 }}>
          {isTransfer ? fmt(t.transferAmount) : `${amount > 0 ? '+' : '-'}${fmt(amount)}`} {sym}
        </Text>
        </View>
        {recentSelection.selecting ? (
          <SelectionCheckbox th={th} selected={recentSelection.selected.has(t.id)} onPress={() => recentSelection.toggle(t.id)} />
        ) : (
          <ActionMenu
            th={th}
            lang={cfg.lang}
            title={title}
            buttonStyle={{ backgroundColor: th.cardHigh, width: 32, height: 32, borderRadius: 10 }}
            items={[
              { label: C.select, icon: 'checkmark-circle-outline', color: th.primary, onPress: () => recentSelection.toggle(t.id) },
              { label: cfg.lang === 'ar' ? '\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644' : 'Details', icon: 'reader-outline', color: th.primary, onPress: () => setDetails(t) },
              editable ? { label: L.editTrans, icon: 'create-outline', color: th.primary, onPress: () => setEditing(t) } : null,
              { label: L.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteRow(t) },
            ]}
          />
        )}
      </Pressable>
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
          {amount > 0 ? '+' : '-'}{fmt(amount)} {sym}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderCommitmentRow = (item) => {
    const cat = findCat(item.cat);
    const wallet = findWallet(item.walletId);
    const dueText = item.daysUntil < 0
      ? `${C.overdue} ${Math.abs(item.daysUntil)} ${C.days}`
      : item.daysUntil === 0
        ? C.dueToday
        : `${C.dueIn} ${item.daysUntil} ${C.days}`;
    return (
      <View
        key={item.id}
        style={[s.row, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
      >
        <View style={[s.catDot, { backgroundColor: `${cat.color || th.primary}22`, borderColor: cat.color || th.primary }]}>
          <Ionicons name="calendar-outline" size={18} color={cat.color || th.primary} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={{ color: th.text, ...weight('800'), fontSize: 14, textAlign: align }} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align }} numberOfLines={2}>
            {dueText} · {item.dueISO}{modules.wallets ? ` · ${getWalletLabel(wallet, cfg.lang)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: cfg.lang === 'ar' ? 'flex-start' : 'flex-end', gap: 6 }}>
          <Text style={{ color: th.exp, ...weight('900'), fontSize: 14 }} numberOfLines={1}>
            -{fmt(item.amt)} {sym}
          </Text>
          <TouchableOpacity onPress={async () => {
            const result = await payCommitment(item.id, item.dueISO);
            if (!result?.ok) {
              if (result?.reason === 'linked_unavailable') {
                Alert.alert('', cfg.lang === 'ar'
                  ? 'الدين أو الهدف المرتبط بهذا الالتزام مكتمل بالفعل أو رصيد المحفظة غير كافٍ.'
                  : 'The linked debt or goal is already complete, or the wallet balance is insufficient.');
              }
              return;
            }
            if (result.partial) {
              Alert.alert('', cfg.lang === 'ar'
                ? `تم سداد ${Math.round(result.appliedAmount).toLocaleString()} فقط من ${Math.round(result.requestedAmount).toLocaleString()}.`
                : `Only ${Math.round(result.appliedAmount).toLocaleString()} of ${Math.round(result.requestedAmount).toLocaleString()} was applied.`);
            }
          }} style={[s.miniAction, { backgroundColor: th.primSoft }]}>
            <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{C.markPaid}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderMoneyTile = ({ icon, label, value, color, bg, onPress }, width = '49%') => (
    <TouchableOpacity
      style={[s.tile, { width }]}
      onPress={onPress}
    >
      <MetricCard
        th={th}
        lang={cfg.lang}
        icon={icon}
        label={label}
        value={moneyText(value)}
        tone={color}
        style={{ width: '100%', backgroundColor: bg || th.card, borderColor: th.border }}
        valueStyle={s.tileValue}
        compact
      />
    </TouchableOpacity>
  );

  const visibleHomeCards = homeCards.filter(item => item.visible !== false);
  const moneyTileWidth = (index) => (
    visibleHomeCards.length === 1 || (visibleHomeCards.length === 3 && index === 2)
      ? '100%'
      : '49%'
  );
  const topGoalRows = [...activeGoals]
    .sort((a, b) => (Number(b.cur || 0) / Math.max(1, Number(b.target || 0))) - (Number(a.cur || 0) / Math.max(1, Number(a.target || 0))))
    .slice(0, 3);
  const orderedHomeSections = homeSectionsCfg
    .filter(item => item.visible !== false && item.key !== 'hero')
    .filter(item => item.key !== 'wallets' || modules.wallets)
    .filter(item => item.key !== 'attention' || modules.recurring || modules.commitments)
    .filter(item => item.key !== 'goals' || modules.goals);

  const dueTextFor = (item) => (
    item.daysUntil < 0
      ? `${C.overdue} ${Math.abs(item.daysUntil)} ${C.days}`
      : item.daysUntil === 0
        ? C.dueToday
        : `${C.dueIn} ${item.daysUntil} ${C.days}`
  );

  const renderAttentionRow = (item) => {
    const isCommitment = item.attentionType === 'commitment';
    const wallet = isCommitment ? findWallet(item.walletId) : null;
    const amount = Number(item.amt || 0);
    const displayAmount = isCommitment ? -Math.abs(amount) : amount;
    const dueText = dueTextFor(item);
    const tone = item.daysUntil < 0 ? th.exp : isCommitment ? th.warn : th.primary;
    const typeLabel = isCommitment ? C.commitmentWord : C.recurringWord;
    const Container = isCommitment ? View : TouchableOpacity;
    const containerProps = isCommitment ? {} : { onPress: () => openRecurringDraft(item) };
    return (
      <Container
        key={`${item.attentionType}-${item.id || item.recurringGroupId}`}
        {...containerProps}
        style={[s.row, { backgroundColor: th.card, borderColor: `${tone}55`, flexDirection: rowDir }]}
      >
        <View style={[s.catDot, { backgroundColor: `${tone}18`, borderColor: tone }]}>
          <Ionicons name={isCommitment ? 'calendar-outline' : 'repeat-outline'} size={18} color={tone} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <View style={[s.titleRow, { flexDirection: rowDir }]}>
            <Text style={{ color: th.text, ...weight('800'), fontSize: 14, textAlign: align, flex: 1 }} numberOfLines={1}>
              {isCommitment ? item.name : item.title}
            </Text>
            <View style={[s.typePill, { backgroundColor: `${tone}16` }]}>
              <Text style={{ color: tone, fontSize: 10, ...weight('900') }}>{typeLabel}</Text>
            </View>
          </View>
          <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align }} numberOfLines={2}>
            {dueText} - {item.dueISO}{isCommitment && modules.wallets ? ` - ${getWalletLabel(wallet, cfg.lang)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: cfg.lang === 'ar' ? 'flex-start' : 'flex-end', gap: 6 }}>
          <Text style={{ color: displayAmount >= 0 ? th.inc : th.exp, ...weight('900'), fontSize: 14 }} numberOfLines={1}>
            {moneyText(`${displayAmount >= 0 ? '+' : '-'}${fmt(Math.abs(displayAmount))} ${sym}`)}
          </Text>
          {isCommitment ? (
            <TouchableOpacity onPress={async () => {
              const result = await payCommitment(item.id, item.dueISO);
              if (!result?.ok) {
                if (result?.reason === 'linked_unavailable') {
                  Alert.alert('', cfg.lang === 'ar'
                    ? 'الدين أو الهدف المرتبط بهذا الالتزام مكتمل بالفعل أو رصيد المحفظة غير كافٍ.'
                    : 'The linked debt or goal is already complete, or the wallet balance is insufficient.');
                }
                return;
              }
              if (result.partial) {
                Alert.alert('', cfg.lang === 'ar'
                  ? `تم سداد ${Math.round(result.appliedAmount).toLocaleString()} فقط من ${Math.round(result.requestedAmount).toLocaleString()}.`
                  : `Only ${Math.round(result.appliedAmount).toLocaleString()} of ${Math.round(result.requestedAmount).toLocaleString()} was applied.`);
              }
            }} style={[s.miniAction, { backgroundColor: th.primSoft }]}>
              <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{C.markPaid}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Container>
    );
  };

  const renderAttentionSection = () => (
    <View style={{ marginTop: 4 }}>
      <SectionTitle th={th} lang={cfg.lang}>{C.attention}</SectionTitle>
      {attentionItems.length === 0 ? (
        <View style={[s.clearPanel, { borderColor: th.border, backgroundColor: th.card }]}>
          <Ionicons name="checkmark-circle-outline" size={20} color={th.inc} />
          <Text style={{ color: th.inc, fontSize: 13, ...weight('900') }}>{C.allClear}</Text>
        </View>
      ) : (
        <>
          <View style={[s.attentionSummary, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
            <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), textAlign: align, flex: 1 }}>
              {attentionItems.length} {C.attention}
            </Text>
            <Text style={{ color: th.warn, fontSize: 13, ...weight('900') }}>
              {moneyText(`${fmt(attentionTotal)} ${sym}`)}
            </Text>
          </View>
          {attentionItems.slice(0, 4).map(renderAttentionRow)}
        </>
      )}
    </View>
  );

  const renderGoalsSection = () => {
    if (!activeGoals.length) return (
      <View style={{ marginTop: 4 }}>
        <SectionTitle th={th} lang={cfg.lang}>{C.goalsWord}</SectionTitle>
        <View style={[s.clearPanel, { borderColor: th.border, backgroundColor: th.card }]}>
          <Ionicons name="flag-outline" size={20} color={th.sub} />
          <Text style={{ color: th.sub, fontSize: 13, ...weight('900') }}>{C.noActiveGoals}</Text>
        </View>
      </View>
    );
    return (
      <View style={{ marginTop: 4 }}>
        <SectionTitle th={th} lang={cfg.lang}>{C.goalsWord}</SectionTitle>
        <View style={[s.goalPanel, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.goalHead, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), textAlign: align }}>{C.saved}</Text>
              <Text style={{ color: th.text, fontSize: 16, ...weight('900'), marginTop: 3, textAlign: align }}>
                {moneyText(`${fmt(totalSaved)} / ${fmt(goalsTarget)} ${sym}`)}
              </Text>
            </View>
            <Text style={{ color: th.inc, fontSize: 17, ...weight('900') }}>{hidden ? C.hiddenAmount : `${goalsProgress}%`}</Text>
          </View>
          {renderProgress(goalsProgress, th.inc)}
          {topGoalRows.map((goal, index) => {
            const progress = pct(goal.cur, goal.target, { cap: true });
            return (
              <View
                key={goal.id}
                style={[s.goalRow, { borderTopColor: th.border, flexDirection: rowDir, marginTop: index === 0 ? 10 : 0 }]}
              >
                <Ionicons name="flag-outline" size={16} color={th.inc} />
                <Text style={{ color: th.text, fontSize: 13, ...weight('800'), flex: 1, textAlign: align }} numberOfLines={1}>
                  {goal.name}
                </Text>
                <Text style={{ color: th.sub, fontSize: 12, ...weight('900') }}>
                  {hidden ? C.hiddenAmount : `${progress}%`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderWalletPanel = () => (
    showWalletStrip ? (
      <View style={[s.walletPanel, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.walletPanelHead, { flexDirection: rowDir, borderBottomColor: th.border }]}>
          <View style={[s.walletPanelTitle, { flexDirection: rowDir }]}>
            <View style={[s.walletPanelIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="wallet-outline" size={17} color={th.primary} />
            </View>
            <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: align }}>{C.walletsTitle}</Text>
          </View>
          <View style={[s.walletCountBadge, { backgroundColor: th.cardHigh }]}>
            <Text style={{ color: th.sub, fontSize: 11, ...weight('900') }}>{walletRows.length}</Text>
          </View>
        </View>
        {walletRows.map((wallet, index) => {
          const balance = Number(wallet.balance || 0);
          const available = Number(wallet.availableBalance ?? balance);
          const reserved = Number(wallet.reservedBalance || 0);
          const isDefault = wallet.id === defaultWalletId;
          return (
            <TouchableOpacity
              key={wallet.id}
              activeOpacity={0.7}
              disabled={isDefault}
              onPress={() => setCfg({ defaultWalletId: wallet.id })}
              style={[
                s.walletRow,
                {
                  backgroundColor: isDefault ? `${th.primary}0D` : 'transparent',
                  borderBottomColor: index === walletRows.length - 1 ? 'transparent' : th.border,
                  flexDirection: rowDir,
                },
              ]}
            >
              <View style={[s.walletRowIcon, { backgroundColor: isDefault ? th.primSoft : th.cardHigh }]}>
                <Ionicons name={isDefault ? 'star' : 'wallet-outline'} size={17} color={isDefault ? th.primary : th.sub} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={[s.walletNameRow, { flexDirection: rowDir }]}>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: align, flexShrink: 1 }} numberOfLines={1}>
                    {getWalletLabel(wallet, cfg.lang)}
                  </Text>
                  {isDefault ? (
                    <View style={[s.defaultWalletBadge, { backgroundColor: th.primSoft }]}>
                      <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{C.defaultWallet}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={{ color: th.sub, fontSize: 12, marginTop: 3, textAlign: align }}>{wallet.currency || cfg.currency}</Text>
              </View>
              <View style={[s.walletBalanceBlock, { alignItems: isAr ? 'flex-start' : 'flex-end' }]}>
                <Text style={{ color: available >= 0 ? th.text : th.exp, fontSize: 15, ...weight('900') }} numberOfLines={1}>
                  {moneyText(`${available < 0 ? '-' : ''}${fmt(Math.abs(available))}`)}
                </Text>
                <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), marginTop: 2 }}>
                  {reserved > 0
                    ? `${isAr ? 'متاح من' : 'available of'} ${moneyText(`${fmt(balance)} ${wallet.currency || sym}`)}`
                    : (wallet.currency || sym)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    ) : null
  );

  const renderRecentSection = () => (
    <View>
      <SectionTitle th={th} lang={cfg.lang}>{L.recent}</SectionTitle>
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
        </View>
      ) : recent.map(renderRow)}
    </View>
  );

  const renderHomeSection = (item) => {
    if (item.key === 'attention') return <React.Fragment key={item.key}>{renderAttentionSection()}</React.Fragment>;
    if (item.key === 'goals') return <React.Fragment key={item.key}>{renderGoalsSection()}</React.Fragment>;
    if (item.key === 'recentTransactions') return <React.Fragment key={item.key}>{renderRecentSection()}</React.Fragment>;
    return null;
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 128 }}>
        <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <TouchableOpacity
            onPress={openNotificationCenter}
            style={[s.notifyBtn, { backgroundColor: th.card, borderColor: th.border }]}
          >
            <Ionicons name="notifications-outline" size={18} color={th.primary} />
            {unreadNotificationCount > 0 ? (
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
                  {Math.min(unreadNotificationCount, 9)}
                </Text>
              </View>
            ) : null}
          </TouchableOpacity>
          <View style={s.brandLockup}>
            <Ionicons name="layers" size={22} color={th.primary} />
            <Text style={[s.brandTitle, { color: th.primary }]}>MYFI</Text>
          </View>
          <View style={[s.headerActions, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={() => setCenterMode('profile')} style={[s.profileBtn, { backgroundColor: th.primSoft }]}>
              <Ionicons name="person-outline" size={19} color={th.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {isHomeSectionVisible('hero') ? (
        <View style={[s.hero, { backgroundColor: th.primaryContainer, borderColor: `${th.primary}55` }]}>
          <View style={[s.heroTop, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroLabel, { color: th.sub, textAlign: align }]}>{isAr ? 'الرصيد المتاح' : 'Available balance'}</Text>
              <Text style={[s.heroAmount, { color: th.onPrimaryContainer, textAlign: align }]} numberOfLines={1} adjustsFontSizeToFit>
                {moneyText(signed(heroBalance))}
              </Text>
            </View>
            <View style={[s.heroTools, { flexDirection: rowDir }]}>
              <TouchableOpacity
                onPress={() => setCfg({ homeBalancesHidden: !hidden })}
                style={[s.heroIconBtn, { backgroundColor: 'rgba(255,255,255,0.10)' }]}
              >
                <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={15} color={th.onPrimaryContainer} />
              </TouchableOpacity>
              <View style={[s.healthPill, { backgroundColor: `${healthColor}22` }]}>
                <Ionicons name="pulse-outline" size={14} color={healthColor} />
                <Text style={{ color: healthColor, fontSize: 12, ...weight('800') }}>
                  {snapshot.health === 'danger' ? '!' : snapshot.health === 'safe' ? 'OK' : '...'}
                </Text>
              </View>
            </View>
          </View>
          <Text style={[s.healthText, { color: healthColor, textAlign: align }]}>
            {C[snapshot.health] || C.neutral}
          </Text>
          {modules.goals ? <View style={[s.heroFacts, { flexDirection: rowDir, borderTopColor: th.border }]}>
            {modules.goals ? <View style={s.heroFact}>
              <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{C.goalsWord}</Text>
              <Text style={{ color: th.text, fontSize: 15, ...weight('900'), marginTop: 3 }}>{moneyText(`${fmt(totalSaved)} ${sym}`)}</Text>
            </View> : null}
          </View> : null}
          {modules.wallets && walletRows.length > 0 ? (
            <TouchableOpacity
              onPress={() => setShowWalletDetails(prev => !prev)}
              style={[s.walletSummary, { backgroundColor: 'rgba(255,255,255,0.10)', borderColor: 'rgba(255,255,255,0.12)', flexDirection: rowDir }]}
            >
              <Ionicons name="wallet-outline" size={14} color={th.onPrimaryContainer} />
              <Text style={{ color: th.onPrimaryContainer, fontSize: 12, ...weight('900'), flex: 1, textAlign: align }}>
                {walletRows.length} {C.walletsWord}
              </Text>
              <Text style={{ color: th.onPrimaryContainer, fontSize: 12, ...weight('900') }}>
                {showWalletDetails ? C.hideDetails : C.showDetails}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
        ) : null}

        {renderWalletPanel()}

        {cfg.entryMode !== 'classic' ? (
          <View style={[s.quickEntry, { backgroundColor: th.card, borderColor: th.border }]}>
            <Text style={[s.quickEntryTitle, { color: th.sub, textAlign: align }]}>{C.quickActions}</Text>
            <View style={[s.quickEntryRow, { flexDirection: rowDir }]}>
              {[
                { key: 'expense', label: isAr ? 'مصروف' : 'Expense', icon: 'arrow-up-outline', color: th.exp, onPress: onAddExpense },
                { key: 'income', label: isAr ? 'دخل' : 'Income', icon: 'arrow-down-outline', color: th.inc, onPress: onAddIncome },
                modules.wallets && canTransfer
                  ? { key: 'transfer', label: isAr ? 'تحويل' : 'Transfer', icon: 'swap-horizontal-outline', color: th.primary, onPress: onTransfer }
                  : null,
                { key: 'smart', label: C.smartEntry, icon: 'sparkles-outline', color: th.warn, onPress: onSmartEntry },
              ].filter(Boolean).map(action => (
                <TouchableOpacity key={action.key} onPress={action.onPress} style={s.quickEntryAction}>
                  <View style={[s.quickEntryIcon, { backgroundColor: `${action.color}18`, borderColor: `${action.color}44` }]}>
                    <Ionicons name={action.icon} size={18} color={action.color} />
                  </View>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={[s.quickEntryLabel, { color: th.text }]}>
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {visibleHomeCards.length > 0 ? (
        <View style={s.monthMetricsBlock}>
          <View style={[s.monthMetricsHead, { flexDirection: rowDir }]}>
            <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), textAlign: align, flex: 1 }}>
              {C.monthSummary}
            </Text>
            <Text style={{ color: th.text, fontSize: 13, ...weight('900') }}>
              {currentMonthName}
            </Text>
          </View>
          <View style={s.tileGrid}>
            {visibleHomeCards.map((item, index) => (
              <React.Fragment key={item.key}>
                {renderMoneyTile(item, moneyTileWidth(index))}
              </React.Fragment>
            ))}
          </View>
        </View>
        ) : null}
        {orderedHomeSections.map(renderHomeSection)}
      </ScrollView>

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <TransactionDetailsModal visible={!!details} transaction={details} cats={cats} wallets={wallets} cfg={cfg} onClose={() => setDetails(null)} />
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
        th={th}
        lang={cfg.lang}
      />
      <HomeCenterModal
        visible={!!centerMode}
        mode={centerMode || 'profile'}
        onClose={() => setCenterMode(null)}
        onMode={setCenterMode}
        onOpenTab={onOpenTab}
        onEditTransaction={setEditing}
        onOpenTransactionDetails={setDetails}
      />
    </View>
  );
}

const s = StyleSheet.create({
  topBar:       { alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  topBarSpacer: { width: 42 },
  notifyBtn:    { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', ...SHADOW.card },
  notifyBadge:  { minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, position: 'absolute', top: -4, right: -4 },
  brandLockup:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerActions: { alignItems: 'center', gap: 5 },
  headerIconBtn: { width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileBtn:   { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  brandTitle:   { fontSize: 23, lineHeight: 28, ...weight('900'), letterSpacing: 0 },
  hero:         { borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 9, ...SHADOW.card },
  heroTop:      { alignItems: 'flex-start', gap: 8 },
  heroLabel:    { fontSize: TYPE.meta, lineHeight: 17, ...weight('900') },
  heroAmount:   { fontSize: 27, lineHeight: 32, ...weight('900'), marginTop: 2 },
  heroTools:    { alignItems: 'center', gap: 6 },
  heroIconBtn:  { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  healthPill:   { minWidth: 54, height: 28, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  healthText:   { fontSize: 12, marginTop: 5, lineHeight: 18, ...weight('700'), opacity: 0.94 },
  heroFacts:    { borderTopWidth: 1, marginTop: 7, paddingTop: 7, alignItems: 'center' },
  heroFact:     { flex: 1, alignItems: 'center' },
  factDivider:  { width: 1, height: 30 },
  quickEntry:   { borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 10, marginBottom: 10 },
  quickEntryTitle:{ fontSize: 12, lineHeight: 17, ...weight('800'), marginBottom: 7 },
  quickEntryRow: { alignItems: 'flex-start', justifyContent: 'space-between' },
  quickEntryAction:{ width: '24%', minHeight: 68, alignItems: 'center', justifyContent: 'center', gap: 6 },
  quickEntryIcon:{ width: 42, height: 42, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  quickEntryLabel:{ fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: 'center', maxWidth: '100%' },
  walletSummary:{ alignItems: 'center', gap: 8, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, marginTop: 10 },
  monthMetricsBlock:{ marginBottom: 8 },
  monthMetricsHead:{ alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  tileGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  tile:         { width: '48%', marginBottom: 8 },
  tileValue:    { fontSize: 15, lineHeight: 21 },
  walletPanel:  { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', marginBottom: 12, ...SHADOW.card },
  walletPanelHead:{ minHeight: 54, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 13, borderBottomWidth: 1 },
  walletPanelTitle:{ alignItems: 'center', gap: 9 },
  walletPanelIcon:{ width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  walletCountBadge:{ minWidth: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  walletRow:    { minHeight: 68, alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 10, borderBottomWidth: 1 },
  walletRowIcon:{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  walletNameRow:{ alignItems: 'center', gap: 7 },
  defaultWalletBadge:{ minHeight: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  walletBalanceBlock:{ minWidth: 88 },
  stripLabel:   { fontSize: 12, ...weight('700') },
  stripValue:   { fontSize: 15, ...weight('900'), marginTop: 4 },
  stripDivider: { width: 1 },
  progressBg:   { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 10 },
  progressFg:   { height: 6, borderRadius: 6 },
  attentionSummary:{ alignItems: 'center', justifyContent: 'space-between', borderRadius: RADIUS.md, paddingHorizontal: 11, paddingVertical: 9, marginBottom: 7 },
  clearPanel:   { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginBottom: 9 },
  goalPanel:    { borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 10 },
  goalHead:     { alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalRow:      { minHeight: 36, borderTopWidth: 1, alignItems: 'center', gap: 8, paddingTop: 8 },
  sectionTitle: { fontSize: 12, ...weight('900'), marginBottom: 8, marginTop: 4 },
  row:          { minHeight: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 6, gap: 8 },
  rowMain:      { flex: 1, alignItems: 'center' },
  titleRow:     { alignItems: 'center', gap: 8, marginBottom: 2 },
  typePill:     { minHeight: 20, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  smartBadge:   { minHeight: 22, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  transactionTagLine: { alignSelf: 'flex-start', minHeight: 20, alignItems: 'center', gap: 4, borderRadius: RADIUS.sm, marginBottom: 2 },
  catDot:       { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  empty:        { alignItems: 'center', padding: 24, borderWidth: 1, borderRadius: RADIUS.xl, borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.02)' },
  miniAction:   { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
});
