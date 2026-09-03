// Phase 14 §92 — the two call sites that raise the resume signal.
//
// The behavior itself is proven by run-financial-maintenance-resume-wiring.cjs
// (the afterExit override) and run-financial-maintenance-resume-signal.cjs (the
// signal primitive). What those two cannot reach is loadLocal's migration
// branch and activateFinancialV7Cutover's success branch, which sit behind a
// dependency surface too large to drive end to end for a two-line assertion.
// This pins their placement and their guards instead, so the raise cannot drift
// out of the success path or lose its condition.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');

assert(sync.includes("from '../../lib/financialMaintenanceResumeSignal'"),
  'the sync slice must take the resume signal from its own module, not a local copy');

// --- The override in runFinancialMaintenance -------------------------------

const consumeAt = sync.indexOf('const forcedReason = consumeMaintenanceResumeSignal();');
const guardAt = sync.indexOf('if (options.resumeSync === false && !forcedReason) return;');
assert(consumeAt > 0 && guardAt > consumeAt,
  'the signal must be consumed before the resumeSync guard decides to return');
assert(sync.includes('armScheduledCloudSync(get, forcedReason || options.resumeSyncReason || normalizedReason, 0)'),
  'a forced resume must carry the raising operation reason, not the generic one');

// Consuming unconditionally is the whole point: a signal left unread would be
// inherited by the next unrelated maintenance call.
const afterExitAt = sync.indexOf('afterExit: async () => {');
assert(afterExitAt > 0 && consumeAt > afterExitAt && consumeAt - afterExitAt < 800,
  'the consume must live at the top of afterExit, not behind another branch');

// --- Call site 1: canonical cutover ----------------------------------------

const cutoverAt = sync.indexOf('activateFinancialV7Cutover: async (options = {}) => {');
assert(cutoverAt > 0, 'activateFinancialV7Cutover must still exist');
const cutoverRaiseAt = sync.indexOf("requestMaintenanceResumeSync('canonical_cutover_resume');", cutoverAt);
const cutoverFailAt = sync.indexOf("return { supported: true, ok: false, cutover: false, reason };", cutoverAt);
assert(cutoverRaiseAt > cutoverAt, 'a completed cutover must raise the resume signal');
assert(cutoverRaiseAt < cutoverFailAt,
  'the raise must sit on the success path, ahead of the catch/failure return');
// Everything the success path does before returning must already have happened:
// raising earlier would announce a cutover that could still fail.
const namespaceWriteAt = sync.indexOf('await writeActiveLocalLedgerNamespace(namespace);', cutoverAt);
assert(namespaceWriteAt > 0 && cutoverRaiseAt > namespaceWriteAt,
  'the cutover raise must come after the cutover is fully committed');

// --- Call site 2: schema migration -----------------------------------------

const migrationRaiseAt = sync.indexOf("requestMaintenanceResumeSync('financial_v7_schema_migration_resume')");
assert(migrationRaiseAt > 0, 'a completed schema migration must raise the resume signal');
assert(sync.includes("if (!migration.alreadyCutover) requestMaintenanceResumeSync('financial_v7_schema_migration_resume');"),
  'the routine already-cutover fast path must NOT arm a sync — that is every ordinary app load');

// It belongs to the migration.ok branch; landing in the failure branch would
// resume sync after a parity failure.
const migrationOkAt = sync.indexOf('} else if (migration.ok) {');
const parityFailAt = sync.indexOf("ledgerError: String(migration.reason || 'financial_v7_shadow_parity_failed'),");
assert(migrationOkAt > 0 && migrationRaiseAt > migrationOkAt,
  'the migration raise must sit inside the migration.ok branch');
assert(parityFailAt > 0 && parityFailAt < migrationOkAt,
  'the parity-failure branch must stay ahead of it and must not raise');

console.log('MYFI P14 SYNC RESUME CONTRACT: PASSED');
