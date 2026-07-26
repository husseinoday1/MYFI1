import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Touchable } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { pct, today } from '../utils/calc';
import { commitmentDueISO, monthKey } from '../lib/commitments';

const money = (value) => Math.round(Math.abs(Number(value) || 0)).toLocaleString();

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'المتابعات' : 'Trackers',
    subtitle: ar ? 'كل مبلغ أو توفير أو استقطاع شهري في مكان واحد.' : 'Amounts, savings, and monthly plans in one place.',
    all: ar ? 'الكل' : 'All',
    owed: ar ? 'عليّ' : 'I owe',
    receivable: ar ? 'لي' : 'Owed to me',
    saving: ar ? 'توفير' : 'Saving',
    monthly: ar ? 'التزامات' : 'Commitments',
    owedTotal: ar ? 'مستحق عليّ' : 'I owe',
    receivableTotal: ar ? 'مستحق لي' : 'To collect',
    savingLeft: ar ? 'متبقي التوفير' : 'Saving left',
    monthlyTotal: ar ? 'التزامات مستقلة' : 'Standalone plans',
    remaining: ar ? 'المتبقي' : 'Remaining',
    paid: ar ? 'مدفوع' : 'Paid',
    collected: ar ? 'محصل' : 'Collected',
    saved: ar ? 'مدخر' : 'Saved',
    total: ar ? 'الإجمالي' : 'Total',
    target: ar ? 'المطلوب' : 'Target',
    next: ar ? 'القادم' : 'Next',
    done: ar ? 'مكتمل' : 'Done',
    active: ar ? 'نشط' : 'Active',
    paused: ar ? 'متوقف' : 'Paused',
    paidMonth: ar ? 'مدفوع هذا الشهر' : 'Paid this month',
    plan: ar ? 'خطة شهرية' : 'Monthly plan',
    planDue: ar ? 'موعد الخطة' : 'Plan due',
    planAmount: ar ? 'قيمة الخطة' : 'Plan amount',
    dueToday: ar ? 'مستحقة اليوم' : 'Due today',
    overdue: ar ? 'متأخرة' : 'Overdue',
    inDays: ar ? 'بعد' : 'In',
    days: ar ? 'يوم' : 'days',
    noPlan: ar ? 'لا توجد خطة شهرية' : 'No monthly plan',
    details: ar ? 'التفاصيل' : 'Details',
    empty: ar ? 'لا توجد متابعات حالياً' : 'No trackers yet',
    pay: ar ? 'تسجيل دفعة' : 'Record payment',
    collect: ar ? 'تحصيل' : 'Collect',
    save: ar ? 'إضافة توفير' : 'Add saving',
    markPaid: ar ? 'تسجيل دفع' : 'Mark paid',
    addPlan: ar ? 'إضافة خطة شهرية' : 'Add monthly plan',
    pausePlan: ar ? 'إيقاف الخطة' : 'Pause plan',
    resumePlan: ar ? 'تفعيل الخطة' : 'Resume plan',
    deletePlan: ar ? 'حذف الخطة' : 'Delete plan',
    postpone: ar ? 'تأجيل الدفع' : 'Postpone payment',
    postponeDay: ar ? 'يوم' : '1 day',
    postpone3Days: ar ? '3 أيام' : '3 days',
    postponeNextMonth: ar ? 'الشهر القادم' : 'Next month',
    deferredUntil: ar ? 'مؤجل إلى' : 'Deferred until',
    cancelPostpone: ar ? 'إلغاء التأجيل' : 'Cancel deferral',
  };
};

