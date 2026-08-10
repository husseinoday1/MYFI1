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

  return list.map((wallet, index) => ({
    ...createDefaultWallet(currency),
    ...wallet,
    id: wallet.id || `${DEFAULT_WALLET_ID}_${index}`,
    // MYFI currently has one base currency per workspace.
    currency,
    openingBalance: Number(wallet.openingBalance || 0),
  }));
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

export const getWalletBalances = (wallets = [], trans = [], currency = 'IQD', defaultWalletId = null) => {
  const normalized = normalizeWallets(wallets, currency);
  const safeDefault = getDefaultWalletId(normalized, currency, defaultWalletId);
  const map = new Map(normalized.map(wallet => [
    wallet.id,
    { ...wallet, balance: Number(wallet.openingBalance || 0) },
  ]));

  trans.forEach(tx => {
    if (tx.kind === 'transfer') {
      const amount = Math.abs(Number(tx.transferAmount || 0));
      const fromId = tx.fromWalletId;
      const toId = tx.toWalletId;
      if (!fromId || !toId) return;
      if (map.has(fromId)) map.get(fromId).balance -= amount;
      if (map.has(toId)) map.get(toId).balance += amount;
      return;
    }

    const amount = Number(tx.amt || 0);
    const walletId = tx.walletId || safeDefault;
    if (!walletId) return;
    if (map.has(walletId)) map.get(walletId).balance += amount;
  });

  return [...map.values()];
};

export const getWalletAvailableBalances = (wallets = [], trans = [], currency = 'IQD', defaultWalletId = null) => {
  const balances = getWalletBalances(wallets, trans, currency, defaultWalletId);
  const safeDefault = getDefaultWalletId(balances, currency, defaultWalletId);
  const reserved = new Map(balances.map(wallet => [wallet.id, 0]));

  (Array.isArray(trans) ? trans : []).forEach(tx => {
    if ((!tx?.isGoalSaving && tx?.flowType !== 'goal_allocation') || tx?.allocationReleased) return;
    const walletId = tx.walletId || safeDefault;
    if (!reserved.has(walletId)) return;
    reserved.set(
      walletId,
      reserved.get(walletId) + Math.abs(Number(tx.allocationAmount ?? tx.amt ?? 0)),
    );
  });

  return balances.map(wallet => ({
    ...wallet,
    reservedBalance: reserved.get(wallet.id) || 0,
    availableBalance: Number(wallet.balance || 0) - Number(reserved.get(wallet.id) || 0),
  }));
};

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
  return {
    ok: spendAmount <= 0 || (Number.isFinite(availableBalance) && spendAmount <= availableBalance + 0.0001),
    availableBalance: Number.isFinite(availableBalance) ? availableBalance : 0,
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
      const amount = Math.abs(Number(tx.transferAmount || 0));
      if (map.has(tx.fromWalletId)) {
        map.get(tx.fromWalletId).monthExpense += amount;
        map.get(tx.fromWalletId).monthNet -= amount;
      }
      if (map.has(tx.toWalletId)) {
        map.get(tx.toWalletId).monthIncome += amount;
        map.get(tx.toWalletId).monthNet += amount;
      }
      return;
    }
    const amount = Number(tx?.amt || 0);
    const wallet = map.get(tx?.walletId || safeDefault);
    if (!wallet || !amount) return;
    if (amount > 0) wallet.monthIncome += amount;
    else wallet.monthExpense += Math.abs(amount);
    wallet.monthNet += amount;
  });

  return [...map.values()];
};
