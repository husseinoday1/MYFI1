import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { commitmentCycleMonth, deferredCommitmentDueISO, monthKey, normalizeCommitments } from '../../lib/commitments';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import { buildCurrencyFields, buildEntityCurrencyFields, normalizeCurrencyCode } from '../../lib/financialCoreV2';
import { financialDataCount, syncCommitmentPaidMonth, uid } from '../domain';
import { getLedgerNamespace } from '../../lib/activeLedgerRepository';
import { commandWalletBalance, commandWalletPosition } from '../../lib/financialCommandBalances';
import { buildBalanceReconciliationPreview, buildTrackerTransactionTitle, TRANSACTION_SEMANTIC_KIND } from '../../lib/transactionSemantics';
import {
  commitEntityChangesV7,
  commitFinancialTransactionV7,
} from '../../lib/financialLedgerV7Repository';
const restoreArchivedItem = (item, active) => {
  const next = { ...item };
  const wasActive = item.archivedFromActive !== false;
  delete next.archivedAt;
  delete next.archivedFromActive;
  if (active) next.active = wasActive;
  return next;
};

const walletPositionForManagementCommand = (get, walletId) => commandWalletPosition({
  cutover: !!get().financialLedgerV7Cutover,
  namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
  walletId,
  wallets: get().wallets,
  transactions: get().trans,
  currency: get().cfg.currency,
  defaultWalletId: get().cfg.defaultWalletId,
});

const walletBalanceForManagementCommand = (get, walletId) => commandWalletBalance({
  cutover: !!get().financialLedgerV7Cutover,
  namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
  walletId,
  wallets: get().wallets,
  transactions: get().trans,
  currency: get().cfg.currency,
  defaultWalletId: get().cfg.defaultWalletId,
});

