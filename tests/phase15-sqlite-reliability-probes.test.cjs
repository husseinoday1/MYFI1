// MYFI Phase 15 / §101 — SQLite reliability probes that actually execute.
//
// §101 lists eleven fault categories. Before this file, MYFI's coverage of them was:
//
//   - real probe code for DB-busy, lock contention and disk-full, living in
//     src/dev/phase10RestoreBenchmarkHarness.js — but scoped to the Phase 10
//     restore path, gated behind diagnostic build flags, and executed only on a
//     real device. The registered CI test for it asserts that those code strings
//     are PRESENT IN THE SOURCE; it never runs them.
//   - process-kill probes that the harness itself marks
//     processKillAcceptance: 'PENDING_EXTERNAL_ADB_RUNNER' — i.e. not run.
//   - nothing at all for FK violation, corrupted-DB simulation, or a kill with an
//     un-checkpointed WAL.
//
// This file closes the last group by running real faults against real SQLite in
// CI, under MYFI's own pragma set (WAL + foreign_keys=ON + busy_timeout=5000 +
// synchronous=NORMAL, per §102).
//
// WHAT THIS DOES AND DOES NOT PROVE — read before citing it as evidence.
//
// It runs desktop SQLite through node:sqlite, not Android's expo-sqlite. Both are
// the same SQLite library and the same WAL/FK/synchronous semantics, so this is
// real evidence that MYFI's chosen configuration survives these faults. It is NOT
// evidence about Android's storage stack, about expo-sqlite's bindings, or about
// power loss — a SIGKILL kills the process but leaves the OS page cache intact,
// so it exercises application-crash durability only. The power-loss half of
// §102's open crash-safety question still needs device work and is NOT closed here.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

let DatabaseSync = null;
try { ({ DatabaseSync } = require('node:sqlite')); } catch { /* flagged or absent */ }

// CI runs Node 22, where node:sqlite is behind --experimental-sqlite. Re-exec once
// with the flag rather than skipping silently. See the sibling §102 config test.
if (!DatabaseSync && process.env.MYFI_ALLOW_NO_SQLITE === '1') {
  console.log(`SKIP (opted out): node:sqlite unavailable on ${process.version}; §101 probes not run`);
  process.exit(0);
}

if (!DatabaseSync && !process.env.MYFI_P15_SQLITE_FLAG_RETRY) {
  const retry = spawnSync(
    process.execPath,
    ['--experimental-sqlite', __filename, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, MYFI_P15_SQLITE_FLAG_RETRY: '1' } },
  );
  process.exit(retry.status === null ? 1 : retry.status);
}

// Fail closed rather than skip. The quality-gate runner only prints a test's stdout
// when it FAILS, so a skip is invisible: the gate would report PASS for a run in
// which no fault was ever executed, which is precisely the "evidence that rots
// while staying green" failure this file exists to correct. Both environments we
// actually run — local Node 24 and CI's Node 22 (via the flagged re-exec above) —
// have node:sqlite, so unavailability means something changed and deserves a stop.
if (!DatabaseSync) {
  assert.fail(
    `§101 probes could not run: node:sqlite unavailable on ${process.version}, `
    + 'including after retrying with --experimental-sqlite. Node 22.5+ is required. '
    + 'Set MYFI_ALLOW_NO_SQLITE=1 to downgrade this to a skip if you genuinely need to '
    + 'run the gate on an older Node — but then the §101 evidence is NOT being produced.',
  );
}

const PRAGMAS = 'PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; '
  + 'PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS parent(id TEXT PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS child(
  id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES parent(id),
  amount_minor INTEGER NOT NULL
);
`;

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p15-101-'));
const cleanup = [];
const newDbPath = name => {
  const dir = fs.mkdtempSync(path.join(workdir, `${name}-`));
  cleanup.push(dir);
  return path.join(dir, 'ledger.db');
};

const openConfigured = dbPath => {
  const db = new DatabaseSync(dbPath);
  db.exec(PRAGMAS);
  return db;
};

const quickCheck = db => {
  const row = db.prepare('PRAGMA quick_check').get();
  return String(Object.values(row || {})[0] || '').toLowerCase();
};

// Runs `body` (a JS source string) in a child process that has already opened the
// database with MYFI's pragmas as `db`.
//
// The body must print REACHED_KILL_POINT immediately before killing itself, and
// assertKilled() below checks for it. Without that marker a probe that asserts
// "the uncommitted row is absent" would pass vacuously whenever the child failed
// to start at all — a bad flag, a syntax error, a missing module — because a
// child that never ran also leaves no row behind and also exits non-zero.
const KILL_MARKER = 'REACHED_KILL_POINT';

const runChild = (dbPath, body) => {
  const script = path.join(workdir, `child-${Math.random().toString(36).slice(2)}.cjs`);
  fs.writeFileSync(script, `
