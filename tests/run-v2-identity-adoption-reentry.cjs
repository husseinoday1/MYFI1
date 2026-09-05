// MYFI — draining the re-entry queue after a cloud identity is adopted.
//
// This is where the mutations the owner chose to KEEP actually come back. If
// this loses one, the adoption has quietly destroyed a real financial entry --
// the exact outcome the whole review flow exists to prevent. So the cases that
// matter here are the failure ones: a rejected entry must stay queued, must not
// take the others down with it, and must never be reported as applied.
//
// Applied through the ordinary commit paths, which are injected here so the
// test can drive them without standing up the whole repository.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialV2IdentityAdoptionFlowV1.js');

let source = fs.readFileSync(filename, 'utf8')
  .replace(/import \{ getLedgerDb \} from '\.\/ledgerDatabase';/, 'const getLedgerDb = async () => globalThis.__DB__;')
  .replace(/import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    'const commitEntityChangesV7 = async () => ({ supported: true, ok: true });\n'
    + 'const commitFinancialTransactionV7 = async () => ({ supported: true, ok: true });\n'
    + 'const createFinancialConflictRecoveryCheckpointV1 = async () => ({ ok: true, checkpoint: {} });\n'
    + 'const ensureLedgerSyncIdentityV8 = async () => ({ ledgerId: "x", restoreEpoch: 1 });')
  .replace(/import \{ stageVerifiedBootstrapWithArchiveV2 \} from '\.\/financialBootstrapRecoveryCoordinatorV2';/, 'const stageVerifiedBootstrapWithArchiveV2 = async () => ({ ok: false });')
  .replace(/import \{ createSecureUuidV4 \} from '\.\/secureUuid';/, 'const createSecureUuidV4 = () => "uuid";')
  .replace(/import \{[\s\S]*?\} from '\.\/financialV2IdentityAdoptionV1';/,
    'const ADOPTION_INTENT_STATUS = "ready_for_cloud_identity_adoption";\n'
    + 'const adoptionAppliesV1 = () => ({ applies: true });\n'
    + 'const describePendingMutationsV1 = rows => rows;')
  .replace(/import \{[\s\S]*?\} from '\.\/financialV2IdentityAdoptionPromotionV1';/,
    'const adoptionIntentKey = ns => `financial_v2_identity_adoption_intent_v1:${ns}`;\n'
    + 'const adoptionReentryQueueKey = ns => `financial_v2_identity_adoption_reentry_v1:${ns}`;\n'
    + 'const promoteCloudIdentityAdoptionV1 = async () => ({ ok: true });')
  .replace(/^export const /gm, 'const ');
source += '\nmodule.exports = { drainCloudIdentityAdoptionReentryV1, adoptionReentryQueueKey };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { drainCloudIdentityAdoptionReentryV1: drain, adoptionReentryQueueKey } = compiled.exports;

class Db {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec('CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);');
  }
  async getFirstAsync(sql, ...p) { return this.native.prepare(String(sql)).get(...p) || null; }
  async getAllAsync(sql, ...p) { return this.native.prepare(String(sql)).all(...p); }
  async runAsync(sql, ...p) { const r = this.native.prepare(String(sql)).run(...p); return { changes: Number(r.changes || 0) }; }
}

const NS = 'user:reentry';
const KEY = adoptionReentryQueueKey(NS);

const txEntry = (seq, id) => ({
  sequenceId: seq, entityType: 'financial_transaction', entityId: id, operation: 'upsert',
  payloadJson: JSON.stringify({ originalTransaction: { id, title: 'Salary', amt: 100 } }),
});
const debtEntry = (seq, id) => ({
  sequenceId: seq, entityType: 'debt', entityId: id, operation: 'upsert',
  payloadJson: JSON.stringify({ payload: { id, name: 'Debt', total: 500 } }),
});

const seed = (db, entries) => db.native.prepare('INSERT OR REPLACE INTO ledger_v7_meta VALUES (?,?,?)')
  .run(KEY, JSON.stringify({ version: 1, namespace: NS, entries }), 'now');
const queueOf = db => {
  const row = db.native.prepare('SELECT value FROM ledger_v7_meta WHERE key=?').get(KEY);
  return row ? JSON.parse(row.value) : null;
};

