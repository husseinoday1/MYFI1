// Phase 12 — a process restart must be able to re-expose one already-proven
// conflict-recovery intent without creating another private checkpoint.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const recoveryTarget = path.join(root, 'src/lib/financialV2ConflictRecoveryV1.js');
const promotionTarget = path.join(root, 'src/lib/financialBootstrapRecoveryPromotionV2.js');
const sliceTarget = path.join(root, 'src/store/slices/useSyncSlice.js');
const settingsTarget = path.join(root, 'src/screens/SettingsScreen.js');
const now = '2026-09-02T00:00:00.000Z';

class Db {
  constructor() {
    this.native = new DatabaseSync(':memory:');
    this.native.exec(`
      CREATE TABLE ledger_v7_meta (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_identity_v8 (namespace TEXT PRIMARY KEY, ledger_id TEXT, restore_epoch INTEGER, protocol_version INTEGER, minimum_supported_version INTEGER, created_at TEXT, updated_at TEXT);
      CREATE TABLE ledger_sync_state_v8 (ledger_id TEXT, restore_epoch INTEGER, activated_at TEXT);
      CREATE TABLE ledger_workspace_state_v7 (namespace TEXT PRIMARY KEY, payload_json TEXT);
      CREATE TABLE ledger_entities_v7 (namespace TEXT, entity_type TEXT, id TEXT, revision INTEGER, deleted_at TEXT, payload_json TEXT, created_at TEXT, updated_at TEXT);
      CREATE TABLE ledger_outbox_v2 (namespace TEXT, acknowledged_at TEXT);
      CREATE TABLE ledger_outbox_v3 (sequence_id INTEGER PRIMARY KEY AUTOINCREMENT, namespace TEXT, ledger_id TEXT, restore_epoch INTEGER, mutation_id TEXT, command_id TEXT, entity_type TEXT, entity_id TEXT, operation TEXT, revision INTEGER, base_revision INTEGER, payload_json TEXT, acknowledged_at TEXT, superseded_by_bootstrap_id TEXT);
      CREATE TABLE ledger_accounts_v7 (namespace TEXT);
      CREATE TABLE ledger_exchange_rates_v7 (namespace TEXT);
      CREATE TABLE ledger_financial_transactions_v7 (namespace TEXT);
      CREATE TABLE ledger_postings_v7 (namespace TEXT);
      CREATE TABLE ledger_transaction_links_v7 (namespace TEXT);
      CREATE TABLE cold_archive_years (namespace TEXT);
      CREATE TABLE cold_archive_transactions (namespace TEXT);
    `);
  }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async getAllAsync(sql, ...params) { return this.native.prepare(String(sql)).all(...params); }
  async runAsync(sql, ...params) { const result = this.native.prepare(String(sql)).run(...params); return { changes: Number(result.changes || 0) }; }
}

const compile = (filename, mocks) => {
  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const compiled = new Module(filename, module);
    compiled.filename = filename;
    compiled.paths = Module._nodeModulePaths(path.dirname(filename));
    compiled._compile(babel.transformFileSync(filename, {
      babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
    }).code, filename);
    return compiled.exports;
  } finally { Module._load = originalLoad; }
};

let promotionSource = fs.readFileSync(promotionTarget, 'utf8')
  .replace("import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';", 'const runFinancialRestorePromotionTransactionV8 = async () => { throw new Error("not called"); };')
  .replace("import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';", [
    'const readLiveGenerationInTransactionV13 = async ({ database, namespace, ledgerId, restoreEpoch }) => {',
    '  const row = await database.getFirstAsync("SELECT value FROM ledger_v7_meta WHERE key=?", `financial_live_generation_v13:${namespace}`);',
    '  const token = JSON.parse(String(row?.value || "{}"));',
    '  if (token.namespace !== namespace || token.ledgerId !== ledgerId || Number(token.restoreEpoch) !== Number(restoreEpoch)) throw new Error("financial_live_generation_binding_invalid");',
    '  return token;',
    '};',
  ].join('\n'))
  .replace(/export const /g, 'const ');
