import React, { useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope, filterFeatureEntities, getTransactionDisplayAmount, transactionFeatureEnabled } from '../lib/modules';
import { isCurrentMonthTransaction } from '../lib/transactionAccess';
import { formatCommitmentMonth, getUpcomingCommitments } from '../lib/commitments';
import { getUpcomingRecurring } from '../utils/calc';

const text = (lang) => {
  const ar = lang === 'ar';
  return {
    profile: ar ? 'الحساب والبيانات' : 'Account & data',
    search: ar ? 'بحث شامل' : 'Universal search',
    review: ar ? 'مراجعة الإدخالات الذكية' : 'Smart entry review',
    calendar: ar ? 'الاستحقاقات' : 'Due dates',
    guest: ar ? 'استخدام محلي' : 'Local use',
    signed: ar ? 'حساب متصل' : 'Connected account',
    sync: ar ? 'مزامنة الآن' : 'Sync now',
    syncing: ar ? 'جاري المزامنة…' : 'Syncing…',
    synced: ar ? 'البيانات متزامنة' : 'Data is synced',
    local: ar ? 'محفوظة محلياً' : 'Saved locally',
    pending: ar ? 'تغييرات تنتظر المزامنة' : 'Changes waiting to sync',
    conflict: ar ? 'يوجد تعارض يحتاج حلاً' : 'A conflict needs attention',
    offline: ar ? 'غير متصل — بياناتك المحلية آمنة' : 'Offline — local data is safe',
    settings: ar ? 'فتح الإعدادات والنسخ الاحتياطي' : 'Settings & backup',
    noResults: ar ? 'لا توجد نتائج مطابقة' : 'No matching results',
    searchHint: ar ? 'ابحث بالاسم، التصنيف، التاريخ أو المبلغ' : 'Search name, category, date, or amount',
    noSmart: ar ? 'لا توجد إدخالات ذكية تحتاج مراجعة' : 'No smart entries need review',
    reviewed: ar ? 'تمت المراجعة' : 'Reviewed',
    needsReview: ar ? 'تحتاج مراجعة' : 'Needs review',
    edit: ar ? 'مراجعة وتعديل' : 'Review & edit',
    emptyDue: ar ? 'لا توجد استحقاقات قادمة' : 'No upcoming due dates',
    commitment: ar ? 'التزام' : 'Commitment',
    recurring: ar ? 'متكرر' : 'Recurring',
    transaction: ar ? 'حركة' : 'Transaction',
    debt: ar ? 'دين عليّ' : 'Debt I owe',
    receivable: ar ? 'دين لي' : 'Debt owed to me',
    goal: ar ? 'هدف' : 'Goal',
    today: ar ? 'اليوم' : 'Today',
    overdue: ar ? 'متأخر' : 'Overdue',
    days: ar ? 'يوم' : 'days',
    lastSync: ar ? 'آخر مزامنة' : 'Last sync',
    never: ar ? 'لم تتم بعد' : 'Not yet',
    cancel: ar ? 'إلغاء' : 'Cancel',
    vaultUnreadableDetails: ar ? 'تعذرت قراءة بياناتك المحلية بأمان. أعد المحاولة أو ابدأ من جديد.' : 'Unable to securely read your local data. Retry or start fresh.',
    retryRead: ar ? 'إعادة المحاولة' : 'Retry',
    startFresh: ar ? 'ابدأ من جديد' : 'Start fresh',
    startFreshWarning: ar ? 'سيُمسح القبو الآمن الحالي وتُعاد إعدادات التطبيق كجديد.' : 'This clears the current secure vault and resets local data.',
  };
};

