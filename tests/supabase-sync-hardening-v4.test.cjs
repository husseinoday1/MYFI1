const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const sqlPath = path.join(root, 'supabase/migrations/202608120001_harden_user_data_sync_v2.sql');
const sql = fs.readFileSync(sqlPath, 'utf8').toLowerCase();
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');
const cloudTest = fs.readFileSync(path.join(root, 'tests/run-cloud-integration.cjs'), 'utf8');

for (const marker of [
  'alter table public.user_data enable row level security',
  'create policy "user_data_select_own"',
  'user_id = auth.uid()',
  'revoke insert, update, delete on table public.user_data from authenticated',
  'create or replace function public.sync_user_data_v2',
  'security definer',
  'pg_advisory_xact_lock',
  'p_expected_revision',
  'v_current_revision <> p_expected_revision',
  'revision = ud.revision + 1',
  'grant execute on function public.sync_user_data_v2',
  'sync_payload_too_large',
]) assert.ok(sql.includes(marker), `missing SQL hardening marker: ${marker}`);

assert.ok(sync.includes("const SYNC_MAX_ATTEMPTS = 4;"));
assert.ok(sync.includes(".select(SYNC_CLOUD_COLUMNS)"), 'sync pull must select an explicit cloud schema');
assert.ok(sync.includes("invalid_sync_rpc_response"));
assert.ok(sync.includes("invalid_sync_revision"));
assert.ok(sync.includes("await syncRetryDelay(attempt)"));
assert.ok(sync.includes("get().user?.id !== syncUserId"), 'account switch guard is required');
assert.ok(sync.includes("p_expected_revision: expectedRevision"));

assert.ok(cloudTest.includes('/rpc/sync_user_data_v2'), 'cloud integration must write through RPC');
assert.ok(!cloudTest.includes("method: 'DELETE'"), 'cloud integration must not delete the user snapshot directly');
assert.ok(!cloudTest.includes('resolution=merge-duplicates'), 'cloud integration must not direct-upsert user_data');
assert.ok(cloudTest.includes('optimistic-concurrency: ok'));
assert.ok(cloudTest.includes('cloud-restore-via-rpc: ok'));

console.log('MYFI SUPABASE SYNC HARDENING V4: PASSED');
