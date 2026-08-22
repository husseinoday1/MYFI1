// Phase 10 / P10-013 B4a + Batch B-R1 — bounded streaming V3 must equal accepted V3.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const compile=(f,s)=>{const m=new Module(f,module);m.filename=f;m.paths=Module._nodeModulePaths(path.dirname(f));m._compile(s,f);return m.exports;};
const pickCfg=(cfg={})=>({currency:cfg.currency||'IQD',profileType:cfg.profileType||'personal',activeScope:cfg.activeScope||'personal',enabledModules:cfg.enabledModules&&typeof cfg.enabledModules==='object'?{...cfg.enabledModules}:{},defaultWalletId:cfg.defaultWalletId||null,categoryBudgets:cfg.categoryBudgets&&typeof cfg.categoryBudgets==='object'?{...cfg.categoryBudgets}:{},categoryBudgetsByMonth:cfg.categoryBudgetsByMonth&&typeof cfg.categoryBudgetsByMonth==='object'?{...cfg.categoryBudgetsByMonth}:{},archiveSummaries:Array.isArray(cfg.archiveSummaries)?cfg.archiveSummaries.map(x=>({...x})):[]});

const semanticFilename=path.join(root,'src/lib/financialSemanticProjection.js');
let semanticSource=fs.readFileSync(semanticFilename,'utf8')
 .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/,`const sha256=bytes=>crypto.createHash('sha256').update(Buffer.from(bytes)).digest();`)
 .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/,`const bytesToHex=bytes=>Buffer.from(bytes).toString('hex');`)
 .replace(/import \{ pickFinancialBackupConfig \} from '\.\/backupData';/,`const pickFinancialBackupConfig=globalThis.__PICK__;`)
 .replace(/import \{ canonicalFinancialEntityPayload \} from '\.\/financialLedgerV7Repository';/,`const canonicalFinancialEntityPayload=(type,payload)=>payload;`)
 .replace(/export const /g,'const ');
semanticSource=`const crypto=require('node:crypto');\n${semanticSource}`;
semanticSource+=`\nmodule.exports={SEMANTIC_HASH_V3_VERSION,stableSemanticJsonV3,compareCanonicalTextV3,semanticHashV3,canonicalizeFinancialConfigItemV3,canonicalizeFinancialAccountItemV3,canonicalizeFinancialExchangeRateItemV3,canonicalizeFinancialTransactionItemV3,canonicalizeFinancialPostingItemV3,canonicalizeFinancialLinkItemV3,canonicalizeFinancialEntityItemV3,canonicalizeFinancialArchiveMetadataV3};`;
globalThis.__PICK__=pickCfg;
const semantic=compile(semanticFilename,semanticSource); globalThis.__SEM__=semantic;

class DB{
 constructor(){this.native=new DatabaseSync(':memory:');this.queryLog=[];}
 async runAsync(sql,...p){const r=this.native.prepare(sql).run(...p);return{changes:Number(r.changes||0)}}
 async getFirstAsync(sql,...p){return this.native.prepare(sql).get(...p)||null}
 async *getEachAsync(sql,p=[]){this.queryLog.push({sql:String(sql),params:[...p]});for(const r of this.native.prepare(sql).all(...p))yield r;}
 close(){this.native.close();}
}
const db=new DB();
const parse=v=>{try{return JSON.parse(v)}catch{return null}};
const mapAccount=r=>({id:String(r.id),accountType:String(r.account_type),scope:String(r.scope),currencyCode:String(r.currency_code),status:String(r.status),name:r.name,createdAt:r.created_at,updatedAt:r.updated_at,archivedAt:r.archived_at});
const mapTx=r=>({id:String(r.id),revision:Number(r.revision),payload:parse(r.payload_json),archiveYear:r.archive_year,archivedAt:r.archived_at,deletedAt:r.deleted_at,storage:{kind:r.kind,status:r.status,scope:r.scope,dateISO:r.date_iso,occurredAt:r.occurred_at,categoryId:r.category_id,title:r.title,note:r.note,sourceType:r.source_type,sourceId:r.source_id,idempotencyKey:r.idempotency_key,deviceId:r.device_id,createdAt:r.created_at,updatedAt:r.updated_at}});
const mapPosting=r=>({id:String(r.id),transactionId:String(r.transaction_id),accountId:String(r.account_id),bucket:String(r.bucket),role:String(r.role),amountMinor:Number(r.amount_minor),currencyCode:String(r.currency_code),exchangeRateId:r.exchange_rate_id||null,createdAt:r.created_at});
const mapLink=r=>({id:String(r.id),transactionId:String(r.transaction_id),linkType:String(r.link_type),linkId:String(r.link_id),relation:String(r.relation),appliedAmountMinor:Number(r.applied_amount_minor||0),currencyCode:r.currency_code||null,createdAt:r.created_at});
const mapArchiveHeader=r=>({year:Number(r.year),scope:String(r.scope),archivedAt:r.archived_at,checksum:r.checksum||'',summary:{year:Number(r.year),scope:String(r.scope),archivedAt:r.archived_at,checksum:r.checksum||'',count:Number(r.transaction_count||0),income:Number(r.income||0),expense:Number(r.expense||0),net:Number(r.net||0)},metadata:parse(r.metadata_json)});

