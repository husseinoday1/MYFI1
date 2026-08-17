const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const target = path.join(root,'src/lib/financialBootstrapV2.js');

const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');
const cryptoMock = {
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digestStringAsync: async (_algorithm, value) => sha(value),
};
const repoMock = {};
const syncMock = {};

const originalLoad = Module._load;
Module._load = function(request,parent,isMain) {
  if (request === 'expo-crypto' && parent?.filename === target) return cryptoMock;
  if (request === './financialLedgerV7Repository' && parent?.filename === target) return repoMock;
  if (request === './financialMutationSyncV2' && parent?.filename === target) return syncMock;
  return originalLoad.call(this,request,parent,isMain);
};

const source = babel.transformFileSync(target,{
  babelrc:false,
  configFile:false,
  plugins:['@babel/plugin-transform-modules-commonjs'],
}).code;
const mod = new Module(target,module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source,target);

const { verifyFinancialBootstrapReadbackV2 } = mod.exports;

const baseRows = [
  { ordinal:1,rowType:'currency',rowKey:'IQD',payloadText:'{"code":"IQD","enabled":1,"minor_exponent":0}' },
  { ordinal:2,rowType:'account',rowKey:'wallet-1',payloadText:'{"currency_code":"IQD","id":"wallet-1","name":"Cash"}' },
  { ordinal:3,rowType:'workspace_state',rowKey:'workspace',payloadText:'{"source_mode":"sqlite"}' },
].map(row => ({
  ...row,
  rowHash: sha(`${row.rowType}\n${row.rowKey}\n${row.payloadText}`),
}));
const manifestHash = sha(baseRows.map(row => row.rowHash).join('\n'));

const makeSupabase = rows => ({
  rpc: async (name,args) => {
    assert.equal(name,'get_financial_bootstrap_rows_v2');
    const after = Number(args.p_after_ordinal || 0);
    const limit = Number(args.p_limit || 200);
    const pageRows = rows.filter(row => row.ordinal > after).slice(0,limit);
    const nextOrdinal = pageRows.length ? pageRows[pageRows.length - 1].ordinal : after;
    return {
      data: {
        ledgerId:'ledger-1',
        restoreEpoch:1,
        bootstrapId:'bootstrap-1',
        manifestHash,
        expectedRowCount:3,
        rows:pageRows,
        nextOrdinal,
        hasMore:rows.some(row => row.ordinal > nextOrdinal),
      },
      error:null,
    };
  },
});

(async () => {
  const verified = await verifyFinancialBootstrapReadbackV2({
    supabase:makeSupabase(baseRows),
    ledgerId:'ledger-1',
    restoreEpoch:1,
    bootstrapId:'bootstrap-1',
    manifestHash,
    expectedRowCount:3,
    pageSize:2,
    maxPages:5,
  });
  assert.equal(verified.ok,true);
  assert.equal(verified.pages,2);
  assert.equal(verified.readBackRowCount,3);
  assert.equal(verified.finalOrdinal,3);

  const badRows = baseRows.map(row => ({...row}));
  badRows[1].rowHash = '0'.repeat(64);
  const corrupted = await verifyFinancialBootstrapReadbackV2({
    supabase:makeSupabase(badRows),
    ledgerId:'ledger-1',
    restoreEpoch:1,
    bootstrapId:'bootstrap-1',
    manifestHash,
    expectedRowCount:3,
    pageSize:2,
    maxPages:5,
  });
  assert.equal(corrupted.ok,false);
  assert.equal(corrupted.reason,'financial_v2_bootstrap_readback_row_hash_mismatch');

  console.log('MYFI P19-011R1 BOOTSTRAP READBACK RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
