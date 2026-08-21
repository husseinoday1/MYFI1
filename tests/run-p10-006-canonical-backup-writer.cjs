// Phase 10 Step 6 — canonical V11 writer contract.
// The test loads the writer with controlled source/projection collaborators so it can
// prove fail-closed eligibility and manifest semantics without a device database or
// creating a user-visible file.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialBackupV11.js');
let source = fs.readFileSync(filename, 'utf8')
  .replace(
    /import \{ readCanonicalBackupSource \} from '\.\/financialBackupV2';/,
    'const readCanonicalBackupSource = async options => globalThis.__READ__(options);',
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialSemanticProjection';/,
    [
      "const SEMANTIC_HASH_ALGORITHM = 'SHA-256';",
      'const SEMANTIC_HASH_V2_VERSION = 2;',
      'const canonicalizeFinancialLedgerV2 = source => globalThis.__CANONICALIZE__(source);',
      'const semanticHashCanonicalV2 = data => globalThis.__HASH__(data);',
      'const semanticMetricsV2 = source => globalThis.__METRICS__(source);',
    ].join('\n'),
  )
  .replace(/export const /g, 'const ');
source += '\nmodule.exports = { CANONICAL_BACKUP_V11_FORMAT, CANONICAL_BACKUP_V11_DATA_VERSION, buildCanonicalBackupV11, createCanonicalBackupV11 };\n';

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const {
  CANONICAL_BACKUP_V11_FORMAT,
  CANONICAL_BACKUP_V11_DATA_VERSION,
  buildCanonicalBackupV11,
  createCanonicalBackupV11,
} = compiled.exports;

const canonicalData = {
  semanticHashVersion: 2,
  ledgerId: 'ledger-p10-v11',
  financialConfig: { currency: 'IQD' },
  transactions: [{ id: 't1' }], postings: [{ id: 'p1' }, { id: 'p2' }], links: [],
  accounts: [{ id: 'a1' }], exchangeRates: [], entities: [{ id: 'w1', entityType: 'wallet' }],
  archives: [{ year: 2024, scope: 'personal', data: { trans: [{ id: 'archive-t1' }] } }],
};
globalThis.__CANONICALIZE__ = value => ({ ...canonicalData, sourceMarker: value?.source });
globalThis.__HASH__ = value => `hash:${value.ledgerId}:${value.transactions.length}`;
globalThis.__METRICS__ = () => ({ transactions: 1, archiveRecords: 1 });

const sourceLedger = (overrides = {}) => ({
  supported: true,
  ok: true,
  source: 'canonical_sqlite',
  cutoverComplete: true,
  ledgerIdentityPresent: true,
  ledger: { ledgerId: 'ledger-p10-v11' },
  ...overrides,
});

const built = buildCanonicalBackupV11({ source: sourceLedger(), createdAt: '2026-08-21T00:00:00.000Z' });
assert.equal(built.ok, true);
assert.equal(built.backup.kind, 'myfi_canonical_financial_backup');
assert.equal(built.backup.manifest.format, CANONICAL_BACKUP_V11_FORMAT);
assert.equal(built.backup.manifest.dataVersion, CANONICAL_BACKUP_V11_DATA_VERSION);
assert.equal(built.backup.manifest.semanticHashVersion, 2);
assert.equal(built.backup.manifest.semanticHashAlgorithm, 'SHA-256');
assert.equal(built.backup.manifest.semanticHash, 'hash:ledger-p10-v11:1');
assert.equal(built.backup.manifest.ledgerId, 'ledger-p10-v11');
assert.deepEqual(built.backup.manifest.counts, {
  transactions: 1, postings: 2, links: 0, accounts: 1, exchangeRates: 0,
  entities: 1, coldArchiveBundles: 1, coldArchiveRecords: 1,
});
assert.equal(built.backup.data.sourceMarker, 'canonical_sqlite');
console.log('[PASS] V11 writes a versioned canonical manifest and complete logical data');

for (const [label, value, reason] of [
  ['unsupported SQLite', sourceLedger({ supported: false, ok: false, reason: 'sqlite_unavailable' }), 'sqlite_unavailable'],
  ['invalid source', sourceLedger({ ok: false, reason: 'canonical_backup_namespace_required' }), 'canonical_backup_namespace_required'],
  ['incomplete cutover', sourceLedger({ cutoverComplete: false }), 'canonical_backup_cutover_incomplete'],
  ['missing identity', sourceLedger({ ledgerIdentityPresent: false, ledger: null }), 'canonical_backup_ledger_identity_missing'],
]) {
  const rejected = buildCanonicalBackupV11({ source: value });
  assert.equal(rejected.ok, false, label);
  assert.equal(rejected.reason, reason, label);
}
console.log('[PASS] V11 refuses unsupported, incomplete, and anonymous sources');

(async () => {
  let passedOptions = null;
  globalThis.__READ__ = async options => {
    passedOptions = options;
    return sourceLedger();
  };
  const fromSqlite = await createCanonicalBackupV11({ namespace: 'user:canonical', createdAt: '2026-08-21T00:00:00.000Z' });
  assert.equal(fromSqlite.ok, true);
  assert.equal(passedOptions.namespace, 'user:canonical');
  assert.equal(fromSqlite.backup.manifest.createdAt, '2026-08-21T00:00:00.000Z');
  console.log('[PASS] V11 reads only through the canonical SQLite source adapter');

  const moduleText = fs.readFileSync(filename, 'utf8');
  assert.ok(moduleText.includes('readCanonicalBackupSource'), 'V11 must use canonical SQLite source');
  assert.ok(!moduleText.includes('exportBackup') && !moduleText.includes('saveMyfiPackageToDevice'),
    'P10-006 must not replace the current user-visible export path before its decoder exists');
  console.log('MYFI P10-006 CANONICAL BACKUP WRITER CONTRACT: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
