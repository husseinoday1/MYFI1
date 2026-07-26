import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, ScrollView, StyleSheet, Switch } from 'react-native';
import { Touchable } from './AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { today, isISODate } from '../utils/calc';
import { getDefaultWalletId, getWalletLabel, sortWalletsByDefault } from '../lib/wallets';

const modalCopy = (lang = 'ar') => {
  const ar = lang === 'ar';
  return {
    owed: ar ? 'مبلغ عليّ' : 'I owe',
    receivable: ar ? 'مبلغ لي' : 'Owed to me',
    goal: ar ? 'توفير' : 'Saving',
    commitment: ar ? 'التزام' : 'Commitment',
    trackerTitle: ar ? 'متابعة جديدة' : 'New tracker',
    planTitle: ar ? 'خطة شهرية' : 'Monthly plan',
    planSubtitle: ar ? 'اربطها من نفس مكان الدين أو الهدف' : 'Link it from the same debt or goal flow',
    nameDebt: ar ? 'اسم المتابعة' : 'Tracker name',
    nameGoal: ar ? 'اسم التوفير' : 'Saving name',
    nameCommitment: ar ? 'اسم الالتزام' : 'Commitment name',
    totalDebt: ar ? 'المبلغ الكلي' : 'Total amount',
    totalGoal: ar ? 'المبلغ المطلوب' : 'Target amount',
    totalCommitment: ar ? 'مبلغ الالتزام' : 'Commitment amount',
    startDate: ar ? 'تاريخ البداية' : 'Start date',
    linkPlan: ar ? 'إضافة خطة شهرية معه' : 'Add monthly plan',
    linkPlanHint: ar ? 'سيظهر كدفعة شهرية مرتبطة بنفس الدين أو الهدف.' : 'It will appear as a monthly payment linked to the same item.',
    planAmount: ar ? 'قيمة الدفعة الشهرية' : 'Monthly payment amount',
    planDate: ar ? 'أول موعد دفع' : 'First payment date',
    wallet: ar ? 'محفظة الدفع' : 'Payment wallet',
    linkedTo: ar ? 'مرتبطة بـ' : 'Linked to',
    saveTracker: ar ? 'حفظ المتابعة' : 'Save tracker',
    saveCommitment: ar ? 'حفظ الالتزام' : 'Save commitment',
    savePlan: ar ? 'حفظ الخطة الشهرية' : 'Save monthly plan',
    debtPlaceholder: ar ? 'مثلاً: قسط سيارة' : 'e.g. Car payment',
    receivablePlaceholder: ar ? 'مثلاً: سلفة لصديق' : 'e.g. Loan to a friend',
    goalPlaceholder: ar ? 'مثلاً: سفر' : 'e.g. Travel',
    commitmentPlaceholder: ar ? 'مثلاً: إيجار أو اشتراك إنترنت' : 'e.g. Rent or internet subscription',
  };
};