const rowSourceCalls=[];
const rowSource=async({database,namespace,section,cursor=null,maxRows=128})=>{
 rowSourceCalls.push({section,cursor:cursor?JSON.parse(JSON.stringify(cursor)):null,maxRows:Number(maxRows)});
 const limit=Number(maxRows); let sql='',params=[namespace],map=x=>x,next=x=>({id:String(x.id)});
 if(section==='financialConfig'){const r=await database.getFirstAsync(`SELECT source_mode,schema_version,payload_json,updated_at FROM ledger_workspace_state_v7 WHERE namespace=?`,namespace);return{ok:true,rows:r?[{sourceMode:r.source_mode,schemaVersion:Number(r.schema_version),payloadJson:r.payload_json,updatedAt:r.updated_at}]:[],hasMore:false,nextCursor:null};}
 if(section==='archiveHeaders'){
   const has=cursor&&Object.prototype.hasOwnProperty.call(cursor,'scope')&&Object.prototype.hasOwnProperty.call(cursor,'year');
   sql=`SELECT * FROM cold_archive_years WHERE namespace=?${has?' AND (scope COLLATE BINARY,year) > (?,?)':''} ORDER BY scope COLLATE BINARY,year ASC LIMIT ?`;
   if(has)params.push(String(cursor.scope),Number(cursor.year));
   params.push(limit+1);
   const raw=database.native.prepare(sql).all(...params);const hasMore=raw.length>limit;const rows=raw.slice(0,limit).map(mapArchiveHeader);
   return{ok:true,rows,hasMore,nextCursor:rows.length?{scope:String(rows[rows.length-1].scope),year:Number(rows[rows.length-1].year)}:null};
 }
 const after=cursor?.id;
 if(section==='accounts'){sql=`SELECT * FROM ledger_accounts_v7 WHERE namespace=?${after?' AND id COLLATE BINARY > ?':''} ORDER BY id COLLATE BINARY LIMIT ?`;map=mapAccount;}
 else if(section==='transactions'){sql=`SELECT * FROM ledger_financial_transactions_v7 WHERE namespace=?${after?' AND id COLLATE BINARY > ?':''} ORDER BY id COLLATE BINARY LIMIT ?`;map=mapTx;}
 else if(section==='postings'){sql=`SELECT * FROM ledger_postings_v7 WHERE namespace=?${after?' AND id COLLATE BINARY > ?':''} ORDER BY id COLLATE BINARY LIMIT ?`;map=mapPosting;}
 else if(section==='links'){sql=`SELECT * FROM ledger_transaction_links_v7 WHERE namespace=?${after?' AND id COLLATE BINARY > ?':''} ORDER BY id COLLATE BINARY LIMIT ?`;map=mapLink;}
 else if(section==='exchangeRates'||section==='entities') return{ok:true,rows:[],hasMore:false,nextCursor:null};
 else throw new Error(`section:${section}`);
 if(after)params.push(after);params.push(limit+1);const raw=database.native.prepare(sql).all(...params);const hasMore=raw.length>limit;const rows=raw.slice(0,limit).map(map);return{ok:true,rows,hasMore,nextCursor:rows.length?next(rows[rows.length-1]):null};
}; globalThis.__ROW_SOURCE__=rowSource;

