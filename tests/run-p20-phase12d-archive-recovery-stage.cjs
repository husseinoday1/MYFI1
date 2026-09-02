const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialArchiveRecoveryImportV2.js');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const row = { ordinal: 1, rowType: 'archive_year', rowKey: '["personal",2025]', rowHash: 'a'.repeat(64), payloadText: '{"scope":"personal","year":2025,"summary":{},"metadata":{}}' };
const calls = { begin: 0, write: 0, mark: 0, fail: 0 };
let beginStatus = 'downloading';
const archiveMock = {
  readFinancialArchiveHeadV2: async () => ({ ok: true, ledgerId: 'ledger-archive-stage', restoreEpoch: 5, archivePresent: true, archiveGeneration: 1, snapshotId: 'snapshot-archive-stage', manifestHash: 'f'.repeat(64), expectedRowCount: 1 }),
  verifyFinancialArchiveSnapshotReadbackV2: async input => { await input.onVerifiedRow(row); return { ok: true, readBackRowCount: 1 }; },
};
const repoMock = {
  beginFinancialArchiveRecoveryImportV11: async input => { calls.begin += 1; assert.equal(input.sourceLedgerId, 'ledger-archive-stage'); return { session_id: 'archive-stage-session', status: beginStatus, proof_digest: 'd'.repeat(64) }; },
  writeFinancialArchiveRecoveryStageRowV12: async () => { calls.write += 1; },
  inspectFinancialArchiveRecoveryStageV12: async () => ({ ok: true, receipts: [{ ordinal: 1, row_hash: row.rowHash }] }),
  markFinancialArchiveRecoveryImportReadyV11: async input => { calls.mark += 1; assert.match(input.proofDigest, /^[0-9a-f]{64}$/); return { session_id: input.sessionId, status: 'ready' }; },
  failFinancialArchiveRecoveryImportV12: async input => { calls.fail += 1; assert.equal(input.sessionId, 'archive-stage-session'); assert.equal(input.error, 'network_interrupted'); return { session_id: input.sessionId, status: 'failed' }; },
};
const cryptoMock = { CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_algorithm, value) => sha(value) };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === target && request === 'expo-crypto') return cryptoMock;
  if (parent?.filename === target && request === './financialArchiveSnapshotV2') return archiveMock;
  if (parent?.filename === target && request === './financialLedgerV7Repository') return repoMock;
  return originalLoad.call(this, request, parent, isMain);
};
const compiled = new Module(target, module); compiled.filename = target; compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
Module._load = originalLoad;
const { stageFinancialArchiveRecoveryImportV2 } = compiled.exports;

(async () => {
  const staged = await stageFinancialArchiveRecoveryImportV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:archive-stage', accountId: 'account-1', bootstrapSource: { ledgerId: 'ledger-archive-stage', restoreEpoch: 5 } });
  assert.equal(staged.ok, true); assert.equal(staged.session.status, 'ready');
  assert.deepEqual(calls, { begin: 1, write: 1, mark: 1, fail: 0 });
  beginStatus = 'ready';
  const beforeReady = { write: calls.write, mark: calls.mark, fail: calls.fail };
  const ready = await stageFinancialArchiveRecoveryImportV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:archive-stage', accountId: 'account-1', bootstrapSource: { ledgerId: 'ledger-archive-stage', restoreEpoch: 5 } });
  assert.equal(ready.ok, true); assert.equal(ready.session.session_id, 'archive-stage-session');
  assert.equal(ready.readback, null); assert.equal(ready.proofDigest, 'd'.repeat(64));
  assert.equal(calls.write, beforeReady.write); assert.equal(calls.mark, beforeReady.mark); assert.equal(calls.fail, beforeReady.fail);
  beginStatus = 'downloading';
  const missing = await stageFinancialArchiveRecoveryImportV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:archive-stage', accountId: '', bootstrapSource: { ledgerId: 'ledger-archive-stage', restoreEpoch: 5 } });
  assert.equal(missing.reason, 'financial_archive_recovery_account_missing');
  const absentCalls = { begin: 0, readback: 0 };
  const absentArchive = {
    readFinancialArchiveHeadV2: async () => ({ ok: true, ledgerId: 'ledger-archive-stage', restoreEpoch: 5, archivePresent: false, archiveGeneration: 0, snapshotId: '', manifestHash: '', expectedRowCount: 0 }),
    verifyFinancialArchiveSnapshotReadbackV2: async () => { absentCalls.readback += 1; throw new Error('archive readback must not run when absent'); },
  };
  const absentRepo = {
    beginFinancialArchiveRecoveryImportV11: async () => { absentCalls.begin += 1; return { session_id: 'archive-absent-session', status: 'ready', proof_digest: '0'.repeat(64) }; },
    writeFinancialArchiveRecoveryStageRowV12: async () => { throw new Error('archive write must not run when absent'); },
    inspectFinancialArchiveRecoveryStageV12: async () => { throw new Error('archive inspection must not run when absent'); },
    markFinancialArchiveRecoveryImportReadyV11: async () => { throw new Error('archive marking must not run when absent'); },
  };
  const absentLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename === target && request === 'expo-crypto') return cryptoMock;
    if (parent?.filename === target && request === './financialArchiveSnapshotV2') return absentArchive;
    if (parent?.filename === target && request === './financialLedgerV7Repository') return absentRepo;
    return absentLoad.call(this, request, parent, isMain);
  };
  const absentCompiled = new Module(target, module); absentCompiled.filename = target; absentCompiled.paths = Module._nodeModulePaths(path.dirname(target));
  absentCompiled._compile(babel.transformFileSync(target, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'] }).code, target);
  Module._load = absentLoad;
  const absent = await absentCompiled.exports.stageFinancialArchiveRecoveryImportV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:archive-absent', accountId: 'account-1', bootstrapSource: { ledgerId: 'ledger-archive-stage', restoreEpoch: 5 } });
  assert.equal(absent.ok, true); assert.equal(absent.session.status, 'ready');
  assert.deepEqual(absentCalls, { begin: 1, readback: 0 });
  archiveMock.verifyFinancialArchiveSnapshotReadbackV2 = async () => ({ ok: false, reason: 'network_interrupted' });
  const interrupted = await stageFinancialArchiveRecoveryImportV2({ supabase: { rpc: async () => ({}) }, namespace: 'user:archive-stage', accountId: 'account-1', bootstrapSource: { ledgerId: 'ledger-archive-stage', restoreEpoch: 5 } });
  assert.equal(interrupted.ok, false); assert.equal(interrupted.reason, 'network_interrupted');
  assert.equal(calls.fail, 1, 'an interrupted archive read must clear its private stage before retry');
  console.log('MYFI P20 PHASE 12-D ARCHIVE RECOVERY PRIVATE STAGE: PASSED');
})().catch(error => { console.error(error); process.exit(1); });
