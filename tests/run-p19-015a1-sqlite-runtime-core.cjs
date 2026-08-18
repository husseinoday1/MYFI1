const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/ledgerDatabase.js');
let source = fs.readFileSync(filename, 'utf8');
source = source
  .replace("import { Platform } from 'react-native';", "const Platform = { OS: 'android' };")
  .replace("import * as SQLite from 'expo-sqlite';", "const SQLite = {};")
  .replace(/export const /g, 'const ')
  .replace(/export async function /g, 'async function ');
source += `
module.exports = {
  enqueueLedgerWrite,
  flushLedgerWrites,
  runLedgerExclusiveTransaction,
};
`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const {
  enqueueLedgerWrite,
  flushLedgerWrites,
  runLedgerExclusiveTransaction,
} = compiled.exports;

(async () => {
  const events = [];
  const first = enqueueLedgerWrite(async () => {
    events.push('first:start');
    await new Promise(resolve => setTimeout(resolve, 20));
    events.push('first:end');
    return 'first';
  });
  const second = enqueueLedgerWrite(async () => {
    events.push('second:start');
    events.push('second:end');
    return 'second';
  });
  assert.deepEqual(await Promise.all([first, second]), ['first', 'second']);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end'],
    'shared ledger write queue must serialize writers');

  await assert.rejects(
    () => enqueueLedgerWrite(async () => { throw new Error('expected-writer-failure'); }),
    /expected-writer-failure/,
  );
  const afterFailure = await enqueueLedgerWrite(async () => 'queue-recovered');
  assert.equal(afterFailure, 'queue-recovered', 'write queue must remain usable after rejected writer');
  await flushLedgerWrites();

  const txn = { token: 'transaction-scoped-handle' };
  const database = {
    async withExclusiveTransactionAsync(callback) {
      events.push('exclusive:begin');
      await callback(txn);
      events.push('exclusive:commit');
    },
  };
  const result = await runLedgerExclusiveTransaction(database, async handle => {
    assert.equal(handle, txn, 'domain callback must receive the SDK transaction-scoped handle');
    events.push('exclusive:task');
    return { ok: true, value: 42 };
  });
  assert.deepEqual(result, { ok: true, value: 42 }, 'helper must preserve domain callback result');
  assert.deepEqual(events.slice(-3), ['exclusive:begin', 'exclusive:task', 'exclusive:commit']);

  await assert.rejects(
    () => runLedgerExclusiveTransaction({}, async () => true),
    /ledger_exclusive_transaction_unavailable/,
  );

  console.log('MYFI P19-015A1 SQLITE RUNTIME CORE: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
