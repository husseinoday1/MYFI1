const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const migrationPath = path.join(workspace, 'supabase', 'migrations', '202608010001_create_normalized_core.sql');
const readSupportPath = path.join(workspace, 'supabase', 'migrations', '202608010002_add_normalized_read_support.sql');
const integrityPath = path.join(workspace, 'supabase', 'migrations', '202608010003_enforce_normalized_workspace_links.sql');
const settingsPath = path.join(workspace, 'supabase', 'migrations', '202608010004_preserve_workspace_app_settings.sql');
const transferScopePath = path.join(workspace, 'supabase', 'migrations', '202608010005_support_cross_scope_wallet_transfers.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');
const readSupportSql = fs.readFileSync(readSupportPath, 'utf8');
const integritySql = fs.readFileSync(integrityPath, 'utf8');
const settingsSql = fs.readFileSync(settingsPath, 'utf8');
const transferScopeSql = fs.readFileSync(transferScopePath, 'utf8');

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const tables = [
  'profiles',
  'workspaces',
  'workspace_members',
  'categories',
  'wallets',
  'debts',
  'goals',
  'commitments',
  'transactions',
  'debt_payments',
  'goal_savings',
  'tags',
  'transaction_tags',
  'subscriptions',
  'support_tickets',
  'audit_events',
];

tables.forEach((table) => {
  assert(sql.includes(`create table if not exists public.${table}`), `Missing table: ${table}`);
  assert(sql.includes(`alter table public.${table} enable row level security`), `RLS is not enabled: ${table}`);
});

[
  'profiles_own',
  'workspaces_read',
  'workspace_members_read',
  'categories_member',
  'wallets_member',
  'transactions_member',
  'subscriptions_own_read',
  'support_tickets_own',
].forEach((policy) => {
  assert(sql.includes(`create policy ${policy}`), `Missing policy: ${policy}`);
});

assert(sql.includes('revoke all on table public.profiles'), 'Anonymous table access was not revoked');
assert(sql.includes('revoke all on public.audit_events from public, anon, authenticated'), 'Audit events are not client-locked');
assert(sql.includes('p_workspace_id uuid'), 'Workspace membership helper is missing');
assert(sql.includes('provider_payload jsonb'), 'Subscription provider payload is missing');
assert(sql.includes('get_my_subscription_status()'), 'Safe subscription status function is missing');
assert(sql.includes('unique (workspace_id, legacy_id)'), 'Legacy migration keys are missing');
assert(readSupportSql.includes('add column if not exists scope'), 'Wallet scope support is missing');
assert(readSupportSql.includes('default_wallet_id uuid references public.wallets'), 'Default wallet relationship is missing');
assert(readSupportSql.includes('wallets_workspace_scope_order_idx'), 'Wallet scope index is missing');
assert(integritySql.includes('validate_normalized_workspace_links()'), 'Workspace link validator is missing');
[
  'validate_workspace_default_wallet',
  'validate_commitment_workspace_links',
  'validate_transaction_workspace_links',
  'validate_debt_payment_workspace_links',
  'validate_goal_saving_workspace_links',
  'validate_transaction_tag_workspace_links',
].forEach((trigger) => {
  assert(integritySql.includes(`create trigger ${trigger}`), `Missing integrity trigger: ${trigger}`);
});
assert(settingsSql.includes('app_settings jsonb'), 'Workspace app settings storage is missing');
assert(settingsSql.includes("jsonb_typeof(app_settings) = 'object'"), 'Workspace app settings validation is missing');
assert(transferScopeSql.includes('add column if not exists from_scope'), 'Transfer source scope is missing');
assert(transferScopeSql.includes('normalize_transfer_scopes()'), 'Transfer scope normalizer is missing');
assert(transferScopeSql.includes('transactions_workspace_transfer_scopes_date_idx'), 'Transfer scope index is missing');

console.log(`MYFI normalized schema contract: ${tables.length} tables, RLS, read support, and workspace integrity passed`);