promotionSource += '\nmodule.exports = { assertConflictCheckpoint, assertOnlyPreparedWorkspaceMutations };\n';
const promotionModule = new Module(promotionTarget, module);
promotionModule.filename = promotionTarget;
promotionModule.paths = Module._nodeModulePaths(path.dirname(promotionTarget));
promotionModule._compile(promotionSource, promotionTarget);
const promotion = promotionModule.exports;

const staleWorkspacePayload = namespace => JSON.stringify({
  namespace, entityType: 'workspace', id: 'workspace', revision: 2, baseRevision: 1,
  payload: { cfg: { currency: 'IQD' }, notif: {}, cloudRevision: 1 }, createdAt: now, updatedAt: now,
});

const createFixture = (namespace = 'user:resume') => {
  const db = new Db();
  const ledgerId = `ledger-${namespace}`;
  const stageNamespace = `${namespace}::bootstrap-stage::resume`;
  const checkpointId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const checkpointNamespace = `${namespace}::conflict-recovery-checkpoint::${checkpointId}`;
  const run = (sql, ...params) => db.native.prepare(sql).run(...params);
  run('INSERT INTO ledger_sync_identity_v8 VALUES (?,?,?,?,?,?,?)', namespace, ledgerId, 1, 2, 2, now, now);
  run('INSERT INTO ledger_sync_state_v8 VALUES (?,?,?)', ledgerId, 1, now);
  run('INSERT INTO ledger_workspace_state_v7 VALUES (?,?)', namespace, '{"cfg":{"currency":"IQD"}}');
  run('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)', namespace, 'workspace', 'workspace', 6, null, '{}', now, now);
  run('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)', stageNamespace, 'workspace', 'workspace', 7, null, '{}', now, now);
  run('INSERT INTO ledger_v7_meta VALUES (?,?,?)', `financial_live_generation_v13:${namespace}`, JSON.stringify({ tokenVersion: 1, namespace, ledgerId, restoreEpoch: 1, generation: 4 }), now);
  run('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json,acknowledged_at,superseded_by_bootstrap_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)', namespace, ledgerId, 1, 'stale-workspace', 'command-workspace', 'workspace', 'workspace', 'upsert', 2, 1, staleWorkspacePayload(namespace), null, null);
  return { db, namespace, ledgerId, stageNamespace, checkpointId, checkpointNamespace };
};

const checkpoint = async ({ namespace, checkpointId, database }) => {
  const fixture = database.__fixture;
  assert.equal(namespace, fixture.namespace);
  assert.equal(checkpointId, fixture.checkpointId);
  await database.runAsync('INSERT INTO ledger_workspace_state_v7(namespace,payload_json) SELECT ?,payload_json FROM ledger_workspace_state_v7 WHERE namespace=?', fixture.checkpointNamespace, namespace);
  await database.runAsync('INSERT INTO ledger_entities_v7(namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at) SELECT ?,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at FROM ledger_entities_v7 WHERE namespace=?', fixture.checkpointNamespace, namespace);
  const receipt = {
    version: 1, checkpointId, checkpointNamespace: fixture.checkpointNamespace,
    ledgerId: fixture.ledgerId, restoreEpoch: 1, sourceGeneration: 4,
    counts: { accounts: 0, exchangeRates: 0, transactions: 0, postings: 0, links: 0, entities: 1, workspace: 1, coldArchiveYears: 0, coldArchiveTransactions: 0 },
  };
  await database.runAsync('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)', `financial_v2_conflict_checkpoint_v1:${namespace}:${checkpointId}`, JSON.stringify(receipt), now);
  return { ok: true, checkpoint: receipt };
};
globalThis.__resumeCheckpoint = checkpoint;
globalThis.__resumePromotion = promotion;

