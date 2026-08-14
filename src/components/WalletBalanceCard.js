import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { getDefaultWalletId, getWalletAvailableBalances, getWalletLabel, walletAmountToBase } from '../lib/wallets';
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
    return getWalletAvailableBalances(source, transactions, cfg.currency, defaultId)
      .sort((a, b) => (a.id === defaultId ? -1 : b.id === defaultId ? 1 : getWalletLabel(a, cfg.lang).localeCompare(getWalletLabel(b, cfg.lang))));
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

  // Aggregate cards are always expressed in the workspace/base currency.
  // Individual wallet rows remain in their native currencies.
  const aggregate = summary || {
    physical: rows.reduce((sum, item) => sum + walletAmountToBase(item, item.balance, cfg.currency), 0),
    available: rows.reduce((sum, item) => sum + walletAmountToBase(item, item.availableBalance, cfg.currency), 0),
    reserved: rows.reduce((sum, item) => sum + walletAmountToBase(item, item.reservedBalance, cfg.currency), 0),
  };

  const display = selected
    ? {
        physical: n(selected.balance),
        available: n(selected.availableBalance),
        reserved: n(selected.reservedBalance),
      }
    : aggregate;

  const displayCurrency = selected?.currency || cfg.currency || 'IQD';
  const unit = getSymbol(displayCurrency);
  const fmt = value => formatMoneyNumber(Math.abs(n(value)), displayCurrency, cfg.lang);
  const money = value => `${n(value) < 0 ? '-' : ''}${fmt(value)} ${unit}`;
  const walletMoney = (wallet, value) => {
    const currency = wallet?.currency || cfg.currency || 'IQD';
    return `${n(value) < 0 ? '-' : ''}${formatMoneyNumber(Math.abs(n(value)), currency, cfg.lang)} ${getSymbol(currency)}`;
  };

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
              minimumFontScale={0.62}
            >
              {money(display.physical)}
            </Text>
          </View>

          <View style={[s.compactMetric, { backgroundColor: th.warnBg }]}>
            <Text style={[s.compactMetricLabel, { color: th.warn }]}>
              {ar ? 'المحجوز' : 'Reserved'}
            </Text>
            <Text
              style={[s.compactMetricValue, { color: n(display.reserved) > 0 ? th.warn : th.sub }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.62}
            >
              {money(display.reserved)}
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
              minimumFontScale={0.62}
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
                      size={15}
                      color={isDefault ? th.primary : th.sub}
                    />
                  </View>

                  <View style={s.walletIdentity}>
                    <View style={[s.walletNameLine, { flexDirection: rowDir }]}>
                      <Text
                        style={[s.walletName, { color: th.text, textAlign: align }]}
                        numberOfLines={1}
                      >
                        {getWalletLabel(wallet, cfg.lang)}
                      </Text>
                      {isDefault ? (
                        <View style={[s.defaultPill, { backgroundColor: th.card }]}>
                          <Text style={[s.defaultText, { color: th.primary }]}>
                            {ar ? 'افتراضية' : 'Default'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={[s.walletMetaLine, { flexDirection: rowDir }]}>
                      <View style={[s.metaItem, { backgroundColor: th.card }]}>
                        <Text style={[s.metaItemText, { color: th.sub }]}>
                          {ar ? 'الكلي' : 'Total'} {walletMoney(wallet, total)}
                        </Text>
                      </View>
                      {reserved > 0 ? (
                        <View style={[s.reservedItem, { backgroundColor: th.warnBg }]}>
                          <Ionicons name="lock-closed-outline" size={10} color={th.warn} />
                          <Text style={[s.reservedText, { color: th.warn }]} numberOfLines={1}>
                            {ar ? 'محجوز للتوفير' : 'Reserved'} {walletMoney(wallet, reserved)}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={s.walletAvailableBlock}>
                    <Text style={[s.walletAvailableLabel, { color: th.sub }]}>
                      {ar ? 'المتاح' : 'Available'}
                    </Text>
                    <Text
                      style={[s.walletAvailableValue, { color: available >= 0 ? th.primary : th.exp }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {walletMoney(wallet, available)}
                    </Text>
                  </View>

                  {selectable ? (
                    <Ionicons name={ar ? 'chevron-back' : 'chevron-forward'} size={15} color={th.faint} />
                  ) : null}
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
    borderRadius: 16,
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
  compactMetrics: { gap: 6 },
  compactMetric: {
    flex: 1,
    flexBasis: 0,
    minWidth: 0,
    minHeight: 58,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  compactMetricLabel: { fontSize: 9, lineHeight: 13, ...weight('900'), textAlign: 'center' },
  compactMetricValue: { fontSize: 12, lineHeight: 18, ...weight('900'), textAlign: 'center', marginTop: 2 },

  card: {
    borderWidth: 1,
    borderRadius: 18,
    padding: 10,
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

  walletList: { gap: 6 },
  walletRow: {
    borderWidth: 1,
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  walletTop: { minHeight: 50, alignItems: 'center', gap: 8 },
  walletIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  walletIdentity: { flex: 1, minWidth: 0 },
  walletNameLine: { alignItems: 'center', gap: 5 },
  walletName: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 17, ...weight('900') },
  walletMetaLine: { alignItems: 'center', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  metaItem: { minHeight: 20, borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  metaItemText: { fontSize: 8, lineHeight: 12, ...weight('800') },
  reservedItem: { minHeight: 20, maxWidth: '100%', borderRadius: 10, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 3 },
  reservedText: { fontSize: 8, lineHeight: 12, ...weight('900'), flexShrink: 1 },
  defaultPill: {
    minHeight: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  defaultText: { fontSize: 8, lineHeight: 11, ...weight('900') },
  walletAvailableBlock: { width: 96, maxWidth: '32%', alignItems: 'flex-end', flexShrink: 0 },
  walletAvailableLabel: { fontSize: 9, lineHeight: 13, ...weight('800') },
  walletAvailableValue: { fontSize: 14, lineHeight: 19, ...weight('900'), marginTop: 1 },

  walletWarning: { borderRadius: 9, alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 5, marginTop: 5 },
  walletWarningText: { flex: 1, fontSize: 9, lineHeight: 13, ...weight('900') },
});
