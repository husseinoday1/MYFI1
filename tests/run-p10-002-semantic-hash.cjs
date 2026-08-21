// Phase 10 Step 2 — semantic hash contract, and the permanent regression test the
// research asks for in §51.
//
// The 2026-08-20 incident: the source projection hashed a raw entity payload while
// the write path persisted a canonical one that strips cfg.avatarUri. Every count
// matched; only the checksum differed, by the 15 bytes of `,"avatarUri":""`. Cutover
// was impossible for any workspace carrying that field.
//
// So the contract has two halves and both must hold forever:
//   canonical(source) == canonical(persisted)  when only a non-financial field differs
//   canonical(source) != canonical(persisted)  when one minor unit differs

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialSemanticProjection.js');

// The real canonicaliser from the repository, extracted rather than re-implemented —
// re-implementing it here would defeat the point of the test.
const repoSource = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');
const metadataSource = fs.readFileSync(path.join(root, 'src/lib/cloudWorkspaceMetadata.js'), 'utf8')
  .replace(/export const /g, 'const ');
const canonicalMatch = repoSource.match(
  /export const canonicalFinancialEntityPayload = \(entityType, payload\) => \{[\s\S]*?\n\};/,
);
assert.ok(canonicalMatch, 'canonicalFinancialEntityPayload must remain exported from the repository');

let source = fs.readFileSync(filename, 'utf8')
  .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/, "const { sha256 } = require('@noble/hashes/sha2');")
  .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/, "const { bytesToHex } = require('@noble/hashes/utils');")
  .replace(
    /import \{ canonicalFinancialEntityPayload \} from '\.\/financialLedgerV7Repository';/,
    `${metadataSource}\n${canonicalMatch[0].replace('export const ', 'const ')}`,
  )
  .replace(/export const /g, 'const ');

source += `
module.exports = {
  SEMANTIC_HASH_VERSION, SEMANTIC_HASH_ALGORITHM,
  canonicalizeFinancialLedger, semanticHashV1, semanticMetricsV1, compareSemanticLedgerV1,
};
`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const {
  SEMANTIC_HASH_VERSION,
  semanticHashV1,
  semanticMetricsV1,
  compareSemanticLedgerV1,
} = compiled.exports;