const streamFilename=path.join(root,'src/lib/financialSemanticStreamV3.js');
let streamSource=fs.readFileSync(streamFilename,'utf8')
 .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/,`const sha256={create:()=>{const h=crypto.createHash('sha256');return{update:b=>{h.update(Buffer.from(b));},digest:()=>h.digest()}}};`)
 .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/,`const bytesToHex=b=>Buffer.from(b).toString('hex');`)
 .replace(/import \{[\s\S]*?\} from '\.\/financialSemanticProjection';/,`const {SEMANTIC_HASH_V3_VERSION,stableSemanticJsonV3,compareCanonicalTextV3,canonicalizeFinancialConfigItemV3,canonicalizeFinancialAccountItemV3,canonicalizeFinancialExchangeRateItemV3,canonicalizeFinancialTransactionItemV3,canonicalizeFinancialPostingItemV3,canonicalizeFinancialLinkItemV3,canonicalizeFinancialEntityItemV3,canonicalizeFinancialArchiveMetadataV3}=globalThis.__SEM__;`)
 .replace(/import \{[\s\S]*?\} from '\.\/financialCanonicalRowSourceV3';/,`const CANONICAL_ROW_SOURCE_V3_BATCH_POLICY={version:1,defaultMaxRows:128,defaultMaxBytes:131072,absoluteMaxRows:512,absoluteMaxBytes:1048576,absoluteMaxRowBytes:262144}; const readCanonicalRowBatchV3=globalThis.__ROW_SOURCE__;`)
 .replace(/export const /g,'const ');
streamSource=`const crypto=require('node:crypto');\n${streamSource}`;
streamSource+=`\nmodule.exports={semanticHashNamespaceV3Bounded};`;
const stream=compile(streamFilename,streamSource);

const now='2026-08-22T00:00:00.000Z',ns='user:a',ledgerId='ledger-stream';
const archiveSpecs=[
 {scope:'équipe',year:2025,checksum:'h3',metadata:{debts:[],goals:[{id:'g2'},{id:'g1'}],wallets:[],commitments:[],cats:[],cfg:{currency:'IQD'},archiveScope:'équipe'},tx:[{id:'😀1',amt:5},{id:'a1',amt:1},{id:'ع1',amt:3},{id:'é1',amt:4},{id:'z2',amt:2}]},
 {scope:'personal',year:2024,checksum:'h1',metadata:{debts:[{id:'d2'},{id:'d1'}],goals:[],wallets:[],commitments:[],cats:[],cfg:{currency:'IQD'},archiveScope:'personal'},tx:[{id:'p3',amt:3},{id:'p1',amt:1},{id:'p2',amt:2}]},
 {scope:'personal',year:2022,checksum:'h0',metadata:{debts:[],goals:[],wallets:[],commitments:[{id:'c1'}],cats:[],cfg:{currency:'IQD'},archiveScope:'personal'},tx:[{id:'old2',amt:2},{id:'old1',amt:1}]},
 {scope:'العائلة',year:2023,checksum:'h2',metadata:{debts:[],goals:[],wallets:[{id:'w2'},{id:'w1'}],commitments:[],cats:[],cfg:{currency:'IQD'},archiveScope:'العائلة'},tx:[{id:'ب',amt:2},{id:'ا',amt:1}]},
];

