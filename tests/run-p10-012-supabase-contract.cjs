// Phase 10 Step 12 — execute the isolated Supabase client adapter and statically
// guard the migration contract. Runtime PostgreSQL/RLS remains a separate required
// gate because a text assertion cannot prove locks or privileges.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const clientFilename = path.join(root, 'src/lib/financialRestoreEpochV3Client.js');
const compile = (filename, source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};
let clientSource = fs.readFileSync(clientFilename, 'utf8').replace(/export const /g, 'const ');
clientSource += `\nmodule.exports = { advanceOrResolveFinancialRestoreEpochV3 };\n`;
const { advanceOrResolveFinancialRestoreEpochV3 } = compile(clientFilename, clientSource);

const fakeSupabase = ({ rpcResponse, rpcResponses = null }) => {
  const calls = [];
  const responses = rpcResponses ? [...rpcResponses] : null;
  return {
    calls,
    rpc: async (name, args) => {
      calls.push({ rpc: name, args });
      return responses ? responses.shift() : rpcResponse;
    },
  };
};

const operation = Object.freeze({
  ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ledgerId: 'ledger-proof-bound', fromEpoch: 7, toEpoch: 8,
  deviceId: 'device-p10-012', operationId: '11111111-1111-4111-8111-111111111111',
  restoreProofDigest: 'a'.repeat(64), reason: 'backup_restore',
});
const event = Object.freeze({
  event_uuid: '33333333-3333-4333-8333-333333333333', owner_user_id: operation.ownerId,
  ledger_id: operation.ledgerId, from_epoch: 7, to_epoch: 8, reason: 'backup_restore',
  device_id: operation.deviceId, operation_id: operation.operationId,
  restore_proof_digest: operation.restoreProofDigest, created_at: '2026-08-21T12:00:00Z',
});

(async () => {
  const directClient = fakeSupabase({ rpcResponse: { data: { ...event, outcome: 'advanced' }, error: null } });
  const direct = await advanceOrResolveFinancialRestoreEpochV3({ supabase: directClient, operation });
  assert.equal(direct.ok, true); assert.equal(direct.outcome, 'advanced');
  assert.equal(directClient.calls.length, 1, 'normal success is exactly one logical RPC');
  assert.deepEqual(Object.keys(directClient.calls[0].args).sort(), [
    'p_device_id', 'p_expected_epoch', 'p_ledger_id', 'p_new_epoch',
    'p_operation_id', 'p_reason', 'p_restore_proof_digest',
  ]);

  const resolvedClient = fakeSupabase({
    rpcResponses: [
      { data: null, error: { code: 'PGRST504' } },
      { data: { ...event, outcome: 'already_advanced' }, error: null },
    ],
  });
  const resolved = await advanceOrResolveFinancialRestoreEpochV3({ supabase: resolvedClient, operation });
  assert.equal(resolved.ok, true); assert.equal(resolved.outcome, 'evidence_resolved');
  assert.equal(resolvedClient.calls.length, 2, 'ambiguous RPC uses one exact ledger-locking resolver invocation');
  assert.deepEqual(resolvedClient.calls[0].args, resolvedClient.calls[1].args,
    'resolver must reuse the exact immutable operation and proof');

  const unknownClient = fakeSupabase({
    rpcResponses: [
      { data: null, error: { code: 'PGRST504' } },
      { data: null, error: { code: 'PGRST504' } },
    ],
  });
  const unknown = await advanceOrResolveFinancialRestoreEpochV3({ supabase: unknownClient, operation });
  assert.equal(unknown.ok, false); assert.equal(unknown.ambiguous, true);
  assert.equal(unknown.reason, 'restore_epoch_server_outcome_unknown');
  assert.match(unknown.nextRetryAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(unknownClient.calls.length, 2, 'unknown resolution is bounded to two exact RPC invocations');

  const malformedClient = fakeSupabase({
    rpcResponses: [
      { data: { outcome: 'advanced' }, error: null },
      { data: { ...event, outcome: 'already_advanced' }, error: null },
    ],
  });
  const malformed = await advanceOrResolveFinancialRestoreEpochV3({ supabase: malformedClient, operation });
  assert.equal(malformed.ok, true); assert.equal(malformed.outcome, 'evidence_resolved',
    'malformed success is ambiguous and must be resolved, never treated as definitive failure');

  const rejectedClient = fakeSupabase({ rpcResponse: { data: null, error: { code: '42501' } } });
  const rejected = await advanceOrResolveFinancialRestoreEpochV3({ supabase: rejectedClient, operation });
  assert.equal(rejected.reason, 'restore_epoch_access_denied');
  assert.equal(rejectedClient.calls.length, 1, 'definitive PostgreSQL rejection must not generate extra requests');
  console.log('[PASS] Supabase adapter resolves under the same server lock and is bounded to two exact RPC calls');

  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
    .filter(name => name.endsWith('_p10_012_proof_bound_restore_epoch_v3.sql'));
  assert.equal(migrations.length, 1, 'Supabase CLI must generate exactly one P10-012 migration');
  const sql = fs.readFileSync(path.join(root, 'supabase/migrations', migrations[0]), 'utf8');
  assert.match(sql, /add column if not exists operation_id uuid/);
  assert.match(sql, /add column if not exists restore_proof_digest text/);
  assert.match(sql, /create unique index if not exists financial_restore_events_v2_operation_id_uq/);
  assert.match(sql, /create or replace function public\.advance_financial_restore_epoch_v3/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /owner_user_id = v_user_id[\s\S]*for update/);
  assert.match(sql, /p_reason is distinct from 'backup_restore'/);
  assert.match(sql, /operation_id <> p_operation_id/);
  assert.match(sql, /restore_proof_digest <> v_digest/);
  assert.match(sql, /p_reason is distinct from 'controlled_recovery'/,
    'legacy RPC must be narrowed so it cannot bypass proof-bound product restore');
  assert.match(sql, /revoke all on function public\.advance_financial_restore_epoch_v3[\s\S]*from public, anon/);
  assert.match(sql, /grant execute on function public\.advance_financial_restore_epoch_v3[\s\S]*to authenticated/);
  assert.doesNotMatch(sql, /semantic_hash|row_counts|transaction_payload|amount_minor/i,
    'cloud migration must not store semantic proof inputs or financial payloads');
  console.log('[PASS] migration draft binds owner/operation/proof and explicitly narrows grants and the legacy RPC');

  console.log('MYFI P10-012 SUPABASE CONTRACT: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
