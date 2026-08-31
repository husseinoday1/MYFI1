const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');
const data = fs.readFileSync(path.join(root, 'src/store/slices/dataSlice.js'), 'utf8');

const restoreStart = sync.indexOf('const restoreSnapshotAsOperationalV7');
const restoreEnd = sync.indexOf('const snapshotData', restoreStart);
const restoreBody = sync.slice(restoreStart, restoreEnd);

assert(restoreStart >= 0 && restoreEnd > restoreStart, 'restoreSnapshotAsOperationalV7 block missing');
assert(!restoreBody.includes('clearFinancialWorkspaceV7'),
  'restore helper must not clear the active ledger before staging/verifying replacement');
assert(restoreBody.includes('forceReplace: true'),
  'restore helper must use verified force-replacement cutover');
assert(restoreBody.includes('resetPendingOutbox: true'),
  'legacy V1 pending outbox must be reset only at atomic promotion');

const resetStart = data.indexOf('resetAll: async');
const resetEnd = data.indexOf('restoreLastBackupRollback: async', resetStart);
const resetBody = data.slice(resetStart, resetEnd);
assert(resetBody.includes('local_reset_requires_protocol_v2'),
  'signed-in destructive local reset is not fail-closed before V2 epoch activation');
assert(resetBody.includes('local_reset_requires_complete_v2_recovery'),
  'signed-out V2 destructive local reset must be fail-closed too');
const resetInterlockStart = resetBody.indexOf('const localResetSafety');
const resetDestructiveStart = resetBody.indexOf('const wallets = normalizeWallets');
const resetInterlockReturn = resetBody.indexOf('return false;', resetInterlockStart);
assert(resetInterlockStart >= 0 && resetDestructiveStart > resetInterlockStart,
  'reset interlock must be installed before destructive reset setup begins');
assert(resetInterlockReturn > resetInterlockStart && resetInterlockReturn < resetDestructiveStart,
  'signed-in reset interlock must return before any destructive reset setup');

const importStart = data.indexOf('importBackup: async');
const importEnd = data.indexOf('\n  },\n});', importStart);
const importBody = data.slice(importStart, importEnd);
assert(importBody.includes('backup_restore_requires_protocol_v2'),
  'signed-in backup restore is not fail-closed before V2 epoch activation');
assert(importBody.indexOf('backup_restore_requires_protocol_v2') < importBody.indexOf('replaceColdArchives'),
  'backup restore interlock must run before archive or ledger mutation');
assert(importBody.includes('restore_interlock_active'),
  'restore interlock audit state is missing');

console.log('MYFI P19-007 DESTRUCTIVE RESTORE INTERLOCK: PASSED');
