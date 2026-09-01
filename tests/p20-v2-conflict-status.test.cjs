const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');
const start = source.indexOf("console.warn('[STORE] multi-device sync'");
const end = source.indexOf('return false;', start);
const failurePath = source.slice(start, end);

assert.ok(start >= 0 && end > start, 'V2 sync failure handling is missing');
assert.match(failurePath, /const syncReason = String\(e\?\.message \|\| 'sync_failed'\)/);
assert.match(failurePath, /const revisionConflict = syncReason === 'financial_v2_revision_conflict'/);
assert.match(failurePath, /online: revisionConflict/);
assert.match(failurePath, /lastSyncError: syncReason/);

console.log('MYFI P20 V2 CONFLICT STATUS CONTRACT: PASSED');
