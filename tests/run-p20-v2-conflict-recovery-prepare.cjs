// Runtime-shaped unit proof for the guarded non-empty conflict preparation.
// It proves a stale workspace-only command can be checkpointed, while a
// financial command is rejected before any checkpoint is created.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialV2ConflictRecoveryV1.js');
let checkpointCalls = 0; let promotionCalls = 0; let changedCloud = false;
let unsafe = false;
const now = '2026-09-01T12:00:00.000Z';
const source = {
  ledgerId: 'ledger-1', restoreEpoch: 1, bootstrapId: 'bootstrap-1',
  manifestHash: 'a'.repeat(64), expectedRowCount: 9,
};

const workspaceRow = () => ({
  sequence_id: 12, mutation_id: 'mutation-workspace', command_id: 'command-workspace',
  namespace: 'user:owner', ledger_id: 'ledger-1', restore_epoch: 1,
  entity_type: unsafe ? 'financial_transaction' : 'workspace', entity_id: unsafe ? 'tx-1' : 'workspace',
  operation: 'upsert', revision: 2, base_revision: 1,
  payload_json: JSON.stringify(unsafe ? {
    namespace: 'user:owner', entityType: 'financial_transaction', id: 'tx-1', revision: 2, baseRevision: 1,
    payload: { transaction: { amount: 10 } }, createdAt: now, updatedAt: now,
  } : {
    namespace: 'user:owner', entityType: 'workspace', id: 'workspace', revision: 2, baseRevision: 1,
    payload: { cfg: { currency: 'IQD' }, notif: {}, cloudRevision: 1 }, createdAt: now, updatedAt: now,
  }),
});

const meta = new Map();
const db = {
  async getFirstAsync(sql, ...params) {
    const text = String(sql);
    if (text.includes('SELECT activated_at')) return { activated_at: now };
    if (text.includes('ledger_workspace_state_v7')) return { present: 1 };
    if (text.includes("entity_type='workspace'")) return { revision: 7, deleted_at: null };
    if (text.includes('COUNT(*) AS n FROM ledger_outbox_v2')) return { n: 3 };
    if (text.includes('ledger_v7_meta')) return meta.has(String(params[0])) ? { value: meta.get(String(params[0])) } : null;
    if (text.includes('ledger_sync_identity_v8')) return { namespace: 'user:owner', ledger_id: 'ledger-1', restore_epoch: 1 };
    return null;
  },
  async getAllAsync(sql) {
    if (String(sql).includes('FROM ledger_outbox_v3')) return [workspaceRow()];
    return [];
  },
  async runAsync(sql, ...params) {
    if (String(sql).startsWith('INSERT INTO ledger_v7_meta')) meta.set(String(params[0]), String(params[1]));
    return { changes: 1 };
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename !== target) return originalLoad.call(this, request, parent, isMain);
  if (request === './ledgerDatabase') return { getLedgerDb: async () => db };
  if (request === './financialLedgerV7Repository') return {
    createFinancialConflictRecoveryCheckpointV1: async ({ checkpointId }) => {
      checkpointCalls += 1;
      const checkpoint = { checkpointId, checkpointNamespace: `user:owner::conflict-recovery-checkpoint::${checkpointId}`, ledgerId: 'ledger-1', restoreEpoch: 1, sourceGeneration: 4 };
      meta.set(`financial_v2_conflict_checkpoint_v1:user:owner:${checkpointId}`, JSON.stringify(checkpoint));
      return { ok: true, checkpoint };
    },
    runFinancialRestorePromotionTransactionV8: async ({ task }) => task({ database: db }),
  };
  if (request === './financialLiveGenerationV13') return { readLiveGenerationInTransactionV13: async () => ({ generation: 4 }) };
  if (request === './financialBootstrapRecoveryCoordinatorV2') return { stageVerifiedBootstrapWithArchiveV2: async () => ({
    ok: true, bootstrapSource: changedCloud ? { ...source, bootstrapId: 'changed-bootstrap' } : source,
    archiveHead: { archivePresent: false, archiveGeneration: 0, snapshotId: '', manifestHash: '', expectedRowCount: 0 },
    bootstrapSessionId: 'hot-session', archiveSessionId: 'cold-session',
    bootstrap: { session: { stage_namespace: 'user:owner::bootstrap-stage::hot' } },
  }) };
  if (request === './financialBootstrapRecoveryPromotionV2') return { promotePreparedCloudConflictRecoveryV1: async input => { promotionCalls += 1; assert.equal(input.confirmed, true); return { ok: true, promoted: true }; } };
  if (request === './secureUuid') return { createSecureUuidV4: () => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' };
  return originalLoad.call(this, request, parent, isMain);
};
const compiled = new Module(target, module); compiled.filename = target; compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
Module._load = originalLoad;

(async () => {
  const prepared = await compiled.exports.prepareVerifiedCloudConflictRecoveryV1({ supabase: { rpc: async () => ({}) }, namespace: 'user:owner', accountId: 'owner', database: db });
  assert.equal(prepared.ok, true, JSON.stringify(prepared));
  assert.equal(prepared.status, 'ready_for_explicit_cloud_replacement');
  assert.equal(prepared.intent.local.legacyOutboxCount, 3);
  assert.equal(checkpointCalls, 1);
  const confirmed = await compiled.exports.confirmPreparedCloudConflictRecoveryV1({ supabase: { rpc: async () => ({}) }, namespace: 'user:owner', accountId: 'owner', confirmed: true, database: db });
  assert.equal(confirmed.ok, true);
  assert.equal(promotionCalls, 1, 'confirmation must be the only route to promotion');

  meta.clear(); checkpointCalls = 0; promotionCalls = 0; unsafe = true;
  const rejected = await compiled.exports.prepareVerifiedCloudConflictRecoveryV1({ supabase: { rpc: async () => ({}) }, namespace: 'user:owner', accountId: 'owner', database: db });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'financial_v2_conflict_recovery_pending_mutations_not_safe');
  assert.equal(checkpointCalls, 0, 'unsafe financial mutations must be rejected before checkpointing');
  unsafe = false; changedCloud = false;
  const preparedAgain = await compiled.exports.prepareVerifiedCloudConflictRecoveryV1({ supabase: { rpc: async () => ({}) }, namespace: 'user:owner', accountId: 'owner', database: db });
  assert.equal(preparedAgain.ok, true);
  changedCloud = true;
  const changed = await compiled.exports.confirmPreparedCloudConflictRecoveryV1({ supabase: { rpc: async () => ({}) }, namespace: 'user:owner', accountId: 'owner', confirmed: true, database: db });
  assert.equal(changed.ok, false);
  assert.equal(changed.reason, 'financial_v2_conflict_recovery_cloud_changed');
  assert.equal(promotionCalls, 0, 'a changed cloud source may never be promoted from an old intent');
  console.log('MYFI P20 V2 CONFLICT RECOVERY PREPARATION: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
