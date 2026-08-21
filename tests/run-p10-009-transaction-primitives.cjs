// Phase 10 Step 9 — promotion primitives must not open nested transactions.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const archive = fs.readFileSync(path.join(root, 'src/lib/localArchiveRepository.js'), 'utf8');

const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `missing source boundary: ${start}`);
  return source.slice(from, to);
};

const financialCopy = between(
  repository,
  'export const copyFinancialNamespaceFromStageInTransactionV7',
  'export const clearFinancialWorkspaceV7',
);
const epochAdvance = between(
  repository,
  'export const advanceLedgerRestoreEpochInTransactionV8',
  'export const commitLedgerRestoreEpochV8',
);
const archiveReplace = between(
  archive,
  'export const replaceColdArchiveNamespaceFromStageInTransaction',
  '// Exporting/restoring the cold archive',
);
const transactionRunner = between(
  repository,
  'export const runFinancialRestorePromotionTransactionV8',
  'export const abortLedgerRestoreEpochV8',
);

for (const [name, body] of [
  ['financial copy', financialCopy],
  ['epoch advance', epochAdvance],
  ['cold archive replacement', archiveReplace],
]) {
  assert.ok(!body.includes('enqueueWrite('), `${name} must not enqueue its own write`);
  assert.ok(!body.includes('runLedgerExclusiveTransaction('), `${name} must not begin/commit its own transaction`);
}
console.log('[PASS] raw ledger/archive/epoch primitives cannot nest queue or transaction ownership');

assert.ok(transactionRunner.includes('await ensureFinancialLedgerV7(db)'), 'runner warms ledger schema before transaction');
assert.ok(transactionRunner.includes('await ensureColdArchiveSchema()'), 'runner warms archive schema before transaction');
assert.ok(transactionRunner.includes('enqueueWrite(() => runLedgerExclusiveTransaction'), 'runner owns the only queue + exclusive transaction');
for (const capability of [
  'copyFinancialNamespaceFromStage', 'replaceColdArchiveNamespaceFromStage', 'advanceRestoreEpoch',
]) {
  assert.ok(transactionRunner.includes(capability), `runner must provide ${capability} on the same executor`);
}
console.log('[PASS] P10-010 can receive all promotion capabilities only inside one reviewed transaction callback');

const legacyEpochWrapper = between(
  repository,
  'export const commitLedgerRestoreEpochV8',
  'export const runFinancialRestorePromotionTransactionV8',
);
assert.ok(legacyEpochWrapper.includes('advanceLedgerRestoreEpochInTransactionV8'),
  'the existing epoch API must preserve behavior by delegating to the extracted primitive');
assert.ok(archive.includes('replaceColdArchiveNamespaceFromStageInTransaction({'),
  'the existing archive replacement API must delegate to the extracted primitive');
console.log('[PASS] existing wrappers delegate to the same primitives; no parallel promotion SQL remains');

console.log('MYFI P10-009 TRANSACTION-SCOPED PROMOTION PRIMITIVES CONTRACT: PASS');
