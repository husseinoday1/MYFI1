// MYFI_MULTI_CURRENCY_FOUNDATION_PHASE1
// Rate convention: 1 unit of sourceCurrency = rate units of targetCurrency.
import { CURRENCIES } from './constants';
import { roundCurrency } from './money';

const knownCodes = new Set(CURRENCIES.map(item => item.code));

export const normalizeCurrencyCode = (value, fallback = 'IQD') => {
  const fallbackCode = String(fallback || 'IQD').trim().toUpperCase() || 'IQD';
  const code = String(value || '').trim().toUpperCase();
  return knownCodes.has(code) ? code : (knownCodes.has(fallbackCode) ? fallbackCode : 'IQD');
};

export const normalizeExchangeRate = value => {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};

export const rateKey = (sourceCurrency, targetCurrency) => (
  `${normalizeCurrencyCode(sourceCurrency)}:${normalizeCurrencyCode(targetCurrency)}`
);

export const getConfiguredExchangeRate = (cfg = {}, sourceCurrency, targetCurrency) => {
  const source = normalizeCurrencyCode(sourceCurrency, cfg.currency);
  const target = normalizeCurrencyCode(targetCurrency, cfg.currency);
  if (source === target) return 1;
  const rates = cfg.exchangeRates || {};
  const direct = normalizeExchangeRate(rates[rateKey(source, target)]);
  if (direct) return direct;
  const inverse = normalizeExchangeRate(rates[rateKey(target, source)]);
  return inverse ? 1 / inverse : null;
};

export const convertCurrency = (amount, sourceCurrency, targetCurrency, rate) => {
  const source = normalizeCurrencyCode(sourceCurrency);
  const target = normalizeCurrencyCode(targetCurrency, source);
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  if (source === target) return roundCurrency(value, target);
  const safeRate = normalizeExchangeRate(rate);
  if (!safeRate) return null;
  return roundCurrency(value * safeRate, target);
};

export const captureBaseAmount = ({ amount, currency, baseCurrency, exchangeRate }) => {
  const source = normalizeCurrencyCode(currency, baseCurrency);
  const base = normalizeCurrencyCode(baseCurrency, source);
  const value = Number(amount);
  if (!Number.isFinite(value)) return { baseAmount: null, exchangeRate: null };
  if (source === base) return { baseAmount: roundCurrency(value, base), exchangeRate: 1 };
  const rate = normalizeExchangeRate(exchangeRate);
  if (!rate) return { baseAmount: null, exchangeRate: null };
  return {
    baseAmount: convertCurrency(value, source, base, rate),
    exchangeRate: rate,
  };
};

export const getWalletCurrency = (wallets = [], walletId, baseCurrency = 'IQD') => {
  const wallet = (Array.isArray(wallets) ? wallets : []).find(item => item?.id === walletId);
  return normalizeCurrencyCode(wallet?.currency, baseCurrency);
};

export const normalizeTransferMoney = ({
  sourceAmount,
  targetAmount,
  sourceCurrency,
  targetCurrency,
  transferRate,
} = {}) => {
  const source = normalizeCurrencyCode(sourceCurrency);
  const target = normalizeCurrencyCode(targetCurrency, source);
  const sourceValue = Math.abs(Number(sourceAmount) || 0);
  if (!(sourceValue > 0)) return null;

  if (source === target) {
    const sameAmount = Math.abs(Number(targetAmount) || sourceValue);
    return {
      sourceCurrency: source,
      targetCurrency: target,
      sourceAmount: roundCurrency(sourceValue, source),
      targetAmount: roundCurrency(sameAmount, target),
      transferRate: 1,
    };
  }

  let rate = normalizeExchangeRate(transferRate);
  let targetValue = Math.abs(Number(targetAmount) || 0);
  if (!rate && targetValue > 0) rate = targetValue / sourceValue;
  if (!(targetValue > 0) && rate) targetValue = sourceValue * rate;
  if (!rate || !(targetValue > 0)) return null;

  return {
    sourceCurrency: source,
    targetCurrency: target,
    sourceAmount: roundCurrency(sourceValue, source),
    targetAmount: roundCurrency(targetValue, target),
    transferRate: rate,
  };
};
