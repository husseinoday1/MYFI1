import * as Crypto from 'expo-crypto';
import { DEF_CATS, DEF_CFG, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { normalizeDate } from '../utils/calc';
import { attachDefaultWalletToTransactions, getDefaultWalletId, normalizeWallets } from '../lib/wallets';
import { monthKey, normalizeCommitments } from '../lib/commitments';
import {
  defaultScopeForProfile,
  normalizeLedgerTransaction,
  normalizeScope,
} from '../lib/modules';
import { normalizeTransactionTag } from '../lib/transactionTags';
import { debtLifecycle, goalLifecycle } from '../lib/trackerLifecycle';
import { normalizeCurrencyCode } from '../lib/financialCoreV2';

export const uid = () => Crypto.randomUUID();

export const sumAmt = (items = []) => items.reduce((a, p) => a + Number(p.amt || 0), 0);

export const debtPaidTotal = (item, payments = item?.payments || []) =>
  Number(item?.archivedPaid || 0) + sumAmt(payments);

export const goalSavedTotal = (item, savings = item?.savings || []) =>
  Number(item?.archivedSaved || 0) + sumAmt(savings);

export const remainingAmount = (total, paid) =>
  Math.max(0, Number(total || 0) - Number(paid || 0));

export const capLinkedAmount = (requested, total, paid, current = 0) => {
  const n = Math.abs(Number(requested) || 0);
  const maxAllowed = remainingAmount(total, Number(paid || 0) - Number(current || 0));
  return Math.min(n, maxAllowed);
};

export const normalizeDebtItems = (items = [], fallbackScope = 'personal', fallbackCurrency = 'IQD') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const payments = (Array.isArray(item.payments) ? item.payments : [])
        .filter(payment => payment && payment.id)
        .map(payment => ({
          ...payment,
          amt: Math.abs(Number(payment.amt || 0)),
          currencyCode: normalizeCurrencyCode(payment.currencyCode || payment.currency || item.currencyCode || item.currency, fallbackCurrency),
          date: normalizeDate(payment.date || payment.dateISO),
        }));
      const archivedPaid = Math.abs(Number(item.archivedPaid || 0));
      const paid = archivedPaid + (
        payments.length > 0
          ? sumAmt(payments)
          : Math.max(0, Math.abs(Number(item.paid || 0)) - archivedPaid)
      );
      const total = Math.max(Math.abs(Number(item.total || 0)), paid);
      const lifecycle = debtLifecycle({ ...item, total, paid, payments }, paid);
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        currencyCode: normalizeCurrencyCode(item.currencyCode || item.currency, fallbackCurrency),
        total,
        paid,
        archivedPaid,
        payments,
        direction: item.direction === 'receivable' ? 'receivable' : 'owed',
        createdAt: normalizeDate(item.createdAt),
        ...lifecycle,
      };
    });

export const normalizeGoalItems = (items = [], fallbackScope = 'personal', fallbackCurrency = 'IQD') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const savings = (Array.isArray(item.savings) ? item.savings : [])
        .filter(saving => saving && saving.id)
        .map(saving => ({
          ...saving,
          amt: Math.abs(Number(saving.amt || 0)),
          currencyCode: normalizeCurrencyCode(saving.currencyCode || saving.currency || item.currencyCode || item.currency, fallbackCurrency),
          date: normalizeDate(saving.date || saving.dateISO),
        }));
      const archivedSaved = Math.abs(Number(item.archivedSaved || 0));
      const saved = archivedSaved + (
        savings.length > 0
          ? sumAmt(savings)
          : Math.max(0, Math.abs(Number(item.cur || 0)) - archivedSaved)
      );
      const target = Math.max(Math.abs(Number(item.target || 0)), saved);
      const lifecycle = goalLifecycle({ ...item, target, cur: saved, savings }, saved);
      const completedAt = lifecycle.completedAt || item.completedAt || null;
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        currencyCode: normalizeCurrencyCode(item.currencyCode || item.currency, fallbackCurrency),
        purpose: 'reserve',
        linkedDebtId: null,
        ...lifecycle,
        completedAt: completedAt ? normalizeDate(completedAt, null) : null,
        settledAt: lifecycle.settledAt ? normalizeDate(lifecycle.settledAt, null) : null,
        settledAmount: lifecycle.settledAmount || 0,
        target,
        cur: saved,
        archivedSaved,
        savings,
        createdAt: normalizeDate(item.createdAt),
      };
    });

