import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { isISODate, pct, today } from '../utils/calc';
import { commitmentDueISO, formatCommitmentDate, formatCommitmentMonth, monthKey } from '../lib/commitments';
import { RADIUS, SHADOW, TYPE, weight } from '../lib/tokens';
import DateField from '../components/DateField';
import ActionMenu from '../components/ActionMenu';
import { isRTL, rowDirFor, textAlignFor } from '../lib/layout';
import { filterByActiveScope, getModules } from '../lib/modules';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { isSafelyArchivableTracker, isTrackerPastGracePeriod, latestMovementDate } from '../lib/trackerLifecycle';

const money = (value) => Math.round(Math.abs(Number(value) || 0)).toLocaleString();
const cleanNumber = parseNumberInput;
const monthStartISO = (value = today()) => `${String(value).slice(0, 7)}-01`;

const copy = (lang) => {
  const ar = lang === 'ar';
  const releaseGoal = ar ? '\u0625\u062a\u0627\u062d\u0629 \u0627\u0644\u0645\u0628\u0644\u063a' : 'Make funds available';
  const releaseGoalConfirm = ar ? '\u0633\u064a\u0639\u0648\u062f \u0645\u0628\u0644\u063a \u0627\u0644\u062a\u0648\u0641\u064a\u0631 \u0645\u062a\u0627\u062d\u0627\u064b \u0641\u064a \u0646\u0641\u0633 \u0627\u0644\u0645\u062d\u0627\u0641\u0638 \u0644\u064a\u064f\u0633\u062c\u0644 \u0627\u0644\u0635\u0631\u0641 \u0627\u0644\u0641\u0639\u0644\u064a \u0628\u0639\u062f\u0647.' : 'The reserved money will become available in its original wallets, ready for the actual expense.';
  const completionRetention = ar ? '\u0627\u0643\u062a\u0645\u0644. \u0633\u064a\u0628\u0642\u0649 \u0641\u064a \u0627\u0644\u0645\u062a\u0627\u0628\u0639\u0627\u062a \u0644\u0645\u062f\u0629 7 \u0623\u064a\u0627\u0645 \u0644\u0644\u0645\u0631\u0627\u062c\u0639\u0629\u060c \u062b\u0645 \u064a\u0646\u062a\u0642\u0644 \u0625\u0644\u0649 \u0627\u0644\u0623\u0631\u0634\u064a\u0641.' : 'Completed. It stays in Trackers for 7 days for review, then moves to Archive.';
  return {
    releaseGoal,
    releaseGoalConfirm,
    completionRetention,
    title: ar ? 'المتابعات' : 'Trackers',
    all: ar ? 'الكل' : 'All',
    owed: ar ? 'دين عليّ' : 'Debt I owe',
    receivable: ar ? 'دين لي' : 'Debt owed to me',
    saving: ar ? 'توفير' : 'Saving',
    monthly: ar ? 'التزامات' : 'Commitments',
    ended: ar ? 'المنتهية' : 'Ended',
    archived: ar ? 'الأرشيف' : 'Archive',
    archiveTracker: ar ? 'أرشفة المتابعة' : 'Archive tracker',
    archiveTrackerBody: ar ? 'ستنتقل المتابعة إلى الأرشيف مع بقاء الحركات المالية في السجل والتقارير.' : 'The tracker will move to the archive while its financial history stays in reports and history.',
    restoreTracker: ar ? 'إعادة إلى المتابعات' : 'Restore to trackers',
    restoreTrackerBody: ar ? 'ستعود المتابعة مع إبقاء جميع الحركات المالية كما هي.' : 'Restore this tracker while keeping its financial history unchanged.',
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
    debtEnded: ar ? 'انتهى الدين' : 'Debt ended',
    goalCompleted: ar ? 'اكتمل الهدف' : 'Goal completed',
    active: ar ? 'نشط' : 'Active',
    paused: ar ? 'متوقف' : 'Paused',
    paidMonth: ar ? 'تم الدفع هذا الشهر' : 'Paid this month',
    plan: ar ? 'التزام مرتبط' : 'Linked commitment',
    planDue: ar ? 'تاريخ الدفع' : 'Payment date',
    planAmount: ar ? 'مبلغ الالتزام' : 'Commitment amount',
    status: ar ? 'الحالة' : 'Status',
    progress: ar ? 'الإنجاز' : 'Progress',
    dueThisMonth: ar ? 'مستحق هذا الشهر' : 'Due this month',
    dueToday: ar ? 'مستحق اليوم' : 'Due today',
    overdueDate: ar ? 'متأخر منذ' : 'Overdue since',
    dueDate: ar ? 'موعد الدفع' : 'Payment date',
    overdueMonth: ar ? 'متأخر من شهر' : 'Overdue from',
    dueMonth: ar ? 'موعده شهر' : 'Due in',
    noPlan: ar ? 'لا يوجد التزام مرتبط' : 'No linked commitment',
    details: ar ? 'التفاصيل' : 'Details',
    newTracker: ar ? '\u0645\u062a\u0627\u0628\u0639\u0629 \u062c\u062f\u064a\u062f\u0629' : 'New tracker',
    empty: ar ? 'لا توجد متابعات حالياً' : 'No trackers yet',
    pay: ar ? 'تسجيل سداد' : 'Record repayment',
    collect: ar ? 'تسجيل تحصيل' : 'Record collection',
    save: ar ? 'إضافة توفير' : 'Add saving',
    markPaid: ar ? 'تسجيل دفع' : 'Mark paid',
    addPlan: ar ? 'إضافة التزام' : 'Add commitment',
    pausePlan: ar ? 'إيقاف الالتزام' : 'Pause commitment',
    resumePlan: ar ? 'تفعيل الالتزام' : 'Resume commitment',
    deletePlan: ar ? 'حذف الالتزام' : 'Delete commitment',
    postpone: ar ? 'تأجيل الالتزام' : 'Postpone commitment',
    postponeDay: ar ? 'يوم واحد' : '1 day',
    postpone3Days: ar ? '3 أيام' : '3 days',
    postponeNextMonth: ar ? 'الشهر القادم' : 'Next month',
    deferredUntil: ar ? 'مؤجل إلى' : 'Deferred to',
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
    showHistory: ar ? 'إظهار السجل' : 'Show history',
    hideHistory: ar ? 'إخفاء السجل' : 'Hide history',
    noRepayments: ar ? 'لا يوجد سداد مسجل' : 'No repayments yet',
    noCollections: ar ? 'لا يوجد تحصيل مسجل' : 'No collections yet',
    noSavings: ar ? 'لا يوجد توفير مسجل' : 'No savings yet',
    commitmentHistory: ar ? 'سجل دفعات الالتزام' : 'Commitment payment history',
    noCommitmentPayments: ar ? 'لا توجد دفعات مسجلة لهذا الالتزام' : 'No commitment payments yet',
    paymentMonth: ar ? 'شهر الاستحقاق' : 'Due month',
    paymentDate: ar ? 'تاريخ الدفع' : 'Payment date',
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

export default function TrackersLabScreen({
  focusRequest,
  onQuickPay,
  onQuickSave,
  onQuickCommitment,
  onAddLinkedPlan,
  onNewTracker,
}) {
  const {
    trans, debts, goals, commitments, wallets, cfg,
    editDebt, deleteDebt, editDebtPayment, deleteDebtPayment,
    editGoal, deleteGoal, editGoalSaving, deleteGoalSaving, releaseGoalSavings,
    deferCommitment, clearCommitmentDeferral, editCommitment, deleteCommitment,
    archiveTracker, archiveTrackersMany, restoreTracker, deleteTrackersMany, deleteTrackerPaymentsMany,
  } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const commitmentColor = cfg.theme === 'dark' ? '#76A9DB' : '#356FAF';
  const commitmentBg = cfg.theme === 'dark' ? 'rgba(118,169,219,0.18)' : 'rgba(53,111,175,0.12)';
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
  const [expandedPaymentHistoryId, setExpandedPaymentHistoryId] = useState(null);
  const [editTrackerDraft, setEditTrackerDraft] = useState(null);
  const [editPaymentDraft, setEditPaymentDraft] = useState(null);
  const [paymentSelection, setPaymentSelection] = useState({ ownerId: null, ids: [] });
  const currentMonth = monthKey(today());
  const trackers = useMemo(() => {
    const planFor = (type, id) => scopedCommitments.find(plan => plan.linkedType === type && plan.linkedId === id);

    const amountRows = scopedDebts.filter(item => item.direction === 'receivable' ? modules.debtsReceivable : modules.debtsOwed).map(item => {
      const receivable = item.direction === 'receivable';
      const kind = receivable ? 'receivable' : 'owed';
      const total = Number(item.total || 0);
      const doneValue = Number(item.paid || 0);
      const remaining = Math.max(0, total - doneValue);
      const plan = planFor(receivable ? 'receivable' : 'debt', item.id);
      const status = remaining <= 0 ? 'done' : 'active';
      const completedAt = status === 'done' ? (item.completedAt || latestMovementDate(item.payments, item.createdAt)) : null;
      const ended = !item.archivedAt && status === 'done' && isTrackerPastGracePeriod(completedAt);
      return {
        id: `amount:${item.id}`,
        sourceId: item.id,
        kind,
        currencyCode: String(item.currencyCode || cfg.currency).toUpperCase(),
        title: item.name || '',
        icon: receivable ? 'cash-outline' : 'card-outline',
        color: receivable ? th.inc : th.exp,
        bg: receivable ? th.incBg : th.expBg,
        total,
        doneValue,
        remaining,
        progress: pct(doneValue, total),
        status,
        completedAt,
        ended,
        date: item.createdAt,
        plan,
        source: item,
        archived: !!item.archivedAt,
        history: item.payments || [],
      };
    });

    const savingRows = modules.goals ? scopedGoals.map(item => {
      const total = Number(item.target || 0);
      const terminal = ['settled', 'released'].includes(item.status);
      const rawDoneValue = terminal ? Number(item.settledAmount || item.cur || 0) : Number(item.cur || 0);
      const doneValue = Math.min(total, rawDoneValue);
      const remaining = terminal ? 0 : Math.max(0, total - doneValue);
      const plan = planFor('goal', item.id);
      const status = terminal || remaining <= 0 ? 'done' : 'active';
      const completedAt = terminal ? (item.completedAt || item.settledAt || latestMovementDate(item.savings, item.createdAt)) : null;
      const ended = !item.archivedAt && terminal && isTrackerPastGracePeriod(completedAt);
      return {
        id: `saving:${item.id}`,
        sourceId: item.id,
        kind: 'saving',
        currencyCode: String(item.currencyCode || cfg.currency).toUpperCase(),
        title: item.name || '',
        icon: 'flag-outline',
        color: th.primary,
        bg: th.primSoft,
        total,
        doneValue,
        remaining,
        progress: pct(doneValue, total),
        status: item.status === 'settled' || remaining <= 0 ? 'done' : 'active',
        completedAt,
        ended,
        date: item.createdAt,
        plan,
        source: item,
        archived: !!item.archivedAt,
        history: item.savings || [],
      };
    }) : [];

    const monthlyRows = modules.commitments ? scopedCommitments
      .filter(item => !item.linkedType || item.linkedType === 'none')
      .map(item => {
        const dueISO = commitmentDueISO(item);
        const amount = Number(item.amt || 0);
        const oneTimeDone = item.repeatMonthly === false && !!item.lastPaidMonth;
        const paymentRows = trans.filter(tx => tx.isCommitmentPayment && tx.commitmentId === item.id);
        const paidThisMonth = item.lastPaidMonth === currentMonth || paymentRows.some(tx => String(tx.dateISO || tx.date || '').slice(0, 7) === currentMonth);
        const paidThisCycle = paidThisMonth || item.lastPaidMonth === monthKey(dueISO);
        const completedAt = oneTimeDone ? latestMovementDate(paymentRows, item.firstDueISO || null) : null;
        const ended = !item.archivedAt && oneTimeDone && isTrackerPastGracePeriod(completedAt);
        const status = oneTimeDone ? 'done' : item.active === false ? 'paused' : paidThisCycle ? 'paidMonth' : 'active';
        return {
          id: `monthly:${item.id}`,
          sourceId: item.id,
          kind: 'monthly',
          currencyCode: String(item.currencyCode || cfg.currency).toUpperCase(),
          title: item.name || '',
          icon: 'calendar-outline',
          color: th.warn,
          bg: th.warnBg,
          total: amount,
          doneValue: oneTimeDone || paidThisCycle ? amount : 0,
          remaining: oneTimeDone ? 0 : amount,
          progress: oneTimeDone || paidThisCycle ? 100 : 0,
          status,
          paidThisMonth,
          completedAt,
          ended,
          date: dueISO,
          deferredUntilISO: item.deferredUntilISO || null,
          commitment: item,
          plan: null,
          source: item,
          archived: !!item.archivedAt,
          history: paymentRows
            .map(tx => ({
              id: tx.id,
              amt: Math.abs(Number(tx.entityAmount ?? tx.amt ?? item.amt ?? 0)),
              currencyCode: String(tx.entityCurrencyCode || item.currencyCode || cfg.currency).toUpperCase(),
              date: tx.dateISO || tx.date || null,
              cycleMonth: tx.commitmentMonth
                || String(tx.dateISO || tx.date || '').slice(0, 7)
                || null,
              walletId: tx.walletId || item.walletId || null,
              ts: Number(tx.ts || 0),
            }))
            .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || b.ts - a.ts),
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
  }, [trans, debts, goals, commitments, cfg.activeScope, cfg.profileType, th, currentMonth, modules.debtsReceivable, modules.debtsOwed, modules.goals, modules.commitments]);

  const currentTrackers = trackers.filter(item => !item.ended && !item.archived);
  const endedTrackers = trackers.filter(item => item.ended && !item.archived);
  const archivedTrackers = trackers.filter(item => item.archived);
  const summarizeCurrencies = (rows, field) => {
    const totals = new Map();
    rows.forEach(item => {
      const code = String(item.currencyCode || cfg.currency || 'IQD').toUpperCase();
      totals.set(code, (totals.get(code) || 0) + Number(item[field] || 0));
    });
    if (!totals.size) return `${money(0)} ${sym}`;
    return [...totals.entries()]
      .map(([code, value]) => `${money(value)} ${getSymbol(code)}`)
      .join(' · ');
  };
  const summaryTiles = [
    modules.debtsOwed ? {
      key: 'owed',
      label: T.owedTotal,
      valueText: summarizeCurrencies(currentTrackers.filter(item => item.kind === 'owed'), 'remaining'),
      icon: 'card-outline',
      color: th.exp,
      bg: th.expBg,
    } : null,
    modules.debtsReceivable ? {
      key: 'receivable',
      label: T.receivableTotal,
      valueText: summarizeCurrencies(currentTrackers.filter(item => item.kind === 'receivable'), 'remaining'),
      icon: 'cash-outline',
      color: th.inc,
      bg: th.incBg,
    } : null,
    modules.goals ? {
      key: 'saving',
      label: T.savingLeft,
      valueText: summarizeCurrencies(currentTrackers.filter(item => item.kind === 'saving'), 'remaining'),
      icon: 'flag-outline',
      color: th.primary,
      bg: th.primSoft,
    } : null,
    modules.commitments ? {
      key: 'monthly',
      label: T.monthlyTotal,
      valueText: summarizeCurrencies(currentTrackers.filter(item => item.kind === 'monthly' && item.status !== 'done'), 'total'),
      icon: 'calendar-outline',
      color: commitmentColor,
      bg: commitmentBg,
    } : null,
  ].filter(Boolean);
  const filters = [
    { key: 'all', label: T.all, count: currentTrackers.length },
    modules.debtsOwed ? { key: 'owed', label: T.owed, count: currentTrackers.filter(item => item.kind === 'owed').length } : null,
    modules.debtsReceivable ? { key: 'receivable', label: T.receivable, count: currentTrackers.filter(item => item.kind === 'receivable').length } : null,
    modules.goals ? { key: 'saving', label: T.saving, count: currentTrackers.filter(item => item.kind === 'saving').length } : null,
    modules.commitments ? { key: 'monthly', label: T.monthly, count: currentTrackers.filter(item => item.kind === 'monthly').length } : null,
    endedTrackers.length ? { key: 'ended', label: T.ended, count: endedTrackers.length } : null,
    archivedTrackers.length ? { key: 'archived', label: T.archived, count: archivedTrackers.length } : null,
  ].filter(Boolean);
  useEffect(() => {
    if (!filters.some(item => item.key === filter)) setFilter('all');
  }, [filter, endedTrackers.length, archivedTrackers.length, modules.debtsOwed, modules.debtsReceivable, modules.goals, modules.commitments]);
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
  const visibleBase = filter === 'ended'
    ? endedTrackers
    : filter === 'archived'
      ? archivedTrackers
    : filter === 'all'
      ? currentTrackers
      : currentTrackers.filter(item => item.kind === filter);
  const visible = visibleBase;
  const selection = useMultiSelect(visible.map(item => item.id));

  const statusLabel = (status, item) => {
    if (status === 'done') return item?.kind === 'saving' ? T.goalCompleted : item?.kind === 'owed' || item?.kind === 'receivable' ? T.debtEnded : T.done;
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
    if (item.archived) return null;
    if (item.kind === 'saving' && item.source?.purpose === 'reserve' && ['active', 'settled'].includes(item.source?.status) && item.remaining <= 0) {
      return { label: T.releaseGoal, icon: 'lock-open-outline', onPress: () => confirmReleaseGoal(item), color: th.primary };
    }
    if (item.status === 'done' || item.status === 'paused' || item.status === 'paidMonth') return null;
    if (item.kind === 'owed') return { label: T.pay, icon: 'card-outline', onPress: () => onQuickPay?.(item.sourceId), color: th.exp };
    if (item.kind === 'receivable') return { label: T.collect, icon: 'cash-outline', onPress: () => onQuickPay?.(item.sourceId), color: th.inc };
    if (item.kind === 'saving') return { label: T.save, icon: 'add-circle-outline', onPress: () => onQuickSave?.(item.sourceId), color: th.primary };
    return { label: T.markPaid, icon: 'checkmark-circle-outline', onPress: () => onQuickCommitment?.(item.sourceId), color: commitmentColor };
  };

  const describePlan = (commitment, paidThisMonth = false) => {
    if (!commitment) return null;
    const dueISO = commitmentDueISO(commitment);
    const todayDate = new Date(`${today()}T12:00:00`);
    const dueDate = new Date(`${dueISO}T12:00:00`);
    const daysUntil = Math.ceil((dueDate - todayDate) / 86400000);
    const dueMonthLabel = formatCommitmentMonth(dueISO, cfg.lang);
    const dueDateLabel = formatCommitmentDate(dueISO, cfg.lang);
    const deferredDateLabel = dueDateLabel;
    const deferredActive = !!commitment.deferredUntilISO && daysUntil > 0;
    const paidThisCycle = paidThisMonth || commitment.lastPaidMonth === monthKey(todayDate);
    const amount = Number(commitment.amt || 0);
    const currencyCode = String(commitment.currencyCode || cfg.currency).toUpperCase();
    const oneTimeDone = commitment.repeatMonthly === false && !!commitment.lastPaidMonth;

    if (oneTimeDone) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle: true, active: false, label: T.done, color: th.inc, bg: th.incBg };
    }
    if (commitment.active === false) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: false, label: T.paused, color: th.sub, bg: th.cardHigh };
    }
    if (paidThisCycle) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: true, label: T.paidMonth, color: th.inc, bg: th.incBg };
    }
    if (deferredActive) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: true, label: `${T.deferredUntil}: ${deferredDateLabel}`, color: commitmentColor, bg: commitmentBg, deferredUntilISO: commitment.deferredUntilISO, deferredDateLabel };
    }
    if (daysUntil < 0) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: true, label: `${T.overdueDate} ${dueDateLabel}`, color: th.exp, bg: th.expBg };
    }
    if (daysUntil === 0) {
      return { id: commitment.id, amount, currencyCode, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: true, label: T.dueToday, color: commitmentColor, bg: commitmentBg };
    }
    return { id: commitment.id, amount, dueISO, dueMonthLabel, dueDateLabel, paidThisCycle, active: true, label: `${T.dueDate}: ${dueDateLabel}`, color: th.primary, bg: th.primSoft };
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
    if (item.archived) {
      Alert.alert(T.restoreTracker, T.restoreTrackerBody, [
        { text: T.cancel, style: 'cancel' },
        { text: T.restoreTracker, onPress: () => restoreTracker?.(item.kind, item.sourceId) },
      ]);
      return;
    }
    const reservedGoalNeedsRelease = item.kind === 'saving'
      && ['active', 'settled'].includes(item.source?.status)
      && item.remaining <= 0;
    if (reservedGoalNeedsRelease) {
      confirmReleaseGoal(item);
      return;
    }
    const archivable = isSafelyArchivableTracker(item);
    const body = archivable
      ? T.archiveTrackerBody
      : (item.plan ? `${T.confirmDeleteTracker} ${T.linkedPlanDelete}` : T.confirmDeleteTracker);
    Alert.alert(T.confirmDelete, body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: archivable ? T.archiveTracker : T.deleteTracker,
        style: archivable ? 'default' : 'destructive',
        onPress: async () => {
          if (archivable) await archiveTracker?.(item.kind, item.sourceId);
          else if (item.kind === 'saving') await deleteGoal?.(item.sourceId);
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
    const archivedChosen = chosen.filter(item => item.archived);
    if (archivedChosen.length) {
      Alert.alert(T.restoreTracker, T.restoreTrackerBody, [
        { text: T.cancel, style: 'cancel' },
        {
          text: T.restoreTracker,
          onPress: async () => {
            for (const item of archivedChosen) await restoreTracker?.(item.kind, item.sourceId);
            selection.cancel();
          },
        },
      ]);
      return;
    }
    const reservedGoals = chosen.filter(item => (
      item.kind === 'saving'
      && ['active', 'settled'].includes(item.source?.status)
      && item.remaining <= 0
    ));
    if (reservedGoals.length) {
      Alert.alert(
        T.releaseGoal,
        isAr
          ? 'يوجد هدف توفير مكتمل ما زال مبلغه محجوزاً. أتح المبلغ أولاً ثم أعد محاولة إزالة المتابعة.'
          : 'A completed saving goal still has reserved funds. Make the funds available first, then remove the tracker.',
      );
      return;
    }
    const archivable = chosen.filter(isSafelyArchivableTracker);
    const destructive = chosen.filter(item => !isSafelyArchivableTracker(item));
    const hasLinkedPlan = destructive.some(item => item.plan);
    const archivePart = archivable.length
      ? (isAr
          ? ` وإزالة ${archivable.length} متابعة منتهية مع إبقاء تاريخها المالي`
          : ` and hide ${archivable.length} finished tracker(s) while keeping financial history`)
      : '';
    const body = destructive.length
      ? (isAr
          ? `سيتم حذف ${destructive.length} متابعة نشطة وحركاتها${archivePart}.`
          : `Delete ${destructive.length} active tracker(s) with linked movements${archivePart}.`)
      : (isAr
          ? `ستتم إزالة ${archivable.length} متابعة منتهية مع إبقاء جميع الحركات المالية في السجل والتقارير.`
          : `Hide ${archivable.length} finished tracker(s) while keeping all financial history.`);
    Alert.alert(T.confirmDelete, hasLinkedPlan ? `${body} ${T.linkedPlanDelete}` : body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: destructive.length ? T.deleteTracker : T.archiveTracker,
        style: destructive.length ? 'destructive' : 'default',
        onPress: async () => {
          if (archivable.length) {
            await archiveTrackersMany?.(archivable.map(item => ({ kind: item.kind, sourceId: item.sourceId })));
          }
          if (destructive.length) {
            await deleteTrackersMany(destructive.map(item => ({ kind: item.kind, sourceId: item.sourceId })));
          }
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

  useEffect(() => {
    if (!expandedPaymentHistoryId || expandedPaymentHistoryId === openId) return;
    setExpandedPaymentHistoryId(null);
    cancelPaymentSelection();
  }, [expandedPaymentHistoryId, openId]);

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
      {summaryTiles.length ? (
        <View style={[s.summaryGrid, { flexDirection: rowDir }]}>
          {summaryTiles.map(item => (
            <SummaryTile
              key={item.key}
              th={th}
              lang={cfg.lang}
              item={item}
              value={item.valueText}
            />
          ))}
        </View>
      ) : null}
      {cfg.entryMode === 'quick' ? (
        <View style={[s.trackerQuickEntry, { backgroundColor: th.card, borderColor: th.border }]}>
          <Text style={[s.trackerQuickEntryTitle, { color: th.sub, textAlign: align }]}>
            {isAr ? 'إجراءات مباشرة' : 'Direct actions'}
          </Text>
          <View style={[s.trackerQuickEntryRow, { flexDirection: rowDir }]}>
            {[
              modules.debtsOwed
                ? { key: 'owed', label: T.owed, icon: 'arrow-down-outline', color: th.exp, onPress: () => onNewTracker?.({ trackerType: 'owed' }) }
                : null,
              modules.debtsReceivable
                ? { key: 'receivable', label: T.receivable, icon: 'arrow-up-outline', color: th.inc, onPress: () => onNewTracker?.({ trackerType: 'receivable' }) }
                : null,
              modules.goals
                ? { key: 'goal', label: T.saving, icon: 'wallet-outline', color: th.primary, onPress: () => onNewTracker?.({ trackerType: 'goal' }) }
                : null,
              modules.commitments
                ? { key: 'commitment', label: T.monthly, icon: 'calendar-outline', color: commitmentColor, onPress: () => onNewTracker?.({ trackerType: 'commitment' }) }
                : null,
            ].filter(Boolean).map(action => (
              <TouchableOpacity
                key={action.key}
                onPress={action.onPress}
                style={[s.trackerQuickEntryAction, { backgroundColor: th.cardHigh, borderColor: th.border }]}
              >
                <View style={[s.trackerQuickEntryIcon, { backgroundColor: `${action.color}18`, borderColor: `${action.color}44` }]}>
                  <Ionicons name={action.icon} size={18} color={action.color} />
                </View>
                <Text numberOfLines={1} adjustsFontSizeToFit style={[s.trackerQuickEntryLabel, { color: th.text }]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
      <View style={s.filterBlock}>
        <Text style={[s.filterRailTitle, { color: th.sub, textAlign: align }]}>
          {isAr ? 'نوع المتابعة' : 'Tracker type'}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.filterRail, { flexDirection: rowDir }]}
        >
          {filters.map(item => {
            const active = filter === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                onPress={() => { setFilter(item.key); setOpenId(null); }}
                style={[
                  s.filterChip,
                  {
                    backgroundColor: active ? th.primSoft : th.card,
                    borderColor: active ? th.primary : th.border,
                    flexDirection: rowDir,
                  },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.filterChipText, { color: active ? th.primary : th.text }]}>
                  {item.label}
                </Text>
                <View style={[s.filterCount, { backgroundColor: active ? th.card : th.cardHigh }]}>
                  <Text style={[s.filterCountText, { color: active ? th.primary : th.sub }]}>{item.count}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

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
        const historyOpen = expandedPaymentHistoryId === item.id;
        const action = selection.selecting ? null : actionFor(item);
        const plan = describePlan(item.kind === 'monthly' ? item.commitment : item.plan, item.kind === 'monthly' ? item.paidThisMonth : false);
        const postponeCommitmentId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const canPostpone = !!postponeCommitmentId && plan?.active && !plan?.paidThisCycle;
        const doneLabel = item.kind === 'owed' ? T.paid : item.kind === 'receivable' ? T.collected : item.kind === 'saving' ? T.saved : T.paid;
        const primaryAmount = item.kind === 'monthly' ? item.total : item.remaining;
        const itemSym = getSymbol(item.currencyCode || cfg.currency);
        const canAddPlan = modules.commitments && item.kind !== 'monthly' && !plan && item.status !== 'done';
        const managedPlanId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const managedPlanActive = plan?.active !== false;
        const movement = movementLabels(item.kind);
        const amountLabel = item.kind === 'monthly' ? T.planAmount : T.remaining;
        const progressValue = Math.min(100, Math.max(0, Number(item.progress || 0)));
        return (
          <View
            key={item.id}
            style={[
              s.card,
              {
                backgroundColor: cfg.theme === 'light' ? '#FFFFFF' : th.card,
                borderColor: th.border,
              },
            ]}
          >
            <View style={[s.cardAccent, { backgroundColor: item.color }]} />
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
                  <View style={[s.cardIcon, { backgroundColor: th.cardHigh, borderColor: `${item.color}55` }]}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <View style={s.cardContent}>
                    <Text style={{ color: th.text, fontSize: 15, lineHeight: 21, ...weight('900'), textAlign: align }} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <View style={[s.trackerMetaRow, { flexDirection: rowDir }]}>
                      <View style={[s.trackerStateChip, { backgroundColor: `${item.color}18` }]}>
                        <Ionicons
                          name={item.status === 'done' ? 'checkmark-circle-outline' : item.archived ? 'archive-outline' : 'pulse-outline'}
                          size={12}
                          color={item.color}
                        />
                        <Text style={{ color: item.color, fontSize: 10, lineHeight: 14, ...weight('900') }}>
                          {statusLabel(item.status, item)}
                        </Text>
                      </View>
                      <Text style={{ color: th.faint, fontSize: 10, lineHeight: 14, ...weight('800'), textAlign: align }} numberOfLines={1}>
                        {item.kind === 'monthly' ? `${T.next}: ${item.date || '-'}` : item.completedAt ? item.completedAt : item.date || '-'}
                      </Text>
                    </View>
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
              <View style={[s.amountSummary, { backgroundColor: 'transparent', borderTopColor: th.border, flexDirection: rowDir }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align }}>
                    {amountLabel}
                  </Text>
                  <Text style={{ color: item.color, fontSize: 21, lineHeight: 29, ...weight('900'), textAlign: align, marginTop: 2 }}>
                    {money(primaryAmount)} {itemSym}
                  </Text>
                </View>
                {/* STAGE3_FINAL_SIDE_METRIC */}
                <View style={[s.metricSide, { backgroundColor: `${item.color}12` }]}>
                  <Text style={{ color: th.sub, fontSize: 10, lineHeight: 14, ...weight('800'), textAlign: 'center' }}>
                    {item.kind === 'monthly' ? T.next : T.progress}
                  </Text>
                  <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: item.color, fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: 'center', marginTop: 2 }}>
                    {item.kind === 'monthly' ? (item.date || '-') : `${Math.round(progressValue)}%`}
                  </Text>
                </View>
              </View>

              {item.kind === 'monthly' ? (
                <>
                </>
               ) : (
                 <View style={s.progressBlock}>
                  <View style={[s.progressMeta, { flexDirection: rowDir }]}>
                    <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>
                      {doneLabel}: {money(item.doneValue)} {itemSym} / {money(item.total)} {itemSym}
                    </Text>
                  </View>
                  <View style={[s.progressTrack, { backgroundColor: th.cardHigh }]}>
                    <View style={[s.progressFill, { backgroundColor: item.color, width: `${progressValue}%` }]} />
                   </View>
                 </View>
               )}
              {item.status === 'done' && !item.ended && !item.archived ? (
                <View style={[s.completionNotice, { backgroundColor: th.incBg, borderColor: `${th.inc}55`, flexDirection: rowDir }]}>
                  <Ionicons name="information-circle-outline" size={16} color={th.inc} />
                  <Text style={{ color: th.inc, fontSize: 12, lineHeight: 18, ...weight('900'), textAlign: align, flex: 1 }}>
                    {T.completionRetention}
                  </Text>
                </View>
              ) : null}
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
                    <DetailTile th={th} lang={cfg.lang} label={T.total} value={`${money(item.total)} ${itemSym}`} />
                    <DetailTile th={th} lang={cfg.lang} label={doneLabel} value={`${money(item.doneValue)} ${itemSym}`} tone={item.color} />
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
                        <Text style={[s.planFactValue, { color: th.text, textAlign: align }]}>{money(plan.amount)} {getSymbol(plan.currencyCode || item.currencyCode || cfg.currency)}</Text>
                      </View>
                      <View style={[s.planFactCard, { backgroundColor: th.card }]}>
                        <Text style={[s.planFactLabel, { color: th.sub, textAlign: align }]}>{T.planDue}</Text>
                        <Text style={[s.planFactValue, { color: th.text, textAlign: align }]}>{plan.dueDateLabel}</Text>
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
                      linkedCurrency: item.currencyCode || cfg.currency,
                      planOnly: true,
                    })}
                    style={[s.secondaryBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                  >
                    <Ionicons name="add-circle-outline" size={16} color={commitmentColor} />
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
                          <Ionicons name="time-outline" size={13} color={commitmentColor} />
                          <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {plan?.deferredUntilISO ? (
                      <View style={[s.deferredRow, { flexDirection: rowDir }]}>
                        <Text style={{ flex: 1, color: th.warn, fontSize: 12, lineHeight: 18, ...weight('800'), textAlign: align }}>
                          {T.deferredUntil}: {plan.deferredDateLabel}
                        </Text>
                        <TouchableOpacity
                          onPress={() => clearCommitmentDeferral?.(postponeCommitmentId)}
                          style={[s.cancelPostponeBtn, { backgroundColor: th.primaryBg, borderColor: `${th.warn}55` }]}
                        >
                          <Ionicons name="arrow-undo-outline" size={13} color={commitmentColor} />
                          <Text style={{ color: th.warn, fontSize: 12, ...weight('900') }}>{T.cancelPostpone}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}



                {/* STAGE3_FINAL_COMMITMENT_HISTORY */}
                {item.kind === 'monthly' ? (
                  <View style={[s.historyBox, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                    <TouchableOpacity
                      onPress={() => setExpandedPaymentHistoryId(historyOpen ? null : item.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: historyOpen }}
                      style={[s.historyToggle, { flexDirection: rowDir }]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.historyTitle, { color: th.text, textAlign: align }]} numberOfLines={1}>
                          {T.commitmentHistory}
                        </Text>
                        <Text style={{ color: th.sub, fontSize: 11, lineHeight: 16, ...weight('800'), textAlign: align }}>
                          {historyOpen ? T.hideHistory : T.showHistory}
                        </Text>
                      </View>
                      <View style={[s.historyCountBadge, { backgroundColor: th.card, borderColor: th.border }]}>
                        <Text style={{ color: th.text, fontSize: 11, lineHeight: 16, ...weight('900') }}>
                          {(item.history || []).length}
                        </Text>
                      </View>
                      <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={18} color={th.sub} />
                    </TouchableOpacity>

                    {historyOpen && !(item.history || []).length ? (
                      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: align }}>
                        {T.noCommitmentPayments}
                      </Text>
                    ) : null}

                    {historyOpen ? (item.history || []).map(payment => {
                      const cycleISO = payment.cycleMonth
                        ? `${payment.cycleMonth}-01`
                        : (payment.date || today());
                      return (
                        <View
                          key={payment.id}
                          style={[s.commitmentHistoryRow, { borderTopColor: th.border, flexDirection: rowDir }]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: th.text, fontSize: 13, lineHeight: 18, ...weight('900'), textAlign: align }}>
                              {money(payment.amt)} {getSymbol(payment.currencyCode || item.currencyCode || cfg.currency)}
                            </Text>
                            <Text style={{ color: th.sub, fontSize: 11, lineHeight: 17, ...weight('800'), textAlign: align, marginTop: 2 }}>
                              {T.paymentMonth}: {formatCommitmentMonth(cycleISO, cfg.lang)}
                            </Text>
                          </View>
                          <View style={{ minWidth: 104, alignItems: isAr ? 'flex-start' : 'flex-end' }}>
                            <Text style={{ color: th.faint, fontSize: 10, lineHeight: 15, ...weight('800') }}>
                              {T.paymentDate}
                            </Text>
                            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: commitmentColor, fontSize: 11, lineHeight: 17, ...weight('900'), marginTop: 2 }}>
                              {payment.date ? formatCommitmentDate(payment.date, cfg.lang) : '-'}
                            </Text>
                          </View>
                        </View>
                      );
                    }) : null}
                  </View>
                ) : null}

                {item.kind !== 'monthly' ? (
                  <View style={[s.historyBox, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
                    <TouchableOpacity
                      onPress={() => {
                        if (historyOpen) {
                          if (paymentSelection.ownerId === item.id) cancelPaymentSelection();
                          setExpandedPaymentHistoryId(null);
                        } else {
                          setExpandedPaymentHistoryId(item.id);
                        }
                      }}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: historyOpen }}
                      style={[s.historyToggle, { flexDirection: rowDir }]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.historyTitle, { color: th.text, textAlign: align }]} numberOfLines={1}>
                          {movement.history}
                        </Text>
                        <Text style={{ color: th.sub, fontSize: 11, lineHeight: 16, ...weight('800'), textAlign: align }}>
                          {historyOpen ? T.hideHistory : T.showHistory}
                        </Text>
                      </View>
                      <View style={[s.historyCountBadge, { backgroundColor: th.card, borderColor: th.border }]}>
                        <Text style={{ color: th.text, fontSize: 11, lineHeight: 16, ...weight('900') }}>
                          {(item.history || []).length}
                        </Text>
                      </View>
                      <Ionicons name={historyOpen ? 'chevron-up' : 'chevron-down'} size={18} color={th.sub} />
                    </TouchableOpacity>
                    {historyOpen && (item.history || []).length > 0 ? (
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
                    {historyOpen && (item.history || []).length === 0 ? (
                      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: align }}>
                        {movement.empty}
                      </Text>
                    ) : historyOpen ? (item.history || []).map(payment => {
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
                            {money(payment.amt)} {getSymbol(payment.currencyCode || item.currencyCode || cfg.currency)}
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
                    );}) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
    <Modal visible={!!editTrackerDraft} transparent animationType="slide" onRequestClose={closeTrackerEdit}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={[s.modalOverlay, { backgroundColor: th.overlay }]}
      >
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
            monthNameStyle={cfg.monthNameStyle}
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
      </KeyboardAvoidingView>
    </Modal>
    <Modal visible={!!editPaymentDraft} transparent animationType="slide" onRequestClose={closePaymentEdit}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        style={[s.modalOverlay, { backgroundColor: th.overlay }]}
      >
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
            monthNameStyle={cfg.monthNameStyle}
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
      </KeyboardAvoidingView>
    </Modal>
    </>
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

function SummaryTile({ th, lang, item, value }) {
  const align = textAlignFor(lang);
  const rowDir = rowDirFor(lang);
  return (
    <View style={[s.summaryTile, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}>
      <View style={[s.summaryIcon, { backgroundColor: item.bg }]}>
        <Ionicons name={item.icon} size={16} color={item.color} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[s.summaryLabel, { color: th.sub, textAlign: align }]}>
          {item.label}
        </Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[s.summaryValue, { color: item.color, textAlign: align }]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  trackerQuickEntry: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 10, marginBottom: 10 },
  trackerQuickEntryTitle: { fontSize: 12, lineHeight: 17, ...weight('800'), marginBottom: 7 },
  trackerQuickEntryRow: { alignItems: 'stretch', justifyContent: 'space-between', gap: 7 },
  trackerQuickEntryAction: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 64, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 3 },
  trackerQuickEntryIcon: { width: 32, height: 32, borderRadius: 10, borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  trackerQuickEntryLabel: { fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: 'center', maxWidth: '100%' },
  summaryGrid: { flexWrap: 'wrap', gap: 7, marginBottom: 9 },
  summaryTile: { width: '48.5%', minHeight: 60, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, alignItems: 'center', gap: 8 },
  summaryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  summaryValue: { fontSize: 13, lineHeight: 18, marginTop: 1, ...weight('900') },
  filterBlock: { marginBottom: 10 },
  filterRailTitle: { fontSize: 10, lineHeight: 14, ...weight('800'), marginBottom: 6 },
  filterRail: { gap: 6, paddingHorizontal: 1, paddingBottom: 2 },
  filterChip: { minHeight: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', gap: 6, paddingHorizontal: 10 },
  filterChipText: { fontSize: 11, lineHeight: 16, ...weight('900') },
  filterCount: { minWidth: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterCountText: { fontSize: 9, lineHeight: 12, ...weight('900') },
  empty: { minHeight: 180, borderRadius: RADIUS.xl, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { borderRadius: 18, borderWidth: 1, padding: 0, marginBottom: 10, overflow: 'hidden' },
  cardAccent: { height: 4, width: '100%' },
  cardHead: { alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 11, paddingBottom: 10 },
  cardTapZone: { flex: 1, gap: 6 },
  cardTitleBand: { alignItems: 'center', gap: 8 },
  cardContent: { flex: 1 },
  cardIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  trackerMetaRow: { alignItems: 'center', gap: 7, marginTop: 6 },
  trackerStateChip: { minHeight: 22, borderRadius: 11, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  amountSummary: { minHeight: 68, borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center', gap: 10 },
  metricSide: { width: 94, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  paidNotice: { minHeight: 34, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 7, paddingHorizontal: 10, marginHorizontal: 12, marginTop: 8 },
  completionNotice: { minHeight: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 7, paddingHorizontal: 10, marginHorizontal: 12, marginTop: 8 },
  progressBlock: { paddingTop: 8, paddingHorizontal: 12, paddingBottom: 10 },
  progressMeta: { justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  progressTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999 },
  cardTools: { gap: 6, alignItems: 'center' },
  paymentActionBtn: { minHeight: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', gap: 7, marginHorizontal: 12, marginTop: 8, marginBottom: 12, paddingHorizontal: 14 },
  paymentActionText: { color: '#fff', fontSize: 13, lineHeight: 18, ...weight('900') },
  details: { marginHorizontal: 12, paddingTop: 11, paddingBottom: 12, borderTopWidth: 1, gap: 8 },
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
  historyBox: { borderRadius: 14, borderWidth: 1, padding: 10, gap: 6 },
  historyToggle: { minHeight: 48, alignItems: 'center', gap: 9 },
  historyCountBadge: { minWidth: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  historyTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  commitmentHistoryRow: { minHeight: 60, borderTopWidth: 1, paddingVertical: 9, alignItems: 'center', gap: 10 },
  historyRow: { alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8, marginTop: 4 },
  historyIconBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 16, gap: 10 },
  sheetHeader: { alignItems: 'center', gap: 10, marginBottom: 2 },
  sheetTitle: { flex: 1, fontSize: TYPE.title, lineHeight: 28, ...weight('900') },
  input: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, lineHeight: 19, ...weight('800') },
  modalButtons: { gap: 10, marginTop: 4 },
  modalBtn: { flex: 1, minHeight: 46, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
});
