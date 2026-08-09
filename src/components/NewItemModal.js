import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, ScrollView, Pressable, StyleSheet, Switch, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { today, isISODate } from '../utils/calc';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletLabel, sortWalletsByDefault } from '../lib/wallets';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { weight } from '../lib/tokens';
import DateField from './DateField';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
import { filterByActiveScope, getModules, getTrackerKinds } from '../lib/modules';
import { suggestCategoryForText } from '../lib/localIntelligence';
import { CATEGORY_FLOWS, getCategoriesForFlow } from '../lib/categories';

const cleanNumber = parseNumberInput;
const monthStartISO = (value = today()) => `${String(value).slice(0, 7)}-01`;

const modalCopy = (lang = 'ar') => {
  const ar = lang === 'ar';
  return {
    owed: ar ? 'دين عليّ' : 'Debt I owe',
    receivable: ar ? 'دين لي' : 'Debt owed to me',
    goal: ar ? 'توفير' : 'Saving',
    commitment: ar ? 'التزام' : 'Commitment',
    trackerTitle: ar ? 'متابعة جديدة' : 'New tracker',
    planTitle: ar ? 'التزام مرتبط' : 'Linked commitment',
    planSubtitle: ar ? 'أنشئ التزاماً بدفعة شهرية مرتبطة بالدين أو هدف التوفير' : 'Create a monthly payment commitment for this debt or saving goal',
    nameDebt: ar ? 'اسم الدين' : 'Debt name',
    nameGoal: ar ? 'اسم التوفير' : 'Saving name',
    nameCommitment: ar ? 'اسم الالتزام' : 'Commitment name',
    totalDebt: ar ? 'إجمالي الدين' : 'Total debt',
    totalGoal: ar ? 'المبلغ المطلوب' : 'Target amount',
    totalCommitment: ar ? 'مبلغ الالتزام' : 'Commitment amount',
    startDate: ar ? 'تاريخ البداية' : 'Start date',
    linkPlan: ar ? 'إضافة التزام شهري مرتبط' : 'Add linked monthly commitment',
    linkPlanHint: ar ? 'سينشئ التزاماً بدفعة شهرية مرتبطة بالدين أو هدف التوفير.' : 'Creates a monthly payment commitment linked to this debt or saving goal.',
    planAmount: ar ? 'قيمة الدفعة الشهرية' : 'Monthly payment amount',
    planDate: ar ? 'شهر بدء الالتزام' : 'First commitment month',
    wallet: ar ? 'محفظة الدفع' : 'Payment wallet',
    category: ar ? 'فئة الالتزام' : 'Commitment category',
    categoryHint: ar ? 'نقترح الفئة من اسم الالتزام ويمكنك تغييرها يدوياً.' : 'We suggest a category from the name; you can override it.',
    debtOrigin: ar ? 'هل تغيّر رصيدك الآن؟' : 'Did your balance change now?',
    previousDebt: ar ? 'لا، دين قديم' : 'No, an old debt',
    receivedDebt: ar ? 'نعم، استلمت المبلغ' : 'Yes, I received it',
    lentDebt: ar ? 'نعم، أعطيت المبلغ' : 'Yes, I gave it',
    previousHint: ar ? 'اخترها إذا هذا دين من قبل ما تستخدم MYFI — رصيدك الحالي ما يتغيّر.' : 'Pick this if the debt existed before you used MYFI — your current balance stays the same.',
    receivedHint: ar ? 'اخترها إذا الفلوس دخلت حسابك الحين — رصيدك يرتفع بقيمة الدين.' : 'Pick this if the money entered your account now — your balance goes up by the debt amount.',
    lentHint: ar ? 'اخترها إذا الفلوس خرجت من حسابك الحين — رصيدك ينزل بقيمة الدين.' : 'Pick this if the money left your account now — your balance goes down by the debt amount.',
    savingReservedHint: ar
      ? 'هذا المبلغ يبقى بمحفظتك، بس نطرحه من رصيدك القابل للصرف لحد ما توصل الهدف أو تسحب التوفير.'
      : 'This amount stays in your wallet, but we subtract it from your spendable balance until you reach the goal or withdraw the saving.',
    linkedTo: ar ? 'مرتبطة بـ' : 'Linked to',
    saveTracker: ar ? 'حفظ المتابعة' : 'Save tracker',
    saveCommitment: ar ? 'حفظ الالتزام' : 'Save commitment',
    savePlan: ar ? 'حفظ الالتزام' : 'Save commitment',
    debtPlaceholder: ar ? 'مثلاً: قسط سيارة' : 'e.g. Car payment',
    receivablePlaceholder: ar ? 'مثلاً: دين لصديق' : 'e.g. Loan to a friend',
    goalPlaceholder: ar ? 'مثلاً: سفر' : 'e.g. Travel',
    commitmentPlaceholder: ar ? 'مثلاً: إيجار أو اشتراك إنترنت' : 'e.g. Rent or internet subscription',
  };
};

