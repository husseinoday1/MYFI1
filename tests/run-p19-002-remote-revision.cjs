const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'android' } };
  if (request === 'expo-sqlite') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const transform = filename => babel.transformFileSync(filename, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

const originalJs = require.extensions['.js'];
require.extensions['.js'] = (targetModule, filename) => {
  if (filename.includes(`${path.sep}src${path.sep}`)) {
    targetModule._compile(transform(filename), filename);
    return;
  }
  originalJs(targetModule, filename);
};

const repositoryPath = path.join(projectRoot, 'src/lib/financialLedgerV7Repository.js');
const repository = require(repositoryPath);
const { applyRemoteLedgerMutationsV7 } = repository;

class FakeDb {
  constructor({ transaction = null, entity = null } = {}) {
    this.transaction = transaction;
    this.entity = entity;
    this.inbox = new Set();
    this.events = [];
    this.userVersion = 7;
  }

  async execAsync(sql) {
    this.events.push(['exec', sql]);
  }

  async runAsync(sql, ...args) {
    this.events.push(['run', sql, args]);
    if (sql.includes('INSERT OR IGNORE INTO ledger_inbox_v2')) {
      this.inbox.add(String(args[0]));
    }
    return { changes: 1 };
  }

  async getFirstAsync(sql, ...args) {
    this.events.push(['getFirst', sql, args]);
    if (sql.includes('PRAGMA user_version')) return { user_version: this.userVersion };
    if (sql.includes('PRAGMA quick_check')) return { quick_check: 'ok' };
    if (sql.includes('FROM schema_migrations')) {
      return {
        migration_id: '0007_financial_ledger_v7_baseline',
        from_version: 0,
        to_version: 7,
        checksum: null,
        status: 'completed',
        attempt_count: 1,
      };
    }
    if (sql.includes('SELECT mutation_id FROM ledger_inbox_v2')) {
      return this.inbox.has(String(args[0])) ? { mutation_id: String(args[0]) } : null;
    }
    if (sql.includes('SELECT last_server_sequence FROM ledger_sync_state_v7')) return { last_server_sequence: 0 };
    if (sql.includes('FROM ledger_financial_transactions_v7 WHERE namespace=? AND id=?')) return this.transaction;
    if (sql.includes('FROM ledger_entities_v7') && sql.includes('entity_type=?') && sql.includes('id=?')) return this.entity;
    return null;
  }

  async getAllAsync(sql) {
    this.events.push(['getAll', sql]);
    if (sql.includes('PRAGMA table_info')) return [{ name: 'payload_json' }];
    if (sql.includes('PRAGMA foreign_key_check')) return [];
    return [];
  }

  async withTransactionAsync(fn) {
    this.events.push(['begin']);
    try {
      await fn();
      this.events.push(['commit']);
    } catch (error) {
      this.events.push(['rollback']);
      throw error;
    }
  }
}

(async () => {
  const divergentTxDb = new FakeDb({
    transaction: {
      revision: 2,
      payload_json: JSON.stringify({ id: 'tx-1', amt: -10, revision: 2 }),
      status: 'posted',
      archive_year: null,
      archived_at: null,
      deleted_at: null,
    },
  });
  await assert.rejects(
    () => applyRemoteLedgerMutationsV7({
      namespace: 'user:test',
      deviceId: 'device-b',
      database: divergentTxDb,
      mutations: [{
        mutationId: 'remote-tx-conflict',
        serverSequence: 1,
        entityType: 'financial_transaction',
        entityId: 'tx-1',
        operation: 'upsert',
        entityRevision: 2,
        payload: {
          transaction: {
            id: 'tx-1', status: 'posted', archiveYear: null, deletedAt: null,
          },
          originalTransaction: { id: 'tx-1', amt: -20, revision: 2 },
          currencies: [], accounts: [], postings: [], exchangeRates: [], links: [], entities: [],
        },
      }],
    }),
    /financial_mutation_revision_conflict/,
  );
  assert.equal(divergentTxDb.inbox.size, 0, 'conflicting mutation must not advance inbox');

  const identicalTxDb = new FakeDb({
    transaction: {
      revision: 2,
      payload_json: JSON.stringify({ id: 'tx-1', amt: -10, revision: 2 }),
      status: 'posted',
      archive_year: null,
      archived_at: null,
      deleted_at: null,
    },
  });
  const identical = await applyRemoteLedgerMutationsV7({
    namespace: 'user:test',
    deviceId: 'device-b',
    database: identicalTxDb,
    mutations: [{
      mutationId: 'remote-tx-identical',
      serverSequence: 2,
      entityType: 'financial_transaction',
      entityId: 'tx-1',
      operation: 'upsert',
      entityRevision: 2,
      payload: {
        transaction: {
          id: 'tx-1', status: 'posted', archiveYear: null, deletedAt: null,
        },
        originalTransaction: { id: 'tx-1', amt: -10, revision: 2 },
        currencies: [], accounts: [], postings: [], exchangeRates: [], links: [], entities: [],
      },
    }],
  });
  assert.equal(identical.ok, true);
  assert.equal(identical.applied, 0);
  assert(identicalTxDb.inbox.has('remote-tx-identical'), 'identical equal revision should be acknowledged locally');

  const divergentEntityDb = new FakeDb({
    entity: {
      revision: 4,
      deleted_at: null,
      payload_json: JSON.stringify({ id: 'goal-1', saved: 100 }),
    },
  });
  await assert.rejects(
    () => applyRemoteLedgerMutationsV7({
      namespace: 'user:test',
      deviceId: 'device-b',
      database: divergentEntityDb,
      mutations: [{
        mutationId: 'remote-entity-conflict',
        serverSequence: 3,
        entityType: 'goal',
        entityId: 'goal-1',
        operation: 'upsert',
        entityRevision: 4,
        payload: {
          namespace: 'user:test',
          entityType: 'goal',
          id: 'goal-1',
          revision: 4,
          deletedAt: null,
          payload: { id: 'goal-1', saved: 200 },
          createdAt: '2026-08-17T00:00:00.000Z',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      }],
    }),
    /financial_mutation_revision_conflict/,
  );

  console.log('MYFI P19-002 REMOTE REVISION RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
