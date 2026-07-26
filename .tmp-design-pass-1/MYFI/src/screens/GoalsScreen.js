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

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    totalSaved: ar ? 'إجمالي المدخر' : 'Total saved',
    remaining: ar ? 'إجمالي المتبقي' : 'Total remaining',
    active: ar ? 'النشطة' : 'Active',
    completed: ar ? 'المكتملة' : 'Completed',
    lastSave: ar ? 'آخر توفير' : 'Last saving',
    target: ar ? 'الهدف' : 'Target',
    progress: ar ? 'التقدم' : 'Progress',
    saveAction: ar ? 'إضافة توفير' : 'Add saving',
    showHistory: ar ? 'السجل' : 'History',
    noHistory: ar ? 'لا توجد عمليات توفير بعد' : 'No savings yet',
    empty: ar ? 'لا توجد أهداف حالياً' : 'No goals yet',
    editTitle: ar ? 'تعديل الهدف' : 'Edit goal',
    complete: ar ? 'مكتمل' : 'Complete',
  };
};

export default function GoalsScreen({ onQuickSave }) {
  const { goals, editGoal, deleteGoal, editGoalSaving, deleteGoalSaving, cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const isRtl = cfg.lang === 'ar';
  const align = isRtl ? 'right' : 'left';
  const rowDir = isRtl ? 'row-reverse' : 'row';

  const [openId, setOpenId] = useState(null);
  const [editingGoal, setEditingGoal] = useState(null);
  const [editingSaving, setEditingSaving] = useState(null);

  const rows = useMemo(() => (
    [...goals].sort((a, b) => {
      const aRem = Math.max(0, Number(a.target || 0) - Number(a.cur || 0));
      const bRem = Math.max(0, Number(b.target || 0) - Number(b.cur || 0));
      const aDone = aRem <= 0 ? 1 : 0;
      const bDone = bRem <= 0 ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const aPct = pct(Number(a.cur || 0), Number(a.target || 0));
      const bPct = pct(Number(b.cur || 0), Number(b.target || 0));
      if (aDone === 0 && aPct !== bPct) return bPct - aPct;
      if (aRem !== bRem) return aRem - bRem;
      return (b.ts || 0) - (a.ts || 0);
    })
  ), [goals]);

  const totals = useMemo(() => {
    const target = rows.reduce((sum, g) => sum + Number(g.target || 0), 0);
    const saved = rows.reduce((sum, g) => sum + Number(g.cur || 0), 0);
    const remaining = rows.reduce((sum, g) => sum + Math.max(0, Number(g.target || 0) - Number(g.cur || 0)), 0);
    const active = rows.filter(g => Math.max(0, Number(g.target || 0) - Number(g.cur || 0)) > 0).length;
    const completed = rows.length - active;
    return { target, saved, remaining, active, completed };
  }, [rows]);

  const fmt = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString();

  const startGoalEdit = (goal) => {
    setEditingSaving(null);
    setEditingGoal({ id: goal.id, name: goal.name || '', target: String(goal.target || ''), createdAt: goal.createdAt || '' });
  };

  const saveGoalEdit = async () => {
    const target = cleanNumber(editingGoal?.target);
    if (!editingGoal?.name?.trim() || !target) return;
    if (editingGoal.createdAt && !isISODate(editingGoal.createdAt)) return;
    await editGoal(editingGoal.id, { name: editingGoal.name.trim(), target, createdAt: editingGoal.createdAt });
    setEditingGoal(null);
  };

  const confirmDeleteGoal = (id) => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteGoal(id) },
    ]);
  };

  const startSavingEdit = (goalId, saving) => {
    setEditingGoal(null);
    setEditingSaving({ goalId, id: saving.id, amt: String(saving.amt || ''), date: saving.date || '' });
  };

  const saveSavingEdit = async () => {
    const amt = cleanNumber(editingSaving?.amt);
    if (!amt) return;
    if (editingSaving.date && !isISODate(editingSaving.date)) return;
    await editGoalSaving(editingSaving.goalId, editingSaving.id, amt, editingSaving.date);
    setEditingSaving(null);
  };

  const confirmDeleteSaving = (goalId, savingId) => {
    Alert.alert(L.delete, L.confirmDel, [
      { text: L.no, style: 'cancel' },
      { text: L.delete, style: 'destructive', onPress: () => deleteGoalSaving(goalId, savingId) },
    ]);
  };

  const renderSaving = (goalId, saving) => {
    const editing = editingSaving?.goalId === goalId && editingSaving?.id === saving.id;
    if (editing) {
      return (
        <View key={saving.id} style={[s.histEditRow, { borderTopColor: th.border, flexDirection: rowDir }]}>
          <TextInput
            value={editingSaving.amt}
            onChangeText={(amt) => setEditingSaving(prev => ({ ...prev, amt }))}
            keyboardType="numeric"
            placeholder={L.amount}
            placeholderTextColor={th.sub}
            style={[s.inlineInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
          />
          <TextInput
            value={editingSaving.date}
            onChangeText={(date) => setEditingSaving(prev => ({ ...prev, date }))}
            keyboardType="numbers-and-punctuation"
            placeholder="YYYY-MM-DD"
            placeholderTextColor={th.sub}
            style={[s.dateInput, { backgroundColor: th.input, color: isISODate(editingSaving.date) ? th.text : th.exp, borderColor: th.border }]}
          />
          <View style={[s.iconActions, { flexDirection: rowDir }]}>
            <Touchable onPress={saveSavingEdit} style={[s.iconBtn, { backgroundColor: th.primSoft }]}>
              <Ionicons name="checkmark" size={16} color={th.primary} />
            </Touchable>
            <Touchable onPress={() => setEditingSaving(null)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={16} color={th.sub} />
            </Touchable>
          </View>
        </View>
      );
    }

    return (
      <View key={saving.id} style={[s.histRow, { borderTopColor: th.border, flexDirection: rowDir }]}>
        <View>
          <Text style={{ color: th.text, fontSize: 12, ...weight('800'), textAlign: align }}>{fmt(saving.amt)} {sym}</Text>
          <Text style={{ color: th.sub, fontSize: 11, textAlign: align }}>{saving.date}</Text>
        </View>
        <View style={[s.iconActions, { flexDirection: rowDir }]}>
          <Touchable onPress={() => startSavingEdit(goalId, saving)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
            <Ionicons name="create-outline" size={15} color={th.sub} />
          </Touchable>
          <Touchable onPress={() => confirmDeleteSaving(goalId, saving.id)} style={[s.iconBtn, { backgroundColor: th.expBg }]}>
            <Ionicons name="trash-outline" size={15} color={th.exp} />
          </Touchable>
        </View>
      </View>
    );
  };

  return (
    <View>
      <View style={[s.summary, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={{ color: th.sub, fontSize: 12, ...weight('900'), textAlign: align }}>{T.totalSaved}</Text>
        <Text style={{ color: th.text, fontSize: 30, ...weight('900'), marginTop: 6, textAlign: align }}>
          {fmt(totals.saved)} {sym}
        </Text>
      </View>

      {rows.length === 0 && (
        <Text style={{ color: th.sub, fontSize: 12, textAlign: 'center', marginTop: 14 }}>{T.empty}</Text>
      )}

      {rows.map((goal) => {
        const current = Number(goal.cur || 0);
        const target = Number(goal.target || 0);
        const progress = pct(current, target);
        const done = current >= target;
        const remaining = Math.max(0, target - current);
        const lastSaving = (goal.savings || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0))[0];
        const open = openId === goal.id;
        const editing = editingGoal?.id === goal.id;

        return (
          <View key={goal.id} style={[s.card, { backgroundColor: th.card, borderColor: done ? `${th.inc}33` : th.border }]}>
            {editing ? (
              <View>
                <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.editTitle}</Text>
                <TextInput
                  value={editingGoal.name}
                  onChangeText={(name) => setEditingGoal(prev => ({ ...prev, name }))}
                  placeholder={L.goalName}
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <TextInput
                  value={editingGoal.target}
                  onChangeText={(value) => setEditingGoal(prev => ({ ...prev, target: value }))}
                  keyboardType="numeric"
                  placeholder={`${L.goalTargetAmount} (${sym})`}
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                />
                <TextInput
                  value={editingGoal.createdAt}
                  onChangeText={(createdAt) => setEditingGoal(prev => ({ ...prev, createdAt }))}
                  keyboardType="numbers-and-punctuation"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={th.sub}
                  style={[s.input, { backgroundColor: th.input, color: !editingGoal.createdAt || isISODate(editingGoal.createdAt) ? th.text : th.exp, borderColor: th.border, textAlign: 'center' }]}
                />
                <View style={[s.editActions, { flexDirection: rowDir }]}>
                  <Touchable onPress={() => setEditingGoal(null)} style={[s.halfBtn, { backgroundColor: th.cardHigh }]}>
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{cfg.lang === 'ar' ? 'إلغاء' : 'Cancel'}</Text>
                  </Touchable>
                  <Touchable onPress={saveGoalEdit} style={[s.halfBtn, { backgroundColor: th.primary }]}>
                    <Text style={{ color: th.onPrimary, ...weight('800'), fontSize: 12 }}>{L.save}</Text>
                  </Touchable>
                </View>
              </View>
            ) : (
              <>
                <View style={[s.headRow, { flexDirection: rowDir }]}>
                  <View style={[s.titleWrap, { flexDirection: rowDir }]}>
                    <View style={[s.iconBox, { backgroundColor: done ? th.incBg : th.primSoft }]}>
                      <Ionicons name="flag-outline" size={17} color={done ? th.inc : th.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: th.text, ...weight('900'), fontSize: 15, textAlign: align }} numberOfLines={1}>{goal.name}</Text>
                      <Text style={{ color: done ? th.inc : th.sub, fontSize: 11, marginTop: 3, textAlign: align }}>
                        {done ? L.completed : `${T.remaining}: ${fmt(remaining)} ${sym}`}
                      </Text>
                    </View>
                  </View>
                  <View style={[s.iconActions, { flexDirection: rowDir }]}>
                    <Touchable onPress={() => startGoalEdit(goal)} style={[s.iconBtn, { backgroundColor: th.cardHigh }]}>
                      <Ionicons name="create-outline" size={15} color={th.sub} />
                    </Touchable>
                    <Touchable onPress={() => confirmDeleteGoal(goal.id)} style={[s.iconBtn, { backgroundColor: th.expBg }]}>
                      <Ionicons name="trash-outline" size={15} color={th.exp} />
                    </Touchable>
                  </View>
                </View>

                <View style={[s.amountPanel, { backgroundColor: th.cardHigh }]}>
                  <Text style={{ color: done ? th.inc : th.primary, fontSize: 22, lineHeight: 29, ...weight('900'), textAlign: align }} numberOfLines={1} adjustsFontSizeToFit>
                    {fmt(current)} {sym}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: align }}>
                    {T.target}: {fmt(target)} {sym} · {T.progress}: {progress}%{lastSaving?.date ? ` · ${T.lastSave}: ${lastSaving.date}` : ''}
                  </Text>
                </View>

                <View style={[s.progressBg, { backgroundColor: th.cardHigh }]}>
                  <View style={[s.progressFg, { width: `${progress}%`, backgroundColor: done ? th.inc : th.primary }]} />
                </View>
                <View style={[s.rowMeta, { flexDirection: rowDir }]}>
                  <Text style={{ color: th.sub, fontSize: 12, textAlign: align }}>{done ? T.complete : `${fmt(remaining)} ${sym}`}</Text>
                  <Text style={{ color: done ? th.inc : th.primary, fontSize: 12, ...weight('900') }}>{progress}%</Text>
                </View>

                <View style={[s.editActions, { flexDirection: rowDir }]}>
                  {!done && (
                    <Touchable onPress={() => onQuickSave(goal.id)} style={[s.halfBtn, { backgroundColor: th.primSoft }]}>
                      <Text style={{ color: th.primary, ...weight('900'), fontSize: 12 }}>{T.saveAction}</Text>
                    </Touchable>
                  )}
                  <Touchable
                    onPress={() => setOpenId(open ? null : goal.id)}
                    style={[s.halfBtn, { backgroundColor: th.cardHigh, flexDirection: rowDir, alignItems: 'center', justifyContent: 'center', gap: 4 }]}
                  >
                    <Text style={{ color: th.sub, ...weight('800'), fontSize: 12 }}>{T.showHistory}</Text>
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={12} color={th.sub} />
                  </Touchable>
                </View>

                {open && (
                  <View style={s.histBox}>
                    {(!goal.savings || goal.savings.length === 0) && (
                      <Text style={{ color: th.faint, fontSize: 11, textAlign: align }}>{T.noHistory}</Text>
                    )}
                    {(goal.savings || []).map(saving => renderSaving(goal.id, saving))}
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
