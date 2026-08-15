// MYFI_FINANCIAL_CORE_V2
// Pure money/multi-currency helpers. Keep this module dependency-light so it can
// be exercised by Node contract tests without React Native or Expo.
import { currencyFractionDigits, roundCurrency } from './money';

export const FINANCIAL_CORE_VERSION = 2;

export const normalizeCurrencyCode = (value, fallback = 'IQD') => {
  const code = String(value || fallback || 'IQD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : String(fallback || 'IQD').toUpperCase();
};

export const normalizeExchangeRate = (value, fallback = 1) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const moneyToMinor = (value, currency = 'IQD') => {
  const code = normalizeCurrencyCode(currency);
  const factor = 10 ** currencyFractionDigits(code);
  const rounded = roundCurrency(Number(value) || 0, code);
  const minor = Math.round(rounded * factor);
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Money amount exceeds the safe integer range for ${code}.`);
  }
  return minor;
};

export const moneyFromMinor = (minor, currency = 'IQD') => {
  const code = normalizeCurrencyCode(currency);
  const factor = 10 ** currencyFractionDigits(code);
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return roundCurrency(n / factor, code);
};

export const convertMoney = (amount, fromCurrency, toCurrency, exchangeRate = 1) => {
  const from = normalizeCurrencyCode(fromCurrency);
  const to = normalizeCurrencyCode(toCurrency);
  if (from === to) return roundCurrency(amount, to);
  return roundCurrency((Number(amount) || 0) * normalizeExchangeRate(exchangeRate), to);
};

export const walletCurrencyFor = (wallets = [], walletId = null, baseCurrency = 'IQD') => {
  const wallet = (Array.isArray(wallets) ? wallets : []).find(item => item?.id === walletId);
  return normalizeCurrencyCode(wallet?.currency, baseCurrency);
};

export const buildCurrencyFields = ({
  amount = 0,
  walletId = null,
  wallets = [],
  baseCurrency = 'IQD',
  exchangeRate = 1,
  walletCurrency = null,
} = {}) => {
  const base = normalizeCurrencyCode(baseCurrency);
  const native = normalizeCurrencyCode(walletCurrency || walletCurrencyFor(wallets, walletId, base), base);
  const rate = native === base ? 1 : normalizeExchangeRate(exchangeRate);
  const walletAmount = roundCurrency(Number(amount) || 0, native);
  const baseAmount = native === base ? roundCurrency(walletAmount, base) : convertMoney(walletAmount, native, base, rate);
  return {
    currencyCode: native,
    walletCurrency: native,
    baseCurrencyCode: base,
    exchangeRate: rate,
    walletAmount,
    walletAmountMinor: moneyToMinor(walletAmount, native),
    baseAmount,
    baseAmountMinor: moneyToMinor(baseAmount, base),
  };
};

export const buildCurrencyFieldsFromBaseAmount = ({
  baseAmount = 0,
  walletId = null,
  wallets = [],
  baseCurrency = 'IQD',
  exchangeRate = null,
  walletCurrency = null,
} = {}) => {
  const base = normalizeCurrencyCode(baseCurrency);
  const native = normalizeCurrencyCode(walletCurrency || walletCurrencyFor(wallets, walletId, base), base);
  const wallet = (Array.isArray(wallets) ? wallets : []).find(item => item?.id === walletId);
  const rate = native === base ? 1 : normalizeExchangeRate(exchangeRate, normalizeExchangeRate(wallet?.valuationRate, 1));
  const signedBase = roundCurrency(Number(baseAmount) || 0, base);
  const walletAmount = native === base
    ? roundCurrency(signedBase, native)
    : roundCurrency(signedBase / rate, native);
  return {
    currencyCode: native,
    walletCurrency: native,
    baseCurrencyCode: base,
    exchangeRate: rate,
    walletAmount,
    walletAmountMinor: moneyToMinor(walletAmount, native),
    baseAmount: signedBase,
    baseAmountMinor: moneyToMinor(signedBase, base),
  };
};

export const buildEntityCurrencyFields = ({
  entityAmount = 0,
  entityCurrency = 'IQD',
  walletId = null,
  wallets = [],
  baseCurrency = 'IQD',
  entityBaseRate = null,
  walletBaseRate = null,
} = {}) => {
  const base = normalizeCurrencyCode(baseCurrency);
  const entity = normalizeCurrencyCode(entityCurrency, base);
  const wallet = walletCurrencyFor(wallets, walletId, base);
  const signedEntity = roundCurrency(Number(entityAmount) || 0, entity);
  const requestedEntityBaseRate = Number(entityBaseRate);
  const requestedWalletBaseRate = Number(walletBaseRate);

  const resolvedEntityBaseRate = entity === base
    ? 1
    : (Number.isFinite(requestedEntityBaseRate) && requestedEntityBaseRate > 0 ? requestedEntityBaseRate : null);
  if (entity !== base && !(resolvedEntityBaseRate > 0)) {
    throw new RangeError('entity_historical_base_rate_required');
  }

  const resolvedWalletBaseRate = wallet === base
    ? 1
    : wallet === entity
      ? resolvedEntityBaseRate
      : (Number.isFinite(requestedWalletBaseRate) && requestedWalletBaseRate > 0 ? requestedWalletBaseRate : null);
  if (wallet !== base && !(resolvedWalletBaseRate > 0)) {
    throw new RangeError('wallet_historical_base_rate_required');
  }

  const baseAmount = entity === base
    ? roundCurrency(signedEntity, base)
    : convertMoney(signedEntity, entity, base, resolvedEntityBaseRate);
  const walletAmount = wallet === entity
    ? roundCurrency(signedEntity, wallet)
    : wallet === base
      ? roundCurrency(baseAmount, wallet)
      : roundCurrency(baseAmount / resolvedWalletBaseRate, wallet);

  return {
    entityCurrencyCode: entity,
    entityAmount: signedEntity,
    entityAmountMinor: moneyToMinor(signedEntity, entity),
    currencyCode: wallet,
    walletCurrency: wallet,
    walletAmount,
    walletAmountMinor: moneyToMinor(walletAmount, wallet),
    baseCurrencyCode: base,
    baseAmount,
    baseAmountMinor: moneyToMinor(baseAmount, base),
    entityBaseRate: resolvedEntityBaseRate,
    walletBaseRate: resolvedWalletBaseRate,
    // Existing ledger code interprets exchangeRate as wallet -> reporting/base.
    exchangeRate: resolvedWalletBaseRate,
    fxSnapshotSource: entity === base && wallet === base
      ? 'same_currency'
      : 'user_confirmed_entity_payment',
  };
};

export const buildTransferCurrencyFields = ({
  fromWalletId,
  toWalletId,
  fromAmount,
  toAmount = null,
  wallets = [],
  baseCurrency = 'IQD',
  exchangeRate = null,
  feeAmount = 0,
  fromBaseRate = null,
  toBaseRate = null,
} = {}) => {
  const base = normalizeCurrencyCode(baseCurrency);
  const fromCurrency = walletCurrencyFor(wallets, fromWalletId, base);
  const toCurrency = walletCurrencyFor(wallets, toWalletId, base);
  const sourceAmount = Math.abs(roundCurrency(Number(fromAmount) || 0, fromCurrency));
  const explicitTarget = Number(toAmount);
  if (!(sourceAmount > 0)) throw new RangeError('transfer_source_amount_required');

  const sameCurrency = fromCurrency === toCurrency;
  const explicitTradeRate = Number(exchangeRate);
  const derivedTradeRate = Number.isFinite(explicitTarget) && explicitTarget > 0
    ? explicitTarget / sourceAmount
    : null;
  const rate = sameCurrency
    ? 1
    : normalizeExchangeRate(explicitTradeRate, normalizeExchangeRate(derivedTradeRate, null));
  if (!sameCurrency && !(Number(rate) > 0)) throw new RangeError('transfer_exchange_rate_required');

  const targetAmount = sameCurrency
    ? sourceAmount
    : Number.isFinite(explicitTarget) && explicitTarget > 0
      ? Math.abs(roundCurrency(explicitTarget, toCurrency))
      : convertMoney(sourceAmount, fromCurrency, toCurrency, rate);
  if (!(targetAmount > 0)) throw new RangeError('transfer_target_amount_required');

  // Historical base rates are snapshots for reporting. For transfers where one
  // side is the base currency, the actual sent/received amounts determine the
  // foreign->base rate. For foreign->foreign transfers both bridge rates must
  // be supplied explicitly and are frozen on the transaction.
  const requestedFromBaseRate = Number(fromBaseRate);
  const requestedToBaseRate = Number(toBaseRate);
  const bothForeign = fromCurrency !== base && toCurrency !== base;
  let resolvedFromBaseRate = fromCurrency === base
    ? 1
    : toCurrency === base
      ? targetAmount / sourceAmount
      : (Number.isFinite(requestedFromBaseRate) && requestedFromBaseRate > 0 ? requestedFromBaseRate : null);
  let resolvedToBaseRate = toCurrency === base
    ? 1
    : fromCurrency === base
      ? sourceAmount / targetAmount
      : (Number.isFinite(requestedToBaseRate) && requestedToBaseRate > 0 ? requestedToBaseRate : null);

  // Same-foreign-currency transfers still need one frozen foreign->base
  // historical snapshot for reporting. Never substitute today's wallet valuation.
  if (sameCurrency && fromCurrency !== base) {
    const sharedHistoricalRate = resolvedFromBaseRate || resolvedToBaseRate;
    if (!(sharedHistoricalRate > 0)) {
      throw new RangeError('transfer_historical_base_rates_required');
    }
    resolvedFromBaseRate = sharedHistoricalRate;
    resolvedToBaseRate = sharedHistoricalRate;
  } else if (bothForeign && (!(resolvedFromBaseRate > 0) || !(resolvedToBaseRate > 0))) {
    throw new RangeError('transfer_historical_base_rates_required');
  }

  const baseFromAmount = fromCurrency === base
    ? roundCurrency(sourceAmount, base)
    : convertMoney(sourceAmount, fromCurrency, base, resolvedFromBaseRate);
  const baseToAmount = toCurrency === base
    ? roundCurrency(targetAmount, base)
    : convertMoney(targetAmount, toCurrency, base, resolvedToBaseRate);
  const fee = Math.abs(roundCurrency(Number(feeAmount) || 0, fromCurrency));
  const feeBaseAmount = fromCurrency === base
    ? roundCurrency(fee, base)
    : convertMoney(fee, fromCurrency, base, resolvedFromBaseRate);
  return {
    fromCurrency,
    toCurrency,
    transferFromAmount: sourceAmount,
    transferFromAmountMinor: moneyToMinor(sourceAmount, fromCurrency),
    transferToAmount: targetAmount,
    transferToAmountMinor: moneyToMinor(targetAmount, toCurrency),
    transferRate: rate,
    exchangeRate: rate,
    feeAmount: fee,
    feeAmountMinor: moneyToMinor(fee, fromCurrency),
    feeBaseAmount,
    feeBaseAmountMinor: moneyToMinor(feeBaseAmount, base),
    baseCurrencyCode: base,
    fromBaseRate: resolvedFromBaseRate,
    toBaseRate: resolvedToBaseRate,
    baseFromAmount,
    baseFromAmountMinor: moneyToMinor(baseFromAmount, base),
    baseToAmount,
    baseToAmountMinor: moneyToMinor(baseToAmount, base),
    baseAmount: baseFromAmount,
    baseAmountMinor: moneyToMinor(baseFromAmount, base),
    fxSnapshotSource: sameCurrency && fromCurrency !== base
      ? 'user_confirmed_same_currency_base_rate'
      : bothForeign ? 'user_confirmed_bridge_rates' : (sameCurrency ? 'same_currency' : 'transfer_amounts'),
  };
};

export const transactionWalletAmount = (tx = {}, walletId = null) => {
  if (tx?.kind === 'transfer') {
    if (walletId && walletId === tx.fromWalletId) {
      return -Math.abs(Number(tx.transferFromAmount ?? tx.transferAmount ?? 0));
    }
    if (walletId && walletId === tx.toWalletId) {
      return Math.abs(Number(tx.transferToAmount ?? tx.transferAmount ?? 0));
    }
    return 0;
  }
  if (Object.prototype.hasOwnProperty.call(tx || {}, 'walletAmount')) return Number(tx.walletAmount) || 0;
  return Number(tx?.amt || 0);
};

export const transactionBaseAmount = (tx = {}) => {
  if (tx?.kind === 'transfer') return 0;
  if (Object.prototype.hasOwnProperty.call(tx || {}, 'baseAmount')) return Number(tx.baseAmount) || 0;
  return Number(tx?.amt || 0);
};

export const hydrateLegacyCurrencyFields = (tx = {}, wallets = [], baseCurrency = 'IQD') => {
  if (!tx || typeof tx !== 'object') return tx;
  const base = normalizeCurrencyCode(baseCurrency);
  if (tx.kind === 'transfer') {
    try {
      const fields = buildTransferCurrencyFields({
        fromWalletId: tx.fromWalletId,
        toWalletId: tx.toWalletId,
        fromAmount: tx.transferFromAmount ?? tx.transferAmount ?? 0,
        toAmount: tx.transferToAmount,
        wallets,
        baseCurrency: tx.baseCurrencyCode || base,
        exchangeRate: tx.transferRate ?? tx.exchangeRate,
        feeAmount: tx.feeAmount || 0,
        fromBaseRate: tx.fromBaseRate,
        toBaseRate: tx.toBaseRate,
      });
      return {
        ...tx,
        transferAmount: Math.abs(Number(tx.transferAmount ?? fields.transferFromAmount) || 0),
        ...fields,
        fxStatus: tx.fxStatus === 'UNRESOLVED_FX' ? 'UNRESOLVED_FX' : 'RESOLVED',
      };
    } catch (error) {
      if (error?.message !== 'transfer_historical_base_rates_required') throw error;
      const fromCurrency = walletCurrencyFor(wallets, tx.fromWalletId, base);
      const toCurrency = walletCurrencyFor(wallets, tx.toWalletId, base);
      const sourceAmount = Math.abs(roundCurrency(Number(tx.transferFromAmount ?? tx.transferAmount ?? 0) || 0, fromCurrency));
      const targetAmount = Math.abs(roundCurrency(Number(tx.transferToAmount || 0) || 0, toCurrency));
      const transferRate = Number(tx.transferRate ?? tx.exchangeRate ?? (sourceAmount > 0 && targetAmount > 0 ? targetAmount / sourceAmount : 0));
      const feeAmount = Math.abs(roundCurrency(Number(tx.feeAmount || 0) || 0, fromCurrency));
      // Legacy foreign->foreign transfers without historical bridge rates are
      // intentionally left unresolved. Never substitute today's wallet valuation
      // or rate=1 because that would rewrite historical reporting meaning.
      return {
        ...tx,
        fromCurrency,
        toCurrency,
        transferAmount: sourceAmount,
        transferFromAmount: sourceAmount,
        transferFromAmountMinor: moneyToMinor(sourceAmount, fromCurrency),
        transferToAmount: targetAmount,
        transferToAmountMinor: moneyToMinor(targetAmount, toCurrency),
        transferRate: transferRate > 0 ? transferRate : null,
        exchangeRate: transferRate > 0 ? transferRate : null,
        feeAmount,
        feeAmountMinor: moneyToMinor(feeAmount, fromCurrency),
        baseCurrencyCode: normalizeCurrencyCode(tx.baseCurrencyCode || base),
        fromBaseRate: Number(tx.fromBaseRate) > 0 ? Number(tx.fromBaseRate) : null,
        toBaseRate: Number(tx.toBaseRate) > 0 ? Number(tx.toBaseRate) : null,
        fxStatus: 'UNRESOLVED_FX',
        unresolvedFxReason: 'missing_historical_base_bridge',
      };
    }
  }
  if (tx.walletCurrency && tx.baseCurrencyCode && Object.prototype.hasOwnProperty.call(tx, 'walletAmount')) return tx;
  const fields = buildCurrencyFields({
    amount: tx.walletAmount ?? tx.amt ?? 0,
    walletId: tx.walletId,
    wallets,
    baseCurrency: tx.baseCurrencyCode || base,
    exchangeRate: tx.exchangeRate || 1,
    walletCurrency: tx.walletCurrency || tx.currencyCode,
  });
  return {
    ...tx,
    ...fields,
    // Existing app calculations expect amt to represent the workspace/base value.
    amt: fields.baseAmount,
  };
};