export default function NewItemModal({ visible, kind, onClose, preset = null }) {
  const { addDebt, addGoal, addCommitment, cfg, wallets } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = modalCopy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const walletList = sortWalletsByDefault(wallets, cfg.currency, cfg.defaultWalletId);
  const defaultWalletId = getDefaultWalletId(walletList, cfg.currency, cfg.defaultWalletId);
  const insets = useSafeAreaInsets();
  const isAr = cfg.lang === 'ar';
  const align = isAr ? 'right' : 'left';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const isTracker = kind === 'tracker';
  const linkedPlanMode = !!preset?.planOnly && !!preset?.linkedId;
  const presetKind = preset?.linkedType === 'goal'
    ? 'goal'
    : preset?.linkedType === 'receivable'
      ? 'receivable'
      : 'owed';

  const [trackerType, setTrackerType] = useState('owed');
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [withPlan, setWithPlan] = useState(false);
  const [planAmount, setPlanAmount] = useState('');
  const [planDate, setPlanDate] = useState(today());
  const [planWalletId, setPlanWalletId] = useState(defaultWalletId);

  useEffect(() => {
    if (!visible) return;
    setTrackerType(linkedPlanMode ? presetKind : 'owed');
    setName(linkedPlanMode ? String(preset?.linkedName || '').trim() : '');
    setAmt('');
    setStartDate(today());
    setWithPlan(false);
    setPlanAmount('');
    setPlanDate(today());
    setPlanWalletId(defaultWalletId);
  }, [visible, linkedPlanMode, presetKind, preset?.linkedName, defaultWalletId]);

  const currentKind = linkedPlanMode
    ? presetKind
    : isTracker
      ? trackerType
      : (kind === 'debt' ? 'owed' : kind);
  const isDebt = currentKind === 'owed' || currentKind === 'receivable';
  const isReceivable = currentKind === 'receivable';
  const isGoal = currentKind === 'goal';
  const isCommitment = currentKind === 'commitment';
  const canLinkPlan = !linkedPlanMode && (isDebt || isGoal);
  const activeColor = linkedPlanMode ? th.warn : isCommitment ? th.warn : isGoal ? th.primary : isReceivable ? th.inc : th.exp;
  const saveLabel = linkedPlanMode ? T.savePlan : isCommitment ? T.saveCommitment : isTracker ? T.saveTracker : L.save;

  const trackerTypes = [
    { value: 'owed', label: T.owed, icon: 'card-outline', color: th.exp },
    { value: 'receivable', label: T.receivable, icon: 'cash-outline', color: th.inc },
    { value: 'goal', label: T.goal, icon: 'flag-outline', color: th.primary },
    { value: 'commitment', label: T.commitment, icon: 'calendar-outline', color: th.warn },
  ];

  const title = linkedPlanMode
    ? T.planTitle
    : isTracker
      ? T.trackerTitle
      : isCommitment
        ? T.commitment
        : isDebt
        ? (isReceivable ? T.receivable : L.newDebt)
        : L.newGoal;
  const nameLabel = isCommitment ? T.nameCommitment : isDebt ? T.nameDebt : T.nameGoal;
  const amountLabel = isCommitment ? T.totalCommitment : isDebt ? T.totalDebt : T.totalGoal;
  const placeholder = isReceivable
    ? T.receivablePlaceholder
    : isCommitment
      ? T.commitmentPlaceholder
      : isDebt
      ? T.debtPlaceholder
      : T.goalPlaceholder;

  const reset = () => {
    setTrackerType('owed');
    setName('');
    setAmt('');
    setStartDate(today());
    setWithPlan(false);
    setPlanAmount('');
    setPlanDate(today());
    setPlanWalletId(defaultWalletId);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const togglePlan = (value) => {
    setWithPlan(value);
    if (value) {
      if (!planAmount && amt) setPlanAmount(amt);
      if (!isISODate(planDate)) setPlanDate(startDate);
    }
  };

  const handleSave = async () => {
    const totalValue = Math.abs(parseFloat(amt) || 0);
    const linkedValue = Math.abs(parseFloat(planAmount) || 0);

    if (linkedPlanMode) {
      if (!(linkedValue > 0) || !isISODate(planDate)) return;
      await addCommitment({
        name: String(preset?.linkedName || '').trim() || T.planTitle,
        amt: linkedValue,
        firstDueISO: planDate,
        walletId: planWalletId,
        linkedType: preset?.linkedType || 'debt',
        linkedId: preset?.linkedId || null,
      });
      handleClose();
      return;
    }

    if (!name.trim() || !(totalValue > 0) || !isISODate(startDate)) return;
    if (isCommitment) {
      await addCommitment({
        name: name.trim(),
        amt: totalValue,
        firstDueISO: startDate,
        walletId: planWalletId,
        linkedType: 'none',
      });
      handleClose();
      return;
    }

    if (withPlan && (!(linkedValue > 0) || !isISODate(planDate))) return;

    let created = null;
    if (isDebt) {
      created = await addDebt({
        name: name.trim(),
        total: totalValue,
        createdAt: startDate,
        direction: isReceivable ? 'receivable' : 'owed',
      });
    } else {
      created = await addGoal({
        name: name.trim(),
        target: totalValue,
        createdAt: startDate,
      });
    }

    if (withPlan && created?.id) {
      await addCommitment({
        name: name.trim(),
        amt: linkedValue,
        firstDueISO: planDate,
        walletId: planWalletId,
        linkedType: isGoal ? 'goal' : isReceivable ? 'receivable' : 'debt',
        linkedId: created.id,
      });
    }

    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Touchable style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={handleClose}>
        <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, maxHeight: '90%', paddingBottom: 20 + Math.max(insets.bottom, 8) }]}>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.headRow, { flexDirection: rowDir }]}>
            <Touchable onPress={handleClose} hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}>
              <Ionicons name="close" size={20} color={th.sub} />
            </Touchable>
            <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{title}</Text>
            <View style={{ width: 20 }} />
          </View>

          {linkedPlanMode ? (
            <View style={[s.infoBox, { backgroundColor: th.warnBg, borderColor: th.border, flexDirection: rowDir }]}>
              <View style={[s.infoIcon, { backgroundColor: `${th.warn}22` }]}>
                <Ionicons name="calendar-outline" size={16} color={th.warn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: th.warn, fontSize: 12, ...weight('900'), textAlign: align }}>{T.linkedTo}</Text>
                <Text style={{ color: th.text, fontSize: 14, ...weight('900'), marginTop: 2, textAlign: align }}>
                  {preset?.linkedName || '-'}
                </Text>
              </View>
            </View>
          ) : (
            <>
              {isTracker ? (
                <View style={[s.typeGrid, { flexDirection: rowDir }]}>
                  {trackerTypes.map(option => {
                    const active = trackerType === option.value;
                    return (
                      <Touchable
                        key={option.value}
                        onPress={() => setTrackerType(option.value)}
                        style={[s.typeBtn, { backgroundColor: active ? `${option.color}22` : th.cardHigh, borderColor: active ? option.color : 'transparent' }]}
                      >
                        <Ionicons name={option.icon} size={16} color={active ? option.color : th.sub} />
                        <Text style={{ color: active ? option.color : th.sub, fontSize: 11, ...weight('900'), textAlign: 'center' }}>
                          {option.label}
                        </Text>
                      </Touchable>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[s.label, { color: th.sub, textAlign: align }]}>{nameLabel}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder={placeholder}
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
              />

              <Text style={[s.label, { color: th.sub, textAlign: align }]}>{amountLabel} ({sym})</Text>
              <TextInput
                value={amt}
                onChangeText={setAmt}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
              />

              <View style={[s.dateRow, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                <Text style={{ color: th.text, fontSize: 14, lineHeight: 20, ...weight('800') }}>{isCommitment ? T.planDate : T.startDate}</Text>
                <TextInput
                  value={startDate}
                  onChangeText={setStartDate}
                  keyboardType="numbers-and-punctuation"
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={th.sub}
                  style={{ color: isISODate(startDate) ? th.text : th.exp, fontSize: 14, minWidth: 104, textAlign: 'center' }}
                />
              </View>

              {isCommitment && walletList.length > 0 ? (
                <View style={s.walletBlock}>
                  <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.wallet}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.walletRail}>
                    {walletList.map(wallet => {
                      const active = planWalletId === wallet.id;
                      return (
                        <Touchable
                          key={wallet.id}
                          onPress={() => setPlanWalletId(wallet.id)}
                          style={[s.walletChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                        >
                          <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                          <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>
                            {getWalletLabel(wallet, cfg.lang)}
                          </Text>
                        </Touchable>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null}
            </>
          )}

          {linkedPlanMode || canLinkPlan ? (
            <>
              {!linkedPlanMode ? (
                <View style={[s.planToggle, { backgroundColor: th.cardHigh, flexDirection: rowDir }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: align }}>{T.linkPlan}</Text>
                    <Text style={{ color: th.sub, fontSize: 11, ...weight('700'), marginTop: 3, textAlign: align }}>{T.linkPlanHint}</Text>
                  </View>
                  <Switch
                    value={withPlan}
                    onValueChange={togglePlan}
                    trackColor={{ true: th.primary, false: th.border }}
                  />
                </View>
              ) : null}

              {(linkedPlanMode || withPlan) ? (
                <View style={[s.planSection, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                  <View style={[s.planHead, { flexDirection: rowDir }]}>
                    <Ionicons name="calendar-outline" size={16} color={th.warn} />
                    <Text style={{ color: th.text, fontSize: 13, ...weight('900') }}>{T.planTitle}</Text>
                  </View>

                  <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.planAmount} ({sym})</Text>
                  <TextInput
                    value={planAmount}
                    onChangeText={setPlanAmount}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={th.sub}
                    style={[s.input, s.planInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                  />

                  <View style={[s.dateRow, { backgroundColor: th.input, borderWidth: 0.5, borderColor: th.border, flexDirection: rowDir, marginBottom: 0 }]}>
                    <Text style={{ color: th.text, fontSize: 14, lineHeight: 20, ...weight('800') }}>{T.planDate}</Text>
                    <TextInput
                      value={planDate}
                      onChangeText={setPlanDate}
                      keyboardType="numbers-and-punctuation"
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={th.sub}
                      style={{ color: isISODate(planDate) ? th.text : th.exp, fontSize: 14, minWidth: 104, textAlign: 'center' }}
                    />
                  </View>

                  {walletList.length > 0 ? (
                    <View style={[s.walletBlock, { marginTop: 12 }]}>
                      <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.wallet}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.walletRail}>
                        {walletList.map(wallet => {
                          const active = planWalletId === wallet.id;
                          return (
                            <Touchable
                              key={wallet.id}
                              onPress={() => setPlanWalletId(wallet.id)}
                              style={[s.walletChip, { backgroundColor: active ? th.primSoft : th.input, borderColor: active ? th.primary : 'transparent' }]}
                            >
                              <Ionicons name="wallet-outline" size={14} color={active ? th.primary : th.sub} />
                              <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>
                                {getWalletLabel(wallet, cfg.lang)}
                              </Text>
                            </Touchable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          <Touchable onPress={handleSave} style={[s.saveBtn, { backgroundColor: linkedPlanMode ? th.warn : activeColor }]}>
            <Text style={{ color: '#fff', ...weight('800'), fontSize: 15 }}>{saveLabel}</Text>
          </Touchable>
          </ScrollView>
        </Touchable>
      </Touchable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 32 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  title: { flex: 1, fontSize: 18, lineHeight: 24, ...weight('900') },
  typeGrid: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeBtn: { width: '48.5%', minHeight: 54, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  infoBox: { borderRadius: 14, borderWidth: 0.5, padding: 12, gap: 10, marginBottom: 16, alignItems: 'center' },
  infoIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 14, fontSize: 14, lineHeight: 19, ...weight('700') },
  dateRow: { justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 16, gap: 12 },
  walletBlock: { marginBottom: 16 },
  walletRail: { gap: 8 },
  walletChip: { minHeight: 36, borderRadius: 11, borderWidth: 0.5, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 6, flexDirection: 'row' },
  planToggle: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, gap: 10, alignItems: 'center', marginBottom: 14 },
  planSection: { borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 16 },
  planHead: { alignItems: 'center', gap: 7, marginBottom: 10 },
  planInput: { marginBottom: 12 },
  saveBtn: { minHeight: 52, borderRadius: 15, padding: 15, alignItems: 'center', justifyContent: 'center' },
});
