export const DEFAULT_WALLET_ID = 'wallet_cash';

export const createDefaultWallet = (currency = 'IQD') => ({
  id: DEFAULT_WALLET_ID,
  name: 'المحفظة الرئيسية',
  nameEn: 'Main wallet',
  type: 'cash',
  currency,
  openingBalance: 0,
});

export const normalizeWallets = (wallets = [], currency = 'IQD') => {
  const list = Array.isArray(wallets) && wallets.length > 0
    ? wallets
    : [createDefaultWallet(currency)];

  return list.map((wallet, index) => {
    const walletCurrency = String(wallet?.currency || currency || 'IQD').toUpperCase();
    const valuationRate = Number(wallet?.valuationRate || 1);
    return {
      ...createDefaultWallet(currency),
      ...wallet,
      id: wallet.id || `${DEFAULT_WALLET_ID}_${index}`,
      // Financial Core 2.0: every wallet owns its native currency. The workspace
      // currency is only the reporting/base currency.
      currency: walletCurrency,
      openingBalance: Number(wallet.openingBalance || 0),
      openingBalanceMode: wallet?.openingBalanceMode === 'ledger' ? 'ledger' : 'legacy',
      openingBaseBalance: Number.isFinite(Number(wallet?.openingBaseBalance))
        ? Number(wallet.openingBaseBalance)
        : walletCurrency === String(currency || 'IQD').toUpperCase()
          ? Number(wallet.openingBalance || 0)
          : Number(wallet.openingBalance || 0) * (Number.isFinite(valuationRate) && valuationRate > 0 ? valuationRate : 1),
      valuationRate: Number.isFinite(valuationRate) && valuationRate > 0 ? valuationRate : 1,
    };
  });
};

export const getDefaultWalletId = (wallets = [], currency = 'IQD', preferredId = null) => {
  const normalized = normalizeWallets(wallets, currency);
  if (preferredId && normalized.some(wallet => wallet.id === preferredId)) return preferredId;
  return normalized[0]?.id || DEFAULT_WALLET_ID;
};

export const sortWalletsByDefault = (wallets = [], currency = 'IQD', defaultWalletId = null) => {
  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  return [...normalized].sort((a, b) => {
    if (a.id === safeDefault) return -1;
    if (b.id === safeDefault) return 1;
    return 0;
  });
};

export const attachDefaultWalletToTransactions = (trans = [], wallets = [], currency = 'IQD', defaultWalletId = null) => {
  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  const walletIds = new Set(normalized.map(wallet => wallet.id));
  return (Array.isArray(trans) ? trans : []).map(tx => {
    if (!tx || tx.kind === 'transfer') return tx;
    if (tx.walletId && walletIds.has(tx.walletId)) return tx;
    return { ...tx, walletId: safeDefault };
  });
};

export const getWalletLabel = (wallet, lang = 'ar') =>
  lang === 'ar' ? (wallet?.name || wallet?.nameEn || '') : (wallet?.nameEn || wallet?.name || '');

const walletBalanceCache = new WeakMap();
const walletAvailableBalanceCache = new WeakMap();
const recentWalletBalances = new Map();
const recentWalletAvailableBalances = new Map();
const RECENT_WALLET_SOURCE_LIMIT = 6;

const walletCacheKey = (wallets = [], currency = 'IQD', defaultWalletId = null) => (
  `${currency}|${defaultWalletId || ''}|${(Array.isArray(wallets) ? wallets : []).map(wallet => (
    `${wallet?.id || ''}:${wallet?.currency || currency}:${Number(wallet?.openingBalance || 0)}:${Number(wallet?.openingBaseBalance || 0)}:${wallet?.scope || ''}`
  )).join('|')}`
);

const cloneWalletRows = rows => rows.map(row => ({ ...row }));

const rememberWalletRows = (registry, key, source, rows) => {
  const recent = registry.get(key) || [];
  recent.unshift({ source, rows });
  if (recent.length > RECENT_WALLET_SOURCE_LIMIT) recent.length = RECENT_WALLET_SOURCE_LIMIT;
  registry.set(key, recent);
};

const prependedWalletBase = (registry, key, source) => {
  const recent = registry.get(key) || [];
  for (const entry of recent) {
    const prior = entry.source;
    const addedCount = source.length - (prior?.length || 0);
    if (!prior || addedCount < 1 || addedCount > 16) continue;
    if (prior.length === 0 || (
      source[addedCount] === prior[0]
      && source[addedCount + Math.floor(prior.length / 2)] === prior[Math.floor(prior.length / 2)]
      && source[source.length - 1] === prior[prior.length - 1]
    )) return { rows: entry.rows, added: source.slice(0, addedCount) };
  }
  return null;
};