(async()=>{
 db.native.exec(`CREATE TABLE ledger_workspace_state_v7(namespace TEXT PRIMARY KEY,source_mode TEXT,schema_version INTEGER,payload_json TEXT,updated_at TEXT);CREATE TABLE ledger_accounts_v7(namespace TEXT,id TEXT,name TEXT,account_type TEXT,scope TEXT,currency_code TEXT,status TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT);CREATE TABLE ledger_exchange_rates_v7(namespace TEXT,id TEXT,base_currency_code TEXT,quote_currency_code TEXT,numerator INTEGER,denominator INTEGER,rate_date TEXT,source TEXT,captured_at TEXT);CREATE TABLE ledger_financial_transactions_v7(namespace TEXT,id TEXT,kind TEXT,status TEXT,scope TEXT,date_iso TEXT,occurred_at TEXT,category_id TEXT,title TEXT,note TEXT,source_type TEXT,source_id TEXT,idempotency_key TEXT,device_id TEXT,revision INTEGER,archive_year INTEGER,archived_at TEXT,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE ledger_postings_v7(namespace TEXT,id TEXT,transaction_id TEXT,account_id TEXT,bucket TEXT,role TEXT,amount_minor INTEGER,currency_code TEXT,exchange_rate_id TEXT,created_at TEXT);CREATE TABLE ledger_transaction_links_v7(namespace TEXT,id TEXT,transaction_id TEXT,link_type TEXT,link_id TEXT,relation TEXT,applied_amount_minor INTEGER,currency_code TEXT,created_at TEXT);CREATE TABLE ledger_entities_v7(namespace TEXT,entity_type TEXT,id TEXT,revision INTEGER,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT);CREATE TABLE cold_archive_years(namespace TEXT,scope TEXT,year INTEGER,archived_at TEXT,checksum TEXT,transaction_count INTEGER,income REAL,expense REAL,net REAL,metadata_json TEXT);CREATE TABLE cold_archive_transactions(namespace TEXT,scope TEXT,year INTEGER,id TEXT,payload_json TEXT);`);
 await db.runAsync(`INSERT INTO ledger_workspace_state_v7 VALUES (?,?,?,?,?)`,ns,'sqlite',7,JSON.stringify({localPreferences:{cfg:{currency:'IQD',profileType:'personal',activeScope:'personal',theme:'dark'}}}),now);
 const accounts=[];for(let i=0;i<3;i++){const id=`a${i}`;await db.runAsync(`INSERT INTO ledger_accounts_v7 VALUES (?,?,?,?,?,?,?,?,?,?)`,ns,id,`W${i}`,'wallet','personal','IQD','active',now,now,null);accounts.push({id,accountType:'wallet',scope:'personal',currencyCode:'IQD',status:'active',name:`W${i}`,createdAt:now,updatedAt:now,archivedAt:null});}
 const transactions=[],postings=[],links=[];for(let i=0;i<3;i++){const payload={id:`t${i}`,amt:i+1,title:`T${i}`,kind:'expense',status:'posted',scope:'personal',dateISO:'2026-08-22'};await db.runAsync(`INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,ns,`t${i}`,'expense','posted','personal','2026-08-22',now,null,`T${i}`,null,'manual',null,`idem${i}`,'dev',1,null,null,null,JSON.stringify(payload),now,now);transactions.push(mapTx({id:`t${i}`,revision:1,payload_json:JSON.stringify(payload),archive_year:null,archived_at:null,deleted_at:null,kind:'expense',status:'posted',scope:'personal',date_iso:'2026-08-22',occurred_at:now,category_id:null,title:`T${i}`,note:null,source_type:'manual',source_id:null,idempotency_key:`idem${i}`,device_id:'dev',created_at:now,updated_at:now}));await db.runAsync(`INSERT INTO ledger_postings_v7 VALUES (?,?,?,?,?,?,?,?,?,?)`,ns,`p${i}`,`t${i}`,`a${i}`,'physical','expense',-(100+i),'IQD',null,now);postings.push({id:`p${i}`,transactionId:`t${i}`,accountId:`a${i}`,bucket:'physical',role:'expense',amountMinor:-(100+i),currencyCode:'IQD',exchangeRateId:null,createdAt:now});}
 await db.runAsync(`INSERT INTO ledger_transaction_links_v7 VALUES (?,?,?,?,?,?,?,?,?)`,ns,'l0','t0','goal','g0','applied',50,'IQD',now);links.push({id:'l0',transactionId:'t0',linkType:'goal',linkId:'g0',relation:'applied',appliedAmountMinor:50,currencyCode:'IQD',createdAt:now});
 // Intentionally insert archive headers and rows in non-canonical physical order.
 for(const spec of [archiveSpecs[1],archiveSpecs[3],archiveSpecs[0],archiveSpecs[2]]){
   const income=0,expense=spec.tx.reduce((s,x)=>s+Number(x.amt||0),0),net=-expense;
   await db.runAsync(`INSERT INTO cold_archive_years VALUES (?,?,?,?,?,?,?,?,?,?)`,ns,spec.scope,spec.year,now,spec.checksum,spec.tx.length,income,expense,net,JSON.stringify(spec.metadata));
   for(const t of [...spec.tx].reverse()) await db.runAsync(`INSERT INTO cold_archive_transactions VALUES (?,?,?,?,?)`,ns,spec.scope,spec.year,t.id,JSON.stringify(t));
 }
 const archives=archiveSpecs.map(spec=>{const expense=spec.tx.reduce((s,x)=>s+Number(x.amt||0),0);return{year:spec.year,scope:spec.scope,checksum:spec.checksum,summary:{year:spec.year,scope:spec.scope,archivedAt:now,checksum:spec.checksum,count:spec.tx.length,income:0,expense,net:-expense},data:{...spec.metadata,trans:[...spec.tx].reverse()}}});
 const model={ledger:{ledgerId},workspace:{payloadJson:JSON.stringify({localPreferences:{cfg:{currency:'IQD',profileType:'personal',activeScope:'personal',theme:'dark'}}})},accounts,exchangeRates:[],transactions,postings,links,entities:[],archives:[archives[3],archives[0],archives[2],archives[1]]};
 const expected=semantic.semanticHashV3(model);

 db.queryLog.length=0;rowSourceCalls.length=0;
 const actualRowsBounded=await stream.semanticHashNamespaceV3Bounded({database:db,namespace:ns,ledgerId,maxRows:2,maxBytes:4096});
 assert.equal(actualRowsBounded,expected,'row-bounded stream must be byte-identical to accepted V3');
 const archiveTxQueries=db.queryLog.filter(q=>/FROM cold_archive_transactions/.test(q.sql));
 assert.ok(archiveTxQueries.length>=6,'multi-page archive transaction iteration expected with maxRows=2');
 assert.ok(archiveTxQueries.every(q=>/LIMIT \?/.test(q.sql)),'every archive transaction query must be SQL-bounded with LIMIT');
 assert.ok(archiveTxQueries.every(q=>Number(q.params.at(-1))===3),'LIMIT must be maxRows+1 for boundary detection');
 const headerPages=rowSourceCalls.filter(x=>x.section==='archiveHeaders');
 assert.ok(headerPages.length>=2,'archive headers must page through the bounded row source');
 assert.equal(headerPages[0].cursor,null);
 assert.ok(headerPages.slice(1).every(x=>x.cursor&&typeof x.cursor.scope==='string'&&Number.isSafeInteger(Number(x.cursor.year))),'archive header continuation must be a (scope,year) keyset cursor');
 console.log('[PASS] R1 archive headers and transactions are keyset row-bounded and V3-parity exact');

 db.queryLog.length=0;
 const actualBytesBounded=await stream.semanticHashNamespaceV3Bounded({database:db,namespace:ns,ledgerId,maxRows:10,maxBytes:90});
 assert.equal(actualBytesBounded,expected,'byte-bounded stream must be byte-identical to accepted V3');
 const bytePagedQueries=db.queryLog.filter(q=>/FROM cold_archive_transactions/.test(q.sql));
 const totalArchiveTx=archiveSpecs.reduce((s,x)=>s+x.tx.length,0);
 assert.ok(bytePagedQueries.length>=totalArchiveTx,'small byte budget should force one-row archive pages for this fixture');
 console.log('[PASS] R1 archive transactions honor maxBytes without changing canonical bytes');

 const originalRowSource=globalThis.__ROW_SOURCE__;
 let cursor=null,seenHeaders=[];do{const b=await originalRowSource({database:db,namespace:ns,section:'archiveHeaders',cursor,maxRows:2,maxBytes:4096});seenHeaders.push(...b.rows.map(x=>({scope:x.scope,year:x.year})));if(!b.hasMore)break;cursor=b.nextCursor;}while(true);
 assert.equal(seenHeaders.length,archiveSpecs.length);
 const expectedHeaderOrder=[...archiveSpecs].sort((a,b)=>{const scope=Buffer.compare(Buffer.from(a.scope),Buffer.from(b.scope));return scope||a.year-b.year;}).map(x=>({scope:x.scope,year:x.year}));
 assert.deepEqual(seenHeaders,expectedHeaderOrder);
 assert.ok(seenHeaders.some((x,i)=>i>0&&x.scope===seenHeaders[i-1].scope&&x.year>seenHeaders[i-1].year),'fixture must exercise numeric year ordering within one scope');
 console.log('[PASS] R1 archive header keyset order matches V3 storage order across scopes and years');

 const streamText=fs.readFileSync(streamFilename,'utf8');
 assert.ok(!streamText.includes('getAllAsync'),'semantic stream must not use getAllAsync');
 assert.equal((streamText.match(/getEachAsync\(/g)||[]).length,1,'only the bounded archive-transaction iterator may call getEachAsync directly');
 assert.ok(/FROM cold_archive_transactions[\s\S]*LIMIT \?/.test(streamText),'archive transaction SQL must include LIMIT');
 assert.ok(/section: 'archiveHeaders'/.test(streamText),'archive headers must use bounded canonical row source');
 console.log('[PASS] R1 static guard: no unbounded archive header iterator and no getAllAsync');

 const huge={id:'a1',blob:'x'.repeat(262200)};
 await db.runAsync(`UPDATE cold_archive_transactions SET payload_json=? WHERE namespace=? AND scope=? AND year=? AND id=?`,JSON.stringify(huge),ns,'équipe',2025,'a1');
 await assert.rejects(()=>stream.semanticHashNamespaceV3Bounded({database:db,namespace:ns,ledgerId,maxRows:2,maxBytes:4096}),/semantic_stream_archive_row_too_large/);
 console.log('[PASS] R1 oversized archive row fails closed without emitting raw payload');

 console.log('MYFI P10-013 B4A / BATCH B-R1 SEMANTIC STREAM V3: PASS');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.close());
