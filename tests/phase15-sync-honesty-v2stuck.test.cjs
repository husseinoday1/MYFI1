// MYFI — sync-status honesty for a stuck V2 activation.
//
// Before this: SettingsScreen's syncState was computed only from
// demoMode/user/syncing/online/lastSyncError/dirty. When V2 activation fails
// and silently falls back to V1 (useSyncSlice.js's V1-fallback path), the V1
// call can succeed on its own and drive dirty:false/lastSyncError:null — so
// the UI reported "Synced" while real financial mutations sat stuck in
// ledger_outbox_v3. See
// docs/04_CURRENT_EVIDENCE/MYFI_SYNC_HONESTY_AND_RECOVERY_DESIGN_2026-09-04.md
//
// This test extracts the actual v2Stuck/syncState expressions from the source
// and executes them against fixtures — not a string-presence check — so a
// future edit that reorders the ternary or loosens the guard breaks the test,
// not just a grep.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');

const startMarker = 'const v2Stuck = ';
const endMarker = "T.synced };";
const startIdx = source.indexOf(startMarker);
assert(startIdx >= 0, 'could not locate the v2Stuck block — update this test');
const endIdx = source.indexOf(endMarker, startIdx);
assert(endIdx >= 0, 'could not locate the end of the syncState ternary — update this test');
const block = source.slice(startIdx, endIdx + endMarker.length);

// Sanity: the block we sliced out must be exactly the two statements we expect,
// nothing more, nothing less — this catches the marker text drifting silently.
assert(block.includes('const syncState = cfg.demoMode'), 'sliced block missing syncState');
assert(
  (block.match(/const v2Stuck|const syncState/g) || []).length === 2,
  'sliced block should contain exactly v2Stuck and syncState declarations',
);

const evalSyncState = (fixture) => {
  const {
    user, cfg, financialLedgerV7Cutover, financialSyncV2Activation,
    financialMutationSyncProtocol, syncing, online, lastSyncError, dirty,
    restoreSafety,
  } = fixture;
  const T = { localOnly: 'localOnly', syncPartial: 'syncPartial', syncing: 'syncing', needsAttention: 'needsAttention', pending: 'pending', synced: 'synced' };
  const th = { warn: 'warn', sub: 'sub', exp: 'exp', primary: 'primary', inc: 'inc' };
  const isAr = false;
  // eslint-disable-next-line no-new-func
  const fn = new Function(
    'user', 'cfg', 'financialLedgerV7Cutover', 'financialSyncV2Activation',
    'financialMutationSyncProtocol', 'syncing', 'online', 'lastSyncError', 'dirty',
    'restoreSafety', 'T', 'th', 'isAr',
    `${block}\nreturn syncState;`,
  );
  return fn(
    user, cfg, financialLedgerV7Cutover, financialSyncV2Activation,
    financialMutationSyncProtocol, syncing, online, lastSyncError, dirty,
    restoreSafety ?? null, T, th, isAr,
  );
};

const base = {
  user: { id: 'u1' },
  cfg: { demoMode: false },
  financialLedgerV7Cutover: true,
  financialSyncV2Activation: { status: 'failed_before_activation', reason: 'financial_v2_ledger_id_conflict' },
  financialMutationSyncProtocol: 1,
  syncing: false,
  online: true,
  lastSyncError: null,
  dirty: false,
  restoreSafety: null,
};

// The exact reported scenario: V1 fallback succeeded (online, no lastSyncError,
// not dirty) while V2 never activated. Before this fix this fell through to
// "Synced". It must not, any more.
{
  const state = evalSyncState(base);
  assert.equal(state.text, 'syncPartial', 'a stuck V2 activation must not report Synced');
  assert.notEqual(state.text, 'synced', 'must never say Synced while V2 is stuck');
}