const ledger = (overrides = {}) => ({
  ledger: { ledgerId: 'ledger-p10' },
  accounts: [{ id: 'a1', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' }],
  exchangeRates: [{
    id: 'fx1', baseCurrencyCode: 'IQD', quoteCurrencyCode: 'USD',
    numerator: 1310, denominator: 1, rateDate: '2026-01-01', source: 'manual',
  }],
  transactions: [{
    id: 't1', revision: 1, archivedAt: null, deletedAt: null, archiveYear: null,
    // The real shape stored in payload_json: plan.original, the app-level
    // transaction. Amounts are amt / walletAmount / baseAmount in major units.
    // An invented shape here would let the module read undefined for every amount
    // and still pass, which is how a test comes to read as coverage without being it.
    payload: {
      flowType: 'expense', status: 'posted', scope: 'personal', dateISO: '2026-01-02',
      cat: 'food', walletId: 'w1', currencyCode: 'IQD', walletCurrency: 'IQD',
      baseCurrencyCode: 'IQD',
      amt: 25000, walletAmount: 25000, baseAmount: 25000, feeBaseAmount: 0,
      exchangeRate: 1,
    },
  }],
  postings: [
    { id: 'p1', transactionId: 't1', accountId: 'a1', bucket: 'physical', role: 'debit', amountMinor: -25000, currencyCode: 'IQD', exchangeRateId: null },
    { id: 'p2', transactionId: 't1', accountId: 'a2', bucket: 'physical', role: 'credit', amountMinor: 25000, currencyCode: 'IQD', exchangeRateId: null },
  ],
  links: [],
  entities: {
    wallet: [{ entityType: 'wallet', id: 'w1', revision: 1, deletedAt: null, payload: { id: 'w1', currency: 'IQD' } }],
    workspace: [{ entityType: 'workspace', id: 'ws', revision: 1, deletedAt: null, payload: { cfg: { currency: 'IQD' } } }],
  },
  archives: [],
  ...overrides,
});

// --- §51 regression, half one: a non-financial canonicalisation difference passes ---
const sourceSide = ledger();
const persistedSide = ledger({
  entities: {
    wallet: [{ entityType: 'wallet', id: 'w1', revision: 1, deletedAt: null, payload: { id: 'w1', currency: 'IQD' } }],
    // Exactly the 2026-08-20 shape: the source carries cfg.avatarUri, the persisted
    // side does not, because upsertEntity strips it.
    workspace: [{ entityType: 'workspace', id: 'ws', revision: 1, deletedAt: null, payload: { cfg: { currency: 'IQD', avatarUri: '' } } }],
  },
});

assert.equal(
  semanticHashV1(sourceSide), semanticHashV1(persistedSide),
  'REGRESSION: cfg.avatarUri changed the semantic hash — this is the exact defect that blocked cutover on 2026-08-20',
);
console.log('[PASS] a non-financial canonicalisation difference does not change the hash');

// --- §51 regression, half two: one minor unit must change it ----------------
const plusOne = ledger();
plusOne.transactions[0].payload.amt += 1;
assert.notEqual(
  semanticHashV1(sourceSide), semanticHashV1(plusOne),
  'REGRESSION: amountMinor + 1 did not change the hash — the proof is worthless',
);
console.log('[PASS] one minor unit changes the hash');

// --- every financial field must matter -------------------------------------
const mutations = [
  ['posting amount', l => { l.postings[0].amountMinor += 1; }],
  ['posting bucket', l => { l.postings[0].bucket = 'reserved'; }],
  ['posting role', l => { l.postings[0].role = 'credit'; }],
  ['currency', l => { l.transactions[0].payload.currencyCode = 'USD'; }],
  ['FX numerator', l => { l.exchangeRates[0].numerator += 1; }],
  ['FX denominator', l => { l.exchangeRates[0].denominator += 1; }],
  ['FX date', l => { l.exchangeRates[0].rateDate = '2026-01-02'; }],
  ['status', l => { l.transactions[0].payload.status = 'void'; }],
  ['tombstone', l => { l.transactions[0].deletedAt = '2026-03-03'; }],
  ['archive membership', l => { l.transactions[0].archivedAt = '2026-03-03'; }],
  ['revision', l => { l.transactions[0].revision = 2; }],
  ['ledger identity', l => { l.ledger.ledgerId = 'ledger-other'; }],
  ['fee', l => { l.transactions[0].payload.feeBaseAmount = 500; }],
  ['transaction amount', l => { l.transactions[0].payload.amt += 1; }],
  ['wallet amount', l => { l.transactions[0].payload.walletAmount += 1; }],
  ['base amount', l => { l.transactions[0].payload.baseAmount += 1; }],
  ['exchange rate', l => { l.transactions[0].payload.exchangeRate = 1.5; }],
];
for (const [label, mutate] of mutations) {
  const mutated = ledger();
  mutate(mutated);
  assert.notEqual(semanticHashV1(sourceSide), semanticHashV1(mutated),
    `${label} must change the semantic hash`);
}
console.log(`[PASS] all ${mutations.length} financial fields change the hash`);

// --- order and key insertion must not matter --------------------------------
const reordered = ledger();
reordered.postings = [reordered.postings[1], reordered.postings[0]];
assert.equal(semanticHashV1(sourceSide), semanticHashV1(reordered),
  'collection order must not change the hash');

const rekeyed = ledger();
rekeyed.transactions[0].payload = Object.fromEntries(
  Object.entries(rekeyed.transactions[0].payload).reverse(),
);
assert.equal(semanticHashV1(sourceSide), semanticHashV1(rekeyed),
  'object key order must not change the hash');
console.log('[PASS] collection order and key order are irrelevant');

// --- shape of the hash itself -----------------------------------------------
assert.match(semanticHashV1(sourceSide), /^[0-9a-f]{64}$/, 'must be a SHA-256 hex digest');
assert.equal(SEMANTIC_HASH_VERSION, 1);
console.log('[PASS] hash is a versioned SHA-256 digest');

// --- comparison reports how, not just that ----------------------------------
const same = compareSemanticLedgerV1(sourceSide, persistedSide);
assert.equal(same.ok, true);
assert.deepEqual(same.differences, []);

const countDiff = ledger();
countDiff.postings.push({ id: 'p3', transactionId: 't1', accountId: 'a1', bucket: 'physical', role: 'debit', amountMinor: 1, currencyCode: 'IQD' });
const counted = compareSemanticLedgerV1(sourceSide, countDiff);
assert.equal(counted.ok, false);
assert.ok(counted.differences.some(item => item.metric === 'postings'),
  'a count difference must name the metric');

// The avatarUri shape in reverse: identical counts, different content. The comparison
// must not return an empty difference list that reads like "no difference".
const contentOnly = compareSemanticLedgerV1(sourceSide, plusOne);
assert.equal(contentOnly.ok, false);
assert.ok(contentOnly.differences.length > 0, 'a content-only difference must still be reported');
console.log('[PASS] mismatches name the metric, and content-only drift is never silent');

// --- metrics are diagnosable -------------------------------------------------
const metrics = semanticMetricsV1(sourceSide);
assert.equal(metrics.transactions, 1);
assert.equal(metrics.activeTransactions, 1);
assert.equal(metrics.postings, 2);
assert.equal(metrics.entitiesByType.wallet, 1);
assert.equal(metrics.currencyTotalsMinor.IQD, 0, 'a balanced transaction nets to zero');
console.log('[PASS] metrics describe the ledger independently of the hash');

// --- one canonicaliser, not two ----------------------------------------------
const moduleText = fs.readFileSync(filename, 'utf8');
assert.ok(
  moduleText.includes("import { canonicalFinancialEntityPayload } from './financialLedgerV7Repository'"),
  'the entity rule must be imported from the module that persists it, never re-implemented here',
);
// Not a word search — prose describing the incident is fine, and scanning for it
// only produced a false positive. What must not exist is a second copy of the rule:
// a filter that removes the field, rather than a call into the module that owns it.
assert.ok(
  !/filter\([^)]*avatarUri/.test(moduleText) && !/delete[^;\n]*avatarUri/.test(moduleText),
  'the avatarUri rule must not be re-implemented here — call the repository that persists it',
);
console.log('[PASS] the entity canonicalisation rule exists in exactly one place');

// The payload stored in payload_json is plan.original and has no *Minor fields.
// Reading them would hash 0 for every transaction while a fixture using those
// names kept passing — guard the mistake, not just its symptom.
for (const invented of [
  'payload.amountMinor', 'payload.baseAmountMinor', 'payload.feeMinor',
  'payload.walletAmountMinor',
]) {
  assert.ok(!moduleText.includes(invented),
    `${invented} does not exist on the stored transaction payload`);
}
console.log('[PASS] transaction amounts are read under the names the payload really uses');

console.log('MYFI P10-002 SEMANTIC HASH CONTRACT: PASS');