(async () => {
  // Everything applies: each entry goes to the path its type belongs to, and
  // the queue is removed rather than left behind as a second source of truth.
  {
    const db = new Db(); globalThis.__DB__ = db;
    seed(db, [txEntry(1, 'tx-1'), debtEntry(2, 'debt-1')]);
    const seenTx = []; const seenEnt = [];
    const result = await drain({
      namespace: NS, database: db,
      commitTransaction: async ({ transaction }) => { seenTx.push(transaction.id); return { supported: true, ok: true }; },
      commitEntities: async ({ changes }) => { seenEnt.push(changes[0].entityType); return { supported: true, ok: true }; },
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.drained, 2);
    assert.equal(result.remaining, 0);
    assert.deepEqual(seenTx, ['tx-1'], 'a transaction must go through the transaction path');
    assert.deepEqual(seenEnt, ['debt'], 'an entity must go through the entity path');
    assert.equal(queueOf(db), null, 'a fully drained queue must be removed');
  }

  // THE case that matters: one entry is rejected. It must stay queued with its
  // reason, the others must still apply, and it must not be counted as drained.
  {
    const db = new Db(); globalThis.__DB__ = db;
    seed(db, [txEntry(1, 'tx-ok'), txEntry(2, 'tx-bad'), debtEntry(3, 'debt-ok')]);
    const result = await drain({
      namespace: NS, database: db,
      commitTransaction: async ({ transaction }) => (
        transaction.id === 'tx-bad'
          ? { supported: true, ok: false, reason: 'ledger_rejected_it' }
          : { supported: true, ok: true }
      ),
      commitEntities: async () => ({ supported: true, ok: true }),
    });
    assert.equal(result.ok, false, 'a partial drain must not report success');
    assert.equal(result.drained, 2);
    assert.equal(result.remaining, 1);
    assert.equal(result.failed[0].entityId, 'tx-bad');
    assert.equal(result.failed[0].reason, 'ledger_rejected_it', 'the real reason must survive, not a generic one');

    const queue = queueOf(db);
    // Asserted before dereferencing: if the queue is deleted while an entry
    // still needs re-applying, that entry is gone for good, and this must say
    // so plainly rather than dying on a null.
    assert.ok(queue, 'the queue must not be deleted while an entry still needs re-applying');
    assert.equal(queue.entries.length, 1, 'the failed entry must stay queued');
    assert.equal(queue.entries[0].entityId, 'tx-bad');
    assert.equal(queue.entries[0].lastError, 'ledger_rejected_it');
    assert.equal(
      result.applied.some(row => row.entityId === 'tx-bad'), false,
      'a failed entry must never be reported as applied',
    );
  }

  // A thrown error is treated exactly like a rejection, not swallowed.
  {
    const db = new Db(); globalThis.__DB__ = db;
    seed(db, [txEntry(1, 'tx-throws')]);
    const result = await drain({
      namespace: NS, database: db,
      commitTransaction: async () => { throw new Error('sqlite_is_locked'); },
      commitEntities: async () => ({ supported: true, ok: true }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.remaining, 1);
    assert.equal(result.failed[0].reason, 'sqlite_is_locked');
    assert.equal(queueOf(db).entries.length, 1, 'a thrown error must leave the entry queued');
  }

  // A malformed payload must fail that entry only, and keep it, rather than
  // being applied as something else or dropped as unreadable.
  {
    const db = new Db(); globalThis.__DB__ = db;
    seed(db, [{ sequenceId: 1, entityType: 'financial_transaction', entityId: 'tx-broken', payloadJson: '{no' }]);
    const result = await drain({
      namespace: NS, database: db,
      commitTransaction: async () => { throw new Error('must not be called'); },
      commitEntities: async () => ({ supported: true, ok: true }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.remaining, 1);
    assert.match(result.failed[0].reason, /payload_missing/);
  }

  // Draining again after a failure retries only what is left -- an entry that
  // already applied must not be applied a second time.
  {
    const db = new Db(); globalThis.__DB__ = db;
    seed(db, [txEntry(1, 'tx-ok'), txEntry(2, 'tx-bad')]);
    let attempts = 0;
    const flaky = async ({ transaction }) => {
      attempts += 1;
      return transaction.id === 'tx-bad' && attempts <= 2
        ? { supported: true, ok: false, reason: 'not_yet' }
        : { supported: true, ok: true };
    };
    await drain({ namespace: NS, database: db, commitTransaction: flaky, commitEntities: async () => ({ ok: true }) });
    const second = await drain({ namespace: NS, database: db, commitTransaction: flaky, commitEntities: async () => ({ ok: true }) });
    assert.equal(second.ok, true, 'the retry must succeed once the ledger accepts it');
    assert.equal(second.drained, 1, 'only the entry that was still queued may be re-applied');
    assert.equal(queueOf(db), null);
    assert.equal(attempts, 3, 'the already-applied entry must not be submitted again');
  }

  // No queue at all is a no-op, not an error: adoption with nothing kept is
  // perfectly ordinary.
  {
    const db = new Db(); globalThis.__DB__ = db;
    const result = await drain({ namespace: NS, database: db });
    assert.equal(result.ok, true);
    assert.equal(result.empty, true);
  }

  console.log('MYFI V2 IDENTITY ADOPTION REENTRY SQLITE RUNTIME: PASSED');
})();
