import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { Touchable } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { isISODate, pct } from '../utils/calc';

const cleanNumber = (value) => Number(String(value || '').replace(/[^0-9.]/g, '')) || 0;

const text = (lang, receivable) => {
  const ar = lang === 'ar';
  return {
    title: receivable ? (ar ? 'ديون لي' : 'Money owed to me') : (ar ? 'ديون عليّ' : 'Debts I owe'),
    total: receivable ? (ar ? 'إجمالي المتبقي لك' : 'Total to collect') : (ar ? 'إجمالي المتبقي' : 'Total remaining'),
    active: ar ? 'النشطة' : 'Active',
    completed: ar ? 'المكتملة' : 'Completed',
    lastMove: receivable ? (ar ? 'آخر تحصيل' : 'Last collection') : (ar ? 'آخر دفعة' : 'Last payment'),
    noHistory: receivable ? (ar ? 'لا توجد دفعات تحصيل بعد' : 'No collections yet') : (ar ? 'لا توجد دفعات بعد' : 'No payments yet'),
    empty: receivable
      ? (ar ? 'لا توجد ديون لك حالياً' : 'No receivables yet')
      : (ar ? 'لا توجد ديون حالياً' : 'No debts yet'),
    editTitle: receivable ? (ar ? 'تعديل الدين المستحق لك' : 'Edit receivable') : (ar ? 'تعديل الدين' : 'Edit debt'),
    collected: ar ? 'محصل' : 'Collected',
    paid: ar ? 'مسدد' : 'Paid',
    collectAction: ar ? 'تحصيل دفعة' : 'Collect payment',
    payAction: ar ? 'تسجيل دفعة' : 'Add payment',
    showHistory: ar ? 'السجل' : 'History',
    due: ar ? 'المتبقي' : 'Remaining',
    totalAmount: ar ? 'الإجمالي' : 'Total',
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

  const fmt = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString();

  const startDebtEdit = (debt) => {
    setEditingPayment(null);
    setEditingDebt({ id: debt.id, name: debt.name || '', total: String(debt.total || ''), createdAt: debt.createdAt || '' });
  };

  const saveDebtEdit = async () => {
    const total = cleanNumber(editingDebt?.total);
    if (!editingDebt?.name?.trim() || !total) return;
    if (editingDebt.createdAt && !isISODate(editingDebt.createdAt)) return;
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
        <View key={payment.id} style={[s.histEditRow, { borderTopColor: th.border, flexDirection: rowDir }]}>
          <TextInput
            value={editingPayment.amt}
            onChangeText={(amt) => setEditingPayment(prev => ({ ...prev, amt }))}
            keyboardType="numeric"
            placeholder={L.amount}
            placeholderTextColor={th.sub}
            style={[s.inlineInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
          />
          <TextInput
            value={editingPayment.date}
            onChangeText={(date) => setEditingPayment(prev => ({ ...prev, date }))}
            keyboardType="numbers-and-punctuation"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={th.sub}
            style={[s.dateInput, { backgroundColor: th.input, color: isISODate(editingPayment.date) ? th.text : th.exp, borderColor: th.border }]}
          />
          <View style={[s.iconActions, { flexDirection: rowDir }]}>
            <Touchable onPress={savePaymentEdit} style={[s.iconBtn, { backgroundColor: th.primSoft }]}>
              <Ionicons name="checkmark" size={16} color={th.primary} />
            </Touchable>
            <Touchable onPress={() => setEditingPayment(null)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={16} color={th.sub} />
            </Touchable>
          </View>
        </View>
      );
    }

    return (
      <View key={payment.id} style={[s.histRow, { borderTopColor: th.border, flexDirection: rowDir }]}>
        <View>
          <Text style={{ color: th.text, fontSize: 12, ...weight('800'), textAlign: align }}>{fmt(payment.amt)} {sym}</Text>
          <Text style={{ color: th.sub, fontSize: 11, textAlign: align }}>{payment.date}</Text>
        </View>
        <View style={[s.iconActions, { flexDirection: rowDir }]}>
          <Touchable onPress={() => startPaymentEdit(debtId, payment)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
            <Ionicons name="create-outline" size={15} color={th.sub} />
          </Touchable>
          <Touchable onPress={() => confirmDeletePayment(debtId, payment.id)} style={[s.iconBtn, { backgroundColor: th.expBg }]}>
            <Ionicons name="trash-outline" size={15} color={th.exp} />
          </Touchable>
        </View>
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
                  onChangeText={(value) => setEditingDebt(prev => ({ ...prev, total: value }))}
                  keyboardType="numeric"
                  placeholder={`${L.debtTotalAmount} (${sym})`}
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <TextInput
                  value={editingDebt.createdAt}
                  onChangeText={(createdAt) => setEditingDebt(prev => ({ ...prev, createdAt }))}
                  keyboardType="numbers-and-punctuation"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: !editingDebt.createdAt || isISODate(editingDebt.createdAt) ? th.text : th.exp, borderColor: th.border, textAlign: 'center' }]}
                />
                <View style={[s.editActions, { flexDirection: rowDir }]}>
                  <Touchable onPress={() => setEditingDebt(null)} style={[s.halfBtn, { backgroundColor: th.cardHigh }]}>
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{cfg.lang === 'ar' ? 'إلغاء' : 'Cancel'}</Text>
                  </Touchable>
                  <Touchable onPress={saveDebtEdit} style={[s.halfBtn, { backgroundColor: th.primary }]}>
                    <Text style={{ color: th.onPrimary, ...weight('800'), fontSize: 12 }}>{L.save}</Text>
                  </Touchable>
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
                      <Text style={{ color: done ? th.inc : th.sub, fontSize: 11, marginTop: 3, textAlign: align }}>
                        {done ? L.completed : `${T.due}: ${fmt(remaining)} ${sym}`}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.iconActions, { flexDirection: rowDir }]}>
                    <Touchable onPress={() => startDebtEdit(debt)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
                      <Ionicons name="create-outline" size={15} color={th.sub} />
                    </Touchable>
                    <Touchable onPress={() => confirmDeleteDebt(debt.id)} style={[s.iconBtn, { backgroundColor: th.expBg }]}>
                      <Ionicons name="trash-outline" size={15} color={th.exp} />
                    </Touchable>
                  </View>
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
                    <Touchable onPress={() => onQuickPay(debt.id)} style={[s.halfBtn, { backgroundColor: th.primSoft }]}>
                      <Text style={{ color: th.primary, ...weight('900'), fontSize: 12 }}>{isReceivable ? T.collectAction : T.payAction}</Text>
                    </Touchable>
                  )}
                  <Touchable
                    onPress={() => setOpenId(open ? null : debt.id)}
                    style={[s.halfBtn, { backgroundColor: th.cardHigh, flexDirection: rowDir, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
                  >
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{T.showHistory}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={th.sub} />
                  </Touchable>
                </View>

                {open && (
                  <View style={s.histBox}>
                    {(!debt.payments || debt.payments.length === 0) && (
                      <Text style={{ color: th.faint, fontSize: 11, textAlign: align }}>{T.noHistory}</Text>
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
  summary: { borderRadius: 14, padding: 14, borderWidth: 0.5, marginBottom: 10 },
  card: { borderRadius: 14, padding: 14, borderWidth: 0.5, marginTop: 10 },
  label: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  headRow: { justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 },
  titleWrap: { alignItems: 'center', gap: 10, flex: 1 },
  iconBox: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  iconActions: { gap: 6, alignItems: 'center' },
  iconBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  amountPanel: { borderRadius: 12, padding: 12, marginBottom: 11 },
  progressBg: { height: 7, borderRadius: 7, overflow: 'hidden', marginBottom: 7 },
  progressFg: { height: 7, borderRadius: 7 },
  rowMeta: { justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  editActions: { gap: 8, marginTop: 10 },
  halfBtn: { flex: 1, minHeight: 40, borderRadius: 11, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  histBox: { marginTop: 10 },
  histRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 0.5 },
  histEditRow: { alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 0.5 },
  input: { minHeight: 44, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 0.5, marginBottom: 8, fontSize: 14, lineHeight: 19, ...weight('700') },
  inlineInput: { flex: 1, minHeight: 40, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 0.5, fontSize: 13 },
  dateInput: { width: 112, minHeight: 40, borderRadius: 11, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 0.5, fontSize: 12, textAlign: 'center' },
});
