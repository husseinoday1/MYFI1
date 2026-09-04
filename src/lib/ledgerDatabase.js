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

// P10-014A-001-R5: diagnostic-only database redirection.
// Production/default builds cannot activate this path because the build flag is absent.
// The clone probe uses it only after a consistent SQLite backup of the original database
// has been created and the original connection has been closed.
const P10_014A_CLONE_PROBE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1';
let p10CloneDiagnosticDb = null;

export const setP10CloneLedgerDbOverride = database => {
  if (!P10_014A_CLONE_PROBE_FLAG) throw new Error('p10_clone_database_override_disabled');
  if (!database?.getFirstAsync || !database?.runAsync || !database?.withExclusiveTransactionAsync) {
    throw new Error('p10_clone_database_override_invalid');
  }
  if (p10CloneDiagnosticDb && p10CloneDiagnosticDb !== database) {
    throw new Error('p10_clone_database_override_conflict');
  }
  p10CloneDiagnosticDb = database;
  return true;
};

export const clearP10CloneLedgerDbOverride = database => {
  if (!P10_014A_CLONE_PROBE_FLAG) throw new Error('p10_clone_database_override_disabled');
  if (p10CloneDiagnosticDb && database && p10CloneDiagnosticDb !== database) {
    throw new Error('p10_clone_database_override_clear_mismatch');
  }
  p10CloneDiagnosticDb = null;
  return true;
};

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
// This must be exclusive. Expo documents that withTransactionAsync is not exclusive:
// unrelated async queries may enter that transaction. A financial backup must not
// certify a graph assembled around an unrelated write. withExclusiveTransactionAsync
// supplies a transaction-scoped handle; every query in `task` has to use that handle.
//
// Callers must warm every schema-readiness path (ensureFinancialLedgerV7,
// ensureColdArchiveSchema) BEFORE calling this. Those enqueue their own work and the
// queue is not reentrant; forgetting now rejects with
// ledger_queue_reentrant_from_read_transaction instead of hanging, which is the only
// reason that mistake is findable at all.
export async function runLedgerReadTransaction(database, task) {
  if (!database || typeof database.withExclusiveTransactionAsync !== 'function') {
    throw new Error('ledger_read_transaction_unavailable');
  }
  if (typeof task !== 'function') throw new Error('ledger_read_transaction_task_required');
  return enqueueLedgerWrite(async () => {
    readTransactionDepth += 1;
    try {
      // Keep the reentrancy guard raised until COMMIT/ROLLBACK finishes. Returning
      // the promise without awaiting would enter `finally` immediately and allow a
      // nested queue write during the still-open snapshot.
      return await runLedgerExclusiveTransaction(database, task);
    } finally {
      readTransactionDepth -= 1;
    }
  });
}

// P19-014A: diagnostics may inspect an already-open handle, but must never
// initialize the database or trigger schema/migration side effects themselves.
export const peekLedgerDb = () => (
  p10CloneDiagnosticDb ? Promise.resolve(p10CloneDiagnosticDb) : dbPromise
);

export async function getLedgerDb() {
  if (Platform.OS === 'web') return null;
  if (p10CloneDiagnosticDb) return p10CloneDiagnosticDb;
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(LEDGER_DB_NAME);
      // §102: every operational pragma for this connection is set HERE and only
      // here, so the setting is a property of the connection rather than of
      // whichever module happened to touch the database first.
      //
      // synchronous = NORMAL was previously set inside activeLedgerRepository's
      // schema bootstrap, which meant the financial ledger ran at NORMAL or at
      // the SQLite default FULL depending on whether that bootstrap had run yet
      // in this process — a durability guarantee that varied by call order. It
      // is pinned here instead. Reason + benchmark + crash-safety evidence:
      // docs/04_CURRENT_EVIDENCE/MYFI_PHASE15_SQLITE_CONFIG_AUDIT_2026-09-04.md.
      // Short version: with WAL, NORMAL still survives an app/process crash; it
      // trades only the last commits against an OS crash or power loss, and
      // measured 41x faster than FULL on the per-command commit path that every
      // add/edit/delete uses.
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        PRAGMA foreign_keys = ON;
        PRAGMA busy_timeout = 5000;
        PRAGMA synchronous = NORMAL;
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
