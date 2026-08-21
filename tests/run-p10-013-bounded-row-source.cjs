const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialCanonicalRowSourceV3.js');
let source = fs.readFileSync(filename, 'utf8').replace(/export const /g, 'const ');
source += '\nmodule.exports = { CANONICAL_ROW_SOURCE_V3_SECTIONS, CANONICAL_ROW_SOURCE_V3_BATCH_POLICY, readCanonicalRowBatchV3 };';
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);
const { CANONICAL_ROW_SOURCE_V3_SECTIONS, readCanonicalRowBatchV3 } = compiled.exports;

class AsyncSqlite {
  constructor() { this.native = new DatabaseSync(':memory:'); this.iteratorCalls = 0; }
  async execAsync(sql) { this.native.exec(sql); }
  async getFirstAsync(sql, ...params) { return this.native.prepare(sql).get(...params.flat()) || null; }
  getEachAsync(sql, ...params) {
    this.iteratorCalls += 1;
    const rows = this.native.prepare(sql).all(...params.flat());
    return (async function* each() { for (const row of rows) yield row; })();
  }
  close() { this.native.close(); }
}

const namespace = 'workspace:p10-013';
const db = new AsyncSqlite();

(async () => {
  try {
    await db.execAsync(`
      CREATE TABLE ledger_workspace_state_v7(namespace TEXT PRIMARY KEY,source_mode TEXT,schema_version INTEGER,payload_json TEXT,updated_at TEXT);
      CREATE TABLE ledger_accounts_v7(namespace TEXT,id TEXT,name TEXT,account_type TEXT,scope TEXT,currency_code TEXT,status TEXT,created_at TEXT,updated_at TEXT,archived_at TEXT,PRIMARY KEY(namespace,id));
      CREATE TABLE ledger_exchange_rates_v7(namespace TEXT,id TEXT,base_currency_code TEXT,quote_currency_code TEXT,numerator INTEGER,denominator INTEGER,rate_date TEXT,source TEXT,captured_at TEXT,PRIMARY KEY(namespace,id));
      CREATE TABLE ledger_financial_transactions_v7(namespace TEXT,id TEXT,kind TEXT,status TEXT,scope TEXT,date_iso TEXT,occurred_at TEXT,category_id TEXT,title TEXT,note TEXT,source_type TEXT,source_id TEXT,idempotency_key TEXT,device_id TEXT,revision INTEGER,archive_year INTEGER,archived_at TEXT,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(namespace,id));
      CREATE TABLE ledger_postings_v7(namespace TEXT,id TEXT,transaction_id TEXT,account_id TEXT,bucket TEXT,role TEXT,amount_minor INTEGER,currency_code TEXT,exchange_rate_id TEXT,created_at TEXT,PRIMARY KEY(namespace,id));
      CREATE TABLE ledger_transaction_links_v7(namespace TEXT,id TEXT,transaction_id TEXT,link_type TEXT,link_id TEXT,relation TEXT,applied_amount_minor INTEGER,currency_code TEXT,created_at TEXT,PRIMARY KEY(namespace,id));
      CREATE TABLE ledger_entities_v7(namespace TEXT,entity_type TEXT,id TEXT,revision INTEGER,deleted_at TEXT,payload_json TEXT,created_at TEXT,updated_at TEXT,PRIMARY KEY(namespace,entity_type,id));
      CREATE TABLE cold_archive_years(namespace TEXT,scope TEXT,year INTEGER,archived_at TEXT,checksum TEXT,transaction_count INTEGER,income REAL,expense REAL,net REAL,metadata_json TEXT,PRIMARY KEY(namespace,scope,year));
      CREATE TABLE cold_archive_transactions(namespace TEXT,scope TEXT,year INTEGER,id TEXT,payload_json TEXT,PRIMARY KEY(namespace,scope,year,id));
    `);
    await db.getFirstAsync('SELECT 1');
    const now = '2026-08-21T00:00:00.000Z';
    await db.native.prepare('INSERT INTO ledger_workspace_state_v7 VALUES (?,?,?,?,?)').run(namespace, 'sqlite', 7, JSON.stringify({ localPreferences: { cfg: { currency: 'IQD' } } }), now);
    for (const id of ['ä', 'z', 'أ', 'a']) {
      db.native.prepare('INSERT INTO ledger_accounts_v7 VALUES (?,?,?,?,?,?,?,?,?,?)').run(namespace, id, id, 'wallet', 'personal', 'IQD', 'active', now, now, null);
    }
    for (const id of ['t-03', 't-01', 't-02']) {
      db.native.prepare('INSERT INTO ledger_financial_transactions_v7 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(namespace, id, 'expense', 'posted', 'personal', '2026-08-21', now, null, id, null, 'manual', null, `key-${id}`, 'device', 1, null, null, null, JSON.stringify({ id, amt: -1 }), now, now);
    }
    db.native.prepare('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'wallet', 'b', 1, null, '{}', now, now);
    db.native.prepare('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'goal', 'a', 1, null, '{}', now, now);
    db.native.prepare('INSERT INTO ledger_entities_v7 VALUES (?,?,?,?,?,?,?,?)').run(namespace, 'wallet', 'a', 1, null, '{}', now, now);
    db.native.prepare('INSERT INTO cold_archive_years VALUES (?,?,?,?,?,?,?,?,?,?)').run(namespace, 'personal', 2025, now, 'a', 1, 0, 1, -1, '{}');
    db.native.prepare('INSERT INTO cold_archive_years VALUES (?,?,?,?,?,?,?,?,?,?)').run(namespace, 'business', 2024, now, 'b', 1, 0, 1, -1, '{}');
    for (const [scope, year, id] of [['personal', 2025, 'r-02'], ['personal', 2025, 'r-01'], ['business', 2024, 'r-01']]) {
      db.native.prepare('INSERT INTO cold_archive_transactions VALUES (?,?,?,?,?)').run(namespace, scope, year, id, JSON.stringify({ id, amt: -1 }));
    }

    assert.deepEqual(CANONICAL_ROW_SOURCE_V3_SECTIONS, [
      'financialConfig', 'accounts', 'exchangeRates', 'transactions', 'postings', 'links', 'entities', 'archiveHeaders', 'archiveRecords',
    ]);
    const firstAccounts = await readCanonicalRowBatchV3({ database: db, namespace, section: 'accounts', maxRows: 2, maxBytes: 64 * 1024 });
    assert.equal(firstAccounts.ok, true); assert.equal(firstAccounts.hasMore, true);
    assert.deepEqual(firstAccounts.rows.map(row => row.id), ['a', 'z']);
    const secondAccounts = await readCanonicalRowBatchV3({ database: db, namespace, section: 'accounts', cursor: firstAccounts.nextCursor, maxRows: 2, maxBytes: 64 * 1024 });
    assert.equal(secondAccounts.ok, true); assert.deepEqual(secondAccounts.rows.map(row => row.id), ['ä', 'أ']);
    assert.equal(secondAccounts.hasMore, false);
    assert.equal(new Set([...firstAccounts.rows, ...secondAccounts.rows].map(row => row.id)).size, 4, 'keyset pages must neither repeat nor omit rows');

    const byteBounded = await readCanonicalRowBatchV3({ database: db, namespace, section: 'transactions', maxRows: 8, maxBytes: 1 });
    assert.equal(byteBounded.ok, true); assert.equal(byteBounded.rows.length, 1, 'one valid row may travel alone when it exceeds the target batch budget');
    assert.equal(byteBounded.hasMore, true);
    assert.equal((await readCanonicalRowBatchV3({ database: db, namespace, section: 'transactions', cursor: { broken: true } })).reason, 'canonical_row_source_cursor_invalid');

    const entities = await readCanonicalRowBatchV3({ database: db, namespace, section: 'entities', maxRows: 8, maxBytes: 64 * 1024 });
    assert.deepEqual(entities.rows.map(row => `${row.entityType}:${row.id}`), ['goal:a', 'wallet:a', 'wallet:b']);
    const headers = await readCanonicalRowBatchV3({ database: db, namespace, section: 'archiveHeaders', maxRows: 8, maxBytes: 64 * 1024 });
    assert.deepEqual(headers.rows.map(row => `${row.year}:${row.scope}`), ['2024:business', '2025:personal']);
    const records = await readCanonicalRowBatchV3({ database: db, namespace, section: 'archiveRecords', maxRows: 2, maxBytes: 64 * 1024 });
    assert.equal(records.hasMore, true); assert.deepEqual(records.rows.map(row => `${row.scope}:${row.year}:${row.id}`), ['business:2024:r-01', 'personal:2025:r-01']);

    const config = await readCanonicalRowBatchV3({ database: db, namespace, section: 'financialConfig' });
    assert.equal(config.ok, true); assert.equal(config.rows.length, 1); assert.equal(config.rows[0].sourceMode, 'sqlite');
    assert.ok(db.iteratorCalls >= 6, 'every multi-row section must use the iterator path');
    const sourceText = fs.readFileSync(filename, 'utf8');
    assert.equal(sourceText.includes('getAllAsync'), false, 'bounded source must not materialize a whole query result');
    assert.ok(sourceText.includes('getEachAsync'), 'bounded source must use Expo SQLite iteration');
    console.log('MYFI P10-013 BOUNDED CANONICAL ROW SOURCE: PASS');
  } finally {
    db.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
