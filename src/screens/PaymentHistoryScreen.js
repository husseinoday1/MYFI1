import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { ScreenScroll, PageIntro, SectionTitle, SurfaceCard, IconContainer, EmptyState, rowDirection, textAlign } from '../components/AppPrimitives';

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
      }));

    return [...debtEntries, ...commitmentEntries].sort((a, b) => {
      if (a.ts && b.ts) return b.ts - a.ts;
      return String(b.dateISO).localeCompare(String(a.dateISO));
    });
  }, [debts, commitments, trans, cfg.activeScope, cfg.profileType, cfg.currency, isAr]);

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="receipt-outline"
        title={isAr ? 'سجل الدفعات' : 'Payment History'}
        subtitle={isAr ? 'كل الدفعات المسجلة على الديون والالتزامات' : 'Every payment recorded against debts and commitments'}
      />

      {entries.length === 0 ? (
        <EmptyState
          th={th}
          icon="receipt-outline"
          title={isAr ? 'لا توجد دفعات بعد' : 'No payments yet'}
          body={isAr ? 'الدفعات على الديون والالتزامات تظهر هنا تلقائيًا.' : 'Payments against debts and commitments will show up here automatically.'}
        />
      ) : (
        <SurfaceCard th={th} style={{ padding: 4 }}>
          {entries.map((entry, index) => (
            <View
              key={entry.id}
              style={{
                flexDirection: rowDirection(lang),
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 10,
                paddingVertical: 10,
                borderBottomWidth: index < entries.length - 1 ? 1 : 0,
                borderBottomColor: th.border,
              }}
            >
              <IconContainer th={th} icon="checkmark-circle-outline" tone={th.primary} size="sm" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: th.text, fontSize: 13, fontWeight: '900', textAlign: textAlign(lang) }} numberOfLines={1}>
                  {entry.label}
                </Text>
                <Text style={{ color: th.sub, fontSize: 11, marginTop: 1, textAlign: textAlign(lang) }} numberOfLines={1}>
                  {entry.kindLabel} · {entry.dateISO || '—'}
                </Text>
              </View>
              <Text style={{ color: th.exp, fontSize: 13, fontWeight: '900' }} numberOfLines={1}>
                {formatMoneyNumber(entry.amt, entry.currencyCode, cfg.lang)} {entry.currencyCode}
              </Text>
            </View>
          ))}
        </SurfaceCard>
      )}
    </ScreenScroll>
  );
}
