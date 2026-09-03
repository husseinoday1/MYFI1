// Phase 13 Stages C and D — the retirement holds only while these stay true.
// The gate itself is proven in run-p13-legacy-mirror-gate.cjs; this pins the
// wiring around it, and the two readers Stage D checked, so a later edit cannot
// quietly bring the legacy `user_data` path back to life.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const sync = read('src/store/slices/useSyncSlice.js');
const space = read('src/screens/SpaceScreen.js');

// --- Stage C: the mirror write is gated, and the gate comes first ------------

assert(sync.includes("from '../../lib/p13LegacyMirrorGate'"),
  'the sync slice must take its mirror decision from the Phase 13 gate');
assert(sync.includes('cutoverBridge, cloudRevision, localRevision: get().cloudRevision,'),
  'the gate must be asked with the live cutover state and the revision floor, not a cached answer');

const planAt = sync.indexOf('legacyUserDataMirrorPlanV1({');
const rpcAt = sync.indexOf("supabase.rpc('sync_user_data_v2'");
assert(planAt > 0 && rpcAt > 0, 'both the gate and the mirror RPC must be present');
assert(planAt < rpcAt, 'the gate must be consulted before the RPC, not after it has fired');
assert(sync.slice(planAt, rpcAt).includes('if (!mirrorPlan.write) {'),
  'a retired mirror must return before reaching the RPC');
assert(sync.slice(planAt, rpcAt).includes('revision: mirrorPlan.settleRevision'),
  'the skipped write must settle on the gate revision, not invent one');

// Stage E, not this change: the call site and the RPC stay in the tree for a
// device that has not cut over yet.
assert(rpcAt > 0, 'the pre-cutover write must survive Stage C');

// Nothing else may read the legacy row. The sync pull is the single reader left,
// and it is compatibility comparison only.
const userDataReads = sync.match(/\.from\('user_data'\)/g) || [];
assert.equal(userDataReads.length, 1,
  'the sync slice must keep exactly one legacy user_data reader');
assert(sync.includes('financial_v7_snapshot_pull_forbidden'),
  'reading financial state back out of the legacy snapshot must stay forbidden');

// --- Stage D: SpaceScreen, the room reader ----------------------------------

assert(space.includes('const SPACE_SCREEN_RETIRED = true;'),
  'SpaceScreen must stay explicitly retired');
assert(space.includes('if (!SPACE_SCREEN_RETIRED && user) loadRoom();'),
  'the retired screen must not query tables that no longer exist');
const retiredReturnAt = space.indexOf('if (SPACE_SCREEN_RETIRED) {');
const signedOutReturnAt = space.indexOf('if (!user) {');
assert(retiredReturnAt > 0 && signedOutReturnAt > retiredReturnAt,
  'the retirement notice must fail closed ahead of every other branch');

// The reachability claim Stage D rests on, checked rather than remembered: if
// anything ever imports this screen, the gate above is what stops it silently
// rendering an empty room -- but the import itself should be caught here.
const sourceFiles = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel);
    else if (/\.(js|jsx)$/.test(entry.name)) sourceFiles.push(rel);
  }
};
walk('src');
sourceFiles.push('App.js');
for (const rel of sourceFiles) {
  if (rel === 'src/screens/SpaceScreen.js') continue;
  assert(!read(rel).includes('SpaceScreen'),
    `${rel} references the retired SpaceScreen — Stage D assumed nothing did`);
}

// --- Stage D: the normalized-cloud preview, the other old reader ------------

assert(sync.includes("if (!normalizedPreviewEnabled) return { ok: false, reason: 'disabled' };"),
  'the normalized preview must stay behind its feature flag');
const previewCallers = sourceFiles.filter(rel => read(rel).includes('previewNormalizedCloud'));
assert.deepEqual(previewCallers, ['src/store/slices/useSyncSlice.js'],
  'previewNormalizedCloud must remain uncalled — reviving it would revive the dead V6 tables');

console.log('MYFI P13 LEGACY MIRROR RETIREMENT: PASSED');
