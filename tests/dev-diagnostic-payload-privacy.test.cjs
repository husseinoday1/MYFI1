// Standing rule 6 (refinement) — diagnostic payloads under src/dev/ must never carry
// raw coordinator, bootstrap or sync result objects.
//
// Those results embed financial rows: bootstrapFinancialLedgerV2 and its read-back
// verification carry `rows` (the ledger baseline), and syncFinancialMutationsV2 carries
// `conflicts` / `mutations` (remote financial mutations). Acceptance-gate payloads are
// console-logged and pasted into evidence files, so a bare `{ shadow }` or
// `{ bootstrap }` publishes the user's ledger.
//
// Three separate instances of this were found by hand on 2026-08-20 — two caught in
// review before landing, one already live. Hand-checking is not a control; this is.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const devDir = path.join(root, 'src/dev');

// Result objects known to carry financial rows. A bare shorthand property of one of
// these names means the whole object is being spread into a payload.
//
// Deliberately NOT listed: coldArchives, identity, protocol, cloud, existingIntent.
// coldArchives is passed as a legitimate argument to buildFinancialBackup rather than
// embedded in a payload, and the others are ledger/protocol metadata — ids, epochs,
// hashes, timestamps — with no amounts in them.
const FORBIDDEN_SHORTHAND = [
  'bootstrap',
  'readbackVerification',
  'reactivation',
  'shadow',
  'conflicts',
  'mutations',
  'rows',
  'remoteMutations',
];

const files = fs.existsSync(devDir)
  ? fs.readdirSync(devDir).filter(name => name.endsWith('.js'))
  : [];
assert.ok(files.length, 'expected diagnostic modules under src/dev');

const violations = [];
for (const name of files) {
  const source = fs.readFileSync(path.join(devDir, name), 'utf8');
  const lines = source.split(/\r?\n/);
  lines.forEach((line, index) => {
    // Own-line shorthand: leading whitespace, the name, a trailing comma, nothing
    // else. `shadow: syncSummary(shadow)` is fine, and so is `const shadow = await`.
    const ownLine = line.match(/^\s*([A-Za-z_$][\w$]*),\s*$/);
    if (ownLine && FORBIDDEN_SHORTHAND.includes(ownLine[1])) {
      violations.push(`${name}:${index + 1}: bare \`${ownLine[1]},\` in an object literal`);
      return;
    }
    // Single-line literal: `{ shadow }`, `{ shadow, cursor }`, `{ ok, shadow }`.
    // Scoped to braces so ordinary calls like fn(bootstrap, x) are not flagged.
    for (const braced of line.match(/\{[^{}]*\}/g) || []) {
      const inner = braced.slice(1, -1);
      if (inner.includes(':')) continue;
      for (const part of inner.split(',')) {
        const bare = part.trim();
        if (FORBIDDEN_SHORTHAND.includes(bare)) {
          violations.push(`${name}:${index + 1}: bare \`${bare}\` in ${braced.trim()}`);
        }
      }
    }
  });
}

assert.deepEqual(
  violations,
  [],
  'diagnostic payloads must summarise these results, never embed them:\n'
  + violations.join('\n')
  + '\nKeep ids and counts; drop rows/conflicts/mutations.',
);
console.log(`[PASS] no raw result objects embedded in src/dev payloads (${files.length} file(s))`);

// The gate must actually have the summarisers, so the rule is satisfied by
// summarising rather than by having quietly dropped the diagnostics altogether.
const gatePath = path.join(devDir, 'p19RestoreEpochDeviceGate.js');
if (fs.existsSync(gatePath)) {
  const gate = fs.readFileSync(gatePath, 'utf8');
  for (const token of ['activationSummary', 'syncSummary', 'metricSummary']) {
    assert.ok(gate.includes(token), `restore-epoch gate must keep its ${token} helper`);
  }
  assert.ok(
    gate.includes('shadow: syncSummary(shadow)'),
    'the new-epoch shadow result must be summarised where it enters the failure payload',
  );
  assert.ok(
    gate.includes('activationSummary(reactivation)'),
    'the coordinator result must be summarised where it enters the failure payload',
  );
  console.log('[PASS] restore-epoch gate summarises coordinator and sync results');
}

console.log('MYFI DEV DIAGNOSTIC PAYLOAD PRIVACY CONTRACT: PASS');
