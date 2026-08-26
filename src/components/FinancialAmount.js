import React from 'react';
import { Text, View } from 'react-native';
import { TYPE } from '../lib/tokens';
import { formatMoneyNumber } from '../lib/money';
import { FinancialDirectionMark, rowDirection } from './AppPrimitives';

const SIZE_MAP = {
  meta: TYPE.meta,
  body: TYPE.body,
  title: TYPE.title,
  hero: TYPE.hero,
};

// Canonical financial-amount presentation (03_MYFI_DESIGN_SYSTEM_CANONICAL.md §11):
// signed amount, color paired with the sign (never color alone), currency code
// adjacent to the figure, thousands separators. Purely presentational — takes an
// already-computed numeric magnitude and a kind, does no financial calculation,
// derivation, or rounding-policy decision of its own (that stays in src/lib/money.js
// and the financial core).
export function FinancialAmount({
  th,
  value,
  currency = 'IQD',
  lang = 'ar',
  kind = 'income', // 'income' | 'expense' | 'transfer' (also accepts the codebase's 'inc'/'exp' short forms)
  size = 'body',
  showSign = true,
  showCurrency = true,
  style,
  textStyle,
}) {
  // Normalize once so color and sign glyph can never disagree — FinancialDirectionMark
  // treats anything other than 'income'/'inc' as an expense glyph, so a caller passing
  // the codebase's own 'exp' short form (used as the theme key elsewhere) must not fall
  // through to the income color here.
  const isTransfer = kind === 'transfer';
  const isExpense = !isTransfer && kind !== 'income' && kind !== 'inc';
  const normalizedKind = isTransfer ? 'transfer' : isExpense ? 'expense' : 'income';
  const color = isTransfer ? th.transfer : isExpense ? th.exp : th.inc;
  const fontSize = SIZE_MAP[size] || SIZE_MAP.body;
  const formatted = formatMoneyNumber(value, currency, lang, { absolute: true });

  return (
    <View style={[{ flexDirection: rowDirection(lang), alignItems: 'baseline', gap: 4 }, style]}>
      {showSign && !isTransfer ? (
        <FinancialDirectionMark kind={normalizedKind} color={color} size={Math.round(fontSize * 0.8)} lang={lang} />
      ) : null}
      <Text
        style={[{ color, fontSize, fontWeight: '900' }, textStyle]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {showCurrency ? `${currency} ${formatted}` : formatted}
      </Text>
    </View>
  );
}