const { DatabaseSync } = require('node:sqlite');
const nodeFs = require('node:fs');
// Synchronous write to fd 1. console.log to a pipe can be asynchronous (notably on
// Windows), and an immediately following SIGKILL would discard the buffered marker,
// failing the probe for a reason that has nothing to do with SQLite.
const reachedKillPoint = () => nodeFs.writeSync(1, ${JSON.stringify(`${KILL_MARKER}\n`)});
const db = new DatabaseSync(${JSON.stringify(dbPath)});
db.exec(${JSON.stringify(PRAGMAS)});
${body}
`);
  cleanup.push(script);
  return spawnSync(
    process.execPath,
    ['--experimental-sqlite', script],
    { encoding: 'utf8', env: { ...process.env, NODE_NO_WARNINGS: '1' } },
  );
};

const assertKilled = (child, label) => {
  assert(
    String(child.stdout || '').includes(KILL_MARKER),
    `§101 ${label}: the child never reached its kill point `
    + `(status=${child.status}, signal=${child.signal}, stderr=${String(child.stderr || '').trim().slice(0, 300)}) `
    + '— the probe would otherwise have "passed" without running the fault',
  );
  assert(
    child.status !== 0,
    `§101 ${label}: child exited cleanly, so the kill never happened`,
  );
};

const results = [];

// --- Probe 1: FK violation is enforced and rolls its transaction back ---------

{
  const dbPath = newDbPath('fk');
  const db = openConfigured(dbPath);
  db.exec(SCHEMA);
  db.prepare('INSERT INTO parent(id,name) VALUES (?,?)').run('p1', 'wallet');

  let rejected = false;
  try {
    db.exec('BEGIN');
    db.prepare('INSERT INTO child(id,parent_id,amount_minor) VALUES (?,?,?)')
      .run('c1', 'p1', -1000);
    // Second row points at a parent that does not exist.
    db.prepare('INSERT INTO child(id,parent_id,amount_minor) VALUES (?,?,?)')
      .run('c2', 'MISSING', -2000);
    db.exec('COMMIT');
  } catch {
    rejected = true;
    db.exec('ROLLBACK');
  }

  assert(rejected, '§101 FK violation: foreign_keys=ON did not reject an orphan row');
  const count = db.prepare('SELECT COUNT(*) AS n FROM child').get().n;
  assert.equal(
    Number(count), 0,
    '§101 FK violation: the valid row from the failed transaction survived — '
    + 'a rejected batch must leave no partial state',
  );
  assert.equal(quickCheck(db), 'ok', '§101 FK violation: database not healthy afterwards');
  db.close();
  results.push('fk_violation_rejected_and_rolled_back');
}

// --- Probe 2: process killed mid-command leaves no partial state --------------

{
  const dbPath = newDbPath('kill-mid');
  const db = openConfigured(dbPath);
  db.exec(SCHEMA);
  db.prepare('INSERT INTO parent(id,name) VALUES (?,?)').run('p1', 'wallet');
  db.close();

  const child = runChild(dbPath, `
db.exec('BEGIN');
db.prepare('INSERT INTO child(id,parent_id,amount_minor) VALUES (?,?,?)').run('mid', 'p1', -5000);
// Die with the transaction open, exactly like an OS kill mid-command.
reachedKillPoint();
process.kill(process.pid, 'SIGKILL');
`);
  assertKilled(child, 'kill mid-command');

  const after = openConfigured(dbPath);
  assert.equal(quickCheck(after), 'ok', '§101 kill mid-command: database corrupted');
  assert.equal(
    Number(after.prepare("SELECT COUNT(*) AS n FROM child WHERE id='mid'").get().n), 0,
    '§101 kill mid-command: an uncommitted row survived the kill',
  );
  after.close();
  results.push('kill_mid_command_no_partial_write');
}

// --- Probe 3: process killed after commit keeps the committed row -------------
// This is the durability evidence for §102's synchronous=NORMAL, for the
// application-crash case specifically. Power loss is NOT covered (see header).

{
  const dbPath = newDbPath('kill-after');
  const db = openConfigured(dbPath);
  db.exec(SCHEMA);
  db.prepare('INSERT INTO parent(id,name) VALUES (?,?)').run('p1', 'wallet');
  db.close();

  const child = runChild(dbPath, `
