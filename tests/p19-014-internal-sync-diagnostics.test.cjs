const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const file = path.join(root, 'src', 'screens', 'SettingsScreen.js');
const src = fs.readFileSync(file, 'utf8');

for (const token of [
  'P19-014_INTERNAL_SYNC_DIAGNOSTICS',
  'lastSyncError={lastSyncError}',
  'online={online}',
  'dirty={dirty}',
  "title={isAr ? 'رمز التشخيص الداخلي' : 'Internal diagnostic code'}",
  "value={String(lastSyncError || 'offline_without_sync_error')}",
  "title={isAr ? 'أعلام المزامنة الداخلية' : 'Internal sync flags'}",
  "value={`${online ? 'online' : 'offline'} · ${dirty ? 'dirty' : 'clean'}`}",
]) {
  assert(src.includes(token), `missing token: ${token}`);
}

assert.strictEqual((src.match(/P19-014_INTERNAL_SYNC_DIAGNOSTICS/g) || []).length, 1);

const deviceCallStart = src.indexOf("{page === 'devices'");
const accountFnStart = src.indexOf('function AccountPage({');
assert(deviceCallStart >= 0 && accountFnStart > deviceCallStart);
const deviceCallScope = src.slice(deviceCallStart, accountFnStart);
assert(!deviceCallScope.includes('lastSyncError={lastSyncError}'), 'DevicesPage callsite must remain untouched');

console.log('[PASS] P19-014 internal sync diagnostics contract');