export const createManagementSlice = (set, get) => ({
  setCats: async (cats) => {
    const nextCats = Array.isArray(cats) ? cats : [];
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: nextCats.filter(item => item?.id).map(item => ({ entityType: 'category', id: item.id, payload: item })),
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_category_update_failed') });
      return false;
    }
    set({ cats: nextCats });
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  addCommitment: async (item) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const linkedTarget = item.linkedType === 'goal'
      ? get().goals.find(target => target.id === item.linkedId)
      : (item.linkedType === 'debt' || item.linkedType === 'receivable')
        ? get().debts.find(target => target.id === item.linkedId)
        : null;
    const entityCurrency = normalizeCurrencyCode(
      linkedTarget?.currencyCode || item.currencyCode || item.currency,
      get().cfg.currency,
    );
    const next = normalizeCommitments([{
      id: uid(),
      name: item.name,
      amt: item.amt,
      currencyCode: entityCurrency,
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
    }], defaultWalletId, entityCurrency)[0];
    if (!next || !next.amt) return false;
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'commitment', id: next.id, payload: next }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_create_failed') });
      return false;
    }
    set(s => ({ commitments: [next, ...normalizeCommitments(s.commitments, defaultWalletId)] }));
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  editCommitment: async (id, patch) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const current = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!current) return false;
    const next = normalizeCommitments([{
      ...current,
      ...(patch || {}),
      currencyCode: current.currencyCode || patch?.currencyCode,
    }], defaultWalletId, current.currencyCode || get().cfg.currency)[0];
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'commitment', id, payload: next }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_edit_failed') });
      return false;
    }
    set(s => ({ commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => item.id === id ? next : item) }));
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  deferCommitment: async (id, option = 'day') => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId, get().cfg.currency).find(item => item.id === id);
    if (!commitment || commitment.active === false) return false;
    const next = normalizeCommitments([{
      ...commitment,
      deferredUntilISO: deferredCommitmentDueISO(commitment, option),
      deferredCycleMonth: commitmentCycleMonth(commitment, new Date()),
    }], defaultWalletId, commitment.currencyCode || get().cfg.currency)[0];
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'commitment', id, payload: next }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_defer_failed') });
      return false;
    }
    set(s => ({ commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => item.id === id ? next : item) }));
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  clearCommitmentDeferral: async (id) => {
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId, get().cfg.currency).find(item => item.id === id);
    if (!commitment) return false;
    const next = normalizeCommitments([{ ...commitment, deferredUntilISO: null, deferredCycleMonth: null }], defaultWalletId, commitment.currencyCode || get().cfg.currency)[0];
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'commitment', id, payload: next }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_deferral_clear_failed') });
      return false;
    }
    set(s => ({ commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => item.id === id ? next : item) }));
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  deleteCommitment: async (id) => {
    const current = get().commitments.find(item => item.id === id);
    if (!current) return false;
    const deletedAt = new Date().toISOString();
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        changes: [{ entityType: 'commitment', id, deletedAt, payload: { ...current, deletedAt, active: false } }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_delete_failed') });
      return false;
    }
    // Deleting tracker metadata must never delete posted financial history.
    set(s => ({ commitments: s.commitments.filter(item => item.id !== id) }));
    await get().saveLocal({ force: true });
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  archiveTracker: async (kind, sourceId) => {
    if (!sourceId) return false;
    const archivedAt = today();
    const current = get();
    const debtKinds = kind === 'owed' || kind === 'receivable';
    const debts = debtKinds
      ? current.debts.map(item => item.id === sourceId ? { ...item, archivedAt } : item)
      : current.debts;
    const goals = kind === 'saving'
      ? current.goals.map(item => item.id === sourceId ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false } : item)
      : current.goals;
    const commitments = current.commitments.map(item => {
      if (kind === 'monthly' && item.id === sourceId) return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
      if (debtKinds && (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === sourceId) {
        return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
      }
      if (kind === 'saving' && item.linkedType === 'goal' && item.linkedId === sourceId) {
        return { ...item, archivedAt, archivedFromActive: item.active !== false, active: false };
      }
      return item;
    });
    const changes = [
      ...debts.filter((item, index) => item !== current.debts[index]).map(payload => ({ entityType: 'debt', id: payload.id, payload })),
      ...goals.filter((item, index) => item !== current.goals[index]).map(payload => ({ entityType: 'goal', id: payload.id, payload })),
      ...commitments.filter((item, index) => item !== current.commitments[index]).map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
    ];
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg), changes,
    });
    if (committed.supported && !committed.ok) return false;
    set({ debts, goals, commitments });
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  restoreTracker: async (kind, sourceId) => {
    if (!sourceId) return false;
    const current = get();
    const debtKinds = kind === 'owed' || kind === 'receivable';
    const debts = debtKinds
      ? current.debts.map(item => item.id === sourceId ? restoreArchivedItem(item, false) : item)
      : current.debts;
    const goals = kind === 'saving'
      ? current.goals.map(item => item.id === sourceId ? restoreArchivedItem(item, item.status !== 'released') : item)
      : current.goals;
    const commitments = current.commitments.map(item => {
      const linkedToDebt = debtKinds && (item.linkedType === 'debt' || item.linkedType === 'receivable') && item.linkedId === sourceId;
      const linkedToGoal = kind === 'saving' && item.linkedType === 'goal' && item.linkedId === sourceId;
      if (kind === 'monthly' && item.id === sourceId) return restoreArchivedItem(item, true);
      if (linkedToDebt || linkedToGoal) return restoreArchivedItem(item, true);
      return item;
    });
    const changes = [
      ...debts.filter((item, index) => item !== current.debts[index]).map(payload => ({ entityType: 'debt', id: payload.id, payload })),
      ...goals.filter((item, index) => item !== current.goals[index]).map(payload => ({ entityType: 'goal', id: payload.id, payload })),
      ...commitments.filter((item, index) => item !== current.commitments[index]).map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
    ];
    const committed = await commitEntityChangesV7({ namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg), changes });
    if (committed.supported && !committed.ok) return false;
    set({ debts, goals, commitments });
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  archiveTrackersMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);
    if (!rows.length) return false;
    const current = get();
    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));
    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));
    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));
    const archivedAt = today();
    const debts = current.debts.map(item => debtIds.has(item.id) ? { ...item, archivedAt } : item);
    const goals = current.goals.map(item => goalIds.has(item.id) ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false } : item);
    const commitments = current.commitments.map(item => {
      const selected = commitmentIds.has(item.id);
      const debtLinked = (item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId);
      const goalLinked = item.linkedType === 'goal' && goalIds.has(item.linkedId);
      return selected || debtLinked || goalLinked
        ? { ...item, archivedAt, archivedFromActive: item.active !== false, active: false }
        : item;
    });
    const changes = [
      ...debts.filter((item, index) => item !== current.debts[index]).map(payload => ({ entityType: 'debt', id: payload.id, payload })),
      ...goals.filter((item, index) => item !== current.goals[index]).map(payload => ({ entityType: 'goal', id: payload.id, payload })),
      ...commitments.filter((item, index) => item !== current.commitments[index]).map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
    ];
    const committed = await commitEntityChangesV7({ namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg), changes });
    if (committed.supported && !committed.ok) return false;
    set({ debts, goals, commitments });
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  deleteTrackersMany: async (items = []) => {
    const rows = (Array.isArray(items) ? items : []).filter(item => item?.sourceId && item?.kind);
    if (!rows.length) return false;
    const current = get();
    const debtIds = new Set(rows.filter(item => item.kind === 'owed' || item.kind === 'receivable').map(item => item.sourceId));
    const goalIds = new Set(rows.filter(item => item.kind === 'saving').map(item => item.sourceId));
    const commitmentIds = new Set(rows.filter(item => item.kind === 'monthly').map(item => item.sourceId));
    const linkedCommitmentIds = new Set(current.commitments.filter(item => (
      commitmentIds.has(item.id)
      || ((item.linkedType === 'debt' || item.linkedType === 'receivable') && debtIds.has(item.linkedId))
      || (item.linkedType === 'goal' && goalIds.has(item.linkedId))
    )).map(item => item.id));
    const deletedAt = new Date().toISOString();
    const changes = [
      ...current.debts.filter(item => debtIds.has(item.id)).map(item => ({ entityType: 'debt', id: item.id, deletedAt, payload: { ...item, deletedAt } })),
      ...current.goals.filter(item => goalIds.has(item.id)).map(item => ({ entityType: 'goal', id: item.id, deletedAt, payload: { ...item, deletedAt, active: false } })),
      ...current.commitments.filter(item => linkedCommitmentIds.has(item.id)).map(item => ({ entityType: 'commitment', id: item.id, deletedAt, payload: { ...item, deletedAt, active: false } })),
    ];
    const committed = await commitEntityChangesV7({ namespace: getLedgerNamespace(current.workspaceNamespace, current.cfg), changes });
    if (committed.supported && !committed.ok) return false;
    // Metadata removal is separate from ledger history. Posted payments remain.
    set({
      commitments: current.commitments.filter(item => !linkedCommitmentIds.has(item.id)),
      debts: current.debts.filter(item => !debtIds.has(item.id)),
      goals: current.goals.filter(item => !goalIds.has(item.id)),
    });
    await get().saveLocal({ force: true });
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  payCommitment: async (id, dateISO = today(), walletId = null, cycleMonth = null, meta = {}) => {
    const entryDate = normalizeDate(dateISO);
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const commitment = normalizeCommitments(get().commitments, defaultWalletId).find(item => item.id === id);
    if (!commitment || !commitment.active || !commitment.amt) return { ok: false, reason: 'not_found' };
    const paymentWalletId = walletId || defaultWalletId || commitment.walletId;
    const paidMonth = cycleMonth || commitmentCycleMonth(commitment, new Date(`${entryDate}T12:00:00`));
    if (commitment.lastPaidMonth === paidMonth) return { ok: false, reason: 'already_paid' };
    const linkedType = commitment.linkedType || 'none';
    const linkedId = commitment.linkedId || null;
    const linkedTarget = linkedType === 'goal'
      ? get().goals.find(target => target.id === linkedId)
      : (linkedType === 'debt' || linkedType === 'receivable')
        ? get().debts.find(target => target.id === linkedId)
        : null;
    if (linkedType !== 'none' && (!linkedId || !linkedTarget)) {
      // Financial links are identities, not labels. Never relink by name or by "only candidate" heuristics.
      return { ok: false, reason: 'linked_reference_review_required' };
    }
    if (linkedTarget?.archivedAt || ['released', 'settled'].includes(linkedTarget?.status)) {
      return { ok: false, reason: 'linked_unavailable' };
    }
    if (linkedTarget && normalizeCurrencyCode(linkedTarget.currencyCode, get().cfg.currency) !== normalizeCurrencyCode(commitment.currencyCode, get().cfg.currency)) {
      return { ok: false, reason: 'linked_currency_mismatch' };
    }
    const requestedAmount = Math.abs(Number(commitment.amt) || 0);
    const linkedMeta = {
      ...meta,
      title: commitment.name,
      cat: commitment.cat || 'other',
      scope: normalizeScope(commitment.scope, getEntryScope(get().cfg)),
      isCommitmentPayment: true,
      commitmentId: id,
      commitmentMonth: paidMonth,
      commitmentLinkedType: linkedType,
      commitmentLinkedId: linkedId,
      commitmentNameSnapshot: commitment.name,
      transactionTag: 'commitment',
    };
    const paidCommitment = normalizeCommitments([{
      ...commitment,
      linkedId,
      lastPaidMonth: paidMonth,
      deferredUntilISO: null,
      deferredCycleMonth: null,
      active: commitment.repeatMonthly === false ? false : commitment.active,
    }], defaultWalletId, commitment.currencyCode || get().cfg.currency)[0];
    linkedMeta.financialEntityChanges = [{
      entityType: 'commitment', id, payload: paidCommitment,
    }];
    if ((linkedType === 'debt' || linkedType === 'receivable') && linkedId) {
      const applied = await get().payDebt(linkedId, commitment.amt, entryDate, paymentWalletId, linkedMeta);
      if (!applied) return { ok: false, reason: 'linked_unavailable' };
      set(s => ({
        commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
          item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, deferredCycleMonth: null, active: item.repeatMonthly === false ? false : item.active } : item
        )),
      }));
      await get().saveLocal();
      get().scheduleCloudSync?.('management_change');
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
      get().scheduleCloudSync?.('management_change');
      return { ok: true, partial: applied < requestedAmount - 0.0001, appliedAmount: applied, requestedAmount };
    }
    let currencyFields;
    try {
      currencyFields = buildEntityCurrencyFields({
        entityAmount: -requestedAmount,
        entityCurrency: commitment.currencyCode || get().cfg.currency,
        walletId: paymentWalletId,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityBaseRate: meta.entityBaseRate,
        walletBaseRate: meta.walletBaseRate ?? meta.exchangeRate,
      });
    } catch (error) {
      set({ ledgerError: String(error?.message || 'commitment_payment_fx_required') });
      return { ok: false, reason: String(error?.message || 'fx_required') };
    }
    const paymentPosition = await walletPositionForManagementCommand(get, paymentWalletId);
    const paymentAvailable = Number(paymentPosition?.availableBalance);
    const paymentNativeAmount = Math.abs(Number(currencyFields.walletAmount || 0));
    const paymentTx = {
      id: uid(),
      title: buildTrackerTransactionTitle({
        kind: TRANSACTION_SEMANTIC_KIND.COMMITMENT_PAYMENT,
        entityName: commitment.name,
        lang: get().cfg.lang,
      }),
      titleSource: 'generated',
      entityNameSnapshot: commitment.name,
      entityTypeSnapshot: 'commitment',
      commitmentNameSnapshot: commitment.name,
      amt: currencyFields.baseAmount,
      ...currencyFields,
      balanceWarning: !Number.isFinite(paymentAvailable) || paymentNativeAmount > paymentAvailable + 0.0001,
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
      rateDate: entryDate,
      rateSource: currencyFields.fxSnapshotSource,
      idempotencyKey: `commitment-payment:${id}:${paidMonth}`,
    };
    try {
      const committed = await commitFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: paymentTx,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityChanges: [{ entityType: 'commitment', id, payload: paidCommitment }],
      });
      if (committed.supported && !committed.ok) return { ok: false, reason: 'sqlite_commit_failed' };
      if (committed.ok) {
        paymentTx.id = committed.transactionId;
        paymentTx.storageEngineVersion = 7;
        paymentTx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_commitment_payment_failed') });
      return { ok: false, reason: 'sqlite_commit_failed' };
    }
    set(s => ({
      commitments: normalizeCommitments(s.commitments, defaultWalletId).map(item => (
        item.id === id ? { ...item, lastPaidMonth: paidMonth, deferredUntilISO: null, deferredCycleMonth: null, active: item.repeatMonthly === false ? false : item.active } : item
      )),
      trans: [paymentTx, ...s.trans],
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return { ok: true, partial: false, appliedAmount: requestedAmount, requestedAmount };
  },

  addWallet: async (wallet) => {
    const cfg = get().cfg;
    const walletCurrency = String(wallet.currency || cfg.currency || 'IQD').toUpperCase();
    const valuationRate = Number(wallet.valuationRate);
    if (walletCurrency !== cfg.currency && !(Number.isFinite(valuationRate) && valuationRate > 0)) return false;
    const safeRate = walletCurrency === cfg.currency ? 1 : valuationRate;
    const openingBalance = Number(wallet.openingBalance || 0);
    const next = {
      id: uid(),
      name: wallet.name?.trim() || 'محفظة',
      nameEn: wallet.nameEn?.trim() || wallet.name?.trim() || 'Wallet',
      type: wallet.type || 'cash',
      currency: walletCurrency,
      valuationRate: walletCurrency === cfg.currency ? 1 : safeRate,
      valuationUpdatedAt: walletCurrency === cfg.currency ? null : new Date().toISOString(),
      // New wallets use a ledger opening entry instead of a mutable magic balance.
      // Existing wallets remain in legacy mode until an explicit migration is performed.
      openingBalance: 0,
      openingBaseBalance: 0,
      openingBalanceMode: 'ledger',
      scope: normalizeScope(wallet.scope, getEntryScope(cfg)),
    };
    const openingFields = buildCurrencyFields({
      amount: openingBalance,
      walletId: next.id,
      wallets: [next],
      baseCurrency: cfg.currency,
      exchangeRate: walletCurrency === cfg.currency ? 1 : safeRate,
    });
    const openingTx = openingBalance === 0 ? null : {
      id: uid(),
      title: buildTrackerTransactionTitle({
        kind: TRANSACTION_SEMANTIC_KIND.OPENING_BALANCE,
        entityName: next.name,
        lang: cfg.lang,
      }),
      titleSource: 'generated', walletNameSnapshot: next.name,
      amt: openingFields.baseAmount,
      ...openingFields,
      walletId: next.id,
      cat: 'other',
      dateISO: today(),
      ts: Date.now(),
      scope: next.scope,
      flowType: FLOW_TYPES.OPENING_BALANCE,
      transactionTag: 'opening_balance',
      isOpeningBalance: true,
      note: '',
      rateDate: today(),
      rateSource: walletCurrency === cfg.currency ? 'same_currency' : 'user_entered_opening',
      idempotencyKey: `opening-balance:${next.id}`,
    };
    try {
      const namespace = getLedgerNamespace(get().workspaceNamespace, cfg);
      const entityChanges = [{ entityType: 'wallet', id: next.id, payload: next }];
      const committed = openingTx
        ? await commitFinancialTransactionV7({
            namespace, transaction: openingTx, wallets: [next], baseCurrency: cfg.currency, entityChanges,
          })
        : await commitEntityChangesV7({ namespace, changes: entityChanges });
      if (committed.supported && !committed.ok) return false;
      if (openingTx && committed.ok) {
        openingTx.id = committed.transactionId;
        openingTx.storageEngineVersion = 7;
        openingTx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_wallet_create_failed') });
      return false;
    }
    set(s => ({
      wallets: [...normalizeWallets(s.wallets, cfg.currency), next],
      trans: openingTx ? [openingTx, ...s.trans] : s.trans,
    }));
    await get().saveLocal();
    get().scheduleCloudSync?.('wallet_add');
    return next;
  },

  reconcileWalletBalance: async (id, actualBalance, dateISO = today(), note = '', exchangeRate = null, review = {}) => {
    const cfg = get().cfg;
    const wallets = normalizeWallets(get().wallets, cfg.currency);
    const wallet = wallets.find(item => item.id === id);
    const actual = Number(actualBalance);
    if (!wallet || !Number.isFinite(actual)) return { ok: false, reason: 'invalid_balance' };
    const current = await walletBalanceForManagementCommand(get, id);
    if (!current) return { ok: false, reason: 'wallet_not_found' };
    const preview = buildBalanceReconciliationPreview({
      recordedBalance: current.balance,
      actualBalance: actual,
      currency: wallet.currency,
    });
    if (!preview.valid) return { ok: false, reason: 'invalid_balance' };
    const difference = preview.difference;
    if (preview.status === 'matched') return { ok: true, noChange: true, difference: 0 };
    if (review?.confirmedUnresolved !== true) {
      return { ok: false, reason: 'reconciliation_review_required', preview };
    }
    const explicitRate = Number(exchangeRate);
    if (wallet.currency !== cfg.currency && !(Number.isFinite(explicitRate) && explicitRate > 0)) {
      return { ok: false, reason: 'historical_fx_required' };
    }
    const rate = wallet.currency === cfg.currency ? 1 : explicitRate;
    const fields = buildCurrencyFields({
      amount: difference,
      walletId: id,
      wallets,
      baseCurrency: cfg.currency,
      exchangeRate: rate,
      walletCurrency: wallet.currency,
    });
    const tx = {
      id: uid(),
      title: buildTrackerTransactionTitle({
        kind: TRANSACTION_SEMANTIC_KIND.BALANCE_ADJUSTMENT,
        entityName: wallet.name,
        lang: cfg.lang,
      }),
      titleSource: 'generated', walletNameSnapshot: wallet.name,
      amt: fields.baseAmount,
      ...fields,
      walletId: id,
      cat: 'other',
      dateISO: normalizeDate(dateISO),
      ts: Date.now(),
      scope: normalizeScope(wallet.scope, getEntryScope(cfg)),
      flowType: FLOW_TYPES.BALANCE_ADJUSTMENT,
      transactionTag: 'balance_adjustment',
      isBalanceAdjustment: true,
      note: String(note || '').trim(),
      reconciliationFrom: Number(current.balance || 0),
      reconciliationTo: actual,
      reconciliationReviewedAt: review.reviewedAt || new Date().toISOString(),
      reconciliationReason: String(review.reason || 'unresolved_after_review'),
      rateDate: normalizeDate(dateISO),
      rateSource: wallet.currency === cfg.currency ? 'same_currency' : 'user_entered_reconciliation',
      idempotencyKey: `balance-adjustment:${uid()}`,
    };
    try {
      const committed = await commitFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, cfg),
        transaction: tx,
        wallets,
        baseCurrency: cfg.currency,
      });
      if (committed.supported && !committed.ok) return { ok: false, reason: 'sqlite_commit_failed' };
      if (committed.ok) {
        tx.id = committed.transactionId;
        tx.storageEngineVersion = 7;
        tx.sqliteCommittedAt = committed.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_reconciliation_failed') });
      return { ok: false, reason: 'sqlite_commit_failed' };
    }
    set(state => ({ trans: [tx, ...state.trans] }));
    await get().saveLocal();
    get().scheduleCloudSync?.('wallet_reconciliation');
    return { ok: true, difference, transactionId: tx.id };
  },

  editWallet: async (id, patch) => {
    const cfg = get().cfg;
    const current = normalizeWallets(get().wallets, cfg.currency).find(wallet => wallet.id === id);
    if (!current) return false;
    const requestedCurrency = String(patch?.currency || current.currency || cfg.currency).toUpperCase();
    const hasHistory = get().trans.some(tx => tx.walletId === id || tx.fromWalletId === id || tx.toWalletId === id);
    if (hasHistory && requestedCurrency !== current.currency) return false;
    const valuationRate = Number(patch?.valuationRate ?? current.valuationRate);
    if (requestedCurrency !== cfg.currency && !(Number.isFinite(valuationRate) && valuationRate > 0)) return false;
    const safeRate = requestedCurrency === cfg.currency ? 1 : valuationRate;
    const ledgerOpening = current.openingBalanceMode === 'ledger';
    const openingBalance = ledgerOpening
      ? Number(current.openingBalance || 0)
      : Number(patch?.openingBalance ?? current.openingBalance ?? 0);
    const next = {
      ...current,
      ...(patch || {}),
      currency: requestedCurrency,
      valuationRate: safeRate,
      valuationUpdatedAt: requestedCurrency === cfg.currency
        ? null
        : (Object.prototype.hasOwnProperty.call(patch || {}, 'valuationRate') ? new Date().toISOString() : current.valuationUpdatedAt || null),
      openingBalance,
      openingBalanceMode: ledgerOpening ? 'ledger' : 'legacy',
      openingBaseBalance: ledgerOpening
        ? Number(current.openingBaseBalance || 0)
        : requestedCurrency === cfg.currency
          ? openingBalance
          : Number(patch?.openingBaseBalance ?? openingBalance * safeRate),
    };
    try {
      const committed = await commitEntityChangesV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, cfg),
        changes: [{ entityType: 'wallet', id, payload: next }],
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_wallet_edit_failed') });
      return false;
    }
    set(state => ({ wallets: normalizeWallets(state.wallets, state.cfg.currency).map(wallet => wallet.id === id ? next : wallet) }));
    await get().saveLocal();
    get().scheduleCloudSync?.('wallet_edit');
    return true;
  },

  deleteWallet: async (id) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    const currentWallet = normalized.find(wallet => wallet.id === id);
    if (normalized.length <= 1 || !currentWallet) return false;
    const hasHistory = get().trans.some(tx => tx.walletId === id || tx.fromWalletId === id || tx.toWalletId === id);
    if (hasHistory) return false;
    const fallback = normalized.find(wallet => wallet.id !== id && wallet.id === get().cfg.defaultWalletId)
      || normalized.find(wallet => wallet.id !== id)
      || normalized[0];
    const nextCommitments = get().commitments.map(item => item.walletId === id ? { ...item, walletId: fallback.id } : item);
    const changedCommitments = nextCommitments.filter((item, index) => item !== get().commitments[index]);
    const deletedAt = new Date().toISOString();
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
      changes: [
        { entityType: 'wallet', id, deletedAt, payload: { ...currentWallet, deletedAt, status: 'deleted' } },
        ...changedCommitments.map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
      ],
    });
    if (committed.supported && !committed.ok) return false;
    const remaining = normalized.filter(wallet => wallet.id !== id);
    set(state => ({
      wallets: remaining,
      cfg: {
        ...state.cfg,
        defaultWalletId: state.cfg.defaultWalletId === id ? fallback.id : getDefaultWalletId(remaining, state.cfg.currency, state.cfg.defaultWalletId),
      },
      commitments: nextCommitments,
    }));
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  deleteWalletsMany: async (ids = []) => {
    const normalized = normalizeWallets(get().wallets, get().cfg.currency);
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => normalized.some(wallet => wallet.id === id)));
    if (!selected.size || selected.size >= normalized.length) return false;
    const hasHistory = get().trans.some(tx => selected.has(tx.walletId) || selected.has(tx.fromWalletId) || selected.has(tx.toWalletId));
    if (hasHistory) return false;
    const remaining = normalized.filter(wallet => !selected.has(wallet.id));
    const fallback = remaining.find(wallet => wallet.id === get().cfg.defaultWalletId) || remaining[0];
    const nextCommitments = get().commitments.map(item => selected.has(item.walletId) ? { ...item, walletId: fallback.id } : item);
    const changedCommitments = nextCommitments.filter((item, index) => item !== get().commitments[index]);
    const deletedAt = new Date().toISOString();
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
      changes: [
        ...normalized.filter(wallet => selected.has(wallet.id)).map(wallet => ({ entityType: 'wallet', id: wallet.id, deletedAt, payload: { ...wallet, deletedAt, status: 'deleted' } })),
        ...changedCommitments.map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
      ],
    });
    if (committed.supported && !committed.ok) return false;
    set(state => ({
      wallets: remaining,
      cfg: { ...state.cfg, defaultWalletId: fallback.id },
      commitments: nextCommitments,
    }));
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    get().scheduleCloudSync?.('management_change');
    return true;
  },

  setTransCatToOther: async () => {
    // Historical category identity is immutable. Category retirement is handled
    // by deleteCategoriesMany without rewriting posted transactions.
    return false;
  },

  deleteCategoriesMany: async (ids = []) => {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(id => id && id !== 'other'));
    if (!selected.size) return false;
    const archivedAt = new Date().toISOString();
    const cats = get().cats.map(cat => selected.has(cat.id) ? { ...cat, archivedAt, status: 'archived' } : cat);
    const commitments = get().commitments.map(item => selected.has(item.cat) ? { ...item, categoryArchived: true } : item);
    const categoryChanges = cats.filter(cat => selected.has(cat.id)).map(payload => ({ entityType: 'category', id: payload.id, payload }));
    const commitmentChanges = commitments.filter((item, index) => item !== get().commitments[index]).map(payload => ({ entityType: 'commitment', id: payload.id, payload }));
    const committed = await commitEntityChangesV7({
      namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
      changes: [...categoryChanges, ...commitmentChanges],
    });
    if (committed.supported && !committed.ok) return false;
    // Keep historical category IDs and old budget references intact. Archived
    // categories disappear from new-entry pickers but remain resolvable in history.
    set({ cats, commitments });
    await get().saveLocal();
    get().scheduleCloudSync?.('management_change');
    return true;
  },
});