db.exec('BEGIN');
db.prepare('INSERT INTO child(id,parent_id,amount_minor) VALUES (?,?,?)').run('after', 'p1', -7500);
db.exec('COMMIT');
// Die immediately after the commit returns, with no clean close and no checkpoint.
reachedKillPoint();
process.kill(process.pid, 'SIGKILL');
`);
  assertKilled(child, 'kill after commit');

  const after = openConfigured(dbPath);
  assert.equal(quickCheck(after), 'ok', '§101 kill after commit: database corrupted');
  const row = after.prepare("SELECT amount_minor AS a FROM child WHERE id='after'").get();
  assert(
    row && Number(row.a) === -7500,
    '§101 kill after commit: a COMMITTED row was lost — synchronous=NORMAL would not '
    + 'be a safe choice for the ledger if this failed',
  );
  after.close();
  results.push('kill_after_commit_durable');
}

// --- Probe 4: killed with a large un-checkpointed WAL, recovery is clean -------
// A true mid-checkpoint interrupt is not reachable through a synchronous API, so
// this probe is deliberately named for what it actually does: it kills the writer
// while a substantial WAL is outstanding, which is the state a checkpoint
// interrupted at any point would leave behind.

{
  const dbPath = newDbPath('wal');
  const db = openConfigured(dbPath);
  db.exec(SCHEMA);
  db.prepare('INSERT INTO parent(id,name) VALUES (?,?)').run('p1', 'wallet');
  db.close();

  const child = runChild(dbPath, `
const insert = db.prepare('INSERT INTO child(id,parent_id,amount_minor) VALUES (?,?,?)');
for (let i = 0; i < 2000; i += 1) {
  db.exec('BEGIN');
  insert.run('w' + i, 'p1', -i);
  db.exec('COMMIT');
}
reachedKillPoint();
process.kill(process.pid, 'SIGKILL');
`);
  assertKilled(child, 'un-checkpointed WAL');

  const walPath = `${dbPath}-wal`;
  const walBytes = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;

  const after = openConfigured(dbPath);
  assert.equal(quickCheck(after), 'ok', '§101 un-checkpointed WAL: database corrupted');
  assert.equal(
    Number(after.prepare('SELECT COUNT(*) AS n FROM child').get().n), 2000,
    '§101 un-checkpointed WAL: committed rows were lost during WAL recovery',
  );
  after.close();
  results.push(`wal_recovery_after_kill (wal was ${walBytes} bytes)`);
}

// --- Probe 5: corruption is detected, not silently served ---------------------

{
  const dbPath = newDbPath('corrupt');
  const db = openConfigured(dbPath);
  db.exec(SCHEMA);
  const insert = db.prepare('INSERT INTO parent(id,name) VALUES (?,?)');
  for (let i = 0; i < 500; i += 1) insert.run(`p${i}`, `wallet ${i}`);
  // Fold the WAL into the main file so the corruption lands on real pages.
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  db.close();

  const bytes = fs.readFileSync(dbPath);
  assert(bytes.length > 8192, '§101 corruption probe: database too small to corrupt meaningfully');
  // Overwrite a page well past the header, so the file still opens and the damage
  // has to be caught by an integrity check rather than by the open call.
  for (let i = 4096; i < 8192; i += 1) bytes[i] = 0x5a;
  fs.writeFileSync(dbPath, bytes);

  let detected = false;
  try {
    const damaged = openConfigured(dbPath);
    detected = quickCheck(damaged) !== 'ok';
    damaged.close();
  } catch {
    // Refusing to open at all is also a detection, and equally fail-closed.
    detected = true;
  }
  assert(
    detected,
    '§101 corruption: quick_check reported a corrupted database as healthy — '
    + 'restore validation and the support flow both rely on it failing closed',
  );
  results.push('corruption_detected_by_quick_check');
}

for (const dir of cleanup.reverse()) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
}
try { fs.rmSync(workdir, { recursive: true, force: true }); } catch { /* best effort */ }

console.log(`§101 probes executed: ${results.join(', ')}`);
console.log('PASS: phase15-sqlite-reliability-probes');
