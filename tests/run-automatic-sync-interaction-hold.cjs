const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(path.join(repo, 'src/lib/automaticSyncInteractionHold.js'), 'utf8');
const transformed = source
  .replace(/export const /g, 'const ')
  + `\nmodule.exports = {
    acquireAutomaticSyncInteractionHold,
    releaseAutomaticSyncInteractionHold,
    isAutomaticSyncInteractionHeld,
    __resetAutomaticSyncInteractionHoldsForTests,
  };`;
const moduleObj = { exports: {} };
new Function('module', 'exports', transformed)(moduleObj, moduleObj.exports);

const {
  acquireAutomaticSyncInteractionHold,
  releaseAutomaticSyncInteractionHold,
  isAutomaticSyncInteractionHeld,
  __resetAutomaticSyncInteractionHoldsForTests,
} = moduleObj.exports;

__resetAutomaticSyncInteractionHoldsForTests();
assert.equal(isAutomaticSyncInteractionHeld(), false);
const first = acquireAutomaticSyncInteractionHold('transaction_editor');
const second = acquireAutomaticSyncInteractionHold('tracker_editor');
assert.notEqual(first, second);
assert.equal(isAutomaticSyncInteractionHeld(), true);
assert.equal(releaseAutomaticSyncInteractionHold(first), true);
assert.equal(isAutomaticSyncInteractionHeld(), true, 'one open editor must keep automatic sync deferred');
assert.equal(releaseAutomaticSyncInteractionHold(second), true);
assert.equal(isAutomaticSyncInteractionHeld(), false);
assert.equal(releaseAutomaticSyncInteractionHold(second), false, 'release is idempotent');
console.log('Automatic sync interaction hold runtime passed.');
