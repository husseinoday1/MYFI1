import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletLabel } from '../lib/wallets';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, weight } from '../lib/tokens';
import { rowDirFor, textAlignFor } from '../lib/layout';

const n = value => Number(value || 0);

export default function WalletBalanceCard({
  wallets = [],
  transactions = [],
  cfg = {},
  selectedWalletId = null,
  title = null,
  summary = null,
  showWallets = false,
  onSelectWallet = null,
  compact = false,
  style = null,
}) {
  const th = TH[cfg.theme] || TH.dark;
  const ar = cfg.lang === 'ar';
  const align = textAlignFor(cfg.lang);
  const rowDir = rowDirFor(cfg.lang);
  const sym = getSymbol(cfg.currency);

  const rows = useMemo(() => {
    if (summary) return [];
    const scoped = filterByActiveScope(wallets, cfg);
    const source = scoped.length ? scoped : wallets;
    const defaultId = getDefaultWalletId(source, cfg.currency, cfg.defaultWalletId);
    return getWalletAvailableBalances(source, transactions, cfg.currency, defaultId);
  }, [
    wallets,
    transactions,
    cfg.activeScope,
    cfg.profileType,
    cfg.currency,
    cfg.defaultWalletId,
    summary,
  ]);

  const defaultWalletId = useMemo(() => {
    if (summary) return null;
    const scoped = filterByActiveScope(wallets, cfg);
    const source = scoped.length ? scoped : wallets;
    return getDefaultWalletId(source, cfg.currency, cfg.defaultWalletId);
  }, [wallets, cfg.activeScope, cfg.profileType, cfg.currency, cfg.defaultWalletId, summary]);

  const selected = selectedWalletId
    ? rows.find(item => item.id === selectedWalletId)
    : null;

  const aggregate = summary || {
    physical: rows.reduce((sum, item) => sum + n(item.balance), 0),
    available: rows.reduce((sum, item) => sum + n(item.availableBalance), 0),
    reserved: rows.reduce((sum, item) => sum + n(item.reservedBalance), 0),
  };

  const display = selected
    ? {
        physical: n(selected.balance),
        available: n(selected.availableBalance),
        reserved: n(selected.reservedBalance),
      }
    : aggregate;

  const unit = selected?.currency || cfg.currency || sym;
  const fmt = value => formatMoneyNumber(Math.abs(n(value)), cfg.currency, cfg.lang);
  const money = value => `${n(value) < 0 ? '-' : ''}${fmt(value)} ${unit}`;

  if (compact) {
    const label = selected
      ? getWalletLabel(selected, cfg.lang)
      : (title || (ar ? 'إجمالي المحافظ' : 'Wallet total'));

    return (
      <View
        style={[
          s.compact,
          {
            backgroundColor: cfg.theme === 'light' ? '#FFFFFF' : th.card,
            borderColor: th.border,
          },
          style,
        ]}
      >
        <View style={[s.compactHead, { flexDirection: rowDir }]}>
          <View style={[s.compactIcon, { backgroundColor: th.primSoft }]}>
            <Ionicons name="wallet-outline" size={17} color={th.primary} />
          </View>
          <Text style={[s.compactTitle, { color: th.text, textAlign: align }]} numberOfLines={1}>
            {label}
          </Text>
        </View>

        <View style={[s.compactMetrics, { flexDirection: rowDir }]}>
          <View style={[s.compactMetric, { backgroundColor: th.cardHigh }]}>
            <Text style={[s.compactMetricLabel, { color: th.sub }]}>
              {ar ? 'الكلي' : 'Total'}
            </Text>
            <Text
              style={[s.compactMetricValue, { color: th.text }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              {money(display.physical)}
            </Text>
          </View>

          <View style={[s.compactMetric, { backgroundColor: th.primSoft }]}>
            <Text style={[s.compactMetricLabel, { color: th.primary }]}>
              {ar ? 'المتاح' : 'Available'}
            </Text>
            <Text
              style={[s.compactMetricValue, { color: n(display.available) >= 0 ? th.primary : th.exp }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.68}
            >
              {money(display.available)}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: cfg.theme === 'light' ? '#FFFFFF' : th.card,
          borderColor: th.border,
        },
        style,
      ]}
    >
      <View style={[s.head, { flexDirection: rowDir }]}>
        <View style={[s.headIcon, { backgroundColor: th.primSoft }]}>
          <Ionicons name="wallet-outline" size={18} color={th.primary} />
        </View>
        <Text style={[s.headTitle, { color: th.text, textAlign: align }]}>
          {title || (ar ? 'المحافظ' : 'Wallets')}
        </Text>
        <View style={[s.countPill, { backgroundColor: th.cardHigh }]}>
          <Text style={[s.countText, { color: th.sub }]}>{rows.length}</Text>
        </View>
      </View>

      {showWallets && rows.length ? (
        <View style={s.walletList}>
          {rows.map((wallet, index) => {
            const isDefault = wallet.id === defaultWalletId;
            const total = n(wallet.balance);
            const available = n(wallet.availableBalance);
            const reserved = n(wallet.reservedBalance);
            const selectable = typeof onSelectWallet === 'function';

            return (
              <TouchableOpacity
                key={wallet.id}
                disabled={!selectable}
                onPress={() => selectable && onSelectWallet(wallet.id)}
                activeOpacity={0.72}
                style={[
                  s.walletRow,
                  {
                    backgroundColor: isDefault ? th.primSoft : th.cardHigh,
                    borderColor: isDefault ? `${th.primary}55` : th.border,
                  },
                ]}
              >
                <View style={[s.walletTop, { flexDirection: rowDir }]}>
                  <View
                    style={[
                      s.walletIcon,
                      {
                        backgroundColor: isDefault ? th.card : th.primSoft,
                        borderColor: isDefault ? th.primary : 'transparent',
                      },
                    ]}
                  >
                    <Ionicons
                      name={isDefault ? 'star' : 'wallet-outline'}
                      size={16}
                      color={isDefault ? th.primary : th.sub}
                    />
                  </View>

                  <Text
                    style={[s.walletName, { color: th.text, textAlign: align }]}
                    numberOfLines={2}
                  >
                    {getWalletLabel(wallet, cfg.lang)}
                  </Text>

                  {reserved > 0 ? (
                    <View style={[s.reservePill, { backgroundColor: th.card }]}>
                      <Text style={[s.reserveText, { color: th.sub }]}>
                        {ar ? 'محجوز' : 'Reserved'} {money(reserved)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={[s.walletMetrics, { flexDirection: rowDir }]}>
                  <View style={s.walletMetric}>
                    <Text style={[s.walletMetricLabel, { color: th.sub }]}>
                      {ar ? 'الكلي' : 'Total'}
                    </Text>
                    <Text
                      style={[s.walletMetricValue, { color: th.text }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {money(total)}
                    </Text>
                  </View>

                  <View style={[s.walletDivider, { backgroundColor: th.border }]} />

                  <View style={s.walletMetric}>
                    <Text style={[s.walletMetricLabel, { color: th.primary }]}>
                      {ar ? 'المتاح' : 'Available'}
                    </Text>
                    <Text
                      style={[s.walletMetricValue, { color: available >= 0 ? th.primary : th.exp }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {money(available)}
                    </Text>
                  </View>
                </View>
                {available < 0 ? (
                  <View style={[s.walletWarning, { backgroundColor: th.expBg, flexDirection: rowDir }]}>
                    <Ionicons name="warning-outline" size={13} color={th.exp} />
                    <Text style={[s.walletWarningText, { color: th.exp, textAlign: align }]}>
                      {ar ? 'المتاح سالب. أضف رصيداً أو عدّل الحركات قبل الدفع.' : 'Available balance is negative. Add funds or adjust entries before paying.'}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  compact: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 10,
    marginBottom: 10,
  },
  compactHead: { alignItems: 'center', gap: 8, marginBottom: 8 },
  compactIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTitle: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, ...weight('900') },
  compactMetrics: { gap: 7 },
  compactMetric: {
    flex: 1,
    minWidth: 0,
    borderRadius: RADIUS.md,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  compactMetricLabel: { fontSize: 9, lineHeight: 13, ...weight('800'), textAlign: 'center' },
  compactMetricValue: { fontSize: 13, lineHeight: 19, ...weight('900'), textAlign: 'center', marginTop: 2 },

  card: {
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    padding: 11,
    marginBottom: 12,
  },
  head: { alignItems: 'center', gap: 8, marginBottom: 9 },
  headIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headTitle: { flex: 1, minWidth: 0, fontSize: 14, lineHeight: 20, ...weight('900') },
  countPill: {
    minWidth: 28,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
  },
  countText: { fontSize: 10, ...weight('900') },

  walletList: { gap: 8 },
  walletRow: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: 10,
  },
  walletTop: { alignItems: 'center', gap: 8 },
  walletIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walletName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 18, ...weight('900') },
  reservePill: {
    minHeight: 24,
    borderRadius: 12,
    paddingHorizontal: 7,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    maxWidth: '42%',
  },
  reserveText: { fontSize: 9, lineHeight: 13, ...weight('800') },
  walletMetrics: {
    marginTop: 9,
    alignItems: 'stretch',
  },
  walletMetric: { flex: 1, minWidth: 0, paddingHorizontal: 7 },
  walletMetricLabel: { fontSize: 9, lineHeight: 13, ...weight('800'), textAlign: 'center' },
  walletMetricValue: { fontSize: 13, lineHeight: 19, ...weight('900'), textAlign: 'center', marginTop: 2 },
  walletDivider: { width: 1, opacity: 0.7 },
  walletWarning: { borderRadius: RADIUS.md, alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, marginTop: 8 },
  walletWarningText: { flex: 1, fontSize: 10, lineHeight: 15, ...weight('900') },
});