const latestCommitmentMonth = (trans = [], commitmentId) => {
  const months = trans
    .filter(t => t.isCommitmentPayment && t.commitmentId === commitmentId)
    .map(t => t.commitmentMonth || monthKey(t.dateISO))
    .filter(Boolean)
    .sort();
  return months[months.length - 1] || null;
};

export const syncCommitmentPaidMonth = (commitments = [], trans = [], commitmentId) =>
  commitments.map(item => {
    if (commitmentId && item.id !== commitmentId) return item;
    const lastPaidMonth = latestCommitmentMonth(trans, item.id);
    return {
      ...item,
      lastPaidMonth,
      ...(item.repeatMonthly === false && !lastPaidMonth ? { active: true } : {}),
    };
  });

export const yearOf = (value) => {
  const match = String(value || '').match(/^(\d{4})-\d{2}-\d{2}$/);
  return match ? Number(match[1]) : null;
};

export const archivedWalletMovement = (trans = [], wallets = [], defaultWalletId = null) => {
  const movement = new Map((wallets || []).map(wallet => [wallet.id, 0]));
  trans.forEach(tx => {
    if (tx.kind === 'transfer') {
      const fromAmount = Math.abs(Number(tx.transferFromAmount ?? tx.transferAmount ?? 0));
      const toAmount = Math.abs(Number(tx.transferToAmount ?? tx.transferAmount ?? 0));
      const feeAmount = Math.abs(Number(tx.feeAmount || 0));
      if (movement.has(tx.fromWalletId)) movement.set(tx.fromWalletId, movement.get(tx.fromWalletId) - fromAmount - feeAmount);
      if (movement.has(tx.toWalletId)) movement.set(tx.toWalletId, movement.get(tx.toWalletId) + toAmount);
      return;
    }
    const walletId = tx.walletId || defaultWalletId;
    const nativeAmount = Object.prototype.hasOwnProperty.call(tx || {}, 'walletAmount')
      ? Number(tx.walletAmount || 0)
      : Number(tx.amt || 0);
    if (movement.has(walletId)) movement.set(walletId, movement.get(walletId) + nativeAmount);
  });
  return movement;
};

export const demoDate = (monthOffset, day) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, day, 12);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const prepareWalletData = ({ wallets, trans, commitments, cfg }) => {
  const fallbackScope = defaultScopeForProfile(cfg.profileType);
  let normalizedWallets = normalizeWallets(wallets, cfg.currency).map(wallet => ({
    ...wallet,
    scope: normalizeScope(wallet.scope, fallbackScope),
  }));
  const requiredScopes = [fallbackScope];
  requiredScopes.forEach(scope => {
    if (normalizedWallets.some(wallet => wallet.scope === scope)) return;
    normalizedWallets.push({
      ...normalizeWallets([], cfg.currency)[0],
      id: scope === 'business' ? 'wallet_business' : 'wallet_personal',
      name: scope === 'business' ? 'محفظة العمل' : 'المحفظة الشخصية',
      nameEn: scope === 'business' ? 'Business wallet' : 'Personal wallet',
      scope,
    });
  });
  const defaultWalletId = getDefaultWalletId(normalizedWallets, cfg.currency, cfg.defaultWalletId);
  const normalizedTrans = (Array.isArray(trans) ? trans : [])
    .map(tx => normalizeTransactionTag(normalizeLedgerTransaction(tx, fallbackScope)));
  return {
    cfg: { ...cfg, defaultWalletId },
    wallets: normalizedWallets,
    trans: attachDefaultWalletToTransactions(normalizedTrans, normalizedWallets, cfg.currency, defaultWalletId),
    commitments: normalizeCommitments(commitments, defaultWalletId, cfg.currency).map(item => ({
      ...item,
      scope: normalizeScope(item.scope, fallbackScope),
    })),
  };
};

const cleanTextKey = value => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\s*\((Guest|ضيف)\)\s*$/i, '')
  .toLowerCase();

const amountKey = value => String(Math.round(Number(value || 0) * 1000) / 1000);

const itemDateKey = item => String(
  item?.dateISO
  || item?.date
  || item?.createdAt
  || item?.startedAt
  || ''
).slice(0, 10);

const keepLastUniqueBy = (items = [], keyOf) => {
  const list = Array.isArray(items) ? items : [];
  const seen = new Set();
  const result = [];

  for (let index = list.length - 1; index >= 0; index -= 1) {
    const item = list[index];
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }

  return result.reverse();
};

const isGuestNamedWallet = wallet => (
  /\((Guest|ضيف)\)\s*$/i.test(String(wallet?.name || ''))
  || /\(Guest\)\s*$/i.test(String(wallet?.nameEn || ''))
);