export default function TrackersLabScreen({ onQuickPay, onQuickSave, onQuickCommitment, onAddLinkedPlan }) {
  const { debts, goals, commitments, cfg, deferCommitment, clearCommitmentDeferral, editCommitment, deleteCommitment } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const T = copy(cfg.lang);
  const sym = getSymbol(cfg.currency);
  const isAr = cfg.lang === 'ar';
  const align = isAr ? 'right' : 'left';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const [filter, setFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  const trackers = useMemo(() => {
    const planFor = (type, id) => (commitments || []).find(plan => plan.linkedType === type && plan.linkedId === id);

    const amountRows = (debts || []).map(item => {
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
      };
    });

    const savingRows = (goals || []).map(item => {
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
        status: remaining <= 0 ? 'done' : 'active',
        date: item.createdAt,
        plan,
      };
    });

    const monthlyRows = (commitments || [])
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
        };
      });

    return [...amountRows, ...savingRows, ...monthlyRows].sort((a, b) => {
      const aDone = a.status === 'done' ? 1 : 0;
      const bDone = b.status === 'done' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      if (a.kind === 'monthly' && b.kind !== 'monthly') return -1;
      if (b.kind === 'monthly' && a.kind !== 'monthly') return 1;
      return Math.abs(b.remaining || 0) - Math.abs(a.remaining || 0);
    });
  }, [debts, goals, commitments, th]);

  const totals = useMemo(() => ({
    owed: trackers.filter(item => item.kind === 'owed').reduce((sum, item) => sum + item.remaining, 0),
    receivable: trackers.filter(item => item.kind === 'receivable').reduce((sum, item) => sum + item.remaining, 0),
    saving: trackers.filter(item => item.kind === 'saving').reduce((sum, item) => sum + item.remaining, 0),
    monthly: (commitments || [])
      .filter(item => item.active !== false && (!item.linkedType || item.linkedType === 'none'))
      .reduce((sum, item) => sum + Number(item.amt || 0), 0),
  }), [trackers, commitments]);

  const filters = [
    ['all', T.all],
    ['owed', T.owed],
    ['receivable', T.receivable],
    ['saving', T.saving],
    ['monthly', T.monthly],
  ];
  const visible = filter === 'all' ? trackers : trackers.filter(item => item.kind === filter);

  const kindLabel = (kind) => {
    if (kind === 'owed') return T.owed;
    if (kind === 'receivable') return T.receivable;
    if (kind === 'saving') return T.saving;
    return T.monthly;
  };

  const statusLabel = (status) => {
    if (status === 'done') return T.done;
    if (status === 'paused') return T.paused;
    if (status === 'paidMonth') return T.paidMonth;
    return T.active;
  };

  const actionFor = (item) => {
    if (item.status === 'done' || item.status === 'paused' || item.status === 'paidMonth') return null;
    if (item.kind === 'owed') return { label: T.pay, onPress: () => onQuickPay?.(item.sourceId), color: th.exp };
    if (item.kind === 'receivable') return { label: T.collect, onPress: () => onQuickPay?.(item.sourceId), color: th.inc };
    if (item.kind === 'saving') return { label: T.save, onPress: () => onQuickSave?.(item.sourceId), color: th.primary };
    return { label: T.markPaid, onPress: () => onQuickCommitment?.(item.sourceId), color: th.warn };
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 112 }}>
      <View style={[s.hero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.heroTop, { flexDirection: rowDir }]}>
          <View style={[s.heroIcon, { backgroundColor: th.primSoft }]}>
            <Ionicons name="layers-outline" size={20} color={th.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: th.text, fontSize: 23, lineHeight: 30, ...weight('900'), textAlign: align }}>{T.title}</Text>
            <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: align, marginTop: 2 }}>{T.subtitle}</Text>
          </View>
        </View>
      </View>

      <View style={[s.summaryGrid, { flexDirection: rowDir }]}>
        <SummaryBox th={th} label={T.owedTotal} value={`${money(totals.owed)} ${sym}`} color={th.exp} bg={th.expBg} />
        <SummaryBox th={th} label={T.receivableTotal} value={`${money(totals.receivable)} ${sym}`} color={th.inc} bg={th.incBg} />
        <SummaryBox th={th} label={T.savingLeft} value={`${money(totals.saving)} ${sym}`} color={th.primary} bg={th.primSoft} />
        <SummaryBox th={th} label={T.monthlyTotal} value={`${money(totals.monthly)} ${sym}`} color={th.warn} bg={th.warnBg} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterRail}>
        {filters.map(([key, label]) => {
          const active = filter === key;
          return (
            <Touchable
              key={key}
              onPress={() => setFilter(key)}
              style={[s.filterChip, { backgroundColor: active ? th.primary : th.cardHigh, borderColor: active ? th.primary : 'transparent' }]}
            >
              <Text style={{ color: active ? th.onPrimary : th.sub, fontSize: 12, ...weight('900') }}>{label}</Text>
            </Touchable>
          );
        })}
      </ScrollView>

      {visible.length === 0 ? (
        <View style={[s.empty, { backgroundColor: th.card, borderColor: th.border }]}>
          <Ionicons name="albums-outline" size={34} color={th.faint} />
          <Text style={{ color: th.sub, fontSize: 13, ...weight('800'), marginTop: 8 }}>{T.empty}</Text>
        </View>
      ) : visible.map(item => {
        const open = openId === item.id;
        const action = actionFor(item);
        const plan = describePlan(item.kind === 'monthly' ? item.commitment : item.plan);
        const postponeCommitmentId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const canPostpone = !!postponeCommitmentId && plan?.active && !plan?.paidThisCycle;
        const doneLabel = item.kind === 'owed' ? T.paid : item.kind === 'receivable' ? T.collected : item.kind === 'saving' ? T.saved : T.paid;
        const primaryAmount = item.kind === 'monthly' ? item.total : item.remaining;
        const canAddPlan = item.kind !== 'monthly' && !plan && item.status !== 'done';
        const managedPlanId = item.kind === 'monthly' ? item.sourceId : plan?.id;
        const managedPlanActive = plan?.active !== false;
        return (
          <View key={item.id} style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
            <Touchable onPress={() => setOpenId(open ? null : item.id)} activeOpacity={0.82}>
              <View style={[s.cardHead, { flexDirection: rowDir }]}>
                <View style={[s.cardIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={18} color={item.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 15, lineHeight: 21, ...weight('900'), textAlign: align }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: item.color, fontSize: 11, lineHeight: 16, ...weight('900'), marginTop: 2, textAlign: align }}>
                    {kindLabel(item.kind)} · {statusLabel(item.status)}
                  </Text>
                  {plan ? (
                    <View style={[s.planInline, { flexDirection: rowDir }]}>
                      <View style={[s.planDot, { backgroundColor: plan.color }]} />
                      <Text style={{ color: plan.color, fontSize: 10, lineHeight: 15, ...weight('900'), textAlign: align }} numberOfLines={1}>
                        {money(plan.amount)} {sym} · {plan.label}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ alignItems: isAr ? 'flex-start' : 'flex-end' }}>
                  <Text style={{ color: item.color, fontSize: 17, lineHeight: 23, ...weight('900') }}>
                    {money(primaryAmount)} {sym}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 10, lineHeight: 15, ...weight('800') }}>
                    {item.kind === 'monthly' ? T.next : T.remaining}: {item.date || '-'}
                  </Text>
                </View>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={th.faint} />
              </View>
              <View style={[s.progressBg, { backgroundColor: th.cardHigh }]}>
                <View style={[s.progressFg, { width: `${Math.max(0, Math.min(100, item.progress))}%`, backgroundColor: item.color }]} />
              </View>
            </Touchable>

            {open ? (
              <View style={[s.details, { borderTopColor: th.border }]}>
                <View style={[s.detailLine, { flexDirection: rowDir }]}>
                  <Text style={[s.detailLabel, { color: th.sub, textAlign: align }]}>{T.details}</Text>
                  <Text style={[s.detailValue, { color: th.text }]}>{kindLabel(item.kind)}</Text>
                </View>
                <View style={[s.detailLine, { flexDirection: rowDir }]}>
                  <Text style={[s.detailLabel, { color: th.sub, textAlign: align }]}>{doneLabel}</Text>
                  <Text style={[s.detailValue, { color: th.text }]}>{money(item.doneValue)} / {money(item.total)} {sym}</Text>
                </View>
                {item.kind !== 'monthly' ? (
                  <View style={[s.detailLine, { flexDirection: rowDir }]}>
                    <Text style={[s.detailLabel, { color: th.sub, textAlign: align }]}>{T.remaining}</Text>
                    <Text style={[s.detailValue, { color: item.color }]}>{money(item.remaining)} {sym}</Text>
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
                      <Text style={{ color: plan.color, fontSize: 11, lineHeight: 16, ...weight('900'), textAlign: align }}>
                        {plan.label}
                      </Text>
                    </View>
                    <View style={[s.planFacts, { flexDirection: rowDir }]}>
                      <Text style={[s.planFact, { color: th.sub, textAlign: align }]}>
                        {T.planAmount}: {money(plan.amount)} {sym}
                      </Text>
                      <Text style={[s.planFact, { color: th.sub, textAlign: align }]}>
                        {T.planDue}: {plan.dueISO}
                      </Text>
                    </View>
                  </View>
                ) : null}
                {canAddPlan ? (
                  <Touchable
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
                  </Touchable>
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
                        <Touchable
                          key={mode}
                          onPress={() => deferCommitment?.(postponeCommitmentId, mode)}
                          style={[s.postponeChip, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                        >
                          <Ionicons name="time-outline" size={13} color={th.warn} />
                          <Text style={{ color: th.text, fontSize: 11, ...weight('900') }}>{label}</Text>
                        </Touchable>
                      ))}
                    </View>
                    {plan?.deferredUntilISO ? (
                      <View style={[s.deferredRow, { flexDirection: rowDir }]}>
                        <Text style={{ flex: 1, color: th.warn, fontSize: 11, ...weight('800'), textAlign: align }}>
                          {T.deferredUntil}: {plan.deferredUntilISO}
                        </Text>
                        <Touchable
                          onPress={() => clearCommitmentDeferral?.(postponeCommitmentId)}
                          style={[s.cancelPostponeBtn, { backgroundColor: th.warnBg, borderColor: `${th.warn}55` }]}
                        >
                          <Ionicons name="close-circle-outline" size={13} color={th.warn} />
                          <Text style={{ color: th.warn, fontSize: 11, ...weight('900') }}>{T.cancelPostpone}</Text>
                        </Touchable>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {managedPlanId ? (
                  <View style={[s.manageRow, { flexDirection: rowDir }]}>
                    <Touchable
                      onPress={() => editCommitment?.(managedPlanId, { active: !managedPlanActive })}
                      style={[s.manageBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}
                    >
                      <Ionicons name={managedPlanActive ? 'pause-circle-outline' : 'play-circle-outline'} size={15} color={th.warn} />
                      <Text style={{ color: th.text, fontSize: 11, ...weight('900') }}>
                        {managedPlanActive ? T.pausePlan : T.resumePlan}
                      </Text>
                    </Touchable>
                    <Touchable
                      onPress={() => deleteCommitment?.(managedPlanId)}
                      style={[s.manageBtn, { backgroundColor: th.expBg, borderColor: th.expBg }]}
                    >
                      <Ionicons name="trash-outline" size={15} color={th.exp} />
                      <Text style={{ color: th.exp, fontSize: 11, ...weight('900') }}>{T.deletePlan}</Text>
                    </Touchable>
                  </View>
                ) : null}
                {action ? (
                  <Touchable onPress={action.onPress} style={[s.actionBtn, { backgroundColor: action.color }]}>
                    <Text style={{ color: '#fff', fontSize: 13, ...weight('900') }}>{action.label}</Text>
                  </Touchable>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

function SummaryBox({ th, label, value, color, bg }) {
  return (
    <View style={[s.summaryBox, { backgroundColor: th.card, borderColor: th.border }]}>
      <View style={[s.summaryDot, { backgroundColor: bg }]}>
        <View style={[s.summaryDotInner, { backgroundColor: color }]} />
      </View>
      <Text style={{ color: th.sub, fontSize: 10, lineHeight: 14, ...weight('900'), textAlign: 'center' }}>{label}</Text>
      <Text style={{ color, fontSize: 13, lineHeight: 18, ...weight('900'), textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { borderRadius: 16, borderWidth: 0.5, padding: 15, marginBottom: 12 },
  heroTop: { alignItems: 'center', gap: 10 },
  heroIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  summaryGrid: { flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  summaryBox: { width: '48.5%', minHeight: 82, borderRadius: 14, borderWidth: 0.5, padding: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  summaryDot: { width: 24, height: 24, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  summaryDotInner: { width: 9, height: 9, borderRadius: 5 },
  filterRail: { gap: 8, paddingBottom: 12 },
  filterChip: { minHeight: 38, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 180, borderRadius: 16, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 13, marginBottom: 10 },
  cardHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  cardIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  planInline: { alignItems: 'center', gap: 5, marginTop: 1, maxWidth: '100%' },
  planDot: { width: 6, height: 6, borderRadius: 3 },
  progressBg: { height: 7, borderRadius: 7, overflow: 'hidden' },
  progressFg: { height: 7, borderRadius: 7 },
  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 0.5, gap: 8 },
  detailLine: { alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  detailLabel: { flex: 1, fontSize: 12, lineHeight: 17, ...weight('800') },
  detailValue: { fontSize: 12, lineHeight: 17, ...weight('900') },
  planPanel: { borderRadius: 13, borderWidth: 0.5, padding: 10, gap: 8 },
  planPanelHead: { alignItems: 'center', gap: 8 },
  planBadge: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  planFacts: { flexWrap: 'wrap', gap: 8 },
  planFact: { fontSize: 11, lineHeight: 16, ...weight('900') },
  secondaryBtn: { minHeight: 40, borderRadius: 12, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  postponeBlock: { gap: 7 },
  postponeRail: { flexWrap: 'wrap', gap: 7 },
  postponeChip: { minHeight: 34, borderRadius: 11, borderWidth: 0.5, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center', gap: 5, flexDirection: 'row' },
  deferredRow: { alignItems: 'center', gap: 8 },
  cancelPostponeBtn: { minHeight: 30, borderRadius: 10, borderWidth: 0.5, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center', gap: 5, flexDirection: 'row' },
  manageRow: { gap: 8 },
  manageBtn: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 8 },
  actionBtn: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
