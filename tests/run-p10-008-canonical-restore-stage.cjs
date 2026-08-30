// Phase 10 Step 8 — isolated canonical restore stage contract.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialRestoreStageV11.js');
let source = fs.readFileSync(filename, 'utf8')
  .replace(
    /import \{ ensureColdArchiveSchema \} from '\.\/localArchiveRepository';/,
    'const ensureColdArchiveSchema = async () => globalThis.__COLD_READY__();',
  )
  .replace(
    /import \{ enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction, runLedgerReadTransaction \} from '\.\/ledgerDatabase';/,
    `const enqueueLedgerWrite = task => globalThis.__QUEUE__(task);
const getLedgerDb = async () => globalThis.__DB__;
const runLedgerExclusiveTransaction = (db, task) => globalThis.__EXCLUSIVE__(db, task);
const runLedgerReadTransaction = (db, task) => globalThis.__READ_TX__(db, task);`,
  )
  .replace(
    /import \{ FINANCIAL_LEDGER_SCHEMA_VERSION \} from '\.\/financialLedgerV7Model';/,
    'const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;',
  )
  .replace(
    /import \{[\s\S]*?\} from '\.\/financialLedgerV7Repository';/,
    `const ensureFinancialLedgerV7 = async db => globalThis.__ENSURE__(db);
const proveFinancialLedgerInvariantsV7 = options => globalThis.__INVARIANTS__(options);
const readFinancialProjectionV7 = options => globalThis.__PROJECTION__(options);`,
  )
  .replace(
    /import \{ canonicalBackupV11ManifestCounts \} from '\.\/financialBackupV11';/,
    'const canonicalBackupV11ManifestCounts = value => globalThis.__COUNTS__(value);',
  )
  .replace(
    /import \{ canonicalizeFinancialLedgerV2, semanticHashCanonicalV2 \} from '\.\/financialSemanticProjection';/,
    `const canonicalizeFinancialLedgerV2 = value => globalThis.__CANON__(value);
const semanticHashCanonicalV2 = value => globalThis.__HASH__(value);`,
  )
  .replace(
    /import \{ validateCanonicalLedgerStructure \} from '\.\/financialRestoreValidator';/,
    'const validateCanonicalLedgerStructure = value => globalThis.__VALIDATE__(value);',
  )
  .replace(/export const /g, 'const ');
source += `\nmodule.exports = {
  createCanonicalRestoreStageNamespace, readCanonicalRestoreStageV11,
  stageCanonicalRestoreV11, discardCanonicalRestoreStageV11,
};\n`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const {
  createCanonicalRestoreStageNamespace,
  stageCanonicalRestoreV11,
  discardCanonicalRestoreStageV11,
} = compiled.exports;

