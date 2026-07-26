import React, { useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { calcStats, catSpend } from '../utils/calc';
import { generateMonthPDF } from '../lib/pdf';
import { shareCsv } from '../lib/csv';
import { weight } from '../lib/tokens';
import AddTransModal from '../components/AddTransModal';
import ActionMenu from '../components/ActionMenu';
import { describeSmartSource } from '../lib/smartEntry';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { exportMyfiPackage, pickMyfiPackage, unlockMyfiPackage } from '../lib/myfiFiles';
import { filterByActiveScope, getActiveScope, transactionFeatureEnabled } from '../lib/modules';

export default function ArchiveScreen() {
  const {
    trans, cats, wallets, cfg, deleteTrans, deleteTransMany,
    buildYearArchive, commitYearArchive,
  } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const isAr = cfg.lang === 'ar';
  const sym = getSymbol(cfg.currency);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [loadedArchive, setLoadedArchive] = useState(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [lockedPackage, setLockedPackage] = useState(null);
  const [archivePasswordMode, setArchivePasswordMode] = useState(null);
  const [archivePassword, setArchivePassword] = useState('');
  const [pendingArchiveYear, setPendingArchiveYear] = useState(null);
  const now = new Date();
  const align = isAr ? 'right' : 'left';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const displayTrans = (
    loadedArchive?.payload?.data?.trans
    || filterByActiveScope(trans, cfg)
  ).filter(item => transactionFeatureEnabled(item, cfg));
  const displayCats = loadedArchive?.payload?.data?.cats || cats;
  const displayWallets = loadedArchive?.payload?.data?.wallets || wallets;
  const readOnly = !!loadedArchive;
  const activeArchiveScope = getActiveScope(cfg);

  const copy = {
    search: isAr ? 'بحث في الأرشيف...' : 'Search archive...',
    exportCsv: isAr ? 'تصدير CSV' : 'Export CSV',
    noResults: isAr ? 'لا توجد نتائج بهذا البحث' : 'No archive results',
    linkedTitle: isAr ? 'معاملة مرتبطة' : 'Linked transaction',
    linkedBody: isAr
      ? 'هذه المعاملة مرتبطة بمتابعة. حذفها يحدّث الدفعة والأرقام المرتبطة.'
      : 'This transaction is linked to a tracker. Deleting it updates the linked payment and totals.',
    transfer: isAr ? 'تحويل بين المحافظ' : 'Wallet transfer',
    select: isAr ? 'تحديد' : 'Select',
  };

  const months = useMemo(() => {
    const map = {};
    displayTrans.forEach(t => {
      if (!t.dateISO) return;
      const d = new Date(`${t.dateISO}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map[key]) map[key] = { key, year: d.getFullYear(), month: d.getMonth(), trans: [] };
      map[key].trans.push(t);
    });
    return Object.values(map).sort((a, b) => b.year - a.year || b.month - a.month);
  }, [displayTrans]);

  const filteredMonths = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return months;
    return months
      .map(month => {
        const name = `${L.months[month.month]} ${month.year}`.toLowerCase();
        const filteredTrans = month.trans.filter(t => {
          const cat = displayCats.find(c => c.id === t.cat);
          const hay = [
            t.title,
            t.note,
            t.dateISO,
            cat?.label,
            cat?.labelEn,
            name,
          ].join(' ').toLowerCase();
          return hay.includes(q);
        });
        return name.includes(q) ? month : { ...month, trans: filteredTrans };
      })
      .filter(month => month.trans.length > 0);
  }, [months, search, displayCats, L.months]);
  const filteredTransactionIds = useMemo(
    () => filteredMonths.flatMap(month => month.trans.map(item => item.id)),
    [filteredMonths],
  );
  const selection = useMultiSelect(filteredTransactionIds);

  const yearNet = useMemo(() => {
    const yTrans = displayTrans.filter(t => t.dateISO && new Date(`${t.dateISO}T12:00:00`).getFullYear() === now.getFullYear());
    return calcStats(yTrans);
  }, [displayTrans, now]);

  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);
  const isLinkedTransaction = (t) => t.isDebtPayment || t.isGoalSaving || t.isCommitmentPayment;
  const eligibleYears = useMemo(() => [...new Set(
    displayTrans
      .map(item => item.dateISO ? new Date(`${item.dateISO}T12:00:00`).getFullYear() : null)
      .filter(year => Number.isInteger(year) && year < now.getFullYear()),
  )].sort((a, b) => b - a), [displayTrans, now]);

  const exportCsv = () => {
    shareCsv({ trans: displayTrans, cats: displayCats, wallets: displayWallets, cfg, name: 'myfi_archive' });
  };

  const openArchiveFile = async () => {
    if (fileBusy) return;
    setFileBusy(true);
    try {
      const picked = await pickMyfiPackage({ kind: 'year_archive' });
      if (picked?.passwordRequired) {
        setLockedPackage(picked);
        setArchivePassword('');
        setArchivePasswordMode('import');
      } else if (picked) {
        setLoadedArchive(picked);
        setExpanded(null);
        setSearch('');
      }
    } catch (error) {
      Alert.alert(isAr ? 'تعذر فتح الأرشيف' : 'Could not open archive', error?.message || '');
    } finally {
      setFileBusy(false);
    }
  };

  const performArchiveYear = async (year, password = '') => {
    if (fileBusy) return;
    const data = buildYearArchive(year);
    if (!data) return;
    setFileBusy(true);
    try {
      const exported = await exportMyfiPackage({
        kind: 'year_archive',
        data,
        year,
        label: 'MYFI',
        password,
      });
      Alert.alert(
        isAr ? `تأكيد أرشفة ${year}` : `Confirm ${year} archive`,
        isAr
          ? 'بعد التأكد من حفظ ملف ZIP، يمكن إخراج حركات هذه السنة من ذاكرة التطبيق. ستبقى الملخصات والأرصدة صحيحة.'
          : 'After confirming the ZIP file was saved, the year can be removed from active storage. Summaries and balances remain correct.',
        [
          { text: isAr ? 'ليس الآن' : 'Not now', style: 'cancel' },
          {
            text: isAr ? 'تم الحفظ، أرشف الآن' : 'Saved, archive now',
            onPress: async () => {
              const ok = await commitYearArchive(year, exported.checksum, activeArchiveScope);
              Alert.alert('', ok
                ? (isAr ? 'تمت الأرشفة بنجاح' : 'Archive completed')
                : (isAr ? 'تعذرت الأرشفة' : 'Archive failed'));
            },
          },
        ],
      );
    } catch (error) {
      Alert.alert(isAr ? 'تعذر إنشاء الأرشيف' : 'Could not create archive', error?.message || '');
    } finally {
      setFileBusy(false);
    }
  };

  const archiveYear = (year) => {
    Alert.alert(
      isAr ? 'حماية ملف الأرشيف' : 'Protect archive file',
      isAr
        ? 'يمكنك تشفير الملف بكلمة مرور قبل إخراجه من التطبيق.'
        : 'You can encrypt the file with a password before it leaves the app.',
      [
        {
          text: isAr ? 'بدون كلمة مرور' : 'Without password',
          style: 'destructive',
          onPress: () => performArchiveYear(year, ''),
        },
        {
          text: isAr ? 'تشفير بكلمة مرور' : 'Encrypt with password',
          onPress: () => {
            setPendingArchiveYear(year);
            setArchivePassword('');
            setArchivePasswordMode('export');
          },
        },
      ],
    );
  };

  const submitArchivePassword = async () => {
    if (archivePasswordMode === 'export') {
      if (archivePassword.length < 6) {
        Alert.alert('', isAr ? 'اكتب كلمة مرور من 6 أحرف على الأقل.' : 'Use at least 6 characters.');
        return;
      }
      const year = pendingArchiveYear;
      const password = archivePassword;
      setArchivePasswordMode(null);
      setArchivePassword('');
      setPendingArchiveYear(null);
      await performArchiveYear(year, password);
      return;
    }
    if (archivePasswordMode === 'import' && lockedPackage) {
      setFileBusy(true);
      try {
        const unlocked = await unlockMyfiPackage(lockedPackage, archivePassword, 'year_archive');
        setLoadedArchive(unlocked);
        setLockedPackage(null);
        setArchivePasswordMode(null);
        setArchivePassword('');
        setExpanded(null);
        setSearch('');
      } catch (error) {
        Alert.alert('', error?.message || (isAr ? 'تعذر فتح الملف' : 'Could not unlock file'));
      } finally {
        setFileBusy(false);
      }
    }
  };

  const confirmDeleteTransaction = (t) => {
    if (readOnly) return;
    const linked = isLinkedTransaction(t);
    Alert.alert(linked ? copy.linkedTitle : L.delete, linked ? copy.linkedBody : L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteTrans(t.id) },
    ]);
  };

  const confirmDeleteSelected = () => {
    if (readOnly) return;
    if (!selection.selectedCount) return;
    const linked = trans.some(item => (
      selection.selected.has(item.id) && isLinkedTransaction(item)
    ));
    const body = isAr
      ? `سيتم حذف ${selection.selectedCount} حركة من السجل نهائياً${linked ? ' وتحديث العناصر المرتبطة بها.' : '.'}`
      : `Delete ${selection.selectedCount} archived transactions permanently${linked ? ' and update linked items.' : '?'}`;
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

  const renderHeader = () => (
    <View>
      <View style={[s.fileActions, { flexDirection: rowDir }]}>
        <TouchableOpacity
          onPress={openArchiveFile}
          disabled={fileBusy}
          style={[s.fileBtn, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}
        >
          <Ionicons name="folder-open-outline" size={16} color={th.primary} />
          <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>
            {fileBusy ? (isAr ? 'جاري الفحص...' : 'Validating...') : (isAr ? 'فتح ملف أرشيف' : 'Open archive file')}
          </Text>
        </TouchableOpacity>
        {readOnly ? (
          <TouchableOpacity
            onPress={() => setLoadedArchive(null)}
            style={[s.fileBtn, { backgroundColor: th.expBg, borderColor: th.expBg, flexDirection: rowDir }]}
          >
            <Ionicons name="close-outline" size={16} color={th.exp} />
            <Text style={{ color: th.exp, fontSize: 12, ...weight('900') }}>{isAr ? 'إغلاق الملف' : 'Close file'}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {readOnly ? (
        <View style={[s.loadedBanner, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
          <Text style={{ color: th.primary, fontSize: 12, ...weight('900'), textAlign: align }}>
            {isAr ? `ملف أرشيف للقراءة فقط: ${loadedArchive?.name || ''}` : `Read-only archive: ${loadedArchive?.name || ''}`}
          </Text>
        </View>
      ) : eligibleYears.length ? (
        <View style={[s.archiveYears, { backgroundColor: th.card, borderColor: th.border }]}>
          <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: align }}>
            {isAr ? 'أرشفة سنة مكتملة' : 'Archive a completed year'}
          </Text>
          <View style={[s.yearRail, { flexDirection: rowDir }]}>
            {eligibleYears.map(year => (
              <TouchableOpacity
                key={year}
                onPress={() => archiveYear(year)}
                disabled={fileBusy}
                style={[s.yearBtn, { backgroundColor: th.primSoft, borderColor: th.primary }]}
              >
                <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{year}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      {!readOnly && (cfg.archiveSummaries || []).filter(item => (
        activeArchiveScope === 'all'
        || (item.scope || 'personal') === activeArchiveScope
      )).length ? (
        <View style={[s.archiveYears, { backgroundColor: th.card, borderColor: th.border }]}>
          <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: align }}>
            {isAr ? 'سنوات مؤرشفة خارج الجهاز' : 'Years archived externally'}
          </Text>
          {(cfg.archiveSummaries || []).filter(item => (
            activeArchiveScope === 'all'
            || (item.scope || 'personal') === activeArchiveScope
          )).map(item => (
            <View key={`${item.year}:${item.scope || 'personal'}`} style={[s.summaryRow, { flexDirection: rowDir, borderTopColor: th.border }]}>
              <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{item.year}</Text>
              <Text style={{ color: th.sub, fontSize: 12 }}>{item.count} {isAr ? 'حركة' : 'entries'}</Text>
              <Text style={{ color: Number(item.net || 0) >= 0 ? th.inc : th.exp, fontSize: 12, ...weight('900') }}>
                {Number(item.net || 0) >= 0 ? '+' : '-'}{fmt(item.net)} {sym}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!readOnly ? <MultiSelectBar
        th={th}
        lang={cfg.lang}
        active={selection.selecting}
        count={selection.selectedCount}
        total={filteredTransactionIds.length}
        allSelected={selection.allSelected}
        onStart={selection.start}
        onToggleAll={selection.toggleAll}
        onDelete={confirmDeleteSelected}
        onCancel={selection.cancel}
      /> : null}
      <View style={[s.searchBox, { backgroundColor: th.input, borderColor: search ? th.primary : th.border, flexDirection: rowDir }]}>
        <Ionicons name="search" size={16} color={th.sub} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={copy.search}
          placeholderTextColor={th.sub}
          style={{ flex: 1, color: th.text, fontSize: 14, ...weight('800'), paddingVertical: 10, marginHorizontal: 8, textAlign: align }}
        />
        {!!search && (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={16} color={th.sub} />
          </TouchableOpacity>
        )}
      </View>

      {!readOnly && months.length > 0 && (
        <View style={[s.card, { backgroundColor: th.primSoft, borderColor: `${th.primary}33`, marginBottom: 12 }]}>
          <Text style={[s.label, { color: th.primary, textAlign: align }]}>{L.yearNetSoFar} - {now.getFullYear()}</Text>
          <View style={[s.actionLine, { flexDirection: rowDir }]}>
            <Text style={{ color: yearNet.bal >= 0 ? th.inc : th.exp, fontSize: 22, lineHeight: 30, ...weight('900'), flex: 1, textAlign: align }}>
              {yearNet.bal >= 0 ? '+' : '-'}{fmt(yearNet.bal)} {sym}
            </Text>
            <TouchableOpacity onPress={exportCsv} style={[s.csvBtn, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}>
              <Ionicons name="download-outline" size={14} color={th.primary} />
              <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{copy.exportCsv}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );

  const renderTransaction = (t) => {
    const cat = displayCats.find(c => c.id === t.cat) || displayCats.find(c => c.id === 'other') || displayCats[0] || {};
    const amount = t.kind === 'transfer' ? Number(t.transferAmount || 0) : Number(t.amt || 0);
    const color = t.kind === 'transfer' ? th.primary : amount > 0 ? th.inc : th.exp;
    const linked = isLinkedTransaction(t);
    const title = t.kind === 'transfer' ? copy.transfer : t.title;
    const smartBadge = t.kind !== 'transfer' ? describeSmartSource(t.smartSource, cfg.lang) : null;
    const smartTone = t.smartSource?.mode === 'voice' ? th.warn : t.smartSource?.mode === 'receipt' ? th.primary : th.inc;

    return (
      <Pressable
        key={t.id}
        onLongPress={() => { if (!readOnly) selection.toggle(t.id); }}
        onPress={() => {
          if (selection.selecting) selection.toggle(t.id);
        }}
        style={[
          s.txRow,
          {
            backgroundColor: selection.selected.has(t.id) ? th.primSoft : 'transparent',
            borderTopColor: th.border,
            flexDirection: rowDir,
          },
        ]}
      >
        <View style={[s.txMain, { flexDirection: rowDir }]}>
          <View style={{ flex: 1 }}>
            <View style={[s.titleRow, { flexDirection: rowDir }]}>
              <Text style={{ color: th.text, fontSize: 13, ...weight('800'), textAlign: align, flex: 1 }} numberOfLines={1}>
                {title}
              </Text>
              {smartBadge ? (
                <View style={[s.smartBadge, { backgroundColor: `${smartTone}18`, borderColor: `${smartTone}36`, flexDirection: rowDir }]}>
                  <Ionicons name={smartBadge.icon} size={11} color={smartTone} />
                  <Text style={{ color: smartTone, fontSize: 11, ...weight('900') }}>{smartBadge.label}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: align }} numberOfLines={2}>
              {isAr ? cat.label : cat.labelEn} - {t.dateISO}
            </Text>
          </View>
          <Text style={{ color, ...weight('900'), fontSize: 13 }}>
            {t.kind === 'transfer' ? '' : amount > 0 ? '+' : '-'}{fmt(amount)} {sym}
          </Text>
        </View>
        {readOnly ? null : selection.selecting ? (
          <SelectionCheckbox th={th} selected={selection.selected.has(t.id)} onPress={() => selection.toggle(t.id)} />
        ) : (
          <ActionMenu
            th={th}
            lang={cfg.lang}
            title={title}
            buttonStyle={{ backgroundColor: th.input, width: 32, height: 32, borderRadius: 10 }}
            items={[
              { label: copy.select, icon: 'checkmark-circle-outline', color: th.primary, onPress: () => selection.toggle(t.id) },
              !linked ? { label: L.editTrans, icon: 'create-outline', color: th.primary, onPress: () => setEditing(t) } : null,
              { label: L.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteTransaction(t) },
            ]}
          />
        )}
      </Pressable>
    );
  };

  const renderMonth = ({ item: m }) => {
    const isCurrent = m.month === now.getMonth() && m.year === now.getFullYear();
    const stats = calcStats(m.trans);
    const top = catSpend(m.trans, displayCats).sort((a, b) => b.spent - a.spent).slice(0, 3);
    const open = expanded === m.key;
    const name = `${L.months[m.month]} ${m.year}`;

    return (
      <View style={[s.card, { backgroundColor: th.card, borderColor: th.border, marginBottom: 10 }]}>
        <TouchableOpacity onPress={() => setExpanded(open ? null : m.key)} style={[s.cardHd, { flexDirection: rowDir }]}>
          <View style={{ flex: 1 }}>
            <View style={[s.monthLine, { flexDirection: rowDir }]}>
              <Text style={{ color: th.text, ...weight('900'), fontSize: 15, textAlign: align }} numberOfLines={1}>{name}</Text>
              {isCurrent && (
                <View style={{ backgroundColor: th.primSoft, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{L.currentMonth}</Text>
                </View>
              )}
            </View>
            <View style={[s.statsLine, { flexDirection: rowDir }]}>
              <Text style={{ color: th.inc, fontSize: 12 }}>+{fmt(stats.inc)}</Text>
              <Text style={{ color: th.exp, fontSize: 12 }}>-{fmt(stats.exp)}</Text>
              <Text style={{ color: stats.bal >= 0 ? th.inc : th.exp, fontSize: 12, ...weight('900') }}>
                {stats.bal >= 0 ? '+' : '-'}{fmt(stats.bal)} {sym}
              </Text>
            </View>
          </View>
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={th.sub} />
        </TouchableOpacity>

        {open && (
          <View style={{ marginTop: 10 }}>
            {top.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), marginBottom: 6, textAlign: align }}>{L.topCatsSpend}</Text>
                <View style={[s.topRail, { flexDirection: rowDir }]}>
                  {top.map(c => (
                    <View key={c.id} style={[s.topChip, { backgroundColor: `${c.color}1f`, borderColor: `${c.color}55`, flexDirection: rowDir }]}>
                      <Ionicons name={c.icon || 'cube-outline'} size={13} color={c.color} />
                      <Text style={{ color: c.color, fontSize: 12, ...weight('900') }}>
                        {fmt(c.spent)} {sym}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {[...m.trans].sort((a, b) => (b.ts || 0) - (a.ts || 0)).map(renderTransaction)}

            <TouchableOpacity
              onPress={() => generateMonthPDF({ ...m, name, inc: stats.inc, exp: stats.exp, net: stats.bal }, displayCats, { currency: cfg.currency, lang: cfg.lang, name: cfg.name || 'MYFI' })}
              style={[s.pdfBtn, { backgroundColor: th.primSoft, flexDirection: rowDir }]}
            >
              <Ionicons name="share-outline" size={15} color={th.primary} />
              <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{L.exportPDF} / {L.shareBtn}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <>
      <FlatList
        style={{ flex: 1, backgroundColor: th.bg }}
        contentContainerStyle={{ padding: 16, paddingBottom: 42 }}
        data={filteredMonths}
        keyExtractor={item => item.key}
        renderItem={renderMonth}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          <View style={[s.empty, { borderColor: th.border }]}>
            <Ionicons name="archive-outline" size={34} color={th.faint} />
            <Text style={{ color: th.sub, textAlign: 'center', marginTop: 8, ...weight('900') }}>
              {search ? copy.noResults : L.noData}
            </Text>
          </View>
        }
        keyboardShouldPersistTaps="handled"
      />
      <AddTransModal visible={!!editing} onClose={() => setEditing(null)} editData={editing} />
      <Modal visible={!!archivePasswordMode} transparent animationType="fade" onRequestClose={() => setArchivePasswordMode(null)}>
        <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
          <View style={[s.passwordCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <Text style={{ color: th.text, fontSize: 16, ...weight('900'), textAlign: align }}>
              {archivePasswordMode === 'export'
                ? (isAr ? 'كلمة مرور الأرشيف' : 'Archive password')
                : (isAr ? 'فتح الأرشيف المشفر' : 'Unlock encrypted archive')}
            </Text>
            <Text style={{ color: th.warn, fontSize: 12, lineHeight: 19, ...weight('800'), textAlign: align }}>
              {archivePasswordMode === 'export'
                ? (isAr ? 'لا يمكن استعادة الملف إذا نسيت كلمة المرور.' : 'The archive cannot be restored if you forget this password.')
                : (isAr ? 'أدخل كلمة المرور المستخدمة عند إنشاء الملف.' : 'Enter the password used to create this file.')}
            </Text>
            <TextInput
              value={archivePassword}
              onChangeText={setArchivePassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={isAr ? 'كلمة المرور' : 'Password'}
              placeholderTextColor={th.sub}
              style={[s.passwordInput, { backgroundColor: th.input, borderColor: th.border, color: th.text }]}
            />
            <View style={[s.passwordActions, { flexDirection: rowDir }]}>
              <TouchableOpacity onPress={() => setArchivePasswordMode(null)} style={[s.passwordBtn, { backgroundColor: th.cardHigh }]}>
                <Text style={{ color: th.sub, ...weight('900') }}>{isAr ? 'إلغاء' : 'Cancel'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={submitArchivePassword} disabled={fileBusy} style={[s.passwordBtn, { backgroundColor: th.primary, opacity: fileBusy ? 0.6 : 1 }]}>
                <Text style={{ color: th.onPrimary, ...weight('900') }}>{fileBusy ? '...' : (isAr ? 'متابعة' : 'Continue')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  fileActions: { gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  fileBtn: { minHeight: 40, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 7 },
  loadedBanner: { borderRadius: 12, borderWidth: 0.5, padding: 11, marginBottom: 10 },
  archiveYears: { borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 10 },
  yearRail: { gap: 8, flexWrap: 'wrap', marginTop: 10 },
  yearBtn: { minWidth: 68, minHeight: 36, borderRadius: 10, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { minHeight: 38, borderTopWidth: 0.5, alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 8, paddingTop: 8 },
  card: { borderRadius: 16, padding: 14, borderWidth: 0.5 },
  label: { fontSize: 12, ...weight('900') },
  searchBox: { alignItems: 'center', borderRadius: 12, paddingHorizontal: 12, borderWidth: 0.5, marginBottom: 12 },
  actionLine: { alignItems: 'center', gap: 10, marginTop: 4 },
  csvBtn: { minHeight: 36, borderRadius: 11, borderWidth: 0.5, paddingHorizontal: 11, paddingVertical: 8, alignItems: 'center', gap: 6 },
  cardHd: { justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  monthLine: { alignItems: 'center', gap: 8 },
  statsLine: { gap: 12, marginTop: 4 },
  txRow: { minHeight: 54, alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingVertical: 7, borderTopWidth: 0.5 },
  txMain: { flex: 1, alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleRow: { alignItems: 'center', gap: 8, marginBottom: 2 },
  smartBadge: { minHeight: 22, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 8 },
  pdfBtn: { borderRadius: 12, padding: 12, alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10 },
  topRail: { gap: 8, flexWrap: 'wrap' },
  topChip: { alignItems: 'center', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, gap: 5 },
  empty: { minHeight: 180, borderRadius: 16, borderWidth: 0.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', padding: 18 },
  modalOverlay: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  passwordCard: { width: '100%', maxWidth: 440, borderRadius: 18, borderWidth: 1, padding: 16, gap: 12 },
  passwordInput: { minHeight: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, textAlign: 'left', writingDirection: 'ltr' },
  passwordActions: { gap: 8 },
  passwordBtn: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