export default function NewItemModal({ visible, kind, onClose, preset = null }) {
  const { addDebt, addGoal, addCommitment, setCfg, cfg, wallets, cats, trans } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = modalCopy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const modules = getModules(cfg);
  const commitmentCategories = getCategoriesForFlow(cats, CATEGORY_FLOWS.EXPENSE);
  const enabledKinds = getTrackerKinds(cfg);
  const scopedWallets = filterByActiveScope(wallets, cfg);
  const walletList = sortWalletsByDefault(scopedWallets.length ? scopedWallets : wallets, cfg.currency, cfg.defaultWalletId);
  const defaultWalletId = getDefaultWalletId(walletList, cfg.currency, cfg.defaultWalletId);
  const walletBalanceRows = getWalletAvailableBalances(
    walletList,
    trans,
    cfg.currency,
    defaultWalletId,
  );
  const walletBalanceById = (id) => walletBalanceRows.find(item => item.id === id) || walletList.find(item => item.id === id) || null;
  const insets = useSafeAreaInsets();
  const isAr = cfg.lang === 'ar';
  const align = isAr ? 'right' : 'left';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const isTracker = kind === 'tracker';
  const linkedPlanMode = !!preset?.planOnly && !!preset?.linkedId;
  const requestedTrackerType = ['owed', 'receivable', 'goal', 'commitment'].includes(preset?.trackerType)
    ? preset.trackerType
    : null;
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
  const [originMode, setOriginMode] = useState('previous');
  const [commitmentCat, setCommitmentCat] = useState('other');
  const [commitmentCatTouched, setCommitmentCatTouched] = useState(false);
  const [expandedPicker, setExpandedPicker] = useState(null);

  useEffect(() => {
    if (!visible) return;
    const presetName = linkedPlanMode ? String(preset?.linkedName || '').trim() : '';
    setTrackerType(linkedPlanMode
      ? presetKind
      : enabledKinds.includes(requestedTrackerType)
        ? requestedTrackerType
        : (enabledKinds[0] || 'owed'));
    setName(presetName);
    setAmt('');
    setStartDate(today());
    setWithPlan(false);
    setPlanAmount('');
    setPlanDate(monthStartISO());
    setPlanWalletId(defaultWalletId);
    setOriginMode('previous');
    setCommitmentCat(suggestCategoryForText(presetName, commitmentCategories));
    setCommitmentCatTouched(false);
    setExpandedPicker(null);
  }, [visible, linkedPlanMode, presetKind, preset?.linkedName, requestedTrackerType, defaultWalletId]);

  const currentKind = linkedPlanMode
    ? presetKind
    : isTracker
      ? trackerType
      : (kind === 'debt' ? 'owed' : kind);
  const isDebt = currentKind === 'owed' || currentKind === 'receivable';
  const isReceivable = currentKind === 'receivable';
  const isGoal = currentKind === 'goal';
  const isCommitment = currentKind === 'commitment';
  const canLinkPlan = modules.commitments && !linkedPlanMode && (isDebt || isGoal);
  const activeColor = linkedPlanMode ? th.warn : isCommitment ? th.warn : isGoal ? th.primary : isReceivable ? th.inc : th.exp;
  const saveLabel = linkedPlanMode ? T.savePlan : isCommitment ? T.saveCommitment : isTracker ? T.saveTracker : L.save;

  const trackerTypes = [
    { value: 'owed', label: T.owed, icon: 'card-outline', color: th.exp },
    { value: 'receivable', label: T.receivable, icon: 'cash-outline', color: th.inc },
    { value: 'goal', label: T.goal, icon: 'flag-outline', color: th.primary },
    { value: 'commitment', label: T.commitment, icon: 'calendar-outline', color: th.warn },
  ].filter(option => (
    enabledKinds.includes(option.value)
    || (option.value === 'receivable' && modules.debtsOwed)
  ));

  const selectTrackerType = async (value) => {
    setTrackerType(value);
    setOriginMode('previous');
    if (value === 'commitment') {
      setStartDate(monthStartISO());
      setCommitmentCat(suggestCategoryForText(name, commitmentCategories));
      setCommitmentCatTouched(false);
    }
    if (value === 'receivable' && !modules.debtsReceivable) {
      await setCfg({ enabledModules: { debtsReceivable: true } });
    }
  };

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
    setPlanDate(monthStartISO());
    setPlanWalletId(defaultWalletId);
    setOriginMode('previous');
    setCommitmentCat('other');
    setCommitmentCatTouched(false);
    setExpandedPicker(null);
  };

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const togglePlan = (value) => {
    setWithPlan(value);
    if (value) {
      if (!isISODate(planDate)) setPlanDate(startDate);
    }
  };

  const handleNameChange = (value) => {
    setName(value);
    if (isCommitment && !commitmentCatTouched) {
      setCommitmentCat(suggestCategoryForText(value, commitmentCategories));
    }
  };

  const selectCommitmentCategory = (catId) => {
    setCommitmentCat(catId);
    setCommitmentCatTouched(true);
  };

  const walletOptions = walletList.map(wallet => {
    const info = walletBalanceById(wallet.id) || wallet;
    const total = Number(info?.balance || 0);
    const available = Number(info?.availableBalance ?? total);
    return {
      value: wallet.id,
      label: getWalletLabel(wallet, cfg.lang),
      detail: `${isAr ? 'متاح' : 'Available'} ${Math.round(available).toLocaleString()} ${sym} · ${isAr ? 'كلي' : 'Total'} ${Math.round(total).toLocaleString()} ${sym}`,
      icon: 'wallet-outline',
      color: available >= 0 ? th.primary : th.exp,
    };
  });

  const commitmentCategoryOptions = commitmentCategories.map(cat => ({
    value: cat.id,
    label: (isAr ? cat.label : cat.labelEn) || cat.label || cat.labelEn || cat.id,
    icon: cat.icon || 'pricetag-outline',
    color: cat.color || th.primary,
  }));

  const renderSelectField = ({ id, label, value, options, onChange, icon = 'chevron-down-outline', tone = th.sub }) => {
    const selected = options.find(option => option.value === value) || options[0];
    const expanded = expandedPicker?.id === id;
    return (
      <View style={s.selectFieldBlock}>
        <TouchableOpacity
          onPress={() => setExpandedPicker(expanded ? null : { id, label, value, options, onChange, icon, tone })}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={[s.selectField, { backgroundColor: th.input, borderColor: expanded ? th.primary : th.border, flexDirection: rowDir }]}
        >
          <Ionicons name={icon} size={18} color={tone} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.selectLabel, { color: th.sub, textAlign: align }]}>{label}</Text>
            <Text numberOfLines={1} style={[s.selectValue, { color: th.text, textAlign: align }]}>
              {selected?.label || (isAr ? 'اختر' : 'Choose')}
            </Text>
            <Text numberOfLines={1} style={[s.selectDetail, { color: th.sub, textAlign: align }]}>
              {selected?.detail || ' '}
            </Text>
          </View>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={th.sub} />
        </TouchableOpacity>
      </View>
    );
  };

  const handleSave = async () => {
    const totalValue = Math.abs(cleanNumber(amt));
    const linkedValue = Math.abs(cleanNumber(planAmount));

    if (linkedPlanMode) {
      if (!(linkedValue > 0) || !isISODate(planDate)) return;
      const linkedName = String(preset?.linkedName || '').trim() || T.planTitle;
      await addCommitment({
        name: linkedName,
        amt: linkedValue,
        firstDueISO: monthStartISO(planDate),
        walletId: planWalletId,
        cat: preset?.cat || suggestCategoryForText(linkedName, cats),
        linkedType: preset?.linkedType || 'debt',
        linkedId: preset?.linkedId || null,
      });
      handleClose();
      return;
    }

    if (!name.trim() || !(totalValue > 0) || !isISODate(startDate)) {
      Alert.alert(
        '',
        isAr
          ? 'أدخل الاسم والمبلغ وتاريخًا صحيحًا.'
          : 'Enter a name, amount, and valid date.',
      );
      return;
    }
    if (isCommitment) {
      await addCommitment({
        name: name.trim(),
        amt: totalValue,
        firstDueISO: monthStartISO(startDate),
        walletId: planWalletId,
        cat: commitmentCat || suggestCategoryForText(name, commitmentCategories),
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
        originMode,
        walletId: planWalletId,
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
        firstDueISO: monthStartISO(planDate),
        walletId: planWalletId,
        cat: suggestCategoryForText(name, cats),
        linkedType: isGoal ? 'goal' : isReceivable ? 'receivable' : 'debt',
        linkedId: created.id,
      });
    }

    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={[s.overlay, { backgroundColor: th.overlay }]}
      >
        <View style={s.dismissArea}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        <View style={[s.sheet, { backgroundColor: th.card, maxHeight: '88%', paddingBottom: 0 }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
            contentContainerStyle={{ paddingBottom: 14 }}
          >
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.headRow, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={handleClose} style={[s.headerIconBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="chevron-down" size={18} color={th.sub} />
            </TouchableOpacity>
            <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{title}</Text>
            <View style={s.headerIconBtn} />
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
                      <TouchableOpacity
                        key={option.value}
                        onPress={() => selectTrackerType(option.value)}
                        style={[s.typeBtn, { backgroundColor: active ? option.color : th.cardHigh, borderColor: active ? option.color : th.border }]}
                      >
                        <Ionicons name={option.icon} size={18} color={active ? '#fff' : option.color} />
                        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: active ? '#fff' : th.sub, fontSize: 11, ...weight('900'), textAlign: 'center' }}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[s.label, { color: th.sub, textAlign: align }]}>{nameLabel}</Text>
              <TextInput
                value={name}
                onChangeText={handleNameChange}
                placeholder={placeholder}
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
              />

              <Text style={[s.label, { color: th.sub, textAlign: align }]}>{amountLabel} ({sym})</Text>
              <TextInput
                value={amt}
                onChangeText={(value) => setAmt(formatNumberInput(value))}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
              />

              {isCommitment ? (
                <View style={s.categoryBlock}>
                  {renderSelectField({
                    id: 'commitment-category',
                    label: T.category,
                    value: commitmentCat,
                    options: commitmentCategoryOptions,
                    icon: 'pricetag-outline',
                    tone: th.warn,
                    onChange: selectCommitmentCategory,
                  })}
                  <Text style={[s.categoryHint, { color: th.faint, textAlign: align }]}>{T.categoryHint}</Text>
                </View>
              ) : null}

              {isGoal ? (
                <Text style={{ color: th.faint, fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: align, marginBottom: 14 }}>
                  {T.savingReservedHint}
                </Text>
              ) : null}

              {isCommitment ? (
                <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                  <DateField
                    value={startDate}
                    onChange={setStartDate}
                    th={th}
                    lang={cfg.lang}
                    monthNameStyle={cfg.monthNameStyle}
                    label={T.planDate}
                    monthOnly
                    style={s.selectFieldBlock}
                    buttonStyle={s.dateButton}
                  />
                  {walletList.length > 0 ? renderSelectField({
                    id: 'commitment-wallet',
                    label: T.wallet,
                    value: planWalletId,
                    options: walletOptions,
                    icon: 'wallet-outline',
                    tone: th.primary,
                    onChange: setPlanWalletId,
                  }) : null}
                </View>
              ) : (
                <DateField
                  value={startDate}
                  onChange={setStartDate}
                  th={th}
                  lang={cfg.lang}
                  monthNameStyle={cfg.monthNameStyle}
                  label={T.startDate}
                  style={{ marginBottom: 16 }}
                  buttonStyle={s.dateButton}
                />
              )}

              {isDebt ? (
                <View style={s.originBlock}>
                  <Text style={[s.label, { color: th.sub, textAlign: align }]}>{T.debtOrigin}</Text>
                  <View style={[s.originModes, { flexDirection: rowDir }]}>
                    {[
                      { value: 'previous', label: T.previousDebt },
                      ...(isReceivable
                        ? [{ value: 'lent', label: T.lentDebt }]
                        : [{ value: 'received', label: T.receivedDebt }]),
                    ].map(option => {
                      const active = originMode === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          onPress={() => setOriginMode(option.value)}
                          style={[s.originMode, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
                        >
                          <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ color: th.faint, fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: align }}>
                    {originMode === 'received' ? T.receivedHint : originMode === 'lent' ? T.lentHint : T.previousHint}
                  </Text>
                </View>
              ) : null}

              {isDebt && originMode !== 'previous' && walletList.length > 0 ? (
                <View style={s.walletBlock}>
                  {renderSelectField({
                    id: 'origin-wallet',
                    label: T.wallet,
                    value: planWalletId,
                    options: walletOptions,
                    icon: 'wallet-outline',
                    tone: th.primary,
                    onChange: setPlanWalletId,
                  })}
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
                    <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('700'), marginTop: 3, textAlign: align }}>{T.linkPlanHint}</Text>
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
                    onChangeText={(value) => setPlanAmount(formatNumberInput(value))}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={th.sub}
                    style={[s.input, s.planInput, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: align }]}
                  />

                  <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                    <DateField
                      value={planDate}
                      onChange={setPlanDate}
                      th={th}
                      lang={cfg.lang}
                      monthNameStyle={cfg.monthNameStyle}
                      label={T.planDate}
                      monthOnly
                      style={s.selectFieldBlock}
                      buttonStyle={s.dateButton}
                    />
                    {walletList.length > 0 ? renderSelectField({
                      id: 'plan-wallet',
                      label: T.wallet,
                      value: planWalletId,
                      options: walletOptions,
                      icon: 'wallet-outline',
                      tone: th.primary,
                      onChange: setPlanWalletId,
                    }) : null}
                  </View>
                </View>
              ) : null}
            </>
          ) : null}
          </ScrollView>

          <View
            style={[
              s.stickyFooter,
              {
                backgroundColor: th.card,
                borderTopColor: th.border,
                paddingBottom: Math.max(insets.bottom, 8),
              },
            ]}
          >
            <TouchableOpacity
              onPress={handleSave}
              style={[s.footerSaveBtn, { backgroundColor: linkedPlanMode ? th.warn : activeColor }]}
            >
              <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
              <Text style={{ color: '#fff', ...weight('900'), fontSize: 14 }}>{saveLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={!!expandedPicker}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedPicker(null)}
      >
        <View style={[s.selectSheetOverlay, { backgroundColor: th.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setExpandedPicker(null)} />
          <View style={[s.selectSheetPanel, { backgroundColor: th.card, borderColor: th.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={[s.selectSheetHead, { flexDirection: rowDir }]}>
              <View style={[s.selectSheetIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name={expandedPicker?.icon || 'chevron-down-outline'} size={18} color={expandedPicker?.tone || th.primary} />
              </View>
              <Text style={[s.selectSheetTitle, { color: th.text, textAlign: align }]} numberOfLines={1}>
                {expandedPicker?.label || (isAr ? 'اختر' : 'Choose')}
              </Text>
              <TouchableOpacity onPress={() => setExpandedPicker(null)} style={[s.selectSheetClose, { backgroundColor: th.cardHigh }]}>
                <Ionicons name="chevron-down" size={18} color={th.sub} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} style={s.selectSheetList}>
              {expandedPicker?.options?.length ? expandedPicker.options.map(option => {
                const active = option.value === expandedPicker.value;
                const optionColor = option.color || (active ? th.primary : th.sub);
                return (
                  <TouchableOpacity
                    key={String(option.value)}
                    onPress={() => {
                      expandedPicker.onChange?.(option.value, option);
                      setExpandedPicker(null);
                    }}
                    style={[s.selectSheetOption, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border, flexDirection: rowDir }]}
                  >
                    <Ionicons name={option.icon || 'ellipse-outline'} size={18} color={optionColor} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: active ? th.primary : th.text, fontSize: 13, ...weight(active ? '900' : '800'), textAlign: align }}>
                        {option.label}
                      </Text>
                      {option.detail ? (
                        <Text numberOfLines={1} style={{ color: th.sub, fontSize: 10, lineHeight: 15, ...weight('700'), textAlign: align, marginTop: 2 }}>
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              }) : (
                <Text style={[s.emptySelect, { color: th.faint, textAlign: align }]}>
                  {isAr ? 'لا توجد خيارات متاحة' : 'No options available'}
                </Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  dismissArea: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerIconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, lineHeight: 24, ...weight('900') },
  typeGrid: { gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  typeBtn: { width: '48.5%', minWidth: 0, minHeight: 70, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  infoBox: { borderRadius: 14, borderWidth: 0.5, padding: 12, gap: 10, marginBottom: 16, alignItems: 'center' },
  infoIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 14, fontSize: 14, lineHeight: 19, ...weight('700') },
  dateRow: { justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 16, gap: 12 },
  walletBlock: { marginBottom: 16 },
  categoryBlock: { marginBottom: 16 },
  categoryHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: -3, marginBottom: 9 },
  originBlock: { marginBottom: 14 },
  goalPurposeBlock: { marginBottom: 14 },
  originModes: { gap: 8, marginBottom: 7 },
  originMode: { flex: 1, minHeight: 40, borderRadius: 11, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  twoColumnRow: { alignItems: 'stretch', gap: 8, marginBottom: 8 },
  selectFieldBlock: { flex: 1, minWidth: 0, marginBottom: 7 },
  selectField: { minHeight: 64, alignItems: 'center', gap: 8, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 7 },
  selectLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  selectValue: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 1 },
  selectDetail: { fontSize: 9, lineHeight: 13, ...weight('700'), marginTop: 1 },
  dateButton: { minHeight: 64, paddingHorizontal: 10 },
  emptySelect: { padding: 10, fontSize: 12, ...weight('700') },
  selectSheetOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  selectSheetPanel: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '54%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10 },
  selectSheetHead: { minHeight: 42, alignItems: 'center', gap: 9, marginBottom: 8 },
  selectSheetIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetTitle: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, ...weight('900') },
  selectSheetClose: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetList: { width: '100%' },
  selectSheetOption: { minHeight: 48, alignItems: 'center', gap: 9, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7 },
  planToggle: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12, gap: 10, alignItems: 'center', marginBottom: 14 },
  planSection: { borderRadius: 14, borderWidth: 0.5, padding: 12, marginBottom: 16 },
  planHead: { alignItems: 'center', gap: 7, marginBottom: 10 },
  planInput: { marginBottom: 12 },
  saveBtn: { minHeight: 52, borderRadius: 15, padding: 15, alignItems: 'center', justifyContent: 'center' },
  stickyFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  footerSaveBtn: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
    paddingHorizontal: 14,
  },

});