const calls = [];
const projection = {
  accounts: [{ id: 'account-1', name: 'Cash', accountType: 'wallet', scope: 'personal', currencyCode: 'IQD', status: 'active', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', archivedAt: null }],
  exchangeRates: [],
  transactions: [{
    id: 'tx-1', revision: 1, archiveYear: null, archivedAt: null, deletedAt: null, payload: { id: 'tx-1' },
    storage: { kind: 'expense', status: 'posted', scope: 'personal', dateISO: '2026-01-01', occurredAt: '2026-01-01T00:00:00.000Z', categoryId: null, title: 'Direct', note: null, sourceType: 'manual', sourceId: null, idempotencyKey: 'expense:tx-1', deviceId: 'device-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  }],
  postings: [{ id: 'post-1', transactionId: 'tx-1', accountId: 'account-1', bucket: 'physical', role: 'expense', amountMinor: -1000, currencyCode: 'IQD', exchangeRateId: null, createdAt: '2026-01-01T00:00:00.000Z' }],
  links: [], entities: [
    { entityType: 'tracker_type', id: 'tracker-type-1', revision: 1, deletedAt: null, payload: { name: 'Installments' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { entityType: 'tracker_item', id: 'tracker-item-1', revision: 1, deletedAt: null, payload: { typeId: 'tracker-type-1', name: 'Phone' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
};
const db = {
  async runAsync(sql, ...args) { calls.push({ sql: String(sql), args }); return { changes: 1 }; },
  async getFirstAsync(sql, ...args) {
    calls.push({ sql: String(sql), args, read: true });
    if (String(sql).includes('ledger_currencies')) return { code: args[0] };
    if (String(sql).includes('ledger_workspace_state_v7')) return { payload_json: '{"cfg":{}}' };
    return null;
  },
  async getAllAsync(sql, ...args) { calls.push({ sql: String(sql), args, read: true }); return []; },
};
globalThis.__DB__ = db;
globalThis.__QUEUE__ = task => task();
globalThis.__EXCLUSIVE__ = (database, task) => task(database);
globalThis.__READ_TX__ = (database, task) => task(database);
globalThis.__ENSURE__ = async () => true;
globalThis.__COLD_READY__ = async () => true;
globalThis.__INVARIANTS__ = async () => ({ ok: true, issues: [] });
globalThis.__PROJECTION__ = async () => projection;
globalThis.__VALIDATE__ = () => ({ ok: true, validatorVersion: 1, errors: [] });
globalThis.__CANON__ = model => ({
  transactions: model.transactions || [], postings: model.postings || [], links: model.links || [],
  accounts: model.accounts || [], exchangeRates: model.exchangeRates || [], entities: model.entities || [], archives: model.archives || [],
});
globalThis.__HASH__ = () => 'proof';
globalThis.__COUNTS__ = value => ({
  transactions: (value.transactions || []).length, postings: (value.postings || []).length, links: (value.links || []).length,
  accounts: (value.accounts || []).length, exchangeRates: (value.exchangeRates || []).length, entities: (value.entities || []).length,
  coldArchiveBundles: (value.archives || []).length, coldArchiveRecords: 0,
});

const expectedCounts = globalThis.__COUNTS__(projection);
const decoded = {
  ok: true, semanticHash: 'proof',
  manifest: { counts: expectedCounts },
  data: { semanticHashVersion: 2, ledgerId: 'ledger-stage', financialConfig: {}, ...projection, archives: [] },
};

(async () => {
  const namespace = 'user:restorer';
  const stageNamespace = createCanonicalRestoreStageNamespace(namespace);
  assert.ok(stageNamespace.startsWith(`${namespace}::restore-stage::`));
  assert.ok(!stageNamespace.includes('shadow-stage'), 'restore stage must be distinct from migration stage');

  const staged = await stageCanonicalRestoreV11({ namespace, stageNamespace, decoded, database: db });
  assert.equal(staged.ok, true, 'a strict-decoded document must stage and prove before READY');
  assert.equal(staged.stageNamespace, stageNamespace);
  const writeNamespaces = calls
    .filter(call => !call.read && /ledger_|cold_archive/.test(call.sql))
    .flatMap(call => call.args.filter(value => typeof value === 'string' && value.includes('user:')));
  assert.ok(writeNamespaces.every(value => value.includes(stageNamespace)),
    'P10-008 must not write the live namespace');
  const transactionWrite = calls.find(call => call.sql.includes('INSERT INTO ledger_financial_transactions_v7'));
  assert.equal(transactionWrite.args[1], 'tx-1');
  assert.equal(transactionWrite.args[12], 'expense:tx-1', 'stored idempotency key must be written directly');
  assert.equal(transactionWrite.args[13], 'device-1', 'stored device provenance must be written directly');
  const entityWrites = calls.filter(call => call.sql.includes('INSERT INTO ledger_entities_v7'));
  assert.deepEqual(entityWrites.map(call => [call.args[1], call.args[2]]), [
    ['tracker_type', 'tracker-type-1'],
    ['tracker_item', 'tracker-item-1'],
  ], 'a canonical restore stage must retain custom tracker definitions and their items');
  const readinessWrite = calls.find(call => call.sql.includes('INSERT OR REPLACE INTO ledger_v7_meta')
    && String(call.args[0] || '').startsWith('canonical_restore_stage_v11:'));
  assert.ok(readinessWrite, 'a proved stage must leave a local READY marker for P10-010');
  const readiness = JSON.parse(readinessWrite.args[1]);
  assert.equal(readiness.namespace, stageNamespace);
  assert.equal(readiness.semanticHash, 'proof');
  assert.deepEqual(readiness.counts, expectedCounts);
  console.log('[PASS] stages direct canonical rows only in a distinct restore namespace');

  const writesBeforeRefusal = calls.filter(call => !call.read).length;
  const malformed = JSON.parse(JSON.stringify(decoded));
  delete malformed.data.transactions[0].storage.idempotencyKey;
  const refused = await stageCanonicalRestoreV11({ namespace, stageNamespace, decoded: malformed, database: db });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'canonical_restore_stage_transaction_storage_invalid');
  assert.equal(calls.filter(call => !call.read).length, writesBeforeRefusal,
    'a missing stored value must fail before any stage write');
  console.log('[PASS] missing stored values fail closed without a repair or write');

  assert.equal(await discardCanonicalRestoreStageV11({ namespace, stageNamespace, database: db }), true);
  assert.equal(await discardCanonicalRestoreStageV11({ namespace, stageNamespace: namespace, database: db }), false,
    'discard refuses a live namespace');
  assert.ok(calls.some(call => call.sql.includes('DELETE FROM ledger_v7_meta WHERE key=?')
    && String(call.args[0] || '').startsWith('canonical_restore_stage_v11:')),
  'discard must remove the stage READY marker with its rows');
  console.log('[PASS] cleanup can target only an explicitly-shaped restore stage');

  const moduleText = fs.readFileSync(filename, 'utf8');
  for (const forbidden of ['buildFinancialLedgerCommand(', 'prepareWalletData(', 'normalizeWallets(', 'repairFrozenFx(']) {
    assert.ok(!moduleText.includes(forbidden), `canonical stage must not call ${forbidden}`);
  }
  assert.ok(moduleText.includes('semanticHashCanonicalV2'), 'stage must prove V2 semantic equality');
  assert.ok(moduleText.includes('cold_archive_years'), 'stage must include cold archive data');
  console.log('MYFI P10-008 CANONICAL RESTORE STAGE CONTRACT: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
