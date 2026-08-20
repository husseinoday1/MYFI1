// P20-G01-D2 regression — a restore-epoch advance must never leave the ledger
// looking like an ordinary V1 ledger.
//
// Observed on device 2026-08-19 (MYFI_P20_G01_DEVICE_ACCEPTANCE_2026-08-19.md,
// run 3c): after an epoch advance the identity reported restoreEpoch=2 /
// protocolVersion=2 while readFinancialSyncProtocolV8 reported
// activeProtocolVersion=1 with stale activation evidence still naming epoch 1,
// and nothing flagged it as a recovery event. MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM
// forbids automatic fallback to V1 after durable activated_at.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');

let source = fs.readFileSync(filename, 'utf8');
source = source
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace(
    "import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';",
    [
      'const enqueueLedgerWrite = fn => fn();',
      'const getLedgerDb = async () => globalThis.__TEST_DB__;',
      'const runLedgerExclusiveTransaction = async (db, fn) => fn(db);',
    ].join('\n'),
  )
  .replace(
    "import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';",
    'const runLedgerSchemaMigrations = async () => true;',
  )
  .replace(
    /import \{\s*buildExpenseLedgerCommand,\s*buildFinancialLedgerCommand,\s*FINANCIAL_LEDGER_SCHEMA_VERSION,\s*\} from '\.\/financialLedgerV7Model';/,
    [
      'const buildExpenseLedgerCommand = () => null;',
      'const buildFinancialLedgerCommand = () => null;',
      'const FINANCIAL_LEDGER_SCHEMA_VERSION = 8;',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');

source += `
module.exports = {
  ensureLedgerSyncIdentityV8,
  readFinancialSyncProtocolV8,
  commitLedgerRestoreEpochV8,
};
`;

// ---------------------------------------------------------------------------
// Minimal in-memory stand-in for the three tables this path touches.
// ---------------------------------------------------------------------------
const NS = 'user:p20-g01-d2';
const LEDGER = 'ledger-p20g01d2';
const VALID_MANIFEST = 'a'.repeat(64);

const makeDb = () => {
  const meta = new Map();
  const syncState = new Map(); // `${ledgerId}:${epoch}` -> row
  const identity = {
    namespace: NS,
    ledger_id: LEDGER,
    restore_epoch: 1,
    protocol_version: 2,
    minimum_supported_version: 2,
    created_at: '2026-08-19T00:00:00.000Z',
    updated_at: '2026-08-19T00:00:00.000Z',
  };
  const flat = sql => String(sql).replace(/\s+/g, ' ').trim();

  const db = {
    meta,
    syncState,
    identity,
    execAsync: async () => true,
    getFirstAsync: async (sql, ...params) => {
      const q = flat(sql);
      if (q.includes('FROM ledger_sync_identity_v8')) {
        return params[0] === identity.namespace ? { ...identity } : null;
      }
      if (q.includes('FROM ledger_sync_state_v8')) {
        const row = syncState.get(`${params[0]}:${Number(params[1])}`);
        return row ? { ...row } : null;
      }
      if (q.includes('FROM ledger_v7_meta')) {
        const value = meta.get(params[0]);
        return value == null ? null : { value };
      }
      throw new Error('unexpected getFirstAsync: ' + q);
    },
    runAsync: async (sql, ...params) => {
      const q = flat(sql);
      if (q.startsWith('UPDATE ledger_sync_identity_v8')) {
        const [nextEpoch, updatedAt, ns, ledgerId, fromEpoch] = params;
        if (identity.namespace !== ns
            || identity.ledger_id !== ledgerId
            || Number(identity.restore_epoch) !== Number(fromEpoch)) {
          return { changes: 0 };
        }
        identity.restore_epoch = Number(nextEpoch);
        identity.updated_at = String(updatedAt);
        return { changes: 1 };
      }
      if (q.startsWith('INSERT OR IGNORE INTO ledger_sync_state_v8')) {
        const [ledgerId, epoch, , updatedAt] = params;
        const key = `${ledgerId}:${Number(epoch)}`;
        if (!syncState.has(key)) {
          // Mirrors the production column list: activated_at is NOT written here.
          syncState.set(key, {
            ledger_id: ledgerId,
            restore_epoch: Number(epoch),
            last_server_sequence: 0,
            last_success_at: null,
            last_device_id: null,
            shadow_last_server_sequence: 0,
            last_shadow_success_at: null,
            activated_at: null,
            updated_at: String(updatedAt),
          });
        }
        return { changes: 1 };
      }
      if (q.startsWith('INSERT OR REPLACE INTO ledger_v7_meta')) {
        meta.set(params[0], params[1]);
        return { changes: 1 };
      }
      if (q.startsWith('DELETE FROM ledger_v7_meta')) {
        return { changes: meta.delete(params[0]) ? 1 : 0 };
      }
      throw new Error('unexpected runAsync: ' + q);
    },
  };
  return db;
};

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const {
  readFinancialSyncProtocolV8,
  commitLedgerRestoreEpochV8,
} = compiled.exports;

(async () => {
  const db = makeDb();
  globalThis.__TEST_DB__ = db;

  // --- epoch 1: durably activated V2 with matching evidence ----------------
  db.syncState.set(`${LEDGER}:1`, {
    ledger_id: LEDGER,
    restore_epoch: 1,
    activated_at: '2026-08-19T10:00:00.000Z',
    last_success_at: '2026-08-19T10:05:00.000Z',
    last_shadow_success_at: '2026-08-19T09:59:00.000Z',
    shadow_last_server_sequence: 0,
    last_server_sequence: 0,
    updated_at: '2026-08-19T10:05:00.000Z',
  });
  db.meta.set(`sync_v2_activation_evidence:${NS}`, JSON.stringify({
    version: 1,
    namespace: NS,
    ledgerId: LEDGER,
    restoreEpoch: 1,
    bootstrapId: 'bootstrap-1',
    manifestHash: VALID_MANIFEST,
    readbackVerifiedAt: '2026-08-19T09:58:00.000Z',
    shadowValidatedAt: '2026-08-19T09:59:00.000Z',
    validationCursor: 0,
    activatedAt: '2026-08-19T10:00:00.000Z',
  }));

  const before = await readFinancialSyncProtocolV8({ namespace: NS, database: db });
  assert.equal(before.activeProtocolVersion, 2, 'epoch 1 must read as active V2');
  assert.equal(before.requiresV2Recovery, false);
  assert.equal(before.activationEvidenceValid, true);
  console.log('[PASS] durably activated epoch reads as ACTIVE V2');

  // --- advance the restore epoch 1 -> 2 ------------------------------------
  db.meta.set(`restore_intent:${NS}`, JSON.stringify({
    ledgerId: LEDGER,
    fromEpoch: 1,
    toEpoch: 2,
    operation: 'controlled_recovery',
  }));
  const committed = await commitLedgerRestoreEpochV8({
    namespace: NS,
    expectedFromEpoch: 1,
    toEpoch: 2,
    database: db,
  });
  assert.equal(committed.restoreEpoch, 2, 'commit must advance the epoch');
  assert.equal(db.identity.restore_epoch, 2);
  console.log('[PASS] restore epoch advanced 1 -> 2');

  const after = await readFinancialSyncProtocolV8({ namespace: NS, database: db });

  // --- THE REGRESSION -------------------------------------------------------
  // The device symptom was: identity says protocol v2 while the protocol read says
  // v1 and NOTHING distinguishes it from a ledger that simply never activated. The
  // invariant is that distinction, not any particular flag carrying it.
  assert.notEqual(
    after.activationState, 'NOT_YET_ACTIVATED',
    'REGRESSION: epoch advance is indistinguishable from a never-activated V1 ledger '
    + `(activeProtocolVersion=${after.activeProtocolVersion}, `
    + `identity.protocolVersion=${db.identity.protocol_version})`,
  );
  assert.equal(after.activationState, 'EPOCH_ACTIVATION_REQUIRED');
  assert.equal(after.epochActivationPending?.previouslyActivated, true);
  // requiresV2Recovery is reserved for the unsafe case (no activation yet a
  // production cursor already moved). A superseding epoch is safe to resume, and
  // flagging it here would make runControlledFinancialV2Activation refuse the very
  // bootstrap+activation sequence the new epoch needs.
  assert.equal(
    after.requiresV2Recovery, false,
    'a superseding epoch must stay resumable, not be routed to manual recovery',
  );
  console.log('[PASS] superseding epoch is distinguishable and resumable');

  // Checked after the primary regression assertion so that running this test
  // against pre-fix sources fails on the real symptom, not on a missing field.
  assert.equal(before.activationState, 'ACTIVE');

  // Stale evidence from the superseded epoch must not be presented as this
  // epoch's evidence.
  assert.equal(after.activationEvidence, null, 'epoch 1 evidence must not leak into epoch 2');
  assert.equal(after.restoreEpoch, 2);
  console.log('[PASS] superseded activation evidence does not carry forward');

  // The superseded evidence itself is retained as immutable history.
  assert.ok(db.meta.has(`sync_v2_activation_evidence:${NS}`), 'superseded evidence retained');
  const pending = JSON.parse(db.meta.get(`sync_v2_epoch_activation_pending:${NS}:${LEDGER}:2`));
  assert.equal(pending.previouslyActivated, true);
  assert.equal(pending.fromEpoch, 1);
  assert.equal(pending.toEpoch, 2);
  console.log('[PASS] supersession is recorded with its provenance');

  // --- a SECOND consecutive advance must not lose the supersession fact ----
  // Found by code review of the first fix: with a namespace-only marker the 2->3
  // advance overwrote previouslyActivated with false and the silent V1 fallback
  // came straight back.
  db.meta.set(`restore_intent:${NS}`, JSON.stringify({
    ledgerId: LEDGER,
    fromEpoch: 2,
    toEpoch: 3,
    operation: 'controlled_recovery',
  }));
  await commitLedgerRestoreEpochV8({
    namespace: NS,
    expectedFromEpoch: 2,
    toEpoch: 3,
    database: db,
  });
  const after2 = await readFinancialSyncProtocolV8({ namespace: NS, database: db });
  assert.notEqual(
    after2.activationState, 'NOT_YET_ACTIVATED',
    'REGRESSION: a second consecutive epoch advance lost the supersession fact '
    + `(activeProtocolVersion=${after2.activeProtocolVersion}, `
    + `activationState=${after2.activationState})`,
  );
  assert.equal(after2.epochActivationPending?.previouslyActivated, true);
  assert.equal(after2.requiresV2Recovery, false);
  assert.equal(after2.activationState, 'EPOCH_ACTIVATION_REQUIRED');
  console.log('[PASS] supersession survives consecutive epoch advances');

  // --- the genuinely unsafe case must still demand recovery ----------------
  // Not activated, but a production cursor already moved. Narrowing
  // requiresV2Recovery must not lose this.
  const unsafe = makeDb();
  globalThis.__TEST_DB__ = unsafe;
  unsafe.identity.restore_epoch = 1;
  unsafe.syncState.set(`${LEDGER}:1`, {
    ledger_id: LEDGER,
    restore_epoch: 1,
    activated_at: null,
    last_server_sequence: 42,
    updated_at: `2026-08-20T00:00:00.000Z`,
  });
  const cursorMoved = await readFinancialSyncProtocolV8({ namespace: NS, database: unsafe });
  assert.equal(cursorMoved.requiresV2Recovery, true, "advanced production cursor still demands recovery");
  console.log('[PASS] unactivated ledger with a moved production cursor still demands recovery');

  // --- a ledger that never activated must stay plain V1, not "recovery" -----
  const fresh = makeDb();
  globalThis.__TEST_DB__ = fresh;
  const never = await readFinancialSyncProtocolV8({ namespace: NS, database: fresh });
  assert.equal(never.activeProtocolVersion, 1);
  assert.equal(never.requiresV2Recovery, false);
  assert.equal(never.activationState, 'NOT_YET_ACTIVATED');
  console.log('[PASS] never-activated ledger is NOT_YET_ACTIVATED, not a recovery event');

  console.log('MYFI P20-G01-D2 RESTORE-EPOCH ACTIVATION REGRESSION: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
