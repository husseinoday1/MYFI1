// Phase 10 Step 7 — strict V11 logical decoder contract.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialBackupV11Decoder.js');
let source = fs.readFileSync(filename, 'utf8')
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialBackupV11';/,
    [
      "const CANONICAL_BACKUP_V11_DATA_VERSION = 11;",
      "const CANONICAL_BACKUP_V11_FORMAT = 'MYFI_CANONICAL_LEDGER_BACKUP';",
      'const canonicalBackupV11ManifestCounts = data => globalThis.__COUNTS__(data);',
    ].join('\n'),
  )
  .replace(
    /import \{ SEMANTIC_HASH_ALGORITHM, SEMANTIC_HASH_V2_VERSION, semanticHashCanonicalV2 \} from '\.\/financialSemanticProjection';/,
    [
      "const SEMANTIC_HASH_ALGORITHM = 'SHA-256';",
      'const SEMANTIC_HASH_V2_VERSION = 2;',
      'const semanticHashCanonicalV2 = data => globalThis.__HASH__(data);',
    ].join('\n'),
  )
  .replace(
    /import \{ validateCanonicalLedgerStructure \} from '\.\/financialRestoreValidator';/,
    'const validateCanonicalLedgerStructure = data => globalThis.__VALIDATE__(data);',
  )
  .replace(/export const /g, 'const ');
source += '\nmodule.exports = { decodeCanonicalBackupV11 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { decodeCanonicalBackupV11 } = compiled.exports;

const expectedCounts = {
  transactions: 1, postings: 2, links: 0, accounts: 2, exchangeRates: 1,
  entities: 2, coldArchiveBundles: 0, coldArchiveRecords: 0,
};
globalThis.__COUNTS__ = () => expectedCounts;
globalThis.__HASH__ = value => value?.proof === 'valid'
  ? 'a'.repeat(64)
  : 'b'.repeat(64);
globalThis.__VALIDATE__ = value => value?.structure === 'valid'
  ? { ok: true, validatorVersion: 1, counts: { errors: 0 } }
  : { ok: false, validatorVersion: 1, errors: [{ code: 'posting_amount_not_integer_minor', amount: -999999 }] };

const backup = () => ({
  kind: 'myfi_canonical_financial_backup',
  manifest: {
    format: 'MYFI_CANONICAL_LEDGER_BACKUP', dataVersion: 11,
    semanticHashVersion: 2, semanticHashAlgorithm: 'SHA-256', semanticHash: 'a'.repeat(64),
    createdAt: '2026-08-21T00:00:00.000Z', ledgerId: 'ledger-v11', counts: { ...expectedCounts },
  },
  data: {
    semanticHashVersion: 2, ledgerId: 'ledger-v11', proof: 'valid', structure: 'valid',
    transactions: [], postings: [], links: [], accounts: [], exchangeRates: [], entities: [], archives: [],
  },
});

const decoded = decodeCanonicalBackupV11(backup());
assert.equal(decoded.ok, true);
assert.equal(decoded.semanticHash, 'a'.repeat(64));
assert.equal(decoded.structure.counts.errors, 0);
console.log('[PASS] accepts only a complete V11 manifest, proof and structure');

const mustRefuse = [
  ['not object', null, 'canonical_backup_document_invalid'],
  ['kind', (() => { const v = backup(); v.kind = 'other'; return v; })(), 'canonical_backup_kind_invalid'],
  ['version', (() => { const v = backup(); v.manifest.dataVersion = 10; return v; })(), 'canonical_backup_manifest_invalid'],
  ['manifest hash shape', (() => { const v = backup(); v.manifest.semanticHash = 'bad'; return v; })(), 'canonical_backup_manifest_invalid'],
  ['semantic mismatch', (() => { const v = backup(); v.data.proof = 'changed'; return v; })(), 'canonical_backup_semantic_hash_mismatch'],
  ['count mismatch', (() => { const v = backup(); v.manifest.counts.transactions = 9; return v; })(), 'canonical_backup_manifest_counts_mismatch'],
  ['structure', (() => { const v = backup(); v.data.structure = 'broken'; return v; })(), 'canonical_backup_structure_invalid'],
];
for (const [label, value, reason] of mustRefuse) {
  const result = decodeCanonicalBackupV11(value);
  assert.equal(result.ok, false, label);
  assert.equal(result.reason, reason, label);
}
console.log(`[PASS] all ${mustRefuse.length} malformed/tampered documents fail closed`);

const broken = decodeCanonicalBackupV11((() => { const v = backup(); v.data.structure = 'broken'; return v; })());
const diagnostic = JSON.stringify(broken);
assert.ok(!diagnostic.includes('999999'),
  `decoder diagnostics must not return financial values: ${diagnostic}`);
assert.deepEqual(broken.errorCodes, ['posting_amount_not_integer_minor']);
console.log('[PASS] refusal diagnostics contain codes only, never money');

const moduleText = fs.readFileSync(filename, 'utf8');
for (const forbidden of ['prepareWalletData(', 'normalizeWallets(', 'normalizeCfg(', 'repairFrozenFx(']) {
  assert.ok(!moduleText.includes(forbidden), `decoder must not repair with ${forbidden}`);
}
console.log('MYFI P10-007 CANONICAL BACKUP DECODER CONTRACT: PASS');
