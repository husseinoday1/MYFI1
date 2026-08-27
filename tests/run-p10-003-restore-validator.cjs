// Phase 10 Step 3 — strict structural validator.
//
// The thing this exists to prevent is already live: dataSlice.js:672 runs
// prepareWalletData over restored data inside importBackup, which invents a wallet
// when none exists for a scope, reassigns cfg.defaultWalletId, and attaches a default
// wallet to transactions that lack one — silently rewriting financial attribution,
// before any financial validation has run.
//
// So every test here is a variation on one question: given broken financial data, does
// it refuse, or does it help?

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialRestoreValidator.js');

const source = fs.readFileSync(filename, 'utf8').replace(/export const /g, 'const ')
  + '\nmodule.exports = { validateCanonicalLedgerStructure, RESTORE_VALIDATOR_VERSION };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const { validateCanonicalLedgerStructure } = compiled.exports;

const ledger = () => ({
  ledger: { ledgerId: 'ledger-p10' },
  accounts: [
    { id: 'a1', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
    { id: 'a2', accountType: 'category', scope: 'personal', currencyCode: 'IQD', status: 'active' },
  ],
  exchangeRates: [{
    id: 'fx1', baseCurrencyCode: 'IQD', quoteCurrencyCode: 'USD',
    numerator: 1310, denominator: 1, rateDate: '2026-01-01', source: 'manual',
  }],
  transactions: [{
    id: 't1', revision: 1, archivedAt: null, deletedAt: null, archiveYear: null,
    payload: {
      flowType: 'expense', scope: 'personal', dateISO: '2026-01-02', cat: 'food',
      walletId: 'w1', currencyCode: 'IQD', walletCurrency: 'IQD', baseCurrencyCode: 'IQD',
      amt: 25000,
    },
  }],
  postings: [
    { id: 'p1', transactionId: 't1', accountId: 'a1', bucket: 'physical', role: 'debit', amountMinor: -25000, currencyCode: 'IQD', exchangeRateId: null },
    { id: 'p2', transactionId: 't1', accountId: 'a2', bucket: 'physical', role: 'credit', amountMinor: 25000, currencyCode: 'IQD', exchangeRateId: null },
  ],
  links: [],
  entities: {
    wallet: [{ entityType: 'wallet', id: 'w1', revision: 1, deletedAt: null, payload: { id: 'w1', currency: 'IQD' } }],
    goal: [{ entityType: 'goal', id: 'g1', revision: 1, deletedAt: null, payload: { id: 'g1', walletId: 'w1' } }],
  },
  archives: [],
});

const codesFor = (mutate) => {
  const model = ledger();
  mutate(model);
  return validateCanonicalLedgerStructure(model).errors.map(item => item.code);
};

// --- a coherent ledger passes ----------------------------------------------
const clean = validateCanonicalLedgerStructure(ledger());
assert.equal(clean.ok, true, `a coherent ledger must pass: ${JSON.stringify(clean.errors)}`);
assert.equal(clean.counts.errors, 0);
console.log('[PASS] a structurally coherent ledger passes');

// --- the repair scenarios: each must BLOCK, never fix ------------------------
const mustBlock = [
  ['missing wallet reference', l => { l.transactions[0].payload.walletId = 'w-missing'; }, 'transaction_wallet_unresolved'],
  ['tracker wallet reference', l => { l.entities.goal[0].payload.walletId = 'w-missing'; }, 'tracker_wallet_unresolved'],
  ['posting to unknown transaction', l => { l.postings[0].transactionId = 't-missing'; }, 'posting_transaction_unresolved'],
  ['posting to unknown account', l => { l.postings[0].accountId = 'a-missing'; }, 'posting_account_unresolved'],
  ['unknown FX reference', l => { l.postings[0].exchangeRateId = 'fx-missing'; }, 'posting_exchange_rate_unresolved'],
  ['unknown FX on transaction', l => { l.transactions[0].payload.exchangeRateId = 'fx-missing'; }, 'transaction_exchange_rate_unresolved'],
  ['duplicate transaction id', l => { l.transactions.push({ ...l.transactions[0] }); }, 'duplicate_transaction_id'],
  ['duplicate posting id', l => { l.postings.push({ ...l.postings[0] }); }, 'duplicate_posting_id'],
  ['duplicate entity id', l => { l.entities.wallet.push({ ...l.entities.wallet[0] }); }, 'duplicate_entity_id'],
  ['fractional minor units', l => { l.postings[0].amountMinor = -25000.5; }, 'posting_amount_not_integer_minor'],
  ['malformed currency', l => { l.postings[0].currencyCode = 'iqd'; }, 'posting_invalid_currency'],
  ['malformed account currency', l => { l.accounts[0].currencyCode = 'IQ'; }, 'account_invalid_currency'],
  ['malformed wallet currency', l => { l.entities.wallet[0].payload.currency = ''; }, 'wallet_invalid_currency'],
  ['zero FX denominator', l => { l.exchangeRates[0].denominator = 0; }, 'exchange_rate_invalid_denominator'],
  ['malformed FX date', l => { l.exchangeRates[0].rateDate = '01-01-2026'; }, 'exchange_rate_invalid_date'],
  ['invalid revision', l => { l.transactions[0].revision = 0; }, 'transaction_invalid_revision'],
  ['invalid tombstone', l => { l.transactions[0].deletedAt = 'not-a-date'; }, 'transaction_invalid_tombstone'],
  ['archive year with no archived_at', l => { l.transactions[0].archiveYear = 2025; }, 'transaction_archive_year_without_archived_at'],
  ['null minor units', l => { l.postings[0].amountMinor = null; }, 'posting_amount_not_integer_minor'],
  ['empty-string minor units', l => { l.postings[0].amountMinor = ''; }, 'posting_amount_not_integer_minor'],
  ['boolean minor units', l => { l.postings[0].amountMinor = false; }, 'posting_amount_not_integer_minor'],
  ['null link amount', l => { l.links.push({ id: 'l3', transactionId: 't1', linkId: 'g1', relation: 'goal', appliedAmountMinor: null }); }, 'link_amount_not_integer_minor'],
  ['malformed transaction date', l => { l.transactions[0].payload.dateISO = '2026/01/02'; }, 'transaction_invalid_date'],
  ['missing payload', l => { delete l.transactions[0].payload; }, 'transaction_missing_payload'],
  ['link to unknown transaction', l => { l.links.push({ id: 'l1', transactionId: 't-missing', linkId: 'g1', relation: 'goal', appliedAmountMinor: 0 }); }, 'link_transaction_unresolved'],
  ['link with no target', l => { l.links.push({ id: 'l2', transactionId: 't1', linkId: '', relation: 'goal', appliedAmountMinor: 0 }); }, 'link_missing_target'],
  ['archived id also active', l => { l.archives.push({ year: 2025, data: { trans: [{ id: 't1' }] } }); }, 'archived_transaction_also_active'],
  ['duplicate archived id', l => { l.archives.push({ year: 2025, data: { trans: [{ id: 'x1' }, { id: 'x1' }] } }); }, 'duplicate_archived_transaction_id'],
];

for (const [label, mutate, expected] of mustBlock) {
  const codes = codesFor(mutate);
  assert.ok(codes.includes(expected),
    `${label} must be refused with ${expected}, got ${JSON.stringify(codes)}`);
}
console.log(`[PASS] all ${mustBlock.length} broken-data scenarios are refused, none repaired`);

// --- it reports everything at once, not one problem per attempt --------------
const many = ledger();
many.transactions[0].payload.walletId = 'w-missing';
many.postings[0].accountId = 'a-missing';
many.exchangeRates[0].denominator = 0;
const multi = validateCanonicalLedgerStructure(many);
assert.equal(multi.ok, false);
assert.ok(multi.errors.length >= 3, 'every problem must be reported in one pass');
console.log('[PASS] all problems are reported in a single pass');

// --- the input is never mutated ---------------------------------------------
const untouched = ledger();
untouched.transactions[0].payload.walletId = 'w-missing';
const before = JSON.stringify(untouched);
validateCanonicalLedgerStructure(untouched);
assert.equal(JSON.stringify(untouched), before,
  'REGRESSION: the validator modified the model it was given — it reports, it never repairs');
console.log('[PASS] the model is never modified');

// --- errors must not carry money --------------------------------------------
// Diagnostic payloads get logged and pasted into evidence files. Codes and ids are
// fine; amounts are not.
const withAmounts = ledger();
withAmounts.postings[0].accountId = 'a-missing';
withAmounts.postings[0].amountMinor = -987654321;
const reported = JSON.stringify(validateCanonicalLedgerStructure(withAmounts).errors);
assert.ok(!reported.includes('987654321'),
  `REGRESSION: an amount reached the error payload: ${reported}`);
console.log('[PASS] error payloads carry codes and ids, never amounts');

// --- it must share nothing with the UI normalisation path --------------------
const moduleText = fs.readFileSync(filename, 'utf8');
for (const forbidden of [
  'prepareWalletData',
  'normalizeWallets',
  'normalizeCfg',
  'attachDefaultWalletToTransactions',
  'getDefaultWalletId',
  'normalizeCommitments',
]) {
  assert.ok(!moduleText.includes(`${forbidden}(`),
    `the strict validator must not use ${forbidden} — those helpers invent and repair financial data`);
}
// Match an import STATEMENT, not the word: the header comment discusses the app's
// import path, and a word search flagged that prose. Same crude-matcher mistake as
// the avatarUri word search caught earlier today.
assert.ok(!/^s*imports/m.test(moduleText),
  'the validator is a pure function over the model and should need no imports at all');
console.log('[PASS] shares nothing with the UI normalisation helpers');

// The reverse direction must NOT be refused: upsertLedgerTransaction sets the two
// columns independently, so archived-without-a-year is reachable, and refusing it
// would block a legitimate restore.
const archivedNoYear = ledger();
archivedNoYear.transactions[0].archivedAt = '2026-03-03T00:00:00.000Z';
archivedNoYear.transactions[0].archiveYear = null;
const archivedResult = validateCanonicalLedgerStructure(archivedNoYear);
assert.equal(archivedResult.ok, true,
  `archived without a recorded year must still restore: ${JSON.stringify(archivedResult.errors)}`);
console.log('[PASS] archived-without-a-year is accepted; a year with no archive timestamp is not');

console.log('MYFI P10-003 RESTORE STRUCTURAL VALIDATOR CONTRACT: PASS');
