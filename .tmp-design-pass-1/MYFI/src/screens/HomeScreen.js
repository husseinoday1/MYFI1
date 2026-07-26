import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Modal, Alert, StyleSheet } from 'react-native';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { buildFinancialSnapshot, getUpcomingRecurring } from '../utils/calc';
import AddTransModal from '../components/AddTransModal';
import { getModules } from '../lib/modules';
import { getDefaultWalletId, getWalletBalances, getWalletLabel, normalizeWallets } from '../lib/wallets';
import { getUpcomingCommitments } from '../lib/commitments';
import { SectionTitle, Touchable } from '../components/AppPrimitives';

const textAlignFor = (lang) => (lang === 'ar' ? 'right' : 'left');
const rowDirFor = (lang) => (lang === 'ar' ? 'row-reverse' : 'row');

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    overview: ar ? 'نظرة عامة' : 'Overview',
    allTransactions: ar ? 'كل المعاملات' : 'All transactions',
    currentMoney: ar ? 'المتبقي بعد الصرف' : 'Left after spending',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    monthEnd: ar ? 'نهاية الشهر' : 'Month end',
    dailyRoom: ar ? 'المتاح يومياً' : 'Daily room',
    afterDebts: ar ? 'بعد المستحقات' : 'After amounts owed',
    debtsLeft: ar ? 'مبالغ متبقية' : 'Amounts left',
    goalsSaved: ar ? 'تقدّم التوفير' : 'Saving progress',
    debtProgress: ar ? 'تقدّم المستحقات' : 'Amounts progress',
    paid: ar ? 'مسدّد' : 'Paid',
    saved: ar ? 'مدّخر' : 'Saved',
    left: ar ? 'متبقي' : 'Left',
    noDebts: ar ? 'لا توجد مبالغ نشطة' : 'No active amounts',
    noGoals: ar ? 'لا توجد خطط توفير نشطة' : 'No active saving plans',
    remaining: ar ? 'متبقي' : 'Remaining',
    over: ar ? 'متجاوز' : 'Over',
    upcoming: ar ? 'متكرر قادم' : 'Upcoming recurring',
    commitments: ar ? 'التزامات قادمة' : 'Upcoming commitments',
    markPaid: ar ? 'تسجيل الدفع' : 'Mark paid',
    reviewRecurring: ar ? 'راجعها قبل الإضافة' : 'Review before adding',
    dueToday: ar ? 'مستحقة اليوم' : 'Due today',
    overdue: ar ? 'متأخرة' : 'Overdue',
    dueIn: ar ? 'بعد' : 'In',
    days: ar ? 'يوم' : 'days',
    transactionType: ar ? 'نوع المعاملة' : 'Transaction type',
    linkedDeleteTitle: ar ? 'معاملة مرتبطة' : 'Linked transaction',
    linkedDeleteBody: ar
      ? 'حذف هذه المعاملة يلغي الحركة من المتابعة المرتبطة بها.'
      : 'Deleting this transaction also updates the linked tracker.',
    emptyTitle: ar ? 'ابدأ بأول معاملة' : 'Start with one entry',
    emptyBody: ar
      ? 'بعد إضافة دخل أو مصروف ستظهر هنا الصورة المالية كاملة.'
      : 'Your financial picture appears here after adding income or expenses.',
    safe: ar ? 'وضعك هذا الشهر مستقر.' : 'This month looks stable.',
    warning: ar ? 'انتبه، الصرف أو المستحقات تحتاج متابعة.' : 'Spending or tracked amounts need attention.',
    danger: ar ? 'المؤشر يقول إن نهاية الشهر قد تكون سالبة.' : 'The month-end forecast may go negative.',
    watch: ar ? 'سجل دخلك حتى تصبح القراءة أدق.' : 'Add income for a clearer reading.',
    neutral: ar ? 'أضف بيانات أكثر حتى تظهر قراءة دقيقة.' : 'Add more data for a useful reading.',
    walletSummary: ar ? 'موزعة على' : 'Across',
    walletsWord: ar ? 'محافظ' : 'wallets',
    hideDetails: ar ? 'إخفاء التفاصيل' : 'Hide details',
    showDetails: ar ? 'تفاصيل المحافظ' : 'Wallet details',
  };
};

