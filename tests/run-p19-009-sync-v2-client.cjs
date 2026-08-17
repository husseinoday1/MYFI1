const path=require('node:path');
const Module=require('node:module');
const babel=require('@babel/core');
const assert=require('node:assert/strict');

const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));
const target=path.join(root,'src/lib/financialMutationSyncV2.js');

let pending=[{
 mutation_id:'m-1',command_id:'cmd-1',ledger_id:'ledger-1',restore_epoch:1,
 entity_type:'goal',entity_id:'goal-1',operation:'upsert',revision:1,base_revision:0,
 protocol_version:2,minimum_supported_version:2,payload_schema_version:7,
 payload:{id:'goal-1'},created_at:'2026-08-17T00:00:00.000Z',
}];
let acked=[];
let applied=[];
let cursor=0;

const repoMock={
 ensureLedgerSyncIdentityV8:async()=>({
  namespace:'user:test',ledgerId:'ledger-1',restoreEpoch:1,protocolVersion:2,minimumSupportedVersion:2,
 }),
 readLedgerRestoreIntentV8:async()=>null,
 readPendingLedgerMutationsV8:async()=>pending.filter(row=>!acked.includes(row.mutation_id)),
 acknowledgeLedgerMutationsV8:async({mutationIds})=>{acked.push(...mutationIds);return mutationIds.length;},
 failLedgerMutationV8:async()=>true,
 getLedgerSyncCursorV8:async()=>cursor,
 applyRemoteLedgerMutationsV8:async({mutations})=>{
  applied.push(...mutations);
  cursor=mutations.reduce((n,row)=>Math.max(n,Number(row.commandSequence||0)),cursor);
  return {ok:true,supported:true,applied:mutations.length,cursor};
 },
};

const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(request==='./financialLedgerV7Repository'&&parent?.filename===target)return repoMock;
 return originalLoad.call(this,request,parent,isMain);
};
const source=babel.transformFileSync(target,{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-modules-commonjs']}).code;
const mod=new Module(target,module);mod.filename=target;mod.paths=Module._nodeModulePaths(path.dirname(target));mod._compile(source,target);
const {syncFinancialMutationsV2}=mod.exports;

(async()=>{
 let page=0;
 const supabase={rpc:async(name,args)=>{
  if(name==='get_financial_ledger_v2')return {data:{ledgerId:'ledger-1',restoreEpoch:1,protocolVersion:2,minimumSupportedVersion:2,status:'active'},error:null};
  if(name==='sync_financial_mutations_v2'){
   page+=1;
   return {data:{
    acceptedMutationIds:page===1?['m-1']:[],
    conflicts:[],
    remoteMutations:[{
     ledgerId:'ledger-1',restoreEpoch:1,mutationId:`remote-${page}`,commandId:`remote-cmd-${page}`,
     serverSequence:page,commandSequence:page,commandMutationCount:1,
     entityType:'goal',entityId:`goal-${page+1}`,operation:'upsert',
     revision:1,baseRevision:0,protocolVersion:2,minimumSupportedVersion:2,
     payloadSchemaVersion:7,payload:{id:`goal-${page+1}`},
    }],
    latestSequence:page,hasMore:page<2,ledgerId:'ledger-1',restoreEpoch:1,protocolVersion:2,
   },error:null};
  }
  throw new Error(`unexpected rpc ${name}`);
 }};
 const result=await syncFinancialMutationsV2({supabase,namespace:'user:test',deviceId:'device-a',maxPages:5});
 assert.equal(result.ok,true);
 assert.equal(result.pages,2);
 assert.equal(result.uploaded,1);
 assert.equal(result.downloaded,2);
 assert.deepEqual(acked,['m-1']);

 const conflictSupabase={rpc:async(name)=>{
  if(name==='get_financial_ledger_v2')return {data:{ledgerId:'ledger-1',restoreEpoch:1,protocolVersion:2,minimumSupportedVersion:2,status:'active'},error:null};
  return {data:{acceptedMutationIds:[],conflicts:[{reason:'base_revision_mismatch'}],remoteMutations:[],latestSequence:2,hasMore:false,ledgerId:'ledger-1',restoreEpoch:1,protocolVersion:2},error:null};
 }};
 const conflict=await syncFinancialMutationsV2({supabase:conflictSupabase,namespace:'user:test',deviceId:'device-a'});
 assert.equal(conflict.ok,false);
 assert.equal(conflict.reason,'financial_v2_revision_conflict');
 console.log('MYFI P19-009 SYNC V2 CLIENT RUNTIME: PASSED');
})().catch(e=>{console.error(e);process.exit(1);});
