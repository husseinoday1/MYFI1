// §92 -- the pure primitive underneath the migration/cutover auto-resume fix.
// One flag, last-write, always cleared on read: proven here so the wiring
// test (run-financial-maintenance-resume-signal-wiring.cjs) only has to prove
// the call sites use it correctly, not that the flag itself behaves.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialMaintenanceResumeSignal.js');
const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const {
  requestMaintenanceResumeSync, consumeMaintenanceResumeSignal, __resetMaintenanceResumeSignalForTests,
} = compiled.exports;

__resetMaintenanceResumeSignalForTests();

// 1) Starts clear.
assert.equal(consumeMaintenanceResumeSignal(), null, 'no signal must be pending before anything raises one');

// 2) Raise, then consume: returns the reason, and consuming clears it.
requestMaintenanceResumeSync('financial_v7_schema_migration_resume');
assert.equal(consumeMaintenanceResumeSignal(), 'financial_v7_schema_migration_resume');
assert.equal(consumeMaintenanceResumeSignal(), null,
  'a consumed signal must not resurrect itself for an unrelated later read');

// 3) Repeat action: raise/consume twice in sequence behaves identically both
//    times -- the flag doesn't leak or stick from the first round into the
//    second, which is exactly the failure mode a module-scope flag risks.
requestMaintenanceResumeSync('canonical_cutover_resume');
assert.equal(consumeMaintenanceResumeSignal(), 'canonical_cutover_resume');
assert.equal(consumeMaintenanceResumeSignal(), null);
requestMaintenanceResumeSync('canonical_cutover_resume');
assert.equal(consumeMaintenanceResumeSignal(), 'canonical_cutover_resume');
assert.equal(consumeMaintenanceResumeSignal(), null);

// 4) A later raise overwrites an earlier unconsumed one. There is exactly one
//    afterExit per barrier session to deliver to, so there is nothing to
//    queue for -- the last reason raised is the one that mattered.
requestMaintenanceResumeSync('first_reason');
requestMaintenanceResumeSync('second_reason');
assert.equal(consumeMaintenanceResumeSignal(), 'second_reason');

// 5) A falsy/empty reason still raises a real, non-null signal -- a caller
//    that forgets to pass a reason must not silently become a no-op.
requestMaintenanceResumeSync();
assert.equal(consumeMaintenanceResumeSignal(), 'financial_maintenance_resume');
requestMaintenanceResumeSync('');
assert.equal(consumeMaintenanceResumeSignal(), 'financial_maintenance_resume');

__resetMaintenanceResumeSignalForTests();
assert.equal(consumeMaintenanceResumeSignal(), null, 'the test reset itself must leave no signal pending');

console.log('MYFI FINANCIAL MAINTENANCE RESUME SIGNAL RUNTIME: PASSED');
