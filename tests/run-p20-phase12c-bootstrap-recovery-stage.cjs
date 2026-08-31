const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialBootstrapRecoveryImportV2.js');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const rows = [
  { ordinal: 1, rowType: 'currency', rowKey: 'IQD', rowHash: 'a'.repeat(64), payloadText: '{"code":"IQD","minor_exponent":3,"enabled":1}' },
];
const source = {
  ledgerId: 'ledger-phase12c', restoreEpoch: 4, bootstrapId: 'bootstrap-phase12c',
  manifestHash: 'f'.repeat(64), expectedRowCount: 1,
};

const calls = { begin: 0, write: [], mark: 0 };
const repoMock = {
  beginFinancialBootstrapRecoveryImportV9: async input => {
    calls.begin += 1;
    assert.equal(input.sourceLedgerId, source.ledgerId);
    return { session_id: 'session-phase12c', stage_namespace: 'bootstrap-recovery-stage:session-phase12c' };
  },
  writeFinancialBootstrapRecoveryStageRowV10: async input => { calls.write.push(input.row); },
  inspectFinancialBootstrapRecoveryStageV10: async () => ({
    ok: true,
    stage: {
      snapshot: { currencies: [], accounts: [], exchangeRates: [], transactions: [], postings: [], links: [], entities: [], workspaceState: null },
      receipts: rows.map(row => ({
        ordinal: row.ordinal, row_type: row.rowType, row_key: row.rowKey,
        row_hash: row.rowHash, payload_text: row.payloadText,
      })),
    },
  }),
  markFinancialBootstrapRecoveryImportReadyV9: async input => {
    calls.mark += 1;
    assert.match(input.proofDigest, /^[0-9a-f]{64}$/);
    return { session_id: input.sessionId, status: 'ready' };
  },
};
const bootstrapMock = {
  verifyFinancialBootstrapReadbackV2: async input => {
    for (const row of rows) await input.onVerifiedRow(row);
    return { ok: true, readBackRowCount: 1 };
  },
  buildFinancialBootstrapRowsV2: async () => ({ rows, manifestHash: source.manifestHash, expectedRowCount: 1 }),
};
const cryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, value) => sha(value),
};
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === target && request === 'expo-crypto') return cryptoMock;
  if (parent?.filename === target && request === './financialBootstrapV2') return bootstrapMock;
  if (parent?.filename === target && request === './financialLedgerV7Repository') return repoMock;
  return originalLoad.call(this, request, parent, isMain);
};

const compiled = new Module(target, module);
compiled.filename = target;
compiled.paths = Module._nodeModulePaths(path.dirname(target));
compiled._compile(babel.transformFileSync(target, {
  babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code, target);
const { stageFinancialBootstrapRecoveryImportV2 } = compiled.exports;

(async () => {
  const staged = await stageFinancialBootstrapRecoveryImportV2({
    supabase: { rpc: async () => ({}) }, namespace: 'user:phase12c', accountId: 'account-phase12c', source,
  });
  assert.equal(staged.ok, true);
  assert.equal(staged.session.status, 'ready');
  assert.equal(calls.begin, 1);
  assert.equal(calls.write.length, 1);
  assert.equal(calls.mark, 1);

  const bad = await stageFinancialBootstrapRecoveryImportV2({
    supabase: { rpc: async () => ({}) }, namespace: 'user:phase12c', accountId: '', source,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'financial_v2_bootstrap_recovery_account_missing');
  console.log('MYFI P20 PHASE 12-C BOOTSTRAP RECOVERY PRIVATE STAGE: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
