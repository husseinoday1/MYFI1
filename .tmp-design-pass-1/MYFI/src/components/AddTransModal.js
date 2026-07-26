import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TextInput, ScrollView, Alert, StyleSheet } from 'react-native';
import { Touchable } from './AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { today, isISODate } from '../utils/calc';
import { getModules } from '../lib/modules';
import { getDefaultWalletId, getWalletLabel, sortWalletsByDefault } from '../lib/wallets';

// editData = null  →  وضع إضافة
// editData = {...} →  وضع تعديل (مصروف/دخل فقط)
// initialMode = 'exp' | 'inc' | 'debt' | 'goal' | 'transfer'
// initialDebtId / initialGoalId: لتجهيز السداد/التوفير على دين أو هدف محدد (زر + دفعة جديدة)
export default function AddTransModal({
  visible, onClose, editData = null,
  initialMode = 'exp', initialDebtId = null, initialGoalId = null, initialCommitmentId = null,
  draftData = null,
}) {
  const { addTrans, addTransfer, editTrans, deleteTrans, payDebt, saveGoal, payCommitment, debts, goals, commitments, wallets, cats, cfg } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency);
  const insets = useSafeAreaInsets();
  const modules = getModules(cfg);
  const walletList = sortWalletsByDefault(wallets, cfg.currency, cfg.defaultWalletId);
  const defaultWalletId = getDefaultWalletId(walletList, cfg.currency, cfg.defaultWalletId);
  const align = cfg.lang === 'ar' ? 'right' : 'left';
  const rowDir = cfg.lang === 'ar' ? 'row-reverse' : 'row';
  const cleanInitialMode = initialMode === 'transfer' && !editData ? 'exp' : initialMode;
  const walletLabel = cfg.lang === 'ar' ? 'المحفظة' : 'Wallet';
  const transferLabel = cfg.lang === 'ar' ? 'تحويل' : 'Transfer';
  const fromLabel = cfg.lang === 'ar' ? 'من' : 'From';
  const toLabel = cfg.lang === 'ar' ? 'إلى' : 'To';

  const [type,      setType]      = useState(cleanInitialMode);
  const [title,     setTitle]     = useState('');
  const [amt,       setAmt]       = useState('');
  const [cat,       setCat]       = useState('other');
  const [note,      setNote]      = useState('');
  const [recurring, setRecurring] = useState(false);
  const [dateISO,   setDateISO]   = useState(today());
  const [selDebt,   setSelDebt]   = useState(initialDebtId);
  const [selGoal,   setSelGoal]   = useState(initialGoalId);
  const [selCommitment, setSelCommitment] = useState(initialCommitmentId);
  const [walletId,  setWalletId]  = useState(defaultWalletId);
  const [fromWalletId, setFromWalletId] = useState(defaultWalletId);
  const [toWalletId, setToWalletId] = useState(walletList.find(wallet => wallet.id !== defaultWalletId)?.id || defaultWalletId);

  const reset = () => {
    setType(cleanInitialMode); setTitle(''); setAmt(''); setCat('other');
    setNote(''); setRecurring(false); setDateISO(today());
    setSelDebt(initialDebtId); setSelGoal(initialGoalId);
    setSelCommitment(initialCommitmentId);
    setWalletId(defaultWalletId);
    setFromWalletId(defaultWalletId);
    setToWalletId(walletList.find(wallet => wallet.id !== defaultWalletId)?.id || defaultWalletId);
  };

  useEffect(() => {
    if (!visible) return;
    if (editData) {
      const editType = editData.kind === 'transfer' ? 'transfer' : (editData.amt > 0 ? 'inc' : 'exp');
      setType(editType);
      setAmt(Math.abs(editData.kind === 'transfer' ? editData.transferAmount : editData.amt).toString());
      setTitle(editData.title || '');
      setCat(editData.cat || 'other');
      setNote(editData.note || '');
      setRecurring(editData.recurring || false);
      setDateISO(editData.dateISO || today());
      setWalletId(editData.walletId || defaultWalletId);
      setFromWalletId(editData.fromWalletId || defaultWalletId);
      setToWalletId(editData.toWalletId || walletList.find(wallet => wallet.id !== defaultWalletId)?.id || defaultWalletId);
    } else if (draftData) {
      setType(draftData.amt > 0 ? 'inc' : 'exp');
      setAmt(Math.abs(draftData.amt).toString());
      setTitle(draftData.title || '');
      setCat(draftData.cat || 'other');
      setNote(draftData.note || '');
      setRecurring(draftData.recurring !== false);
      setDateISO(draftData.dateISO || today());
      setWalletId(draftData.walletId || defaultWalletId);
    } else {
      const initialCommitment = initialCommitmentId
        ? commitments.find(item => item.id === initialCommitmentId)
        : null;
      const defaultCommitment = initialCommitment || commitments[0] || null;
      setType(cleanInitialMode);
      setSelDebt(initialDebtId || (debts[0] && debts[0].id) || null);
      setSelGoal(initialGoalId || (goals[0] && goals[0].id) || null);
      setSelCommitment(defaultCommitment?.id || null);
      setAmt(''); setTitle(''); setCat('other'); setNote(''); setRecurring(false); setDateISO(today());
      setWalletId(defaultCommitment?.walletId || defaultWalletId);
      setFromWalletId(defaultWalletId);
      setToWalletId(walletList.find(wallet => wallet.id !== defaultWalletId)?.id || defaultWalletId);
    }
  }, [visible, editData, draftData, cleanInitialMode, initialDebtId, initialGoalId, initialCommitmentId, wallets, commitments, defaultWalletId]);

  const handleClose = () => { reset(); onClose(); };

  const handleSave = async () => {
    if (!isISODate(dateISO)) {
      Alert.alert('', cfg.lang === 'ar' ? 'اكتب التاريخ بصيغة YYYY-MM-DD' : 'Use YYYY-MM-DD date format');
      return;
    }
    const n = parseFloat(amt);
    if (type !== 'transfer' && !walletId) return;

    if (type === 'transfer') {
      if (!n) return;
      if (!fromWalletId || !toWalletId || fromWalletId === toWalletId) return;
      if (editData) {
        await editTrans(editData.id, {
          kind: 'transfer',
          amt: 0,
          transferAmount: Math.abs(n),
          fromWalletId,
          toWalletId,
          note,
          dateISO,
        });
      } else {
        await addTransfer({ fromWalletId, toWalletId, amount: n, dateISO, note });
      }
      handleClose();
      return;
    }

    if (type === 'debt') {
      if (!n) return;
      if (!selDebt) return;
      await payDebt(selDebt, n, dateISO, walletId);
      handleClose();
      return;
    }
    if (type === 'goal') {
      if (!n) return;
      if (!selGoal) return;
      await saveGoal(selGoal, n, dateISO, walletId);
      handleClose();
      return;
    }
    if (type === 'commitment') {
      if (!selCommitment) return;
      await payCommitment(selCommitment, dateISO, walletId);
      handleClose();
      return;
    }

    if (!title.trim()) return;
    const payload = {
      title: title.trim(),
      amt:   type === 'exp' ? -Math.abs(n) : Math.abs(n),
      cat, note, recurring, dateISO, walletId,
      recurringGroupId: draftData?.recurringGroupId,
    };
    if (editData) await editTrans(editData.id, payload);
    else           await addTrans(payload);
    handleClose();
  };

  const handleDelete = () => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.yes, style: 'destructive', onPress: async () => {
        await deleteTrans(editData.id);
        handleClose();
      }},
    ]);
  };

  const isEdit = !!editData;
  const fmt = (n) => Math.abs(Math.round(n)).toLocaleString();

  const seg = [
    { k: 'exp',  l: L.expMode },
    { k: 'inc',  l: L.incMode },
    modules.debtsOwed ? { k: 'debt', l: L.debtMode } : null,
    modules.goals ? { k: 'goal', l: L.goalMode } : null,
    commitments.length > 0 ? { k: 'commitment', l: cfg.lang === 'ar' ? 'التزام' : 'Commitment' } : null,
  ].filter(Boolean);
  const saveLabel = type === 'debt' ? L.payDebtAction : type === 'goal' ? L.saveGoalAction : type === 'commitment' ? (cfg.lang === 'ar' ? 'تسجيل الدفع' : 'Mark paid') : type === 'transfer' ? transferLabel : L.save;
  const saveColor = type === 'debt' ? th.exp : type === 'goal' || type === 'commitment' || type === 'transfer' ? th.primary : (type === 'exp' ? th.exp : th.inc);
  const lockedDebt = type === 'debt' && !!initialDebtId && !isEdit;
  const lockedGoal = type === 'goal' && !!initialGoalId && !isEdit;
  const lockedCommitment = type === 'commitment' && !!initialCommitmentId && !isEdit;
  const selectedDebt = debts.find(d => d.id === selDebt);
  const selectedGoal = goals.find(g => g.id === selGoal);
  const selectedCommitment = commitments.find(c => c.id === selCommitment);
  const selectedDebtReceivable = selectedDebt?.direction === 'receivable';
  const debtActionLabel = selectedDebtReceivable
    ? (cfg.lang === 'ar' ? 'تحصيل الدفعة' : 'Collect payment')
    : L.payDebtAction;
  const debtColor = selectedDebtReceivable ? th.inc : th.exp;
  const finalSaveLabel = type === 'debt' ? debtActionLabel : saveLabel;
  const finalSaveColor = type === 'debt' ? debtColor : saveColor;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Touchable style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={handleClose}>
        <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, maxHeight: '88%', paddingBottom: 20 + Math.max(insets.bottom, 8) }]}>
          <ScrollView showsVerticalScrollIndicator={false}>

            <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

            <View style={[s.headRow, { flexDirection: rowDir }]}>
              <Touchable onPress={handleClose} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
                <Ionicons name="close" size={20} color={th.sub} />
              </Touchable>
              <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{isEdit ? L.editTrans : L.newEntry}</Text>
              <View style={{ width: 20 }} />
            </View>

            {!isEdit && (
              <View style={[s.typeRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {seg.map(sg => (
                  <Touchable key={sg.k} onPress={() => setType(sg.k)}
                    style={[s.typeBtn, { backgroundColor: type === sg.k ? th.primary : 'transparent' }]}>
                    <Text style={{ color: type === sg.k ? th.onPrimary : th.sub, ...weight('900'), fontSize: 12, lineHeight: 16 }}>
                      {sg.l}
                    </Text>
                  </Touchable>
                ))}
              </View>
            )}

            {isEdit && type !== 'transfer' && (
              <View style={[s.typeRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                {['exp', 'inc'].map(t => (
                  <Touchable key={t} onPress={() => setType(t)}
                    style={[s.typeBtn, { backgroundColor: type === t ? (t === 'exp' ? th.exp : th.inc) : 'transparent' }]}>
                    <Text style={{ color: type === t ? '#fff' : th.sub, ...weight('700'), fontSize: 13 }}>
                      {t === 'exp' ? L.expBtn : L.incBtn}
                    </Text>
                  </Touchable>
                ))}
              </View>
            )}

            {isEdit && type === 'transfer' && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="swap-horizontal-outline" size={16} color={th.primary} />
                <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{transferLabel}</Text>
              </View>
            )}

            {type === 'transfer' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{fromLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                  {walletList.map(wallet => {
                    const active = fromWalletId === wallet.id;
                    return (
                      <Touchable
                        key={wallet.id}
                        onPress={() => setFromWalletId(wallet.id)}
                        style={[s.walletChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800') }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </Touchable>
                    );
                  })}
                </ScrollView>

                <Text style={[s.label, { color: th.sub }]}>{toLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {walletList.map(wallet => {
                    const active = toWalletId === wallet.id;
                    return (
                      <Touchable
                        key={wallet.id}
                        onPress={() => setToWalletId(wallet.id)}
                        style={[s.walletChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', opacity: fromWalletId === wallet.id ? 0.45 : 1 }]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800') }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </Touchable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {modules.wallets && walletList.length > 0 && type !== 'transfer' && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub, textAlign: align }]}>{walletLabel}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {walletList.map(wallet => {
                    const active = walletId === wallet.id;
                    return (
                      <Touchable
                        key={wallet.id}
                        onPress={() => setWalletId(wallet.id)}
                        style={[
                          s.walletChip,
                          {
                            backgroundColor: active ? th.primSoft : th.cardHigh,
                            borderColor: active ? th.primary : 'transparent',
                          },
                        ]}
                      >
                        <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                        <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800') }}>
                          {getWalletLabel(wallet, cfg.lang)}
                        </Text>
                      </Touchable>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {lockedDebt && selectedDebt && (
              <View style={[s.lockedPick, { backgroundColor: selectedDebtReceivable ? th.incBg : th.expBg, borderColor: debtColor }]}>
                <Ionicons name={selectedDebtReceivable ? 'cash-outline' : 'card-outline'} size={16} color={debtColor} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: debtColor, ...weight('900'), fontSize: 13 }}>{selectedDebt.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 11 }}>{L.remainingOf} {fmt(selectedDebt.total - selectedDebt.paid)} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'debt' && !isEdit && !lockedDebt && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{L.selectDebt}</Text>
                {debts.length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{L.noDebtsHint}</Text>
                ) : debts.map(d => (
                  <Touchable key={d.id} onPress={() => setSelDebt(d.id)}
                    style={[s.pickRow, { backgroundColor: selDebt === d.id ? th.expBg : th.cardHigh, borderColor: selDebt === d.id ? th.exp : 'transparent' }]}>
                    <Text style={{ color: selDebt === d.id ? th.exp : th.text, ...weight('700'), fontSize: 13 }}>{d.name}</Text>
                    <Text style={{ color: th.sub, fontSize: 11 }}>{L.remainingOf} {fmt(d.total - d.paid)} {sym}</Text>
                  </Touchable>
                ))}
              </View>
            )}

            {lockedGoal && selectedGoal && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="flag-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedGoal.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 11 }}>{L.remainingOf} {fmt(selectedGoal.target - selectedGoal.cur)} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'goal' && !isEdit && !lockedGoal && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{L.selectGoal}</Text>
                {goals.length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{L.noGoalsHint}</Text>
                ) : goals.map(g => (
                  <Touchable key={g.id} onPress={() => setSelGoal(g.id)}
                    style={[s.pickRow, { backgroundColor: selGoal === g.id ? th.primSoft : th.cardHigh, borderColor: selGoal === g.id ? th.primary : 'transparent' }]}>
                    <Text style={{ color: selGoal === g.id ? th.primary : th.text, ...weight('700'), fontSize: 13 }}>{g.name}</Text>
                    <Text style={{ color: th.sub, fontSize: 11 }}>{L.remainingOf} {fmt(g.target - g.cur)} {sym}</Text>
                  </Touchable>
                ))}
              </View>
            )}

            {lockedCommitment && selectedCommitment && (
              <View style={[s.lockedPick, { backgroundColor: th.primSoft, borderColor: th.primary }]}>
                <Ionicons name="calendar-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, ...weight('900'), fontSize: 13 }}>{selectedCommitment.name}</Text>
                  <Text style={{ color: th.sub, fontSize: 11 }}>{Math.round(Number(selectedCommitment.amt || 0)).toLocaleString()} {sym}</Text>
                </View>
              </View>
            )}

            {type === 'commitment' && !isEdit && !lockedCommitment && (
              <View style={{ marginBottom: 14 }}>
                <Text style={[s.label, { color: th.sub }]}>{cfg.lang === 'ar' ? 'اختر الالتزام' : 'Select commitment'}</Text>
                {commitments.filter(item => item.active !== false).length === 0 ? (
                  <Text style={{ color: th.faint, fontSize: 12 }}>{cfg.lang === 'ar' ? 'لا توجد التزامات مفعلة' : 'No active commitments'}</Text>
                ) : commitments.filter(item => item.active !== false).map(item => (
                  <Touchable key={item.id} onPress={() => { setSelCommitment(item.id); setWalletId(item.walletId || defaultWalletId); }}
                    style={[s.pickRow, { backgroundColor: selCommitment === item.id ? th.primSoft : th.cardHigh, borderColor: selCommitment === item.id ? th.primary : 'transparent' }]}>
                    <Text style={{ color: selCommitment === item.id ? th.primary : th.text, ...weight('700'), fontSize: 13 }}>{item.name}</Text>
                    <Text style={{ color: th.sub, fontSize: 11 }}>{Math.round(Number(item.amt || 0)).toLocaleString()} {sym}</Text>
                  </Touchable>
                ))}
              </View>
            )}

            {type === 'commitment' ? (
              <View style={[s.lockedPick, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
                <Ionicons name="cash-outline" size={16} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, ...weight('900'), fontSize: 13 }}>
                    {cfg.lang === 'ar' ? 'المبلغ المسجل لهذا الالتزام' : 'Saved amount for this commitment'}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 11 }}>
                    {Math.round(Number(selectedCommitment?.amt || 0)).toLocaleString()} {sym}
                  </Text>
                </View>
                <View style={[s.dateChip, { backgroundColor: th.input, borderColor: isISODate(dateISO) ? th.border : th.exp }]}>
                  <Ionicons name="calendar-outline" size={14} color={th.sub} />
                  <TextInput
                    value={dateISO}
                    onChangeText={setDateISO}
                    keyboardType="numbers-and-punctuation"
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={th.sub}
                    style={{ color: th.text, fontSize: 13, minWidth: 96, paddingVertical: 0, textAlign: 'center' }}
                  />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: rowDir, gap: 10, marginBottom: 12 }}>
                <TextInput value={amt} onChangeText={setAmt} keyboardType="numeric"
                  placeholder={`${L.amount} (${sym})`} placeholderTextColor={th.sub}
                  style={[s.input, { flex: 1, backgroundColor: th.input, color: th.text, borderColor: th.border, marginBottom: 0, textAlign: align }]} />
                <View style={[s.dateChip, { backgroundColor: th.input, borderColor: isISODate(dateISO) ? th.border : th.exp }]}>
                  <Ionicons name="calendar-outline" size={14} color={th.sub} />
                  <TextInput
                    value={dateISO}
                    onChangeText={setDateISO}
                    keyboardType="numbers-and-punctuation"
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={th.sub}
                    style={{ color: th.text, fontSize: 13, minWidth: 96, paddingVertical: 0, textAlign: 'center' }}
                  />
                </View>
              </View>
            )}

            {(type === 'exp' || type === 'inc') && (
              <>
                <TextInput value={title} onChangeText={setTitle}
                  placeholder={L.titleField} placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]} />

                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {cats.map(c => (
                    <Touchable key={c.id} onPress={() => setCat(c.id)}
                      style={[s.catChip, { backgroundColor: cat === c.id ? c.color + '33' : th.cardHigh, borderColor: cat === c.id ? c.color : 'transparent' }]}>
                      <Ionicons name={c.icon || 'cube-outline'} size={16} color={c.color} />
                      <Text style={{ color: cat === c.id ? c.color : th.sub, fontSize: 10, ...weight('600') }}>
                        {cfg.lang === 'ar' ? c.label : c.labelEn}
                      </Text>
                    </Touchable>
                  ))}
                </ScrollView>

                <TextInput value={note} onChangeText={setNote}
                  placeholder={L.note} placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]} />

                <View style={[s.rowBetween, { marginBottom: 16 }]}>
                  <Touchable onPress={() => setRecurring(r => !r)}
                    style={[s.toggleBtn, { backgroundColor: recurring ? th.primSoft : th.cardHigh, borderColor: recurring ? th.primary : 'transparent' }]}>
                    <Ionicons name="repeat" size={13} color={recurring ? th.primary : th.sub} />
                    <Text style={{ color: recurring ? th.primary : th.sub, fontSize: 12, ...weight('600') }}> {L.recurring}</Text>
                  </Touchable>
                </View>
              </>
            )}

            {isEdit ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Touchable onPress={handleDelete}
                  style={[s.halfBtn, { backgroundColor: th.expBg, borderColor: th.exp, borderWidth: 1 }]}>
                  <Text style={{ color: th.exp, ...weight('700'), fontSize: 14 }}>{L.delete}</Text>
                </Touchable>
                <Touchable onPress={handleSave}
                  style={[s.halfBtn, { backgroundColor: finalSaveColor, flex: 2 }]}>
                  <Text style={{ color: '#fff', ...weight('800'), fontSize: 15 }}>{L.save}</Text>
                </Touchable>
              </View>
            ) : (
              <Touchable onPress={handleSave} style={[s.saveBtn, { backgroundColor: finalSaveColor }]}>
                <Text style={{ color: '#fff', ...weight('800'), fontSize: 15 }}>{finalSaveLabel}</Text>
              </Touchable>
            )}

          </ScrollView>
        </Touchable>
      </Touchable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay:    { flex: 1, justifyContent: 'flex-end' },
  sheet:      { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 32 },
  handle:     { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:      { flex: 1, fontSize: 18, lineHeight: 24, ...weight('900') },
  typeRow:    { borderRadius: 16, padding: 4, marginBottom: 16, gap: 4 },
  typeBtn:    { flex: 1, minHeight: 40, paddingHorizontal: 8, paddingVertical: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  label:      { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  pickRow:    { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lockedPick: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  input:      { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 10, fontSize: 14, lineHeight: 19, ...weight('700') },
  dateChip:   { minHeight: 46, borderRadius: 12, borderWidth: 0.5, paddingHorizontal: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 },
  catChip:    { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, marginRight: 8, borderWidth: 1, gap: 4, minWidth: 68 },
  walletChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, marginRight: 8, borderWidth: 1 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleBtn:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  saveBtn:    { minHeight: 52, borderRadius: 15, padding: 15, alignItems: 'center', justifyContent: 'center' },
  halfBtn:    { flex: 1, minHeight: 50, borderRadius: 15, padding: 14, alignItems: 'center', justifyContent: 'center' },
});
