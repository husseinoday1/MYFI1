import assert from 'node:assert/strict';
import { buildExpenseLedgerCommand, buildFinancialLedgerCommand, exchangeRateFraction } from '../src/lib/financialLedgerV7Model';
import {
  archiveFinancialTransactionsV7,
  commitEntityChangesV7,
  commitExpenseLedgerV7Command,
  replaceFinancialTransactionV7,
} from '../src/lib/financialLedgerV7Repository';
import { buildFinancialShadowProjectionV7, financialProjectionChecksum } from '../src/lib/financialLedgerV7Migration';
import { normalizeFinancialMutationSyncResponse, serializeLedgerMutationBatch } from '../src/lib/financialMutationSync';

class FakeDatabase {
  constructor({
    failOutbox = false,
    existingId = null,
    currentTransactionRevision = null,
    currentEntityRevision = null,
    archivedGoal = false,
  } = {}) {
    this.failOutbox = failOutbox;
    this.existingId = existingId;
    this.currentTransactionRevision = currentTransactionRevision;
    this.currentEntityRevision = currentEntityRevision;
    this.archivedGoal = archivedGoal;
    this.events = [];
    this.inTransaction = false;
    this.committed = false;
    this.rolledBack = false;
  }

  async execAsync(sql) {
    this.events.push({ type: 'exec', sql, inTransaction: this.inTransaction });
  }

  async runAsync(sql, ...args) {
    this.events.push({ type: 'run', sql, args, inTransaction: this.inTransaction });
    if (this.failOutbox && sql.includes('INSERT INTO ledger_outbox_v2')) throw new Error('outbox_insert_failed');
    return { changes: 1 };
  }

  async getFirstAsync(sql, ...args) {
    this.events.push({ type: 'getFirst', sql, args, inTransaction: this.inTransaction });
    if (sql.includes('PRAGMA quick_check')) return { quick_check: 'ok' };
    if (this.archivedGoal && sql.includes('SELECT kind,scope,date_iso,occurred_at,revision,payload_json,archived_at')) {
      return {
        kind: 'goal_allocation', scope: 'personal', date_iso: '2025-08-14',
        occurred_at: '2025-08-14T12:00:00.000Z', revision: 2, archived_at: null,
        payload_json: JSON.stringify({
          id: 'goal-archive-1', isGoalSaving: true, goalId: 'goal-1',
          allocationAmount: 25000, allocationBaseAmountMinor: 25000000,
          baseCurrencyCode: 'IQD', walletCurrency: 'IQD', exchangeRate: 1,
          dateISO: '2025-08-14', scope: 'personal',
        }),
      };
    }
    if (this.archivedGoal && sql.includes('SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?')) {
      return null;
    }
    if (this.archivedGoal && sql.includes('SELECT COUNT(*) AS count FROM ledger_financial_transactions_v7')) {
      return { count: 2 };
    }
    if (sql.includes('WHERE namespace=? AND idempotency_key=?')) {
      return this.existingId ? { id: this.existingId } : null;
    }
    if (sql.includes('SELECT revision FROM ledger_entities_v7')) {
      return this.currentEntityRevision == null ? null : { revision: this.currentEntityRevision };
    }
    if (sql.includes('SELECT revision FROM ledger_financial_transactions_v7')) {
      return this.currentTransactionRevision == null ? null : { revision: this.currentTransactionRevision };
    }
    if (sql.includes('JOIN ledger_postings_v7')) {
      return {
        id: this.existingId || 'expense-v7-1', kind: 'expense', status: 'posted', date_iso: '2026-08-14',
        category_id: 'food', title: 'Groceries', note: '', account_id: 'wallet-usd',
        bucket: 'physical', role: 'principal', amount_minor: -12345, currency_code: 'USD',
        exchange_rate_id: 'expense-v7-1:wallet-to-base-rate',
      };
    }
    return null;
  }

  async getAllAsync(sql, ...args) {
    this.events.push({ type: 'getAll', sql, args, inTransaction: this.inTransaction });
    if (this.archivedGoal && sql.includes("p.bucket='reserved'")) {
      return [{
        account_id: 'wallet-iqd', amount_minor: 25000000, currency_code: 'IQD',
        name: 'Cash', account_type: 'cash', scope: 'personal', status: 'active',
        created_at: '2025-01-01T00:00:00.000Z', updated_at: '2025-01-01T00:00:00.000Z',
        archived_at: null, numerator: null, denominator: null,
      }];
    }
    return [];
  }

