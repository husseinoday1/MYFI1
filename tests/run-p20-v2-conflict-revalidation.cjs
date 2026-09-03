// Phase 12 — a recorded conflict must not outlive the state that caused it.
//
// A preflight failure records the command in ledger_inbox_v3 as 'conflict'. That
// was checked before any processing and returned for the whole group, and the
// cursor never advanced past a refused group, so one conflict silently stopped
// every later command too. Nothing could clear it after activation: the reset
// refuses on an activated ledger, and the only other paths are a full promotion
// or a local wipe. A device that later converged stayed stopped forever.
//
// Re-running the preflight is the staleness check. These cases hold that line
// from both sides: a conflict that still holds must still fail, and one that has
// been resolved must go through.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialLedgerV7Repository.js');
const raw = fs.readFileSync(filename, 'utf8');
const ddl = name => {
  const match = raw.match(new RegExp('export const ' + name + ' = `([\\s\\S]*?)`;'));
  assert(match, name + ' DDL missing');
  return match[1];
};

let source = raw
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace(
    "import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';",
    [
      'const enqueueLedgerWrite = task => task();',
      'const getLedgerDb = async () => globalThis.__TEST_DB__;',
      'const runLedgerExclusiveTransaction = async (db, task) => {',
      "  db.native.exec('BEGIN IMMEDIATE');",
      "  try { const value = await task(db); db.native.exec('COMMIT'); return value; }",
      "  catch (error) { db.native.exec('ROLLBACK'); throw error; }",
      '};',
    ].join('\n'),
  )
  .replace("import { runLedgerSchemaMigrations } from './financialLedgerSchemaMigrations';", 'const runLedgerSchemaMigrations = async () => true;')
  .replace(
    /import \{\s*buildExpenseLedgerCommand,\s*buildFinancialLedgerCommand,\s*FINANCIAL_LEDGER_SCHEMA_VERSION,\s*\} from '\.\/financialLedgerV7Model';/,
    'const buildExpenseLedgerCommand = () => null; const buildFinancialLedgerCommand = () => null; const FINANCIAL_LEDGER_SCHEMA_VERSION = 12;',
  )
  .replace("import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';", 'const cloudWorkspaceCfg = value => value || {}; const mergeCloudWorkspaceCfg = (left, right) => ({ ...left, ...right });')
  .replace(/import \{[\s\S]*?\} from '\.\/localArchiveRepository';/, [
    'const ensureColdArchiveSchema = async () => true;',
    'const clearColdArchiveNamespaceInTransaction = async () => {};',
    'const replaceColdArchiveNamespaceFromStageInTransaction = async () => {};',
  ].join('\n'))
  .replace(/import \{[\s\S]*?\} from '\.\/financialLiveGenerationV13';/, [
    'const advanceLiveGenerationForMutationInTransactionV13 = async () => ({ generation: 0 });',
    'const rebindLiveGenerationForRestoreEpochInTransactionV13 = async () => ({ generation: 0 });',
    'const readLiveGenerationInTransactionV13 = async () => ({ generation: 0 });',
  ].join('\n'))
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += '\nmodule.exports = { applyRemoteLedgerMutationsV8 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { applyRemoteLedgerMutationsV8 } = compiled.exports;

class Db {
  constructor() { this.native = new DatabaseSync(':memory:'); this.native.exec('PRAGMA foreign_keys=ON;'); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const out = this.native.prepare(String(sql)).run(...params); return { changes: Number(out.changes || 0) }; }
}

const NS = 'user:revalidate';
const LEDGER = 'ledger-revalidate';
const EPOCH = 1;
const now = '2026-09-03T10:00:00.000Z';

const walletCommand = ({ revision, sequence, payload = { name: 'Cash' } }) => ({
  ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutationId: `mut2-${sequence}`, serverSequence: sequence,
  commandId: `cmd2-${sequence}`, commandSequence: sequence, commandMutationCount: 1,
  entityType: 'wallet', entityId: 'wallet-1', operation: 'upsert',
  revision, baseRevision: revision - 1,
  protocolVersion: 2, minimumSupportedVersion: 2, payloadSchemaVersion: 1,
  payload: { entityType: 'wallet', id: 'wallet-1', revision, payload },
});

// The command the device could not apply, and later could.
const BLOCKED = walletCommand({ revision: 3, sequence: 310, payload: { name: 'Renamed' } });
const NEXT = walletCommand({ revision: 4, sequence: 311, payload: { name: 'Renamed again' } });