let recoverySource = fs.readFileSync(recoveryTarget, 'utf8')
  .replace("import { getLedgerDb } from './ledgerDatabase';", 'const getLedgerDb = async () => null;')
  .replace(/import \{\s*createFinancialConflictRecoveryCheckpointV1,\s*runFinancialRestorePromotionTransactionV8,\s*\} from '\.\/financialLedgerV7Repository';/, [
    'const createFinancialConflictRecoveryCheckpointV1 = globalThis.__resumeCheckpoint;',
    'const runFinancialRestorePromotionTransactionV8 = async ({ database, task }) => task({ database });',
  ].join('\n'))
  .replace("import { readLiveGenerationInTransactionV13 } from './financialLiveGenerationV13';", [
    'const readLiveGenerationInTransactionV13 = async ({ database, namespace, ledgerId, restoreEpoch }) => {',
    '  const row = await database.getFirstAsync("SELECT value FROM ledger_v7_meta WHERE key=?", `financial_live_generation_v13:${namespace}`);',
    '  const token = JSON.parse(String(row?.value || "{}"));',
    '  if (token.namespace !== namespace || token.ledgerId !== ledgerId || Number(token.restoreEpoch) !== Number(restoreEpoch)) throw new Error("financial_live_generation_binding_invalid");',
    '  return token;',
    '};',
  ].join('\n'))
  .replace("import { stageVerifiedBootstrapWithArchiveV2 } from './financialBootstrapRecoveryCoordinatorV2';", [
    'const stageVerifiedBootstrapWithArchiveV2 = async ({ database }) => ({',
    '  ok: true,',
    '  bootstrapSource: { ledgerId: database.__fixture.ledgerId, restoreEpoch: 1, bootstrapId: "bootstrap-1", manifestHash: "a".repeat(64), expectedRowCount: 1 },',
    '  archiveHead: { archivePresent: false, archiveGeneration: 0, snapshotId: "", manifestHash: "", expectedRowCount: 0 },',
    '  bootstrapSessionId: "hot", archiveSessionId: "cold", bootstrap: { session: { stage_namespace: database.__fixture.stageNamespace } },',
    '});',
  ].join('\n'))
  .replace(/import \{\s*assertConflictCheckpoint,\s*assertOnlyPreparedWorkspaceMutations,\s*promotePreparedCloudConflictRecoveryV1,\s*\} from '\.\/financialBootstrapRecoveryPromotionV2';/, [
    'const assertConflictCheckpoint = globalThis.__resumePromotion.assertConflictCheckpoint;',
    'const assertOnlyPreparedWorkspaceMutations = globalThis.__resumePromotion.assertOnlyPreparedWorkspaceMutations;',
    'const promotePreparedCloudConflictRecoveryV1 = async () => ({ ok: true });',
  ].join('\n'))
  .replace("import { createSecureUuidV4 } from './secureUuid';", 'const createSecureUuidV4 = () => "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";')
  .replace(/export const /g, 'const ');
recoverySource += '\nmodule.exports = { prepareVerifiedCloudConflictRecoveryV1, resumePreparedCloudConflictRecoveryV1 };\n';
const recoveryModule = new Module(recoveryTarget, module);
recoveryModule.filename = recoveryTarget;
recoveryModule.paths = Module._nodeModulePaths(path.dirname(recoveryTarget));
recoveryModule._compile(recoverySource, recoveryTarget);
const recovery = recoveryModule.exports;

