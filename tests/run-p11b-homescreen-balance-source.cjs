// P11-B — HomeScreen must actually reach the posting-derived, ALL-scoped
// wallet balance instead of silently throwing and falling back.
//
// Before this fix, HomeScreen.js called getLedgerNamespace, queryLedgerSummary,
// queryLedgerTransactions and queryLedgerWalletPositions without importing any
// of them. The first reference threw ReferenceError outside the try/catch,
// sqlHome stayed null forever, and the screen fell back to
// getWalletAvailableBalances over the hot array for every cutover user — the
// exact ACTIVE-scoped, F1-dependent source Phase 11 exists to retire.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const home = fs.readFileSync(path.join(root, 'src/screens/HomeScreen.js'), 'utf8');

for (const fn of ['getLedgerNamespace', 'queryLedgerSummary', 'queryLedgerTransactions', 'queryLedgerWalletPositions']) {
  assert.match(
    home,
    new RegExp(String.raw`import \{[^}]*\b${fn}\b[^}]*\} from '\.\./lib/activeLedgerRepository'`),
    `HomeScreen must import ${fn} from activeLedgerRepository`,
  );
  const calls = (home.match(new RegExp(String.raw`\b${fn}\s*\(`, 'g')) || []).length;
  assert.ok(calls >= 1, `HomeScreen must actually call ${fn}`);
}

assert.doesNotMatch(home, /KNOWN INERT/, 'the inert-block marker must be gone once the block actually runs');

// §74: the wallet card must still ask for ALL, never a narrowed scope — the fix
// must not have quietly changed what was already correct in Phase 11-A.
assert.match(
  home,
  /queryLedgerWalletPositions\(\{ namespace, scope, archiveScope: ARCHIVE_SCOPE\.ALL \}\)/,
  '§74: the revived wallet-position call must still request ALL',
);

// The revival must stay inside the financialLedgerV7Cutover guard — non-cutover
// users must see zero behaviour change.
const effectStart = home.indexOf('useEffect(() => {', home.indexOf('const [sqlHome, setSqlHome]'));
const guardEnd = home.indexOf('const run = async () => {', effectStart);
assert.ok(effectStart > 0 && guardEnd > effectStart, 'sqlHome effect bounds not found');
const guardBody = home.slice(effectStart, guardEnd);
assert.match(
  guardBody,
  /if \(!financialLedgerV7Cutover\) \{\s*setSqlHome\(null\);\s*return \(\) => \{ cancelled = true; \};\s*\}/,
  'the effect must still bail out to null before any query when not cut over',
);

// code-review finding: queryLedgerSummary's V6 legacy fallback returns no
// `supported` field at all (unlike queryLedgerWalletPositions, which always
// sets one). Both consumers of sqlHome.summary must guard with the same
// `supported !== false` check, or a stale/diverged cutover flag can make one
// silently use V6 legacy counts while the other correctly falls back.
const summaryGuardPattern = /sqlHome\?\.summary\?\.supported !== false && sqlHome\?\.summary/g;
const summaryGuards = home.match(summaryGuardPattern) || [];
assert.equal(
  summaryGuards.length,
  2,
  `both effectiveMonthSummary and hasLedgerEntries must guard with supported !== false, found ${summaryGuards.length}`,
);

console.log('PASS p11b_homescreen_balance_source');
