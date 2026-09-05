// MYFI — reviewing pending mutations before adopting a different cloud ledger.
//
// This is the screen that stands between the owner's queued financial entries
// and a replacement of their local ledger. Three real accounts reached the
// state it serves on 2026-09-05.
//
// Deliberate choices, each of them a rule from the design rather than styling:
//
//   - Two opposite top-level answers, both prominent. "This is my data" and
//     "this is the wrong account" lead to opposite correct actions, and a
//     screen that makes one of them the small grey link would push people into
//     the other by accident.
//   - No default per row. Every pending entry starts undecided; the owner picks
//     keep or discard for each. The library refuses to confirm while any row is
//     undecided, and this screen refuses to enable the button.
//   - Nothing is pre-selected, nothing is batch-applied. "Keep all" would make
//     the review theatre.
//   - The count of what is still undecided is always on screen, so the button
//     being disabled is never a mystery.

import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppButton, Touchable as TouchableOpacity, rowDirection, textAlign } from './AppPrimitives';
import { weight } from '../lib/tokens';
import { formatMoneyNumber } from '../lib/money';

const copy = (isAr) => ({
  title: isAr ? 'حسابك يحتوي بيانات سحابية سابقة' : 'This account already has cloud data',
  explain: isAr
    ? 'هذا الحساب له دفتر مالي في السحابة من جهاز أو تثبيت سابق، وهذا الجهاز أنشأ دفتراً محلياً خاصاً به. لا يمكن دمجهما تلقائياً.'
    : 'This account has a financial ledger in the cloud from another device or install, and this device made its own local one. They cannot be merged automatically.',
  cloudLabel: isAr ? 'دفتر السحابة' : 'Cloud ledger',
  localLabel: isAr ? 'دفتر هذا الجهاز' : 'This device',
  pendingTitle: isAr ? 'حركات لم تصل السحابة بعد' : 'Entries that never reached the cloud',
  pendingExplain: isAr
    ? 'راجع كل حركة وقرّر: نبقيها فتُعاد إضافتها بعد التبنّي، أم نتجاهلها. لا شيء يُحسم نيابة عنك.'
    : 'Review each entry and decide: keep it, and it is re-added after adoption, or discard it. Nothing is decided for you.',
  keep: isAr ? 'أبقِها' : 'Keep',
  discard: isAr ? 'تجاهلها' : 'Discard',
  undecided: n => (isAr ? `بقيت ${n} حركة بلا قرار` : `${n} still undecided`),
  allDecided: isAr ? 'كل الحركات محسومة' : 'Every entry decided',
  adopt: isAr ? 'تبنَّ بيانات السحابة' : 'Adopt the cloud data',
  adoptWarn: isAr
    ? 'ستُستبدل نسخة هذا الجهاز بنسخة السحابة الموثقة. احتُفظ بنسخة أمان محلية كاملة.'
    : 'This device copy is replaced by the verified cloud copy. A complete local safety copy is kept.',
  wrongAccount: isAr ? 'هذا ليس الحساب الصحيح' : 'This is not the right account',
  wrongAccountHint: isAr
    ? 'لن نغيّر أي بيانات. سجّل الخروج وادخل بالحساب الصحيح لهذا الجهاز.'
    : 'Nothing is changed. Sign out and sign in with the account this device belongs to.',
  noPending: isAr ? 'لا توجد حركات معلّقة تحتاج قراراً.' : 'No pending entries need a decision.',
  kinds: {
    financial_transaction: isAr ? 'حركة' : 'Transaction',
    debt: isAr ? 'دين' : 'Debt',
    commitment: isAr ? 'التزام' : 'Commitment',
    goal: isAr ? 'هدف' : 'Goal',
    workspace: isAr ? 'إعدادات' : 'Settings',
    recurring_rule: isAr ? 'تكرار' : 'Recurring',
  },
});

