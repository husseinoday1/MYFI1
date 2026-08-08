import { today, normalizeDate } from '../../utils/calc';
import { canSpendFromWallet, getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { commitmentCycleMonth, deferredCommitmentDueISO, monthKey, normalizeCommitments } from '../../lib/commitments';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import { financialDataCount, syncCommitmentPaidMonth, uid } from '../domain';
const localNumber = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const cleanLinkName = value => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .replace(/\s*\((Guest|ضيف)\)\s*$/i, '')
  .toLowerCase();

const debtRemainingLocal = item => Math.max(
  0,
  Math.abs(localNumber(item?.total)) - Math.abs(localNumber(item?.paid)),
);

const goalRemainingLocal = item => (
  ['released', 'settled'].includes(item?.status)
    ? 0
    : Math.max(0, Math.abs(localNumber(item?.target)) - Math.abs(localNumber(item?.cur)))
);

const restoreArchivedItem = (item, active) => {
  const next = { ...item };
  const wasActive = item.archivedFromActive !== false;
  delete next.archivedAt;
  delete next.archivedFromActive;
  if (active) next.active = wasActive;
  return next;
};

const linkNamesMatch = (a, b) => {
  const left = cleanLinkName(a);
  const right = cleanLinkName(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
};

const findRepairLinkedTarget = ({ commitment, linkedType, linkedId, debts = [], goals = [] }) => {
  if (linkedType === 'debt' || linkedType === 'receivable') {
    const direction = linkedType === 'receivable' ? 'receivable' : 'owed';
    const current = debts.find(item => item.id === linkedId);
    if (current && current.direction === direction && debtRemainingLocal(current) > 0) return current;

    const candidates = debts.filter(item => (
      item.direction === direction
      && !item.archivedAt
      && debtRemainingLocal(item) > 0
      && (!commitment?.scope || !item.scope || item.scope === commitment.scope)
    ));

    const sourceName = current?.name || commitment?.name;
    const byName = candidates.find(item => linkNamesMatch(item.name, sourceName));
    if (byName) return byName;
    return candidates.length === 1 ? candidates[0] : null;
  }

  if (linkedType === 'goal') {
    const current = goals.find(item => item.id === linkedId);
    if (current && goalRemainingLocal(current) > 0) return current;

    const candidates = goals.filter(item => (
      !item.archivedAt
      && goalRemainingLocal(item) > 0
      && (!commitment?.scope || !item.scope || item.scope === commitment.scope)
    ));

    const sourceName = current?.name || commitment?.name;
    const byName = candidates.find(item => linkNamesMatch(item.name, sourceName));
    if (byName) return byName;
    return candidates.length === 1 ? candidates[0] : null;
  }

  return null;
};

export const createManagementSlice = (set, get) => ({
  setCats: async (cats) => {
    set({ cats });
    await get().saveLocal();
    await get().syncCloud();
  },

  addCommitment: async (item) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const next = normalizeCommitments([{
      id: uid(),
      name: item.name,
      amt: item.amt,
      day: item.day,
      firstDueISO: item.firstDueISO,
      cat: item.cat || 'other',
      walletId: item.walletId || defaultWalletId,
      linkedType: item.linkedType || 'none',
      linkedId: item.linkedId || null,
      scope: normalizeScope(item.scope, getEntryScope(get().cfg)),
      repeatMonthly: item.repeatMonthly !== false,
      active: item.active !== false,
      createdAt: today(),
    }], defaultWalletId)[0];
    if (!next || !next.amt) return false;
    set(s => ({ commitments: [next, ...normalizeCommitments(s.commitments, defaultWalletId)] }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  editCommitment: async (id, patch) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, ...patch }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deferCommitment: async (id, option = 'day') => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!commitment || commitment.active === false) return false;
    const deferredUntilISO = deferredCommitmentDueISO(commitment, option);
    const deferredCycleMonth = commitmentCycleMonth(commitment, new Date());
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, deferredUntilISO, deferredCycleMonth }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  clearCommitmentDeferral: async (id) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id
          ? normalizeCommitments([{ ...item, deferredUntilISO: null, deferredCycleMonth: null }], defaultWalletId)[0]
          : item
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  deleteCommitment: async (id) => {
    set(s => ({
      commitments: s.commitments.filter(item => item.id !== id),
      trans: s.trans
        .map(t => {
          if (!(t.isCommitmentPayment && t.commitmentId === id)) return t;
          if (t.isDebtPayment || t.isGoalSaving) {
            const {
              isCommitmentPayment,
              commitmentId,
              commitmentMonth,
              commitmentLinkedType,
              commitmentLinkedId,
              ...rest
            } = t;
            return rest;
          }
          return null;
        })
        .filter(Boolean),
    }));
    await get().saveLocal({ force: true });
    await get().syncCloud();
  },

  archiveTracker: async (kind, sourceId) => {
    if (!sourceId) return false;
    const archivedAt = today();
    set(s => {
      const debtKinds = kind === 'owed' || kind === 'receivable';
      return {
        debts: debtKinds
          ? s.debts.map(item => item.id === sourceId ? { ...item, archivedAt } : item)
          : s.debts,
        goals: kind === 'saving'
          ? s.goals.map(item => item.id === sourceId ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false } : item)
          : s.goals,
        commitments: s.commitments.map(item => {
          if (kind === 'monthly' && item.id === sourceId) return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
          if (debtKinds && (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === sourceId) {
            return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
          }
          if (kind === 'saving' && item.linkedType === 'goal' && item.linkedId === sourceId) {
            return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
          }
          return item;
        }),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  restoreTracker: async (kind, sourceId) => {
    if (!sourceId) return false;
    set(s => {
      const debtKinds = kind === 'owed' || kind === 'receivable';
      return {
        debts: debtKinds
          ? s.debts.map(item => item.id === sourceId ? restoreArchivedItem(item, false) : item)
          : s.debts,
        goals: kind === 'saving'
          ? s.goals.map(item => item.id === sourceId
            ? restoreArchivedItem(item, item.status !== 'released')
            : item)
          : s.goals,
        commitments: s.commitments.map(item => {
          const linkedToDebt = debtKinds
            && (item.linkedType === 'debt' || item.linkedType === 'receivable')
            && item.linkedId === sourceId;
          const linkedToGoal = kind === 'saving' && item.linkedType === 'goal' && item.linkedId === sourceId;
          if (kind === 'monthly' && item.id === sourceId) return restoreArchivedItem(item, true);
          if (linkedToDebt || linkedToGoal) return restoreArchivedItem(item, true);
          return item;
        }),
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  archiveTrackersMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);
    if (!rows.length) return false;
    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));
    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));
    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));
    const archivedAt = today();
    set(s => ({
      debts: s.debts.map(item => debtIds.has(item.id) ? { ...item, archivedAt } : item),
      goals: s.goals.map(item => goalIds.has(item.id) ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false } : item),
      commitments: s.commitments.map(item => {
        const selected = commitmentIds.has(item.id);
        const debtLinked = (item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId);
        const goalLinked = item.linkedType === 'goal' && goalIds.has(item.linkedId);
        return selected || debtLinked || goalLinked
          ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false }
          : item;
      }),
    }));
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  deleteTrackersMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);
    if (!rows.length) return false;
    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));
    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));
    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));
    set(s => {
      let trans = s.trans.filter(item => (
        !(item.isDebtPayment && debtIds.has(item.debtId))
        && !(item.isGoalSaving && goalIds.has(item.goalId))
      ));
      trans = trans
        .map(item => {
          if (!(item.isCommitmentPayment && commitmentIds.has(item.commitmentId))) return item;
          if (item.isDebtPayment || item.isGoalSaving) {
            const {
              isCommitmentPayment,
              commitmentId,
              commitmentMonth,
              commitmentLinkedType,
              commitmentLinkedId,
              ...rest
            } = item;
            return rest;
          }
          return null;
        })
        .filter(Boolean);
      const commitments = s.commitments.filter(item => {
        if (commitmentIds.has(item.id)) return false;
        const debtLinked = (item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId);
        const goalLinked = item.linkedType === 'goal' && goalIds.has(item.linkedId);
        return !debtLinked && !goalLinked;
      });
      return {
        trans,
        commitments,
        debts: s.debts.filter(item => !debtIds.has(item.id)),
        goals: s.goals.filter(item => !goalIds.has(item.id)),
      };
    });
    await get().saveLocal({ force: true });
    await get().syncCloud();
    return true;
  },

  payCommitment: async (id, dateISO = today(), walletId = null, cycleMonth = null) => {
    const entryDate = normalizeDate(dateISO);
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!commitment || !commitment.active || !commitment.amt) return { ok: false, reason: 'not_found' };
    const paymentWalletId = walletId || commitment.walletId || defaultWalletId;
    const paidMonth = cycleMonth || commitmentCycleMonth(commitment, new Date(`${entryDate}T12:00:00`));
    if (commitment.lastPaidMonth === paidMonth) return { ok: false, reason: 'already_paid' };
    const linkedType = commitment.linkedType || 'none';
    let linkedId = commitment.linkedId || null;
    const repairedLinkedTarget = findRepairLinkedTarget({
      commitment,
      linkedType,
      linkedId,
      debts: get().debts,
      goals: get().goals,
    });
    if (repairedLinkedTarget?.id && repairedLinkedTarget.id !== linkedId) {
      linkedId = repairedLinkedTarget.id;
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, linkedId } : item
        )),
      }));
    }
    const requestedAmount = Math.abs(Number(commitment.amt) || 0);
    const linkedMeta = {
      title: commitment.name,
      cat: commitment.cat || 'other',
      scope: normalizeScope(commitment.scope, getEntryScope(get().cfg)),
      isCommitmentPayment: true,
      commitmentId: id,
      commitmentMonth: paidMonth,
      commitmentLinkedType: linkedType,
      commitmentLinkedId: linkedId,
      transactionTag: 'commitment',
    };
    if ((linkedType === 'debt' || linkedType === 'receivable') && linkedId) {
      const applied = await get().payDebt(linkedId, commitment.amt, entryDate, paymentWalletId, linkedMeta);
      if (!applied) return { ok: false, reason: 'linked_unavailable' };
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, deferredCycleMonth: null, active: item.repeatMonthly === false ? false : item.active } : item
        )),
      }));
      await get().saveLocal();
      await get().syncCloud();
      return { ok: true, partial: applied < requestedAmount - 0.0001, appliedAmount: applied, requestedAmount };
    }
    if (linkedType === 'goal' && linkedId) {
      const applied = await get().saveGoal(linkedId, commitment.amt, entryDate, paymentWalletId, linkedMeta);
      if (!applied) return { ok: false, reason: 'linked_unavailable' };
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, deferredCycleMonth: null, active: item.repeatMonthly === false ? false : item.active } : item
        )),
      }));
      await get().saveLocal();
      await get().syncCloud();
      return { ok: true, partial: applied < requestedAmount - 0.0001, appliedAmount: applied, requestedAmount };
    }
    const spendCheck = canSpendFromWallet({
      wallets: get().wallets,
      trans: get().trans,
      currency: get().cfg.currency,
      defaultWalletId: get().cfg.defaultWalletId,
      walletId: paymentWalletId,
      amount: requestedAmount,
    });
    if (!spendCheck.ok) {
      return { ok: false, reason: 'insufficient_balance', availableBalance: spendCheck.availableBalance };
    }
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, deferredCycleMonth: null, active: item.repeatMonthly === false ? false : item.active } : item
      )),
      trans: [
        {
          id: uid(),
          title: commitment.name,
          amt: -Math.abs(Number(commitment.amt) || 0),
          cat: commitment.cat || 'other',
          walletId: paymentWalletId,
          dateISO: entryDate,
          ts: Date.now(),
          scope: normalizeScope(commitment.scope, getEntryScope(get().cfg)),
          flowType: FLOW_TYPES.COMMITMENT_PAYMENT,
          transactionTag: 'commitment',
          isCommitmentPayment: true,
          commitmentId: id,
          commitmentMonth: paidMonth,
        },
        ...s.trans,
      ],
    }));
    await get().saveLocal();
    await get().syncCloud();
    return { ok: true, partial: false, appliedAmount: requestedAmount, requestedAmount };
  },

  addWallet: async (wallet) => {
    const cfg = get().cfg;
    const next = {
      id: uid(),
      name: wallet.name?.trim() || 'محفظة',
      nameEn: wallet.nameEn?.trim() || wallet.name?.trim() || 'Wallet',
      type: wallet.type || 'cash',
      currency: cfg.currency,
      scope: normalizeScope(wallet.scope, getEntryScope(cfg)),
      openingBalance: Number(wallet.openingBalance || 0),
    };
    set(s => ({ wallets: [...normalizeWallets(s.wallets, cfg.currency), next] }));
    await get().saveLocal();
    await get().syncCloud();
  },

  editWallet: async (id, patch) => {
    const { currency: _ignoredCurrency, ...safePatch } = patch || {};
    set(s => ({
      wallets: normalizeWallets(s.wallets, s.cfg.currency).map(wallet => (
        wallet.id === id
          ? { ...wallet, ...safePatch, currency: s.cfg.currency, openingBalance: Number(safePatch.openingBalance ?? wallet.openingBalance ?? 0) }
          : wallet
      )),
    }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteWallet: async (id) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    if (normalized.length <= 1 || !normalized.some(wallet => wallet.id === id)) return false;
    const fallback = normalized.find(wallet => wallet.id !== id && wallet.id === get().cfg.defaultWalletId)
      || normalized.find(wallet => wallet.id !== id)
      || normalized[0];
    set(s => ({
      wallets: normalized.filter(wallet => wallet.id !== id),
      cfg: {
        ...s.cfg,
        defaultWalletId: s.cfg.defaultWalletId === id ? fallback.id : getDefaultWalletId(normalized.filter(wallet => wallet.id !== id), s.cfg.currency, s.cfg.defaultWalletId),
      },
      trans: s.trans.map(tx => ({
        ...tx,
        walletId: tx.walletId === id ? fallback.id : tx.walletId,
        fromWalletId: tx.fromWalletId === id ? fallback.id : tx.fromWalletId,
        toWalletId: tx.toWalletId === id ? fallback.id : tx.toWalletId,
      })).filter(tx => tx.kind !== 'transfer' || tx.fromWalletId !== tx.toWalletId),
      commitments: s.commitments.map(item => item.walletId === id ? { ...item, walletId: fallback.id } : item),
    }));
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    await get().syncCloud();
    return true;
  },

  deleteWalletsMany: async (ids = []) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => normalized.some(wallet => wallet.id === id)));
    if (!selected.size || selected.size >= normalized.length) return false;
    const remaining = normalized.filter(wallet => !selected.has(wallet.id));
    const fallback = remaining.find(wallet => wallet.id === get().cfg.defaultWalletId) || remaining[0];
    set(s => ({
      wallets: remaining,
      cfg: {
        ...s.cfg,
        defaultWalletId: fallback.id,
      },
      trans: s.trans
        .map(tx => ({
          ...tx,
          walletId: selected.has(tx.walletId) ? fallback.id : tx.walletId,
          fromWalletId: selected.has(tx.fromWalletId) ? fallback.id : tx.fromWalletId,
          toWalletId: selected.has(tx.toWalletId) ? fallback.id : tx.toWalletId,
        }))
        .filter(tx => tx.kind !== 'transfer' || tx.fromWalletId !== tx.toWalletId),
      commitments: s.commitments.map(item => (
        selected.has(item.walletId) ? { ...item, walletId: fallback.id } : item
      )),
    }));
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    await get().syncCloud();
    return true;
  },

  setTransCatToOther: async (catId) => {
    set(s => ({ trans: s.trans.map(t => t.cat === catId ? { ...t, cat: 'other' } : t) }));
    await get().saveLocal();
    await get().syncCloud();
  },

  deleteCategoriesMany: async (ids = []) => {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => id && id !== 'other'));
    if (!selected.size) return false;
    set(s => {
      const categoryBudgets = { ...(s.cfg.categoryBudgets || {}) };
      selected.forEach(id => delete categoryBudgets[id]);
      return {
        cats: s.cats.filter(cat => !selected.has(cat.id)),
        trans: s.trans.map(item => selected.has(item.cat) ? { ...item, cat: 'other' } : item),
        commitments: s.commitments.map(item => selected.has(item.cat) ? { ...item, cat: 'other' } : item),
        cfg: { ...s.cfg, categoryBudgets },
      };
    });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },
});