const applyWalletMovement = (map, tx, safeDefault) => {
  if (tx?.kind === 'transfer') {
    const fromAmount = Math.abs(Number(tx.transferFromAmount ?? tx.transferAmount ?? 0));
    const toAmount = Math.abs(Number(tx.transferToAmount ?? tx.transferAmount ?? 0));
    const feeAmount = Math.abs(Number(tx.feeAmount || 0));
    if (map.has(tx.fromWalletId)) map.get(tx.fromWalletId).balance -= (fromAmount + feeAmount);
    if (map.has(tx.toWalletId)) map.get(tx.toWalletId).balance += toAmount;
    return;
  }
  const amount = Object.prototype.hasOwnProperty.call(tx || {}, 'walletAmount')
    ? Number(tx.walletAmount || 0)
    : Number(tx?.amt || 0);
  const walletId = tx?.walletId || safeDefault;
  if (walletId && map.has(walletId)) map.get(walletId).balance += amount;
};

export const getWalletBalances = (wallets = [], trans = [], currency = 'IQD', defaultWalletId = null) => {
  const sourceTrans = Array.isArray(trans) ? trans : [];
  const key = walletCacheKey(wallets, currency, defaultWalletId);
  const sourceCache = walletBalanceCache.get(sourceTrans);
  const cached = sourceCache?.get(key);
  if (cached) return cloneWalletRows(cached);

  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  const prependBase = prependedWalletBase(recentWalletBalances, key, sourceTrans);
  if (prependBase) {
    const map = new Map(prependBase.rows.map(wallet => [wallet.id, { ...wallet }]));
    prependBase.added.forEach(tx => applyWalletMovement(map, tx, safeDefault));
    const rows = [...map.values()];
    const nextCache = sourceCache || new Map();
    nextCache.set(key, rows);
    if (!sourceCache) walletBalanceCache.set(sourceTrans, nextCache);
    rememberWalletRows(recentWalletBalances, key, sourceTrans, rows);
    return cloneWalletRows(rows);
  }
  const map = new Map(normalized.map(wallet => [
    wallet.id,
    { ...wallet, balance: Number(wallet.openingBalance || 0) },
  ]));

  sourceTrans.forEach(tx => applyWalletMovement(map, tx, safeDefault));

  const rows = [...map.values()];
  const nextCache = sourceCache || new Map();
  nextCache.set(key, rows);
  if (!sourceCache) walletBalanceCache.set(sourceTrans, nextCache);
  rememberWalletRows(recentWalletBalances, key, sourceTrans, rows);
  return cloneWalletRows(rows);
};

