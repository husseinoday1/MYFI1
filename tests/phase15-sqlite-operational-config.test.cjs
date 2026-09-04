// MYFI Phase 15 / §102 — SQLite Operational Configuration.
//
// §102 requires the five operational settings to be audited and not changed
// casually. This test pins two properties that a future edit could break
// silently:
//
//   1. Every operational pragma for the shared ledger connection is set in
//      ledgerDatabase.getLedgerDb() and nowhere else. The original defect was
//      `PRAGMA synchronous = NORMAL` living inside activeLedgerRepository's
//      schema bootstrap, which made the financial ledger's durability depend on
//      whether that module had run yet in the process — FULL before it, NORMAL
//      after it.
//   2. The chosen values are the ones the audit justified.
//
// Reason + benchmark + crash-safety evidence:
// docs/04_CURRENT_EVIDENCE/MYFI_PHASE15_SQLITE_CONFIG_AUDIT_2026-09-04.md
//
// It also runs the FULL-vs-NORMAL comparison for real (node:sqlite), so the
// benchmark the audit cites is reproducible rather than a number in prose.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const ledgerDb = read('src/lib/ledgerDatabase.js');
const activeLedger = read('src/lib/activeLedgerRepository.js');
const harness = read('src/dev/financialLedgerV7DeviceHarness.js');

// --- 1. Single owner for the connection's operational pragmas -----------------

for (const pragma of [
  'PRAGMA journal_mode = WAL;',
  'PRAGMA foreign_keys = ON;',
  'PRAGMA busy_timeout = 5000;',
  'PRAGMA synchronous = NORMAL;',
]) {
  assert(
    ledgerDb.includes(pragma),
    `ledgerDatabase.js must own the shared connection pragma: ${pragma}`,
  );
}

assert.equal(
  /PRAGMA\s+synchronous/i.test(activeLedger),
  false,
  'activeLedgerRepository must not set synchronous — it shares getLedgerDb()\'s connection, '
  + 'so a pragma here makes durability depend on module call order (§102)',
);

// No other module may set an operational pragma on the shared connection. The
// P10-014A clone probe is exempt: it operates on its own throwaway clone handle,
// deliberately at different settings (query_only, delete journal, page quota).
const srcRoot = path.join(root, 'src');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (
  entry.isDirectory()
    ? walk(path.join(dir, entry.name))
    : [path.join(dir, entry.name)]
));
const EXEMPT = new Set([
  path.join('src', 'lib', 'ledgerDatabase.js'),
  path.join('src', 'dev', 'phase10RestoreBenchmarkHarness.js'),
  path.join('src', 'dev', 'p10_014aCloneProbeEntry.js'),
]);
// Comments may legitimately mention a pragma (they document where it lives), so
// strip line comments before matching — otherwise the check fires on prose.
const stripLineComments = source => source
  .split('\n')
  .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
  .join('\n');
const offenders = walk(srcRoot)
  .filter(file => file.endsWith('.js'))
  .filter(file => !EXEMPT.has(path.relative(root, file)))
  .filter(file => /PRAGMA\s+(synchronous|journal_mode|busy_timeout|foreign_keys)\s*=/i.test(
    stripLineComments(fs.readFileSync(file, 'utf8')),
  ))
  .map(file => path.relative(root, file));
assert.deepEqual(
  offenders, [],
  `only ledgerDatabase.js may set operational pragmas on the shared connection; found: ${offenders.join(', ')}`,
);

