const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Module=require('node:module');
const {DatabaseSync}=require('node:sqlite');

const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const compile=(f,s)=>{const m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(s,f);return m.exports;};
const vf=path.join(root,'src/lib/financialRestoreSqlValidatorV13.js');
let vs=fs.readFileSync(vf,'utf8').replace(/export const /g,'const ');
vs+='\nmodule.exports={RESTORE_SQL_VALIDATOR_V13_VERSION,proveRestoreNamespaceSqlV13};';
const validator=compile(vf,vs);

class DB{constructor(){this.native=new DatabaseSync(':memory:')}async runAsync(s,...p){const r=this.native.prepare(String(s)).run(...p);return{changes:Number(r.changes||0)}}async getFirstAsync(s,...p){return this.native.prepare(String(s)).get(...p)||null}close(){this.native.close()}}
const db=new DB();
const ns='user:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa::restore-stage::11111111-1111-4111-8111-111111111111';
const now='2026-08-22T00:00:00.000Z';
const schema=`
CREATE TABLE ledger_workspace_state_v7(namespace TEXT,source_mode TEXT,schema_version INTEGER,payload_json TEXT);
CREATE TABLE ledger_accounts_v7(namespace TEXT,id TEXT,account_type TEXT,currency_code TEXT);
CREATE TABLE ledger_exchange_rates_v7(namespace TEXT,id TEXT,base_currency_code TEXT,quote_currency_code TEXT,numerator INTEGER,denominator INTEGER,rate_date TEXT);
CREATE TABLE ledger_financial_transactions_v7(namespace TEXT,id TEXT,kind TEXT,date_iso TEXT,revision INTEGER,archive_year INTEGER,archived_at TEXT,deleted_at TEXT,payload_json TEXT);
CREATE TABLE ledger_postings_v7(namespace TEXT,id TEXT,transaction_id TEXT,account_id TEXT,bucket TEXT,role TEXT,amount_minor INTEGER,currency_code TEXT,exchange_rate_id TEXT);
CREATE TABLE ledger_transaction_links_v7(namespace TEXT,id TEXT,transaction_id TEXT,link_id TEXT,relation TEXT,applied_amount_minor INTEGER,currency_code TEXT);
CREATE TABLE ledger_entities_v7(namespace TEXT,entity_type TEXT,id TEXT,revision INTEGER,deleted_at TEXT,payload_json TEXT);
CREATE TABLE cold_archive_years(namespace TEXT,year INTEGER,metadata_json TEXT);
CREATE TABLE cold_archive_transactions(namespace TEXT,id TEXT,payload_json TEXT);
`;
db.native.exec(schema);
const run=(s,...p)=>db.runAsync(s,...p);
const codes=result=>new Set(result.issues.map(x=>x.code));
(async()=>{
  await run('INSERT INTO ledger_workspace_state_v7 VALUES (?,?,?,?)',ns,'shadow',7,JSON.stringify({cfg:{currency:'IQD'}}));
  await run('INSERT INTO ledger_accounts_v7 VALUES (?,?,?,?)',ns,'wallet-1','wallet','IQD');
  await run('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?)',ns,'wallet','wallet-1',1,null,JSON.stringify({currency:'IQD'}));
  await run('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?,?,?,?)',ns,'tx-1','expense','2026-08-22',1,null,null,null,JSON.stringify({walletId:'wallet-1',currencyCode:'IQD',baseCurrencyCode:'IQD',dateISO:'2026-08-22'}));
  await run('INSERT INTO ledger_postings_v7 VALUES (?,?,?,?,?,?,?,?,?)',ns,'post-1','tx-1','wallet-1','physical','expense',-1,'IQD',null);
  await run('INSERT INTO cold_archive_years VALUES (?,?,?)',ns,2025,JSON.stringify({debts:[],goals:[],wallets:[],commitments:[],cats:[]}));
  await run('INSERT INTO cold_archive_transactions VALUES (?,?,?)',ns,'arc-1',JSON.stringify({id:'arc-1'}));
  let result=await validator.proveRestoreNamespaceSqlV13({database:db,namespace:ns});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.validatorVersion,1);assert.deepEqual(result.issues,[]);
  console.log('[PASS] valid private restore namespace passes scalar SQL proof');

  await run('UPDATE ledger_financial_transactions_v7 SET payload_json=? WHERE namespace=? AND id=?','{bad',ns,'tx-1');
  result=await validator.proveRestoreNamespaceSqlV13({database:db,namespace:ns});
  assert.equal(result.ok,false);assert.ok(codes(result).has('transaction_payload_invalid_json'));
  assert.ok(result.issues.every(item=>Object.keys(item).sort().join(',')==='code,count'));
  assert.ok(!JSON.stringify(result).includes('-1'),'diagnostic must not include financial amount values');
  console.log('[PASS] invalid JSON fails closed without raw financial diagnostics');

  await run('UPDATE ledger_financial_transactions_v7 SET payload_json=? WHERE namespace=? AND id=?',JSON.stringify({walletId:'wallet-1',currencyCode:'IQD',baseCurrencyCode:'IQD',dateISO:'2026-08-22'}),ns,'tx-1');
  await run('INSERT INTO ledger_postings_v7 VALUES (?,?,?,?,?,?,?,?,?)',ns,'post-bad','missing-tx','wallet-1','physical','expense',-2,'IQD',null);
  result=await validator.proveRestoreNamespaceSqlV13({database:db,namespace:ns});
  assert.ok(codes(result).has('posting_transaction_unresolved'));
  await run('DELETE FROM ledger_postings_v7 WHERE namespace=? AND id=?',ns,'post-bad');
  console.log('[PASS] namespace-scoped anti-join detects unresolved posting relationship');

  await run("UPDATE ledger_financial_transactions_v7 SET kind='transfer' WHERE namespace=? AND id=?",ns,'tx-1');
  result=await validator.proveRestoreNamespaceSqlV13({database:db,namespace:ns});
  assert.ok(codes(result).has('invalid_transfer_legs'));
  await run("UPDATE ledger_financial_transactions_v7 SET kind='expense' WHERE namespace=? AND id=?",ns,'tx-1');
  console.log('[PASS] transfer financial invariant is proven with scalar SQL only');

  await run('UPDATE cold_archive_years SET metadata_json=? WHERE namespace=?',JSON.stringify({debts:{bad:true}}),ns);
  result=await validator.proveRestoreNamespaceSqlV13({database:db,namespace:ns});
  assert.ok(codes(result).has('archive_metadata_collection_invalid'));
  console.log('[PASS] Cold Archive metadata collection shape fails closed');

  await assert.rejects(()=>validator.proveRestoreNamespaceSqlV13({database:db,namespace:'user:live'}),/restore_sql_validator_input_invalid/);
  console.log('[PASS] validator refuses active namespaces');
  console.log('MYFI P10-013 SQL VALIDATOR V13: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.close());
