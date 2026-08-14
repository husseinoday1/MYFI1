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

export const buildTransferCurrencyFields = ({
  fromWalletId,
  toWalletId,
  fromAmount,
  toAmount = null,
  wallets = [],
  baseCurrency = 'IQD',
  exchangeRate = null,
  feeAmount = 0,
} = {}) => {
  const base = normalizeCurrencyCode(baseCurrency);
  const fromCurrency = walletCurrencyFor(wallets, fromWalletId, base);
  const toCurrency = walletCurrencyFor(wallets, toWalletId, base);
  const sourceAmount = Math.abs(roundCurrency(Number(fromAmount) || 0, fromCurrency));
  const explicitTarget = Number(toAmount);
  const rate = fromCurrency === toCurrency
    ? 1
    : normalizeExchangeRate(
        exchangeRate,
        Number.isFinite(explicitTarget) && sourceAmount > 0 ? explicitTarget / sourceAmount : 1,
      );
  const targetAmount = fromCurrency === toCurrency
    ? sourceAmount
    : Number.isFinite(explicitTarget) && explicitTarget > 0
      ? Math.abs(roundCurrency(explicitTarget, toCurrency))
      : convertMoney(sourceAmount, fromCurrency, toCurrency, rate);
  const fromWallet = (Array.isArray(wallets) ? wallets : []).find(item => item?.id === fromWalletId);
  const toWallet = (Array.isArray(wallets) ? wallets : []).find(item => item?.id === toWalletId);
  // transferRate is FROM -> TO. It must never be reused as FROM -> BASE when
  // neither side is the workspace currency. Wallet valuation rates provide the
  // historical/base-book bridge in that case.
  const fromBaseRate = fromCurrency === base
    ? 1
    : toCurrency === base
      ? (targetAmount / Math.max(sourceAmount, Number.EPSILON))
      : normalizeExchangeRate(fromWallet?.valuationRate, 1);
  const toBaseRate = toCurrency === base
    ? 1
    : fromCurrency === base
      ? (sourceAmount / Math.max(targetAmount, Number.EPSILON))
      : normalizeExchangeRate(toWallet?.valuationRate, 1);
  const baseFromAmount = fromCurrency === base
    ? roundCurrency(sourceAmount, base)
    : convertMoney(sourceAmount, fromCurrency, base, fromBaseRate);
  const baseToAmount = toCurrency === base
    ? roundCurrency(targetAmount, base)
    : convertMoney(targetAmount, toCurrency, base, toBaseRate);
  const fee = Math.abs(roundCurrency(Number(feeAmount) || 0, fromCurrency));
  const feeBaseAmount = fromCurrency === base
    ? roundCurrency(fee, base)
    : convertMoney(fee, fromCurrency, base, fromBaseRate);
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
    fromBaseRate,
    toBaseRate,
    baseFromAmount,
    baseFromAmountMinor: moneyToMinor(baseFromAmount, base),
    baseToAmount,
    baseToAmountMinor: moneyToMinor(baseToAmount, base),
    baseAmount: baseFromAmount,
    baseAmountMinor: moneyToMinor(baseFromAmount, base),
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
    const fields = buildTransferCurrencyFields({
      fromWalletId: tx.fromWalletId,
      toWalletId: tx.toWalletId,
      fromAmount: tx.transferFromAmount ?? tx.transferAmount ?? 0,
      toAmount: tx.transferToAmount,
      wallets,
      baseCurrency: tx.baseCurrencyCode || base,
      exchangeRate: tx.transferRate ?? tx.exchangeRate,
      feeAmount: tx.feeAmount || 0,
    });
    return {
      ...tx,
      transferAmount: Math.abs(Number(tx.transferAmount ?? fields.transferFromAmount) || 0),
      ...fields,
    };
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
