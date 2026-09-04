// Guards the fix for the reported bug: deleting a saving transaction linked to
// an already-released goal silently claimed "this updates linked totals" while
// goalLifecycle's frozen 'released' short-circuit means nothing actually
// changes. This pins the pure notice function and every call site that must
// use it, so a future edit cannot quietly reintroduce the false claim.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

// --- Pure function: releasedGoalDeleteNotice -------------------------------

const lifecycleSrc = read('src/lib/trackerLifecycle.js');
const fnStart = lifecycleSrc.indexOf('export const releasedGoalDeleteNotice');
assert(fnStart > 0, 'releasedGoalDeleteNotice must exist in trackerLifecycle.js');

// Load the real module (CJS interop via a temp transpile-free require is not
// available for ESM export syntax in this repo's test harness, so exercise it
// through a small eval sandbox that mirrors how the other pure-function tests
// in this suite already isolate a single export).
const vm = require('node:vm');
const moduleSrc = lifecycleSrc
  .replace(/export const/g, 'const')
  + '\nmodule.exports = { releasedGoalDeleteNotice, goalLifecycle };';
const sandbox = { module: { exports: {} }, require };
vm.createContext(sandbox);
vm.runInContext(moduleSrc, sandbox, { filename: 'trackerLifecycle.sandbox.js' });
const { releasedGoalDeleteNotice } = sandbox.module.exports;

assert.equal(
  releasedGoalDeleteNotice({ isGoalSaving: false }, { status: 'released' }),
  null,
  'a non-goal-saving transaction must never produce a notice',
);
assert.equal(
  releasedGoalDeleteNotice({ isGoalSaving: true }, null),
  null,
  'a missing goal must never produce a notice',
);
assert.equal(
  releasedGoalDeleteNotice({ isGoalSaving: true }, { status: 'active' }),
  null,
  'an active goal must never produce a notice — deletion still works normally',
);
assert.equal(
  releasedGoalDeleteNotice({ isGoalSaving: true }, { status: 'settled' }),
  null,
  'a settled-but-not-released goal must not produce a notice — it is still live-derived',
);

const goalName = 'Home';
const notice = releasedGoalDeleteNotice(
  { isGoalSaving: true },
  { id: 'g1', status: 'released', name: goalName, settledAt: '2026-08-20T10:00:00.000Z' },
);
assert.equal(notice.goalId, 'g1', 'notice must carry the goal id');
assert.equal(notice.goalName, goalName, 'notice must carry the goal name');
assert.equal(notice.releasedAt, '2026-08-20T10:00:00.000Z', 'notice must carry the release date');

const noticeFallback = releasedGoalDeleteNotice(
  { isGoalSaving: true },
  { id: 'g2', status: 'released', completedAt: '2026-08-01T00:00:00.000Z' },
);
assert.equal(noticeFallback.releasedAt, '2026-08-01T00:00:00.000Z',
  'releasedAt must fall back to completedAt when settledAt is missing');
assert.equal(noticeFallback.goalName, null, 'a nameless goal must report goalName: null, not throw');

// --- Every delete-confirmation site must consult it -------------------------

const sites = [
  'src/screens/HistoryScreen.js',
  'src/screens/HomeScreen.js',
  'src/screens/ArchiveScreen.js',
  'src/components/AddTransModal.js',
  'src/screens/TrackersLabScreen.js',
];
for (const rel of sites) {
  const src = read(rel);
  assert(src.includes("from '../lib/trackerLifecycle'") && src.includes('releasedGoalDeleteNotice'),
    `${rel} must import releasedGoalDeleteNotice`);
  assert(src.match(/releasedGoalDeleteNotice\(/),
    `${rel} must call releasedGoalDeleteNotice before confirming a goal-saving delete`);
}

// TrackersLabScreen has two call sites (single payment + bulk selection) —
// pin both, since the bulk one is the easier one to miss on a future edit.
const trackersSrc = read('src/screens/TrackersLabScreen.js');
const callCount = (trackersSrc.match(/releasedGoalDeleteNotice\(/g) || []).length;
assert(callCount >= 2, 'TrackersLabScreen must guard both the single-payment and bulk-selection delete flows');

// HistoryScreen/ArchiveScreen/HomeScreen each have a single-row AND a
// bulk-selection delete confirmation; both must be guarded.
for (const rel of ['src/screens/HistoryScreen.js', 'src/screens/ArchiveScreen.js', 'src/screens/HomeScreen.js']) {
  const src = read(rel);
  const count = (src.match(/releasedGoalDeleteNotice\(/g) || []).length;
  assert(count >= 2, `${rel} must guard both its single-row and bulk-selection delete confirmations`);
}

console.log('MYFI GOAL RELEASE DELETE NOTICE: PASSED');