  async withTransactionAsync(callback) {
    this.events.push({ type: 'begin' });
    this.inTransaction = true;
    try {
      await callback();
      this.committed = true;
      this.events.push({ type: 'commit' });
    } catch (error) {
      this.rolledBack = true;
      this.events.push({ type: 'rollback' });
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }
}

const run = async () => {
  const fraction = exchangeRateFraction(1310.5);
  assert.deepEqual(fraction, { numerator: 2621, denominator: 2 });

  const command = buildExpenseLedgerCommand({
  namespace: 'user:test',
  wallet: { id: 'wallet-usd', name: 'USD cash', currency: 'USD', scope: 'personal', type: 'cash' },
  baseCurrency: 'IQD',
  now: '2026-08-14T03:00:00.000Z',
  transaction: {
    id: 'expense-v7-1',
    walletId: 'wallet-usd',
    walletCurrency: 'USD',
    walletAmountMinor: -12345,
    walletAmount: -123.45,
    baseCurrencyCode: 'IQD',
    exchangeRate: 1310.5,
    rateDate: '2026-08-13',
    rateSource: 'user_entered',
    dateISO: '2026-08-14',
    title: 'Groceries',
    cat: 'food',
    scope: 'personal',
    ts: Date.parse('2026-08-14T03:00:00.000Z'),
  },
  });

  assert.equal(command.header.kind, 'expense');
  assert.equal(command.header.idempotencyKey, 'expense:expense-v7-1');
  assert.equal(command.posting.amountMinor, -12345);
  assert.equal(command.posting.bucket, 'physical');
  assert.equal(command.posting.currencyCode, 'USD');
  assert.equal(command.exchangeRate.rateDate, '2026-08-13');
  assert.equal(command.exchangeRate.source, 'user_entered');
  assert.equal(command.exchangeRate.numerator, 2621);
  assert.equal(command.exchangeRate.denominator, 2);

  const income = buildFinancialLedgerCommand({
    namespace: 'user:test', wallets: [{ id: 'wallet-usd', currency: 'USD' }], baseCurrency: 'IQD',
    transaction: {
      id: 'income-v7-1', walletId: 'wallet-usd', walletAmount: 10, amt: 13100,
      walletCurrency: 'USD', exchangeRate: 1310, dateISO: '2026-08-14',
    },
  });
  assert.equal(income.header.kind, 'income');
  assert.equal(income.postings[0].amountMinor, 1000);

  const transfer = buildFinancialLedgerCommand({
    namespace: 'user:test',
    wallets: [{ id: 'wallet-usd', currency: 'USD' }, { id: 'wallet-iqd', currency: 'IQD' }],
    baseCurrency: 'IQD',
    transaction: {
      id: 'transfer-v7-1', kind: 'transfer', fromWalletId: 'wallet-usd', toWalletId: 'wallet-iqd',
      transferFromAmount: 100, transferToAmount: 131000, transferRate: 1310,
      fromBaseRate: 1310, toBaseRate: 1, feeAmount: 2, dateISO: '2026-08-14',
    },
  });
  assert.equal(transfer.header.kind, 'transfer');
  assert.deepEqual(transfer.postings.map(item => item.role), ['transfer_source', 'transfer_destination', 'fee']);
  assert.deepEqual(transfer.postings.map(item => item.amountMinor), [-10000, 131000000, -200]);

  const goal = buildFinancialLedgerCommand({
    namespace: 'user:test', wallets: [{ id: 'wallet-iqd', currency: 'IQD' }], baseCurrency: 'IQD',
    transaction: {
      id: 'goal-v7-1', walletId: 'wallet-iqd', dateISO: '2026-08-14', isGoalSaving: true,
      goalId: 'goal-1', allocationAmount: 25000, allocationWalletAmount: 25000, walletCurrency: 'IQD',
    },
  });
  assert.equal(goal.header.kind, 'goal_allocation');
  assert.equal(goal.postings[0].bucket, 'reserved');
  assert.equal(goal.links[0].linkType, 'goal');

  const shadow = buildFinancialShadowProjectionV7({
    namespace: 'user:test::shadow-stage::v7',
    workspace: {
      cfg: { currency: 'IQD', defaultWalletId: 'wallet-iqd', categoryBudgets: {} },
      wallets: [{ id: 'wallet-iqd', currency: 'IQD', openingBalance: 5000 }],
      trans: [{ id: 'active-income', walletId: 'wallet-iqd', amt: 2000, dateISO: '2026-08-14' }],
      debts: [], goals: [], commitments: [], cats: [], notif: {},
    },
    coldArchives: [{
      year: 2025, summary: { year: 2025, archivedAt: '2026-01-01T00:00:00.000Z' },
      data: {
        wallets: [{ id: 'wallet-iqd', currency: 'IQD' }],
        trans: [{ id: 'cold-income', walletId: 'wallet-iqd', amt: 1000, dateISO: '2025-05-01' }],
      },
    }],
    now: '2026-08-14T03:00:00.000Z',
  });
  assert.equal(shadow.metrics.activeTransactions, 1);
  assert.equal(shadow.metrics.archivedTransactions, 1);
  assert.equal(shadow.metrics.syntheticTransactions, 1);
  assert.equal(shadow.metrics.walletBalances['wallet-iqd'].physicalMinor, 7000000);
  assert.equal(financialProjectionChecksum(shadow.document), shadow.checksum);

  const mutationBatch = serializeLedgerMutationBatch([{
    mutation_id: 'm-1', entity_type: 'financial_transaction', entity_id: 'income-v7-1',
    operation: 'upsert', entity_revision: 2, payload_version: 7,
    payload: { transaction: { id: 'income-v7-1' } }, created_at: '2026-08-14T03:00:00.000Z',
  }]);
  assert.deepEqual(mutationBatch[0], {
    mutationId: 'm-1', entityType: 'financial_transaction', entityId: 'income-v7-1',
    operation: 'upsert', entityRevision: 2, payloadVersion: 7,
    payload: { transaction: { id: 'income-v7-1' } }, createdAt: '2026-08-14T03:00:00.000Z',
  });
  const mutationResponse = normalizeFinancialMutationSyncResponse({
    acceptedMutationIds: ['m-1'],
    remoteMutations: [{ mutationId: 'm-1', serverSequence: 8 }],
    latestSequence: 8,
    hasMore: false,
  });
  assert.equal(mutationResponse.latestSequence, 8);
  assert.equal(mutationResponse.remoteMutations.length, 1);

  const db = new FakeDatabase();
  const result = await commitExpenseLedgerV7Command(command, { database: db });
  assert.equal(result.ok, true);
  assert.equal(result.supported, true);
  assert.equal(result.persisted.amountMinor, -12345);
  assert.equal(result.persisted.currencyCode, 'USD');
  assert.equal(db.committed, true);
  assert.equal(db.rolledBack, false);

  for (const table of ['ledger_financial_transactions_v7', 'ledger_postings_v7', 'ledger_outbox_v2']) {
    const write = db.events.find(event => event.type === 'run' && event.sql.includes(`INSERT INTO ${table}`));
    assert.ok(write, `${table} insert missing`);
    assert.equal(write.inTransaction, true, `${table} must be written inside the SQLite transaction`);
  }

  const failingDb = new FakeDatabase({ failOutbox: true });
  await assert.rejects(
    () => commitExpenseLedgerV7Command(command, { database: failingDb }),
    /outbox_insert_failed/,
  );
  assert.equal(failingDb.rolledBack, true, 'outbox failure must roll back header and posting writes');
  const failingOutboxIndex = failingDb.events.findIndex(event => event.type === 'run' && event.sql.includes('INSERT INTO ledger_outbox_v2'));
  const rollbackAfterOutbox = failingDb.events.findIndex((event, index) => index > failingOutboxIndex && event.type === 'rollback');
  assert.ok(failingOutboxIndex >= 0 && rollbackAfterOutbox > failingOutboxIndex, 'outbox failure must terminate the financial transaction with rollback');

  const retryDb = new FakeDatabase({ existingId: 'expense-original-id' });
  const retry = await commitExpenseLedgerV7Command(command, { database: retryDb });
  assert.equal(retry.ok, true);
  assert.equal(retry.idempotent, true);
  assert.equal(retry.transactionId, 'expense-original-id');
  assert.equal(retry.persisted.id, 'expense-original-id');
  assert.equal(
    retryDb.events.some(event => event.type === 'run' && event.sql.includes('INSERT INTO ledger_outbox_v2')),
    false,
    'idempotent retry must not create a second outbox mutation',
  );

  const staleDb = new FakeDatabase({ currentTransactionRevision: 5 });
  const staleReplacement = await replaceFinancialTransactionV7({
    namespace: 'user:test',
    transaction: { ...command.originalTransaction, revision: 5 },
    wallets: [{ id: 'wallet-usd', currency: 'USD' }],
    baseCurrency: 'IQD',
    database: staleDb,
  });
  assert.equal(staleReplacement.ok, false);
  assert.equal(staleReplacement.reason, 'stale_transaction_revision');
  assert.equal(
    staleDb.events.some(event => event.type === 'run' && event.sql.includes('DELETE FROM ledger_postings_v7')),
    false,
    'stale replacement must be rejected before deleting the current postings',
  );

  const replacementDb = new FakeDatabase({ currentTransactionRevision: 5, currentEntityRevision: 8 });
  const replacement = await replaceFinancialTransactionV7({
    namespace: 'user:test',
    transaction: { ...command.originalTransaction, revision: 6 },
    wallets: [{ id: 'wallet-usd', currency: 'USD' }],
    baseCurrency: 'IQD',
    entityChanges: [{ entityType: 'debt', id: 'debt-1', revision: 2, payload: { id: 'debt-1', paid: 10 } }],
    database: replacementDb,
  });
  assert.equal(replacement.ok, true);
  const replacementOutbox = replacementDb.events.find(event => (
    event.type === 'run'
    && event.sql.includes('INSERT INTO ledger_outbox_v2')
    && event.args[2] === 'financial_transaction'
  ));
  const replacementPayload = JSON.parse(replacementOutbox.args[7]);
  assert.equal(replacementPayload.entities[0].revision, 9, 'embedded entity revision must advance past SQLite');

  const entityDb = new FakeDatabase({ currentEntityRevision: 12 });
  const entityResult = await commitEntityChangesV7({
    namespace: 'user:test',
    changes: [{ entityType: 'goal', id: 'goal-1', revision: 3, payload: { id: 'goal-1', cur: 50 } }],
    database: entityDb,
    now: '2026-08-14T04:00:00.000Z',
  });
  assert.equal(entityResult.ok, true);
  const entityOutbox = entityDb.events.find(event => (
    event.type === 'run'
    && event.sql.includes('INSERT OR IGNORE INTO ledger_outbox_v2')
    && event.args[2] === 'goal'
  ));
  assert.equal(entityOutbox.args[1], 'user:test:goal:goal-1:revision:13');
  assert.equal(entityOutbox.args[5], 13);

  const archiveDb = new FakeDatabase({ archivedGoal: true });
  const archived = await archiveFinancialTransactionsV7({
    namespace: 'user:test',
    transactionIds: ['goal-archive-1'],
    year: 2025,
    archivedAt: '2026-08-14T05:00:00.000Z',
    database: archiveDb,
  });
  assert.equal(archived.ok, true);
  assert.equal(archived.changed, 1);
  assert.equal(archived.releasedAllocations, 1);
  const releasePosting = archiveDb.events.find(event => (
    event.type === 'run'
    && event.sql.includes('INSERT INTO ledger_postings_v7')
    && event.args[2] === 'v7-archive-release:goal-archive-1'
  ));
  assert.equal(releasePosting.args[4], 'reserved');
  assert.equal(releasePosting.args[5], 'release');
  assert.equal(releasePosting.args[6], -25000000, 'archive must release the reserved posting atomically');
  assert.equal(
    archiveDb.events.filter(event => event.type === 'run' && /INSERT(?: OR IGNORE)? INTO ledger_outbox_v2/.test(event.sql)).length,
    2,
    'archive and its hidden release must both be mutation-synced',
  );
  assert.equal(archiveDb.committed, true);

  console.log('MYFI Financial Ledger V7 repository runtime mock passed.');
};

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
