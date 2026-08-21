import React, { useEffect, useState } from 'react';
import { View, Text, Modal, TextInput, ScrollView, Pressable, StyleSheet, Switch, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';
import { useAutomaticSyncInteractionHold } from '../hooks/useAutomaticSyncInteractionHold';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { CURRENCIES, getSymbol } from '../lib/constants';
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
    planDate: ar ? 'تاريخ الدفع' : 'Payment date',
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
    saveDebt: ar ? 'حفظ الدين' : 'Save debt',
    saveGoal: ar ? 'حفظ التوفير' : 'Save saving',
    debtPlaceholder: ar ? 'مثلاً: قسط سيارة' : 'e.g. Car payment',
    receivablePlaceholder: ar ? 'مثلاً: دين لصديق' : 'e.g. Loan to a friend',
    goalPlaceholder: ar ? 'مثلاً: سفر' : 'e.g. Travel',
    commitmentPlaceholder: ar ? 'مثلاً: إيجار أو اشتراك إنترنت' : 'e.g. Rent or internet subscription',
    balanceEffect: ar ? 'أثر الرصيد' : 'Balance effect',
    noBalanceChange: ar ? 'لا يغيّر رصيد المحفظة' : 'No wallet balance change',
    walletEffect: ar ? 'محفظة التأثير' : 'Effect wallet',
    savingMode: ar ? 'طريقة التوفير' : 'Saving method',
    savingReserveLater: ar ? 'الحجز يبدأ عند إضافة مبلغ توفير، وليس عند إنشاء الهدف.' : 'Reserved balance starts when you add a saving amount, not when creating the target.',
    linkedPlanOptional: ar ? 'اختياري · دفعة شهرية' : 'Optional · monthly payment',
    reminderOptional: ar ? 'اختياري · نهاية الشهر' : 'Optional · month end',
    monthlyRepeat: ar ? 'شهري' : 'Monthly',
    oneTimeRepeat: ar ? 'مرة واحدة' : 'One time',
    repeatMode: ar ? 'تكرار الالتزام' : 'Commitment repeat',
    currency: ar ? 'عملة المتابعة' : 'Tracker currency',
    entityBaseRate: ar ? 'سعر الصرف التاريخي إلى العملة الأساسية' : 'Historical rate to base currency',
    walletBaseRate: ar ? 'سعر محفظة الدفع إلى العملة الأساسية' : 'Payment-wallet rate to base currency',
  };
};