const walletKey = wallet => [
  cleanTextKey(wallet?.name || wallet?.nameEn),
  cleanTextKey(wallet?.type),
  cleanTextKey(wallet?.scope),
  cleanTextKey(wallet?.currency),
  amountKey(wallet?.openingBalance),
].join('|');

const dedupeWalletsWithAliases = (wallets = []) => {
  const order = [];
  const map = new Map();
  const aliases = new Map();

  (Array.isArray(wallets) ? wallets : []).forEach(wallet => {
    if (!wallet) return;
    const key = walletKey(wallet);
    if (!key) return;

    if (!map.has(key)) {
      order.push(key);
      map.set(key, wallet);
      return;
    }

    const current = map.get(key);
    if (isGuestNamedWallet(current) && !isGuestNamedWallet(wallet)) {
      map.set(key, wallet);
      if (current.id && wallet.id && current.id !== wallet.id) aliases.set(current.id, wallet.id);
      return;
    }

    if (wallet.id && current.id && wallet.id !== current.id) aliases.set(wallet.id, current.id);
  });

  const deduped = order.map(key => map.get(key)).filter(Boolean);
  const validIds = new Set(deduped.map(wallet => wallet.id).filter(Boolean));
  aliases.forEach((targetId, sourceId) => {
    if (!validIds.has(targetId)) aliases.delete(sourceId);
  });
  return { wallets: deduped, aliases };
};

const dedupeWallets = (wallets = []) => dedupeWalletsWithAliases(wallets).wallets;

const transactionKey = item => {
  if (!item) return '';
  const transfer = item.kind === 'transfer';
  return [
    transfer ? 'transfer' : cleanTextKey(item.flowType || item.kind),
    itemDateKey(item),
    cleanTextKey(item.title),
    cleanTextKey(item.note),
    cleanTextKey(item.cat),
    cleanTextKey(transfer ? item.fromCurrency : (item.entityCurrencyCode || item.walletCurrency || item.currencyCode)),
    cleanTextKey(transfer ? item.toCurrency : item.baseCurrencyCode),
    amountKey(transfer ? item.transferAmount : item.amt),
    amountKey(item.allocationAmount),
    cleanTextKey(item.walletId),
    cleanTextKey(item.fromWalletId),
    cleanTextKey(item.toWalletId),
    cleanTextKey(item.commitmentMonth),
    cleanTextKey(item.scope),
    item.isGoalSaving ? 'goal' : '',
    item.isDebtPayment ? 'debt_payment' : '',
    item.isCommitmentPayment ? 'commitment_payment' : '',
  ].join('|');
};

const paymentKey = item => [
  itemDateKey(item),
  amountKey(item?.amt),
  cleanTextKey(item?.note),
].join('|');

const debtKey = item => [
  cleanTextKey(item?.direction || 'owed'),
  cleanTextKey(item?.title || item?.name),
  amountKey(item?.total),
  cleanTextKey(item?.currencyCode || item?.currency),
  itemDateKey(item),
  cleanTextKey(item?.scope),
].join('|');

const goalKey = item => [
  cleanTextKey(item?.title || item?.name),
  amountKey(item?.target),
  cleanTextKey(item?.currencyCode || item?.currency),
  itemDateKey(item),
  cleanTextKey(item?.scope),
].join('|');

const commitmentKey = item => [
  cleanTextKey(item?.title || item?.name),
  amountKey(item?.amt),
  cleanTextKey(item?.currencyCode || item?.currency),
  cleanTextKey(item?.repeatMonthly),
  cleanTextKey(item?.dueDay),
  cleanTextKey(item?.linkedType),
  cleanTextKey(item?.scope),
].join('|');

const categoryKey = item => item?.id || [
  cleanTextKey(item?.name || item?.nameEn),
  cleanTextKey(item?.type),
].join('|');

