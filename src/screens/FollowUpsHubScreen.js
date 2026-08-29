import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { debtSummary, goalSummary } from '../utils/calc';
import { getUpcomingCommitments } from '../lib/commitments';
import { AppButton, ScreenScroll, SectionTitle, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// The Follow-ups hub is intentionally a calm router: it surfaces only work
// that needs attention, then takes the user into a dedicated kind-specific
// screen. Financial calculations and mutations remain in their existing
// tracker flows; this component only chooses the reading order.
export default function FollowUpsHubScreen({
  onOpenDebts,
  onOpenCommitments,
  onOpenInstallments,
  onOpenSubscriptions,
  onOpenGoals,
  onOpenPaymentHistory,
  onNewTracker,
}) {
  const { th, lang, isAr, cfg } = useTheme();
  const { debts, goals, commitments, trans } = useStore();

  const scopedDebts = useMemo(() => filterByActiveScope(debts, cfg), [debts, cfg.activeScope, cfg.profileType]);
  const scopedGoals = useMemo(() => filterByActiveScope(goals, cfg), [goals, cfg.activeScope, cfg.profileType]);
  const scopedCommitments = useMemo(() => filterByActiveScope(commitments, cfg), [commitments, cfg.activeScope, cfg.profileType]);
  const owedSummary = useMemo(() => debtSummary(scopedDebts, 'owed'), [scopedDebts]);
  const receivableSummary = useMemo(() => debtSummary(scopedDebts, 'receivable'), [scopedDebts]);
  const debtsSummary = useMemo(() => ({
    count: owedSummary.count + receivableSummary.count,
    remaining: owedSummary.remaining + receivableSummary.remaining,
  }), [owedSummary, receivableSummary]);
  const savingsSummary = useMemo(() => goalSummary(scopedGoals), [scopedGoals]);
  const upcoming = useMemo(() => getUpcomingCommitments(scopedCommitments), [scopedCommitments]);
  const scopedTrans = useMemo(() => filterByActiveScope(trans, cfg), [trans, cfg.activeScope, cfg.profileType]);
  const upcomingThisWeek = useMemo(
    () => upcoming.filter(item => item.daysUntil >= 0 && item.daysUntil <= 7).length,
    [upcoming],
  );

  const commitmentsCount = upcoming.filter(item => item.subType !== 'installment' && item.subType !== 'subscription').length;
  const installmentsCount = upcoming.filter(item => item.subType === 'installment').length;
  const subscriptionsCount = upcoming.filter(item => item.subType === 'subscription').length;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const paymentsThisMonth = scopedTrans.filter(item => (item.isDebtPayment || item.isCommitmentPayment || item.commitmentId) && String(item.dateISO || item.date || '').slice(0, 7) === currentMonth).length;
  const activeFollowUps = debtsSummary.count + savingsSummary.count + upcoming.length;
  const money = (value) => `${formatMoneyNumber(value, cfg.currency, cfg.lang)} ${cfg.currency}`;
  const gateways = [
    {
      key: 'debts', icon: 'people-outline', tone: th.exp,
      title: isAr ? 'الديون والمستحقات' : 'Debts & Receivables',
      description: debtsSummary.count ? (isAr ? `${debtsSummary.count} متابعة نشطة · ${money(debtsSummary.remaining)}` : `${debtsSummary.count} active · ${money(debtsSummary.remaining)}`) : (isAr ? 'سجّل ما عليك وما لك عند الآخرين' : 'Track money you owe and are owed'),
      onPress: onOpenDebts,
    },
    {
      key: 'commitments', icon: 'calendar-outline', tone: th.warn,
      title: isAr ? 'الالتزامات' : 'Commitments',
      description: commitmentsCount ? (isAr ? `${commitmentsCount} التزام متابع` : `${commitmentsCount} commitments to follow`) : (isAr ? 'الفواتير والمواعيد المتكررة' : 'Bills and recurring due dates'),
      onPress: onOpenCommitments,
    },
    {
      key: 'installments', icon: 'card-outline', tone: th.warn,
      title: isAr ? 'الأقساط' : 'Installments',
      description: installmentsCount ? (isAr ? `${installmentsCount} قسط نشط` : `${installmentsCount} active installments`) : (isAr ? 'تابع القسط القادم وما تبقى' : 'Follow the next payment and what remains'),
      onPress: onOpenInstallments,
    },
    {
      key: 'subscriptions', icon: 'repeat-outline', tone: th.transfer,
      title: isAr ? 'الاشتراكات' : 'Subscriptions',
      description: subscriptionsCount ? (isAr ? `${subscriptionsCount} اشتراك متكرر` : `${subscriptionsCount} recurring subscriptions`) : (isAr ? 'اعرف ما سيتجدد قبل موعده' : 'Know what renews before it is due'),
      onPress: onOpenSubscriptions,
    },
    {
      key: 'savings', icon: 'flag-outline', tone: th.primary,
      title: isAr ? 'الأهداف والتوفير' : 'Goals & Savings',
      description: savingsSummary.count ? (isAr ? `${savingsSummary.count} هدف نشط · المتبقي ${money(savingsSummary.remaining)}` : `${savingsSummary.count} active goals · ${money(savingsSummary.remaining)} left`) : (isAr ? 'حوّل الادخار إلى أهداف واضحة' : 'Turn saving into clear goals'),
      onPress: onOpenGoals,
    },
  ];

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'المتابعات' : 'Follow-ups'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'رتّب ما يحتاج قرارًا أو موعدًا أو تقدّمًا' : 'Keep the things that need action, a date, or progress in order'}</Text>
      </View>

      <View style={[s.summaryCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.summaryHead, { flexDirection: rowDirection(lang) }]}>
          <View style={[s.summaryIcon, { backgroundColor: th.primSoft }]}><Ionicons name="pulse-outline" size={19} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'ملخص المتابعات' : 'Follow-ups summary'}</Text>
            <Text style={[s.summaryHint, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'قراءة سريعة مرتبطة ببياناتك الحالية' : 'A quick reading linked to your current data'}</Text>
          </View>
        </View>
        <View style={[s.summaryGrid, { flexDirection: rowDirection(lang), borderColor: th.border }]}>
          <SummaryMetric value={activeFollowUps} label={isAr ? 'نشطة' : 'Active'} color={th.primary} th={th} />
          <SummaryMetric value={upcomingThisWeek} label={isAr ? 'هذا الأسبوع' : 'This week'} color={upcomingThisWeek ? th.warn : th.inc} bordered th={th} />
          <SummaryMetric value={paymentsThisMonth} label={isAr ? 'دفعات الشهر' : 'Payments'} color={th.inc} th={th} />
        </View>
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'اختر ما تريد متابعته' : 'Choose what to follow'}</SectionTitle>
      <View style={s.gatewayList}>
        {gateways.map(item => <FollowUpGateway key={item.key} th={th} lang={lang} {...item} />)}
      </View>

      <AppButton
        th={th}
        lang={lang}
        icon="add"
        label={isAr ? 'إضافة متابعة' : 'Add follow-up'}
        onPress={() => onNewTracker?.({})}
        style={{ marginTop: SPACE.xl }}
      />
      <Touchable onPress={onOpenPaymentHistory} style={[s.historyLink, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
        <View style={[s.historyIcon, { backgroundColor: `${th.inc}18` }]}><Ionicons name="receipt-outline" size={20} color={th.inc} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.historyText, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'سجل الدفعات' : 'Payment history'}</Text>
          <Text style={[s.historyHint, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? `${paymentsThisMonth} دفعة مسجلة هذا الشهر` : `${paymentsThisMonth} payments recorded this month`}</Text>
        </View>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={19} color={th.primary} />
      </Touchable>
    </ScreenScroll>
  );
}

