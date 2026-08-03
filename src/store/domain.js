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

export const normalizeDebtItems = (items = [], fallbackScope = 'personal') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const payments = (Array.isArray(item.payments) ? item.payments : [])
        .filter(payment => payment && payment.id)
        .map(payment => ({
          ...payment,
          amt: Math.abs(Number(payment.amt || 0)),
          date: normalizeDate(payment.date || payment.dateISO),
        }));
      const archivedPaid = Math.abs(Number(item.archivedPaid || 0));
      const paid = archivedPaid + (
        payments.length > 0
          ? sumAmt(payments)
          : Math.max(0, Math.abs(Number(item.paid || 0)) - archivedPaid)
      );
      const total = Math.max(Math.abs(Number(item.total || 0)), paid);
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        total,
        paid,
        archivedPaid,
        payments,
        direction: item.direction === 'receivable' ? 'receivable' : 'owed',
        createdAt: normalizeDate(item.createdAt),
      };
    });

export const normalizeGoalItems = (items = [], fallbackScope = 'personal') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && item.id)
    .map(item => {
      const savings = (Array.isArray(item.savings) ? item.savings : [])
        .filter(saving => saving && saving.id)
        .map(saving => ({
          ...saving,
          amt: Math.abs(Number(saving.amt || 0)),
          date: normalizeDate(saving.date || saving.dateISO),
        }));
      const archivedSaved = Math.abs(Number(item.archivedSaved || 0));
      const saved = archivedSaved + (
        savings.length > 0
          ? sumAmt(savings)
          : Math.max(0, Math.abs(Number(item.cur || 0)) - archivedSaved)
      );
      const target = Math.max(Math.abs(Number(item.target || 0)), saved);
      return {
        ...item,
        scope: normalizeScope(item.scope, fallbackScope),
        purpose: item.purpose === 'debt_payoff' && item.linkedDebtId ? 'debt_payoff' : 'reserve',
        linkedDebtId: item.purpose === 'debt_payoff' && item.linkedDebtId ? item.linkedDebtId : null,
        status: ['settled', 'released'].includes(item.status) ? item.status : 'active',
        settledAt: ['settled', 'released'].includes(item.status) && item.settledAt ? normalizeDate(item.settledAt) : null,
        settledAmount: ['settled', 'released'].includes(item.status) ? Math.abs(Number(item.settledAmount || 0)) : 0,
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
      const amount = Math.abs(Number(tx.transferAmount || 0));
      if (movement.has(tx.fromWalletId)) movement.set(tx.fromWalletId, movement.get(tx.fromWalletId) - amount);
      if (movement.has(tx.toWalletId)) movement.set(tx.toWalletId, movement.get(tx.toWalletId) + amount);
      return;
    }
    const walletId = tx.walletId || defaultWalletId;
    if (movement.has(walletId)) movement.set(walletId, movement.get(walletId) + Number(tx.amt || 0));
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
    commitments: normalizeCommitments(commitments, defaultWalletId).map(item => ({
      ...item,
      scope: normalizeScope(item.scope, fallbackScope),
    })),
  };
};

export const financialDataCount = (snapshot = {}) => (
  (snapshot.trans || []).length
  + (snapshot.debts || []).length
  + (snapshot.goals || []).length
  + (snapshot.commitments || []).length
);

export const snapshotFromState = (state = {}, overrides = {}) => ({
  v: 7,
  data: {
    trans: state.trans || [],
    debts: state.debts || [],
    goals: state.goals || [],
    wallets: state.wallets || [],
    commitments: state.commitments || [],
  },
  cats: state.cats || DEF_CATS,
  cfg: state.cfg || DEF_CFG,
  notif: state.notif || DEF_NOTIF,
  updatedAt: overrides.updatedAt || state.localUpdatedAt || new Date().toISOString(),
  lastSyncedAt: overrides.lastSyncedAt ?? state.lastSyncedAt ?? null,
  cloudRevision: Number(overrides.cloudRevision ?? state.cloudRevision ?? 0),
  dirty: overrides.dirty ?? state.dirty ?? false,
});

export const stateFromSnapshot = (snapshot = {}, fallbackCfg = DEF_CFG) => {
  const data = snapshot.data || snapshot;
  const cfg = normalizeCfg(snapshot.cfg || data.cfg || fallbackCfg);
  const prepared = prepareWalletData({
    wallets: data.wallets,
    trans: data.trans || [],
    commitments: data.commitments,
    cfg,
  });
  return {
    trans: prepared.trans,
    debts: normalizeDebtItems(data.debts, defaultScopeForProfile(prepared.cfg.profileType)),
    goals: normalizeGoalItems(data.goals, defaultScopeForProfile(prepared.cfg.profileType)),
    wallets: prepared.wallets,
    commitments: prepared.commitments,
    cats: snapshot.cats || data.cats || DEF_CATS,
    cfg: prepared.cfg,
    notif: { ...DEF_NOTIF, ...(snapshot.notif || data.notif || {}) },
    localUpdatedAt: snapshot.updatedAt || null,
    lastSyncedAt: snapshot.lastSyncedAt || null,
    cloudRevision: Number(snapshot.cloudRevision || 0),
    dirty: !!snapshot.dirty,
  };
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
