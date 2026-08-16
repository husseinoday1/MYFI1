import { roundCurrency } from './money';

const currencyCode = (value, fallback = 'IQD') => (
  String(value || fallback).trim().toUpperCase() || fallback
);

const positiveRate = (value) => {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

export const walletBaseRateSuggestion = (wallet, baseCurrency = 'IQD') => {
  const base = currencyCode(baseCurrency);
  const currency = currencyCode(wallet?.currency, base);
  if (currency === base) return 1;
  return positiveRate(wallet?.valuationRate);
};

export const buildEntryFxSuggestion = ({ wallet, baseCurrency = 'IQD' } = {}) => {
  const base = currencyCode(baseCurrency);
  const currency = currencyCode(wallet?.currency, base);
  const rate = walletBaseRateSuggestion(wallet, base);
  return {
    available: currency === base || rate !== null,
    currency,
    baseCurrency: base,
    rate,
    source: currency === base ? 'same_currency' : 'wallet_valuation_suggestion',
    valuationUpdatedAt: wallet?.valuationUpdatedAt || null,
  };
};

export const buildTransferFxSuggestion = ({
  fromWallet,
  toWallet,
  sourceAmount = 0,
  baseCurrency = 'IQD',
} = {}) => {
  const base = currencyCode(baseCurrency);
  const fromCurrency = currencyCode(fromWallet?.currency, base);
  const toCurrency = currencyCode(toWallet?.currency, base);
  const fromBaseRate = walletBaseRateSuggestion(fromWallet, base);
  const toBaseRate = walletBaseRateSuggestion(toWallet, base);
  const amount = Math.abs(Number(sourceAmount) || 0);
  const ratesAvailable = fromBaseRate !== null && toBaseRate !== null;
  const sameCurrency = fromCurrency === toCurrency;
  const targetAmount = amount > 0 && ratesAvailable
    ? roundCurrency(sameCurrency ? amount : (amount * fromBaseRate) / toBaseRate, toCurrency)
    : null;
  const transferRate = amount > 0 && Number(targetAmount) > 0
    ? Number(targetAmount) / amount
    : (sameCurrency ? 1 : null);

  return {
    available: ratesAvailable,
    fromCurrency,
    toCurrency,
    baseCurrency: base,
    fromBaseRate,
    toBaseRate,
    targetAmount,
    transferRate,
    source: sameCurrency ? 'same_currency_wallet_valuation_suggestion' : 'wallet_valuation_suggestion',
    fromValuationUpdatedAt: fromWallet?.valuationUpdatedAt || null,
    toValuationUpdatedAt: toWallet?.valuationUpdatedAt || null,
  };
};
