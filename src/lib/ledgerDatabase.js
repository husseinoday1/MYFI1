// MYFI_FINANCIAL_CORE_PHASE1
// Shared native SQLite connection for MYFI financial-core repositories.
// Web keeps the existing local-vault path until SQLite web support is intentionally enabled.
import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export const LEDGER_DB_NAME = 'myfi-ledger-v2.db';
let dbPromise = null;
let ledgerWriteQueue = Promise.resolve();

// expo-sqlite exposes one native connection to all MYFI repositories. Every
// schema mutation and write transaction must share this queue; repository-local
// queues can overlap and cause nested BEGIN/ROLLBACK failures.
export const enqueueLedgerWrite = task => {
  const queued = ledgerWriteQueue.then(task, task);
  ledgerWriteQueue = queued.catch(() => undefined);
  return queued;
};

export const flushLedgerWrites = () => ledgerWriteQueue.catch(() => undefined);

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
