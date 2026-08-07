import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { MetricCard, Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { isISODate, pct, today } from '../utils/calc';
import { commitmentDueISO, monthKey } from '../lib/commitments';
import { RADIUS, SHADOW, TYPE, weight } from '../lib/tokens';
import DateField from '../components/DateField';
import ActionMenu from '../components/ActionMenu';
import { isRTL, rowDirFor, textAlignFor } from '../lib/layout';
import { filterByActiveScope, getModules } from '../lib/modules';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';

const money = (value) => Math.round(Math.abs(Number(value) || 0)).toLocaleString();
const cleanNumber = parseNumberInput;

const copy = (lang) => {
  const ar = lang === 'ar';
  const releaseGoal = ar ? '\u0625\u062a\u0627\u062d\u0629 \u0627\u0644\u0645\u0628\u0644\u063a' : 'Make funds available';
  const releaseGoalConfirm = ar ? '\u0633\u064a\u0639\u0648\u062f \u0645\u0628\u0644\u063a \u0627\u0644\u062a\u0648\u0641\u064a\u0631 \u0645\u062a\u0627\u062d\u0627\u064b \u0641\u064a \u0646\u0641\u0633 \u0627\u0644\u0645\u062d\u0627\u0641\u0638 \u0644\u064a\u064f\u0633\u062c\u0644 \u0627\u0644\u0635\u0631\u0641 \u0627\u0644\u0641\u0639\u0644\u064a \u0628\u0639\u062f\u0647.' : 'The reserved money will become available in its original wallets, ready for the actual expense.';
  return {
    releaseGoal,
    releaseGoalConfirm,
    title: ar ? 'المتابعات' : 'Trackers',
    all: ar ? 'الكل' : 'All',
    owed: ar ? 'دين عليّ' : 'Debt I owe',
    receivable: ar ? 'دين لي' : 'Debt owed to me',
    saving: ar ? 'توفير' : 'Saving',
    monthly: ar ? 'التزامات' : 'Commitments',
    owedTotal: ar ? 'إجمالي دين عليّ' : 'Total debt I owe',
    receivableTotal: ar ? 'إجمالي دين لي' : 'Total debt owed to me',
    savingLeft: ar ? 'المتبقي لتحقيق الأهداف' : 'Remaining to save',
    monthlyTotal: ar ? 'إجمالي الالتزامات' : 'Total commitments',
    remaining: ar ? 'المتبقي' : 'Remaining',
    paid: ar ? 'مسدد' : 'Paid',
    collected: ar ? 'محصل' : 'Collected',
    saved: ar ? 'مدخر' : 'Saved',
    total: ar ? 'الإجمالي' : 'Total',
    target: ar ? 'المطلوب' : 'Target',
    next: ar ? 'القادم' : 'Next',
    done: ar ? 'مكتمل' : 'Done',
    active: ar ? 'نشط' : 'Active',
    paused: ar ? 'متوقف' : 'Paused',
    paidMonth: ar ? 'تم الدفع هذا الشهر' : 'Paid this month',
    plan: ar ? 'التزام مرتبط' : 'Linked commitment',
    planDue: ar ? 'موعد الاستحقاق' : 'Due date',
    planAmount: ar ? 'مبلغ الالتزام' : 'Commitment amount',
    status: ar ? 'الحالة' : 'Status',
    progress: ar ? 'الإنجاز' : 'Progress',
    dueToday: ar ? 'مستحقة اليوم' : 'Due today',
    overdue: ar ? 'متأخرة' : 'Overdue',
    inDays: ar ? 'بعد' : 'In',
    days: ar ? 'يوم' : 'days',
    noPlan: ar ? 'لا يوجد التزام مرتبط' : 'No linked commitment',
    details: ar ? 'التفاصيل' : 'Details',
    empty: ar ? 'لا توجد متابعات حالياً' : 'No trackers yet',
    pay: ar ? 'تسجيل سداد' : 'Record repayment',
    collect: ar ? 'تسجيل تحصيل' : 'Record collection',
    save: ar ? 'إضافة توفير' : 'Add saving',
    markPaid: ar ? 'تسجيل دفع' : 'Mark paid',
    addPlan: ar ? 'إضافة التزام' : 'Add commitment',
    pausePlan: ar ? 'إيقاف الالتزام' : 'Pause commitment',
    resumePlan: ar ? 'تفعيل الالتزام' : 'Resume commitment',
    deletePlan: ar ? 'حذف الالتزام' : 'Delete commitment',
    postpone: ar ? 'تأجيل الدفع' : 'Postpone payment',
    postponeDay: ar ? 'يوم' : '1 day',
    postpone3Days: ar ? '3 أيام' : '3 days',
    postponeNextMonth: ar ? 'الشهر القادم' : 'Next month',
    deferredUntil: ar ? 'مؤجل إلى' : 'Deferred until',
    cancelPostpone: ar ? 'إلغاء التأجيل' : 'Cancel deferral',
    editTracker: ar ? 'تعديل المتابعة' : 'Edit tracker',
    deleteTracker: ar ? 'حذف المتابعة' : 'Delete tracker',
    editRepayment: ar ? 'تعديل السداد' : 'Edit repayment',
    editCollection: ar ? 'تعديل التحصيل' : 'Edit collection',
    editSaving: ar ? 'تعديل التوفير' : 'Edit saving',
    deleteRepayment: ar ? 'حذف السداد' : 'Delete repayment',
    deleteCollection: ar ? 'حذف التحصيل' : 'Delete collection',
    deleteSaving: ar ? 'حذف التوفير' : 'Delete saving',
    repaymentHistory: ar ? 'سجل السداد' : 'Repayment history',
    collectionHistory: ar ? 'سجل التحصيل' : 'Collection history',
    select: ar ? 'تحديد' : 'Select',
    savingHistory: ar ? 'سجل التوفير' : 'Saving history',
    noRepayments: ar ? 'لا يوجد سداد مسجل' : 'No repayments yet',
    noCollections: ar ? 'لا يوجد تحصيل مسجل' : 'No collections yet',
    noSavings: ar ? 'لا يوجد توفير مسجل' : 'No savings yet',
    name: ar ? 'الاسم' : 'Name',
    amount: ar ? 'المبلغ' : 'Amount',
    date: ar ? 'التاريخ' : 'Date',
    saveEdit: ar ? 'حفظ التعديل' : 'Save changes',
    cancel: ar ? 'إلغاء' : 'Cancel',
    confirmDelete: ar ? 'هل تريد الحذف؟' : 'Delete?',
    confirmDeleteTracker: ar ? 'سيتم حذف المتابعة وكل الدفعات المرتبطة بها.' : 'This deletes the tracker and all linked payments.',
    linkedPlanDelete: ar ? 'وسيُحذف الالتزام المرتبط أيضاً.' : 'The linked commitment will also be deleted.',
    confirmDeletePayment: ar ? 'سيتم حذف هذه الدفعة وتحديث الأرقام المرتبطة.' : 'This deletes the payment and updates linked totals.',
    invalidAmount: ar ? 'اكتب مبلغاً صحيحاً أكبر من صفر.' : 'Enter a valid amount greater than zero.',
    invalidDate: ar ? 'اكتب التاريخ بصيغة YYYY-MM-DD.' : 'Use YYYY-MM-DD date format.',
    totalBelowPaid: ar ? 'الإجمالي لا يمكن أن يكون أقل من المبلغ المسجل.' : 'Total cannot be lower than the amount already recorded.',
    paymentTooHigh: ar ? 'الدفعة أكبر من المتبقي.' : 'Payment is higher than the remaining amount.',
  };
};

export default function TrackersLabScreen({ focusRequest, onQuickPay, onQuickSave, onQuickCommitment, onAddLinkedPlan, onNewTracker, quickEntry = false }) {
  const {
    debts, goals, commitments, cfg,
    editDebt, deleteDebt, editDebtPayment, deleteDebtPayment,
    editGoal, deleteGoal, editGoalSaving, deleteGoalSaving, releaseGoalSavings,
    deferCommitment, clearCommitmentDeferral, editCommitment, deleteCommitment,
    deleteTrackersMany, deleteTrackerPaymentsMany,
  } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const T = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const isAr = isRTL(cfg.lang);
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const modules = getModules(cfg);
  const movementLabels = (kind) => {
    if (kind === 'receivable') {
      return { history: T.collectionHistory, empty: T.noCollections, edit: T.editCollection, delete: T.deleteCollection };
    }
    if (kind === 'saving') {
      return { history: T.savingHistory, empty: T.noSavings, edit: T.editSaving, delete: T.deleteSaving };
    }
    return { history: T.repaymentHistory, empty: T.noRepayments, edit: T.editRepayment, delete: T.deleteRepayment };
  };
  const scopedDebts = filterByActiveScope(debts, cfg);
  const scopedGoals = filterByActiveScope(goals, cfg);
  const scopedCommitments = filterByActiveScope(commitments, cfg).filter(item => {
    if (item.linkedType === 'debt') return modules.debtsOwed;
    if (item.linkedType === 'receivable') return modules.debtsReceivable;
    if (item.linkedType === 'goal') return modules.goals;
    return true;
  });
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState(null);
  const [editPaymentDraft, setEditPaymentDraft] = useState(null);
  const [paymentSelection, setPaymentSelection] = useState({ ownerId: null, ids: [] });
  const trackers = useMemo(() => {
    const planFor = (type, id) => scopedCommitments.find(plan => plan.linkedType === type && plan.linkedId === id);

    const amountRows = scopedDebts.filter(item => item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed).map(item => {
      const receivable = item.direction === 'receivable';
      const kind = receivable ? 'receivable' : 'owed';
      const total = Number(item.total || 0);
      const doneValue = Number(item.paid || 0);
      const remaining = Math.max(0, total - doneValue);
      const plan = planFor(receivable ? 'receivable' : 'debt', item.id);
      return {
        id: `amount:${item.id}`,
        sourceId: item.id,
        kind,
        title: item.name || '',
        icon: receivable ? 'cash-outline' : 'card-outline',
        color: receivable ? th.inc : th.exp,
        bg: receivable ? th.incBg : th.expBg,
        total,
        doneValue,
        remaining,
        progress: pct(doneValue, total),
        status: remaining <= 0 ? 'done' : 'active',
        date: item.createdAt,
        plan,
        source: item,
        history: item.payments || [],
      };
    });

    const savingRows = modules.goals ? scopedGoals.map(item => {
      const total = Number(item.target || 0);
      const doneValue = Number(item.cur || 0);
      const remaining = Math.max(0, total - doneValue);
      const plan = planFor('goal', item.id);
      return {
        id: `saving:${item.id}`,
        sourceId: item.id,
        kind: 'saving',
        title: item.name || '',
        icon: 'flag-outline',
        color: th.primary,
        bg: th.primSoft,
        total,
        doneValue,
        remaining,
        progress: pct(doneValue, total),
        status: item.status === 'settled' || remaining <= 0 ? 'done' : 'active',
        date: item.createdAt,
        plan,
        source: item,
        history: item.savings || [],
      };
    }) : [];

    const monthlyRows = modules.commitments ? scopedCommitments
      .filter(item => !item.linkedType || item.linkedType === 'none')
      .map(item => {
        const dueISO = commitmentDueISO(item);
        const paidThisCycle = item.lastPaidMonth === monthKey(dueISO);
        const amount = Number(item.amt || 0);
        return {
          id: `monthly:${item.id}`,
          sourceId: item.id,
          kind: 'monthly',
          title: item.name || '',
          icon: 'calendar-outline',
          color: th.warn,
          bg: th.warnBg,
          total: amount,
          doneValue: paidThisCycle ? amount : 0,
          remaining: amount,
          progress: paidThisCycle ? 100 : 0,
          status: item.active === false ? 'paused' : paidThisCycle ? 'paidMonth' : 'active',
          date: dueISO,
          deferredUntilISO: item.deferredUntilISO || null,
          commitment: item,
          plan: null,
          source: item,
          history: [],
        };
      }) : [];

    return [...amountRows, ...savingRows, ...monthlyRows].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (a.kind === 'monthly' && b.kind !== 'monthly') return -1;
      if (b.kind === 'monthly' && a.kind !== 'monthly') return 1;
      return Math.abs(b.remaining || 0) - Math.abs(a.remaining || 0);
    });
  }, [debts, goals, commitments, cfg.activeScope, cfg.profileType, th, modules.debtsReceivable, modules.debtsOwed, modules.goals, modules.commitments]);

  const totals = useMemo(() => ({
    owed: trackers.filter(item => item.kind === 'owed').reduce((sum, item) => sum + item.remaining, 0),
    receivable: trackers.filter(item => item.kind === 'receivable').reduce((sum, item) => sum + item.remaining, 0),
    saving: trackers.filter(item => item.kind === 'saving').reduce((sum, item) => sum + item.remaining, 0),
    monthly: scopedCommitments
      .filter(item => item.active !== false && (!item.linkedType || item.linkedType === 'none'))
      .reduce((sum, item) => sum + Number(item.amt || 0), 0),
  }), [trackers, commitments, cfg.activeScope, cfg.profileType]);

  const filters = [
    { key: 'all', label: T.all, count: trackers.length },
    modules.debtsOwed ? { key: 'owed', label: T.owed, count: trackers.filter(item => item.kind === 'owed').length } : null,
    modules.debtsReceivable ? { key: 'receivable', label: T.receivable, count: trackers.filter(item => item.kind === 'receivable').length } : null,
    modules.goals ? { key: 'saving', label: T.saving, count: trackers.filter(item => item.kind === 'saving').length } : null,
    modules.commitments ? { key: 'monthly', label: T.monthly, count: trackers.filter(item => item.kind === 'monthly').length } : null,
  ].filter(Boolean);
  useEffect(() => {
    if (!filters.some(item => item.key === filter)) setFilter('all');
  }, [filter, modules.debtsOwed, modules.debtsReceivable, modules.goals, modules.commitments]);
  useEffect(() => {
    if (!focusRequest?.nonce) return;
    const nextKind = focusRequest.kind === 'goal'
      ? 'saving'
      : focusRequest.kind === 'commitment'
        ? 'monthly'
        : focusRequest.kind === 'receivable'
          ? 'receivable'
          : 'owed';
    setFilter(nextKind);
    setOpenId(focusRequest.id
      ? `${nextKind === 'saving' ? 'saving' : nextKind === 'monthly' ? 'monthly' : 'amount'}:${focusRequest.id}`
      : null);
  }, [focusRequest?.nonce]);
  const visibleBase = filter === 'all' ? trackers : trackers.filter(item => item.kind === filter);
  const visible = openId
    ? [...visibleBase].sort((a, b) => (a.id === openId ? -1 : b.id === openId ? 1 : 0))
    : visibleBase;
  const selection = useMultiSelect(visible.map(item => item.id));

  const statusLabel = (status) => {
    if (status === 'done') return T.done;
    if (status === 'paused') return T.paused;
    if (status === 'paidMonth') return T.paidMonth;
    return T.active;
  };

  const confirmReleaseGoal = (item) => {
    Alert.alert(T.releaseGoal, T.releaseGoalConfirm, [
      { text: T.cancel, style: 'cancel' },
      { text: T.releaseGoal, onPress: () => releaseGoalSavings?.(item.sourceId) },
    ]);
  };

  const actionFor = (item) => {
    if (item.kind === 'saving' && item.source?.purpose === 'reserve' && item.source?.status === 'active' && item.remaining <= 0) {
      return { label: T.releaseGoal, icon: 'lock-open-outline', onPress: () => confirmReleaseGoal(item), color: th.primary };
    }
    if (item.status === 'done' || item.status === 'paused' || item.status === 'paidMonth') return null;
    if (item.kind === 'owed') return { label: T.pay, icon: 'card-outline', onPress: () => onQuickPay?.(item.sourceId), color: th.exp };
    if (item.kind === 'receivable') return { label: T.collect, icon: 'cash-outline', onPress: () => onQuickPay?.(item.sourceId), color: th.inc };
    if (item.kind === 'saving') return { label: T.save, icon: 'add-circle-outline', onPress: () => onQuickSave?.(item.sourceId), color: th.primary };
    return { label: T.markPaid, icon: 'checkmark-circle-outline', onPress: () => onQuickCommitment?.(item.sourceId), color: th.warn };
  };

  const describePlan = (commitment) => {
    if (!commitment) return null;
    const dueISO = commitmentDueISO(commitment);
    const dueDate = new Date(`${dueISO}T12:00:00`);
    const todayDate = new Date(`${today()}T12:00:00`);
    const daysUntil = Math.ceil((dueDate - todayDate) / 86400000);
    const paidThisCycle = commitment.lastPaidMonth === monthKey(dueISO);
    const amount = Number(commitment.amt || 0);

    if (commitment.active === false) {
      return { id: commitment.id, amount, dueISO, paidThisCycle, active: false, label: T.paused, color: th.sub, bg: th.cardHigh };
    }
    if (paidThisCycle) {
      return { id: commitment.id, amount, dueISO, paidThisCycle, active: true, label: T.paidMonth, color: th.inc, bg: th.incBg };
    }
    if (commitment.deferredUntilISO) {
      return { id: commitment.id, amount, dueISO, paidThisCycle, active: true, label: `${T.deferredUntil}: ${commitment.deferredUntilISO}`, color: th.warn, bg: th.warnBg, deferredUntilISO: commitment.deferredUntilISO };
    }
    if (daysUntil < 0) {
      return { id: commitment.id, amount, dueISO, paidThisCycle, active: true, label: `${T.overdue} ${Math.abs(daysUntil)} ${T.days}`, color: th.exp, bg: th.expBg };
    }
    if (daysUntil === 0) {
      return { id: commitment.id, amount, dueISO, paidThisCycle, active: true, label: T.dueToday, color: th.warn, bg: th.warnBg };
    }
    return { id: commitment.id, amount, dueISO, paidThisCycle, active: true, label: `${T.inDays} ${daysUntil} ${T.days}`, color: th.primary, bg: th.primSoft };
  };

  const openTrackerEdit = (item) => {
    setEditTrackerDraft({
      kind: item.kind,
      sourceId: item.sourceId,
      name: item.title,
      amount: String(Math.round(Math.abs(item.total || 0))),
      date: item.kind === 'monthly'
        ? (item.source?.firstDueISO || item.date || today())
        : (item.source?.createdAt || item.date || today()),
    });
  };

  const closeTrackerEdit = () => setEditTrackerDraft(null);
  const closePaymentEdit = () => setEditPaymentDraft(null);

  const saveTrackerEdit = async () => {
    const draft = editTrackerDraft;
    if (!draft) return;
    const amount = Math.abs(cleanNumber(draft.amount));
    const name = String(draft.name || '').trim();
    if (!name || !amount) {
      Alert.alert('', T.invalidAmount);
      return;
    }
    if (!isISODate(draft.date)) {
      Alert.alert('', T.invalidDate);
      return;
    }

    const current = trackers.find(item => item.kind === draft.kind && item.sourceId === draft.sourceId);
    const alreadyRecorded = Number(current?.doneValue || 0);
    if (draft.kind !== 'monthly' && amount < alreadyRecorded) {
      Alert.alert('', `${T.totalBelowPaid} ${money(alreadyRecorded)} ${sym}`);
      return;
    }

    if (draft.kind === 'saving') {
      await editGoal?.(draft.sourceId, { name, target: amount, createdAt: draft.date });
    } else if (draft.kind === 'monthly') {
      await editCommitment?.(draft.sourceId, { name, amt: amount, firstDueISO: draft.date });
    } else {
      await editDebt?.(draft.sourceId, { name, total: amount, createdAt: draft.date });
    }
    closeTrackerEdit();
  };

  const confirmDeleteTracker = (item) => {
    const body = item.plan ? `${T.confirmDeleteTracker} ${T.linkedPlanDelete}` : T.confirmDeleteTracker;
    Alert.alert(T.confirmDelete, body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.deleteTracker,
        style: 'destructive',
        onPress: async () => {
          if (item.kind === 'saving') await deleteGoal?.(item.sourceId);
          else if (item.kind === 'monthly') await deleteCommitment?.(item.sourceId);
          else await deleteDebt?.(item.sourceId);
          if (openId === item.id) setOpenId(null);
        },
      },
    ]);
  };

  const openPaymentEdit = (item, payment) => {
    setEditPaymentDraft({
      kind: item.kind,
      sourceId: item.sourceId,
      paymentId: payment.id,
      amount: String(Math.round(Math.abs(payment.amt || 0))),
      date: payment.date || today(),
    });
  };

  const savePaymentEdit = async () => {
    const draft = editPaymentDraft;
    if (!draft) return;
    const amount = Math.abs(cleanNumber(draft.amount));
    if (!amount) {
      Alert.alert('', T.invalidAmount);
      return;
    }
    if (!isISODate(draft.date)) {
      Alert.alert('', T.invalidDate);
      return;
    }
    const current = trackers.find(item => item.kind === draft.kind && item.sourceId === draft.sourceId);
    const currentPayment = current?.history?.find(payment => payment.id === draft.paymentId);
    const maxAllowed = Math.max(0, Number(current?.total || 0) - (Number(current?.doneValue || 0) - Number(currentPayment?.amt || 0)));
    if (draft.kind !== 'monthly' && amount > maxAllowed) {
      Alert.alert('', `${T.paymentTooHigh} ${money(maxAllowed)} ${sym}`);
      return;
    }
    if (draft.kind === 'saving') {
      await editGoalSaving?.(draft.sourceId, draft.paymentId, amount, draft.date);
    } else {
      await editDebtPayment?.(draft.sourceId, draft.paymentId, amount, draft.date);
    }
    closePaymentEdit();
  };

  const confirmDeletePayment = (item, payment) => {
    const movement = movementLabels(item.kind);
    Alert.alert(T.confirmDelete, T.confirmDeletePayment, [
      { text: T.cancel, style: 'cancel' },
      {
        text: movement.delete,
        style: 'destructive',
        onPress: async () => {
          if (item.kind === 'saving') await deleteGoalSaving?.(item.sourceId, payment.id);
          else await deleteDebtPayment?.(item.sourceId, payment.id);
        },
      },
    ]);
  };

  const confirmDeleteSelectedTrackers = () => {
    if (!selection.selectedCount) return;
    const chosen = trackers.filter(item => selection.selected.has(item.id));
    const hasLinkedPlan = chosen.some(item => item.plan);
    const body = isAr
      ? `سيتم حذف ${chosen.length} عناصر وكل الدفعات والحركات المرتبطة بها.`
      : `Delete ${chosen.length} items and all linked payments and transactions?`;
    Alert.alert(T.confirmDelete, hasLinkedPlan ? `${body} ${T.linkedPlanDelete}` : body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.deleteTracker,
        style: 'destructive',
        onPress: async () => {
          await deleteTrackersMany(chosen.map(item => ({ kind: item.kind, sourceId: item.sourceId })));
          setOpenId(null);
          selection.cancel();
        },
      },
    ]);
  };

  const startPaymentSelection = (item, paymentId = null) => {
    setPaymentSelection({
      ownerId: item.id,
      ids: paymentId ? [paymentId] : [],
    });
  };

  const togglePaymentSelection = (item, paymentId) => {
    setPaymentSelection(current => {
      const ids = current.ownerId === item.id ? current.ids : [];
      return {
        ownerId: item.id,
        ids: ids.includes(paymentId)
          ? ids.filter(id => id !== paymentId)
          : [...ids, paymentId],
      };
    });
  };

  const toggleAllPayments = (item) => {
    const allIds = (item.history || []).map(payment => payment.id);
    setPaymentSelection(current => ({
      ownerId: item.id,
      ids: current.ownerId === item.id && current.ids.length === allIds.length ? [] : allIds,
    }));
  };

  const cancelPaymentSelection = () => setPaymentSelection({ ownerId: null, ids: [] });

  const confirmDeleteSelectedPayments = (item) => {
    if (paymentSelection.ownerId !== item.id || !paymentSelection.ids.length) return;
    const rows = (item.history || [])
      .filter(payment => paymentSelection.ids.includes(payment.id))
      .map(payment => ({ kind: item.kind, sourceId: item.sourceId, paymentId: payment.id }));
    const movement = movementLabels(item.kind);
    const body = isAr
      ? `سيتم حذف ${rows.length} من العمليات المحددة وتحديث الأرصدة والحركات المرتبطة.`
      : `Delete ${rows.length} selected entries and update linked balances and transactions?`;
    Alert.alert(T.confirmDelete, body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: movement.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteTrackerPaymentsMany(rows);
          cancelPaymentSelection();
        },
      },
    ]);
  };

  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 112 }}>
      <View style={[s.summaryGrid, { flexDirection: rowDir }]}>
        {modules.debtsOwed ? <SummaryBox th={th} lang={cfg.lang} icon="arrow-up-circle-outline" label={T.owedTotal} value={`${money(totals.owed)} ${sym}`} color={th.exp} /> : null}
        {modules.debtsReceivable ? <SummaryBox th={th} lang={cfg.lang} icon="arrow-down-circle-outline" label={T.receivableTotal} value={`${money(totals.receivable)} ${sym}`} color={th.inc} /> : null}
        {modules.goals ? <SummaryBox th={th} lang={cfg.lang} icon="flag-outline" label={T.savingLeft} value={`${money(totals.saving)} ${sym}`} color={th.primary} /> : null}
        {modules.commitments ? <SummaryBox th={th} lang={cfg.lang} icon="calendar-outline" label={T.monthlyTotal} value={`${money(totals.monthly)} ${sym}`} color={th.warn} /> : null}
      </View>

      {quickEntry ? (
        <TouchableOpacity
          onPress={onNewTracker}
          style={[s.addTrackerBtn, { backgroundColor: th.warn, flexDirection: rowDir }]}
        >
          <Ionicons name="add-circle-outline" size={18} color={th.onPrimary} />
          <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>
            {isAr ? 'إضافة معاملة' : 'Add management item'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[s.filterRail, { flexDirection: 'row' }]}
        style={{ marginBottom: 12, direction: isAr ? 'rtl' : 'ltr' }}
      >
        {filters.map((item) => {
          const active = filter === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setFilter(item.key)}
              style={[
                s.filterChip,
                {
                   backgroundColor: th.card,
                  borderColor: active ? th.primary : th.border,
                  marginRight: isAr ? 0 : 8,
                  marginLeft: isAr ? 8 : 0,
                },
              ]}
            >
              <Text style={{ color: active ? th.primary : th.text, fontSize: 12, ...weight('900') }}>
                {item.label}
              </Text>
              <View style={s.filterCount}>
                <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>
                  {item.count}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <MultiSelectBar
        th={th}
        lang={cfg.lang}
        active={selection.selecting}
        count={selection.selectedCount}
        total={visible.length}
        allSelected={selection.allSelected}
        onStart={selection.start}
        onToggleAll={selection.toggleAll}
        onDelete={confirmDeleteSelectedTrackers}
        onCancel={selection.cancel}
      />

      {visible.length === 0 ? (
        <View style={[s.empty, { backgroundColor: th.card, borderColor: th.border }]}>
          <Ionicons name="albums-outline" size={34} color={th.faint} />
          <Text style={{ color: th.sub, fontSize: 13, ...weight('800'), marginTop: 8 }}>{T.empty}</Text>
        </View>
      ) : visible.map(item => {
        const open = !selection.selecting && openId === item.id;
        const action = selection.selecting ? null : actionFor(item);
        const plan = describePlan(item.kind === 'monthly' ? item.commitment : item.plan);
        const postponeCommitmentId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const canPostpone = !!postponeCommitmentId && plan?.active && !plan?.paidThisCycle;
        const doneLabel = item.kind === 'owed' ? T.paid : item.kind === 'receivable' ? T.collected : item.kind === 'saving' ? T.saved : T.paid;
        const primaryAmount = item.kind === 'monthly' ? item.total : item.remaining;
        const canAddPlan = modules.commitments && item.kind !== 'monthly' && !plan && item.status !== 'done';
        const managedPlanId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const managedPlanActive = plan?.active !== false;
        const movement = movementLabels(item.kind);
        const kindLabel = item.kind === 'owed'
          ? T.owed
          : item.kind === 'receivable'
            ? T.receivable
            : item.kind === 'saving'
              ? T.saving
              : T.monthly;
        const amountLabel = item.kind === 'monthly' ? T.planAmount : T.remaining;
        const progressValue = Math.min(100, Math.max(0, Number(item.progress || 0)));
        return (
          <View
            key={item.id}
            style={[
              s.card,
              {
                backgroundColor: `${item.color}08`,
                borderColor: th.border,
                borderTopColor: item.color,
                borderTopWidth: 3,
              },
            ]}
          >
            <View style={[s.cardHead, { flexDirection: rowDir }]}>
              <TouchableOpacity
                onPress={() => (
                  selection.selecting
                    ? selection.toggle(item.id)
                    : setOpenId(open ? null : item.id)
                )}
                onLongPress={() => selection.toggle(item.id)}
                activeOpacity={0.82}
                style={s.cardTapZone}
              >
                <View style={[s.cardTitleBand, { flexDirection: rowDir }]}>
                  <View style={[s.cardIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={{ color: th.text, fontSize: 15, lineHeight: 21, ...weight('900'), textAlign: align }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align, marginTop: 2 }}>
                      {kindLabel}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
              <View style={[s.cardTools, { flexDirection: rowDir }]}>
                {selection.selecting ? (
                  <SelectionCheckbox
                    th={th}
                    selected={selection.selected.has(item.id)}
                    onPress={() => selection.toggle(item.id)}
                  />
                ) : (
                  <ActionMenu
                    th={th}
                    lang={cfg.lang}
                    title={item.title}
                    items={[
                      { label: T.select, icon: 'checkmark-circle-outline', color: th.primary, onPress: () => selection.toggle(item.id) },
                      { label: T.editTracker, icon: 'create-outline', color: th.primary, onPress: () => openTrackerEdit(item) },
                      { label: T.deleteTracker, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeleteTracker(item) },
                    ]}
                  />
                )}
              </View>
            </View>

            <TouchableOpacity
              onPress={() => (
                selection.selecting
                  ? selection.toggle(item.id)
                  : setOpenId(open ? null : item.id)
              )}
              onLongPress={() => selection.toggle(item.id)}
              activeOpacity={0.82}
            >
              <View style={[s.amountSummary, { backgroundColor: `${item.color}10`, borderColor: `${item.color}35`, flexDirection: rowDir }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align }}>
                    {amountLabel}
                  </Text>
                  <Text style={{ color: item.color, fontSize: 21, lineHeight: 29, ...weight('900'), textAlign: align, marginTop: 2 }}>
                    {money(primaryAmount)} {sym}
                  </Text>
                </View>
                <View style={[s.statusPill, { backgroundColor: item.bg }]}>
                  <Text style={{ color: item.color, fontSize: 11, lineHeight: 16, ...weight('900') }}>
                    {statusLabel(item.status)}
                  </Text>
                </View>
              </View>

              {item.kind === 'monthly' ? (
                <View style={[s.monthlyBrief, { flexDirection: rowDir }]}>
                  <Ionicons name="calendar-outline" size={14} color={th.warn} />
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align, flex: 1 }}>
                    {T.next}: {item.date || '-'}
                  </Text>
                </View>
              ) : (
                <View style={s.progressBlock}>
                  <View style={[s.progressMeta, { flexDirection: rowDir }]}>
                    <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>
                      {doneLabel}: {money(item.doneValue)} {sym} / {money(item.total)} {sym}
                    </Text>
                    <Text style={{ color: item.color, fontSize: 11, ...weight('900') }}>{Math.round(progressValue)}%</Text>
                  </View>
                  <View style={[s.progressTrack, { backgroundColor: th.cardHigh }]}>
                    <View style={[s.progressFill, { backgroundColor: item.color, width: `${progressValue}%` }]} />
                  </View>
                </View>
              )}
            </TouchableOpacity>

            {action ? (
              <TouchableOpacity
                onPress={action.onPress}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                style={[s.paymentActionBtn, { backgroundColor: action.color, flexDirection: rowDir }]}
              >
                <Ionicons name={action.icon} size={17} color="#fff" />
                <Text style={s.paymentActionText}>{action.label}</Text>
              </TouchableOpacity>
            ) : null}

            {open ? (
              <View style={[s.details, { borderTopColor: th.border }]}>
                {item.kind !== 'monthly' ? (
                  <View style={[s.detailGrid, { flexDirection: rowDir }]}>
                    <DetailTile th={th} lang={cfg.lang} label={T.total} value={`${money(item.total)} ${sym}`} />
                    <DetailTile th={th} lang={cfg.lang} label={doneLabel} value={`${money(item.doneValue)} ${sym}`} tone={item.color} />
                  </View>
                ) : null}
                {plan ? (
                  <View style={[s.planPanel, { backgroundColor: plan.bg, borderColor: `${plan.color}55` }]}>
                    <View style={[s.planPanelHead, { flexDirection: rowDir }]}>
                      <View style={[s.planBadge, { backgroundColor: plan.color }]}>
                        <Ionicons name="calendar-outline" size={13} color="#fff" />
                      </View>
                      <Text style={{ flex: 1, color: th.text, fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: align }}>
                        {T.plan}
                      </Text>
                      <View style={[s.planStatus, { backgroundColor: `${plan.color}18` }]}>
                        <Text style={{ color: plan.color, fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: align }}>
                          {plan.label}
                        </Text>
                      </View>
                      {managedPlanId ? (
                        <ActionMenu
                          th={th}
                          lang={cfg.lang}
                          title={T.plan}
                          iconColor={plan.color}
                          buttonStyle={{ backgroundColor: `${plan.color}18`, width: 31, height: 31 }}
                          items={[
                            {
                              label: managedPlanActive ? T.pausePlan : T.resumePlan,
                              icon: managedPlanActive ? 'pause-circle-outline' : 'play-circle-outline',
                              color: th.warn,
                              onPress: () => editCommitment?.(managedPlanId, { active: !managedPlanActive }),
                            },
                            { label: T.deletePlan, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => deleteCommitment?.(managedPlanId) },
                          ]}
                        />
                      ) : null}
                    </View>
                    <View style={[s.planFacts, { flexDirection: rowDir }]}>
                      <View style={[s.planFactCard, { backgroundColor: th.card }]}>
                        <Text style={[s.planFactLabel, { color: th.sub, textAlign: align }]}>{T.planAmount}</Text>
                        <Text style={[s.planFactValue, { color: th.text, textAlign: align }]}>{money(plan.amount)} {sym}</Text>
                      </View>
                      <View style={[s.planFactCard, { backgroundColor: th.card }]}>
                        <Text style={[s.planFactLabel, { color: th.sub, textAlign: align }]}>{T.planDue}</Text>
                        <Text style={[s.planFactValue, { color: th.text, textAlign: align }]}>{plan.dueISO}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                {canAddPlan ? (
                  <TouchableOpacity
                    onPress={() => onAddLinkedPlan?.({
                      linkedType: item.kind === 'saving' ? 'goal' : item.kind === 'receivable' ? 'receivable' : 'debt',
                      linkedId: item.sourceId,
                      linkedName: item.title,
                      planOnly: true,
                    })}
                    style={[s.secondaryBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={th.warn} />
                    <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{T.addPlan}</Text>
                  </TouchableOpacity>
                ) : null}
                {canPostpone ? (
                  <View style={s.postponeBlock}>
                    <Text style={[s.detailLabel, { color: th.sub, textAlign: align }]}>{T.postpone}</Text>
                    <View style={[s.postponeRail, { flexDirection: rowDir }]}>
                      {[
                        ['day', T.postponeDay],
                        ['three_days', T.postpone3Days],
                        ['next_month', T.postponeNextMonth],
                      ].map(([mode, label]) => (
                        <TouchableOpacity
                          key={mode}
                          onPress={() => deferCommitment?.(postponeCommitmentId, mode)}
                          style={[s.postponeChip, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                        >
                          <Ionicons name="time-outline" size={13} color={th.warn} />
                          <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {plan?.deferredUntilISO ? (
                      <View style={[s.deferredRow, { flexDirection: rowDir }]}>
                        <Text style={{ flex: 1, color: th.warn, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align }}>
                          {T.deferredUntil}: {plan.deferredUntilISO}
                        </Text>
                        <TouchableOpacity
                          onPress={() => clearCommitmentDeferral?.(postponeCommitmentId)}
                          style={[s.cancelPostponeBtn, { backgroundColor: th.warnBg, borderColor: `${th.warn}55` }]}
                        >
                          <Ionicons name="arrow-undo-outline" size={13} color={th.warn} />
                          <Text style={{ color: th.warn, fontSize: 12, ...weight('900') }}>{T.cancelPostpone}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {item.kind !== 'monthly' ? (
                  <View style={[s.historyBox, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                    <Text style={[s.historyTitle, { color: th.text, textAlign: align }]}>
                      {movement.history}
                    </Text>
                    {(item.history || []).length > 0 ? (
                      <MultiSelectBar
                        th={th}
                        lang={cfg.lang}
                        active={paymentSelection.ownerId === item.id}
                        count={paymentSelection.ownerId === item.id ? paymentSelection.ids.length : 0}
                        total={(item.history || []).length}
                        allSelected={
                          paymentSelection.ownerId === item.id
                          && paymentSelection.ids.length === (item.history || []).length
                        }
                        onStart={() => startPaymentSelection(item)}
                        onToggleAll={() => toggleAllPayments(item)}
                        onDelete={() => confirmDeleteSelectedPayments(item)}
                        onCancel={cancelPaymentSelection}
                        style={{ marginBottom: 2 }}
                      />
                    ) : null}
                    {(item.history || []).length === 0 ? (
                      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: align }}>
                        {movement.empty}
                      </Text>
                    ) : (item.history || []).map(payment => {
                      const paymentSelecting = paymentSelection.ownerId === item.id;
                      const paymentSelected = paymentSelecting && paymentSelection.ids.includes(payment.id);
                      return (
                      <TouchableOpacity
                        key={payment.id}
                        onPress={() => {
                          if (paymentSelecting) togglePaymentSelection(item, payment.id);
                        }}
                        onLongPress={() => startPaymentSelection(item, payment.id)}
                        style={[
                          s.historyRow,
                          {
                            backgroundColor: paymentSelected ? th.primSoft : 'transparent',
                            flexDirection: rowDir,
                            borderTopColor: th.border,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: th.text, fontSize: 13, lineHeight: 18, ...weight('900'), textAlign: align }}>
                            {money(payment.amt)} {sym}
                          </Text>
                          <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align }}>
                            {payment.date || '-'}
                          </Text>
                        </View>
                        {paymentSelecting ? (
                          <SelectionCheckbox
                            th={th}
                            selected={paymentSelected}
                            onPress={() => togglePaymentSelection(item, payment.id)}
                          />
                        ) : (
                          <ActionMenu
                            th={th}
                            lang={cfg.lang}
                            title={movement.history}
                            buttonStyle={{ width: 32, height: 32, borderRadius: 10, backgroundColor: th.input }}
                            items={[
                              { label: movement.edit, icon: 'create-outline', color: th.primary, onPress: () => openPaymentEdit(item, payment) },
                              { label: movement.delete, icon: 'trash-outline', color: th.exp, danger: true, onPress: () => confirmDeletePayment(item, payment) },
                            ]}
                          />
                        )}
                      </TouchableOpacity>
                    );})}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
    <Modal visible={!!editTrackerDraft} transparent animationType="slide" onRequestClose={closeTrackerEdit}>
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closeTrackerEdit} />
        <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: rowDir }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: align }]}>{T.editTracker}</Text>
          </View>
          <TextInput
            value={editTrackerDraft?.name || ''}
            onChangeText={(name) => setEditTrackerDraft(draft => draft ? { ...draft, name } : draft)}
            placeholder={T.name}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: align }]}
          />
          <TextInput
            value={editTrackerDraft?.amount || ''}
            onChangeText={(amount) => setEditTrackerDraft(draft => draft ? { ...draft, amount: formatNumberInput(amount) } : draft)}
            keyboardType="numeric"
            placeholder={T.amount}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: align }]}
          />
          <DateField
            value={editTrackerDraft?.date || today()}
            onChange={(date) => setEditTrackerDraft(draft => draft ? { ...draft, date } : draft)}
            th={th}
            lang={cfg.lang}
            label={editTrackerDraft?.kind === 'monthly' ? T.planDue : T.date}
            style={{ marginBottom: 2 }}
          />
          <View style={[s.modalButtons, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={closeTrackerEdit} style={[s.modalBtn, { backgroundColor: th.cardHigh }]}>
              <Text style={{ color: th.sub, fontSize: 13, ...weight('900') }}>{T.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveTrackerEdit} style={[s.modalBtn, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.saveEdit}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    <Modal visible={!!editPaymentDraft} transparent animationType="slide" onRequestClose={closePaymentEdit}>
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closePaymentEdit} />
        <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: rowDir }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: align }]}>
              {movementLabels(editPaymentDraft?.kind).edit}
            </Text>
          </View>
          <TextInput
            value={editPaymentDraft?.amount || ''}
            onChangeText={(amount) => setEditPaymentDraft(draft => draft ? { ...draft, amount: formatNumberInput(amount) } : draft)}
            keyboardType="numeric"
            placeholder={T.amount}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: align }]}
          />
          <DateField
            value={editPaymentDraft?.date || today()}
            onChange={(date) => setEditPaymentDraft(draft => draft ? { ...draft, date } : draft)}
            th={th}
            lang={cfg.lang}
            style={{ marginBottom: 2 }}
          />
          <View style={[s.modalButtons, { flexDirection: rowDir }]}>
            <TouchableOpacity onPress={closePaymentEdit} style={[s.modalBtn, { backgroundColor: th.cardHigh }]}>
              <Text style={{ color: th.sub, fontSize: 13, ...weight('900') }}>{T.cancel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={savePaymentEdit} style={[s.modalBtn, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.saveEdit}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

function SummaryBox({ th, lang, icon, label, value, color }) {
  return (
    <MetricCard
      th={th}
      lang={lang}
      icon={icon}
      label={label}
      value={value}
      tone={color}
      center
      compact
      iconPlain
      style={[s.summaryBox, { backgroundColor: th.card, borderColor: th.border }]}
      valueStyle={s.summaryValue}
    />
  );
}

function DetailTile({ th, lang, label, value, tone }) {
  const isAr = lang === 'ar';
  return (
    <View style={[s.detailTile, { backgroundColor: th.cardHigh }]}>
      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: isAr ? 'right' : 'left' }}>
        {label}
      </Text>
      <Text style={{ color: tone || th.text, fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: isAr ? 'right' : 'left' }} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  summaryGrid: { flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  summaryBox: { width: '48.5%' },
  summaryValue: { fontSize: 14, lineHeight: 19 },
  filterRail: { paddingRight: 2, paddingLeft: 2 },
  addTrackerBtn: { minHeight: 42, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 7, marginBottom: 10 },
  filterChip: { minHeight: 44, borderRadius: RADIUS.pill, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  filterCount: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  empty: { minHeight: 180, borderRadius: RADIUS.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 12, marginBottom: 9, ...SHADOW.card },
  cardHead: { alignItems: 'center', gap: 8, marginBottom: 6 },
  cardTapZone: { flex: 1, gap: 6 },
  cardTitleBand: { alignItems: 'center', gap: 8 },
  cardContent: { flex: 1 },
  cardIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  amountSummary: { minHeight: 64, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, alignItems: 'center', gap: 8 },
  statusPill: { minHeight: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  monthlyBrief: { minHeight: 28, alignItems: 'center', gap: 6, paddingHorizontal: 3, paddingTop: 5 },
  progressBlock: { paddingTop: 6, paddingHorizontal: 2 },
  progressMeta: { justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999 },
  cardTools: { gap: 6, alignItems: 'center' },
  paymentActionBtn: { minHeight: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 11, paddingHorizontal: 14 },
  paymentActionText: { color: '#fff', fontSize: 13, lineHeight: 18, ...weight('900') },
  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8 },
  detailGrid: { flexWrap: 'wrap', gap: 8 },
  detailTile: { width: '48.5%', minHeight: 56, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
  detailLine: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailLabel: { flex: 1, fontSize: 12, lineHeight: 17, ...weight('800') },
  detailValue: { fontSize: 12, lineHeight: 17, ...weight('900') },
  planPanel: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 10, gap: 8 },
  planPanelHead: { alignItems: 'center', gap: 8 },
  planBadge: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  planStatus: { minHeight: 26, maxWidth: 126, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  planFacts: { flexWrap: 'wrap', gap: 8 },
  planFactCard: { width: '48.5%', minHeight: 58, borderRadius: RADIUS.md, paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  planFactLabel: { fontSize: 12, lineHeight: 17, ...weight('800') },
  planFactValue: { fontSize: 12, lineHeight: 18, marginTop: 3, ...weight('900') },
  secondaryBtn: { minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  postponeBlock: { gap: 7 },
  postponeRail: { flexWrap: 'wrap', gap: 7 },
  postponeChip: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 5, flexDirection: 'row' },
  deferredRow: { alignItems: 'center', gap: 8 },
  cancelPostponeBtn: { minHeight: 32, borderRadius: 11, borderWidth: 1, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', gap: 5, flexDirection: 'row' },
  manageRow: { gap: 8 },
  manageBtn: { flex: 1, minHeight: 40, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  actionBtn: { minHeight: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  historyBox: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 10, gap: 6 },
  historyTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  historyRow: { alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  historyIconBtn: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 16, gap: 10 },
  sheetHeader: { alignItems: 'center', gap: 10, marginBottom: 2 },
  sheetTitle: { flex: 1, fontSize: TYPE.title, lineHeight: 28, ...weight('900') },
  input: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, lineHeight: 19, ...weight('800') },
  modalButtons: { gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