export const getWalletAvailableBalances = (wallets = [], trans = [], currency = 'IQD', defaultWalletId = null) => {
  const sourceTrans = Array.isArray(trans) ? trans : [];
  const key = walletCacheKey(wallets, currency, defaultWalletId);
  const sourceCache = walletAvailableBalanceCache.get(sourceTrans);
  const cached = sourceCache?.get(key);
  if (cached) return cloneWalletRows(cached);

  const balances = getWalletBalances(wallets, sourceTrans, currency, defaultWalletId);
  const safeDefault = getDefaultWalletId(balances, currency, defaultWalletId);
  const prependBase = prependedWalletBase(recentWalletAvailableBalances, key, sourceTrans);
  if (prependBase) {
    const balanceMap = new Map(balances.map(wallet => [wallet.id, wallet]));
    const rowsById = new Map(prependBase.rows.map(wallet => {
      const balance = balanceMap.get(wallet.id) || wallet;
      return [wallet.id, { ...balance, reservedBalance: Number(wallet.reservedBalance || 0) }];
    }));
    prependBase.added.forEach(tx => {
      if ((!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation') || tx?.allocationReleased) return;
      const walletId = tx.walletId || safeDefault;
      const wallet = rowsById.get(walletId);
      if (!wallet) return;
      wallet.reservedBalance += Math.abs(Number(tx.allocationWalletAmount ?? tx.allocationAmount ?? tx.amt ?? 0));
    });
    const rows = [...rowsById.values()].map(wallet => ({
      ...wallet,
      availableBalance: Number(wallet.balance || 0) - Number(wallet.reservedBalance || 0),
    }));
    const nextCache = sourceCache || new Map();
    nextCache.set(key, rows);
    if (!sourceCache) walletAvailableBalanceCache.set(sourceTrans, nextCache);
    rememberWalletRows(recentWalletAvailableBalances, key, sourceTrans, rows);
    return cloneWalletRows(rows);
  }
  const reserved = new Map(balances.map(wallet => [wallet.id, 0]));

  sourceTrans.forEach(tx => {
    if ((!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation') || tx?.allocationReleased) return;
    const walletId = tx.walletId || safeDefault;
    if (!reserved.has(walletId)) return;
    reserved.set(
      walletId,
      reserved.get(walletId) + Math.abs(Number(tx.allocationWalletAmount ?? tx.allocationAmount ?? tx.amt ?? 0)),
    );
  });

  const rows = balances.map(wallet => ({
    ...wallet,
    reservedBalance: reserved.get(wallet.id) || 0,
    availableBalance: Number(wallet.balance || 0) - Number(reserved.get(wallet.id) || 0),
  }));
  const nextCache = sourceCache || new Map();
  nextCache.set(key, rows);
  if (!sourceCache) walletAvailableBalanceCache.set(sourceTrans, nextCache);
  rememberWalletRows(recentWalletAvailableBalances, key, sourceTrans, rows);
  return cloneWalletRows(rows);
};


export const walletAmountToBase = (wallet, amount = 0, baseCurrency = 'IQD') => {
  const value = Number(amount || 0);
  if (!Number.isFinite(value)) return 0;
  const native = String(wallet?.currency || baseCurrency || 'IQD').toUpperCase();
  const base = String(baseCurrency || 'IQD').toUpperCase();
  if (native === base) return value;
  const rate = Number(wallet?.valuationRate || 0);
  return Number.isFinite(rate) && rate > 0 ? value * rate : 0;
};

export const getWalletBaseAvailableTotal = (walletRows = [], baseCurrency = 'IQD') => (
  (Array.isArray(walletRows) ? walletRows : []).reduce(
    (sum, wallet) => sum + walletAmountToBase(wallet, wallet?.availableBalance, baseCurrency),
    0,
  )
);

export const canSpendFromWallet = ({
  wallets = [],
  trans = [],
  currency = 'IQD',
  defaultWalletId = null,
  walletId = null,
  amount = 0,
  excludeTransactionId = null,
} = {}) => {
  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  const targetWalletId = walletId || safeDefault;
  const spendAmount = Math.abs(Number(amount) || 0);
  const sourceTrans = excludeTransactionId
    ? (Array.isArray(trans) ? trans : []).filter(tx => tx?.id !== excludeTransactionId)
    : trans;
  const wallet = getWalletAvailableBalances(normalized, sourceTrans, currency, safeDefault)
    .find(item => item.id === targetWalletId);
  const availableBalance = Number(wallet?.availableBalance);
  const wouldGoNegative = spendAmount > 0 && (!Number.isFinite(availableBalance) || spendAmount > availableBalance + 0.0001);
  return {
    // A ledger records reality. Financial Core 2.0 warns about a negative
    // balance instead of silently refusing to record a real transaction.
    ok: true,
    warning: wouldGoNegative,
    wouldGoNegative,
    availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
    projectedBalance: (Number.isFinite(availableBalance) ? availableBalance : 0) - spendAmount,
    walletId: targetWalletId,
  };
};

export const getWalletMonthlyMovement = (wallets = [], trans = [], currency = 'IQD', defaultWalletId = null, targetMonth = '') => {
  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  const map = new Map(normalized.map(wallet => [wallet.id, {
    ...wallet,
    monthIncome: 0,
    monthExpense: 0,
    monthNet: 0,
  }]));

  (Array.isArray(trans) ? trans : []).forEach(tx => {
    if (targetMonth && !String(tx?.dateISO || '').startsWith(targetMonth)) return;
    if (tx?.kind === 'transfer') {
      const fromAmount = Math.abs(Number(tx.transferFromAmount ?? tx.transferAmount ?? 0));
      const toAmount = Math.abs(Number(tx.transferToAmount ?? tx.transferAmount ?? 0));
      const feeAmount = Math.abs(Number(tx.feeAmount || 0));
      if (map.has(tx.fromWalletId)) {
        map.get(tx.fromWalletId).monthExpense += fromAmount + feeAmount;
        map.get(tx.fromWalletId).monthNet -= fromAmount + feeAmount;
      }
      if (map.has(tx.toWalletId)) {
        map.get(tx.toWalletId).monthIncome += toAmount;
        map.get(tx.toWalletId).monthNet += toAmount;
      }
      return;
    }
    const amount = Object.prototype.hasOwnProperty.call(tx || {}, 'walletAmount')
      ? Number(tx.walletAmount || 0)
      : Number(tx?.amt || 0);
    const wallet = map.get(tx?.walletId || safeDefault);
    if (!wallet || !amount) return;
    if (amount > 0) wallet.monthIncome += amount;
    else wallet.monthExpense += Math.abs(amount);
    wallet.monthNet += amount;
  });

  return [...map.values()];
};
