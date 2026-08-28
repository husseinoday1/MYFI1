import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { debtSummary, goalSummary } from '../utils/calc';
import { getUpcomingCommitments, formatCommitmentDate } from '../lib/commitments';
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
  const { debts, goals, commitments } = useStore();

  const scopedDebts = useMemo(() => filterByActiveScope(debts, cfg), [debts, cfg.activeScope, cfg.profileType]);
  const scopedGoals = useMemo(() => filterByActiveScope(goals, cfg), [goals, cfg.activeScope, cfg.profileType]);
  const scopedCommitments = useMemo(() => filterByActiveScope(commitments, cfg), [commitments, cfg.activeScope, cfg.profileType]);
  const debtsSummary = useMemo(() => debtSummary(scopedDebts, 'owed'), [scopedDebts]);
  const savingsSummary = useMemo(() => goalSummary(scopedGoals), [scopedGoals]);
  const upcoming = useMemo(() => getUpcomingCommitments(scopedCommitments), [scopedCommitments]);
  const dueSoon = useMemo(
    () => upcoming.filter(item => item.daysUntil <= 7 && item.daysUntil >= -31).slice(0, 3),
    [upcoming],
  );

  const commitmentsCount = upcoming.filter(item => item.subType !== 'installment' && item.subType !== 'subscription').length;
  const installmentsCount = upcoming.filter(item => item.subType === 'installment').length;
  const subscriptionsCount = upcoming.filter(item => item.subType === 'subscription').length;
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

      {dueSoon.length ? (
        <>
          <SectionTitle th={th} lang={lang}>{isAr ? 'يحتاج انتباهك' : 'Needs attention'}</SectionTitle>
          <View style={s.attentionList}>
            {dueSoon.map(item => {
              const overdue = item.daysUntil < 0;
              const tone = overdue ? th.exp : th.warn;
              return (
                <View key={item.id} style={[s.attentionRow, { backgroundColor: overdue ? th.expBg : th.warnBg, borderColor: `${tone}42`, flexDirection: rowDirection(lang) }]}>
                  <View style={[s.attentionIcon, { backgroundColor: `${tone}22` }]}><Ionicons name={overdue ? 'alert-circle-outline' : 'time-outline'} size={18} color={tone} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.attentionTitle, { color: th.text, textAlign: textAlign(lang) }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[s.attentionMeta, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={1}>
                      {formatCommitmentDate(item.dueISO, lang)} · {money(item.amt)}
                    </Text>
                  </View>
                  <Text style={[s.attentionState, { color: tone }]}>{overdue ? (isAr ? 'متأخر' : 'Overdue') : (isAr ? 'قريب' : 'Soon')}</Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

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
      <Touchable onPress={onOpenPaymentHistory} style={[s.historyLink, { backgroundColor: th.cardHigh, flexDirection: rowDirection(lang) }]}>
        <Ionicons name="receipt-outline" size={18} color={th.sub} />
        <Text style={[s.historyText, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'سجل الدفعات' : 'Payment history'}</Text>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.faint} />
      </Touchable>
    </ScreenScroll>
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
  attentionList: { gap: SPACE.sm },
  attentionRow: { minHeight: 68, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.md, alignItems: 'center', gap: SPACE.sm },
  attentionIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  attentionTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  attentionMeta: { fontSize: 11, lineHeight: 16, ...weight('700'), marginTop: 2 },
  attentionState: { fontSize: 11, lineHeight: 16, ...weight('900') },
  gatewayList: { gap: SPACE.md },
  gateway: { minHeight: 88, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, alignItems: 'center', gap: SPACE.md, ...SHADOW.card },
  gatewayIcon: { width: 44, height: 44, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  gatewayTitle: { fontSize: 16, lineHeight: 22, ...weight('900') },
  gatewayDescription: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  historyLink: { minHeight: 48, borderRadius: RADIUS.lg, marginTop: SPACE.md, paddingHorizontal: SPACE.md, alignItems: 'center', gap: SPACE.sm },
  historyText: { flex: 1, fontSize: 12, lineHeight: 17, ...weight('900') },
});
