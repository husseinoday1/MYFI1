// Home "hide amounts" must cover every amount on the screen.
//
// Reported from real daily use on 2026-08-21: turning amounts off hid everything
// except the recent-transactions list. It turned out three separate renders had each
// drifted out of the masking helper independently — the recent row, the recurring
// review row, and the important-card row. Nothing had gone wrong at once; the screen
// had simply grown three more places to print money in, and each one was written by
// hand.
//
// So a fix alone is not enough here: the next row someone adds will do it again, the
// gate will stay green, and a user who asked for their balances to be private will see
// them anyway. The repo already answered this class of problem with an automated
// control rather than reviewer attention (see dev-diagnostic-payload-privacy), and
// this is the same shape of problem.
//
// The rule: inside HomeScreen, a rendered amount goes through moneyText(). fmt() may
// be used freely to build a string, but the thing placed in JSX must be masked.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/screens/HomeScreen.js');
const source = fs.readFileSync(filename, 'utf8');
const lines = source.split(/\r?\n/);

// The masking helper and the state behind it must still exist and still be wired to
// the stored preference, or every assertion below would pass against a screen that
// masks nothing at all.
assert.ok(
  /const hidden = cfg\.homeBalancesHidden === true;/.test(source),
  'the hidden flag must still come from cfg.homeBalancesHidden',
);
assert.ok(
  /const moneyText = \(value\) => \(hidden \? C\.hiddenAmount : value\);/.test(source),
  'moneyText must still be the single masking helper',
);
console.log('[PASS] the masking helper is present and reads the stored preference');

// A JSX line that renders money: it puts fmt(...) inside an expression slot. Lines
// that only assign into a variable are not renders — those get masked at the point
// they are placed on screen, which the assertions below still cover.
const offenders = [];
lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (!trimmed.includes('fmt(')) return;
  // Not a render: a declaration, an object value, or a plain assignment.
  if (/^(const|let|var)\s/.test(trimmed)) return;
  if (/^[A-Za-z_$][\w$]*:\s/.test(trimmed)) return;
  // A render slot starts with `{` and is not an opening tag or a style object.
  if (!trimmed.startsWith('{')) return;
  if (trimmed.startsWith('{/*')) return;
  if (trimmed.includes('moneyText(')) return;
  offenders.push(`${index + 1}: ${trimmed}`);
});

assert.deepEqual(
  offenders,
  [],
  'every amount rendered on Home must pass through moneyText() so "hide amounts" covers it:\n  '
  + offenders.join('\n  '),
);
console.log('[PASS] every rendered amount on Home passes through moneyText()');

// The three that regressed, named individually. If one is reworked later, this says
// plainly which behaviour has to survive the rework rather than leaving a bare count.
const mustBeMasked = [
  ['recent transactions row', /moneyText\(`\$\{isTransfer \? fmt\(t\.transferAmount\)/],
  ['recurring review row', /moneyText\(`\$\{amount > 0 \? '\+' : '-'\}\$\{fmt\(amount\)\} \$\{sym\}`\)/],
  ['important card row', /moneyText\(`\$\{Number\(item\.amt \|\| 0\) >= 0/],
];
for (const [label, pattern] of mustBeMasked) {
  assert.ok(pattern.test(source), `the ${label} amount must stay masked when amounts are hidden`);
}
console.log('[PASS] the three renders reported from the device stay masked');

// The guard must be able to fail. A check that cannot detect the original bug is
// worse than none, because it reads as protection — so re-run it against the code as
// it was and require it to catch that.
{
  const brokenLines = lines.map(line => (
    line.includes("moneyText(`${isTransfer ? fmt(t.transferAmount)")
      ? "              {isTransfer ? fmt(t.transferAmount) : `${amount > 0 ? '+' : '-'}${fmt(amount)}`} {sym}"
      : line
  ));
  const caught = brokenLines.some((line, index) => {
    const trimmed = line.trim();
    if (!trimmed.includes('fmt(')) return false;
    if (/^(const|let|var)\s/.test(trimmed)) return false;
    if (/^[A-Za-z_$][\w$]*:\s/.test(trimmed)) return false;
    if (!trimmed.startsWith('{')) return false;
    if (trimmed.startsWith('{/*')) return false;
    if (trimmed.includes('moneyText(')) return false;
    return index >= 0;
  });
  assert.equal(caught, true, 'REGRESSION: the guard no longer detects the bug it was written for');
  console.log('[PASS] the guard still catches the original unmasked render');
}

console.log('MYFI HOME HIDDEN AMOUNTS CONTRACT: PASS');
