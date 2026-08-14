import { Platform } from 'react-native';
import { getLedgerDb } from '../lib/ledgerDatabase';
import {
  clearFinancialWorkspaceV7,
  commitFinancialTransactionV7,
  ensureFinancialLedgerV7,
  readFinancialProjectionV7,
  readPendingLedgerMutationsV7,
} from '../lib/financialLedgerV7Repository';

const assertHarness = (condition, code) => {
  if (!condition) throw new Error(`financial_v7_device_harness_${code}`);
};

// Runs only against a disposable namespace. It never reads, rewrites, or syncs user data.
export async function runFinancialLedgerV7DeviceHarness() {
  assertHarness(Platform.OS === 'android' || Platform.OS === 'ios', 'native_platform_required');
  const startedAt = Date.now();
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const namespace = `__myfi_v7_device_harness__:${runId}`;
  const dateISO = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const usdWallet = {
    id: `${runId}:wallet:usd`, name: 'Device Harness USD', currency: 'USD', scope: 'personal',
    type: 'cash', createdAt: now, updatedAt: now,
  };
  const iqdWallet = {
    id: `${runId}:wallet:iqd`, name: 'Device Harness IQD', currency: 'IQD', scope: 'personal',
    type: 'cash', createdAt: now, updatedAt: now,
  };
  const wallets = [usdWallet, iqdWallet];
  let db = null;
  let cleaned = false;

  try {
    db = await getLedgerDb();
    assertHarness(db, 'database_unavailable');
    await ensureFinancialLedgerV7(db);
    await clearFinancialWorkspaceV7({ namespace, database: db });

    const expense = {
      id: `${runId}:expense`, dateISO, walletId: usdWallet.id, walletCurrency: 'USD',
      walletAmountMinor: -1234, walletAmount: -12.34, amt: -16165, baseAmountMinor: -16165,
      baseCurrencyCode: 'IQD', exchangeRate: 1310, rateDate: dateISO,
      rateSource: 'device_harness', title: 'Device harness expense', revision: 1,
    };
    const expenseResult = await commitFinancialTransactionV7({
      namespace, transaction: expense, wallets, baseCurrency: 'IQD', database: db,
    });
    assertHarness(expenseResult?.ok && !expenseResult.idempotent, 'expense_commit_failed');

    const incomeResult = await commitFinancialTransactionV7({
      namespace,
      transaction: {
        id: `${runId}:income`, dateISO, walletId: iqdWallet.id, walletCurrency: 'IQD',
        walletAmountMinor: 50000, walletAmount: 50000, amt: 50000,
        baseAmountMinor: 50000, baseCurrencyCode: 'IQD', title: 'Device harness income', revision: 1,
      },
      wallets, baseCurrency: 'IQD', database: db,
    });
    assertHarness(incomeResult?.ok, 'income_commit_failed');

    const transferResult = await commitFinancialTransactionV7({
      namespace,
      transaction: {
        id: `${runId}:transfer`, kind: 'transfer', flowType: 'transfer', dateISO,
        fromWalletId: usdWallet.id, toWalletId: iqdWallet.id,
        transferFromAmountMinor: 1000, transferToAmountMinor: 13100, feeAmountMinor: 100,
        transferRate: 1310, fromBaseRate: 1310, baseCurrencyCode: 'IQD',
        rateDate: dateISO, rateSource: 'device_harness', title: 'Device harness transfer', revision: 1,
      },
      wallets, baseCurrency: 'IQD', database: db,
    });
    assertHarness(transferResult?.ok, 'transfer_commit_failed');

    const goalId = `${runId}:goal`;
    const goalResult = await commitFinancialTransactionV7({
      namespace,
      transaction: {
        id: `${runId}:goal-allocation`, dateISO, walletId: usdWallet.id,
        walletCurrency: 'USD', isGoalSaving: true, goalId,
        allocationWalletAmountMinor: 500, allocationWalletAmount: 5,
        allocationBaseAmountMinor: 6550, allocationAmount: 6550,
        baseCurrencyCode: 'IQD', exchangeRate: 1310, rateDate: dateISO,
        rateSource: 'device_harness', title: 'Device harness goal allocation', revision: 1,
      },
      wallets,
      baseCurrency: 'IQD',
      entityChanges: [{
        entityType: 'goal', id: goalId, revision: 1,
        payload: { id: goalId, name: 'Device harness goal', target: 100000, saved: 6550 },
        createdAt: now, updatedAt: now,
      }],
      database: db,
    });
    assertHarness(goalResult?.ok, 'goal_commit_failed');

    const idempotentResult = await commitFinancialTransactionV7({
      namespace, transaction: expense, wallets, baseCurrency: 'IQD', database: db,
    });
    assertHarness(idempotentResult?.ok && idempotentResult.idempotent, 'idempotency_failed');

    let constraintRejected = false;
    try {
      await db.withTransactionAsync(async () => {
        await db.runAsync(
          `INSERT INTO ledger_postings_v7
           (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          namespace, `${runId}:invalid-zero-posting`, expense.id, usdWallet.id,
          'physical', 'constraint_probe', 0, 'USD', null, now,
        );
      });
    } catch {
      constraintRejected = true;
    }
    assertHarness(constraintRejected, 'sqlite_check_constraint_missing');

    const [projection, pending, foreignKeys] = await Promise.all([
      readFinancialProjectionV7({ namespace, database: db }),
      readPendingLedgerMutationsV7({ namespace, limit: 20, database: db }),
      db.getFirstAsync('PRAGMA foreign_keys'),
    ]);
    assertHarness(projection?.transactions?.length === 4, 'transaction_count_mismatch');
    assertHarness(projection?.postings?.length === 6, 'posting_count_mismatch');
    assertHarness(projection?.links?.length === 1, 'link_count_mismatch');
    assertHarness(projection?.entities?.some(item => item.entityType === 'goal' && item.id === goalId), 'entity_link_missing');
    assertHarness(pending.length === 4, 'outbox_count_mismatch');
    assertHarness(Number(foreignKeys?.foreign_keys) === 1, 'foreign_keys_disabled');

    await clearFinancialWorkspaceV7({ namespace, database: db });
    const remaining = await db.getFirstAsync(
      'SELECT COUNT(*) AS count FROM ledger_financial_transactions_v7 WHERE namespace=?', namespace,
    );
    cleaned = Number(remaining?.count || 0) === 0;
    assertHarness(cleaned, 'cleanup_failed');

    return {
      ok: true,
      platform: Platform.OS,
      transactionCount: 4,
      postingCount: 6,
      linkCount: 1,
      pendingMutationCount: 4,
      idempotency: true,
      sqliteConstraints: true,
      cleaned,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    if (db && !cleaned) {
      await clearFinancialWorkspaceV7({ namespace, database: db }).catch(() => {});
    }
  }
}
