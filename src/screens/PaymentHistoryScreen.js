import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { formatCommitmentDate } from '../lib/commitments';
import { ScreenScroll, PageIntro, SectionTitle, SurfaceCard, IconContainer, EmptyState, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// Payment History — Follow-ups section named in
// docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md ("Payment History").
// Read-only aggregation of existing payment records: debt.payments[]
// (already written by trackersSlice's debt-payment action) and transactions
// already carrying a commitmentId (already written by the existing
// add-transaction flow — see src/store/slices/transactionsSlice.js's
// syncCommitmentPaidMonth usage). No new financial writes, no new
// calculation — every amount shown is copied verbatim from an existing
// record.
export default function PaymentHistoryScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const { debts, commitments, trans } = useStore();
  const [filter, setFilter] = useState('all');

  const entries = useMemo(() => {
    const scopedDebts = filterByActiveScope(debts, cfg);
    const scopedTrans = filterByActiveScope(trans, cfg);
    const commitmentNameById = new Map(commitments.map((item) => [item.id, item.name]));

    const debtEntries = scopedDebts.flatMap((debt) =>
      (debt.payments || []).map((payment) => ({
        id: `debt:${debt.id}:${payment.id}`,
        dateISO: payment.date || '',
        ts: payment.ts || 0,
        amt: Number(payment.amt || 0),
        currencyCode: payment.currencyCode || cfg.currency,
        label: debt.name || (isAr ? 'دين' : 'Debt'),
        kindLabel: debt.kind === 'receivable' ? (isAr ? 'تحصيل' : 'Collection') : (isAr ? 'دفعة دين' : 'Debt payment'),
        kind: debt.kind === 'receivable' ? 'collection' : 'debt',
      })),
    );

    const commitmentEntries = scopedTrans
      .filter((t) => t.commitmentId)
      .map((t) => ({
        id: `tx:${t.id}`,
        dateISO: t.dateISO || '',
        ts: t.ts || 0,
        amt: Number(t.amt || 0),
        currencyCode: t.currencyCode || cfg.currency,
        label: t.title || commitmentNameById.get(t.commitmentId) || (isAr ? 'التزام' : 'Commitment'),
        kindLabel: isAr ? 'التزام شهري' : 'Monthly commitment',
        kind: 'commitment',
      }));

    const savingsEntries = scopedTrans
      .filter((t) => (t.goalId || t.isGoalSaving) && !t.commitmentId)
      .map((t) => ({
        id: `goal:${t.id}`,
        dateISO: t.dateISO || '',
        ts: t.ts || 0,
        amt: Number(t.amt || 0),
        currencyCode: t.currencyCode || cfg.currency,
        label: t.title || (isAr ? 'إضافة للتوفير' : 'Savings contribution'),
        kindLabel: isAr ? 'إضافة للتوفير' : 'Savings contribution',
        kind: 'saving',
      }));

    return [...debtEntries, ...commitmentEntries, ...savingsEntries].sort((a, b) => {
      if (a.ts && b.ts) return b.ts - a.ts;
      return String(b.dateISO).localeCompare(String(a.dateISO));
    });
  }, [debts, commitments, trans, cfg.activeScope, cfg.profileType, cfg.currency, isAr]);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthEntries = entries.filter(entry => String(entry.dateISO).slice(0, 7) === monthKey);
  const sources = new Set(entries.map(entry => entry.kind)).size;
  const visibleEntries = filter === 'all' ? entries : entries.filter(entry => entry.kind === filter);
  const filterOptions = [
    { key: 'all', label: isAr ? 'الكل' : 'All' },
    { key: 'debt', label: isAr ? 'ديون' : 'Debts' },
    { key: 'collection', label: isAr ? 'تحصيل' : 'Collections' },
    { key: 'commitment', label: isAr ? 'التزامات' : 'Commitments' },
    { key: 'saving', label: isAr ? 'توفير' : 'Savings' },
  ].filter(option => option.key === 'all' || entries.some(entry => entry.kind === option.key));

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="receipt-outline"
        title={isAr ? 'سجل الدفعات' : 'Payment History'}
        subtitle={isAr ? 'كل الدفعات المسجلة على الديون والالتزامات' : 'Every payment recorded against debts and commitments'}
      />

      <View style={[s.summary, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.summaryHeader, { flexDirection: rowDirection(lang) }]}>
          <IconContainer th={th} icon="checkmark-done-outline" tone={th.inc} />
          <View style={{ flex: 1 }}>
            <Text style={[s.summaryTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'دفعات موثّقة' : 'Recorded payments'}</Text>
            <Text style={[s.summaryBody, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'سجل حي مبني من الديون والالتزامات والتوفير' : 'A live record built from debt, commitment, and savings activity'}</Text>
          </View>
        </View>
        <View style={[s.metrics, { flexDirection: rowDirection(lang), borderTopColor: th.border }]}>
          <Metric value={entries.length} label={isAr ? 'كل الدفعات' : 'All payments'} color={th.primary} labelColor={th.sub} />
          <Metric value={monthEntries.length} label={isAr ? 'هذا الشهر' : 'This month'} color={th.inc} labelColor={th.sub} bordered borderColor={th.border} />
          <Metric value={sources} label={isAr ? 'أنواع مرتبطة' : 'Linked types'} color={th.transfer} labelColor={th.sub} />
        </View>
      </View>

      {entries.length === 0 ? (
        <EmptyState
          th={th}
          icon="receipt-outline"
          title={isAr ? 'لا توجد دفعات بعد' : 'No payments yet'}
          body={isAr ? 'الدفعات على الديون والالتزامات تظهر هنا تلقائيًا.' : 'Payments against debts and commitments will show up here automatically.'}
        />
      ) : (
        <>
          <SectionTitle th={th} lang={lang}>{isAr ? 'التسلسل الزمني' : 'Timeline'}</SectionTitle>
          <View style={[s.filterRail, { flexDirection: rowDirection(lang) }]}>
            {filterOptions.map(option => {
              const active = filter === option.key;
              return (
                <Touchable
                  key={option.key}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setFilter(option.key)}
                  style={[s.filterChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border }]}
                >
                  <Text style={[s.filterText, { color: active ? th.primary : th.sub }]}>{option.label}</Text>
                </Touchable>
              );
            })}
          </View>
          <SurfaceCard th={th} style={s.timeline}>
          {visibleEntries.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                flexDirection: rowDirection(lang),
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 13,
                borderBottomWidth: index < entries.length - 1 ? 1 : 0,
                borderBottomColor: th.border,
              }}
            >
              <IconContainer th={th} icon={entry.kind === 'collection' ? 'arrow-down-outline' : entry.kind === 'debt' ? 'people-outline' : entry.kind === 'saving' ? 'flag-outline' : 'calendar-outline'} tone={entry.kind === 'collection' || entry.kind === 'saving' ? th.inc : entry.kind === 'debt' ? th.exp : th.warn} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: th.text, fontSize: 13, fontWeight: '900', textAlign: textAlign(lang) }} numberOfLines={1}>
                  {entry.label}
                </Text>
                <Text style={{ color: th.sub, fontSize: 11, marginTop: 1, textAlign: textAlign(lang) }} numberOfLines={1}>
                  {entry.kindLabel} · {entry.dateISO ? formatCommitmentDate(entry.dateISO, lang) : '—'}
                </Text>
              </View>
              <Text style={{ color: entry.kind === 'collection' || entry.kind === 'saving' ? th.inc : th.text, fontSize: 13, fontWeight: '900', writingDirection: 'ltr' }} numberOfLines={1}>
                {entry.kind === 'collection' || entry.kind === 'saving' ? '+' : '-'}{formatMoneyNumber(Math.abs(entry.amt), entry.currencyCode, cfg.lang)} {entry.currencyCode}
              </Text>
            </View>
          ))}
          {visibleEntries.length === 0 ? (
            <View style={s.filteredEmpty}>
              <Text style={{ color: th.sub, fontSize: 11, fontWeight: '800', textAlign: textAlign(lang) }}>
                {isAr ? 'لا توجد دفعات بهذا النوع.' : 'No payments of this type yet.'}
              </Text>
            </View>
          ) : null}
        </SurfaceCard>
        </>
      )}
    </ScreenScroll>
  );
}

function Metric({ value, label, color, labelColor, bordered, borderColor }) {
  return (
    <View style={[s.metric, bordered ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor } : null]}>
      <Text style={[s.metricValue, { color }]}>{value}</Text>
      <Text style={[s.metricLabel, { color: labelColor }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  summary: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.md, marginBottom: SPACE.lg, ...SHADOW.card },
  summaryHeader: { alignItems: 'center', gap: SPACE.md },
  summaryTitle: { fontSize: 15, lineHeight: 20, ...weight('900') },
  summaryBody: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  metrics: { borderTopWidth: 1, marginTop: SPACE.md, paddingTop: SPACE.md },
  metric: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  metricValue: { fontSize: 20, lineHeight: 25, ...weight('900') },
  metricLabel: { fontSize: 9, lineHeight: 14, ...weight('800'), textAlign: 'center', marginTop: 2 },
  filterRail: { gap: 7, flexWrap: 'wrap', marginBottom: SPACE.sm },
  filterChip: { minHeight: 34, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  filterText: { fontSize: 10, lineHeight: 14, ...weight('900') },
  timeline: { padding: 4, borderRadius: RADIUS.xl },
  filteredEmpty: { minHeight: 72, justifyContent: 'center', paddingHorizontal: SPACE.md },
});
