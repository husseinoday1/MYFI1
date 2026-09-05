// MYFI — the wiring that makes the adoption path reachable at all.
//
// The library can be perfect and still never run. Three real accounts sat
// blocked on 2026-09-05 because prepareV2ConflictRecovery gates eligibility on
// lastSyncError being exactly 'financial_v2_revision_conflict', and a
// ledger-id conflict never reaches lastSyncError -- the V1 fallback nulls it.
// So the gate could not be satisfied by them however many times sync ran.
//
// This executes the real gate expression against fixtures rather than grepping
// for it, so a future edit that reorders or narrows it fails here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const slice = read('src/store/slices/useSyncSlice.js');

// --- the gate, executed --------------------------------------------------

const start = slice.indexOf('    const ledgerIdConflict =');
assert(start >= 0, 'the ledger-id-conflict branch is missing -- update this test');
const end = slice.indexOf('    if (!current.online', start);
assert(end > start, 'the original eligibility gate is missing');
const block = slice.slice(start, end);

// The block routes by returning early, so what is observed is whether it
// actually reached the adoption action -- which is the behaviour that matters,
// not the value of an intermediate variable.
const reaches = (current) => {
  let called = false;
  // eslint-disable-next-line no-new-func
  const fn = new Function('current', 'get', `${block}\nreturn 'fell_through';`);
  const result = fn(current, () => ({
    prepareV2IdentityAdoption: () => { called = true; return { ok: true, routed: true }; },
  }));
  return { ledgerIdConflict: called, fellThrough: result === 'fell_through' };
};

// The exact device state the three accounts were in: activation failed on a
// ledger-id conflict, and lastSyncError is null because V1 succeeded after it.
{
  const state = {
    online: true, syncing: false, lastSyncError: null,
    financialSyncV2Activation: { status: 'failed_before_activation', error: 'financial_v2_ledger_id_conflict' },
  };
  assert.equal(reaches(state).ledgerIdConflict, true, 'a stuck ledger-id conflict must reach the adoption path');
}

// It must NOT hijack the case the existing recovery owns.
{
  const state = {
    online: true, syncing: false, lastSyncError: 'financial_v2_revision_conflict',
    financialSyncV2Activation: null,
  };
  assert.equal(reaches(state).ledgerIdConflict, false, 'a revision conflict must stay with the existing recovery');
}

// A different activation failure is not this repair. Adopting a cloud identity
// because of, say, a readback failure would replace local data over a problem
// that has nothing to do with identity.
for (const error of [
  'financial_v2_bootstrap_readback_not_verified',
  'financial_v2_activation_shadow_not_quiescent',
  'financial_v2_protocol_incompatible',
  '',
]) {
  const state = {
    online: true, syncing: false, lastSyncError: null,
    financialSyncV2Activation: { status: 'failed_before_activation', error },
  };
  assert.equal(reaches(state).ledgerIdConflict, false, `activation error ${error || '(empty)'} must not trigger adoption`);
}

// A ledger-id conflict recorded against a status that is not the terminal
// failure must not trigger it either -- mid-attempt states resolve themselves.
for (const status of ['bootstrapping', 'validating_v2_shadow', 'activating', 'recovered']) {
  const state = {
    online: true, syncing: false, lastSyncError: null,
    financialSyncV2Activation: { status, error: 'financial_v2_ledger_id_conflict' },
  };
  assert.equal(reaches(state).ledgerIdConflict, false, `status ${status} must not trigger adoption`);
}

// No activation record at all must be safe.
assert.equal(
  reaches({ online: true, syncing: false, lastSyncError: null, financialSyncV2Activation: null }).ledgerIdConflict,
  false,
);

// --- the actions exist and route to the right library ---------------------

for (const [action, fn] of [
  ['prepareV2IdentityAdoption', 'prepareCloudIdentityAdoptionV1'],
  ['confirmV2IdentityAdoption', 'confirmCloudIdentityAdoptionV1'],
]) {
  assert(slice.includes(`${action}: async`), `${action} must exist`);
  assert(slice.includes(fn), `${action} must call ${fn}`);
}

// The two repairs must stay distinct: adoption must never be reachable through
// the conflict-recovery confirm, which promotes a same-identity replacement.
const confirmStart = slice.indexOf('  confirmV2ConflictRecovery: async');
const confirmBody = slice.slice(confirmStart, slice.indexOf('\n  },', confirmStart));
assert.equal(
  /IdentityAdoption/.test(confirmBody), false,
  'the existing confirm must not reach the adoption path',
);

// Confirmation must carry the owner's decisions through; dropping them would
// let the library's readiness gate see an empty set.
const adoptConfirmStart = slice.indexOf('  confirmV2IdentityAdoption: async');
const adoptConfirmBody = slice.slice(adoptConfirmStart, slice.indexOf('\n  },', adoptConfirmStart));
// Checked at the CALL, not the signature: `decisions` appearing as a parameter
// proves nothing about whether it is forwarded, and if it is dropped the
// library's readiness gate sees an empty set and every row reads as undecided.
const callStart = adoptConfirmBody.indexOf('confirmCloudIdentityAdoptionV1({');
assert(callStart >= 0, 'confirm must call the library');
const callArgs = adoptConfirmBody.slice(callStart, adoptConfirmBody.indexOf('})', callStart));
assert(
  /\bdecisions\b/.test(callArgs),
  'confirm must forward the per-row decisions into the library call',
);
assert(callArgs.includes('confirmed: true'), 'confirm must be explicit');

// --- the library boundary -------------------------------------------------

const flow = read('src/lib/financialV2IdentityAdoptionFlowV1.js');
assert(
  flow.includes('stageVerifiedBootstrapWithArchiveV2'),
  'preparation must reuse the proven cloud download rather than a second one',
);
assert(
  flow.includes('createFinancialConflictRecoveryCheckpointV1'),
  'preparation must take a checkpoint before recording an intent',
);
// Confirm must re-verify the cloud rather than trusting what prepare saw.
const confirmFlow = flow.slice(flow.indexOf('export const confirmCloudIdentityAdoptionV1'));
assert(
  confirmFlow.includes('stageVerifiedBootstrapWithArchiveV2'),
  'confirm must re-download and re-prove the cloud, not trust the prepared intent',
);
assert(
  confirmFlow.includes('financial_v2_identity_adoption_cloud_changed'),
  'confirm must refuse if the cloud moved since it was reviewed',
);

console.log('PASS: v2-identity-adoption-wiring');

// The kept entries must actually be re-applied after adoption. Committing the
// identity swap without draining would leave them parked in a meta row that
// nothing reads -- present, but never coming back.
const adoptConfirm = slice.slice(
  slice.indexOf('  confirmV2IdentityAdoption: async'),
  slice.indexOf('\n  },', slice.indexOf('  confirmV2IdentityAdoption: async')),
);
assert(
  adoptConfirm.includes('drainCloudIdentityAdoptionReentryV1'),
  'a successful adoption must drain the re-entry queue',
);
assert(
  /result\?\.ok/.test(adoptConfirm.slice(0, adoptConfirm.indexOf('drainCloudIdentityAdoptionReentryV1'))),
  'the drain must run only after the adoption actually succeeded',
);
assert(
  adoptConfirm.includes('remaining'),
  'a partial drain must be surfaced, not silently swallowed',
);

console.log('PASS: v2-identity-adoption-wiring (reentry)');
