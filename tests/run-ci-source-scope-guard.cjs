// The CI source-scope guard, tested where it can actually be run.
//
// This gate had failed three times for one reason: someone added a source file and did
// not add the matching line to the allowlist. Each time, the build printed a raw
// `diff -u` of two temp files and stopped — output that proves a mismatch exists
// without saying what to do about it. The rule survived only in whoever remembered it.
//
// The check is still a deliberate refusal; what changed is that it now names the
// missing lines and prints them ready to paste. That behaviour is worth a test, because
// the failure path is the entire point of the change and it is the path nobody sees
// until the day it matters — a wrong or empty failure message would look identical to a
// working one until someone hit it in CI.
//
// Runs the real script against throwaway git repositories, so it exercises the shell
// the runner exercises rather than a re-implementation of it in JavaScript.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const script = path.join(root, '.github/scripts/verify-source-scope.sh');

assert.ok(fs.existsSync(script), 'the shared scope script must exist');

// Every workflow that gates on source scope must call the shared script rather than
// carrying its own copy of the comparison. Four separate copies is how they drifted
// into four slightly different failure messages in the first place.
{
  const workflowDir = path.join(root, '.github/workflows');
  const usesAllowlist = fs.readdirSync(workflowDir)
    .filter(name => name.endsWith('.yml'))
    .map(name => [name, fs.readFileSync(path.join(workflowDir, name), 'utf8')])
    .filter(([, text]) => text.includes('-allowed-source.txt'));

  assert.ok(usesAllowlist.length >= 5, 'expected the allowlist-gated workflows to be found');
  for (const [name, text] of usesAllowlist) {
    assert.ok(
      text.includes('.github/scripts/verify-source-scope.sh'),
      `${name} gates on an allowlist but does not use the shared scope script`,
    );
    assert.ok(
      !text.includes('diff -u /tmp/expected.txt /tmp/actual.txt'),
      `${name} still carries its own inline copy of the scope comparison`,
    );
  }
  console.log(`[PASS] all ${usesAllowlist.length} allowlist-gated workflows call the shared script`);
}

const bash = (cwd, args) => spawnSync('bash', [script, ...args], {
  cwd,
  encoding: 'utf8',
  env: { ...process.env, LC_ALL: 'C' },
});

const makeRepo = (files) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-scope-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  fs.writeFileSync(path.join(dir, 'baseline.txt'), 'baseline\n');
  git('add', '-A');
  git('commit', '-qm', 'baseline');
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim();
  for (const [name, contents] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, path.dirname(name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), contents);
  }
  git('add', '-A');
  git('commit', '-qm', 'change');
  return { dir, base };
};

const writeAllowlist = (dir, entries) => {
  const file = path.join(dir, 'allow.txt');
  // Deliberately CRLF: the list is authored on Windows and compared on a Linux runner,
  // and a trailing CR silently mismatching every entry is a bug this gate already had.
  fs.writeFileSync(file, ['# header comment', '', ...entries].join('\r\n') + '\r\n');
  return 'allow.txt';
};

// --- the matching case ----------------------------------------------------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n', 'src/b.js': 'b\n' });
  const allow = writeAllowlist(dir, ['src/a.js', 'src/b.js']);
  const result = bash(dir, [base, allow, 'src']);
  assert.equal(result.status, 0, `expected pass, got:\n${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /\[PASS\]/);
  console.log('[PASS] a matching scope passes, CRLF allowlist and all');
}

// --- a file changed but not listed: the failure that keeps happening -------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n', 'src/new.js': 'new\n' });
  const allow = writeAllowlist(dir, ['src/a.js']);
  const result = bash(dir, [base, allow, 'src']);
  assert.equal(result.status, 1, 'an unlisted source file must fail the build');

  const out = result.stdout;
  assert.match(out, /\[FAIL\]/);
  assert.match(out, /----- copy from here -----/,
    'the failure must hand back a block that can be pasted, not only a diff');

  // The pasteable block must contain the missing path on a line of its own, with no
  // decoration — pasting it into the allowlist has to just work.
  const block = out.split('----- copy from here -----')[1].split('----- to here -----')[0];
  assert.deepEqual(
    block.split('\n').map(line => line.trim()).filter(Boolean),
    ['src/new.js'],
    'the pasteable block must be exactly the missing entries',
  );
  console.log('[PASS] an unlisted file fails, and names itself ready to paste');
}

// --- a stale entry --------------------------------------------------------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n' });
  const allow = writeAllowlist(dir, ['src/a.js', 'src/removed.js']);
  const result = bash(dir, [base, allow, 'src']);
  assert.equal(result.status, 1, 'a stale allowlist entry must fail too');
  assert.match(result.stdout, /no longer differ from the baseline/);
  assert.match(result.stdout, /src\/removed\.js/);
  assert.doesNotMatch(result.stdout, /----- copy from here -----/,
    'nothing is missing here, so there is nothing to paste');
  console.log('[PASS] a stale entry fails, and is reported as stale rather than missing');
}

// --- both at once ---------------------------------------------------------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n', 'src/new.js': 'new\n' });
  const allow = writeAllowlist(dir, ['src/a.js', 'src/removed.js']);
  const result = bash(dir, [base, allow, 'src']);
  assert.equal(result.status, 1);
  const block = result.stdout.split('----- copy from here -----')[1].split('----- to here -----')[0];
  assert.deepEqual(block.split('\n').map(line => line.trim()).filter(Boolean), ['src/new.js']);
  assert.match(result.stdout, /src\/removed\.js/);
  console.log('[PASS] missing and stale are reported separately, not merged into one list');
}

// --- the pathspec still scopes the comparison -----------------------------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n', 'docs/note.md': 'note\n' });
  const allow = writeAllowlist(dir, ['src/a.js']);
  const scoped = bash(dir, [base, allow, 'src']);
  assert.equal(scoped.status, 0, 'a doc change outside the pathspec must not fail a source gate');

  const unscoped = bash(dir, [base, allow]);
  assert.equal(unscoped.status, 1, 'without a pathspec every changed file counts');
  console.log('[PASS] the pathspec still limits what the gate compares');
}

// --- refusals that are not about scope ------------------------------------
{
  const { dir, base } = makeRepo({ 'src/a.js': 'a\n' });
  writeAllowlist(dir, ['src/a.js']);

  const missingList = bash(dir, [base, 'no-such-file.txt', 'src']);
  assert.equal(missingList.status, 1);
  assert.match(missingList.stdout, /allowlist file not found/);

  fs.writeFileSync(path.join(dir, 'empty.txt'), '# only a comment\n');
  const emptyList = bash(dir, [base, 'empty.txt', 'src']);
  assert.equal(emptyList.status, 1);
  assert.match(emptyList.stdout, /has no entries/,
    'an empty allowlist must fail rather than vacuously allow everything');

  const unrelated = bash(dir, ['0000000000000000000000000000000000000000', 'allow.txt', 'src']);
  assert.equal(unrelated.status, 1, 'a baseline that is not an ancestor must fail');
  console.log('[PASS] a missing, empty, or unreachable baseline fails closed');
}

console.log('MYFI CI SOURCE SCOPE GUARD CONTRACT: PASS');
