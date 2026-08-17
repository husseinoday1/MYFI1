'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || '.');
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');
const merge = fs.readFileSync(path.join(root, 'src/store/multiDeviceSync.js'), 'utf8');
const repo = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

assert(sync.includes("throw new Error('financial_v7_snapshot_pull_forbidden')"),
  'V7 snapshot pull must fail closed');
assert(sync.includes("financialMutationSync.reason || 'financial_v7_mutation_sync_required'"),
  'V7 cutover must require mutation sync instead of snapshot fallback');
assert(sync.includes('Financial snapshot PULL is forbidden after V7 cutover'),
  'Cutover cloud branch must explicitly forbid financial snapshot pull');
assert(sync.includes('const currentV7 = await readCurrentForSnapshot();'),
  'Cutover snapshot comparison must use full V7 projection');
assert(sync.includes('if (sameWorkspaceData(currentV7, remoteState))'),
  'Compatibility snapshot may only be accepted when it already equals V7');
assert(sync.includes('fall through and PUSH the full V7 projection'),
  'Stale compatibility snapshot must be overwritten from V7, not installed locally');

const installStart = sync.indexOf('const installCanonicalState = async');
const installEnd = sync.indexOf('// Capture a high-water mark', installStart);
assert(installStart >= 0 && installEnd > installStart);
const installBlock = sync.slice(installStart, installEnd);
assert(!installBlock.includes('workspace: canonicalState'),
  'Cutover installCanonicalState must not reconcile a snapshot into V7');
assert(installBlock.includes('financial_v7_snapshot_pull_forbidden'));

assert(merge.includes('absence on either side') && merge.includes("resolution: 'deletion'"),
  'Regression evidence requires proving legacy snapshot merge infers deletion from absence');
assert(repo.includes('const missingIds = (projection?.transactions || [])') &&
       repo.includes('voidFinancialTransactionsV7({ namespace, transactionIds: missingIds'),
  'Regression evidence requires proving reconcile turns omissions into voids');

const mutationPos = sync.indexOf('financialMutationSync = await syncFinancialMutationsV7');
const snapshotFetchPos = sync.indexOf(".from('user_data')", mutationPos);
assert(mutationPos >= 0 && snapshotFetchPos > mutationPos,
  'Mutation sync must execute before compatibility snapshot handling');

console.log('P18-016 V7 SNAPSHOT DELETE GUARD: PASSED');