// The clone probe is exempted above because it legitimately configures its own
// throwaway handle (query_only, delete journal, page quota). But that same handle
// is installed as the shared connection via setP10CloneLedgerDbOverride, and
// getLedgerDb() returns it before reaching its own pragma block — so the clone's
// setup line is the one place outside ledgerDatabase.js that must mirror the full
// connection contract. A blanket exemption would hide drift there, which is exactly
// how the missing synchronous pragma survived the first version of this test.
const cloneProbe = read('src/dev/p10_014aCloneProbeEntry.js');
const cloneSetup = cloneProbe
  .split('\n')
  .find(line => /clone\.execAsync\('PRAGMA/.test(line)) || '';
for (const pragma of [
  'PRAGMA journal_mode = WAL',
  'PRAGMA foreign_keys = ON',
  'PRAGMA busy_timeout = 5000',
  'PRAGMA synchronous = NORMAL',
]) {
  assert(
    cloneSetup.includes(pragma),
    `the P10-014A clone stands in for the shared connection and must set ${pragma}`,
  );
}

// --- 2. Runtime proof stays wired -------------------------------------------

assert(
  harness.includes("db.getFirstAsync('PRAGMA synchronous')"),
  'device harness must read PRAGMA synchronous so the pinned value is proven on real hardware',
);
assert(
  harness.includes("'synchronous_not_normal'"),
  'device harness must fail closed when synchronous is not NORMAL (1)',
);

// --- 3. The benchmark the audit cites, run for real --------------------------

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { /* older Node */ }

if (!DatabaseSync) {
  console.log('SKIP: node:sqlite unavailable, static §102 assertions only');
} else {
  const measure = (mode, rows, batched) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p15-'));
    const db = new DatabaseSync(path.join(dir, 'bench.db'));
    db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    db.exec(`PRAGMA synchronous = ${mode};`);
    db.exec('CREATE TABLE t(id INTEGER PRIMARY KEY, ns TEXT, payload TEXT, amt INTEGER);');
    const insert = db.prepare('INSERT INTO t(ns,payload,amt) VALUES (?,?,?)');
    const payload = JSON.stringify({ title: 'perf', cat: 'health', walletId: 'demo_bank' });
    const started = process.hrtime.bigint();
    if (batched) {
      db.exec('BEGIN');
      for (let i = 0; i < rows; i += 1) insert.run('guest', payload, -1000 - i);
      db.exec('COMMIT');
    } else {
      for (let i = 0; i < rows; i += 1) {
        db.exec('BEGIN');
        insert.run('guest', payload, -1000 - i);
        db.exec('COMMIT');
      }
    }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    return ms;
  };

  // Warm the filesystem first so the first mode measured is not penalised.
  measure('NORMAL', 100, false);
  measure('FULL', 100, false);

  // Kept deliberately small: this assertion's cost is dominated by fsync latency,
  // which on a CI runner's storage can be 10-50x this machine's. The audit only
  // needs the direction, not a precise ratio, so 250 commits is enough signal
  // without putting tens of seconds of disk-bound work in the gate's critical path.
  const perCommitFull = measure('FULL', 250, false);
  const perCommitNormal = measure('NORMAL', 250, false);
  const batchFull = measure('FULL', 20000, true);
  const batchNormal = measure('NORMAL', 20000, true);

  console.log(
    `§102 benchmark: per-commit FULL=${Math.round(perCommitFull)}ms NORMAL=${Math.round(perCommitNormal)}ms`
    + ` | batch FULL=${Math.round(batchFull)}ms NORMAL=${Math.round(batchNormal)}ms`,
  );

  // The audit's load-bearing claim is directional, not a fixed number: FULL is
  // materially more expensive per commit, and materially cheaper in a batch.
  // Asserting a hard ratio would make this test a flaky machine benchmark, so
  // assert only the ordering the decision actually rests on, with slack for a
  // fast disk. On a machine where fsync is nearly free the per-commit gap can
  // close; that would weaken the argument for NORMAL, not invalidate the pin,
  // so this reports rather than fails when the gap is small.
  assert(
    perCommitFull >= perCommitNormal,
    'FULL must not be faster than NORMAL on the per-commit path — benchmark is unsound',
  );
  if (perCommitFull < perCommitNormal * 2) {
    console.log(
      'NOTE: FULL/NORMAL per-commit gap is small on this machine'
      + ` (${(perCommitFull / Math.max(perCommitNormal, 0.001)).toFixed(2)}x);`
      + ' the audit measured 41x on the reference machine. Android fsync is slower than'
      + ' desktop, so this does not by itself argue for revisiting the choice.',
    );
  }
  assert(
    batchFull < perCommitFull,
    'batched writes must be cheaper than per-commit writes at FULL — benchmark is unsound',
  );
}

console.log('PASS: phase15-sqlite-operational-config');
