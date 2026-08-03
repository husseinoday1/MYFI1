import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { isISODate, pct } from '../utils/calc';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';
import DateField from '../components/DateField';
import ActionMenu from '../components/ActionMenu';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';

const cleanNumber = parseNumberInput;

const text = (lang, receivable) => {
  const ar = lang === 'ar';
  return {
    title: receivable ? (ar ? 'دين لي' : 'Debt owed to me') : (ar ? 'دين عليّ' : 'Debt I owe'),
    total: receivable ? (ar ? 'إجمالي دين لي' : 'Total to collect') : (ar ? 'إجمالي دين عليّ' : 'Total I owe'),
    active: ar ? 'النشطة' : 'Active',
    completed: ar ? 'المكتملة' : 'Completed',
    lastMove: receivable ? (ar ? 'آخر تحصيل' : 'Last collection') : (ar ? 'آخر سداد' : 'Last repayment'),
    noHistory: receivable ? (ar ? 'لا يوجد تحصيل بعد' : 'No collections yet') : (ar ? 'لا يوجد سداد بعد' : 'No repayments yet'),
    empty: receivable
      ? (ar ? 'لا يوجد دين لي حالياً' : 'No receivables yet')
      : (ar ? 'لا يوجد دين عليّ حالياً' : 'No debts yet'),
    editTitle: receivable ? (ar ? 'تعديل دين لي' : 'Edit receivable') : (ar ? 'تعديل دين عليّ' : 'Edit debt'),
    collected: ar ? 'محصل' : 'Collected',
    paid: ar ? 'مسدد' : 'Paid',
    collectAction: ar ? 'تسجيل تحصيل' : 'Record collection',
    payAction: ar ? 'تسجيل سداد' : 'Record repayment',
    showHistory: ar ? 'السجل' : 'History',
    due: ar ? 'المتبقي' : 'Remaining',
    totalAmount: ar ? 'الإجمالي' : 'Total',
    editPayment: receivable ? (ar ? 'تعديل التحصيل' : 'Edit collection') : (ar ? 'تعديل السداد' : 'Edit repayment'),
    deletePayment: receivable ? (ar ? 'حذف التحصيل' : 'Delete collection') : (ar ? 'حذف السداد' : 'Delete repayment'),
  };
};

