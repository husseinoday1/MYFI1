const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const client=fs.readFileSync(path.join(root,'src/lib/financialMutationSyncV2.js'),'utf8');
const repo=fs.readFileSync(path.join(root,'src/lib/financialLedgerV7Repository.js'),'utf8');

for(const token of [
 'syncFinancialMutationsV2',
 'serializeLedgerMutationBatchV2',
 'resolveCloudLedgerV2',
 'get_financial_ledger_v2',
 'register_financial_ledger_v2',
 'sync_financial_mutations_v2',
 'financial_v2_revision_conflict',
 'financial_v2_restore_recovery_required',
 'financial_v2_sync_page_budget_exhausted',
 'financial_v2_sync_cursor_stalled',
]) assert(client.includes(token),`missing V2 client token: ${token}`);

for(const token of [
 'readPendingLedgerMutationsV8',
 'acknowledgeLedgerMutationsV8',
 'failLedgerMutationV8',
 'getLedgerSyncCursorV8',
 'applyRemoteLedgerMutationsV8',
 'ledger_outbox_v3',
 'ledger_inbox_v3',
 'ledger_sync_state_v8',
]) assert(repo.includes(token),`missing V2 repo token: ${token}`);

assert.match(client,/response\.ledgerId !== identity\.ledgerId/);
assert.match(client,/response\.restoreEpoch !== identity\.restoreEpoch/);
assert.match(repo,/item\.ledgerId !== identity\.ledgerId/);
assert.match(repo,/item\.restoreEpoch !== identity\.restoreEpoch/);
assert.match(repo,/commandSequence:\s*Number\(/);
assert.match(repo,/commandMutationCount:\s*Number\(/);
assert.match(repo,/financial_v2_remote_command_incomplete/);
assert.match(repo,/ledger_id,restore_epoch,mutation_id,command_id,command_sequence,server_sequence/);
assert.match(repo,/Math\.max\(value,item\.commandSequence\)/);

console.log('MYFI P19-009 INACTIVE SYNC V2 CLIENT CONTRACT: PASSED');
