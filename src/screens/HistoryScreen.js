import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, SectionList, TextInput, Modal, Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { getDefaultWalletId, getWalletBalances, getWalletLabel, normalizeWallets } from '../lib/wallets';
import AddTransModal from '../components/AddTransModal';
import { RADIUS, TYPE, weight } from '../lib/tokens';
import DateField from '../components/DateField';
import { rowDirFor, textAlignFor, writingDirectionFor } from '../lib/layout';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { filterByActiveScope, getTransactionDisplayAmount, isExpenseFlow, isIncomeFlow } from '../lib/modules';
import { getTransactionTagMeta } from '../lib/transactionTags';
import { getVisibleHistoryTransactions } from '../lib/history';
import { isCurrentMonthTransaction } from '../lib/transactionAccess';
import { getTransactionsNewestFirst } from '../lib/transactionIndex';
import { activeLedgerSupported, getLedgerNamespace, queryLedgerTransactions } from '../lib/activeLedgerRepository';
import TransactionDetailsModal from '../components/TransactionDetailsModal';

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'السجل' : 'History',
    transactionType: ar ? 'نوع الحركة' : 'Transaction type',
    select: ar ? 'تحديد' : 'Select',
    linkedDeleteTitle: ar ? 'معاملة مرتبطة' : 'Linked transaction',
    linkedDeleteBody: ar ? 'عند حذف هذه المعاملة، ستُحدّث بيانات العنصر المرتبط بها أيضاً.' : 'Deleting this transaction also updates its linked tracker.',
    transfer: ar ? 'تحويل' : 'Transfer',
    walletTransfer: ar ? 'تحويل بين المحافظ' : 'Wallet transfer',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'الصرف' : 'Expense',
    net: ar ? 'الصافي' : 'Net',
    entries: ar ? 'حركة' : 'entries',
    noResults: ar ? 'لا توجد حركات بهذه التصفية' : 'No entries match this filter',
    emptyHistory: ar ? 'لا توجد حركات مسجلة بعد' : 'No transactions recorded yet',
    all: ar ? 'الكل' : 'All',
    period: ar ? 'الفترة' : 'Period',
    allTime: ar ? 'كل الفترات' : 'All time',
    today: ar ? 'اليوم' : 'Today',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    lastMonth: ar ? 'الشهر السابق' : 'Last month',
    thisYear: ar ? 'هذه السنة' : 'This year',
    customPeriod: ar ? 'فترة مخصصة' : 'Custom period',
    wallet: ar ? 'المحفظة' : 'Wallet',
    allWallets: ar ? 'كل المحافظ' : 'All wallets',
    linked: ar ? 'مرتبطة بمتابعة' : 'Linked tracker',
    recurring: ar ? 'متكررة' : 'Recurring',
    active: ar ? 'مفعّل' : 'active',
    debtEnded: ar ? 'انتهى الدين' : 'Debt ended',
    goalCompleted: ar ? 'اكتمل الهدف' : 'Goal completed',
    duplicate: ar ? 'تكرار الحركة' : 'Duplicate transaction',
    fromDate: ar ? 'من تاريخ' : 'From date',
    toDate: ar ? 'إلى تاريخ' : 'To date',
    saving: ar ? 'توفير للهدف' : 'Goal saving',
  };
};