export default function NewItemModal({ visible, kind, onClose, preset = null }) {
  useAutomaticSyncInteractionHold(visible, 'new_tracker_editor');
  const { addDebt, addGoal, addCommitment, setCfg, cfg, wallets, cats, trans } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const T = modalCopy(cfg.lang);
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
  const dedicatedTrackerLaunch = isTracker && !!requestedTrackerType && !linkedPlanMode;
  const presetKind = preset?.linkedType === 'goal'
    ? 'goal'
    : preset?.linkedType === 'receivable'
      ? 'receivable'
      : 'owed';

  const [trackerType, setTrackerType] = useState('owed');
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');
  const [entityCurrency, setEntityCurrency] = useState(cfg.currency);
  const [entityBaseRate, setEntityBaseRate] = useState('');
  const [walletBaseRate, setWalletBaseRate] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [withPlan, setWithPlan] = useState(false);
  const [planAmount, setPlanAmount] = useState('');
  const [planDate, setPlanDate] = useState(today());
  const [planWalletId, setPlanWalletId] = useState(defaultWalletId);
  const [originMode, setOriginMode] = useState('previous');
  const [commitmentCat, setCommitmentCat] = useState('other');
  const [commitmentCatTouched, setCommitmentCatTouched] = useState(false);
  const [commitmentRepeatMonthly, setCommitmentRepeatMonthly] = useState(true);
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
    setEntityCurrency(String(preset?.linkedCurrency || cfg.currency || 'IQD').toUpperCase());
    setEntityBaseRate('');
    setWalletBaseRate('');
    setStartDate(today());
    setWithPlan(false);
    setPlanAmount('');
    setPlanDate(today());
    setPlanWalletId(defaultWalletId);
    setOriginMode('previous');
    setCommitmentCat(suggestCategoryForText(presetName, commitmentCategories));
    setCommitmentCatTouched(false);
    setCommitmentRepeatMonthly(true);
    setExpandedPicker(null);
  }, [visible, linkedPlanMode, presetKind, preset?.linkedName, preset?.linkedCurrency, requestedTrackerType, defaultWalletId, cfg.currency]);

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
  const saveLabel = linkedPlanMode
    ? T.savePlan
    : isCommitment
      ? T.saveCommitment
      : isGoal
        ? T.saveGoal
        : isDebt
          ? T.saveDebt
          : isTracker
            ? T.saveTracker
            : L.save;

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
      setStartDate(today());
      setCommitmentCat(suggestCategoryForText(name, commitmentCategories));
      setCommitmentCatTouched(false);
      setCommitmentRepeatMonthly(true);
    }
    if (value === 'receivable' && !modules.debtsReceivable) {
      await setCfg({ enabledModules: { debtsReceivable: true } });
    }
  };

  const title = linkedPlanMode
    ? T.planTitle
    : dedicatedTrackerLaunch
      ? (currentKind === 'receivable' ? T.receivable : currentKind === 'goal' ? T.goal : currentKind === 'commitment' ? T.commitment : T.owed)
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
    setEntityCurrency(cfg.currency);
    setEntityBaseRate('');
    setWalletBaseRate('');
    setStartDate(today());
    setWithPlan(false);
    setPlanAmount('');
    setPlanDate(today());
    setPlanWalletId(defaultWalletId);
    setOriginMode('previous');
    setCommitmentCat('other');
    setCommitmentCatTouched(false);
    setCommitmentRepeatMonthly(true);
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
    const available = Number(info?.availableBalance ?? info?.balance ?? 0);
    return {
      value: wallet.id,
      label: getWalletLabel(wallet, cfg.lang),
      detail: `${isAr ? 'متاح' : 'Available'} ${Math.round(available).toLocaleString()} ${getSymbol(wallet.currency || cfg.currency)}`,
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
  const commitmentRepeatOptions = [
    { value: true, label: T.monthlyRepeat, icon: 'repeat-outline', color: th.warn },
    { value: false, label: T.oneTimeRepeat, icon: 'ellipse-outline', color: th.warn },
  ];
  const currencyOptions = CURRENCIES.map(item => ({
    value: item.code,
    label: `${item.code} · ${isAr ? item.name : item.nameEn}`,
    detail: item.sym,
    icon: 'cash-outline',
    color: th.primary,
  }));
  const selectedEntityCurrency = String(entityCurrency || cfg.currency || 'IQD').toUpperCase();
  const entitySym = getSymbol(selectedEntityCurrency);
  const selectedPaymentWallet = walletList.find(wallet => wallet.id === planWalletId) || walletList[0] || null;
  const selectedPaymentCurrency = String(selectedPaymentWallet?.currency || cfg.currency || 'IQD').toUpperCase();
  const needsEntityOriginRate = isDebt && originMode !== 'previous' && selectedEntityCurrency !== String(cfg.currency || 'IQD').toUpperCase();
  const needsWalletOriginRate = isDebt && originMode !== 'previous'
    && selectedPaymentCurrency !== String(cfg.currency || 'IQD').toUpperCase()
    && selectedPaymentCurrency !== selectedEntityCurrency;
  const trackerMeta = {
    owed: { label: T.owed, icon: 'arrow-down-outline', color: th.exp, bg: th.expBg },
    receivable: { label: T.receivable, icon: 'arrow-up-outline', color: th.inc, bg: th.incBg },
    goal: { label: T.goal, icon: 'flag-outline', color: th.primary, bg: th.primSoft },
    commitment: { label: T.commitment, icon: 'calendar-outline', color: th.warn, bg: th.warnBg },
  };
  const activeMeta = linkedPlanMode
    ? { label: T.planTitle, icon: 'calendar-outline', color: th.warn, bg: th.warnBg }
    : trackerMeta[currentKind] || trackerMeta.owed;
  const amountValue = Math.abs(cleanNumber(amt));
  const moneyPreview = (value) => `${Math.round(Math.abs(Number(value) || 0)).toLocaleString()} ${entitySym}`;
  const originImpactText = originMode === 'received'
    ? (isAr ? `يزيد الرصيد ${moneyPreview(amountValue)}` : `Adds ${moneyPreview(amountValue)} to balance`)
    : originMode === 'lent'
      ? (isAr ? `ينقص الرصيد ${moneyPreview(amountValue)}` : `Subtracts ${moneyPreview(amountValue)} from balance`)
      : T.noBalanceChange;

  const renderTextField = ({ label, value, onChangeText, placeholder, keyboardType = 'default', tone = th.text, large = false }) => (
    <View style={[s.entryField, large ? s.amountField : null, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
      <Text style={[s.fieldLabel, { color: th.sub, textAlign: align }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        placeholderTextColor={th.faint}
        style={[large ? s.amountInput : s.inlineInput, { color: tone, textAlign: align }]}
      />
    </View>
  );

  const renderInfoCard = ({ icon, label, value, tone = activeColor }) => (
    <View style={[s.infoCard, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDir }]}>
      <View style={[s.infoIcon, { backgroundColor: `${tone}18` }]}>
        <Ionicons name={icon} size={16} color={tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.selectLabel, { color: th.sub, textAlign: align }]}>{label}</Text>
        <Text numberOfLines={2} style={[s.infoValue, { color: th.text, textAlign: align }]}>{value}</Text>
      </View>
    </View>
  );

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
        firstDueISO: planDate,
        walletId: planWalletId,
        cat: preset?.cat || suggestCategoryForText(linkedName, cats),
        linkedType: preset?.linkedType || 'debt',
        linkedId: preset?.linkedId || null,
        currencyCode: selectedEntityCurrency,
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
    if (needsEntityOriginRate && !(cleanNumber(entityBaseRate) > 0)) {
      Alert.alert('', isAr ? 'أدخل سعر الصرف التاريخي لعملة الدين.' : 'Enter the debt historical exchange rate.');
      return;
    }
    if (needsWalletOriginRate && !(cleanNumber(walletBaseRate) > 0)) {
      Alert.alert('', isAr ? 'أدخل سعر الصرف التاريخي لمحفظة التأثير.' : 'Enter the payment wallet historical exchange rate.');
      return;
    }
    if (isCommitment) {
      await addCommitment({
        name: name.trim(),
        amt: totalValue,
        firstDueISO: startDate,
        walletId: planWalletId,
        cat: commitmentCat || suggestCategoryForText(name, commitmentCategories),
        linkedType: 'none',
        currencyCode: selectedEntityCurrency,
        repeatMonthly: commitmentRepeatMonthly,
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
        currencyCode: selectedEntityCurrency,
        entityBaseRate: cleanNumber(entityBaseRate) || undefined,
        walletBaseRate: cleanNumber(walletBaseRate) || undefined,
      });
    } else {
      created = await addGoal({
        name: name.trim(),
        target: totalValue,
        currencyCode: selectedEntityCurrency,
        createdAt: startDate,
      });
    }

    if (withPlan && created?.id) {
      await addCommitment({
        name: name.trim(),
        amt: linkedValue,
        firstDueISO: planDate,
        walletId: planWalletId,
        cat: suggestCategoryForText(name, cats),
        linkedType: isGoal ? 'goal' : isReceivable ? 'receivable' : 'debt',
        linkedId: created.id,
        currencyCode: selectedEntityCurrency,
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
              {isTracker && !dedicatedTrackerLaunch ? (
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

              {renderTextField({
                label: nameLabel,
                value: name,
                onChangeText: handleNameChange,
                placeholder,
              })}

              {renderTextField({
                label: `${amountLabel} (${entitySym})`,
                value: amt,
                onChangeText: (value) => setAmt(formatNumberInput(value)),
                keyboardType: 'numeric',
                placeholder: `0 ${entitySym}`,
                tone: activeColor,
                large: true,
              })}

              {!linkedPlanMode ? renderSelectField({
                id: 'tracker-currency',
                label: T.currency,
                value: selectedEntityCurrency,
                options: currencyOptions,
                icon: 'cash-outline',
                tone: activeColor,
                onChange: value => {
                  setEntityCurrency(value);
                  setEntityBaseRate('');
                  setWalletBaseRate('');
                },
              }) : null}

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
                          style={[s.originMode, { backgroundColor: active ? `${activeColor}18` : th.cardHigh, borderColor: active ? activeColor : th.border }]}
                        >
                          <Text style={{ color: active ? activeColor : th.sub, fontSize: 12, ...weight('900') }}>{option.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <View style={[s.originImpactPill, { backgroundColor: `${activeColor}12`, flexDirection: rowDir }]}>
                    <Ionicons
                      name={originMode === 'previous' ? 'remove-circle-outline' : 'wallet-outline'}
                      size={14}
                      color={activeColor}
                    />
                    <Text numberOfLines={1} style={{ flex: 1, color: activeColor, fontSize: 11, ...weight('900'), textAlign: align }}>
                      {originImpactText}
                    </Text>
                  </View>
                </View>
              ) : null}

              {needsEntityOriginRate ? renderTextField({
                label: `${T.entityBaseRate} · 1 ${selectedEntityCurrency} = ? ${cfg.currency}`,
                value: entityBaseRate,
                onChangeText: value => setEntityBaseRate(formatNumberInput(value)),
                keyboardType: 'decimal-pad',
                placeholder: '0',
              }) : null}
              {needsWalletOriginRate ? renderTextField({
                label: `${T.walletBaseRate} · 1 ${selectedPaymentCurrency} = ? ${cfg.currency}`,
                value: walletBaseRate,
                onChangeText: value => setWalletBaseRate(formatNumberInput(value)),
                keyboardType: 'decimal-pad',
                placeholder: '0',
              }) : null}

              {isCommitment ? (
                <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                  <DateField
                    value={startDate}
                    onChange={setStartDate}
                    th={th}
                    lang={cfg.lang}
                    monthNameStyle={cfg.monthNameStyle}
                    label={T.planDate}
                    style={s.selectFieldBlock}
                    buttonStyle={s.dateButton}
                    labelInside
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
              ) : isDebt && originMode !== 'previous' && walletList.length > 0 ? (
                <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                  <DateField
                    value={startDate}
                    onChange={setStartDate}
                    th={th}
                    lang={cfg.lang}
                    monthNameStyle={cfg.monthNameStyle}
                    label={T.startDate}
                    style={s.selectFieldBlock}
                    buttonStyle={s.dateButton}
                    labelInside
                  />
                  {renderSelectField({
                    id: 'origin-wallet',
                    label: T.walletEffect,
                    value: planWalletId,
                    options: walletOptions,
                    icon: 'wallet-outline',
                    tone: th.primary,
                    onChange: setPlanWalletId,
                  })}
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
                  labelInside
                />
              )}
              {isCommitment ? (
                <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                  {renderSelectField({
                    id: 'commitment-category',
                    label: T.category,
                    value: commitmentCat,
                    options: commitmentCategoryOptions,
                    icon: 'pricetag-outline',
                    tone: th.warn,
                    onChange: selectCommitmentCategory,
                  })}
                  {renderSelectField({
                    id: 'commitment-repeat',
                    label: T.repeatMode,
                    value: commitmentRepeatMonthly,
                    options: commitmentRepeatOptions,
                    icon: 'repeat-outline',
                    tone: th.warn,
                    onChange: setCommitmentRepeatMonthly,
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

                  {renderTextField({
                    label: `${T.planAmount} (${entitySym})`,
                    value: planAmount,
                    onChangeText: (value) => setPlanAmount(formatNumberInput(value)),
                    keyboardType: 'numeric',
                    placeholder: `0 ${entitySym}`,
                    tone: th.warn,
                  })}

                  <View style={[s.twoColumnRow, { flexDirection: rowDir }]}>
                    <DateField
                      value={planDate}
                      onChange={setPlanDate}
                      th={th}
                      lang={cfg.lang}
                      monthNameStyle={cfg.monthNameStyle}
                      label={T.planDate}
                      style={s.selectFieldBlock}
                      buttonStyle={s.dateButton}
                      labelInside
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
  entryField: { minHeight: 60, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, marginBottom: 9, justifyContent: 'center' },
  amountField: { minHeight: 72 },
  fieldLabel: { fontSize: 11, lineHeight: 15, ...weight('800'), marginBottom: 4 },
  inlineInput: { minHeight: 28, padding: 0, fontSize: 14, lineHeight: 19, ...weight('900') },
  amountInput: { minHeight: 36, padding: 0, fontSize: 22, lineHeight: 30, ...weight('900') },
  infoCard: { minHeight: 58, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 9, paddingHorizontal: 10, paddingVertical: 9, marginBottom: 8 },
  infoValue: { fontSize: 12, lineHeight: 17, ...weight('900'), marginTop: 1 },
  infoBox: { borderRadius: 14, borderWidth: 0.5, padding: 12, gap: 10, marginBottom: 16, alignItems: 'center' },
  infoIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 14, fontSize: 14, lineHeight: 19, ...weight('700') },
  dateRow: { justifyContent: 'space-between', alignItems: 'center', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12, marginBottom: 16, gap: 12 },
  walletBlock: { marginBottom: 16 },
  categoryBlock: { marginBottom: 16 },
  categoryHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: -3, marginBottom: 9 },
  originBlock: { marginBottom: 14 },
  repeatBlock: { marginBottom: 12 },
  goalPurposeBlock: { marginBottom: 14 },
  originModes: { gap: 8, marginBottom: 7 },
  originMode: { flex: 1, minHeight: 40, borderRadius: 11, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  originImpactPill: { minHeight: 30, borderRadius: 10, alignItems: 'center', gap: 6, paddingHorizontal: 9, marginTop: 1 },
  twoColumnRow: { width: '100%', alignItems: 'stretch', gap: 8, marginBottom: 9 },
  selectFieldBlock: { flex: 1, flexBasis: 0, minWidth: 0, height: 64, marginBottom: 0 },
  selectField: { minHeight: 64, height: 64, alignItems: 'center', gap: 8, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 6 },
  selectLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  selectValue: { fontSize: 13, lineHeight: 18, ...weight('900'), marginTop: 1 },
  selectDetail: { fontSize: 9, lineHeight: 12, ...weight('700'), marginTop: 1 },
  dateButton: { minHeight: 64, height: 64, borderRadius: 13, borderWidth: 0.5, paddingHorizontal: 10, paddingVertical: 6 },
  emptySelect: { padding: 10, fontSize: 12, ...weight('700') },
  selectSheetOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  selectSheetPanel: { width: '100%', maxWidth: 520, alignSelf: 'center', maxHeight: '54%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, paddingHorizontal: 12, paddingTop: 10 },
  selectSheetHead: { minHeight: 42, alignItems: 'center', gap: 9, marginBottom: 8 },
  selectSheetIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetTitle: { flex: 1, minWidth: 0, fontSize: 15, lineHeight: 21, ...weight('900') },
  selectSheetClose: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  selectSheetList: { width: '100%' },
  selectSheetOption: { minHeight: 48, alignItems: 'center', gap: 9, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 7 },
  planToggle: { minHeight: 54, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9, gap: 10, alignItems: 'center', marginBottom: 10 },
  planSection: { borderRadius: 16, borderWidth: 1, padding: 10, marginBottom: 10 },
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