export default function HomeScreen() {
  const { trans, debts, goals, wallets, commitments, cats, cfg, deleteTrans, payCommitment } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const C   = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const insets = useSafeAreaInsets();
  const modules = getModules(cfg);

  const [subTab,     setSubTab]     = useState('overview');
  const [search,     setSearch]     = useState('');
  const [typeF,      setTypeF]      = useState('all');
  const [catF,       setCatF]       = useState('all');
  const [showFilter, setShowFilter] = useState(false);
  const [showWalletDetails, setShowWalletDetails] = useState(false);
  const [editing,    setEditing]    = useState(null);
  const [recurringDraft, setRecurringDraft] = useState(null);

  const snapshot = useMemo(
    () => buildFinancialSnapshot({ trans, debts, goals, cats }),
    [trans, debts, goals, cats],
  );
  const upcoming = useMemo(() => getUpcomingRecurring(trans), [trans]);
  const upcomingCommitments = useMemo(
    () => getUpcomingCommitments(commitments),
    [commitments],
  );
  const recent = useMemo(() => [...trans].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 5), [trans]);
  const walletRows = useMemo(
    () => {
      const defaultWalletId = getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId);
      return getWalletBalances(wallets, trans, cfg.currency, defaultWalletId)
        .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0));
    },
    [wallets, trans, cfg.currency, cfg.defaultWalletId],
  );
  const walletMap = useMemo(() => {
    const normalized = normalizeWallets(wallets, cfg.currency);
    return new Map(normalized.map(wallet => [wallet.id, wallet]));
  }, [wallets, cfg.currency]);

  const filtered = useMemo(() => {
    let list = [...trans].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        (t.title || '').toLowerCase().includes(q) ||
        (t.note || '').toLowerCase().includes(q)
      );
    }
    if (typeF === 'inc') list = list.filter(t => Number(t.amt || 0) > 0);
    if (typeF === 'exp') list = list.filter(t => Number(t.amt || 0) < 0);
    if (catF !== 'all')  list = list.filter(t => t.cat === catF);
    return list;
  }, [trans, search, typeF, catF]);

  const fmt = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString();
  const signed = (n) => `${n >= 0 ? '+' : '-'}${fmt(n)} ${sym}`;
  const healthColor = snapshot.health === 'danger'
    ? th.exp
    : snapshot.health === 'warning' || snapshot.health === 'watch'
      ? th.warn
      : th.inc;
  const activeFilters = (typeF !== 'all' ? 1 : 0) + (catF !== 'all' ? 1 : 0);
  const walletTotal = walletRows.reduce((sum, wallet) => sum + Number(wallet.balance || 0), 0);
  const heroBalance = modules.wallets ? walletTotal : snapshot.month.bal;

  const findCat = (catId) => cats.find(c => c.id === catId) || cats.find(c => c.id === 'other') || cats[0] || {};
  const findWallet = (walletId) => walletMap.get(walletId) || walletRows[0];

  const handleRowPress = (t) => {
    if (t.isDebtPayment || t.isGoalSaving || t.isCommitmentPayment) {
      Alert.alert(C.linkedDeleteTitle, C.linkedDeleteBody, [
        { text: L.no, style: 'cancel' },
        { text: L.delete, style: 'destructive', onPress: () => deleteTrans(t.id) },
      ]);
      return;
    }
    setEditing(t);
  };

  const renderProgress = (value, color) => (
    <View style={[s.progressBg, { backgroundColor: th.cardHigh }]}>
      <View style={[s.progressFg, { width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }]} />
    </View>
  );

  const renderRow = (t) => {
    const cat = findCat(t.cat);
    const amount = Number(t.amt || 0);
    const wallet = findWallet(t.walletId);
    const isTransfer = t.kind === 'transfer';
    const fromWallet = findWallet(t.fromWalletId);
    const toWallet = findWallet(t.toWalletId);
    return (
      <Touchable
        key={t.id}
        onPress={() => handleRowPress(t)}
        style={[s.row, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
      >
        <View style={[s.catDot, { backgroundColor: `${isTransfer ? th.primary : (cat.color || th.primary)}22`, borderColor: isTransfer ? th.primary : (cat.color || th.primary) }]}>
          <Ionicons name={isTransfer ? 'swap-horizontal-outline' : (cat.icon || 'cube-outline')} size={18} color={isTransfer ? th.primary : (cat.color || th.primary)} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 10 }}>
          <Text style={{ color: th.text, ...weight('700'), fontSize: 14, textAlign: align }} numberOfLines={1}>
            {isTransfer ? (cfg.lang === 'ar' ? 'تحويل بين المحافظ' : 'Wallet transfer') : t.title}
          </Text>
          <Text style={{ color: th.sub, fontSize: 11, textAlign: align }} numberOfLines={1}>
            {isTransfer
              ? `${getWalletLabel(fromWallet, cfg.lang)} → ${getWalletLabel(toWallet, cfg.lang)} · ${t.dateISO}`
              : `${cfg.lang === 'ar' ? cat.label : cat.labelEn} · ${t.dateISO}${modules.wallets && t.walletId ? ` · ${getWalletLabel(wallet, cfg.lang)}` : ''}${t.recurring ? ' · ↻' : ''}`}
          </Text>
        </View>
        <Text style={{ color: isTransfer ? th.primary : amount > 0 ? th.inc : th.exp, ...weight('900'), fontSize: 15 }}>
          {isTransfer ? fmt(t.transferAmount) : `${amount > 0 ? '+' : '-'}${fmt(amount)}`} {sym}
        </Text>
      </Touchable>
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
      <Touchable
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
          <Text style={{ color: th.sub, fontSize: 11, textAlign: align }} numberOfLines={1}>
            {C.reviewRecurring} · {dueText} · {item.dueISO}
          </Text>
        </View>
        <Text style={{ color: amount > 0 ? th.inc : th.exp, ...weight('900'), fontSize: 15 }}>
          {amount > 0 ? '+' : '-'}{fmt(amount)} {sym}
        </Text>
      </Touchable>
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
          <Text style={{ color: th.sub, fontSize: 11, textAlign: align }} numberOfLines={1}>
            {dueText} · {item.dueISO}{modules.wallets ? ` · ${getWalletLabel(wallet, cfg.lang)}` : ''}
          </Text>
        </View>
        <View style={{ alignItems: cfg.lang === 'ar' ? 'flex-start' : 'flex-end', gap: 6 }}>
          <Text style={{ color: th.exp, ...weight('900'), fontSize: 14 }} numberOfLines={1}>
            -{fmt(item.amt)} {sym}
          </Text>
          <Touchable onPress={() => payCommitment(item.id, item.dueISO)} style={[s.miniAction, { backgroundColor: th.primSoft }]}>
            <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{C.markPaid}</Text>
          </Touchable>
        </View>
      </View>
    );
  };

  const renderMoneyTile = ({ icon, label, value, color, bg }) => (
    <View style={[s.tile, { backgroundColor: bg || th.card, borderColor: th.border }]}>
      <View style={[s.tileIcon, { backgroundColor: `${color}1F` }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <Text style={[s.tileLabel, { color: th.sub, textAlign: align }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.tileValue, { color, textAlign: align }]} numberOfLines={1}>{value}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: th.bg }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 120 }}>
        <View style={[s.hero, { backgroundColor: th.primaryContainer }]}>
          <View style={[s.heroTop, { flexDirection: rowDir }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.heroLabel, { color: th.onPrimaryContainer, textAlign: align }]}>{C.currentMoney}</Text>
              <Text style={[s.heroAmount, { color: th.onPrimaryContainer, textAlign: align }]} numberOfLines={1} adjustsFontSizeToFit>
                {signed(heroBalance)}
              </Text>
            </View>
            <View style={[s.healthPill, { backgroundColor: `${healthColor}22` }]}>
              <Ionicons name="pulse-outline" size={14} color={healthColor} />
              <Text style={{ color: healthColor, fontSize: 11, ...weight('800') }}>
                {snapshot.health === 'danger' ? '!' : snapshot.health === 'safe' ? 'OK' : '...'}
              </Text>
            </View>
          </View>
          <Text style={[s.healthText, { color: th.onPrimaryContainer, textAlign: align }]}>
            {C[snapshot.health] || C.neutral}
          </Text>
          {modules.wallets && walletRows.length > 0 ? (
            <Touchable
              onPress={() => setShowWalletDetails(prev => !prev)}
              style={[s.walletSummary, { backgroundColor: 'rgba(255,255,255,0.12)', flexDirection: rowDir }]}
            >
              <Ionicons name="wallet-outline" size={14} color={th.onPrimaryContainer} />
              <Text style={{ color: th.onPrimaryContainer, fontSize: 12, ...weight('900'), flex: 1, textAlign: align }}>
                {C.walletSummary} {walletRows.length} {C.walletsWord}
              </Text>
              <Text style={{ color: th.onPrimaryContainer, fontSize: 11, ...weight('900') }}>
                {showWalletDetails ? C.hideDetails : C.showDetails}
              </Text>
            </Touchable>
          ) : null}
        </View>

        <View style={s.tileGrid}>
          {renderMoneyTile({
            icon: 'arrow-down-circle-outline',
            label: L.income,
            value: `+${fmt(snapshot.month.inc)} ${sym}`,
            color: th.inc,
          })}
          {renderMoneyTile({
            icon: 'arrow-up-circle-outline',
            label: L.expense,
            value: `-${fmt(snapshot.month.exp)} ${sym}`,
            color: th.exp,
            bg: th.card,
          })}
        </View>

        {modules.wallets && showWalletDetails && walletRows.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {walletRows.map(wallet => (
              <View key={wallet.id} style={[s.walletCard, { backgroundColor: th.card, borderColor: th.border }]}>
                <View style={[s.walletIcon, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="wallet-outline" size={15} color={th.primary} />
                </View>
                <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }} numberOfLines={1}>
                  {getWalletLabel(wallet, cfg.lang)}
                </Text>
                <Text style={{ color: Number(wallet.balance || 0) >= 0 ? th.text : th.exp, fontSize: 15, ...weight('900'), marginTop: 4 }} numberOfLines={1}>
                  {fmt(wallet.balance)} {wallet.currency || sym}
                </Text>
              </View>
            ))}
          </ScrollView>
        )}

        <View style={[s.segment, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
          <Touchable
            onPress={() => setSubTab('overview')}
            style={[s.segBtn, { backgroundColor: subTab === 'overview' ? th.card : 'transparent' }]}
          >
            <Text style={{ color: subTab === 'overview' ? th.primary : th.sub, ...weight('800'), fontSize: 12 }}>
              {C.overview}
            </Text>
          </Touchable>
          <Touchable
            onPress={() => setSubTab('all')}
            style={[s.segBtn, { backgroundColor: subTab === 'all' ? th.card : 'transparent' }]}
          >
            <Text style={{ color: subTab === 'all' ? th.primary : th.sub, ...weight('800'), fontSize: 12 }}>
              {C.allTransactions}
            </Text>
          </Touchable>
        </View>

        {subTab === 'overview' ? (
          <>
            {upcoming.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <SectionTitle th={th} lang={cfg.lang}>{C.upcoming}</SectionTitle>
                {upcoming.slice(0, 4).map(renderRecurringRow)}
              </View>
            )}

            {upcomingCommitments.length > 0 && (
              <View style={{ marginTop: 4 }}>
                <SectionTitle th={th} lang={cfg.lang}>{C.commitments}</SectionTitle>
                {upcomingCommitments.slice(0, 4).map(renderCommitmentRow)}
              </View>
            )}

            <View>
              <SectionTitle th={th} lang={cfg.lang}>{L.recent}</SectionTitle>
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
          </>
        ) : (
          <>
            <View style={[s.searchBox, { backgroundColor: th.input, borderColor: search ? th.primary : th.border, flexDirection: rowDir }]}>
              <Ionicons name="search" size={16} color={th.sub} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={L.searchPlaceholder}
                placeholderTextColor={th.sub}
                style={{ flex: 1, color: th.text, fontSize: 14, paddingVertical: 10, marginHorizontal: 8, textAlign: align }}
              />
              {!!search && (
                <Touchable onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Ionicons name="close-circle" size={16} color={th.sub} />
                </Touchable>
              )}
            </View>

            <Touchable
              onPress={() => setShowFilter(true)}
              style={[s.filterBtn, { backgroundColor: activeFilters ? th.primSoft : th.card, borderColor: activeFilters ? th.primary : th.border, flexDirection: rowDir }]}
            >
              <Ionicons name="options-outline" size={14} color={activeFilters ? th.primary : th.sub} />
              <Text style={{ color: activeFilters ? th.primary : th.sub, ...weight('800'), fontSize: 13 }}>
                {' '}{L.filterTitle} {activeFilters ? `(${activeFilters})` : ''}
              </Text>
            </Touchable>

            <Text style={{ color: th.sub, fontSize: 11, marginVertical: 8, textAlign: align }}>
              {filtered.length} {L.transCount}
            </Text>

            {filtered.length === 0
              ? <Text style={{ color: th.sub, textAlign: 'center', marginTop: 30 }}>{L.noTrans}</Text>
              : filtered.map(renderRow)}
          </>
        )}
      </ScrollView>

      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <AddTransModal visible={!!recurringDraft} onClose={() => setRecurringDraft(null)} draftData={recurringDraft} />

      <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
        <Touchable style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={() => setShowFilter(false)}>
          <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, paddingBottom: 22 + Math.max(insets.bottom, 8) }]}>
            <Text style={[s.sheetTitle, { color: th.text }]}>{L.filterTitle}</Text>

            <Text style={[s.filterLabel, { color: th.sub, textAlign: align }]}>{C.transactionType}</Text>
            <View style={[s.pills, { flexDirection: rowDir }]}>
              {[['all', L.filterAll], ['inc', L.filterInc], ['exp', L.filterExp]].map(([v, lbl]) => (
                <Touchable key={v} onPress={() => setTypeF(v)}
                  style={[s.pill, { backgroundColor: typeF === v ? th.primary : th.cardHigh }]}>
                  <Text style={{ color: typeF === v ? th.onPrimary : th.sub, ...weight('800'), fontSize: 13 }}>{lbl}</Text>
                </Touchable>
              ))}
            </View>

            <Text style={[s.filterLabel, { color: th.sub, marginTop: 14, textAlign: align }]}>{L.cat}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Touchable onPress={() => setCatF('all')}
                style={[s.pill, { backgroundColor: catF === 'all' ? th.primary : th.cardHigh, marginRight: 8 }]}>
                <Text style={{ color: catF === 'all' ? th.onPrimary : th.sub, fontSize: 13 }}>{L.allCats}</Text>
              </Touchable>
              {cats.map(c => (
                <Touchable key={c.id} onPress={() => setCatF(c.id)}
                  style={[s.pill, { backgroundColor: catF === c.id ? `${c.color}33` : th.cardHigh, borderColor: catF === c.id ? c.color : 'transparent', marginRight: 8 }]}>
                  <Ionicons name={c.icon || 'cube-outline'} size={13} color={catF === c.id ? c.color : th.sub} />
                  <Text style={{ color: catF === c.id ? c.color : th.sub, fontSize: 13, marginLeft: 4 }}>
                    {cfg.lang === 'ar' ? c.label : c.labelEn}
                  </Text>
                </Touchable>
              ))}
            </ScrollView>

            <View style={{ flexDirection: rowDir, gap: 10, marginTop: 20 }}>
              <Touchable onPress={() => { setTypeF('all'); setCatF('all'); }}
                style={[s.halfBtn, { backgroundColor: th.cardHigh }]}>
                <Text style={{ color: th.sub, ...weight('800') }}>{L.clearFilter}</Text>
              </Touchable>
              <Touchable onPress={() => setShowFilter(false)}
                style={[s.halfBtn, { backgroundColor: th.primary }]}>
                <Text style={{ color: th.onPrimary, ...weight('900') }}>{L.applyFilter}</Text>
              </Touchable>
            </View>
          </Touchable>
        </Touchable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  hero:         { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 12 },
  heroTop:      { alignItems: 'flex-start', gap: 12 },
  heroLabel:    { fontSize: 12, lineHeight: 17, ...weight('900') },
  heroAmount:   { fontSize: 31, lineHeight: 38, ...weight('900'), marginTop: 6 },
  healthPill:   { minWidth: 54, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  healthText:   { fontSize: 12, marginTop: 12, lineHeight: 19, ...weight('600'), opacity: 0.92 },
  walletSummary:{ alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginTop: 12 },
  tileGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 12 },
  tile:         { width: '48.6%', minHeight: 96, borderRadius: 13, padding: 12, borderWidth: 0.5 },
  tileIcon:     { width: 29, height: 29, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  tileLabel:    { fontSize: 11, lineHeight: 16, ...weight('800') },
  tileValue:    { fontSize: 15, lineHeight: 20, ...weight('900'), marginTop: 5 },
  walletCard:   { minWidth: 138, borderRadius: 13, borderWidth: 0.5, padding: 12, marginRight: 8 },
  walletIcon:   { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  stripLabel:   { fontSize: 11, ...weight('700') },
  stripValue:   { fontSize: 15, ...weight('900'), marginTop: 4 },
  stripDivider: { width: 1 },
  segment:      { borderRadius: 14, padding: 4, marginBottom: 13 },
  segBtn:       { flex: 1, minHeight: 38, paddingVertical: 9, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  progressBg:   { height: 6, borderRadius: 6, overflow: 'hidden', marginTop: 10 },
  progressFg:   { height: 6, borderRadius: 6 },
  sectionTitle: { fontSize: 12, ...weight('900'), marginBottom: 8, marginTop: 4 },
  row:          { alignItems: 'center', padding: 12, borderRadius: 13, borderWidth: 0.5, marginBottom: 8 },
  catDot:       { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  empty:        { alignItems: 'center', padding: 24, borderWidth: 0.5, borderRadius: 14, borderStyle: 'dashed' },
  searchBox:    { alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, marginBottom: 10 },
  filterBtn:    { borderRadius: 12, padding: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  overlay:      { flex: 1, justifyContent: 'flex-end' },
  sheet:        { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 },
  sheetTitle:   { fontSize: 18, ...weight('900'), textAlign: 'center', marginBottom: 18 },
  filterLabel:  { fontSize: 12, ...weight('900'), marginBottom: 10 },
  pills:        { gap: 8 },
  pill:         { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  miniAction:   { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  halfBtn:      { flex: 1, borderRadius: 12, padding: 12, alignItems: 'center' },
});