const PendingRow = ({ th, isAr, lang, row, decision, onDecide, currency, L }) => {
  const dir = rowDirection(lang);
  const align = textAlign(lang);
  const label = L.kinds[row.entityType] || row.entityType;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: th.border, paddingVertical: 10 }}>
      <View style={{ flexDirection: dir, justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>{label}</Text>
        <Text style={{ color: th.faint, fontSize: 11 }}>{row.dateISO || ''}</Text>
      </View>
      <Text style={{ color: th.text, fontSize: 13, ...weight('700'), textAlign: align }} numberOfLines={2}>
        {row.title || row.entityId}
      </Text>
      {row.amount != null && row.amount !== 0 ? (
        <Text style={{ color: th.text, fontSize: 13, textAlign: align }}>
          {formatMoneyNumber(row.amount, currency, lang)}
        </Text>
      ) : null}
      <View style={{ flexDirection: dir, gap: 8, marginTop: 8 }}>
        {/* Both choices carry equal visual weight until one is picked: this
            screen must not nudge toward keeping or discarding someone's
            financial entry. */}
        {[['keep', L.keep, th.inc, th.incBg], ['discard', L.discard, th.exp, th.expBg]].map(([value, text, tone, soft]) => {
          const active = decision === value;
          return (
            <TouchableOpacity
              key={value}
              onPress={() => onDecide(row.mutationId, value)}
              style={{
                flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1,
                alignItems: 'center', flexDirection: dir, justifyContent: 'center', gap: 6,
                backgroundColor: active ? soft : th.cardHigh,
                borderColor: active ? tone : th.border,
              }}
            >
              {active ? <Ionicons name="checkmark" size={14} color={tone} /> : null}
              <Text style={{ color: active ? tone : th.sub, fontSize: 12, ...weight('900') }}>{text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default function IdentityAdoptionReview({
  th, lang = 'ar', adoption = null, currency = 'IQD', busy = false,
  onAdopt, onWrongAccount,
}) {
  const isAr = lang === 'ar';
  const L = useMemo(() => copy(isAr), [isAr]);
  const [decisions, setDecisions] = useState({});
  const rows = Array.isArray(adoption?.review) ? adoption.review : [];

  const undecided = rows.filter(row => decisions[row.mutationId] !== 'keep' && decisions[row.mutationId] !== 'discard');
  const ready = rows.length > 0 && undecided.length === 0;
  const align = textAlign(lang);
  const dir = rowDirection(lang);

  return (
    <View style={{ backgroundColor: th.card, borderColor: th.border, borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: dir, gap: 8, alignItems: 'center' }}>
        <Ionicons name="git-compare-outline" size={18} color={th.warn} />
        <Text style={{ color: th.text, fontSize: 14, ...weight('900'), flex: 1, textAlign: align }}>{L.title}</Text>
      </View>
      <Text style={{ color: th.sub, fontSize: 12, textAlign: align }}>{L.explain}</Text>

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: dir, justifyContent: 'space-between' }}>
          <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>{L.cloudLabel}</Text>
          <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace' }} numberOfLines={1}>
            {adoption?.cloud?.ledgerId || '—'}
          </Text>
        </View>
        <View style={{ flexDirection: dir, justifyContent: 'space-between' }}>
          <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>{L.localLabel}</Text>
          <Text style={{ color: th.text, fontSize: 11, fontFamily: 'monospace' }} numberOfLines={1}>
            {adoption?.local?.ledgerId || '—'}
          </Text>
        </View>
      </View>

      <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: align, marginTop: 4 }}>
        {L.pendingTitle}
      </Text>
      <Text style={{ color: th.sub, fontSize: 12, textAlign: align }}>{L.pendingExplain}</Text>

      {rows.length ? rows.map(row => (
        <PendingRow
          key={row.mutationId}
          th={th}
          isAr={isAr}
          lang={lang}
          row={row}
          currency={currency}
          L={L}
          decision={decisions[row.mutationId]}
          onDecide={(id, value) => setDecisions(current => ({ ...current, [id]: value }))}
        />
      )) : (
        <Text style={{ color: th.faint, fontSize: 12, textAlign: align }}>{L.noPending}</Text>
      )}

      {/* Always visible, so a disabled button is never unexplained. */}
      {rows.length ? (
        <Text style={{ color: ready ? th.inc : th.warn, fontSize: 12, ...weight('800'), textAlign: align }}>
          {ready ? L.allDecided : L.undecided(undecided.length)}
        </Text>
      ) : null}

      <Text style={{ color: th.sub, fontSize: 11, textAlign: align }}>{L.adoptWarn}</Text>
      <AppButton
        th={th}
        lang={lang}
        tone="primary"
        icon="cloud-download-outline"
        label={L.adopt}
        disabled={busy || !ready}
        onPress={() => onAdopt?.(decisions)}
      />

      <Text style={{ color: th.sub, fontSize: 11, textAlign: align }}>{L.wrongAccountHint}</Text>
      <AppButton
        th={th}
        lang={lang}
        tone="secondary"
        icon="log-out-outline"
        label={L.wrongAccount}
        disabled={busy}
        onPress={() => onWrongAccount?.()}
      />
    </View>
  );
}