export const dedupeWorkspaceData = (state = {}) => {
  const { wallets, aliases: walletAliases } = dedupeWalletsWithAliases(state.wallets || []);
  const validWalletIds = new Set(wallets.map(wallet => wallet.id).filter(Boolean));
  const defaultWalletId = state.cfg?.defaultWalletId && validWalletIds.has(state.cfg.defaultWalletId)
    ? state.cfg.defaultWalletId
    : wallets[0]?.id || state.cfg?.defaultWalletId || null;

  const normalizeWalletRef = id => {
    if (!id) return id;
    const mappedId = walletAliases.get(id) || id;
    return validWalletIds.has(mappedId) ? mappedId : defaultWalletId;
  };

  const normalizedTrans = (Array.isArray(state.trans) ? state.trans : []).map(item => {
    if (!item) return item;
    if (item.kind === 'transfer') {
      return {
        ...item,
        fromWalletId: normalizeWalletRef(item.fromWalletId),
        toWalletId: normalizeWalletRef(item.toWalletId),
      };
    }
    return {
      ...item,
      walletId: normalizeWalletRef(item.walletId),
    };
  });
  const trans = keepLastUniqueBy(normalizedTrans, transactionKey);

  const debts = keepLastUniqueBy((state.debts || []).map(item => ({
    ...item,
    payments: keepLastUniqueBy(item?.payments || [], paymentKey),
  })), debtKey);

  const goals = keepLastUniqueBy((state.goals || []).map(item => ({
    ...item,
    savings: keepLastUniqueBy(item?.savings || [], paymentKey),
  })), goalKey);

  const commitments = keepLastUniqueBy((state.commitments || []).map(item => ({
    ...item,
    walletId: normalizeWalletRef(item?.walletId),
  })), commitmentKey);

  return {
    ...state,
    trans,
    debts,
    goals,
    wallets,
    commitments,
    cats: keepLastUniqueBy(state.cats || [], categoryKey),
    cfg: {
      ...(state.cfg || DEF_CFG),
      defaultWalletId,
    },
  };
};

export const financialDataCount = (snapshot = {}) => (
  (snapshot.trans || []).length
  + (snapshot.debts || []).length
  + (snapshot.goals || []).length
  + (snapshot.commitments || []).length
);

export const hasCurrencySensitiveFinancialData = (snapshot = {}) => (
  financialDataCount(snapshot) > 0
  || (Array.isArray(snapshot.wallets) ? snapshot.wallets : [])
    .some(wallet => Number(wallet?.openingBalance || 0) !== 0)
);

export const snapshotFromState = (state = {}, overrides = {}) => {
  const clean = dedupeWorkspaceData(state);
  return {
    v: 7,
    data: {
      trans: clean.trans || [],
      debts: clean.debts || [],
      goals: clean.goals || [],
      wallets: clean.wallets || [],
      commitments: clean.commitments || [],
    },
    cats: clean.cats || DEF_CATS,
    cfg: clean.cfg || DEF_CFG,
    notif: clean.notif || DEF_NOTIF,
    updatedAt: overrides.updatedAt || clean.localUpdatedAt || state.localUpdatedAt || new Date().toISOString(),
    lastSyncedAt: overrides.lastSyncedAt ?? clean.lastSyncedAt ?? state.lastSyncedAt ?? null,
    cloudRevision: Number(overrides.cloudRevision ?? clean.cloudRevision ?? state.cloudRevision ?? 0),
    dirty: overrides.dirty ?? clean.dirty ?? state.dirty ?? false,
  };
};

export const stateFromSnapshot = (snapshot = {}, fallbackCfg = DEF_CFG) => {
  const data = snapshot.data || snapshot;
  const cfg = normalizeCfg(snapshot.cfg || data.cfg || fallbackCfg);
  const prepared = prepareWalletData({
    wallets: data.wallets,
    trans: data.trans || [],
    commitments: data.commitments,
    cfg,
  });
  return dedupeWorkspaceData({
    trans: prepared.trans,
    debts: normalizeDebtItems(data.debts, defaultScopeForProfile(prepared.cfg.profileType), prepared.cfg.currency),
    goals: normalizeGoalItems(data.goals, defaultScopeForProfile(prepared.cfg.profileType), prepared.cfg.currency),
    wallets: prepared.wallets,
    commitments: prepared.commitments,
    cats: snapshot.cats || data.cats || DEF_CATS,
    cfg: prepared.cfg,
    notif: { ...DEF_NOTIF, ...(snapshot.notif || data.notif || {}) },
    localUpdatedAt: snapshot.updatedAt || null,
    lastSyncedAt: snapshot.lastSyncedAt || null,
    cloudRevision: Number(snapshot.cloudRevision || 0),
    dirty: !!snapshot.dirty,
  });
};

export const cloudSnapshot = (row = {}, notif = DEF_NOTIF) => ({
  v: 7,
  data: {
    trans: row.trans || [],
    debts: row.debts || [],
    goals: row.goals || [],
    wallets: row.wallets || [],
    commitments: row.commitments || [],
  },
  cats: row.cats || DEF_CATS,
  cfg: row.cfg || DEF_CFG,
  notif,
  updatedAt: row.updated_at || new Date().toISOString(),
  lastSyncedAt: row.updated_at || new Date().toISOString(),
  cloudRevision: Number(row.revision || 0),
  dirty: false,
});
