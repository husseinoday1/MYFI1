// Phase 13 Stage C — the rule that decides whether a sync still emits the
// legacy `user_data` mirror. The gate has to hold in both directions: silence
// it post-cutover, and keep writing it for a device that has not migrated yet
// and has no other cloud copy of its data.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/p13LegacyMirrorGate.js');
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const { legacyUserDataMirrorPlanV1 } = compiled.exports;

// 1) After cutover the mirror is retired and the sync settles on the revision
//    the cloud already holds.
{
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: 11 });
  assert.equal(plan.write, false, 'a cut-over device must stop writing the mirror');
  assert.equal(plan.settleRevision, 11, 'it settles on the revision already in the cloud');
  assert.equal(plan.reason, 'v7_authoritative_mirror_retired');
}

// 2) A device that has not cut over still writes: `user_data` is its only cloud
//    copy, and this is the account the production project still has one of.
{
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: false, cloudRevision: 3 });
  assert.equal(plan.write, true, 'a pre-cutover device must keep its sync channel');
  assert.equal(plan.reason, 'pre_cutover_snapshot_authoritative');
}

// 3) Anything other than an explicit `true` keeps today's behaviour. A skipped
//    upload must be a decision, never the result of an unread field.
for (const cutoverBridge of [undefined, null, 0, 1, '', 'true', {}, NaN]) {
  assert.equal(legacyUserDataMirrorPlanV1({ cutoverBridge, cloudRevision: 5 }).write, true,
    `cutoverBridge ${String(cutoverBridge)} must not silence the write`);
}
assert.equal(legacyUserDataMirrorPlanV1().write, true, 'no argument at all must not silence the write');

// 4) The settled revision is never invented. A number larger than the row's
//    real revision would out-rank the actual cloud state for anything still
//    comparing the two, so unusable input settles at 0 rather than guessing.
for (const cloudRevision of [undefined, null, -1, 0, 'abc', NaN, Infinity, 1.5, 2 ** 53]) {
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision });
  assert.equal(plan.settleRevision, 0,
    `cloudRevision ${String(cloudRevision)} must settle at 0, not be guessed upward`);
}

// 4b) The settled revision never runs backwards. A row deleted server-side
//     reads as 0, and settling there would write a 0 into the synced V7
//     `workspace` entity -- handing every other device a counter that had gone
//     down. The device's own recorded revision is the floor.
{
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: 0, localRevision: 11 });
  assert.equal(plan.settleRevision, 11, 'a vanished cloud row must not drag the revision down');
}
{
  // The cloud is still ahead when another device wrote before this sync.
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: 12, localRevision: 11 });
  assert.equal(plan.settleRevision, 12, 'the cloud still wins while it is ahead');
}
{
  // A junk local value cannot lift the settled revision above the real row.
  const plan = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: 4, localRevision: 'many' });
  assert.equal(plan.settleRevision, 4, 'an unusable floor is ignored, not guessed');
}

// 5) Repeat action. The mirror write is what used to advance `revision`, so the
//    number now stays put. Running the same sync twice must settle on the same
//    revision both times -- neither drifting upward on its own nor collapsing to
//    0 on the second pass, which is how a frozen counter usually breaks.
{
  const cloudRevision = 11;
  const first = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision });
  const second = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: first.settleRevision });
  const third = legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: second.settleRevision });
  assert.deepEqual([first.settleRevision, second.settleRevision, third.settleRevision], [11, 11, 11],
    'a frozen revision must stay exactly where the cloud left it');
  assert.equal(second.write, false);
  assert.equal(third.write, false);
}

// 6) A device that cuts over between two syncs stops mid-session, and one that
//    somehow reverts resumes writing. The gate reads the current world every
//    time rather than latching on the first answer.
{
  assert.equal(legacyUserDataMirrorPlanV1({ cutoverBridge: false, cloudRevision: 7 }).write, true);
  assert.equal(legacyUserDataMirrorPlanV1({ cutoverBridge: true, cloudRevision: 7 }).write, false);
  assert.equal(legacyUserDataMirrorPlanV1({ cutoverBridge: false, cloudRevision: 7 }).write, true);
}

console.log('MYFI P13 LEGACY MIRROR GATE RUNTIME: PASSED');
