const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const repair = read('src/lib/financialRestorePreflightConflictV13.js');
const coordinator = read('src/lib/financialRestoreProductionV13.js');
const data = read('src/store/slices/dataSlice.js');

for (const token of [
  'canonical_restore_workspace_conflict_financial_shell_not_empty',
  'canonical_restore_workspace_conflict_outbox_not_safe',
  'canonical_restore_workspace_conflict_outbox_pair_mismatch',
  'PRAGMA foreign_key_check',
  'payloadsPersisted: false',
  'QUARANTINED_WITH_RESTORE_INTENT',
]) assert.ok(repair.includes(token), `missing ${token}`);
assert.match(repair, /ledger_financial_transactions_v7/);
assert.match(repair, /cold_archive_transactions/);
assert.match(repair, /superseded_by_bootstrap_id=\?/);
assert.match(repair, /ledger_outbox_v2 SET acknowledged_at=\?/);
assert.doesNotMatch(repair, /DELETE FROM/);

assert.match(coordinator, /quarantineRestoreWorkspaceConflictInTransactionV13/);
const intentStart = coordinator.indexOf('const createIntent');
const intentEnd = coordinator.indexOf('const continuePrepared', intentStart);
const intent = coordinator.slice(intentStart, intentEnd);
assert.ok(intent.indexOf('quarantineRestoreWorkspaceConflictInTransactionV13') < intent.indexOf('guardRestoreSourceBeforeEpochRpcInTransactionV13'));
assert.ok(intent.indexOf('guardRestoreSourceBeforeEpochRpcInTransactionV13') < intent.indexOf('createStrategyBRestoreIntentV13InTransaction'));

assert.match(data, /syncReason === 'financial_v2_revision_conflict'/);
assert.match(data, /options\?\.triggerKind !== 'undo'/);
assert.match(data, /allowEmptyShellWorkspaceConflict: options\?\.allowEmptyShellWorkspaceConflict === true/);

console.log('[PASS] P10-014B restore workspace-conflict wiring contract');
