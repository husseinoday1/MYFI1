// Phase 10 / P10-013 B2 — immutable start snapshot + versioned proof binding.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const compile = (filename, source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};
const countKeys = Object.freeze([
  'transactions','postings','links','accounts','exchangeRates','entities','coldArchiveBundles','coldArchiveRecords',
]);
const counts = Object.freeze({ transactions: 3, postings: 4, links: 1, accounts: 2, exchangeRates: 1, entities: 5, coldArchiveBundles: 2, coldArchiveRecords: 8 });

const proofFilename = path.join(root, 'src/lib/financialRestoreProofV13.js');
let proofSource = fs.readFileSync(proofFilename, 'utf8')
  .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/, `const sha256 = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest();`)
  .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/, `const bytesToHex = bytes => Buffer.from(bytes).toString('hex');`)
  .replace(/import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/, `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = globalThis.__COUNT_KEYS__;`)
  .replace(/import \{ SEMANTIC_HASH_V3_VERSION \} from '\.\/financialSemanticProjection';/, `const SEMANTIC_HASH_V3_VERSION = 3;`)
  .replace(/export const /g, 'const ');
proofSource = `const crypto = require('node:crypto');\n${proofSource}`;
proofSource += `\nmodule.exports = { CANONICAL_RESTORE_PROOF_V13_VERSION, normalizeCanonicalRestoreProofCountsV13, deriveCanonicalRestoreProofDigestV13 };`;
globalThis.__COUNT_KEYS__ = countKeys;
const proof = compile(proofFilename, proofSource);
globalThis.__P10_PROOF_V13__ = proof;

const generationFilename = path.join(root, 'src/lib/financialLiveGenerationV13.js');
let generationSource = fs.readFileSync(generationFilename, 'utf8').replace(/export const /g, 'const ');
generationSource += `\nmodule.exports = { registerLiveGenerationInTransactionV13, readLiveGenerationInTransactionV13 };`;
const generation = compile(generationFilename, generationSource);
globalThis.__P10_GENERATION__ = generation;

const snapshotFilename = path.join(root, 'src/lib/financialRestoreStartSnapshotV13.js');
let snapshotSource = fs.readFileSync(snapshotFilename, 'utf8')
  .replace(/import \{ readLiveGenerationInTransactionV13 \} from '\.\/financialLiveGenerationV13';/, `const { readLiveGenerationInTransactionV13 } = globalThis.__P10_GENERATION__;`)
  .replace(/import \{ SEMANTIC_HASH_V3_VERSION \} from '\.\/financialSemanticProjection';/, `const SEMANTIC_HASH_V3_VERSION = 3;`)
  .replace(/import \{[\s\S]*?\} from '\.\/financialRestoreProofV13';/, `const { CANONICAL_RESTORE_PROOF_V13_VERSION, normalizeCanonicalRestoreProofCountsV13 } = globalThis.__P10_PROOF_V13__;`)
  .replace(/export const /g, 'const ');
snapshotSource += `\nmodule.exports = { captureRestoreStartSnapshotInTransactionV13, readRestoreStartSnapshotInTransactionV13 };`;
const snapshot = compile(snapshotFilename, snapshotSource);

class AsyncSqlite {
  constructor() { this.native = new DatabaseSync(':memory:'); }
  async runAsync(sql, ...params) { const r = this.native.prepare(String(sql)).run(...params); return { changes: Number(r.changes || 0) }; }
  async getFirstAsync(sql, ...params) { return this.native.prepare(String(sql)).get(...params) || null; }
  async withExclusiveTransactionAsync(task) {
    this.native.exec('BEGIN IMMEDIATE');
    try { const result = await task(this); this.native.exec('COMMIT'); return result; }
    catch (error) { this.native.exec('ROLLBACK'); throw error; }
  }
  close() { this.native.close(); }
}

const operationId = '11111111-1111-4111-8111-111111111111';
const checkpointId = '22222222-2222-4222-8222-222222222222';
const namespace = 'user:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ledgerId = 'ledger-b2';
const stageNamespace = `${namespace}::restore-stage::incoming`;
const incomingHash = 'a'.repeat(64);
const checkpointHash = 'b'.repeat(64);
const baseProof = {
  operationId, ledgerId, fromEpoch: 7, toEpoch: 8, sourceLiveGeneration: 11,
  semanticHashVersion: 3, incomingSemanticHash: incomingHash,
  checkpointId, checkpointSemanticHash: checkpointHash, validatorVersion: 2,
  incomingCounts: counts, checkpointCounts: counts,
};

