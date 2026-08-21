const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const source = fs.readFileSync(path.join(repo, 'src/lib/financialMaintenanceBarrier.js'), 'utf8');

const transformed = source
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ')
  .replace(/export function /g, 'function ')
  + `
module.exports = {
  getFinancialMaintenanceSnapshot,
  isFinancialMaintenanceBlocked,
  isFinancialMaintenanceActive,
  subscribeFinancialMaintenance,
  runFinancialMaintenanceTask,
  waitForFinancialMaintenanceIdle,
  __resetFinancialMaintenanceBarrierForTests,
};`;

const moduleObj = { exports: {} };
new Function('module', 'exports', transformed)(moduleObj, moduleObj.exports);

const {
  getFinancialMaintenanceSnapshot,
  isFinancialMaintenanceBlocked,
  isFinancialMaintenanceActive,
  subscribeFinancialMaintenance,
  runFinancialMaintenanceTask,
  waitForFinancialMaintenanceIdle,
  __resetFinancialMaintenanceBarrierForTests,
} = moduleObj.exports;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  await __resetFinancialMaintenanceBarrierForTests();

  const snapshots = [];
  const unsubscribe = subscribeFinancialMaintenance(snapshot => snapshots.push({ ...snapshot }));
  assert.equal(isFinancialMaintenanceBlocked(), false);
  assert.equal(isFinancialMaintenanceActive(), false);

  let releaseBeforeEnter;
  const beforeEnterGate = new Promise(resolve => { releaseBeforeEnter = resolve; });
  const order = [];

  const first = runFinancialMaintenanceTask({
    reason: 'startup_local_load',
    beforeEnter: async () => {
      order.push('first-before');
      await beforeEnterGate;
    },
    afterExit: async () => {
      order.push('first-after');
    },
  }, async () => {
    order.push('first-task');
    assert.equal(isFinancialMaintenanceActive(), true);
    assert.equal(getFinancialMaintenanceSnapshot().reason, 'startup_local_load');
    await delay(5);
    return 'first-result';
  });

  const pending = getFinancialMaintenanceSnapshot();
  assert.equal(pending.blocked, true);
  assert.equal(pending.pending, true);
  assert.equal(pending.active, false);
  assert.equal(pending.visible, true);
  assert.equal(pending.reason, 'startup_local_load');

  const second = runFinancialMaintenanceTask({
    reason: 'canonical_cutover',
  }, async () => {
    order.push('second-task');
    assert.equal(isFinancialMaintenanceActive(), true);
    assert.equal(getFinancialMaintenanceSnapshot().reason, 'canonical_cutover');
    return 'second-result';
  });

  assert.equal(getFinancialMaintenanceSnapshot().pendingCount, 2);
  releaseBeforeEnter();

  assert.equal(await first, 'first-result');
  assert.equal(await second, 'second-result');
  await waitForFinancialMaintenanceIdle();

  assert.deepEqual(order, ['first-before', 'first-task', 'first-after', 'second-task']);
  assert.equal(isFinancialMaintenanceBlocked(), false);
  assert.equal(isFinancialMaintenanceActive(), false);
  assert(snapshots.some(item => item.pending && !item.active));
  assert(snapshots.some(item => item.active && item.reason === 'startup_local_load'));
  assert(snapshots.some(item => item.active && item.reason === 'canonical_cutover'));

  let failed = false;
  try {
    await runFinancialMaintenanceTask({
      reason: 'failed_preflight',
      beforeEnter: async () => { throw new Error('preflight_failed'); },
    }, async () => true);
  } catch (error) {
    failed = error.message === 'preflight_failed';
  }
  assert.equal(failed, true);
  assert.equal(isFinancialMaintenanceBlocked(), false);

  let releaseSilent;
  const silentGate = new Promise(resolve => { releaseSilent = resolve; });
  const silent = runFinancialMaintenanceTask({
    reason: 'routine_sync_preflight',
    presentation: 'silent',
  }, async () => {
    await silentGate;
    return 'silent-result';
  });
  await delay(0);
  const silentSnapshot = getFinancialMaintenanceSnapshot();
  assert.equal(silentSnapshot.blocked, true, 'silent maintenance must still fence writers');
  assert.equal(silentSnapshot.visible, false, 'routine maintenance must not request a full-screen overlay');
  releaseSilent();
  assert.equal(await silent, 'silent-result');
  await waitForFinancialMaintenanceIdle();

  unsubscribe();
  await __resetFinancialMaintenanceBarrierForTests();
  console.log('P19-015A2 maintenance barrier runtime passed.');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
