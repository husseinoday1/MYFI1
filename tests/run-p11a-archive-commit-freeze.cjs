// P11-A — Frozen Master Plan §3.5 archive-commit freeze.
//
// commitYearArchive still rewrites wallet.openingBalance, debt.payments and
// goal.savings, which §73 forbids. Until Phase 11-B replaces it, the commit path
// must be closed — and closed in the store, so that no UI route can reach it.
//
// §77 is the other half: the archive *file* is a user artifact and stays
// available. This test pins both halves so a later edit cannot quietly reopen
// the mutation or quietly take the export away.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const freezeFilename = path.join(root, 'src/lib/archiveCommitFreeze.js');
const compiled = new Module(freezeFilename, module);
compiled.filename = freezeFilename;
compiled.paths = Module._nodeModulePaths(path.dirname(freezeFilename));
compiled._compile(
  `${read('src/lib/archiveCommitFreeze.js').replace(/export const /g, 'const ')}
module.exports = { ARCHIVE_COMMIT_FROZEN, ARCHIVE_COMMIT_FROZEN_REASON, archiveCommitFreezeNotice };`,
  freezeFilename,
);
const { ARCHIVE_COMMIT_FROZEN, ARCHIVE_COMMIT_FROZEN_REASON, archiveCommitFreezeNotice } = compiled.exports;

assert.equal(ARCHIVE_COMMIT_FROZEN, true, '§3.5: the mutating archive commit must stay frozen through Phase 11-A');
assert.match(ARCHIVE_COMMIT_FROZEN_REASON, /archive_commit_frozen/);

// The user is told why, in their own language, not left with a bare failure.
for (const isAr of [true, false]) {
  const notice = archiveCommitFreezeNotice(isAr);
  assert.ok(notice.title && notice.body, 'the freeze notice must have a title and a body');
  assert.ok(notice.body.length > 60, 'the freeze notice must explain, not just refuse');
}
assert.notEqual(
  archiveCommitFreezeNotice(true).body,
  archiveCommitFreezeNotice(false).body,
  'the freeze notice must be localised',
);

// --- the interlock sits in the store, ahead of every mutation ---------------

const slice = read('src/store/slices/dataSlice.js');
const commitStart = slice.indexOf('commitYearArchive: async (');
assert.ok(commitStart > 0, 'commitYearArchive not found');
const commitEnd = slice.indexOf('importBackup: async (', commitStart);
assert.ok(commitEnd > commitStart, 'commitYearArchive body bounds not found');
const commitBody = slice.slice(commitStart, commitEnd);

assert.match(commitBody, /if \(ARCHIVE_COMMIT_FROZEN\) \{/, 'commitYearArchive must check the freeze');

// Order matters: the freeze must come before the maintenance barrier and before
// anything that touches openingBalance, debts or goals.
// Comments in the slice name these markers deliberately; compare code only.
const commitCode = commitBody.split(String.fromCharCode(10))
  .filter(line => !line.trim().startsWith('//'))
  .join(String.fromCharCode(10));
const freezeAt = commitCode.indexOf('if (ARCHIVE_COMMIT_FROZEN)');
for (const [label, marker] of [
  ['the maintenance barrier', 'runFinancialMaintenance'],
  ['the openingBalance rewrite', 'openingBalance'],
  ['the cold-archive write', 'storeColdArchiveYear'],
  ['the V7 archive write', 'archiveFinancialTransactionsV7'],
]) {
  const at = commitCode.indexOf(marker);
  assert.ok(at > freezeAt, `the freeze must be checked before ${label}`);
}

// --- §77: the export artifact is NOT frozen ---------------------------------

const screen = read('src/screens/ArchiveScreen.js');
assert.match(screen, /import \{ ARCHIVE_COMMIT_FROZEN, archiveCommitFreezeNotice \}/, 'ArchiveScreen must import the freeze');

const confirmStart = screen.indexOf('const confirmArchiveCommit = (');
assert.ok(confirmStart > 0, 'confirmArchiveCommit not found');
const confirmEnd = screen.indexOf('const chooseArchiveDelivery = (', confirmStart);
const confirmBody = screen.slice(confirmStart, confirmEnd);
assert.match(confirmBody, /if \(ARCHIVE_COMMIT_FROZEN\)/, 'the commit confirmation must honour the freeze');
assert.ok(
  confirmBody.indexOf('if (ARCHIVE_COMMIT_FROZEN)') < confirmBody.indexOf('commitYearArchive('),
  'the freeze must be checked before commitYearArchive is offered',
);

// The export path stays reachable: saving a year archive file must not be gated.
const performStart = screen.indexOf('const performArchiveYear = async (');
const performEnd = screen.indexOf('const archiveYear = (', performStart);
const performBody = screen.slice(performStart, performEnd);
assert.ok(performStart > 0 && performEnd > performStart, 'performArchiveYear bounds not found');
assert.doesNotMatch(
  performBody,
  /ARCHIVE_COMMIT_FROZEN/,
  '§77: exporting the archive file is a user artifact and must stay available while frozen',
);
assert.match(performBody, /exportMyfiPackage\(/, 'performArchiveYear must still build the export package');

// --- repeat-action: the shipped guard refuses every attempt ------------------
// Standing Engineering Rule 2. Rather than mock the guard, the real block is
// lifted out of dataSlice.js and executed, so this fails if the shipped code
// ever gains a first-attempt-only escape.

const guardStart = commitCode.indexOf('if (ARCHIVE_COMMIT_FROZEN) {');
const guardEnd = commitCode.indexOf('}', commitCode.indexOf('return false;', guardStart)) + 1;
assert.ok(guardStart >= 0 && guardEnd > guardStart, 'the freeze guard block could not be located');
const guardSource = commitCode.slice(guardStart, guardEnd);

// eslint-disable-next-line no-new-func -- executing the shipped guard verbatim is the point
const runGuard = new Function('ARCHIVE_COMMIT_FROZEN', 'ARCHIVE_COMMIT_FROZEN_REASON', 'set',
  `${guardSource}${String.fromCharCode(10)}return 'not_frozen';`);

const recorded = [];
const outcomes = [];
for (let attempt = 1; attempt <= 3; attempt += 1) {
  outcomes.push(runGuard(ARCHIVE_COMMIT_FROZEN, ARCHIVE_COMMIT_FROZEN_REASON, patch => recorded.push(patch)));
}
assert.deepEqual(outcomes, [false, false, false], 'the shipped guard must refuse every attempt, not just the first');
assert.equal(recorded.length, 3, 'each refusal must record its reason');
for (const patch of recorded) {
  assert.equal(patch.ledgerError, ARCHIVE_COMMIT_FROZEN_REASON, 'the recorded reason must name the freeze');
}

console.log('PASS p11a_archive_commit_freeze');