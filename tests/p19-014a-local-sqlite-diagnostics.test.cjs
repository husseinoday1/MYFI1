const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const dbFile = path.join(root, 'src', 'lib', 'ledgerDatabase.js');
const diagFile = path.join(root, 'src', 'dev', 'p19LocalSqliteDiagnostics.js');
const settingsFile = path.join(root, 'src', 'screens', 'SettingsScreen.js');

const db = fs.readFileSync(dbFile, 'utf8');
const diag = fs.readFileSync(diagFile, 'utf8');
const settings = fs.readFileSync(settingsFile, 'utf8');

assert(db.includes('export const peekLedgerDb = () => dbPromise;'), 'missing non-opening DB peek');
assert(diag.includes('P19-014A_LOCAL_SQLITE_DIAGNOSTICS'), 'missing diagnostic marker');
assert(diag.includes('const existingDbPromise = peekLedgerDb();'), 'diagnostic must use existing DB only');
assert(!diag.includes('getLedgerDb('), 'diagnostic must never open/init the DB');

for (const forbidden of [
  'runAsync(', 'execAsync(', 'withTransactionAsync(', 'enqueueLedgerWrite',
  "from '../lib/supabase'", 'supabase.rpc',
  'INSERT ', 'UPDATE ', 'DELETE FROM ', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
]) {
  assert(!diag.includes(forbidden), `read-only diagnostic contains forbidden token: ${forbidden}`);
}

for (const table of [
  'ledger_bootstrap_state_v8',
  'ledger_sync_identity_v8',
  'ledger_sync_state_v8',
  'ledger_outbox_v3',
  'ledger_financial_transactions_v7',
  'ledger_workspace_state_v7',
  'ledger_v7_meta',
]) {
  assert(diag.includes(table), `missing diagnostic table: ${table}`);
}

for (const token of [
  'COUNT(DISTINCT idempotency_key)',
  'GROUP BY idempotency_key',
  "entity_type='workspace'",
  "key LIKE 'cloud_recovery_v2:%'",
  "key LIKE 'sync_v2_activation_evidence:%'",
  "key LIKE 'active_sync_protocol:%'",
  'payload_json_bytes',
]) {
  assert(diag.includes(token), `missing diagnostic evidence token: ${token}`);
}

for (const token of [
  "import * as Clipboard from 'expo-clipboard';",
  "import { collectP19LocalSqliteDiagnostics } from '../dev/p19LocalSqliteDiagnostics';",
  'P19-014A_LOCAL_SQLITE_DIAGNOSTICS_UI',
  'onRunLocalSqliteDiagnostic={runLocalSqliteDiagnostics}',
  'onCopyLocalSqliteDiagnostic={copyLocalSqliteDiagnostic}',
]) {
  assert(settings.includes(token), `missing Settings integration token: ${token}`);
}

console.log('[PASS] P19-014A read-only local SQLite diagnostics contract');