const createDb = ({ localRevision, activated = true, tombstone = true } = {}) => {
  const db = new Db();
  db.native.exec(ddl('FINANCIAL_LEDGER_V7_SCHEMA_SQL'));
  db.native.exec(ddl('FINANCIAL_LEDGER_V8_SYNC_IDENTITY_SQL'));
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', NS, LEDGER, EPOCH, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8(ledger_id,restore_epoch,shadow_last_server_sequence,last_server_sequence,activated_at,updated_at) VALUES (?,?,?,?,?,?)', LEDGER, EPOCH, 0, 0, activated ? now : null, now);
  run('INSERT INTO ledger_workspace_state_v7(namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)', NS, 'sqlite', 12, '{}', now);
  run('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) VALUES (?,?,?,?,NULL,?,?,?)',
    NS, 'wallet', 'wallet-1', localRevision, JSON.stringify({ name: 'Cash' }), now, now);
  if (tombstone) {
    // What a previous failed attempt left behind.
    run('INSERT INTO ledger_inbox_v3(ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at) VALUES (?,?,?,?,?,?,?,?,NULL)',
      LEDGER, EPOCH, BLOCKED.mutationId, BLOCKED.commandId, BLOCKED.commandSequence, BLOCKED.serverSequence, now, 'conflict');
  }
  globalThis.__TEST_DB__ = db;
  return db;
};

const apply = (db, mutations, allowProductionApply) => applyRemoteLedgerMutationsV8({
  namespace: NS, ledgerId: LEDGER, restoreEpoch: EPOCH,
  mutations, deviceId: 'device-test', allowProductionApply, database: db,
});

const wallet = db => db.native.prepare('SELECT revision,payload_json FROM ledger_entities_v7 WHERE namespace=? AND entity_type=? AND id=?').get(NS, 'wallet', 'wallet-1');
const inboxOf = db => db.native.prepare('SELECT mutation_id,apply_status FROM ledger_inbox_v3 WHERE ledger_id=? ORDER BY mutation_id')
  .all(LEDGER)
  .map(row => ({ mutation_id: row.mutation_id, apply_status: row.apply_status }));

(async () => {
  for (const production of [true, false]) {
    const mode = production ? 'production' : 'shadow';

    // 1) The state that caused the conflict is gone: local is now at revision 2,
    //    exactly what the command expects. It must go through.
    {
      const db = createDb({ localRevision: 2 });
      const result = await apply(db, [BLOCKED], production);
      assert.equal(result.ok, true, `${mode}: a resolved conflict must revalidate: ${JSON.stringify(result)}`);
      assert.equal(result.processed, 1);
      if (production) {
        assert.equal(wallet(db).revision, 3, 'production must actually apply it');
        assert.equal(JSON.parse(wallet(db).payload_json).name, 'Renamed');
        assert.deepEqual(inboxOf(db), [{ mutation_id: BLOCKED.mutationId, apply_status: 'applied' }],
          'the tombstone must be replaced by the applied record');
      } else {
        assert.equal(wallet(db).revision, 2, 'shadow must still write nothing');
      }
      db.native.close();
    }

    // 2) The conflict still holds: it must still fail, and now with the live
    //    numbers rather than a cached code.
    {
      const db = createDb({ localRevision: 5 });
      const result = await apply(db, [BLOCKED], production);
      assert.equal(result.ok, false, `${mode}: a standing conflict must still fail`);
      assert.equal(result.reason, 'financial_v2_remote_cas_conflict',
        `${mode}: the live reason must surface, not the cached one`);
      assert.equal(result.conflicts[0].currentRevision, 5, 'the caller must get the real numbers');
      assert.equal(result.previouslyConflicted, true, 'the earlier failure is still reported');
      assert.equal(wallet(db).revision, 5, 'a refused command must change nothing');
      db.native.close();
    }
  }

  // 3) The whole point: one tombstone must not stop the commands behind it. With
  //    the block resolved, the chain drains in a single pass.
  {
    const db = createDb({ localRevision: 2 });
    const result = await apply(db, [BLOCKED, NEXT], true);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.applied, 2, 'the command behind the tombstone must land too');
    assert.equal(result.cursor, 311, 'the cursor must move past both');
    assert.equal(wallet(db).revision, 4);
    assert.equal(JSON.parse(wallet(db).payload_json).name, 'Renamed again');
    db.native.close();
  }

  // 4) The double-apply guard is untouched: an applied command is still skipped
  //    and never runs twice.
  {
    const db = createDb({ localRevision: 3, tombstone: false });
    db.native.prepare('INSERT INTO ledger_inbox_v3(ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence,received_at,apply_status,applied_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(LEDGER, EPOCH, BLOCKED.mutationId, BLOCKED.commandId, BLOCKED.commandSequence, BLOCKED.serverSequence, now, 'applied', now);
    const before = wallet(db);
    const result = await apply(db, [BLOCKED], true);
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.applied, 0, 'an applied command must never be applied again');
    assert.deepEqual(wallet(db), before);
    db.native.close();
  }

  // 5) No tombstone, ordinary conflict: unchanged behaviour, and no diagnostic
  //    flag invented where there was no earlier failure.
  {
    const db = createDb({ localRevision: 5, tombstone: false });
    const result = await apply(db, [BLOCKED], true);
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'financial_v2_remote_cas_conflict');
    assert.equal(result.previouslyConflicted, undefined,
      'previouslyConflicted must only appear when there really was one');
    db.native.close();
  }

  console.log('MYFI P20 V2 CONFLICT REVALIDATION RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
