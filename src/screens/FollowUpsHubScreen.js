import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { debtSummary, goalSummary, getUpcomingRecurring } from '../utils/calc';
import { getUpcomingCommitments, formatCommitmentDate } from '../lib/commitments';
import { CAT_COLORS } from '../lib/constants';
import { ScreenScroll, PageIntro, SectionTitle, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { GatewayCard } from '../components/GatewayCard';

// Installment/subscription tone reuse follows the same rule MyMoneyScreen.js
// already documents: prefer the app's existing CAT_COLORS palette over new
// catalog hex (user direction, 2026-08-26). COMMITMENT_TONE copies the exact
// literal already used for the 'monthly' filter chip in TrackersLabScreen.js
// (not a token — that screen doesn't have one for this either).
const COMMITMENT_TONE = '#356FAF';
const INSTALLMENTS_TONE = CAT_COLORS[6];
const SUBSCRIPTIONS_TONE = CAT_COLORS[2];

// Follow-ups hub — a thin router, same shape as MyMoneyScreen.js. Every
// count/value below comes from an existing helper (debtSummary, goalSummary,
// getUpcomingCommitments, getUpcomingRecurring) already used elsewhere in the
// app (Home, TrackersLabScreen) — no new financial calculation happens here,
// only display aggregation of numbers those helpers already produce.
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
  const { trans, debts, goals, commitments } = useStore();

  const scopedDebts = useMemo(() => filterByActiveScope(debts, cfg), [debts, cfg]);
  const scopedGoals = useMemo(() => filterByActiveScope(goals, cfg), [goals, cfg]);
  const scopedCommitments = useMemo(() => filterByActiveScope(commitments, cfg), [commitments, cfg]);
  const scopedTrans = useMemo(() => filterByActiveScope(trans, cfg), [trans, cfg]);

  const debtsOwed = useMemo(() => debtSummary(scopedDebts, 'owed'), [scopedDebts]);
  const goalsSummary = useMemo(() => goalSummary(scopedGoals), [scopedGoals]);

  // Called once; the three sub-lists below are derived by filtering this
  // one result on subType, not by calling the helper again.
  const upcomingCommitments = useMemo(() => getUpcomingCommitments(scopedCommitments), [scopedCommitments]);

  const genericCommitments = useMemo(
    () => upcomingCommitments.filter((c) => c.subType !== 'installment' && c.subType !== 'subscription'),
    [upcomingCommitments],
  );
  const installmentCommitments = useMemo(
    () => upcomingCommitments.filter((c) => c.subType === 'installment'),
    [upcomingCommitments],
  );
  const subscriptionCommitments = useMemo(
    () => upcomingCommitments.filter((c) => c.subType === 'subscription'),
    [upcomingCommitments],
  );

  const upcomingRecurring = useMemo(
    () => getUpcomingRecurring(scopedTrans).filter((item) => item.daysUntil <= 31),
    [scopedTrans],
  );

  const needsAttention = useMemo(() => {
    const mappedCommitments = upcomingCommitments
      .filter((c) => c.daysUntil <= 31)
      .map((c) => ({ title: c.name, amt: c.amt, daysUntil: c.daysUntil, dueISO: c.dueISO }));
    const mappedRecurring = upcomingRecurring.map((r) => ({ title: r.title, amt: r.amt, daysUntil: r.daysUntil }));
    return [...mappedCommitments, ...mappedRecurring]
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, 4);
  }, [upcomingCommitments, upcomingRecurring]);

  const money = (v) => `${formatMoneyNumber(v, cfg.currency, cfg.lang)} ${cfg.currency}`;

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="checkmark-done-outline"
        title={isAr ? 'المتابعات' : 'Follow-ups'}
        subtitle={isAr ? 'كل ما تحتاج متابعته حتى يكتمل' : 'Everything you need to follow up on, until it is done'}
      />

      <SectionTitle th={th} lang={lang}>{isAr ? 'ملخص المتابعات' : 'Follow-ups summary'}</SectionTitle>
      <View style={{ flexDirection: rowDirection(lang), gap: 8 }}>
        <SummaryTile th={th} lang={lang} icon="calendar-outline" tone={COMMITMENT_TONE} value={`${genericCommitments.length}`} label={isAr ? 'التزامات' : 'Commitments'} />
        <SummaryTile th={th} lang={lang} icon="card-outline" tone={INSTALLMENTS_TONE} value={`${installmentCommitments.length}`} label={isAr ? 'أقساط' : 'Installments'} />
        <SummaryTile th={th} lang={lang} icon="sync-outline" tone={SUBSCRIPTIONS_TONE} value={`${subscriptionCommitments.length}`} label={isAr ? 'اشتراكات' : 'Subscriptions'} />
        <SummaryTile th={th} lang={lang} icon="flag-outline" tone={th.primary} value={`${goalsSummary.count}`} label={isAr ? 'أهداف' : 'Goals'} />
        <SummaryTile th={th} lang={lang} icon="person-outline" tone={th.exp} value={`${debtsOwed.count}`} label={isAr ? 'ديون' : 'Debts'} />
      </View>

      <View style={{ flexDirection: rowDirection(lang), gap: 10 }}>
        <QuickShortcut th={th} lang={lang} icon="arrow-down-outline" tone={th.exp} label={isAr ? 'دين عليّ' : 'Debt I owe'} onPress={() => onNewTracker?.({ trackerType: 'owed' })} />
        <QuickShortcut th={th} lang={lang} icon="arrow-up-outline" tone={th.inc} label={isAr ? 'مستحق لي' : 'Owed to me'} onPress={() => onNewTracker?.({ trackerType: 'receivable' })} />
        <QuickShortcut th={th} lang={lang} icon="calendar-outline" tone={COMMITMENT_TONE} label={isAr ? 'التزام' : 'Commitment'} onPress={() => onNewTracker?.({ trackerType: 'commitment' })} />
        <QuickShortcut th={th} lang={lang} icon="wallet-outline" tone={th.primary} label={isAr ? 'هدف' : 'Goal'} onPress={() => onNewTracker?.({ trackerType: 'goal' })} />
      </View>

      {needsAttention.length > 0 ? (
        <>
          <SectionTitle th={th} lang={lang}>{isAr ? 'يحتاج انتباهك' : 'Needs attention'}</SectionTitle>
          <View style={{ gap: 8 }}>
            {needsAttention.map((item, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: rowDirection(lang),
                  alignItems: 'center',
                  gap: 8,
                  backgroundColor: th.card,
                  borderRadius: 14,
                  padding: 10,
                }}
              >
                <View
                  style={{
                    width: 3,
                    alignSelf: 'stretch',
                    borderRadius: 2,
                    backgroundColor: item.daysUntil < 0 ? th.exp : th.warn,
                  }}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ color: th.text, fontSize: 13, fontWeight: '600', textAlign: textAlign(lang) }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 11, textAlign: textAlign(lang) }} numberOfLines={1}>
                    {item.dueISO ? `${formatCommitmentDate(item.dueISO, lang)} · ` : ''}{money(item.amt)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionTitle th={th} lang={lang}>{isAr ? 'الأقسام الرئيسية' : 'Main sections'}</SectionTitle>
      <View style={{ gap: 10 }}>
        <GatewayCard
          th={th}
          lang={lang}
          index={1}
          tone={th.exp}
          icon="person-outline"
          title={isAr ? 'الديون والمستحقات' : 'Debts & Receivables'}
          value={money(debtsOwed.remaining)}
          meta={isAr ? `${debtsOwed.count} دين نشط` : `${debtsOwed.count} active debts`}
          linkLabel={isAr ? 'عرض الديون' : 'View debts'}
          onPress={onOpenDebts}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={2}
          tone={COMMITMENT_TONE}
          icon="calendar-outline"
          title={isAr ? 'الالتزامات' : 'Commitments'}
          value={`${genericCommitments.length}`}
          linkLabel={isAr ? 'عرض الالتزامات' : 'View commitments'}
          onPress={onOpenCommitments}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={3}
          tone={INSTALLMENTS_TONE}
          icon="card-outline"
          title={isAr ? 'الأقساط' : 'Installments'}
          value={`${installmentCommitments.length}`}
          linkLabel={isAr ? 'عرض الأقساط' : 'View installments'}
          onPress={onOpenInstallments}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={4}
          tone={SUBSCRIPTIONS_TONE}
          icon="sync-outline"
          title={isAr ? 'الاشتراكات' : 'Subscriptions'}
          value={`${subscriptionCommitments.length}`}
          linkLabel={isAr ? 'عرض الاشتراكات' : 'View subscriptions'}
          onPress={onOpenSubscriptions}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={5}
          tone={th.primary}
          icon="flag-outline"
          title={isAr ? 'الأهداف والادخار' : 'Goals & Savings'}
          value={money(goalsSummary.remaining)}
          meta={isAr ? `${goalsSummary.count} هدف نشط` : `${goalsSummary.count} active goals`}
          linkLabel={isAr ? 'عرض الأهداف' : 'View goals'}
          onPress={onOpenGoals}
        />
        <GatewayCard
          th={th}
          lang={lang}
          index={6}
          tone={th.sub}
          icon="receipt-outline"
          title={isAr ? 'سجل الدفعات' : 'Payment History'}
          meta={isAr ? 'كل الدفعات المسجلة' : 'Every recorded payment'}
          linkLabel={isAr ? 'عرض السجل' : 'View history'}
          onPress={onOpenPaymentHistory}
        />
      </View>
    </ScreenScroll>
  );
}

function SummaryTile({ th, lang, icon, label, value, tone }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: th.card,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 6,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: `${tone}22`,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 2,
        }}
      >
        <Ionicons name={icon} size={18} color={tone} />
      </View>
      <Text style={{ color: th.text, fontSize: 16, fontWeight: '700', textAlign: textAlign(lang) }}>
        {value}
      </Text>
      <Text style={{ color: th.sub, fontSize: 10, textAlign: 'center' }} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function QuickShortcut({ th, icon, tone, label, onPress }) {
  return (
    <Touchable
      onPress={onPress}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: th.cardHigh,
      }}
    >
      <Ionicons name={icon} size={20} color={tone} />
      <Text style={{ color: th.text, fontSize: 10, fontWeight: '900', textAlign: 'center' }} numberOfLines={1}>{label}</Text>
    </Touchable>
  );
}
