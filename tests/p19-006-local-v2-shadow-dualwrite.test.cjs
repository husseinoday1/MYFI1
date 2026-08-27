const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

for (const token of [
  'insertShadowMutationV2',
  'ledger_outbox_v3',
  'command_id',
  'base_revision',
  'protocol_version',
  'minimum_supported_version',
  'payload_schema_version',
  "cmd2-' || lower(hex(randomblob(16)))",
  "mut2-' || lower(hex(randomblob(16)))",
  'nonsequential_transaction_revision',
]) {
  assert(repository.includes(token), `P19-006 missing token: ${token}`);
}

assert.match(repository, /const prepareLocalEntity[\s\S]*baseRevision:\s*currentRevision/);
assert.match(repository, /revision:\s*currentRevision \+ 1/);
// P11-B / D2 removed the archive-time goal_release synthesis this literal call
// site belonged to (archiveFinancialTransactionsV7 no longer builds a
// releaseCommand at all). The dual-write contract this line existed to check —
// a batch's shadowCommandId threaded into every outbox write in the same
// transaction — is still exercised by the entity-outbox assertion below.
assert.match(repository, /insertEntityOutbox\(txn, entity, \{ commandId: shadowCommandId \}\)/);
assert.match(repository, /financialTransactionShadowPayload/);
assert.doesNotMatch(
  repository.match(/const financialTransactionShadowPayload[\s\S]*?\n};/)?.[0] || '',
  /entities:/,
  'V2 transaction payload must not embed independently revised entity mutations',
);

console.log('MYFI P19-006 LOCAL V2 SHADOW DUAL-WRITE CONTRACT: PASSED');
