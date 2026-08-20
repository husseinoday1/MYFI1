// MYFI_FINANCIAL_CORE_PHASE1
// Shared native SQLite connection for MYFI financial-core repositories.
// Web keeps the existing local-vault path until SQLite web support is intentionally enabled.
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export const LEDGER_DB_NAME = 'myfi-ledger-v2.db';
let dbPromise = null;
let ledgerWriteQueue = Promise.resolve();
// Raised only while a runLedgerReadTransaction task is executing. See enqueueLedgerWrite.
let readTransactionDepth = 0;

// expo-sqlite exposes one native connection to all MYFI repositories. Every
// schema mutation and write transaction must share this queue; repository-local
// queues can overlap and cause nested BEGIN/ROLLBACK failures.
export const enqueueLedgerWrite = task => {
  // Inside a read transaction this call would wait on a queue slot that the very call
  // stack making the call already holds: a hang, not a failure. A hung export looks
  // like a frozen app and leaves nothing behind to diagnose, so say what happened
  // instead. The flag is raised only by runLedgerReadTransaction, so no existing write
  // path can reach this.
  if (readTransactionDepth > 0) {
    return Promise.reject(new Error('ledger_queue_reentrant_from_read_transaction'));
  }
  const queued = ledgerWriteQueue.then(task, task);
  ledgerWriteQueue = queued.catch(() => undefined);
  return queued;
};

export const flushLedgerWrites = () => ledgerWriteQueue.catch(() => undefined);

// P19-015A1: transaction scope only. Callers must already own the shared write queue.
// The callback result is captured explicitly because expo-sqlite's exclusive API
// resolves after commit and does not serve as MYFI's domain return-value channel.
export async function runLedgerExclusiveTransaction(database, task) {
  if (!database || typeof database.withExclusiveTransactionAsync !== 'function') {
    throw new Error('ledger_exclusive_transaction_unavailable');
  }
  if (typeof task !== 'function') throw new Error('ledger_exclusive_transaction_task_required');
  let result;
  await database.withExclusiveTransactionAsync(async txn => {
    result = await task(txn);
  });
  return result;
}

// P10-004: one consistent point-in-time read of the ledger.
//
// SELECTs issued back to back can capture a transaction from before a concurrent
// write and its postings from after it. The result is a torn snapshot that every
// checksum taken afterwards then certifies as correct, which is worse than no
// checksum at all. Financial truth has to be read at a single instant.
//
// This shares the write queue instead of running alongside writes. WAL gives a reader
// a stable snapshot only on its own connection, and MYFI deliberately has exactly one
// (see getLedgerDb) — opening a second BEGIN on it while a write transaction is live
// is the nested-transaction failure enqueueLedgerWrite exists to prevent. The cost is
// an export that waits its turn; the alternative is a backup that is quietly wrong.
//
// Deferred, not exclusive: never write through this. expo-sqlite passes no handle to
// withTransactionAsync, so the callback receives the same database object — anything
// it queries through that handle is inside the transaction, and anything reached by a
// different handle is not.
//
// Callers must warm every schema-readiness path (ensureFinancialLedgerV7,
// ensureColdArchiveSchema) BEFORE calling this. Those enqueue their own work and the
// queue is not reentrant; forgetting now rejects with
// ledger_queue_reentrant_from_read_transaction instead of hanging, which is the only
// reason that mistake is findable at all.
export async function runLedgerReadTransaction(database, task) {
  if (!database || typeof database.withTransactionAsync !== 'function') {
    throw new Error('ledger_read_transaction_unavailable');
  }
  if (typeof task !== 'function') throw new Error('ledger_read_transaction_task_required');
  return enqueueLedgerWrite(async () => {
    readTransactionDepth += 1;
    try {
      let result;
      await database.withTransactionAsync(async () => {
        result = await task(database);
      });
      return result;
    } finally {
      readTransactionDepth -= 1;
    }
  });
}

// P19-014A: diagnostics may inspect an already-open handle, but must never
// initialize the database or trigger schema/migration side effects themselves.
export const peekLedgerDb = () => dbPromise;

export async function getLedgerDb() {
  if (Platform.OS === 'web') return null;
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(LEDGER_DB_NAME);
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
      `);
      return db;
    })();
  }
  return dbPromise;
}

export async function closeLedgerDbForTests() {
  await flushLedgerWrites();
  const db = await dbPromise;
  dbPromise = null;
  try { await db?.closeAsync?.(); } catch {}
}