function SummaryMetric({ value, label, color, bordered, th }) {
  return (
    <View style={[s.summaryMetric, bordered ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: th.border } : null]}>
      <Text style={[s.summaryValue, { color }]}>{value}</Text>
      <Text style={[s.summaryLabel, { color: th?.sub || color }]}>{label}</Text>
    </View>
  );
}

function FollowUpGateway({ th, lang, icon, tone, title, description, onPress }) {
  const isAr = lang === 'ar';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={[s.gateway, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}
    >
      <View style={[s.gatewayIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={21} color={tone} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.gatewayTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
        <Text style={[s.gatewayDescription, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={2}>{description}</Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={20} color={th.faint} />
    </Touchable>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.xl },
  title: { fontSize: 27, lineHeight: 34, ...weight('900') },
  subtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  summaryCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.md, marginBottom: SPACE.lg, ...SHADOW.card },
  summaryHead: { alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md },
  summaryIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 14, lineHeight: 19, ...weight('900') },
  summaryHint: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  summaryGrid: { borderTopWidth: 1, paddingTop: SPACE.md },
  summaryMetric: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  summaryValue: { fontSize: 19, lineHeight: 24, ...weight('900') },
  summaryLabel: { fontSize: 9, lineHeight: 14, ...weight('800'), marginTop: 2, textAlign: 'center' },
  gatewayList: { gap: SPACE.md },
  gateway: { minHeight: 88, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, alignItems: 'center', gap: SPACE.md, ...SHADOW.card },
  gatewayIcon: { width: 44, height: 44, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  gatewayTitle: { fontSize: 16, lineHeight: 22, ...weight('900') },
  gatewayDescription: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  historyLink: { minHeight: 74, borderRadius: RADIUS.xl, borderWidth: 1, marginTop: SPACE.lg, paddingHorizontal: SPACE.md, alignItems: 'center', gap: SPACE.md, ...SHADOW.card },
  historyIcon: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  historyText: { fontSize: 13, lineHeight: 18, ...weight('900') },
  historyHint: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
});
