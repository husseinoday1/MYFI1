// MYFI — the review screen that stands between the owner's queued financial
// entries and a replacement of their local ledger.
//
// Not styling assertions. These are the rules from the approved design, each of
// which exists because getting it wrong loses someone's money entries:
//
//   - no default decision on any row,
//   - the adopt button stays disabled until every row is decided,
//   - both top-level answers ("this is my data" / "wrong account") are real
//     buttons, since they lead to opposite correct actions,
//   - no batch "keep all" shortcut, which would make the review theatre,
//   - the wrong-account answer changes nothing.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');
const ui = read('src/components/IdentityAdoptionReview.js');
const screen = read('src/screens/DiagnosticsScreen.js');

// --- no defaults -------------------------------------------------------------

// Decisions start empty. A pre-filled map would mean rows the owner never
// looked at arrive already answered.
assert(
  /useState\(\{\}\)/.test(ui),
  'decisions must start empty -- no row may arrive pre-answered',
);
assert.equal(
  /decisions\[[^\]]+\]\s*\|\|\s*'(keep|discard)'/.test(ui), false,
  'no row may fall back to a default decision',
);

// --- the gate ----------------------------------------------------------------

// Readiness is "every row explicitly keep or discard", not "some answered".
assert(
  ui.includes("decisions[row.mutationId] !== 'keep' && decisions[row.mutationId] !== 'discard'"),
  'undecided must mean neither keep nor discard, so an unknown value counts as undecided',
);
assert(
  /const ready = rows\.length > 0 && undecided\.length === 0/.test(ui),
  'the screen is ready only when nothing is left undecided',
);
// The button must actually consume that, not just compute it.
const adoptButton = ui.slice(ui.indexOf('label={L.adopt}') - 400, ui.indexOf('label={L.adopt}') + 200);
assert(
  /disabled=\{busy \|\| !ready\}/.test(adoptButton),
  'the adopt button must be disabled while any row is undecided',
);

// --- both answers are real, equally reachable --------------------------------

assert(ui.includes('onAdopt?.(decisions)'), 'adopting must pass the collected decisions');
assert(ui.includes('onWrongAccount?.()'), 'the wrong-account answer must be a real action');
// Both rendered as AppButton, so neither is a small grey link next to a
// prominent primary -- that asymmetry is what pushes people into the wrong one.
assert.equal(
  (ui.match(/<AppButton/g) || []).length, 2,
  'both top-level answers must be real buttons',
);

// --- no shortcut that would hollow out the review ----------------------------

for (const shortcut of ['keepAll', 'discardAll', 'selectAll', 'applyToAll']) {
  assert.equal(
    ui.includes(shortcut), false,
    `${shortcut} would make the per-row review theatre -- not allowed`,
  );
}

// The undecided count is always shown, so a disabled button is never a mystery.
assert(ui.includes('L.undecided(undecided.length)'), 'the remaining count must be visible');

// --- the screen wiring -------------------------------------------------------

// Offered only in the state it repairs, read from the activation record
// because the V1 fallback nulls lastSyncError.
assert(
  screen.includes("financialSyncV2Activation?.status === 'failed_before_activation'")
  && screen.includes("=== 'financial_v2_ledger_id_conflict'"),
  'the review must be offered only on a real ledger-id conflict',
);
assert(
  screen.includes('{ledgerIdConflict ? ('),
  'the adoption section must be gated on that conflict',
);
assert(
  screen.includes('onAdopt={runAdopt}') && screen.includes('confirmV2IdentityAdoption(decisions)'),
  'the screen must forward the per-row decisions to the store action',
);

// The wrong-account answer must not perform an account action from a
// diagnostics screen -- it explains and changes nothing.
const wrongAccount = screen.slice(screen.indexOf('const showWrongAccountGuidance'));
const wrongAccountBody = wrongAccount.slice(0, wrongAccount.indexOf('\n  };'));
assert(wrongAccountBody.includes('Alert.alert'), 'the wrong-account answer must explain');
assert.equal(
  /signOut|deleteAccount|reset|clear/i.test(wrongAccountBody), false,
  'the wrong-account answer must not take an account or data action',
);

console.log('PASS: identity-adoption-review-ui');
