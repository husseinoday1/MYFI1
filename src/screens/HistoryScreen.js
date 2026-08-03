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
import { RADIUS, SHADOW, TYPE, weight } from '../lib/tokens';
import ActionMenu from '../components/ActionMenu';
import DateField from '../components/DateField';
import { rowDirFor, textAlignFor, writingDirectionFor } from '../lib/layout';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { filterByActiveScope, getTransactionDisplayAmount, isExpenseFlow, isIncomeFlow } from '../lib/modules';
import { getTransactionTagMeta } from '../lib/transactionTags';
import { getVisibleHistoryTransactions } from '../lib/history';
import { isCurrentMonthTransaction } from '../lib/transactionAccess';
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
    duplicate: ar ? 'تكرار الحركة' : 'Duplicate transaction',
    fromDate: ar ? 'من تاريخ' : 'From date',
    toDate: ar ? 'إلى تاريخ' : 'To date',
    saving: ar ? 'توفير للهدف' : 'Goal saving',
  };
};

const dayLabel = (dateISO, lang) => {
  return dateISO || '-';
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

export default function HistoryScreen() {
  const { trans, wallets, cats, cfg, deleteTrans, deleteTransMany, duplicateTrans } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const insets = useSafeAreaInsets();
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const writingDirection = writingDirectionFor(cfg.lang);
  const scopedTrans = useMemo(() => getVisibleHistoryTransactions(trans, cfg), [trans, cfg]);
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
  const [details, setDetails] = useState(null);

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

  const filtered = useMemo(() => {
    let list = [...scopedTrans].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t => {
        const cat = cats.find(item => item.id === t.cat);
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
    list.sort((a, b) => txTime(b) - txTime(a));
    return list;
  }, [trans, scopedTrans, cfg.activeScope, cfg.profileType, cfg.lang, search, typeF, catF, walletF, periodF, dateBounds, cats, walletMap, walletRows]);
  const selection = useMultiSelect(filtered.map(item => item.id));
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
    filtered.forEach(item => {
      const key = item.dateISO || '-';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()];
  }, [filtered]);
  const sections = useMemo(
    () => grouped.map(([dateISO, items]) => ({ title: dateISO, data: items })),
    [grouped],
  );

  const appliedFilters = { type: typeF, category: catF, wallet: walletF, period: periodF, dateFrom, dateTo };
  const countFilters = filters => (
    (filters.type !== 'all' ? 1 : 0)
    + (filters.category !== 'all' ? 1 : 0)
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
    type: 'all', category: 'all', wallet: 'all', period: 'all', dateFrom: '', dateTo: '',
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

  const findCat = (catId) => cats.find(c => c.id === catId) || cats.find(c => c.id === 'other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];

  const confirmDeleteRow = (item) => {
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
    const editable = !linked && isCurrentMonthTransaction(item);
    Alert.alert(linked ? T.linkedDeleteTitle : L.delete, linked ? T.linkedDeleteBody : L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteTrans(item.id) },
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

  const renderRow = (item) => {
    const cat = findCat(item.cat);
    const amount = getTransactionDisplayAmount(item);
    const isTransfer = item.kind === 'transfer';
    const isGoalSaving = !!item.isGoalSaving;
    const fromWallet = findWallet(item.fromWalletId);
    const toWallet = findWallet(item.toWalletId);
    const color = isTransfer || isGoalSaving ? th.primary : amount > 0 ? th.inc : th.exp;
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
    const title = isTransfer ? T.walletTransfer : item.title;
    const metaLabel = isTransfer
      ? `${getWalletLabel(fromWallet, cfg.lang)} -> ${getWalletLabel(toWallet, cfg.lang)}`
      : (cfg.lang === 'ar' ? cat.label : cat.labelEn);
    const amountLabel = isTransfer ? T.transfer : isGoalSaving ? T.saving : amount > 0 ? T.income : T.expense;
    const editable = !linked && isCurrentMonthTransaction(item);

    return (
      <Pressable
        key={item.id}
        onLongPress={() => selection.toggle(item.id)}
        onPress={() => {
          if (selection.selecting) selection.toggle(item.id);
        }}
        style={[
          s.row,
          {
            backgroundColor: selection.selected.has(item.id) ? th.primSoft : th.card,
            borderColor: selection.selected.has(item.id) ? th.primary : th.border,
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
          </View>
          <View style={s.amountBlock}>
            <Text style={{ color, ...weight('900'), fontSize: 15, textAlign: align }} numberOfLines={1}>
              {isTransfer ? fmt(item.transferAmount) : `${amount > 0 ? '+' : '-'}${fmt(amount)}`} {sym}
            </Text>
            <Text style={{ color: th.faint, fontSize: 11, lineHeight: 16, ...weight('800'), textAlign: align }}>
              {amountLabel}
            </Text>
          </View>
        </View>
        {selection.selecting ? (
          <SelectionCheckbox th={th} selected={selection.selected.has(item.id)} onPress={() => selection.toggle(item.id)} />
        ) : (
          <ActionMenu
            th={th}
            lang={cfg.lang}
            title={title}
            buttonStyle={{ backgroundColor: th.cardHigh, width: 32, height: 32, borderRadius: 10 }}
            items={[
              { label: T.select, icon: 'checkmark-circle-outline', color: th.primary, onPress: () => selection.toggle(item.id) },
              { label: cfg.lang === 'ar' ? '\u0627\u0644\u062a\u0641\u0627\u0635\u064a\u0644' : 'Details', icon: 'reader-outline', color: th.primary, onPress: () => setDetails(item) },
              editable ? { label: L.editTrans, icon: 'create-outline', color: th.primary, onPress: () => setEditing(item) } : null,
              !linked ? { label: T.duplicate, icon: 'copy-outline', color: th.primary, onPress: () => duplicateTrans(item.id) } : null,
              { label: L.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteRow(item) },
            ]}
          />
        )}
      </Pressable>
    );
  };

  const renderHeader = () => (
    <>
      <MultiSelectBar
        th={th}
        lang={cfg.lang}
        active={selection.selecting}
        count={selection.selectedCount}
        total={filtered.length}
        allSelected={selection.allSelected}
        onStart={selection.start}
        onToggleAll={selection.toggleAll}
        onDelete={confirmDeleteSelected}
        onCancel={selection.cancel}
      />
      <View style={[s.searchBox, { backgroundColor: th.input, borderColor: search ? th.primary : th.border, flexDirection: rowDir }]}>
        <Ionicons name="search" size={16} color={th.sub} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={L.searchPlaceholder}
          placeholderTextColor={th.sub}
          style={{ flex: 1, color: th.text, fontSize: 14, paddingVertical: 10, marginHorizontal: 8, textAlign: align, writingDirection }}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="backspace-outline" size={16} color={th.sub} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={openFilters}
        style={[s.filterBtn, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
      >
        <Ionicons name="options-outline" size={17} color={th.sub} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: th.text, ...weight('900'), fontSize: 13, textAlign: align, writingDirection }}>
            {L.filterTitle}{activeFilters ? ` · ${activeFilters}` : ''}
          </Text>
          <Text style={{ color: th.sub, fontSize: 11, lineHeight: 17, textAlign: align, writingDirection }}>
            {filtered.length} {T.entries}
          </Text>
        </View>
        <Ionicons name={cfg.lang === 'ar' ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />
      </TouchableOpacity>
    </>
  );

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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => renderRow(item)}
        renderSectionHeader={({ section }) => (
          <Text style={{ color: th.sub, fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8, textAlign: align }}>
            {dayLabel(section.title, cfg.lang)}
          </Text>
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={(
          <View style={[s.empty, { borderColor: th.border }]}>
            <Ionicons name="receipt-outline" size={34} color={th.faint} />
            <Text style={{ color: th.sub, fontSize: 13, ...weight('900'), marginTop: 8 }}>
              {scopedTrans.length ? T.noResults : T.emptyHistory}
            </Text>
            {scopedTrans.length ? (
              <TouchableOpacity
                onPress={clearAppliedFilters}
                style={[s.emptyAction, { backgroundColor: th.primSoft }]}
              >
                <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{L.clearFilter}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 112 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <TransactionDetailsModal visible={!!details} transaction={details} cats={cats} wallets={wallets} cfg={cfg} onClose={() => setDetails(null)} />

      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={closeFilters}>
        <View style={[s.overlay, { backgroundColor: th.overlay }]}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={closeFilters} />
          <View style={[s.sheet, { backgroundColor: th.card, paddingBottom: 14 + Math.max(insets.bottom, 8) }]}>
            <View style={[s.sheetHeader, { flexDirection: rowDir }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.sheetTitle, { color: th.text, textAlign: align, marginBottom: 3 }]}>{L.filterTitle}</Text>
                <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), textAlign: align }}>
                  {countFilters(currentDraft)} {cfg.lang === 'ar' ? 'اختيارات' : 'selected'}
                </Text>
              </View>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={s.filterScroll}>
              {renderFilterPicker({ id: 'type', label: T.transactionType, value: currentDraft.type, options: typeOptions, icon: 'swap-vertical-outline' })}
              {renderFilterPicker({ id: 'period', label: T.period, value: currentDraft.period, options: periodOptions, icon: 'calendar-outline' })}

            {currentDraft.period === 'custom' ? (
              <View style={[s.dateRange, { flexDirection: rowDir }]}>
                <View style={s.dateRangeField}>
                  <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.fromDate}</Text>
                  <DateField value={currentDraft.dateFrom} onChange={value => updateDraft('dateFrom', value)} th={th} lang={cfg.lang} allowEmpty />
                </View>
                <View style={s.dateRangeField}>
                  <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.toDate}</Text>
                  <DateField value={currentDraft.dateTo} onChange={value => updateDraft('dateTo', value)} th={th} lang={cfg.lang} allowEmpty />
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
  searchBox: { alignItems: 'center', borderRadius: RADIUS.lg, paddingHorizontal: 13, borderWidth: 1, marginBottom: 10, ...SHADOW.card },
  filterBtn: { borderRadius: RADIUS.lg, paddingHorizontal: 13, paddingVertical: 10, alignItems: 'center', borderWidth: 1, gap: 10, ...SHADOW.card },
  dayBlock: { marginBottom: 6 },
  row: { minHeight: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 6, gap: 8 },
  rowMeta: { alignItems: 'center', gap: 6, marginTop: 1 },
  rowMain: { flex: 1, alignItems: 'center' },
  rowContent: { flex: 1, marginHorizontal: 10 },
  amountBlock: { minWidth: 92, alignItems: 'flex-end', justifyContent: 'center' },
  iconCell: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  empty: { minHeight: 170, borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 18 },
  emptyAction: { minHeight: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, marginTop: 12 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 18 },
  sheetHeader: { alignItems: 'center', gap: 10, marginBottom: 12 },
  sheetTitle: { fontSize: TYPE.title, ...weight('900') },
  filterScroll: { paddingBottom: 18 },
  filterLabel: { fontSize: 12, ...weight('900'), marginBottom: 10 },
  filterPickerBlock: { marginBottom: 8 },
  filterPickerRow: { minHeight: 56, alignItems: 'center', gap: 11, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  filterOptionList: { borderWidth: 1, borderRadius: RADIUS.md, marginTop: 5, padding: 5 },
  filterOption: { minHeight: 43, alignItems: 'center', gap: 10, borderRadius: RADIUS.sm, paddingHorizontal: 10, paddingVertical: 7 },
  filterActions: { gap: 10, borderTopWidth: 1, paddingTop: 12 },
  halfBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  dateRange: { gap: 10, marginTop: 14 },
  dateRangeField: { flex: 1 },
  filterInput: { minHeight: 46, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, fontSize: 13, ...weight('800') },
});
