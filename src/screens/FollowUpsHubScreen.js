import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope, getModules } from '../lib/modules';
import { debtSummary, goalSummary } from '../utils/calc';
import { getUpcomingCommitments } from '../lib/commitments';
import { ScreenScroll, SectionTitle, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

// The Follow-ups hub is intentionally a calm router. It shows the user's
// tracker areas, then the next real payments and the latest recorded payment.
// It does not duplicate Home's cross-product "Needs attention" feed.
export default function FollowUpsHubScreen({
  onOpenOwed,
  onOpenReceivable,
  onOpenCommitments,
  onOpenGoals,
  onOpenPaymentHistory,
}) {
  const { th, lang, isAr, cfg } = useTheme();
  const { debts, goals, commitments, trans } = useStore();
  const modules = getModules(cfg);

  const scopedDebts = useMemo(() => filterByActiveScope(debts, cfg), [debts, cfg.activeScope, cfg.profileType]);
  const scopedGoals = useMemo(() => filterByActiveScope(goals, cfg), [goals, cfg.activeScope, cfg.profileType]);
  const scopedCommitments = useMemo(() => filterByActiveScope(commitments, cfg), [commitments, cfg.activeScope, cfg.profileType]);
  const owedSummary = useMemo(() => debtSummary(scopedDebts, 'owed'), [scopedDebts]);
  const receivableSummary = useMemo(() => debtSummary(scopedDebts, 'receivable'), [scopedDebts]);
  const savingsSummary = useMemo(() => goalSummary(scopedGoals), [scopedGoals]);
  const upcoming = useMemo(() => getUpcomingCommitments(scopedCommitments), [scopedCommitments]);
  const scopedTrans = useMemo(() => filterByActiveScope(trans, cfg), [trans, cfg.activeScope, cfg.profileType]);
  const upcomingThisWeek = useMemo(
    () => upcoming.filter(item => item.subType !== 'installment' && item.subType !== 'subscription' && item.daysUntil >= 0 && item.daysUntil <= 7).length,
    [upcoming],
  );

  const commitmentsCount = modules.commitments
    ? upcoming.filter(item => item.subType !== 'installment' && item.subType !== 'subscription').length
    : 0;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const paymentsThisMonth = scopedTrans.filter(item => (item.isDebtPayment || item.isCommitmentPayment || item.commitmentId) && String(item.dateISO || item.date || '').slice(0, 7) === currentMonth).length;
  const activeFollowUps = (modules.debtsOwed ? owedSummary.count : 0)
    + (modules.debtsReceivable ? receivableSummary.count : 0)
    + (modules.goals ? savingsSummary.count : 0)
    + commitmentsCount;
  const money = (value) => `${formatMoneyNumber(value, cfg.currency, cfg.lang)} ${cfg.currency}`;
  const gateways = [
    {
      key: 'owed', icon: 'arrow-down-outline', tone: th.exp,
      title: isAr ? 'دين عليّ' : 'Debt I owe',
      description: owedSummary.count ? (isAr ? `${owedSummary.count} دين نشط · ${money(owedSummary.remaining)}` : `${owedSummary.count} active debts · ${money(owedSummary.remaining)}`) : (isAr ? 'تابع ما عليك للآخرين' : 'Track what you owe others'),
      onPress: onOpenOwed, visible: modules.debtsOwed,
    },
    {
      key: 'receivable', icon: 'arrow-up-outline', tone: th.inc,
      title: isAr ? 'دين لي' : 'Debt owed to me',
      description: receivableSummary.count ? (isAr ? `${receivableSummary.count} مستحق نشط · ${money(receivableSummary.remaining)}` : `${receivableSummary.count} active receivables · ${money(receivableSummary.remaining)}`) : (isAr ? 'تابع ما لك عند الآخرين' : 'Track what others owe you'),
      onPress: onOpenReceivable, visible: modules.debtsReceivable,
    },
    {
      key: 'commitments', icon: 'calendar-outline', tone: th.warn,
      title: isAr ? 'الالتزامات' : 'Commitments',
      description: commitmentsCount ? (isAr ? `${commitmentsCount} التزام متابع` : `${commitmentsCount} commitments to follow`) : (isAr ? 'الفواتير والمواعيد المتكررة' : 'Bills and recurring due dates'),
      onPress: onOpenCommitments, visible: modules.commitments,
    },
    {
      key: 'savings', icon: 'flag-outline', tone: th.primary,
      title: isAr ? 'الأهداف والتوفير' : 'Goals & Savings',
      description: savingsSummary.count ? (isAr ? `${savingsSummary.count} هدف نشط · المتبقي ${money(savingsSummary.remaining)}` : `${savingsSummary.count} active goals · ${money(savingsSummary.remaining)} left`) : (isAr ? 'حوّل الادخار إلى أهداف واضحة' : 'Turn saving into clear goals'),
      onPress: onOpenGoals, visible: modules.goals,
    },
  ].filter(item => item.visible);

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'المتابعات' : 'Follow-ups'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'ما يحتاج متابعة فعلية' : 'What needs follow-through'}</Text>
      </View>

      <View style={[s.summaryCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.summaryGrid, { flexDirection: rowDirection(lang) }]}>
          <SummaryMetric value={activeFollowUps} label={isAr ? 'نشطة' : 'Active'} color={th.primary} th={th} />
          <SummaryMetric value={modules.commitments ? upcomingThisWeek : 0} label={isAr ? 'هذا الأسبوع' : 'This week'} color={modules.commitments && upcomingThisWeek ? th.warn : th.inc} bordered th={th} />
          <SummaryMetric value={paymentsThisMonth} label={isAr ? 'دفعات الشهر' : 'Payments'} color={th.inc} th={th} />
        </View>
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'اختر ما تريد متابعته' : 'Choose what to follow'}</SectionTitle>
      <View style={[s.gatewayList, { flexDirection: rowDirection(lang) }]}>
        {gateways.map(({ key, ...gateway }) => (
          <FollowUpGateway key={key} th={th} lang={lang} {...gateway} />
        ))}
      </View>

      <Touchable onPress={onOpenPaymentHistory} style={[s.paymentHistoryAction, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
        <View style={[s.paymentHistoryIcon, { backgroundColor: th.primSoft }]}><Ionicons name="receipt-outline" size={18} color={th.inc} /></View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[s.paymentHistoryTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'سجل الدفعات' : 'Payment history'}</Text>
          <Text style={[s.paymentHistoryDescription, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'كل الدفعات والتحصيلات المسجلة' : 'All recorded payments and collections'}</Text>
        </View>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.primary} />
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
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={[s.gateway, { backgroundColor: th.card, borderColor: th.border }]}
    >
      <View style={[s.gatewayIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={21} color={tone} /></View>
      <Text style={[s.gatewayTitle, { color: th.text, textAlign: textAlign(lang) }]} numberOfLines={1}>{title}</Text>
      <Text style={[s.gatewayDescription, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={1}>{description}</Text>
    </Touchable>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 0, marginBottom: 9 },
  title: { fontSize: 22, lineHeight: 27, ...weight('900') },
  subtitle: { fontSize: 10, lineHeight: 14, ...weight('700'), marginTop: 1 },
  summaryCard: { borderRadius: RADIUS.lg, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, marginBottom: 8, ...SHADOW.card },
  summaryGrid: {},
  summaryMetric: { flex: 1, minWidth: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  summaryValue: { fontSize: 18, lineHeight: 22, ...weight('900') },
  summaryLabel: { fontSize: 8, lineHeight: 12, ...weight('800'), marginTop: 1, textAlign: 'center' },
  gatewayList: { gap: 8, flexWrap: 'wrap' },
  gateway: { width: '48.7%', minHeight: 93, borderRadius: RADIUS.lg, borderWidth: 1, padding: 10, justifyContent: 'center', gap: 5, ...SHADOW.card },
  gatewayIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  gatewayTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  gatewayDescription: { fontSize: 9, lineHeight: 13, ...weight('700') },
  paymentHistoryAction: { minHeight: 58, marginTop: 10, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', gap: 9, paddingHorizontal: 11, ...SHADOW.card },
  paymentHistoryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  paymentHistoryTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  paymentHistoryDescription: { fontSize: 9, lineHeight: 13, ...weight('700'), marginTop: 1 },
});
