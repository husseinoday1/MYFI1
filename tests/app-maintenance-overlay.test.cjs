// The maintenance barrier must never unmount the app tree.
//
// App.js used to `return` a full-screen maintenance view when
// financialMaintenance.blocked went true. That does not hide the app — it unmounts it,
// and when the barrier lifts the tree is rebuilt from scratch with every component's
// state lost. Two user-reported bugs came straight from that:
//
//   - Toggling a feature runs the barrier, so Settings was torn down and rebuilt at its
//     root page: a flash, then the user is back at the top.
//   - Restore calls the barrier itself (dataSlice.js:616). SettingsScreen unmounted
//     mid-await, so setRestoreResultOpen(true) ran against a component that no longer
//     existed. The restore had already succeeded; only its confirmation was lost, which
//     reads to the user as a failed restore.
//
// The fix is an overlay over a still-mounted tree. This guards the shape of that fix,
// because the early-return version looks perfectly reasonable to anyone who has not
// been bitten by it.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'App.js'), 'utf8');
const lines = source.split(/\r?\n/);

// --- the barrier must not gate a return -----------------------------------
lines.forEach((line, index) => {
  if (!/financialMaintenance\.blocked/.test(line)) return;
  // A conditional whose body is a return replaces the tree. The overlay form assigns
  // to a variable instead.
  const tail = lines.slice(index, index + 3).join('\n');
  assert.ok(
    !/^\s*if\s*\([^)]*financialMaintenance\.blocked[^)]*\)\s*\{?\s*$/.test(line)
    || !/\breturn\b/.test(tail),
    `App.js:${index + 1}: financialMaintenance.blocked must not gate a return — that `
    + 'unmounts the tree and loses every component\'s state. Render an overlay instead.',
  );
});
console.log('[PASS] the barrier does not gate an early return');

// --- the overlay exists and is actually rendered --------------------------
assert.ok(
  /const maintenanceOverlay = financialMaintenance\.blocked \?/.test(source),
  'App.js must build the maintenance view as an overlay value, not a returned tree',
);
assert.ok(
  /StyleSheet\.absoluteFill/.test(source),
  'the overlay must cover the tree it sits on',
);

// Every branch that can be on screen when the barrier fires has to render it, or the
// barrier becomes invisible while it is pausing writes.
const placements = (source.match(/\{maintenanceOverlay\}/g) || []).length;
assert.ok(
  placements >= 4,
  `every rendered branch must include the overlay — found ${placements}, expected one `
  + 'each for onboarding, lock, archive and the main tree',
);
console.log(`[PASS] the overlay is rendered in all ${placements} branches`);

// --- the startup splash is a different thing and must stay a return -------
// `!ready || !fontReady` runs before anything is mounted, so replacing the tree there
// costs nothing. Only the maintenance case had state to lose.
assert.ok(
  /if \(!ready \|\| !fontReady\) \{[\s\S]{0,200}?return \(/.test(source),
  'the startup splash should remain an early return — nothing is mounted yet to lose',
);
console.log('[PASS] the startup splash is left alone');

console.log('MYFI APP MAINTENANCE OVERLAY CONTRACT: PASS');