export default function HomeCenterModal({ visible, mode = 'profile', onClose, onMode, onOpenTab, onEditTransaction, onOpenTransactionDetails }) {
  const {
    trans, debts, goals, commitments, cats, cfg, user, syncing, online, dirty,
    lastSyncedAt, lastSyncError, syncConflict, vaultRecovery, syncCloud, editTrans,
    retryLoadLocal, clearAndResetVault,
  } = useStore();
  const [query, setQuery] = useState('');
  const th = TH[cfg.theme] || TH.dark;
  const L = text(cfg.lang);
  const ar = cfg.lang === 'ar';
  const dir = ar ? 'row-reverse' : 'row';
  const align = ar ? 'right' : 'left';
  const insets = useSafeAreaInsets();
  const sym = getSymbol(cfg.currency);
  const fmt = value => formatMoneyNumber(value, cfg.currency, cfg.lang);

  const scopedTrans = filterByActiveScope(trans, cfg).filter(item => transactionFeatureEnabled(item, cfg));
  const scopedEntities = filterFeatureEntities({ debts, goals, commitments, cfg });
  const smartItems = useMemo(
    () => scopedTrans.filter(item => item.smartSource).sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 30),
    [trans, cfg.activeScope, cfg.profileType],
  );
  const dueItems = useMemo(() => {
    const commitmentRows = getUpcomingCommitments(scopedEntities.commitments).map(item => ({
      ...item, resultType: 'commitment', resultTitle: item.name, resultAmount: -Number(item.amt || 0),
    }));
    const recurringRows = getUpcomingRecurring(scopedTrans).map(item => ({
      ...item, resultType: 'recurring', resultTitle: item.title, resultAmount: Number(item.amt || 0),
    }));
    return [...commitmentRows, ...recurringRows].sort((a, b) => String(a.dueISO).localeCompare(String(b.dueISO))).slice(0, 30);
  }, [trans, commitments, cfg.activeScope, cfg.profileType]);

  const searchRows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    if (!q) return [];
    const catName = id => {
      const cat = cats.find(item => item.id === id);
      return ar ? cat?.label : cat?.labelEn;
    };
    const rows = [
      ...scopedTrans.map(item => ({
        ...item,
        resultType: 'transaction',
        resultTitle: item.title,
        resultSub: `${catName(item.cat) || ''} ${item.dateISO || ''}`,
        resultAmount: getTransactionDisplayAmount(item),
      })),
      ...scopedEntities.debts.map(item => ({
        ...item,
        resultType: item.direction === 'receivable' ? 'receivable' : 'debt',
        resultTitle: item.name,
        resultSub: item.due || item.createdAt || '',
        resultAmount: Math.max(0, Number(item.total || 0) - Number(item.paid || 0)),
      })),
      ...scopedEntities.goals.map(item => ({
        ...item, resultType: 'goal', resultTitle: item.name, resultSub: item.due || '',
        resultAmount: Math.max(0, Number(item.target || 0) - Number(item.cur || 0)),
      })),
      ...scopedEntities.commitments.map(item => ({
        ...item, resultType: 'commitment', resultTitle: item.name, resultSub: item.firstDueISO || '',
        resultAmount: Number(item.amt || 0),
      })),
    ];
    return rows.filter(item => (
      `${item.resultTitle || ''} ${item.resultSub || ''} ${item.resultAmount || ''}`.toLocaleLowerCase().includes(q)
    )).slice(0, 40);
  }, [query, trans, debts, goals, commitments, cats, cfg.activeScope, cfg.profileType, cfg.lang]);

  const iconFor = type => ({
    transaction: 'receipt-outline', debt: 'card-outline', receivable: 'arrow-down-circle-outline',
    goal: 'flag-outline', commitment: 'calendar-outline', recurring: 'repeat-outline',
  }[type] || 'ellipse-outline');
  const labelFor = type => L[type] || type;
  const dueLabel = days => days < 0 ? `${L.overdue} ${Math.abs(days)} ${L.days}` : days === 0 ? L.today : `${days} ${L.days}`;

  const openResult = async item => {
    if (item.resultType === 'transaction') {
      onClose?.();
      if (isCurrentMonthTransaction(item)) onEditTransaction?.(item);
      else onOpenTransactionDetails?.(item);
      return;
    }
    onClose?.();
    onOpenTab?.('trackers');
  };
  const reviewSmart = async item => {
    if (!item.smartReviewedAt) await editTrans(item.id, { smartReviewedAt: new Date().toISOString() });
    onClose?.();
    const reviewedItem = { ...item, smartReviewedAt: item.smartReviewedAt || new Date().toISOString() };
    if (isCurrentMonthTransaction(reviewedItem)) onEditTransaction?.(reviewedItem);
    else onOpenTransactionDetails?.(reviewedItem);
  };

  const renderRow = (item, kind = 'search') => {
    const reviewed = !!item.smartReviewedAt;
    const type = item.resultType || 'transaction';
    const title = item.resultTitle || item.title;
    const amount = item.resultAmount ?? item.amt;
    const onPress = kind === 'review' ? () => reviewSmart(item) : kind === 'calendar'
      ? () => { onClose?.(); onOpenTab?.(type === 'recurring' ? 'history' : 'trackers'); }
      : () => openResult(item);
    return (
      <TouchableOpacity key={`${type}-${item.id}-${item.dueISO || ''}`} onPress={onPress} style={[s.row, { borderColor: th.border, backgroundColor: th.cardHigh, flexDirection: dir }]}>
        <View style={[s.rowIcon, { backgroundColor: th.primSoft }]}>
          <Ionicons name={kind === 'review' ? (reviewed ? 'checkmark-circle-outline' : 'sparkles-outline') : iconFor(type)} size={18} color={reviewed ? th.inc : th.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={[s.rowTitle, { color: th.text, textAlign: align }]}>{title}</Text>
          <Text numberOfLines={1} style={[s.rowSub, { color: th.sub, textAlign: align }]}>
            {kind === 'review' ? (reviewed ? L.reviewed : L.needsReview) : kind === 'calendar'
              ? (type === 'commitment'
                ? `${labelFor(type)} · ${formatCommitmentMonth(item.dueISO, cfg.lang)}`
                : `${labelFor(type)} · ${item.dueISO} · ${dueLabel(Number(item.daysUntil || 0))}`)
              : `${labelFor(type)}${item.resultSub ? ` · ${item.resultSub}` : ''}`}
          </Text>
        </View>
        {Number.isFinite(Number(amount)) ? (
          <Text style={[s.amount, { color: Number(amount) < 0 ? th.exp : th.text }]}>{fmt(Math.abs(Number(amount)))} {sym}</Text>
        ) : null}
        <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={15} color={th.faint} />
      </TouchableOpacity>
    );
  };

  const profileName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email || L.guest;
  const conflictCount = Number(syncConflict?.total || syncConflict?.items?.length || 0);
  const conflictLabel = syncConflict?.type === 'merged_changes'
    ? (ar ? 'تم دمج تغييرات جهازين' : 'Changes from two devices were merged')
    : L.conflict;
  const syncText = lastSyncError === 'vault_unreadable'
    ? L.vaultUnreadable
    : syncConflict ? `${conflictLabel}${conflictCount ? ` (${conflictCount})` : ''}` : !online ? L.offline : dirty ? L.pending : user ? L.synced : L.local;
  const modeTitle = L[mode] || L.profile;

  const handleRetryVault = async () => {
    await retryLoadLocal();
  };

  const confirmResetVault = () => {
    Alert.alert(
      L.startFresh,
      L.startFreshWarning,
      [
        { text: L.cancel, style: 'cancel' },
        { text: L.startFresh, style: 'destructive', onPress: async () => { await clearAndResetVault(); } },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: th.card, paddingBottom: 14 + Math.max(insets.bottom, 8) }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />
          <View style={[s.header, { flexDirection: dir }]}>
            <View style={[s.titleIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name={mode === 'search' ? 'search-outline' : mode === 'calendar' ? 'calendar-outline' : mode === 'review' ? 'sparkles-outline' : 'person-outline'} size={19} color={th.primary} />
            </View>
            <Text style={[s.title, { color: th.text, textAlign: align }]}>{modeTitle}</Text>
          </View>

          {mode === 'profile' ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              <View style={[s.account, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <View style={[s.avatar, { backgroundColor: th.primSoft }]}><Ionicons name="person" size={25} color={th.primary} /></View>
                <Text style={[s.accountName, { color: th.text }]} numberOfLines={1}>{profileName}</Text>
                <Text style={{ color: th.sub, fontSize: 12 }}>{user ? L.signed : L.guest}</Text>
              </View>
              <View style={[s.status, { borderColor: syncConflict || lastSyncError ? th.warn : th.border, backgroundColor: th.cardHigh, flexDirection: dir }]}>
                <Ionicons name={syncConflict || lastSyncError ? 'warning-outline' : online ? 'cloud-done-outline' : 'cloud-offline-outline'} size={20} color={syncConflict || lastSyncError ? th.warn : th.inc} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontWeight: '900', textAlign: align }}>{syncText}</Text>
                  <Text style={{ color: th.sub, fontSize: 12, marginTop: 3, textAlign: align }}>
                    {L.lastSync}: {lastSyncedAt ? new Date(lastSyncedAt).toLocaleString(ar ? 'ar-IQ' : 'en') : L.never}
                  </Text>
                  {vaultRecovery ? (
                    <Text style={{ color: th.warn, fontSize: 11, marginTop: 4, textAlign: align }}>
                      {ar ? `تم الاسترداد من النسخة المحلية الاحتياطية رقم ${vaultRecovery.backupIndex || 1}` : `Recovered from local backup #${vaultRecovery.backupIndex || 1}`}
                    </Text>
                  ) : null}
                </View>
              </View>
              {lastSyncError === 'vault_unreadable' ? (
                <View style={[s.recoveryBlock, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                  <Text style={[s.recoveryText, { color: th.sub, textAlign: align }]}>{L.vaultUnreadableDetails}</Text>
                  <View style={[s.recoveryActions, { flexDirection: dir }]}>
                    <TouchableOpacity onPress={handleRetryVault} style={[s.recoveryButton, { backgroundColor: th.primary }]}>
                      <Text style={{ color: th.onPrimary, fontWeight: '900' }}>{L.retryRead}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={confirmResetVault} style={[s.recoveryButton, { borderColor: th.warn, backgroundColor: th.cardHigh }]}>
                      <Text style={{ color: th.warn, fontWeight: '900' }}>{L.startFresh}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
              <View style={[s.actions, { flexDirection: dir }]}>
                <TouchableOpacity disabled={!user || syncing} onPress={syncCloud} style={[s.primaryAction, { backgroundColor: th.primary, opacity: !user ? 0.45 : 1 }]}>
                  <Ionicons name="sync-outline" size={17} color={th.onPrimary} />
                  <Text style={{ color: th.onPrimary, fontWeight: '900' }}>{syncing ? L.syncing : L.sync}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onMode?.('review')} style={[s.secondaryAction, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                  <Ionicons name="sparkles-outline" size={17} color={th.primary} />
                  <Text style={{ color: th.text, fontWeight: '900' }}>{L.review} ({smartItems.filter(item => !item.smartReviewedAt).length})</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => { onClose?.(); onOpenTab?.('settings'); }} style={[s.settings, { borderColor: th.border, flexDirection: dir }]}>
                <Ionicons name="shield-checkmark-outline" size={19} color={th.primary} />
                <Text style={{ flex: 1, color: th.text, fontWeight: '900', textAlign: align }}>{L.settings}</Text>
                <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={17} color={th.faint} />
              </TouchableOpacity>
            </ScrollView>
          ) : null}

          {mode === 'search' ? (
            <>
              <View style={[s.searchBox, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: dir }]}>
                <Ionicons name="search-outline" size={18} color={th.faint} />
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  autoFocus
                  placeholder={L.searchHint}
                  placeholderTextColor={th.faint}
                  style={{ flex: 1, color: th.text, textAlign: align, writingDirection: ar ? 'rtl' : 'ltr', paddingVertical: 0 }}
                />
                {query ? <TouchableOpacity onPress={() => setQuery('')}><Ionicons name="backspace-outline" size={17} color={th.faint} /></TouchableOpacity> : null}
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} nestedScrollEnabled>
                {query && searchRows.length === 0 ? <Text style={[s.empty, { color: th.sub }]}>{L.noResults}</Text> : searchRows.map(item => renderRow(item))}
              </ScrollView>
            </>
          ) : null}

          {mode === 'review' ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {smartItems.length === 0 ? <Text style={[s.empty, { color: th.sub }]}>{L.noSmart}</Text> : smartItems.map(item => renderRow(item, 'review'))}
            </ScrollView>
          ) : null}

          {mode === 'calendar' ? (
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {dueItems.length === 0 ? <Text style={[s.empty, { color: th.sub }]}>{L.emptyDue}</Text> : dueItems.map(item => renderRow(item, 'calendar'))}
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 18, paddingTop: 11, maxHeight: '84%', minHeight: '48%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 17 },
  header: { alignItems: 'center', gap: 10, marginBottom: 14 },
  titleIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  account: { borderWidth: 1, borderRadius: 16, alignItems: 'center', padding: 18, marginBottom: 10 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 9 },
  accountName: { fontSize: 16, fontWeight: '900', marginBottom: 4, maxWidth: '90%' },
  status: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 10, alignItems: 'center', marginBottom: 10 },
  actions: { gap: 8, marginBottom: 10 },
  primaryAction: { minHeight: 46, borderRadius: 13, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 10 },
  secondaryAction: { minHeight: 46, borderRadius: 13, borderWidth: 1, flex: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 8 },
  settings: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 13 },
  recoveryBlock: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginBottom: 10 },
  recoveryText: { fontSize: 12, lineHeight: 18 },
  recoveryActions: { gap: 8, marginTop: 10 },
  recoveryButton: { flex: 1, minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1 },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 14, alignItems: 'center', gap: 9, paddingHorizontal: 12, marginBottom: 12 },
  row: { minHeight: 62, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 9, padding: 10, marginBottom: 7 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900' },
  rowSub: { fontSize: 11, lineHeight: 17, marginTop: 3 },
  amount: { fontSize: 12, fontWeight: '900', maxWidth: 90 },
  empty: { textAlign: 'center', paddingVertical: 36, fontSize: 13, lineHeight: 20 },
});