const dayLabel = (dateISO, lang) => {
  if (!dateISO) return '-';
  const ar = lang === 'ar';
  const date = new Date(`${dateISO}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateISO;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((today.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return ar ? 'اليوم' : 'Today';
  if (diff === 1) return ar ? 'أمس' : 'Yesterday';
  return new Intl.DateTimeFormat(ar ? 'ar-IQ' : 'en', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
};

const toMonthKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const toYearKey = (date = new Date()) => String(date.getFullYear());
const todayISO = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const previousMonthKey = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return toMonthKey(date);
};
const txTime = (item = {}) => item.ts || (item.dateISO ? new Date(`${item.dateISO}T12:00:00`).getTime() : 0);

const HistoryControls = ({
  th, rowDir, align, writingDirection, lang, L, search, setSearch,
  selection, filteredCount, activeFilters, openFilters, typeF, setTypeF, typeOptions, hasEntries,
}) => (
  <View style={[s.historyFixedControls, { backgroundColor: th.bg }]}>
    {hasEntries ? (
      <>
    <MultiSelectBar
      th={th}
      lang={lang}
      active={selection.selecting}
      count={selection.selectedCount}
      total={filteredCount}
      allSelected={selection.allSelected}
      onStart={selection.start}
      onToggleAll={selection.toggleAll}
      onDelete={selection.onDelete}
      onCancel={selection.cancel}
    />

    <View style={[s.historyToolbar, { flexDirection: rowDir }]}>
      <View style={[s.searchBox, { backgroundColor: th.card, borderColor: search ? th.primary : th.border, flexDirection: rowDir }]}>
        <Ionicons name="search-outline" size={17} color={th.sub} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={L.searchPlaceholder}
          placeholderTextColor={th.sub}
          style={{ flex: 1, color: th.text, fontSize: 14, paddingVertical: 10, marginHorizontal: 8, textAlign: align, writingDirection }}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={17} color={th.faint} />
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity
        onPress={openFilters}
        style={[s.historyFilterAction, { backgroundColor: activeFilters ? th.primSoft : th.card, borderColor: activeFilters ? th.primary : th.border }]}
      >
        <Ionicons name="options-outline" size={18} color={activeFilters ? th.primary : th.sub} />
        {activeFilters ? (
          <View style={[s.filterCountBadge, { backgroundColor: th.primary }]}>
            <Text style={{ color: th.onPrimary, fontSize: 9, ...weight('900') }}>{activeFilters}</Text>
          </View>
        ) : null}
      </TouchableOpacity>
    </View>

    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.typeRail, { flexDirection: rowDir }]}>
      {typeOptions.map(option => {
        const active = typeF === option.value;
        const tone = option.value === 'inc' ? th.inc : option.value === 'exp' ? th.exp : option.value === 'goal' ? th.primary : option.value === 'debt' ? th.warn : th.primary;
        const soft = option.value === 'inc' ? th.incBg : option.value === 'exp' ? th.expBg : option.value === 'debt' ? th.warnBg : th.primSoft;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => setTypeF(option.value)}
            style={[s.typeChip, { backgroundColor: active ? soft : th.card, borderColor: active ? `${tone}66` : th.border, flexDirection: rowDir }]}
          >
            <Ionicons name={option.icon} size={14} color={active ? tone : th.sub} />
            <Text style={[s.typeChipText, { color: active ? tone : th.text }]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
      </>
    ) : null}
  </View>
);

export default function HistoryScreen({ onAddExpense = () => {}, onAddIncome = () => {} }) {
  const { trans, debts, goals, wallets, cats, cfg, deleteTrans, deleteTransMany, undoLastTransactionDelete, ledgerReady, workspaceNamespace } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const insets = useSafeAreaInsets();
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const writingDirection = writingDirectionFor(cfg.lang);
  const scopedTrans = useMemo(() => getTransactionsNewestFirst(getVisibleHistoryTransactions(trans, cfg)), [trans]);
  const scopedWallets = filterByActiveScope(wallets, cfg);

  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [catF, setCatF] = useState('all');
  const [walletF, setWalletF] = useState('all');
  const [periodF, setPeriodF] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [draftFilters, setDraftFilters] = useState(null);
  const [expandedFilter, setExpandedFilter] = useState(null);
  const [editing, setEditing] = useState(null);
  const [duplicateDraft, setDuplicateDraft] = useState(null);
  const [details, setDetails] = useState(null);
  const [renderLimit, setRenderLimit] = useState(250);
  const [ledgerRows, setLedgerRows] = useState([]);
  const [ledgerCursor, setLedgerCursor] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerQueryOk, setLedgerQueryOk] = useState(false);
  const ledgerRequestRef = React.useRef(0);

  const walletRows = useMemo(() => {
    const viewWallets = scopedWallets.length ? scopedWallets : wallets;
    const defaultWalletId = getDefaultWalletId(viewWallets, cfg.currency, cfg.defaultWalletId);
    return getWalletBalances(viewWallets, scopedTrans, cfg.currency, defaultWalletId)
      .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0));
  }, [wallets, trans, cfg.currency, cfg.defaultWalletId]);

  const walletMap = useMemo(() => {
    const normalized = normalizeWallets(scopedWallets.length ? scopedWallets : wallets, cfg.currency);
    return new Map(normalized.map(wallet => [wallet.id, wallet]));
  }, [wallets, cfg.currency]);

  const categoryMap = useMemo(() => new Map(cats.map(item => [item.id, item])), [cats]);

  const dateBounds = useMemo(() => {
    if (periodF === 'today') {
      const today = todayISO();
      return { from: today, to: today };
    }
    if (periodF === 'month') {
      const month = toMonthKey();
      return { from: `${month}-01`, to: `${month}-31` };
    }
    if (periodF === 'lastMonth') {
      const month = previousMonthKey();
      return { from: `${month}-01`, to: `${month}-31` };
    }
    if (periodF === 'year') {
      const year = toYearKey();
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    if (periodF === 'custom') return { from: dateFrom, to: dateTo };
    return { from: '', to: '' };
  }, [periodF, dateFrom, dateTo]);

  const filteredFallback = useMemo(() => {
    let list = scopedTrans;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => {
        const cat = categoryMap.get(t.cat);
        const amount = getTransactionDisplayAmount(t);
        const tag = getTransactionTagMeta(t);
        const wallet = t.kind === 'transfer'
          ? `${getWalletLabel(walletMap.get(t.fromWalletId), cfg.lang)} ${getWalletLabel(walletMap.get(t.toWalletId), cfg.lang)}`
          : getWalletLabel(walletMap.get(t.walletId), cfg.lang);
        return [
          t.title,
          t.note,
          t.dateISO,
          t.cat,
          cfg.lang === 'ar' ? cat?.label : cat?.labelEn,
          wallet,
          tag.label,
          tag.labelEn,
          Math.round(Math.abs(amount)).toString(),
        ].filter(Boolean).join(' ').toLowerCase().includes(q);
      });
    }
    if (typeF === 'inc') list = list.filter(isIncomeFlow);
    if (typeF === 'exp') list = list.filter(isExpenseFlow);
    if (typeF === 'transfer') list = list.filter(t => t.kind === 'transfer');
    if (typeF === 'goal') list = list.filter(t => t.isGoalSaving);
    if (typeF === 'debt') list = list.filter(t => t.isDebtPayment);
    if (typeF === 'commitment') list = list.filter(t => t.isCommitmentPayment);
    if (catF !== 'all') list = list.filter(t => t.cat === catF);
    if (walletF !== 'all') {
      list = list.filter(t => (
        t.kind === 'transfer'
          ? t.fromWalletId === walletF || t.toWalletId === walletF
          : (t.walletId || walletRows[0]?.id) === walletF
      ));
    }
    if (dateBounds.from) list = list.filter(t => String(t.dateISO || '') >= dateBounds.from);
    if (dateBounds.to) list = list.filter(t => String(t.dateISO || '') <= dateBounds.to);
    return list;
  }, [trans, scopedTrans, cfg.activeScope, cfg.profileType, cfg.lang, search, typeF, catF, walletF, periodF, dateBounds, cats, categoryMap, walletMap, walletRows]);

  const sqlEnabled = ledgerReady && activeLedgerSupported();
  const sqlClass = typeF === 'inc' ? 'income'
    : typeF === 'exp' ? 'expense'
      : ['transfer', 'goal', 'debt', 'commitment'].includes(typeF) ? typeF : null;
  const queryLedgerPage = React.useCallback(async ({ append = false, cursor = null } = {}) => {
    if (!sqlEnabled || (append && ledgerLoading)) return;
    const requestId = ++ledgerRequestRef.current;
    setLedgerLoading(true);
    try {
      const result = await queryLedgerTransactions({
        namespace: getLedgerNamespace(workspaceNamespace, cfg),
        limit: 250,
        cursor,
        search,
        transactionClass: sqlClass,
        categoryId: catF !== 'all' ? catF : null,
        walletId: walletF !== 'all' ? walletF : null,
        scope: cfg.activeScope !== 'all' ? cfg.activeScope : null,
        fromDate: dateBounds.from || null,
        toDate: dateBounds.to || null,
        archived: false,
      });
      if (!result?.supported) {
        if (requestId === ledgerRequestRef.current) setLedgerQueryOk(false);
        return;
      }
      const visible = getVisibleHistoryTransactions(result.rows || [], cfg);
      if (requestId !== ledgerRequestRef.current) return;
      // A lagging/mismatched SQLite mirror must never erase rows that are
      // already present in the active UI cache. Keep the compatible result
      // visible until the ledger query catches up.
      if (!append && visible.length === 0 && filteredFallback.length > 0) {
        setLedgerQueryOk(false);
        setLedgerCursor(null);
        return;
      }
      setLedgerRows(current => append ? [...current, ...visible] : visible);
      setLedgerCursor(result.nextCursor || null);
      setLedgerQueryOk(true);
    } catch (error) {
      console.warn('[HISTORY] SQLite query failed; using compatibility fallback', error);
      if (requestId === ledgerRequestRef.current) setLedgerQueryOk(false);
    } finally {
      if (requestId === ledgerRequestRef.current) setLedgerLoading(false);
    }
  }, [sqlEnabled, ledgerLoading, workspaceNamespace, search, sqlClass, catF, walletF, cfg.activeScope, cfg.profileType, cfg.enabledModules, dateBounds.from, dateBounds.to, filteredFallback.length]);

  React.useEffect(() => {
    if (!sqlEnabled) {
      ledgerRequestRef.current += 1;
      setLedgerRows([]);
      setLedgerCursor(null);
      setLedgerQueryOk(false);
      return undefined;
    }
    // Show the fresh in-memory rows immediately after a mutation. The latest
    // SQLite response becomes authoritative again only after it completes.
    ledgerRequestRef.current += 1;
    setLedgerLoading(false);
    setLedgerQueryOk(false);
    const timer = setTimeout(() => { queryLedgerPage({ append: false, cursor: null }); }, 120);
    return () => clearTimeout(timer);
  }, [sqlEnabled, trans, search, typeF, catF, walletF, periodF, dateFrom, dateTo, workspaceNamespace]);

  const filtered = ledgerQueryOk ? ledgerRows : filteredFallback;
  const selectionIds = useMemo(() => filtered.map(item => item.id), [filtered]);
  const selection = useMultiSelect(selectionIds);

  React.useEffect(() => {
    setRenderLimit(250);
  }, [search, typeF, catF, walletF, periodF, dateFrom, dateTo]);

  const visibleFiltered = useMemo(
    () => ledgerQueryOk ? filtered : filtered.slice(0, renderLimit),
    [filtered, renderLimit, ledgerQueryOk],
  );
  const clearAppliedFilters = () => {
    setSearch('');
    setTypeF('all');
    setCatF('all');
    setWalletF('all');
    setPeriodF('all');
    setDateFrom('');
    setDateTo('');
  };

  const grouped = useMemo(() => {
    const map = new Map();
    visibleFiltered.forEach(item => {
      const key = item.dateISO || '-';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()];
  }, [visibleFiltered]);
  const sections = useMemo(
    () => grouped.map(([dateISO, items]) => ({ title: dateISO, data: items })),
    [grouped],
  );

  const appliedFilters = { type: typeF, category: catF, wallet: walletF, period: periodF, dateFrom, dateTo };
  const countFilters = filters => (
    (filters.category !== 'all' ? 1 : 0)
    + (filters.wallet !== 'all' ? 1 : 0)
    + (filters.period !== 'all' ? 1 : 0)
  );
  const activeFilters = countFilters(appliedFilters);
  const currentDraft = draftFilters || appliedFilters;
  const openFilters = () => {
    setDraftFilters({ ...appliedFilters });
    setExpandedFilter(null);
    setShowFilter(true);
  };
  const closeFilters = () => {
    setShowFilter(false);
    setExpandedFilter(null);
    setDraftFilters(null);
  };
  const updateDraft = (key, value) => setDraftFilters(current => ({ ...(current || appliedFilters), [key]: value }));
  const resetDraft = () => setDraftFilters({
    type: typeF, category: 'all', wallet: 'all', period: 'all', dateFrom: '', dateTo: '',
  });
  const applyDraft = () => {
    const next = currentDraft;
    setTypeF(next.type);
    setCatF(next.category);
    setWalletF(next.wallet);
    setPeriodF(next.period);
    setDateFrom(next.dateFrom);
    setDateTo(next.dateTo);
    closeFilters();
  };
  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);

  const findCat = (catId) => categoryMap.get(catId) || categoryMap.get('other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];

  const confirmDeleteRow = (item) => {
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
    Alert.alert(linked ? T.linkedDeleteTitle : L.delete, linked ? T.linkedDeleteBody : L.confirmDel, [
      { text: L.no, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: async () => {
          const deleted = await deleteTrans(item.id);
          if (!deleted) return;
          Alert.alert(
            '',
            cfg.lang === 'ar' ? 'تم حذف الحركة ويمكن التراجع عنها.' : 'Transaction deleted. You can undo it.',
            [
              { text: cfg.lang === 'ar' ? 'إغلاق' : 'Close', style: 'cancel' },
              { text: cfg.lang === 'ar' ? 'تراجع' : 'Undo', onPress: () => undoLastTransactionDelete?.() },
            ],
          );
        },
      },
    ]);
  };

  const confirmDeleteSelected = () => {
    if (!selection.selectedCount) return;
    const selectedRows = trans.filter(item => selection.selected.has(item.id));
    const linked = selectedRows.some(item => item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment);
    const body = cfg.lang === 'ar'
      ? `سيتم حذف ${selection.selectedCount} حركة نهائياً${linked ? ' وتحديث العناصر المرتبطة بها.' : '.'}`
      : `Delete ${selection.selectedCount} transactions permanently${linked ? ' and update their linked items.' : '?'}`;
    Alert.alert(L.delete, body, [
      { text: L.no, style: 'cancel' },
      {
        text: L.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteTransMany(selection.selectedIds);
          selection.cancel();
        },
      },
    ]);
  };

  const renderRow = (item, edge = {}) => {
    const cat = findCat(item.cat);
    const amount = getTransactionDisplayAmount(item);
    const isTransfer = item.kind === 'transfer';
    const isGoalSaving = !!item.isGoalSaving;
    const fromWallet = findWallet(item.fromWalletId);
    const toWallet = findWallet(item.toWalletId);
    const color = isTransfer || isGoalSaving ? th.primary : amount > 0 ? th.inc : th.exp;
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
    const debt = item.isDebtPayment ? debts.find(entity => entity.id === item.debtId) : null;
    const goal = item.isGoalSaving ? goals.find(entity => entity.id === item.goalId) : null;
    const latestDebtPaymentId = debt?.status === 'settled'
      ? debt.payments?.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.ts || 0) - Number(a.ts || 0))[0]?.id
      : null;
    const latestGoalSavingId = goal?.status === 'settled'
      ? goal.savings?.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || Number(b.ts || 0) - Number(a.ts || 0))[0]?.id
      : null;
    const completionLabel = item.completionNotice === 'debt_ended' || (item.isDebtPayment && item.paymentId === latestDebtPaymentId)
      ? T.debtEnded
      : item.completionNotice === 'goal_completed' || (item.isGoalSaving && item.savingId === latestGoalSavingId)
        ? T.goalCompleted
        : null;
    const title = isTransfer ? T.walletTransfer : item.title;
    const entryWallet = findWallet(item.walletId);
    const nativeCurrency = String(item.walletCurrency || entryWallet?.currency || cfg.currency).toUpperCase();
    const nativeAmount = Object.prototype.hasOwnProperty.call(item || {}, 'walletAmount')
      ? Number(item.walletAmount || 0)
      : Number(amount || 0);
    const fromCurrency = String(item.fromCurrency || fromWallet?.currency || cfg.currency).toUpperCase();
    const toCurrency = String(item.toCurrency || toWallet?.currency || cfg.currency).toUpperCase();
    const transferDisplay = `${formatMoneyNumber(Math.abs(Number(item.transferFromAmount ?? item.transferAmount ?? 0)), fromCurrency, cfg.lang)} ${getSymbol(fromCurrency)} → ${formatMoneyNumber(Math.abs(Number(item.transferToAmount ?? item.transferAmount ?? 0)), toCurrency, cfg.lang)} ${getSymbol(toCurrency)}`;
    const nativeDisplay = `${nativeAmount > 0 ? '+' : '-'}${formatMoneyNumber(Math.abs(nativeAmount), nativeCurrency, cfg.lang)} ${getSymbol(nativeCurrency)}`;
    const walletLabel = isTransfer
      ? `${getWalletLabel(fromWallet, cfg.lang)} → ${getWalletLabel(toWallet, cfg.lang)}`
      : getWalletLabel(entryWallet, cfg.lang);
    const categoryLabel = isTransfer ? T.transfer : (cfg.lang === 'ar' ? cat.label : cat.labelEn);
    const metaLabel = [categoryLabel, walletLabel].filter(Boolean).join(' · ');

    return (
      <Pressable
        key={item.id}
        onLongPress={() => selection.toggle(item.id)}
        onPress={() => {
          if (selection.selecting) selection.toggle(item.id);
          else setDetails(item);
        }}
        style={[
          s.row,
          edge.first && s.rowFirst,
          edge.last && s.rowLast,
          {
            backgroundColor: selection.selected.has(item.id) ? th.primSoft : th.card,
            borderColor: selection.selected.has(item.id) ? th.primary : th.border,
            borderBottomColor: selection.selected.has(item.id) ? th.primary : th.border,
            flexDirection: rowDir,
          },
        ]}
      >
        <View style={[s.rowMain, { flexDirection: rowDir }]}>
          <View style={[s.iconCell, { backgroundColor: `${color}1F`, borderColor: `${color}66` }]}>
            <Ionicons name={isTransfer ? 'swap-horizontal-outline' : (cat.icon || 'cube-outline')} size={18} color={color} />
          </View>
          <View style={s.rowContent}>
            <Text style={{ color: th.text, ...weight('900'), fontSize: 14, textAlign: align, writingDirection }} numberOfLines={1}>
              {title}
            </Text>
            <View style={[s.rowMeta, { flexDirection: rowDir }]}>
              <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align, writingDirection, flex: 1 }} numberOfLines={1}>
                {metaLabel}
              </Text>
            </View>
            {completionLabel ? (
              <Text style={{ color: th.inc, fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: align, writingDirection }}>
                {completionLabel}
              </Text>
            ) : null}
          </View>
          <View style={s.amountBlock}>
            <Text style={{ color, ...weight('900'), fontSize: 15, textAlign: align }} numberOfLines={1}>
              {isTransfer ? transferDisplay : nativeDisplay}
            </Text>
            <View style={[s.rowSignals, { flexDirection: rowDir }]}>
              {linked ? <Ionicons name="link-outline" size={12} color={th.faint} /> : null}
              {item.recurring ? <Ionicons name="repeat-outline" size={12} color={th.faint} /> : null}
              {!linked && !item.recurring ? <Ionicons name={cfg.lang === 'ar' ? 'chevron-back' : 'chevron-forward'} size={13} color={th.faint} /> : null}
            </View>
          </View>
        </View>
        {selection.selecting ? (
          <SelectionCheckbox th={th} selected={selection.selected.has(item.id)} onPress={() => selection.toggle(item.id)} />
        ) : null}
      </Pressable>
    );
  };


  const typeOptions = [
    { value: 'all', label: L.filterAll, icon: 'albums-outline' },
    { value: 'inc', label: L.filterInc, icon: 'arrow-down-outline' },
    { value: 'exp', label: L.filterExp, icon: 'arrow-up-outline' },
    { value: 'transfer', label: T.transfer, icon: 'swap-horizontal-outline' },
    { value: 'goal', label: T.saving, icon: 'flag-outline' },
    { value: 'debt', label: cfg.lang === 'ar' ? 'دين' : 'Debt', icon: 'card-outline' },
    { value: 'commitment', label: cfg.lang === 'ar' ? 'التزام' : 'Commitment', icon: 'calendar-outline' },
  ];
  const periodOptions = [
    { value: 'all', label: T.allTime, icon: 'calendar-outline' },
    { value: 'today', label: T.today, icon: 'today-outline' },
    { value: 'month', label: T.thisMonth, icon: 'calendar-number-outline' },
    { value: 'lastMonth', label: T.lastMonth, icon: 'play-back-outline' },
    { value: 'year', label: T.thisYear, icon: 'calendar-clear-outline' },
    { value: 'custom', label: T.customPeriod, icon: 'options-outline' },
  ];
  const walletOptions = [
    { value: 'all', label: T.allWallets, icon: 'wallet-outline' },
    ...walletRows.map(wallet => ({ value: wallet.id, label: getWalletLabel(wallet, cfg.lang), icon: 'wallet-outline' })),
  ];
  const categoryOptions = [
    { value: 'all', label: L.allCats, icon: 'grid-outline' },
    ...cats.map(cat => ({ value: cat.id, label: cfg.lang === 'ar' ? cat.label : cat.labelEn, icon: cat.icon || 'cube-outline', color: cat.color })),
  ];
  const renderFilterPicker = ({ id, label, value, options, icon }) => {
    const selected = options.find(option => option.value === value) || options[0];
    const expanded = expandedFilter === id;
    return (
      <View style={s.filterPickerBlock}>
        <TouchableOpacity
          onPress={() => setExpandedFilter(expanded ? null : id)}
          style={[s.filterPickerRow, { borderColor: th.border, backgroundColor: th.cardHigh, flexDirection: rowDir }]}
        >
          <Ionicons name={icon} size={18} color={th.sub} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: th.sub, fontSize: 11, lineHeight: 16, textAlign: align, writingDirection }}>{label}</Text>
            <Text style={{ color: th.text, fontSize: 13, lineHeight: 20, ...weight('900'), textAlign: align, writingDirection }} numberOfLines={1}>
              {selected?.label}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={th.faint} />
        </TouchableOpacity>
        {expanded ? (
          <View style={[s.filterOptionList, { borderColor: th.border, backgroundColor: th.input }]}>
            {options.map(option => {
              const active = option.value === value;
              const optionColor = option.color || (active ? th.primary : th.sub);
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => {
                    updateDraft(id, option.value);
                    setExpandedFilter(null);
                  }}
                  style={[s.filterOption, { backgroundColor: active ? th.primSoft : 'transparent', flexDirection: rowDir }]}
                >
                  <Ionicons name={option.icon || 'ellipse-outline'} size={17} color={optionColor} />
                  <Text style={{ flex: 1, color: active ? th.primary : th.text, fontSize: 13, ...weight(active ? '900' : '700'), textAlign: align, writingDirection }}>
                    {option.label}
                  </Text>
                  {active ? <Ionicons name="checkmark" size={17} color={th.primary} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <HistoryControls
        th={th}
        rowDir={rowDir}
        align={align}
        writingDirection={writingDirection}
        lang={cfg.lang}
        L={L}
        search={search}
        setSearch={setSearch}
        selection={{ ...selection, onDelete: confirmDeleteSelected }}
        filteredCount={filtered.length}
        activeFilters={activeFilters}
        openFilters={openFilters}
        typeF={typeF}
        setTypeF={setTypeF}
        typeOptions={typeOptions}
        hasEntries={scopedTrans.length > 0}
      />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index, section }) => renderRow(item, { first: index === 0, last: index === section.data.length - 1 })}
        renderSectionHeader={({ section }) => (
          <View style={[s.dayHeader, { flexDirection: rowDir }]}>
            <Text style={[s.dayTitle, { color: th.text, textAlign: align }]}>{dayLabel(section.title, cfg.lang)}</Text>
            <View style={[s.dayCountBadge, { backgroundColor: th.cardHigh }]}>
              <Text style={[s.dayCount, { color: th.sub }]}>{section.data.length}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={(
          <View style={[s.empty, { borderColor: th.border }]}>
            <View style={[s.emptyIcon, { backgroundColor: th.cardHigh }]}><Ionicons name="receipt-outline" size={28} color={th.faint} /></View>
            <Text style={[s.emptyTitle, { color: th.text }]}>
              {scopedTrans.length ? T.noResults : T.emptyHistory}
            </Text>
            <Text style={[s.emptyBody, { color: th.sub }]}>
              {scopedTrans.length
                ? (cfg.lang === 'ar' ? 'غيّر البحث أو الفلاتر لعرض حركات أخرى.' : 'Change the search or filters to show other transactions.')
                : (cfg.lang === 'ar' ? 'سجّل أول دخل أو مصروف، وبعدها سيصبح السجل مرجعك الكامل للحركات.' : 'Add your first income or expense; History will then become your complete transaction ledger.')}
            </Text>
            {scopedTrans.length ? (
              <TouchableOpacity onPress={clearAppliedFilters} style={[s.emptyAction, { backgroundColor: th.primSoft }]}>
                <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{L.clearFilter}</Text>
              </TouchableOpacity>
            ) : (
              <View style={[s.emptyActionRow, { flexDirection: rowDir }]}>
                <TouchableOpacity onPress={onAddIncome} style={[s.emptyActionWide, { backgroundColor: th.primSoft, borderColor: `${th.primary}44` }]}>
                  <Ionicons name="arrow-down-outline" size={15} color={th.primary} />
                  <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{cfg.lang === 'ar' ? 'إضافة دخل' : 'Add income'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={onAddExpense} style={[s.emptyActionWide, { backgroundColor: th.primary, borderColor: th.primary }]}>
                  <Ionicons name="arrow-up-outline" size={15} color={th.onPrimary} />
                  <Text style={{ color: th.onPrimary, fontSize: 11, ...weight('900') }}>{cfg.lang === 'ar' ? 'إضافة مصروف' : 'Add expense'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 112 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={24}
        maxToRenderPerBatch={24}
        windowSize={9}
        removeClippedSubviews
        onEndReached={() => {
          if (ledgerQueryOk && ledgerCursor && !ledgerLoading) {
            queryLedgerPage({ append: true, cursor: ledgerCursor });
          } else if (!ledgerQueryOk && renderLimit < filtered.length) {
            setRenderLimit(value => Math.min(value + 250, filtered.length));
          }
        }}
        onEndReachedThreshold={0.45}
      />

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <AddTransModal
        visible={!!duplicateDraft}
        onClose={() => setDuplicateDraft(null)}
        draftData={duplicateDraft}
        focusedEntry
      />
      <TransactionDetailsModal
        visible={!!details}
        transaction={details}
        cats={cats}
        wallets={wallets}
        cfg={cfg}
        onClose={() => setDetails(null)}
        canEdit={!!details && !(details.isDebtPayment || details.isGoalSaving || details.isCommitmentPayment) && isCurrentMonthTransaction(details)}
        canDuplicate={!!details}
        onEdit={() => {
          const target = details;
          setDetails(null);
          if (target) setEditing(target);
        }}
        onDuplicate={() => {
          const target = details;
          setDetails(null);
          if (!target) return;

          const base = {
            title: target.title || '',
            cat: target.cat,
            walletId: target.walletId,
            note: target.note || '',
            scope: target.scope,
            dateISO: todayISO(),
            recurring: false,
          };
          if (target.kind === 'transfer') {
            setDuplicateDraft({
              ...base,
              mode: 'transfer',
              amount: Math.abs(Number(target.transferFromAmount ?? target.transferAmount ?? 0)),
              transferFromAmount: Math.abs(Number(target.transferFromAmount ?? target.transferAmount ?? 0)),
              transferToAmount: Math.abs(Number(target.transferToAmount ?? target.transferAmount ?? 0)),
              transferRate: target.transferRate ?? target.exchangeRate,
              exchangeRate: target.transferRate ?? target.exchangeRate,
              feeAmount: Math.abs(Number(target.feeAmount || 0)),
              fromWalletId: target.fromWalletId,
              toWalletId: target.toWalletId,
            });
            return;
          }
          if (target.isDebtPayment && target.debtId) {
            setDuplicateDraft({ ...base, mode: 'debt', debtId: target.debtId, amount: Math.abs(Number(target.amt || 0)) });
            return;
          }
          if (target.isGoalSaving && target.goalId) {
            setDuplicateDraft({ ...base, mode: 'goal', goalId: target.goalId, amount: Math.abs(Number(target.allocationAmount || target.amt || 0)) });
            return;
          }
          if (target.isCommitmentPayment && target.commitmentId) {
            // Duplicate means review a new payment today. It must not silently
            // create or advance a recurring schedule/cycle on the user's behalf.
            setDuplicateDraft({ ...base, mode: 'commitment', commitmentId: target.commitmentId, dateISO: todayISO() });
            return;
          }
          setDuplicateDraft({
            ...base,
            mode: Number(target.amt || 0) >= 0 ? 'inc' : 'exp',
            amount: Math.abs(Number(target.amt || 0)),
            amt: target.amt,
          });
        }}
        onDelete={() => {
          const target = details;
          setDetails(null);
          if (target) confirmDeleteRow(target);
        }}
      />

      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={closeFilters}>
        <View style={[s.overlay, { backgroundColor: th.overlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeFilters} />
          <View style={[s.sheet, { backgroundColor: th.card, paddingBottom: 12 + Math.max(insets.bottom, 8) }]}>
            <View style={[s.sheetHeader, { flexDirection: rowDir }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetTitle, { color: th.text, textAlign: align, marginBottom: 3 }]}>{L.filterTitle}</Text>
                <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), textAlign: align }}>
                  {countFilters(currentDraft)} {cfg.lang === 'ar' ? 'اختيارات' : 'selected'}
                </Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={s.filterScroll}>
              {renderFilterPicker({ id: 'period', label: T.period, value: currentDraft.period, options: periodOptions, icon: 'calendar-outline' })}

            {currentDraft.period === 'custom' ? (
              <View style={[s.dateRange, { flexDirection: rowDir }]}>
                <View style={s.dateRangeField}>
                  <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.fromDate}</Text>
                  <DateField value={currentDraft.dateFrom} onChange={value => updateDraft('dateFrom', value)} th={th} lang={cfg.lang} monthNameStyle={cfg.monthNameStyle} allowEmpty />
                </View>
                <View style={s.dateRangeField}>
                  <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.toDate}</Text>
                  <DateField value={currentDraft.dateTo} onChange={value => updateDraft('dateTo', value)} th={th} lang={cfg.lang} monthNameStyle={cfg.monthNameStyle} allowEmpty />
                </View>
              </View>
            ) : null}

              {renderFilterPicker({ id: 'wallet', label: T.wallet, value: currentDraft.wallet, options: walletOptions, icon: 'wallet-outline' })}
              {renderFilterPicker({ id: 'category', label: L.cat, value: currentDraft.category, options: categoryOptions, icon: 'grid-outline' })}
            </ScrollView>
            <View style={[s.filterActions, { flexDirection: rowDir, borderTopColor: th.border }]}>
              <TouchableOpacity
                onPress={resetDraft}
                style={[s.halfBtn, { backgroundColor: th.cardHigh }]}
              >
                <Text style={{ color: th.sub, ...weight('900') }}>{L.clearFilter}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={applyDraft} style={[s.halfBtn, { backgroundColor: th.primary }]}>
                <Ionicons name="search" size={16} color={th.onPrimary} />
                <Text style={{ color: th.onPrimary, ...weight('900') }}>{L.applyFilter}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  historyFixedControls: { paddingHorizontal: 18, paddingTop: 8, zIndex: 20, elevation: 8 },
  historyFilterAction: { width: 46, height: 46, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', position: 'relative', flexShrink: 0 },
  historyToolbar: { alignItems: 'center', gap: 8, marginBottom: 10 },
  filterCountBadge: { minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: -5, right: -5, paddingHorizontal: 3 },
  historyHeadIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  searchBox: { flex: 1, minHeight: 46, alignItems: 'center', borderRadius: 14, paddingHorizontal: 12, borderWidth: 1 },
  typeRailTitle: { display: 'none' },
  typeRail: { gap: 7, paddingBottom: 9 },
  typeChip: { minHeight: 35, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11 },
  typeChipText: { fontSize: 11, lineHeight: 16, ...weight('900') },
  filterBtn: { display: 'none' },
  dayHeader: { alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 6, marginBottom: 7 },
  dayTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  dayCount: { fontSize: 10, lineHeight: 14, ...weight('900') },
  dayCountBadge: { minWidth: 24, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  dayBlock: { marginBottom: 8 },
  row: { minHeight: 58, alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 0, borderWidth: 1, borderTopWidth: 0, marginBottom: 0, gap: 8 },
  rowFirst: { borderTopWidth: 1, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  rowLast: { borderBottomLeftRadius: 16, borderBottomRightRadius: 16, marginBottom: 12 },
  rowMeta: { alignItems: 'center', gap: 5, marginTop: 1 },
  rowMain: { flex: 1, alignItems: 'center' },
  rowContent: { flex: 1, marginHorizontal: 10 },
  amountBlock: { minWidth: 86, alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  rowSignals: { minHeight: 14, alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  iconCell: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 0 },
  empty: { minHeight: 210, borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 22 },
  emptyIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 21, ...weight('900'), marginTop: 12, textAlign: 'center' },
  emptyBody: { fontSize: 11, lineHeight: 18, ...weight('700'), marginTop: 5, maxWidth: 320, textAlign: 'center' },
  emptyAction: { minHeight: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12 },
  emptyActionRow: { width: '100%', gap: 8, marginTop: 14 },
  emptyActionWide: { flex: 1, minHeight: 40, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 9 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '76%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 14 },
  sheetHeader: { alignItems: 'center', gap: 8, marginBottom: 10 },
  sheetTitle: { fontSize: 18, lineHeight: 24, ...weight('900') },
  filterScroll: { paddingBottom: 12 },
  filterLabel: { fontSize: 12, ...weight('900'), marginBottom: 10 },
  filterPickerBlock: { marginBottom: 8 },
  filterPickerRow: { minHeight: 50, alignItems: 'center', gap: 10, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 7 },
  filterOptionList: { borderWidth: 1, borderRadius: RADIUS.md, marginTop: 5, padding: 5 },
  filterOption: { minHeight: 39, alignItems: 'center', gap: 9, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 6 },
  filterActions: { gap: 9, borderTopWidth: 1, paddingTop: 10 },
  halfBtn: { flex: 1, minHeight: 42, borderRadius: RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  dateRange: { gap: 10, marginTop: 14 },
  dateRangeField: { flex: 1 },
  filterInput: { minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, ...weight('800') },
});