export default function DebtsScreen({ direction = 'owed', onQuickPay }) {
  const { debts, editDebt, deleteDebt, editDebtPayment, deleteDebtPayment, cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const sym = getSymbol(cfg.currency);
  const isRtl = cfg.lang === 'ar';
  const align = isRtl ? 'right' : 'left';
  const rowDir = isRtl ? 'row-reverse' : 'row';
  const isReceivable = direction === 'receivable';
  const T = text(cfg.lang, isReceivable);
  const accent = isReceivable ? th.inc : th.exp;

  const [openId, setOpenId] = useState(null);
  const [editingDebt, setEditingDebt] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);

  const rows = useMemo(() => {
    const filtered = debts.filter(d => (d.direction || 'owed') === direction);
    return [...filtered].sort((a, b) => {
      const aRem = Math.max(0, Number(a.total || 0) - Number(a.paid || 0));
      const bRem = Math.max(0, Number(b.total || 0) - Number(b.paid || 0));
      const aDone = aRem <= 0 ? 1 : 0;
      const bDone = bRem <= 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aPct = pct(Number(a.paid || 0), Number(a.total || 0));
      const bPct = pct(Number(b.paid || 0), Number(b.total || 0));
      if (aDone === 0 && aPct !== bPct) return bPct - aPct;
      if (aRem !== bRem) return bRem - aRem;
      return (b.ts || 0) - (a.ts || 0);
    });
  }, [debts, direction]);

  const totals = useMemo(() => {
    const total = rows.reduce((sum, d) => sum + Number(d.total || 0), 0);
    const paid = rows.reduce((sum, d) => sum + Number(d.paid || 0), 0);
    const remaining = rows.reduce((sum, d) => sum + Math.max(0, Number(d.total || 0) - Number(d.paid || 0)), 0);
    const active = rows.filter(d => Math.max(0, Number(d.total || 0) - Number(d.paid || 0)) > 0).length;
    const completed = rows.length - active;
    return { total, paid, remaining, active, completed };
  }, [rows]);

  const fmt = (n) => formatMoneyNumber(n, cfg.currency, cfg.lang);

  const startDebtEdit = (debt) => {
    setEditingPayment(null);
    setEditingDebt({ id: debt.id, name: debt.name || '', total: String(debt.total || ''), createdAt: debt.createdAt || '' });
  };

  const saveDebtEdit = async () => {
    const total = cleanNumber(editingDebt?.total);
    if (!editingDebt?.name?.trim() || !total) return;
    if (editingDebt.createdAt && !isISODate(editingDebt.createdAt)) return;
    const current = debts.find(d => d.id === editingDebt.id);
    const paid = Number(current?.paid || 0);
    if (total < paid) {
      Alert.alert('', cfg.lang === 'ar'
        ? `الإجمالي لا يمكن أن يكون أقل من المدفوع: ${fmt(paid)} ${sym}`
        : `Total cannot be lower than paid: ${fmt(paid)} ${sym}`);
      return;
    }
    await editDebt(editingDebt.id, { name: editingDebt.name.trim(), total, createdAt: editingDebt.createdAt });
    setEditingDebt(null);
  };

  const confirmDeleteDebt = (id) => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteDebt(id) },
    ]);
  };

  const startPaymentEdit = (debtId, payment) => {
    setEditingDebt(null);
    setEditingPayment({ debtId, id: payment.id, amt: String(payment.amt || ''), date: payment.date || '' });
  };

  const savePaymentEdit = async () => {
    const amt = cleanNumber(editingPayment?.amt);
    if (!amt) return;
    if (editingPayment.date && !isISODate(editingPayment.date)) return;
    const debt = debts.find(d => d.id === editingPayment.debtId);
    const currentPayment = debt?.payments?.find(p => p.id === editingPayment.id);
    const maxAllowed = Math.max(0, Number(debt?.total || 0) - (Number(debt?.paid || 0) - Number(currentPayment?.amt || 0)));
    if (amt > maxAllowed) {
      Alert.alert('', cfg.lang === 'ar'
        ? `الدفعة أكبر من المتبقي لهذا الدين: ${fmt(maxAllowed)} ${sym}`
        : `Payment is higher than the remaining amount: ${fmt(maxAllowed)} ${sym}`);
      return;
    }
    await editDebtPayment(editingPayment.debtId, editingPayment.id, amt, editingPayment.date);
    setEditingPayment(null);
  };

  const confirmDeletePayment = (debtId, paymentId) => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteDebtPayment(debtId, paymentId) },
    ]);
  };

  const renderPayment = (debtId, payment) => {
    const editing = editingPayment?.debtId === debtId && editingPayment?.id === payment.id;
    if (editing) {
      return (
        <View key={payment.id} style={[s.histEditRow, { borderTopColor: th.border }]}>
          <TextInput
            value={editingPayment.amt}
            onChangeText={(amt) => setEditingPayment(prev => ({ ...prev, amt: formatNumberInput(amt) }))}
            keyboardType="numeric"
            placeholder={L.amount}
            placeholderTextColor={th.sub}
            style={[s.inlineInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align, flex: undefined, width: '100%' }]}
          />
          <DateField
            value={editingPayment.date}
            onChange={(date) => setEditingPayment(prev => ({ ...prev, date }))}
            th={th}
            lang={cfg.lang}
            style={{ width: '100%' }}
          />
          <View style={[s.iconActions, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={savePaymentEdit} style={[s.iconBtn, { backgroundColor: th.primSoft }]}>
              <Ionicons name="checkmark" size={16} color={th.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingPayment(null)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="arrow-undo-outline" size={16} color={th.sub} />
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View key={payment.id} style={[s.histRow, { borderTopColor: th.border, flexDirection: rowDir }]}>
        <View>
          <Text style={{ color: th.text, fontSize: 12, ...weight('800'), textAlign: align }}>{fmt(payment.amt)} {sym}</Text>
          <Text style={{ color: th.sub, fontSize: 12, textAlign: align }}>{payment.date}</Text>
        </View>
        <ActionMenu
          th={th}
          lang={cfg.lang}
          title={T.showHistory}
          buttonStyle={{ width: 32, height: 32, borderRadius: 10, backgroundColor: th.cardHigh }}
          items={[
            { label: T.editPayment, icon: 'create-outline', color: th.primary, onPress: () => startPaymentEdit(debtId, payment) },
            { label: T.deletePayment, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeletePayment(debtId, payment.id) },
          ]}
        />
      </View>
    );
  };

  return (
    <View>
      <View style={[s.summary, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), textAlign: align }}>{T.total}</Text>
        <Text style={{ color: th.text, fontSize: 30, ...weight('900'), marginTop: 6, textAlign: align }}>
          {fmt(totals.remaining)} {sym}
        </Text>
      </View>

      {rows.length === 0 && (
        <Text style={{ color: th.sub, fontSize: 12, textAlign: 'center', marginTop: 14 }}>{T.empty}</Text>
      )}

      {rows.map((debt) => {
        const total = Number(debt.total || 0);
        const paid = Number(debt.paid || 0);
        const remaining = Math.max(0, total - paid);
        const done = remaining <= 0;
        const progress = pct(paid, total);
        const lastPayment = (debt.payments || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
        const open = openId === debt.id;
        const editing = editingDebt?.id === debt.id;

        return (
          <View key={debt.id} style={[s.card, { backgroundColor: th.card, borderColor: done ? `${th.inc}33` : th.border }]}>
            {editing ? (
              <View>
                <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.editTitle}</Text>
                <TextInput
                  value={editingDebt.name}
                  onChangeText={(name) => setEditingDebt(prev => ({ ...prev, name }))}
                  placeholder={L.debtName}
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <TextInput
                  value={editingDebt.total}
                  onChangeText={(value) => setEditingDebt(prev => ({ ...prev, total: formatNumberInput(value) }))}
                  keyboardType="numeric"
                  placeholder={`${L.debtTotalAmount} (${sym})`}
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <DateField
                  value={editingDebt.createdAt}
                  onChange={(createdAt) => setEditingDebt(prev => ({ ...prev, createdAt }))}
                  th={th}
                  lang={cfg.lang}
                  style={{ marginBottom: 8 }}
                />
                <View style={[s.editActions, { flexDirection: rowDir }]}>
                  <TouchableOpacity onPress={() => setEditingDebt(null)} style={[s.halfBtn, { backgroundColor: th.cardHigh }]}>
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{cfg.lang === 'ar' ? 'إلغاء' : 'Cancel'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveDebtEdit} style={[s.halfBtn, { backgroundColor: th.primary }]}>
                    <Text style={{ color: th.onPrimary, ...weight('800'), fontSize: 12 }}>{L.save}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <View style={[s.headRow, { flexDirection: rowDir }]}>
                  <View style={[s.titleWrap, { flexDirection: rowDir }]}>
                    <View style={[s.iconBox, { backgroundColor: done ? th.incBg : `${accent}16` }]}>
                      <Ionicons name={isReceivable ? 'cash-outline' : 'card-outline'} size={17} color={done ? th.inc : accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: th.text, ...weight('900'), fontSize: 15, textAlign: align }} numberOfLines={1}>{debt.name}</Text>
                      <Text style={{ color: done ? th.inc : th.sub, fontSize: 12, lineHeight: 18, marginTop: 3, textAlign: align }}>
                        {done ? L.completed : `${T.due}: ${fmt(remaining)} ${sym}`}
                      </Text>
                    </View>
                  </View>
                  <ActionMenu
                    th={th}
                    lang={cfg.lang}
                    title={debt.name}
                    items={[
                      { label: T.editTitle, icon: 'create-outline', color: th.primary, onPress: () => startDebtEdit(debt) },
                      { label: L.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteDebt(debt.id) },
                    ]}
                  />
                </View>

                <View style={[s.amountPanel, { backgroundColor: th.cardHigh }]}>
                  <Text style={{ color: done ? th.inc : accent, fontSize: 22, lineHeight: 29, ...weight('900'), textAlign: align }} numberOfLines={1} adjustsFontSizeToFit>
                    {done ? L.completed : `${fmt(remaining)} ${sym}`}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: align }}>
                    {isReceivable ? T.collected : T.paid}: {fmt(paid)} {sym} · {T.totalAmount}: {fmt(total)} {sym}{lastPayment?.date ? ` · ${T.lastMove}: ${lastPayment.date}` : ''}
                  </Text>
                </View>

                <View style={[s.progressBg, { backgroundColor: th.cardHigh }]}>
                  <View style={[s.progressFg, { width: `${progress}%`, backgroundColor: done ? th.inc : accent }]} />
                </View>
                <View style={[s.rowMeta, { flexDirection: rowDir }]}>
                  <Text style={{ color: th.sub, fontSize: 12, textAlign: align }}>{fmt(paid)} / {fmt(total)} {sym}</Text>
                  <Text style={{ color: done ? th.inc : accent, fontSize: 12, ...weight('900') }}>
                    {progress}% {isReceivable ? T.collected : T.paid}
                  </Text>
                </View>

                <View style={[s.editActions, { flexDirection: rowDir }]}>
                  {!done && (
                    <TouchableOpacity onPress={() => onQuickPay(debt.id)} style={[s.halfBtn, { backgroundColor: th.primSoft }]}>
                      <Text style={{ color: th.primary, ...weight('900'), fontSize: 12 }}>{isReceivable ? T.collectAction : T.payAction}</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => setOpenId(open ? null : debt.id)}
                    style={[s.halfBtn, { backgroundColor: th.cardHigh, flexDirection: rowDir, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
                  >
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{T.showHistory}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={th.sub} />
                  </TouchableOpacity>
                </View>

                {open && (
                  <View style={s.histBox}>
                    {(!debt.payments || debt.payments.length === 0) && (
                      <Text style={{ color: th.faint, fontSize: 12, textAlign: align }}>{T.noHistory}</Text>
                    )}
                    {(debt.payments || []).map(payment => renderPayment(debt.id, payment))}
                  </View>
                )}
              </>
            )}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  summary: { borderRadius: RADIUS.xl, padding: SPACE.lg, borderWidth: 1, marginBottom: 10, ...SHADOW.card },
  card: { borderRadius: RADIUS.xl, padding: SPACE.lg, borderWidth: 1, marginTop: 10, ...SHADOW.card },
  label: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  headRow: { justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  titleWrap: { alignItems: 'center', gap: 10, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  iconActions: { gap: 6, alignItems: 'center' },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  amountPanel: { borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: 11 },
  progressBg: { height: 7, borderRadius: 7, overflow: 'hidden', marginBottom: 7 },
  progressFg: { height: 7, borderRadius: 7 },
  rowMeta: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  editActions: { gap: 8, marginTop: 10 },
  halfBtn: { flex: 1, minHeight: 40, borderRadius: 11, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  histBox: { marginTop: 10 },
  histRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1 },
  histEditRow: { alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  input: { minHeight: 46, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, marginBottom: 8, fontSize: 14, lineHeight: 19, ...weight('700') },
  inlineInput: { flex: 1, minHeight: 42, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, fontSize: 13 },
  dateInput: { width: 112, minHeight: 42, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, fontSize: 12, textAlign: 'center' },
  smallDateButton: { minHeight: 40, paddingHorizontal: 9 },
  smallDateText: { fontSize: 12, lineHeight: 17 },
});