const prepare = async fixture => {
  fixture.db.__fixture = fixture;
  const result = await recovery.prepareVerifiedCloudConflictRecoveryV1({
    supabase: { rpc: async () => ({}) }, namespace: fixture.namespace, accountId: 'account-1', database: fixture.db,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
};

const resume = fixture => recovery.resumePreparedCloudConflictRecoveryV1({
  namespace: fixture.namespace, accountId: 'account-1', database: fixture.db,
});

const testSliceResumeRouting = async () => {
  const source = fs.readFileSync(sliceTarget, 'utf8');
  const start = source.indexOf('prepareV2ConflictRecovery: async () => {');
  const end = source.indexOf('\n\n  confirmV2ConflictRecovery:', start);
  assert.ok(start >= 0 && end > start, 'prepareV2ConflictRecovery source is missing');
  let handler = source.slice(start, end).trim().replace(/^prepareV2ConflictRecovery:\s*/, '');
  if (handler.endsWith(',')) handler = handler.slice(0, -1);
  const build = new Function('get', 'set', 'supabase', 'workspaceNamespaceForSession', 'getLedgerNamespace', 'resumePreparedCloudConflictRecoveryV1', 'prepareVerifiedCloudConflictRecoveryV1', `return (${handler});`);
  const run = async ({ resumed, lastSyncError = 'financial_v2_revision_conflict', online = true, syncing = false }) => {
    let resumeCalls = 0; let prepareCalls = 0;
    const state = {
      user: { id: 'account-1' }, cfg: {}, workspaceReady: true, online, syncing,
      lastSyncError, workspaceNamespace: 'user:store-test',
      runFinancialMaintenance: async (_name, task) => task(),
    };
    const action = build(
      () => state, patch => Object.assign(state, patch), {}, () => state.workspaceNamespace, namespace => namespace,
      async () => { resumeCalls += 1; return resumed; },
      async () => { prepareCalls += 1; return { ok: true, intent: { local: { checkpointId: 'new-checkpoint' } } }; },
    );
    const result = await action();
    return { result, resumeCalls, prepareCalls, state };
  };
  const resumed = await run({
    resumed: { ok: true, found: true, resumed: true, intent: { local: { checkpointId: 'existing-checkpoint' } } },
    lastSyncError: 'ledger_queue_reentrant_from_read_transaction', online: false, syncing: true,
  });
  assert.equal(resumed.resumeCalls, 1);
  assert.equal(resumed.prepareCalls, 0, 'resume must not create a second checkpoint');
  assert.equal(resumed.state.restoreSafety.checkpointId, 'existing-checkpoint');
  assert.equal(resumed.state.restoreSafety.status, 'financial_v2_conflict_recovery_ready');
  const absent = await run({ resumed: { ok: false, found: false }, lastSyncError: 'ledger_queue_reentrant_from_read_transaction' });
  assert.equal(absent.resumeCalls, 1);
  assert.equal(absent.prepareCalls, 0, 'an absent intent must not weaken new-preparation eligibility');
  assert.equal(absent.result.reason, 'financial_v2_conflict_recovery_not_eligible');
  const normalPreparation = await run({ resumed: { ok: false, found: false } });
  assert.equal(normalPreparation.prepareCalls, 1, 'normal preparation must run only when no prepared intent exists and the conflict is live');
};

const testSliceRestartRehydration = async fixture => {
  const source = fs.readFileSync(sliceTarget, 'utf8');
  const start = source.indexOf('loadLocal: async (requestedNamespace = null, options = {}) => {');
  const end = source.indexOf('      const demoSnapshot =', start);
  assert.ok(start >= 0 && end > start, 'loadLocal rehydration path is missing');
  let handler = `${source.slice(start, end)}      return true;\n    } catch (error) { throw error; }\n  }`;
  handler = handler.trim().replace(/^loadLocal:\s*/, '');
  const build = new Function(
    'get', 'set', 'readActiveLocalLedgerNamespace', 'GUEST_NAMESPACE', 'readResetMarker',
    'resumePreparedCloudConflictRecoveryV1', 'getLedgerNamespace', 'DEF_CFG', `return (${handler});`,
  );
  for (const lastSyncError of [null, 'ledger_queue_reentrant_from_read_transaction']) {
    const state = { user: { id: 'account-1' }, cfg: {}, restoreSafety: null, lastSyncError };
    const action = build(
      () => state,
      patch => Object.assign(state, patch),
      async () => fixture.namespace,
      'guest',
      async namespace => { assert.equal(namespace, fixture.namespace); return {}; },
      input => recovery.resumePreparedCloudConflictRecoveryV1({ ...input, database: fixture.db }),
      namespace => namespace,
      {},
    );
    assert.equal(await action(fixture.namespace, { maintenanceOwned: true }), true);
    assert.equal(state.restoreSafety?.status, 'financial_v2_conflict_recovery_ready');
    assert.equal(state.restoreSafety?.checkpointId, fixture.checkpointId);
    assert.equal(fixture.db.native.prepare("SELECT COUNT(*) AS n FROM ledger_v7_meta WHERE key LIKE 'financial_v2_conflict_checkpoint_v1:%'").get().n, 1, 'restart rehydration must not create a second checkpoint');
  }
  const settings = fs.readFileSync(settingsTarget, 'utf8');
  assert.match(settings, /restoreSafety\?\.status === 'financial_v2_conflict_recovery_blocked'/);
  assert.match(settings, /restoreSafety\?\.operation === 'financial_v2_conflict_recovery'/);
};

(async () => {
  const basic = createFixture();
  const prepared = await prepare(basic);
  const resumed = await resume(basic);
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  assert.equal(resumed.intent.local.checkpointId, prepared.intent.local.checkpointId);
  assert.equal(basic.db.native.prepare("SELECT COUNT(*) AS n FROM ledger_v7_meta WHERE key LIKE 'financial_v2_conflict_checkpoint_v1:%'").get().n, 1, 'resume must not create a second checkpoint');
  await testSliceRestartRehydration(basic);

  const wrongAccount = await recovery.resumePreparedCloudConflictRecoveryV1({ namespace: basic.namespace, accountId: 'another-account', database: basic.db });
  assert.equal(wrongAccount.ok, false);
  assert.equal(wrongAccount.reason, 'financial_v2_conflict_recovery_resume_intent_invalid');

  const extraMutation = createFixture('user:resume-extra');
  await prepare(extraMutation);
  extraMutation.db.native.prepare('INSERT INTO ledger_outbox_v3(namespace,ledger_id,restore_epoch,mutation_id,command_id,entity_type,entity_id,operation,revision,base_revision,payload_json,acknowledged_at,superseded_by_bootstrap_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)').run(extraMutation.namespace, extraMutation.ledgerId, 1, 'unexpected-workspace', 'command-unexpected', 'workspace', 'workspace', 'upsert', 2, 1, staleWorkspacePayload(extraMutation.namespace), null, null);
  const extraRejected = await resume(extraMutation);
  assert.equal(extraRejected.ok, false);
  assert.equal(extraRejected.reason, 'financial_v2_conflict_recovery_promotion_pending_state_changed');

  const generationChanged = createFixture('user:resume-generation');
  await prepare(generationChanged);
  generationChanged.db.native.prepare('UPDATE ledger_v7_meta SET value=? WHERE key=?').run(JSON.stringify({ tokenVersion: 1, namespace: generationChanged.namespace, ledgerId: generationChanged.ledgerId, restoreEpoch: 1, generation: 5 }), `financial_live_generation_v13:${generationChanged.namespace}`);
  const generationRejected = await resume(generationChanged);
  assert.equal(generationRejected.ok, false);
  assert.equal(generationRejected.reason, 'financial_v2_conflict_recovery_promotion_generation_changed');

  const restoreActive = createFixture('user:resume-restore-active');
  await prepare(restoreActive);
  restoreActive.db.native.prepare('INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)').run(`restore_intent:${restoreActive.namespace}`, '{}', now);
  const restoreRejected = await resume(restoreActive);
  assert.equal(restoreRejected.ok, false);
  assert.equal(restoreRejected.reason, 'financial_v2_conflict_recovery_resume_restore_intent_active');

  await testSliceResumeRouting();
  console.log('MYFI P20 V2 CONFLICT RECOVERY RESUME SQLITE RUNTIME: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
