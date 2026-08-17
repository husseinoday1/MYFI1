const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const target = path.join(root,'src/lib/financialCloudRecoveryV2.js');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const originalLoad = Module._load;
Module._load = function(request,parent,isMain) {
  if (request === 'expo-crypto' && parent?.filename === target) {
    return {
      CryptoDigestAlgorithm: { SHA256:'SHA-256' },
      digestStringAsync: async (_algorithm,value) => sha(value),
    };
  }
  return originalLoad.call(this,request,parent,isMain);
};

const source = babel.transformFileSync(target,{
  babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs'],
}).code;
const mod = new Module(target,module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source,target);
const { fetchVerifiedFinancialCloudRecoverySourceV2 } = mod.exports;

const snapshot = {
  v:7,
  data:{ trans:[{id:'t1'}], debts:[], goals:[], wallets:[{id:'w1'}], commitments:[] },
  cats:[],
  cfg:{currency:'IQD'},
  updatedAt:'2026-08-17T07:54:04.814771+00:00',
  lastSyncedAt:'2026-08-17T07:54:04.814771+00:00',
  cloudRevision:300,
  dirty:false,
};
const snapshotText = JSON.stringify(snapshot);
const good = {
  mode:'legacy_snapshot',
  snapshotText,
  snapshotHash:sha(snapshotText),
  cloudRevision:300,
  cloudUpdatedAt:snapshot.updatedAt,
  legacyFinancialCount:1,
  walletCount:1,
  reservedLedgerId:null,
  reservedRestoreEpoch:null,
};

(async()=>{
  const ok = await fetchVerifiedFinancialCloudRecoverySourceV2({
    supabase:{ rpc:async()=>({data:good,error:null}) },
  });
  assert.equal(ok.ok,true);
  assert.equal(ok.mode,'legacy_snapshot');
  assert.equal(ok.cloudRevision,300);
  assert.equal(ok.snapshot.data.trans.length,1);

  const bad = await fetchVerifiedFinancialCloudRecoverySourceV2({
    supabase:{ rpc:async()=>({data:{...good,snapshotHash:'0'.repeat(64)},error:null}) },
  });
  assert.equal(bad.ok,false);
  assert.equal(bad.reason,'financial_cloud_recovery_snapshot_hash_mismatch');

  const v2 = await fetchVerifiedFinancialCloudRecoverySourceV2({
    supabase:{ rpc:async()=>({data:{
      mode:'v2_bootstrap',
      ledgerId:'ledger-1234567890123456',
      restoreEpoch:1,
      bootstrapId:'bootstrap-1234567890123456',
      manifestHash:'a'.repeat(64),
      expectedRowCount:10,
      bootstrappedAt:'2026-08-17T10:00:00Z',
    },error:null}) },
  });
  assert.equal(v2.ok,true);
  assert.equal(v2.mode,'v2_bootstrap');
  assert.equal(v2.requiresBootstrapImport,true);

  console.log('MYFI P19-012 CLOUD RECOVERY SOURCE RUNTIME: PASSED');
})().catch(error=>{console.error(error);process.exit(1);});
