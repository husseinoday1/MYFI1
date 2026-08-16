import { today, normalizeDate } from '../../utils/calc';
import { getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { monthKey } from '../../lib/commitments';
import { FLOW_TYPES, getEntryScope, normalizeScope } from '../../lib/modules';
import { inferTransactionTag } from '../../lib/transactionTags';
import {
  capLinkedAmount,
  debtPaidTotal,
  financialDataCount,
  goalSavedTotal,
  syncCommitmentPaidMonth,
  uid,
} from '../domain';
import { debtLifecycle, goalLifecycle, reopenCompletionCommitments } from '../../lib/trackerLifecycle';
import { buildCurrencyFields, buildEntityCurrencyFields, buildTransferCurrencyFields } from '../../lib/financialCoreV2';
import { getLedgerNamespace } from '../../lib/activeLedgerRepository';
import { commandWalletPosition } from '../../lib/financialCommandBalances';
import {
  commitExpenseToFinancialLedgerV7,
  commitFinancialTransactionV7,
  replaceFinancialTransactionV7,
  voidFinancialTransactionsV7,
} from '../../lib/financialLedgerV7Repository';

const walletPositionForCommand = (get, walletId, excludeTransaction = null) => commandWalletPosition({
  cutover: !!get().financialLedgerV7Cutover,
  namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
  walletId,
  wallets: get().wallets,
  transactions: get().trans,
  currency: get().cfg.currency,
  defaultWalletId: get().cfg.defaultWalletId,
  excludeTransaction,
});

export const createTransactionSlice = (set, get) => ({
  addTrans: async (t) => {
    const id = uid();
    const defaultWalletId = getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    const cat = get().cats.find(item => item.id === t.cat) || get().cats.find(item => item.id === 'other') || {};
    const catLabel = (get().cfg.lang === 'ar' ? cat.label : cat.labelEn) || cat.label || cat.labelEn || '';
    const defaultTitle = Number(t.amt || 0) >= 0
      ? (get().cfg.lang === 'ar' ? `دخل - ${catLabel || 'عام'}` : `Income - ${catLabel || 'General'}`)
      : (get().cfg.lang === 'ar' ? `مصروف - ${catLabel || 'عام'}` : `Expense - ${catLabel || 'General'}`);
    const walletId = t.walletId || defaultWalletId;
    const selectedWallet = get().wallets.find(item => item.id === walletId) || null;
    const selectedWalletCurrency = String(selectedWallet?.currency || get().cfg.currency || 'IQD').toUpperCase();
    const baseCurrency = String(get().cfg.currency || 'IQD').toUpperCase();
    const explicitRate = Number(t.exchangeRate);
    // A current wallet valuation is never a historical transaction rate.
    // Foreign entries must arrive at the command boundary with an explicit,
    // user-confirmed snapshot rate.
    const resolvedExchangeRate = selectedWalletCurrency === baseCurrency
      ? 1
      : Number.isFinite(explicitRate) && explicitRate > 0
        ? explicitRate
        : null;
    if (selectedWalletCurrency !== baseCurrency && !resolvedExchangeRate) return false;
    const currencyFields = buildCurrencyFields({
      amount: Number(t.walletAmount ?? t.amt ?? 0),
      walletId,
      wallets: get().wallets,
      baseCurrency: get().cfg.currency,
      exchangeRate: resolvedExchangeRate || 1,
      walletCurrency: t.walletCurrency || t.currencyCode,
    });
    const tx = {
      ...t,
      id,
      scope: normalizeScope(t.scope, getEntryScope(get().cfg)),
      flowType: t.flowType || (Number(t.amt || 0) >= 0 ? FLOW_TYPES.INCOME : FLOW_TYPES.EXPENSE),
      transactionTag: inferTransactionTag(t),
      title: String(t.title || '').trim() || defaultTitle,
      walletId,
      ...currencyFields,
      rateDate: t.rateDate || t.dateISO || today(),
      rateSource: t.rateSource || (selectedWalletCurrency === baseCurrency ? 'same_currency' : 'user_entered'),
      idempotencyKey: t.idempotencyKey || `expense-or-income:${id}`,
      // amt remains the base/reporting value for compatibility with existing reports.
      amt: currencyFields.baseAmount,
      recurringGroupId: t.recurring ? (t.recurringGroupId || t.id || id) : t.recurringGroupId,
      ts: Date.now(),
      dateISO: t.dateISO || today(),
    };
    if (Number(currencyFields.walletAmount || 0) < 0) {
      const position = await walletPositionForCommand(get, tx.walletId);
      const available = Number(position?.availableBalance);
      tx.balanceWarning = !Number.isFinite(available)
        || Math.abs(Number(currencyFields.walletAmount || 0)) > available + 0.0001;
    }
    let v7Commit = null;
    if (tx.kind !== 'transfer') {
      try {
        const commitArgs = {
          namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
          transaction: tx,
          baseCurrency: get().cfg.currency,
        };
        const recurringEntityChanges = tx.recurring ? [{
          entityType: 'recurring_rule',
          id: String(tx.recurringGroupId || tx.id),
          payload: {
            id: String(tx.recurringGroupId || tx.id),
            ledgerId: get().workspaceNamespace,
            type: tx.flowType,
            amount: Math.abs(Number(tx.walletAmount ?? tx.amt ?? 0)),
            currencyCode: tx.walletCurrency || selectedWalletCurrency,
            walletId: tx.walletId,
            categoryId: tx.cat || 'other',
            schedule: 'monthly',
            timezonePolicy: 'local_date',
            startDate: tx.dateISO,
            endDate: null,
            nextOccurrence: null,
            status: 'active',
            revision: 1,
            sourceTransactionId: tx.id,
          },
        }] : [];
        v7Commit = tx.flowType === FLOW_TYPES.EXPENSE && !recurringEntityChanges.length
          ? await commitExpenseToFinancialLedgerV7({ ...commitArgs, wallet: selectedWallet })
          : await commitFinancialTransactionV7({
              ...commitArgs,
              wallets: [selectedWallet].filter(Boolean),
              entityChanges: recurringEntityChanges,
            });
        if (v7Commit.supported && !v7Commit.ok) return false;
        if (v7Commit.ok) {
          tx.id = v7Commit.transactionId;
          tx.storageEngineVersion = 7;
          tx.sqliteCommittedAt = v7Commit.committedAt || new Date().toISOString();
        }
      } catch (error) {
        set({ ledgerError: String(error?.message || 'financial_v7_transaction_commit_failed') });
        return false;
      }
    }
    set(s => ({
      trans: [tx, ...s.trans],
      ...(v7Commit?.ok ? { financialLedgerV7Ready: true, ledgerError: null } : {}),
    }));
    try {
      await get().saveLocal();
    } catch (error) {
      if (!v7Commit?.ok) throw error;
      // SQLite already committed the financial truth. A compatibility Vault
      // failure must be retried, never used to roll back or hide the expense.
      set({ dirty: true, ledgerError: 'compatibility_snapshot_retry_required' });
    }
    get().scheduleCloudSync?.('transaction_change');
    return true;

  },

  duplicateTrans: async (id) => {
    const current = get().trans.find(item => item.id === id);
    if (!current || current.isDebtPayment || current.isGoalSaving || current.isCommitmentPayment) return false;
    if (current.kind === 'transfer') {
      return get().addTransfer({
        fromWalletId: current.fromWalletId,
        toWalletId: current.toWalletId,
        amount: current.transferFromAmount ?? current.transferAmount,
        toAmount: current.transferToAmount,
        exchangeRate: current.transferRate ?? current.exchangeRate,
        feeAmount: current.feeAmount || 0,
        fromBaseRate: current.fromBaseRate,
        toBaseRate: current.toBaseRate,
        dateISO: today(),
        note: current.note || '',
      });
    }
    return get().addTrans({
      title: current.title,
      amt: current.walletAmount ?? current.amt,
      walletAmount: current.walletAmount ?? current.amt,
      walletCurrency: current.walletCurrency ?? current.currencyCode,
      exchangeRate: current.exchangeRate,
      cat: current.cat,
      walletId: current.walletId,
      note: current.note || '',
      scope: current.scope,
      dateISO: today(),
    });
  },

  addTransfer: async ({ fromWalletId, toWalletId, amount, toAmount = null, exchangeRate = null, feeAmount = 0, fromBaseRate = null, toBaseRate = null, dateISO = today(), note = '' }) => {
    const n = Number(amount);
    const normalizedWallets = normalizeWallets(get().wallets, get().cfg.currency);
    const walletIds = new Set(normalizedWallets.map(wallet => wallet.id));
    if (!Number.isFinite(n) || n <= 0 || !fromWalletId || !toWalletId || fromWalletId === toWalletId) return false;
    if (!walletIds.has(fromWalletId) || !walletIds.has(toWalletId)) return false;
    const sourceBalance = (await walletPositionForCommand(get, fromWalletId))?.availableBalance;
    let fields;
    try {
      fields = buildTransferCurrencyFields({
        fromWalletId,
        toWalletId,
        fromAmount: n,
        toAmount,
        wallets: normalizedWallets,
        baseCurrency: get().cfg.currency,
        exchangeRate,
        feeAmount,
        fromBaseRate,
        toBaseRate,
      });
    } catch {
      return false;
    }
    const fromWallet = normalizedWallets.find(wallet => wallet.id === fromWalletId);
    const toWallet = normalizedWallets.find(wallet => wallet.id === toWalletId);
    const entryDate = normalizeDate(dateISO);
    const sourceScope = normalizeScope(fromWallet?.scope, getEntryScope(get().cfg));
    const targetScope = normalizeScope(toWallet?.scope, getEntryScope(get().cfg));
    const tx = {
      id: uid(),
      title: 'تحويل بين المحافظ',
      amt: 0,
      cat: 'other',
      kind: 'transfer',
      flowType: FLOW_TYPES.TRANSFER,
      transactionTag: 'transfer',
      scope: sourceScope,
      fromScope: sourceScope,
      toScope: targetScope,
      transferAmount: fields.transferFromAmount,
      ...fields,
      fromWalletId,
      toWalletId,
      note,
      dateISO: entryDate,
      ts: Date.now(),
      rateDate: entryDate,
      rateSource: fromWallet?.currency === toWallet?.currency ? 'same_currency' : 'user_entered',
      idempotencyKey: `transfer:${uid()}`,
      balanceWarning: !Number.isFinite(sourceBalance) || (fields.transferFromAmount + fields.feeAmount) > sourceBalance + 0.0001,
    };
    let v7Commit = null;
    try {
      v7Commit = await commitFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: tx,
        wallets: [fromWallet, toWallet].filter(Boolean),
        baseCurrency: get().cfg.currency,
      });
      if (v7Commit.supported && !v7Commit.ok) return false;
      if (v7Commit.ok) {
        tx.id = v7Commit.transactionId;
        tx.storageEngineVersion = 7;
        tx.sqliteCommittedAt = v7Commit.committedAt || new Date().toISOString();
      }
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_transfer_commit_failed') });
      return false;
    }
    set(s => ({
      trans: [tx, ...s.trans],
      ...(v7Commit?.ok ? { financialLedgerV7Ready: true, ledgerError: null } : {}),
    }));
    try {
      await get().saveLocal();
    } catch (error) {
      if (!v7Commit?.ok) throw error;
      set({ dirty: true, ledgerError: 'compatibility_snapshot_retry_required' });
    }
    get().scheduleCloudSync?.('transaction_transfer');
    return true;
  },

  editTrans: async (id, patch) => {
    const current = get().trans.find(t => t.id === id);
    if (!current) return;
    const safePatch = { ...patch };
    if (current.kind === 'transfer' || safePatch.kind === 'transfer') {
      const fromWalletId = safePatch.fromWalletId || current.fromWalletId;
      const toWalletId = safePatch.toWalletId || current.toWalletId;
      const transferAmount = Number(safePatch.transferAmount ?? current.transferAmount);
      const normalizedWallets = normalizeWallets(get().wallets, get().cfg.currency);
      const fromWallet = normalizedWallets.find(wallet => wallet.id === fromWalletId);
      const toWallet = normalizedWallets.find(wallet => wallet.id === toWalletId);
      if (!Number.isFinite(transferAmount) || transferAmount <= 0 || !fromWallet || !toWallet || fromWalletId === toWalletId) return false;
      const sourceScope = normalizeScope(fromWallet.scope, getEntryScope(get().cfg));
      const targetScope = normalizeScope(toWallet.scope, getEntryScope(get().cfg));
      const sourceBalance = (await walletPositionForCommand(get, fromWalletId, current))?.availableBalance;
      let transferFields;
      try {
        transferFields = buildTransferCurrencyFields({
          fromWalletId,
          toWalletId,
          fromAmount: transferAmount,
          toAmount: safePatch.transferToAmount ?? current.transferToAmount,
          wallets: normalizedWallets,
          baseCurrency: get().cfg.currency,
          exchangeRate: safePatch.transferRate ?? safePatch.exchangeRate ?? current.transferRate ?? current.exchangeRate,
          feeAmount: safePatch.feeAmount ?? current.feeAmount ?? 0,
          fromBaseRate: safePatch.fromBaseRate ?? current.fromBaseRate,
          toBaseRate: safePatch.toBaseRate ?? current.toBaseRate,
        });
      } catch {
        return false;
      }
      Object.assign(safePatch, transferFields, {
        transferAmount: transferFields.transferFromAmount,
        balanceWarning: !Number.isFinite(sourceBalance) || (transferFields.transferFromAmount + transferFields.feeAmount) > sourceBalance + 0.0001,
      });
      safePatch.scope = sourceScope;
      safePatch.fromScope = safePatch.scope;
      safePatch.toScope = targetScope;
    }
    if (Object.prototype.hasOwnProperty.call(safePatch, 'transactionTag')) {
      safePatch.transactionTag = inferTransactionTag(safePatch);
    }
    const stopRecurringSeries = current.recurring && safePatch.recurring === false;
    const recurringGroupId = current.recurringGroupId || current.id;
    if (safePatch.recurring && !safePatch.recurringGroupId) {
      safePatch.recurringGroupId = current.recurringGroupId || current.id;
    }
    const hasAmt = Object.prototype.hasOwnProperty.call(patch, 'amt');
    const linkedDebt = current.isDebtPayment ? get().debts.find(d => d.id === current.debtId) : null;
    const currentDebtPayment = linkedDebt?.payments?.find(p => p.id === current.paymentId);
    const debtSign = linkedDebt?.direction === 'receivable' ? 1 : -1;
    const linkedGoal = current.isGoalSaving ? get().goals.find(g => g.id === current.goalId) : null;
    const currentGoalSaving = linkedGoal?.savings?.find(sv => sv.id === current.savingId);
    const requestedAmt = Math.abs(Number(safePatch.amt) || 0);
    const linkedAbsAmt = current.isDebtPayment && hasAmt
      ? capLinkedAmount(requestedAmt, linkedDebt?.total, linkedDebt?.paid, currentDebtPayment?.amt)
      : current.isGoalSaving && hasAmt
        ? capLinkedAmount(requestedAmt, linkedGoal?.target, linkedGoal?.cur, currentGoalSaving?.amt)
        : requestedAmt;
    if (hasAmt && (current.isDebtPayment || current.isGoalSaving) && linkedAbsAmt <= 0) return false;
    const nextAmt = hasAmt
      ? (current.isDebtPayment ? debtSign * linkedAbsAmt : current.isGoalSaving ? 0 : (Number(safePatch.amt) < 0 ? -linkedAbsAmt : linkedAbsAmt))
      : current.amt;
    const nextWalletId = safePatch.walletId || current.walletId || getDefaultWalletId(get().wallets, get().cfg.currency, get().cfg.defaultWalletId);
    if (current.kind !== 'transfer' && safePatch.kind !== 'transfer') {
      if (current.isGoalSaving) {
        const allocationEntityAmount = hasAmt
          ? linkedAbsAmt
          : Math.abs(Number(current.entityAmount ?? current.allocationAmount ?? 0));
        let allocationFields;
        try {
          allocationFields = buildEntityCurrencyFields({
            entityAmount: allocationEntityAmount,
            entityCurrency: linkedGoal?.currencyCode || current.entityCurrencyCode || get().cfg.currency,
            walletId: nextWalletId,
            wallets: get().wallets,
            baseCurrency: get().cfg.currency,
            entityBaseRate: safePatch.entityBaseRate ?? current.entityBaseRate,
            walletBaseRate: safePatch.walletBaseRate ?? safePatch.exchangeRate ?? current.walletBaseRate ?? current.exchangeRate,
          });
        } catch {
          return false;
        }
        Object.assign(safePatch, {
          walletId: nextWalletId,
          amt: 0,
          walletAmount: 0,
          walletAmountMinor: 0,
          baseAmount: 0,
          baseAmountMinor: 0,
          allocationAmount: allocationEntityAmount,
          entityAmount: allocationEntityAmount,
          entityCurrencyCode: linkedGoal?.currencyCode || current.entityCurrencyCode || get().cfg.currency,
          entityBaseRate: allocationFields.entityBaseRate,
          walletBaseRate: allocationFields.walletBaseRate,
          allocationBaseAmount: Math.abs(Number(allocationFields.baseAmount || 0)),
          allocationBaseAmountMinor: Math.abs(Number(allocationFields.baseAmountMinor || 0)),
          allocationWalletAmount: Math.abs(Number(allocationFields.walletAmount || 0)),
          allocationWalletAmountMinor: Math.abs(Number(allocationFields.walletAmountMinor || 0)),
          walletCurrency: allocationFields.walletCurrency,
          currencyCode: allocationFields.currencyCode,
          baseCurrencyCode: allocationFields.baseCurrencyCode,
          exchangeRate: allocationFields.exchangeRate,
        });
        const position = await walletPositionForCommand(get, nextWalletId, current);
        const available = Number(position?.availableBalance);
        safePatch.balanceWarning = !Number.isFinite(available)
          || Math.abs(Number(allocationFields.walletAmount || 0)) > available + 0.0001;
      } else if (current.isDebtPayment) {
        const paymentEntityAmount = hasAmt ? debtSign * linkedAbsAmt : Number(current.entityAmount ?? (debtSign * Math.abs(currentDebtPayment?.amt || 0)));
        let paymentFields;
        try {
          paymentFields = buildEntityCurrencyFields({
            entityAmount: paymentEntityAmount,
            entityCurrency: linkedDebt?.currencyCode || current.entityCurrencyCode || get().cfg.currency,
            walletId: nextWalletId,
            wallets: get().wallets,
            baseCurrency: get().cfg.currency,
            entityBaseRate: safePatch.entityBaseRate ?? current.entityBaseRate,
            walletBaseRate: safePatch.walletBaseRate ?? safePatch.exchangeRate ?? current.walletBaseRate ?? current.exchangeRate,
          });
        } catch {
          return false;
        }
        Object.assign(safePatch, paymentFields, { walletId: nextWalletId, amt: paymentFields.baseAmount });
        if (Number(paymentFields.walletAmount || 0) < 0) {
          const position = await walletPositionForCommand(get, nextWalletId, current);
          const available = Number(position?.availableBalance);
          safePatch.balanceWarning = !Number.isFinite(available)
            || Math.abs(Number(paymentFields.walletAmount || 0)) > available + 0.0001;
        }
      } else {
        const touchesCurrencyFields = hasAmt
          || Object.prototype.hasOwnProperty.call(safePatch, 'walletAmount')
          || Object.prototype.hasOwnProperty.call(safePatch, 'walletId')
          || Object.prototype.hasOwnProperty.call(safePatch, 'exchangeRate')
          || Object.prototype.hasOwnProperty.call(safePatch, 'walletCurrency')
          || Object.prototype.hasOwnProperty.call(safePatch, 'currencyCode');
        if (touchesCurrencyFields) {
          const currentNativeAmount = Object.prototype.hasOwnProperty.call(current, 'walletAmount') ? Number(current.walletAmount || 0) : Number(current.amt || 0);
          const requestedNativeAmount = hasAmt
            ? (Number(safePatch.walletAmount ?? safePatch.amt) < 0 ? -linkedAbsAmt : linkedAbsAmt)
            : currentNativeAmount;
          let currencyFields;
          try {
            currencyFields = buildCurrencyFields({
              amount: requestedNativeAmount,
              walletId: nextWalletId,
              wallets: get().wallets,
              baseCurrency: get().cfg.currency,
              exchangeRate: safePatch.exchangeRate ?? current.exchangeRate ?? null,
              walletCurrency: safePatch.walletCurrency ?? current.walletCurrency ?? current.currencyCode,
            });
          } catch {
            return false;
          }
          Object.assign(safePatch, currencyFields);
          safePatch.amt = currencyFields.baseAmount;
          if (Number(currencyFields.walletAmount || 0) < 0) {
            const position = await walletPositionForCommand(get, nextWalletId, current);
            const available = Number(position?.availableBalance);
            safePatch.balanceWarning = !Number.isFinite(available)
              || Math.abs(Number(currencyFields.walletAmount || 0)) > available + 0.0001;
          }
        }
      }
    }
    const nextCommitmentMonth = current.isCommitmentPayment && safePatch.dateISO
      ? monthKey(safePatch.dateISO)
      : current.commitmentMonth;

    const nextTransaction = current.isDebtPayment || current.isGoalSaving
      ? {
          ...current, ...safePatch,
          amt: current.isGoalSaving ? 0 : Number(safePatch.baseAmount ?? current.baseAmount ?? current.amt ?? 0),
          ...(current.isGoalSaving && hasAmt ? { allocationAmount: linkedAbsAmt, entityAmount: linkedAbsAmt } : {}),
          ...(current.isCommitmentPayment ? { commitmentMonth: nextCommitmentMonth } : {}),
        }
      : current.isCommitmentPayment
        ? {
            ...current, ...safePatch,
            amt: hasAmt ? -Math.abs(Number(safePatch.amt) || 0) : current.amt,
            commitmentMonth: nextCommitmentMonth,
          }
        : { ...current, ...safePatch };
    nextTransaction.revision = Math.max(1, Number(current.revision || 1) + 1);
    nextTransaction.updatedAt = new Date().toISOString();
    nextTransaction.rateDate = nextTransaction.rateDate || nextTransaction.dateISO || today();
    nextTransaction.rateSource = nextTransaction.rateSource || 'edit_preserved';
    nextTransaction.idempotencyKey = `transaction-update:${id}:revision:${nextTransaction.revision}`;
    const previewDebts = current.isDebtPayment
      ? get().debts.map(d => {
          if (d.id !== current.debtId) return d;
          const payments = (d.payments || []).map(p => p.id === current.paymentId ? {
            ...p,
            ...(hasAmt ? {
              amt: Math.abs(nextAmt),
              walletId: nextWalletId,
              walletAmount: Math.abs(Number(safePatch.walletAmount ?? p.walletAmount ?? 0)),
              walletCurrency: safePatch.walletCurrency || p.walletCurrency,
              exchangeRate: safePatch.exchangeRate || p.exchangeRate,
              currencyCode: linkedDebt?.currencyCode || p.currencyCode || get().cfg.currency,
              entityBaseRate: safePatch.entityBaseRate ?? p.entityBaseRate,
              walletBaseRate: safePatch.walletBaseRate ?? p.walletBaseRate,
            } : {}),
            ...(patch.dateISO ? { date: patch.dateISO } : {}),
          } : p);
          const paid = debtPaidTotal(d, payments);
          const next = { ...d, payments, paid };
          return { ...next, ...debtLifecycle(next, paid, patch.dateISO || today()) };
        })
      : current.isDebtOrigin
        ? get().debts.map(d => d.id === current.debtId ? {
            ...d, ...(patch.dateISO ? { createdAt: patch.dateISO } : {}),
            ...(hasAmt ? { total: Math.abs(nextAmt) } : {}),
          } : d)
        : get().debts;
    const previewGoals = current.isGoalSaving
      ? get().goals.map(g => {
          if (g.id !== current.goalId) return g;
          const savings = (g.savings || []).map(sv => sv.id === current.savingId ? {
            ...sv,
            ...(hasAmt ? {
              amt: linkedAbsAmt,
              walletId: nextWalletId,
              walletAmount: Math.abs(Number(safePatch.allocationWalletAmount ?? sv.walletAmount ?? 0)),
              walletCurrency: safePatch.walletCurrency || sv.walletCurrency,
              exchangeRate: safePatch.exchangeRate || sv.exchangeRate,
              currencyCode: linkedGoal?.currencyCode || sv.currencyCode || get().cfg.currency,
              entityBaseRate: safePatch.entityBaseRate ?? sv.entityBaseRate,
              walletBaseRate: safePatch.walletBaseRate ?? sv.walletBaseRate,
            } : {}),
            ...(patch.dateISO ? { date: patch.dateISO } : {}),
          } : sv);
          const cur = Math.min(goalSavedTotal(g, savings), g.target);
          const next = { ...g, savings, cur };
          return { ...next, ...goalLifecycle(next, cur, patch.dateISO || today()) };
        })
      : get().goals;
    const previewTransactions = get().trans.map(item => item.id === id ? nextTransaction : item);
    let previewCommitments = current.isCommitmentPayment
      ? syncCommitmentPaidMonth(get().commitments, previewTransactions, current.commitmentId)
      : get().commitments;
    const previewDebtAfter = current.isDebtPayment ? previewDebts.find(item => item.id === current.debtId) : null;
    const previewGoalAfter = current.isGoalSaving ? previewGoals.find(item => item.id === current.goalId) : null;
    if (linkedDebt?.status !== 'settled' && previewDebtAfter?.status === 'settled') {
      const linkedType = linkedDebt.direction === 'receivable' ? 'receivable' : 'debt';
      previewCommitments = previewCommitments.map(item => (
        item.linkedType === linkedType && item.linkedId === current.debtId
          ? { ...item, active: false, endedAt: patch.dateISO || today(), endReason: 'debt_settled' }
          : item
      ));
    }
    if (linkedGoal?.status !== 'settled' && previewGoalAfter?.status === 'settled') {
      previewCommitments = previewCommitments.map(item => (
        item.linkedType === 'goal' && item.linkedId === current.goalId
          ? { ...item, active: false, endedAt: patch.dateISO || today(), endReason: 'goal_completed' }
          : item
      ));
    }
    previewCommitments = reopenCompletionCommitments(previewCommitments, [
      ...(linkedDebt?.status === 'settled' && previewDebtAfter?.status === 'active'
        ? [{ linkedType: linkedDebt.direction === 'receivable' ? 'receivable' : 'debt', linkedId: current.debtId, endReason: 'debt_settled' }]
        : []),
      ...(linkedGoal?.status === 'settled' && previewGoalAfter?.status === 'active'
        ? [{ linkedType: 'goal', linkedId: current.goalId, endReason: 'goal_completed' }]
        : []),
    ]);
    const existingCommitments = new Map(get().commitments.map(item => [item.id, item]));
    const changedCommitments = previewCommitments.filter(item => (
      JSON.stringify(existingCommitments.get(item.id) || null) !== JSON.stringify(item)
    ));
    const recurringRuleId = String(nextTransaction.recurringGroupId || current.recurringGroupId || current.id);
    const recurringRuleChange = current.recurring || nextTransaction.recurring || stopRecurringSeries
      ? [{
          entityType: 'recurring_rule',
          id: recurringRuleId,
          ...(nextTransaction.recurring && !stopRecurringSeries
            ? { payload: {
                id: recurringRuleId,
                ledgerId: get().workspaceNamespace,
                type: nextTransaction.flowType,
                amount: Math.abs(Number(nextTransaction.walletAmount ?? nextTransaction.amt ?? 0)),
                currencyCode: nextTransaction.walletCurrency || nextTransaction.currencyCode || get().cfg.currency,
                walletId: nextTransaction.walletId,
                categoryId: nextTransaction.cat || 'other',
                schedule: 'monthly',
                timezonePolicy: 'local_date',
                startDate: nextTransaction.dateISO,
                endDate: null,
                nextOccurrence: null,
                status: 'active',
                revision: Math.max(1, Number(current.revision || 1) + 1),
                sourceTransactionId: current.id,
              } }
            : { deletedAt: new Date().toISOString(), payload: { id: recurringRuleId, status: 'stopped' } }),
        }]
      : [];
    const entityChanges = [
      ...(current.debtId ? previewDebts.filter(item => item.id === current.debtId).map(payload => ({ entityType: 'debt', id: payload.id, payload })) : []),
      ...(current.goalId ? previewGoals.filter(item => item.id === current.goalId).map(payload => ({ entityType: 'goal', id: payload.id, payload })) : []),
      ...changedCommitments.map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
      ...recurringRuleChange,
    ];
    try {
      const committed = await replaceFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: nextTransaction,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityChanges,
      });
      if (committed.supported && !committed.ok) return false;
      if (committed.ok) nextTransaction.sqliteCommittedAt = committed.committedAt || nextTransaction.updatedAt;
      Object.assign(safePatch, {
        revision: nextTransaction.revision,
        updatedAt: nextTransaction.updatedAt,
        rateDate: nextTransaction.rateDate,
        rateSource: nextTransaction.rateSource,
        idempotencyKey: nextTransaction.idempotencyKey,
        ...(nextTransaction.sqliteCommittedAt ? { sqliteCommittedAt: nextTransaction.sqliteCommittedAt, storageEngineVersion: 7 } : {}),
      });
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_transaction_update_failed') });
      return false;
    }

    set(s => {
      const trans = s.trans.map(t => {
        if (stopRecurringSeries && (t.recurringGroupId || t.id) === recurringGroupId) {
          return t.id === id ? { ...t, ...safePatch, recurring: false } : { ...t, recurring: false };
        }
        if (t.id !== id) return t;
        if (t.isDebtPayment || t.isGoalSaving) {
          return {
            ...t,
            ...safePatch,
            // Linked tracker amounts live in entityAmount/allocationAmount. `amt`
            // remains the frozen reporting/base value committed to SQLite.
            amt: t.isGoalSaving
              ? 0
              : Number(safePatch.baseAmount ?? safePatch.amt ?? t.baseAmount ?? t.amt ?? 0),
            ...(t.isGoalSaving && hasAmt ? { allocationAmount: linkedAbsAmt, entityAmount: linkedAbsAmt } : {}),
            ...(t.isCommitmentPayment ? { commitmentMonth: nextCommitmentMonth } : {}),
          };
        }
        if (t.isCommitmentPayment) {
          return {
            ...t,
            ...safePatch,
            amt: hasAmt ? -Math.abs(Number(safePatch.amt) || 0) : t.amt,
            commitmentMonth: nextCommitmentMonth,
          };
        }
        return { ...t, ...safePatch };
      });
      return {
        trans,
        debts: previewDebts,
        goals: previewGoals,
        commitments: previewCommitments,
      };
    });
    if (current.isDebtPayment || current.isGoalSaving) {
      const linkedDebtAfter = current.isDebtPayment ? get().debts.find(item => item.id === current.debtId) : null;
      const linkedGoalAfter = current.isGoalSaving ? get().goals.find(item => item.id === current.goalId) : null;
      const completionNotice = linkedDebtAfter?.status === 'settled'
        ? 'debt_ended'
        : linkedGoalAfter?.status === 'settled'
          ? 'goal_completed'
          : undefined;
      set(s => ({
        trans: s.trans.map(item => item.id === id ? { ...item, completionNotice } : item),
      }));
    }
    await get().saveLocal();
    get().scheduleCloudSync?.('transaction_change');
    return true;
  },

  deleteTrans: async (id) => {
    const t = get().trans.find(x => x.id === id);
    if (!t) return false;
    const linkedDebtBefore = t?.isDebtPayment ? get().debts.find(item => item.id === t.debtId) : null;
    const linkedGoalBefore = t?.isGoalSaving ? get().goals.find(item => item.id === t.goalId) : null;
    const trans = get().trans.filter(item => item.id !== id);
    const debts = t.isDebtPayment
      ? get().debts.map(debt => {
          if (debt.id !== t.debtId) return debt;
          const payments = (debt.payments || []).filter(payment => payment.id !== t.paymentId);
          const paid = debtPaidTotal(debt, payments);
          const next = { ...debt, payments, paid };
          return { ...next, ...debtLifecycle(next, paid, today()) };
        })
      : t.isDebtOrigin
        ? get().debts.map(debt => debt.id === t.debtId
          ? { ...debt, originMode: 'previous', originTransactionId: null }
          : debt)
        : get().debts;
    const goals = t.isGoalSaving
      ? get().goals.map(goal => {
          if (goal.id !== t.goalId) return goal;
          const savings = (goal.savings || []).filter(saving => saving.id !== t.savingId);
          const cur = Math.min(goalSavedTotal(goal, savings), goal.target);
          const next = { ...goal, savings, cur };
          return { ...next, ...goalLifecycle(next, cur, today()) };
        })
      : get().goals;
    let commitments = t.isCommitmentPayment
      ? syncCommitmentPaidMonth(get().commitments, trans, t.commitmentId)
      : get().commitments;
    commitments = reopenCompletionCommitments(commitments, [
      ...(linkedDebtBefore?.status === 'settled'
        ? [{ linkedType: linkedDebtBefore.direction === 'receivable' ? 'receivable' : 'debt', linkedId: t.debtId, endReason: 'debt_settled' }]
        : []),
      ...(linkedGoalBefore?.status === 'settled'
        ? [{ linkedType: 'goal', linkedId: t.goalId, endReason: 'goal_completed' }]
        : []),
    ]);
    const oldCommitments = new Map(get().commitments.map(item => [item.id, item]));
    const entityChanges = [
      ...(t.debtId ? debts.filter(item => item.id === t.debtId).map(payload => ({ entityType: 'debt', id: payload.id, payload })) : []),
      ...(t.goalId ? goals.filter(item => item.id === t.goalId).map(payload => ({ entityType: 'goal', id: payload.id, payload })) : []),
      ...commitments.filter(item => JSON.stringify(oldCommitments.get(item.id) || null) !== JSON.stringify(item))
        .map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
    ];
    try {
      const committed = await voidFinancialTransactionsV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transactionIds: [id],
        entityChanges,
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_transaction_void_failed') });
      return false;
    }
    set({ trans, debts, goals, commitments, lastDeletedTransaction: { ...t } });
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    get().scheduleCloudSync?.('transaction_change');
    return !!t;
  },

  undoLastTransactionDelete: async () => {
    const t = get().lastDeletedTransaction;
    if (!t?.id || get().trans.some(item => item.id === t.id)) return false;
    let debts = get().debts;
    let goals = get().goals;
    if (t.isDebtPayment && t.debtId && t.paymentId) {
      debts = debts.map(debt => {
        if (debt.id !== t.debtId || (debt.payments || []).some(payment => payment.id === t.paymentId)) return debt;
        const payment = {
          id: t.paymentId, amt: Math.abs(Number(t.baseAmount ?? t.amt ?? 0)),
          date: normalizeDate(t.dateISO), ts: Number(t.ts || Date.now()),
          walletId: t.walletId, walletAmount: Math.abs(Number(t.walletAmount ?? t.amt ?? 0)),
          walletCurrency: t.walletCurrency, exchangeRate: t.exchangeRate,
        };
        const payments = [...(debt.payments || []), payment];
        const paid = debtPaidTotal(debt, payments);
        const next = { ...debt, payments, paid };
        return { ...next, ...debtLifecycle(next, paid, t.dateISO || today()) };
      });
    }
    if (t.isGoalSaving && t.goalId && t.savingId) {
      goals = goals.map(goal => {
        if (goal.id !== t.goalId || (goal.savings || []).some(saving => saving.id === t.savingId)) return goal;
        const saving = {
          id: t.savingId, amt: Math.abs(Number(t.allocationAmount || 0)),
          date: normalizeDate(t.dateISO), ts: Number(t.ts || Date.now()),
          walletId: t.walletId, walletAmount: Math.abs(Number(t.allocationWalletAmount || 0)),
          walletCurrency: t.walletCurrency, exchangeRate: t.exchangeRate,
        };
        const savings = [...(goal.savings || []), saving];
        const cur = Math.min(goalSavedTotal(goal, savings), goal.target);
        const next = { ...goal, savings, cur };
        return { ...next, ...goalLifecycle(next, cur, t.dateISO || today()) };
      });
    }
    if (t.isDebtOrigin && t.debtId) {
      debts = debts.map(debt => debt.id === t.debtId ? {
        ...debt,
        originMode: t.flowType === FLOW_TYPES.DEBT_PROCEEDS ? 'received' : 'lent',
        originTransactionId: t.id,
      } : debt);
    }
    const restored = {
      ...t,
      status: 'posted', deletedAt: null,
      revision: Math.max(2, Number(t.revision || 1) + 2),
      updatedAt: new Date().toISOString(),
    };
    restored.idempotencyKey = `transaction-restore:${restored.id}:revision:${restored.revision}`;
    const trans = [restored, ...get().trans];
    const commitments = t.isCommitmentPayment
      ? syncCommitmentPaidMonth(get().commitments, trans, t.commitmentId)
      : get().commitments;
    const entityChanges = [
      ...(t.debtId ? debts.filter(item => item.id === t.debtId).map(payload => ({ entityType: 'debt', id: payload.id, payload })) : []),
      ...(t.goalId ? goals.filter(item => item.id === t.goalId).map(payload => ({ entityType: 'goal', id: payload.id, payload })) : []),
      ...(t.commitmentId ? commitments.filter(item => item.id === t.commitmentId).map(payload => ({ entityType: 'commitment', id: payload.id, payload })) : []),
    ];
    try {
      const committed = await replaceFinancialTransactionV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transaction: restored,
        wallets: get().wallets,
        baseCurrency: get().cfg.currency,
        entityChanges,
      });
      if (committed.supported && !committed.ok) return false;
      if (committed.ok) restored.sqliteCommittedAt = committed.committedAt || restored.updatedAt;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_transaction_restore_failed') });
      return false;
    }
    set({ trans, debts, goals, commitments, lastDeletedTransaction: null });
    await get().saveLocal();
    get().scheduleCloudSync?.('transaction_restore');
    return true;
  },

  deleteTransMany: async (ids = []) => {
    const selected = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
    if (!selected.size) return false;
    const removed = get().trans.filter(item => selected.has(item.id));
    const debtPayments = new Set(removed.filter(item => item.isDebtPayment).map(item => `${item.debtId}:${item.paymentId}`));
    const goalSavings = new Set(removed.filter(item => item.isGoalSaving).map(item => `${item.goalId}:${item.savingId}`));
    const trans = get().trans.filter(item => !selected.has(item.id));
    const debts = get().debts.map(debt => {
      const payments = (debt.payments || []).filter(payment => !debtPayments.has(`${debt.id}:${payment.id}`));
      if (payments.length === (debt.payments || []).length) return debt;
      const paid = debtPaidTotal(debt, payments);
      const next = { ...debt, payments, paid };
      return { ...next, ...debtLifecycle(next, paid, today()) };
    });
    const goals = get().goals.map(goal => {
      const savings = (goal.savings || []).filter(saving => !goalSavings.has(`${goal.id}:${saving.id}`));
      if (savings.length === (goal.savings || []).length) return goal;
      const cur = Math.min(goalSavedTotal(goal, savings), goal.target);
      const next = { ...goal, savings, cur };
      return { ...next, ...goalLifecycle(next, cur, today()) };
    });
    let commitments = syncCommitmentPaidMonth(get().commitments, trans);
    const beforeDebts = new Map(get().debts.map(item => [item.id, item]));
    const beforeGoals = new Map(get().goals.map(item => [item.id, item]));
    const reopenLinks = [
      ...debts.filter(item => beforeDebts.get(item.id)?.status === 'settled' && item.status === 'active')
        .map(item => ({
          linkedType: item.direction === 'receivable' ? 'receivable' : 'debt',
          linkedId: item.id,
          endReason: 'debt_settled',
        })),
      ...goals.filter(item => beforeGoals.get(item.id)?.status === 'settled' && item.status === 'active')
        .map(item => ({ linkedType: 'goal', linkedId: item.id, endReason: 'goal_completed' })),
    ];
    commitments = reopenCompletionCommitments(commitments, reopenLinks);
    const affectedDebtIds = new Set(removed.filter(item => item.debtId).map(item => item.debtId));
    const affectedGoalIds = new Set(removed.filter(item => item.goalId).map(item => item.goalId));
    const beforeCommitments = new Map(get().commitments.map(item => [item.id, item]));
    const entityChanges = [
      ...debts.filter(item => affectedDebtIds.has(item.id)).map(payload => ({ entityType: 'debt', id: payload.id, payload })),
      ...goals.filter(item => affectedGoalIds.has(item.id)).map(payload => ({ entityType: 'goal', id: payload.id, payload })),
      ...commitments.filter(item => JSON.stringify(beforeCommitments.get(item.id) || null) !== JSON.stringify(item))
        .map(payload => ({ entityType: 'commitment', id: payload.id, payload })),
    ];
    try {
      const committed = await voidFinancialTransactionsV7({
        namespace: getLedgerNamespace(get().workspaceNamespace, get().cfg),
        transactionIds: [...selected],
        entityChanges,
      });
      if (committed.supported && !committed.ok) return false;
    } catch (error) {
      set({ ledgerError: String(error?.message || 'financial_v7_bulk_void_failed') });
      return false;
    }
    set({ trans, debts, goals, commitments });
    await get().saveLocal({ force: financialDataCount(get()) === 0 });
    get().scheduleCloudSync?.('transaction_change');
    return true;
  },
});