// Regression guard: once V2 genuinely activates (protocol reaches 2), the
// stale 'failed_before_activation' status left over from an earlier attempt
// must not keep tripping the indicator.
{
  const state = evalSyncState({ ...base, financialMutationSyncProtocol: 2 });
  assert.equal(state.text, 'synced', 'a stale failed status must not override a protocol that reached 2');
}

// Regression guard: no cutover yet (V7 not active) must not trip v2Stuck —
// the whole V2 activation concept doesn't apply pre-cutover.
{
  const state = evalSyncState({ ...base, financialLedgerV7Cutover: false });
  assert.equal(state.text, 'synced', 'v2Stuck must require financialLedgerV7Cutover');
}

// Regression guard: any other activation status (bootstrapping, activating,
// recovered, or simply null before the first attempt) must not trip the flag —
// only the specific terminal failure does.
for (const status of ['bootstrapping', 'activating', 'recovered', null, undefined]) {
  const state = evalSyncState({ ...base, financialSyncV2Activation: status ? { status } : null });
  assert.equal(state.text, 'synced', `status ${status} must not trip v2Stuck`);
}

// Priority ordering must be unchanged: demoMode and !user still win over
// v2Stuck, since those are stronger/more specific facts about the workspace.
{
  const state = evalSyncState({ ...base, cfg: { demoMode: true } });
  assert.notEqual(state.text, 'syncPartial', 'demoMode must take priority over v2Stuck');
}
{
  const state = evalSyncState({ ...base, user: null });
  assert.equal(state.text, 'localOnly', '!user must take priority over v2Stuck');
}

// v2Stuck must take priority over the ordinary dirty/pending state — a stuck
// V2 activation is a stronger, more specific fact than "some local edits
// haven't synced yet".
{
  const state = evalSyncState({ ...base, dirty: true });
  assert.equal(state.text, 'syncPartial', 'v2Stuck must take priority over the generic dirty/pending state');
}

// --- restoreSafety-driven block: financial_v2_conflict_recovery_blocked ----
//
// Found 2026-09-05: a device where restoreSafety.status was
// 'financial_v2_conflict_recovery_blocked' (the P12 conflict-recovery path,
// separate from financialSyncV2Activation) still showed "Synced", because
// the original v2Stuck check only reads financialSyncV2Activation. This base
// isolates that second path: V2 activation itself is healthy/inapplicable,
// so only restoreSafety can trip the indicator here.
const restoreSafetyBase = {
  ...base,
  financialSyncV2Activation: null,
  financialMutationSyncProtocol: 2,
};

{
  const state = evalSyncState({
    ...restoreSafetyBase,
    restoreSafety: { status: 'financial_v2_conflict_recovery_blocked', operation: 'financial_v2_conflict_recovery' },
  });
  assert.equal(state.text, 'syncPartial', 'a blocked conflict-recovery state must not report Synced');
}

// Regression guard: the 'ready' status (a prepared, reviewable recovery, not
// a block) must not trip the indicator — that state already has its own
// dedicated MenuRow in DataPage, this is not the place to duplicate it.
{
  const state = evalSyncState({
    ...restoreSafetyBase,
    restoreSafety: { status: 'financial_v2_conflict_recovery_ready', operation: 'financial_v2_conflict_recovery' },
  });
  assert.equal(state.text, 'synced', "a 'ready' (not blocked) restoreSafety state must not trip the indicator");
}

// Regression guard: null/absent restoreSafety (the common case) must not trip it.
{
  const state = evalSyncState({ ...restoreSafetyBase, restoreSafety: null });
  assert.equal(state.text, 'synced', 'no restoreSafety state must not trip the indicator');
}

// demoMode/!user must still win over conflictRecoveryStuck too.
{
  const state = evalSyncState({
    ...restoreSafetyBase,
    user: null,
    restoreSafety: { status: 'financial_v2_conflict_recovery_blocked' },
  });
  assert.equal(state.text, 'localOnly', '!user must take priority over conflictRecoveryStuck');
}

console.log('PASS: phase15-sync-honesty-v2stuck');
