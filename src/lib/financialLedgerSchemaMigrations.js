// MYFI Phase 2: reusable, crash-aware SQLite schema migration infrastructure.
// Financial writes call ensureFinancialLedgerV7 before their own transaction,
// so no financial mutation can proceed while a required schema migration fails.
import { enqueueLedgerWrite } from './ledgerDatabase';

export const LEDGER_SCHEMA_MIGRATION_JOURNAL_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  migration_id TEXT PRIMARY KEY,
  from_version INTEGER NOT NULL CHECK(from_version >= 0),
  to_version INTEGER NOT NULL CHECK(to_version > from_version),
  checksum TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
  app_version TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK(attempt_count > 0),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_status
  ON schema_migrations(status, to_version, migration_id);
`;

const checksumText = value => {
  // FNV-1a is used as a deterministic change detector, not as a security primitive.
  // The migration signature includes the complete DDL/upgrade body supplied by the migration.
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const migrationChecksum = migration => checksumText([
  migration.migrationId,
  Number(migration.fromVersion),
  Number(migration.toVersion),
  String(migration.signature || ''),
].join('\n'));

const scalar = row => {
  if (!row || typeof row !== 'object') return null;
  const values = Object.values(row);
  return values.length ? values[0] : null;
};

const readUserVersion = async db => {
  const row = await db.getFirstAsync('PRAGMA user_version');
  return Number(scalar(row) || 0);
};

const setUserVersion = (db, version) => {
  const safeVersion = Math.max(0, Math.trunc(Number(version) || 0));
  return db.execAsync(`PRAGMA user_version = ${safeVersion};`);
};

const ensureJournal = db => db.execAsync(LEDGER_SCHEMA_MIGRATION_JOURNAL_SQL);

const normalizeMigration = migration => {
  const migrationId = String(migration?.migrationId || '').trim();
  const fromVersion = Math.trunc(Number(migration?.fromVersion));
  const toVersion = Math.trunc(Number(migration?.toVersion));
  if (!migrationId || !Number.isInteger(fromVersion) || !Number.isInteger(toVersion) || toVersion <= fromVersion) {
    throw new Error('financial_schema_migration_definition_invalid');
  }
  if (typeof migration.apply !== 'function') throw new Error('financial_schema_migration_apply_missing');
  return { ...migration, migrationId, fromVersion, toVersion };
};

export async function runLedgerSchemaMigrations({
  database,
  migrations,
  appVersion = 'unknown',
  healthCheck = null,
}) {
  if (!database) return { ok: false, supported: false, reason: 'database_unavailable' };
  const ordered = (migrations || []).map(normalizeMigration).sort((a, b) => (
    a.toVersion - b.toVersion || a.migrationId.localeCompare(b.migrationId)
  ));

  return enqueueLedgerWrite(async () => {
    const db = database;
    await ensureJournal(db);
    let currentVersion = await readUserVersion(db);
    const applied = [];

    for (const migration of ordered) {
      const checksum = migrationChecksum(migration);
      const existing = await db.getFirstAsync(
        `SELECT migration_id,from_version,to_version,checksum,status,attempt_count
           FROM schema_migrations WHERE migration_id=? LIMIT 1`,
        migration.migrationId,
      );

      if (existing?.checksum && existing.checksum !== checksum) {
        throw new Error(`financial_schema_migration_checksum_mismatch:${migration.migrationId}`);
      }

      if (existing?.status === 'completed') {
        if (currentVersion < migration.toVersion) {
          await setUserVersion(db, migration.toVersion);
          currentVersion = migration.toVersion;
        }
        applied.push({ migrationId: migration.migrationId, status: 'already-completed', checksum });
        continue;
      }

      if (currentVersion < migration.fromVersion) {
        throw new Error(`financial_schema_migration_gap:${currentVersion}->${migration.fromVersion}`);
      }

      const startedAt = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO schema_migrations
           (migration_id,from_version,to_version,checksum,started_at,completed_at,status,app_version,attempt_count,last_error)
         VALUES (?,?,?,?,?,NULL,'running',?,1,NULL)
         ON CONFLICT(migration_id) DO UPDATE SET
           from_version=excluded.from_version,
           to_version=excluded.to_version,
           checksum=excluded.checksum,
           started_at=excluded.started_at,
           completed_at=NULL,
           status='running',
           app_version=excluded.app_version,
           attempt_count=schema_migrations.attempt_count+1,
           last_error=NULL`,
        migration.migrationId,
        migration.fromVersion,
        migration.toVersion,
        checksum,
        startedAt,
        String(appVersion || 'unknown'),
      );

      try {
        await db.withTransactionAsync(async () => {
          await migration.apply(db);
          await setUserVersion(db, migration.toVersion);
        });
      } catch (error) {
        await db.runAsync(
          `UPDATE schema_migrations
              SET status='failed',completed_at=NULL,last_error=?
            WHERE migration_id=?`,
          String(error?.message || error || 'migration_failed').slice(0, 500),
          migration.migrationId,
        );
        throw error;
      }

      const completedAt = new Date().toISOString();
      await db.runAsync(
        `UPDATE schema_migrations
            SET status='completed',completed_at=?,last_error=NULL
          WHERE migration_id=? AND checksum=?`,
        completedAt,
        migration.migrationId,
        checksum,
      );
      currentVersion = migration.toVersion;
      applied.push({ migrationId: migration.migrationId, status: 'completed', checksum });
    }

    const health = typeof healthCheck === 'function' ? await healthCheck(db) : { ok: true };
    if (health?.ok === false) throw new Error('financial_schema_post_migration_health_failed');

    return {
      ok: true,
      supported: true,
      currentVersion,
      applied,
      health,
    };
  });
}

export async function readLedgerSchemaMigrationStatus(database) {
  if (!database) return { supported: false, currentVersion: 0, migrations: [] };
  await ensureJournal(database);
  const [currentVersion, migrations] = await Promise.all([
    readUserVersion(database),
    database.getAllAsync(
      `SELECT migration_id,from_version,to_version,checksum,started_at,completed_at,status,app_version,attempt_count,last_error
         FROM schema_migrations ORDER BY to_version,migration_id`,
    ),
  ]);
  return { supported: true, currentVersion, migrations };
}