(async () => {
  const digest = proof.deriveCanonicalRestoreProofDigestV13(baseProof);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(proof.deriveCanonicalRestoreProofDigestV13({ ...baseProof }), digest, 'same proof must be deterministic');
  assert.notEqual(proof.deriveCanonicalRestoreProofDigestV13({ ...baseProof, sourceLiveGeneration: 12 }), digest,
    'source generation must be cryptographically bound');
  assert.notEqual(proof.deriveCanonicalRestoreProofDigestV13({ ...baseProof, checkpointSemanticHash: 'c'.repeat(64) }), digest,
    'Undo checkpoint proof must be cryptographically bound');
  assert.throws(() => proof.deriveCanonicalRestoreProofDigestV13({ ...baseProof, semanticHashVersion: 2 }), /canonical_restore_proof_v13_input_invalid/);
  assert.throws(() => proof.deriveCanonicalRestoreProofDigestV13({ ...baseProof, sourceLiveGeneration: '11' }), /canonical_restore_proof_v13_input_invalid/,
    'proof metadata numbers must not use coercive numeric strings');
  console.log('[PASS] V13 digest binds V3, source generation and checkpoint proof');

  const db = new AsyncSqlite();
  try {
    db.native.exec(`CREATE TABLE ledger_v7_meta(key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL);
      CREATE TABLE ledger_sync_identity_v8(namespace TEXT PRIMARY KEY,ledger_id TEXT NOT NULL,restore_epoch INTEGER NOT NULL,
        protocol_version INTEGER NOT NULL,minimum_supported_version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);`);
    const now = '2026-08-22T00:00:00.000Z';
    await db.runAsync(`INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`, namespace, ledgerId, 7, 2, 2, now, now);
    await db.withExclusiveTransactionAsync(txn => generation.registerLiveGenerationInTransactionV13({ database: txn, namespace, ledgerId, restoreEpoch: 7 }));
    await db.runAsync('UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=?',
      JSON.stringify({ tokenVersion: 1, namespace, ledgerId, restoreEpoch: 7, generation: 11 }), now,
      `financial_live_generation_v13:${namespace}`);

    const input = { database: db, namespace, operationId, stageNamespace, checkpointId, semanticHashVersion: 3,
      incomingSemanticHash: incomingHash, incomingCounts: counts, validatorVersion: 2, batchPolicyVersion: 1 };
    const first = await db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({ ...input, database: txn }));
    assert.equal(first.ledgerId, ledgerId);
    assert.equal(first.sourceRestoreEpoch, 7);
    assert.equal(first.sourceLiveGeneration, 11);
    assert.equal(first.checkpointNamespace, `${namespace}::restore-checkpoint::${checkpointId}`);
    assert.deepEqual(first.incomingCounts, counts);
    assert.equal(first.semanticHashVersion, 3);
    assert.equal(first.proofVersion, 1);

    const second = await db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({ ...input, database: txn }));
    assert.equal(second.operationId, first.operationId, 'same immutable operation is idempotent');
    await assert.rejects(
      db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({
        ...input, database: txn, stageNamespace: `${namespace}::restore-stage::different`,
      })),
      /restore_start_snapshot_conflict/,
      'same operation id cannot be rebound to another stage',
    );
    const readBack = await db.withExclusiveTransactionAsync(txn => snapshot.readRestoreStartSnapshotInTransactionV13({ database: txn, namespace, operationId }));
    assert.equal(readBack.sourceLiveGeneration, 11);
    const serialized = JSON.stringify(readBack);
    for (const forbidden of ['amountMinor','balance','title','note','payload_json']) assert.equal(serialized.includes(forbidden), false);
    console.log('[PASS] start snapshot is durable, immutable/idempotent and metadata-only');

    const missingNs = 'user:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await db.runAsync(`INSERT INTO ledger_sync_identity_v8(namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`, missingNs, 'ledger-missing-token', 1, 2, 2, now, now);
    await assert.rejects(
      db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({
        ...input, database: txn, namespace: missingNs,
        stageNamespace: `${missingNs}::restore-stage::incoming`, checkpointId: '33333333-3333-4333-8333-333333333333',
      })),
      /financial_live_generation_missing/,
      'snapshot must fail closed and never bootstrap missing generation metadata',
    );
    await assert.rejects(
      db.withExclusiveTransactionAsync(txn => snapshot.captureRestoreStartSnapshotInTransactionV13({
        ...input, database: txn, namespace: `${namespace}::restore-stage::bad`,
        stageNamespace: `${namespace}::restore-stage::bad::restore-stage::incoming`, checkpointId: '44444444-4444-4444-8444-444444444444',
      })),
      /restore_start_snapshot_input_invalid/,
      'private namespaces can never become Strategy B live sources',
    );
    console.log('[PASS] missing token and private source namespaces fail closed');
  } finally { db.close(); }

  console.log('MYFI P10-013 B2 START SNAPSHOT + PROOF V13: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
