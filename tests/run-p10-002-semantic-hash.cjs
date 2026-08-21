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
const backupDataSource = fs.readFileSync(path.join(root, 'src/lib/backupData.js'), 'utf8')
  .replace(/export const /g, 'const ');
const canonicalMatch = repoSource.match(
  /export const canonicalFinancialEntityPayload = \(entityType, payload\) => \{[\s\S]*?\n\};/,
);
assert.ok(canonicalMatch, 'canonicalFinancialEntityPayload must remain exported from the repository');

const moduleText = fs.readFileSync(filename, 'utf8');
let source = moduleText
  .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/, "const { sha256 } = require('@noble/hashes/sha2');")
  .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/, "const { bytesToHex } = require('@noble/hashes/utils');")
  .replace(/import \{ pickFinancialBackupConfig \} from '\.\/backupData';/, backupDataSource)
  .replace(
    /import \{ canonicalFinancialEntityPayload \} from '\.\/financialLedgerV7Repository';/,
    `${metadataSource}\n${canonicalMatch[0].replace('export const ', 'const ')}`,
  )
  .replace(/export const /g, 'const ');

source += `
module.exports = {
  SEMANTIC_HASH_VERSION, SEMANTIC_HASH_ALGORITHM,
  SEMANTIC_HASH_V2_VERSION, SEMANTIC_HASH_V3_VERSION,
  canonicalizeFinancialLedger, semanticHashV1, semanticMetricsV1, compareSemanticLedgerV1,
  canonicalizeFinancialLedgerV2, semanticHashV2, semanticMetricsV2, compareSemanticLedgerV2,
  compareCanonicalTextV3, stableSemanticJsonV3, canonicalizeFinancialLedgerV3, semanticHashV3,
};
`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const {
  SEMANTIC_HASH_VERSION,
  SEMANTIC_HASH_V2_VERSION,
  SEMANTIC_HASH_V3_VERSION,
  semanticHashV1,
  semanticMetricsV1,
  compareSemanticLedgerV1,
  semanticHashV2,
  semanticMetricsV2,
  compareSemanticLedgerV2,
  compareCanonicalTextV3,
  stableSemanticJsonV3,
  canonicalizeFinancialLedgerV3,
  semanticHashV3,
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
    storage: { idempotencyKey: 'expense:t1', deviceId: 'device-origin', createdAt: '2026-01-02T00:00:00.000Z' },
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
  workspace: {
    payloadJson: JSON.stringify({
      localPreferences: {
        cfg: {
          currency: 'IQD', profileType: 'personal', activeScope: 'personal',
          enabledModules: { goals: true }, defaultWalletId: 'w1',
          categoryBudgets: { food: 50000 }, categoryBudgetsByMonth: {},
          archiveSummaries: [], theme: 'dark', lang: 'ar', bioLock: true,
        },
      },
    }),
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
  assert.notEqual(semanticHashV3(sourceSide), semanticHashV3(mutated),
    `V3 ${label} must change the semantic hash`);
}
console.log(`[PASS] all ${mutations.length} financial fields change the V1 and V3 hash`);

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

// --- V2: full logical restore proof ----------------------------------------
const v2Source = ledger({
  archives: [{
    year: 2024,
    scope: 'personal',
    checksum: 'archive-checksum',
    summary: { year: 2024, count: 1, net: -25000 },
    data: {
      trans: [{
        id: 'archive-t1', title: 'historic rent', note: 'paid in cash', dateISO: '2024-02-01',
        walletId: 'w1', cat: 'housing', amt: -25000, baseAmount: -25000,
        historicalFx: { base: 'IQD', rate: 1 },
      }],
      debts: [{ id: 'archive-debt', title: 'old loan', amount: 120000, status: 'settled' }],
      wallets: [{ id: 'w1', label: 'Cash', currency: 'IQD' }],
      cfg: {
        currency: 'IQD', profileType: 'personal', activeScope: 'personal',
        categoryBudgets: { housing: 25000 }, theme: 'light', lang: 'en',
      },
      archiveScope: 'personal',
    },
  }],
});

assert.equal(SEMANTIC_HASH_V2_VERSION, 2);
assert.match(semanticHashV2(v2Source), /^[0-9a-f]{64}$/, 'V2 must be a SHA-256 hex digest');

const changedLiveRecord = ledger();
changedLiveRecord.transactions[0].payload.note = 'corrected receipt reference';
assert.notEqual(semanticHashV2(ledger()), semanticHashV2(changedLiveRecord),
  'a user-entered live transaction field omitted by V1 must change V2');

const changedStoredProvenance = ledger();
changedStoredProvenance.transactions[0].storage.deviceId = 'different-origin';
assert.notEqual(semanticHashV2(ledger()), semanticHashV2(changedStoredProvenance),
  'stored transaction provenance required for an exact stage must be covered by V2');

const changedStageOnlyAccountField = ledger();
changedStageOnlyAccountField.accounts[0].name = 'different stored account name';
assert.notEqual(semanticHashV2(ledger()), semanticHashV2(changedStageOnlyAccountField),
  'stored account fields required for an exact stage must be covered by V2');

const changedArchiveRecord = JSON.parse(JSON.stringify(v2Source));
changedArchiveRecord.archives[0].data.trans[0].note = 'different historic note';
assert.notEqual(semanticHashV2(v2Source), semanticHashV2(changedArchiveRecord),
  'every archived transaction field must be covered by V2');

const changedArchiveEntity = JSON.parse(JSON.stringify(v2Source));
changedArchiveEntity.archives[0].data.debts[0].title = 'different archived record';
assert.notEqual(semanticHashV2(v2Source), semanticHashV2(changedArchiveEntity),
  'archived financial entities must be covered by V2');

const changedFinancialConfig = JSON.parse(JSON.stringify(v2Source));
changedFinancialConfig.workspace.payloadJson = JSON.stringify({
  localPreferences: { cfg: { currency: 'USD', profileType: 'personal', activeScope: 'personal' } },
});
assert.notEqual(semanticHashV2(v2Source), semanticHashV2(changedFinancialConfig),
  'financial workspace configuration must be covered by V2');

const changedDeviceOnlyConfig = JSON.parse(JSON.stringify(v2Source));
const deviceOnlyCfg = JSON.parse(changedDeviceOnlyConfig.workspace.payloadJson);
deviceOnlyCfg.localPreferences.cfg.theme = 'light';
deviceOnlyCfg.localPreferences.cfg.lang = 'en';
deviceOnlyCfg.localPreferences.cfg.bioLock = false;
changedDeviceOnlyConfig.workspace.payloadJson = JSON.stringify(deviceOnlyCfg);
changedDeviceOnlyConfig.archives[0].data.cfg.theme = 'dark';
changedDeviceOnlyConfig.archives[0].data.cfg.lang = 'ar';
assert.equal(semanticHashV2(v2Source), semanticHashV2(changedDeviceOnlyConfig),
  'theme, language and device-only privacy choices must not enter the restore proof');
assert.equal(semanticHashV3(v2Source), semanticHashV3(changedDeviceOnlyConfig),
  'V3 must preserve V2\'s device-only configuration exclusion');

const reorderedArchive = JSON.parse(JSON.stringify(v2Source));
reorderedArchive.archives[0].data.trans.unshift({ id: 'archive-t0', title: 'older', amt: -1 });
const reorderedArchiveAgain = JSON.parse(JSON.stringify(reorderedArchive));
reorderedArchiveAgain.archives[0].data.trans.reverse();
assert.equal(semanticHashV2(reorderedArchive), semanticHashV2(reorderedArchiveAgain),
  'archive record order must not change V2');
assert.equal(semanticHashV3(reorderedArchive), semanticHashV3(reorderedArchiveAgain),
  'archive record order must not change V3');

const v2Difference = compareSemanticLedgerV2(v2Source, changedArchiveRecord);
assert.equal(v2Difference.ok, false);
assert.ok(v2Difference.differences.length > 0, 'V2 content-only drift must never be silent');
assert.ok(semanticMetricsV2(v2Source).archiveRecords >= 3, 'V2 metrics must describe archive coverage');
console.log('[PASS] V2 covers full live/archive records and financial config only');

// --- V3: deterministic order, independent from device/UI locale ------------
const unicodeOrdered = ledger({
  accounts: [
    { id: '𝄞', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
    { id: 'أ', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
    { id: 'ä', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
    { id: 'z', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
    { id: 'é', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' },
  ],
  entities: [
    { entityType: 'wallet', id: 'أ', revision: 1, payload: { currency: 'IQD' } },
    { entityType: 'wallet', id: 'z', revision: 1, payload: { currency: 'IQD' } },
  ],
  archives: [
    { year: 2025, scope: 'أ', checksum: 'b', data: { trans: [{ id: '𝄞', amt: 1 }] } },
    { year: 2024, scope: 'z', checksum: 'a', data: { trans: [{ id: 'ä', amt: 2 }] } },
  ],
});
const unicodeReordered = JSON.parse(JSON.stringify(unicodeOrdered));
unicodeReordered.accounts.reverse();
unicodeReordered.entities.reverse();
unicodeReordered.archives.reverse();
unicodeReordered.archives[0].data.trans.reverse();
assert.equal(SEMANTIC_HASH_V3_VERSION, 3);
assert.equal(semanticHashV3(unicodeOrdered), semanticHashV3(unicodeReordered),
  'V3 must be independent from physical collection order for Arabic and Unicode identifiers');
assert.deepEqual(
  canonicalizeFinancialLedgerV3(unicodeOrdered).accounts.map(item => item.id),
  ['é', 'z', 'ä', 'أ', '𝄞'],
  'V3 must use the documented UTF-8 byte order, not a UI locale order',
);
const utf8ByteCompare = (left, right) => {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  }
  return leftBytes.length - rightBytes.length;
};
const utf8Samples = ['é', 'z', 'ä', 'أ', '𝄞', '"', '\\', 'a\u0000', 'a'];
assert.deepEqual(
  utf8Samples.slice().sort((left, right) => utf8ByteCompare(left, right)).map(value => value),
  utf8Samples.slice().sort(compareCanonicalTextV3).map(value => value),
  'V3 ordering must agree with an independent UTF-8 byte comparator',
);
const malformedUnicode = ledger({
  accounts: [{ id: '\ud800', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active' }],
});
const malformedCanonical = canonicalizeFinancialLedgerV3(malformedUnicode);
assert.equal(malformedCanonical.accounts[0].id, '\ud800',
  'the malformed fixture must reach the canonical V3 serializer unchanged');
assert.throws(
  () => stableSemanticJsonV3(malformedCanonical),
  /semantic_hash_v3_malformed_unicode/,
  'V3 must reject malformed Unicode instead of creating a non-portable proof',
);
assert.throws(
  () => semanticHashV3(malformedUnicode),
  /semantic_hash_v3_malformed_unicode/,
  'the V3 hash wrapper must preserve malformed-Unicode rejection',
);
assert.throws(
  () => compareCanonicalTextV3('\ud800', 'valid-id'),
  /semantic_hash_v3_malformed_unicode/,
  'V3 must reject malformed Unicode before it can affect collection order',
);

const originalLocaleCompare = String.prototype.localeCompare;
try {
  const digestByLocale = ['ar', 'sv', 'en-US'].map(locale => {
    const collator = new Intl.Collator(locale);
    String.prototype.localeCompare = function patchedLocaleCompare(other) {
      return collator.compare(String(this), String(other));
    };
    return semanticHashV3(unicodeOrdered);
  });
  assert.deepEqual(
    digestByLocale,
    [digestByLocale[0], digestByLocale[0], digestByLocale[0]],
    'V3 hash must not depend on Arabic, Swedish or English collation',
  );
} finally {
  String.prototype.localeCompare = originalLocaleCompare;
}
const v3Source = moduleText.match(
  /export const canonicalizeFinancialLedgerV3[\s\S]*?export const semanticHashV3[\s\S]*?\n\);/,
);
assert.ok(v3Source, 'V3 canonicaliser and hash must remain present');
assert.doesNotMatch(v3Source[0], /localeCompare|Intl\.Collator/,
  'V3 ordered paths must not call locale-sensitive comparison');
const v3ComparatorSource = moduleText.match(
  /export const compareCanonicalTextV3[\s\S]*?\n};/,
);
assert.ok(v3ComparatorSource, 'V3 comparator must remain present');
assert.doesNotMatch(v3ComparatorSource[0], /localeCompare|Intl\.Collator/,
  'V3 comparator must not call locale-sensitive comparison');
assert.match(moduleText, /const canonicalTextEncoderV3 = new TextEncoder\(\)/,
  'V3 must allocate one module-scoped UTF-8 encoder');
assert.doesNotMatch(v3ComparatorSource[0], /new TextEncoder/,
  'V3 comparator must not allocate encoders for every sort comparison');
assert.match(v3ComparatorSource[0], /encodeCanonicalTextV3/,
  'V3 comparator must compare an explicit UTF-8 byte representation');
assert.match(moduleText, /const sortByCanonicalTextV3[\s\S]*?\.bytes = encodeCanonicalTextV3/,
  'V3 hot-path sorting must encode each key before comparison rather than in the comparator');
console.log('[PASS] V3 semantic ordering is deterministic across locale collators');

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
