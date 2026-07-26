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
import { filterByActiveScope, isExpenseFlow, isIncomeFlow, transactionFeatureEnabled } from '../lib/modules';

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
    all: ar ? 'الكل' : 'All',
    today: ar ? 'اليوم' : 'Today',
    duplicate: ar ? 'تكرار الحركة' : 'Duplicate transaction',
    fromDate: ar ? 'من تاريخ' : 'From date',
    toDate: ar ? 'إلى تاريخ' : 'To date',
  };
};

const dayLabel = (dateISO, lang) => {
  return dateISO || '-';
};

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
  const scopedTrans = filterByActiveScope(trans, cfg).filter(item => transactionFeatureEnabled(item, cfg));
  const scopedWallets = filterByActiveScope(wallets, cfg);

  const [search, setSearch] = useState('');
  const [typeF, setTypeF] = useState('all');
  const [catF, setCatF] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [editing, setEditing] = useState(null);

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

  const filtered = useMemo(() => {
    let list = [...scopedTrans].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q)
      );
    }
    if (typeF === 'inc') list = list.filter(isIncomeFlow);
    if (typeF === 'exp') list = list.filter(isExpenseFlow);
    if (typeF === 'transfer') list = list.filter(t => t.kind === 'transfer');
    if (catF !== 'all') list = list.filter(t => t.cat === catF);
    if (dateFrom) list = list.filter(t => String(t.dateISO || '') >= dateFrom);
    if (dateTo) list = list.filter(t => String(t.dateISO || '') <= dateTo);
    return list;
  }, [trans, cfg.activeScope, cfg.profileType, search, typeF, catF, dateFrom, dateTo]);
  const selection = useMultiSelect(filtered.map(item => item.id));

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

  const activeFilters = (typeF !== 'all' ? 1 : 0) + (catF !== 'all' ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0);
  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);

  const findCat = (catId) => cats.find(c => c.id === catId) || cats.find(c => c.id === 'other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];

  const confirmDeleteRow = (item) => {
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
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
    const amount = Number(item.amt || 0);
    const isTransfer = item.kind === 'transfer';
    const fromWallet = findWallet(item.fromWalletId);
    const toWallet = findWallet(item.toWalletId);
    const color = isTransfer ? th.primary : amount > 0 ? th.inc : th.exp;
    const linked = item.isDebtPayment || item.isGoalSaving || item.isCommitmentPayment;
    const title = isTransfer ? T.walletTransfer : item.title;
    const metaLabel = isTransfer
      ? `${getWalletLabel(fromWallet, cfg.lang)} -> ${getWalletLabel(toWallet, cfg.lang)}`
      : (cfg.lang === 'ar' ? cat.label : cat.labelEn);
    const amountLabel = isTransfer ? T.transfer : amount > 0 ? T.income : T.expense;

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
            <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align, writingDirection }} numberOfLines={1}>
              {metaLabel}
            </Text>
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
              !linked ? { label: L.editTrans, icon: 'create-outline', color: th.primary, onPress: () => setEditing(item) } : null,
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
            <Ionicons name="close-circle" size={16} color={th.sub} />
          </TouchableOpacity>
        )}
      </View>

      <TouchableOpacity
        onPress={() => setShowFilter(true)}
        style={[s.filterBtn, { backgroundColor: activeFilters ? th.primSoft : th.card, borderColor: activeFilters ? th.primary : th.border, flexDirection: rowDir }]}
      >
        <Ionicons name="options-outline" size={14} color={activeFilters ? th.primary : th.sub} />
        <Text style={{ color: activeFilters ? th.primary : th.sub, ...weight('900'), fontSize: 13, textAlign: align, writingDirection }}>
          {' '}{L.filterTitle} {activeFilters ? `(${activeFilters})` : ''}
        </Text>
        <View style={[s.inlineCountPill, { backgroundColor: activeFilters ? `${th.primary}18` : th.cardHigh }]}>
          <Text style={{ color: activeFilters ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>
            {filtered.length}
          </Text>
        </View>
      </TouchableOpacity>

    </>
  );

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
            <Text style={{ color: th.sub, fontSize: 13, ...weight('900'), marginTop: 8 }}>{T.noResults}</Text>
          </View>
        )}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 112 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />

      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <TouchableOpacity style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, paddingBottom: 22 + Math.max(insets.bottom, 8) }]}>
            <Text style={[s.sheetTitle, { color: th.text }]}>{L.filterTitle}</Text>

            <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.transactionType}</Text>
            <View style={[s.pills, { flexDirection: rowDir }]}>
              {[['all', L.filterAll], ['inc', L.filterInc], ['exp', L.filterExp], ['transfer', T.transfer]].map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  onPress={() => setTypeF(value)}
                  style={[s.pill, { backgroundColor: typeF === value ? th.primary : th.cardHigh }]}
                >
                  <Text style={{ color: typeF === value ? th.onPrimary : th.sub, ...weight('900'), fontSize: 13 }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[s.filterLabel, { color: th.sub, marginTop: 14, textAlign: align }]}>{L.cat}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ flexDirection: rowDir }}
            >
              <TouchableOpacity
                onPress={() => setCatF('all')}
                style={[
                  s.pill,
                  {
                    backgroundColor: catF === 'all' ? th.primary : th.cardHigh,
                    marginRight: cfg.lang === 'ar' ? 0 : 8,
                    marginLeft: cfg.lang === 'ar' ? 8 : 0,
                  },
                ]}
              >
                <Text style={{ color: catF === 'all' ? th.onPrimary : th.sub, fontSize: 13, ...weight('900') }}>{L.allCats}</Text>
              </TouchableOpacity>
              {cats.map(cat => (
                <TouchableOpacity
                  key={cat.id}
                  onPress={() => setCatF(cat.id)}
                  style={[
                    s.pill,
                    {
                      backgroundColor: catF === cat.id ? `${cat.color}33` : th.cardHigh,
                      borderColor: catF === cat.id ? cat.color : 'transparent',
                      marginRight: cfg.lang === 'ar' ? 0 : 8,
                      marginLeft: cfg.lang === 'ar' ? 8 : 0,
                    },
                  ]}
                >
                  <Ionicons name={cat.icon || 'cube-outline'} size={13} color={catF === cat.id ? cat.color : th.sub} />
                  <Text
                    style={{
                      color: catF === cat.id ? cat.color : th.sub,
                      fontSize: 13,
                      marginLeft: cfg.lang === 'ar' ? 0 : 4,
                      marginRight: cfg.lang === 'ar' ? 4 : 0,
                    }}
                  >
                    {cfg.lang === 'ar' ? cat.label : cat.labelEn}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[s.dateRange, { flexDirection: rowDir }]}>
              <View style={s.dateRangeField}>
                <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.fromDate}</Text>
                <DateField value={dateFrom} onChange={setDateFrom} th={th} lang={cfg.lang} allowEmpty />
              </View>
              <View style={s.dateRangeField}>
                <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{T.toDate}</Text>
                <DateField value={dateTo} onChange={setDateTo} th={th} lang={cfg.lang} allowEmpty />
              </View>
            </View>

            <View style={{ flexDirection: rowDir, gap: 10, marginTop: 20 }}>
              <TouchableOpacity onPress={() => { setTypeF('all'); setCatF('all'); setDateFrom(''); setDateTo(''); }} style={[s.halfBtn, { backgroundColor: th.cardHigh }]}>
                <Text style={{ color: th.sub, ...weight('900') }}>{L.clearFilter}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowFilter(false)} style={[s.halfBtn, { backgroundColor: th.primary }]}>
                <Text style={{ color: th.onPrimary, ...weight('900') }}>{L.applyFilter}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  searchBox: { alignItems: 'center', borderRadius: RADIUS.lg, paddingHorizontal: 13, borderWidth: 1, marginBottom: 10, ...SHADOW.card },
  filterBtn: { borderRadius: RADIUS.lg, paddingHorizontal: 12, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1, gap: 8, ...SHADOW.card },
  inlineCountPill: { minWidth: 28, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  dayBlock: { marginBottom: 6 },
  row: { minHeight: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: RADIUS.lg, borderWidth: 1, marginBottom: 6, gap: 8 },
  rowMain: { flex: 1, alignItems: 'center' },
  rowContent: { flex: 1, marginHorizontal: 10 },
  amountBlock: { minWidth: 92, alignItems: 'flex-end', justifyContent: 'center' },
  iconCell: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  empty: { minHeight: 170, borderRadius: RADIUS.xl, borderWidth: 1, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 18 },
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 36 },
  sheetTitle: { fontSize: TYPE.title, ...weight('900'), textAlign: 'center', marginBottom: 18 },
  filterLabel: { fontSize: 12, ...weight('900'), marginBottom: 10 },
  pills: { flexWrap: 'wrap', gap: 8 },
  pill: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.md, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  halfBtn: { flex: 1, borderRadius: RADIUS.md, padding: 12, alignItems: 'center' },
  dateRange: { gap: 10, marginTop: 14 },
  dateRangeField: { flex: 1 },
});
