// Phase 10 — Step 1: canonical backup read model.
//
// The Phase 10 research names this the most important gap: exportBackup() currently
// sources financial state from the Zustand store (dataSlice.js:341), and after the V7
// operational cutover that store is deliberately only a bounded UI/query cache. A
// backup built from it can silently omit whatever the cache did not hold.
//
// This module reads the complete financial graph from canonical SQLite instead. It is
// the source a Phase 10 backup will be built from; it does not build a backup, change
// a backup format, or touch restore.
//
// Impact
//   Financial data changed:   NO — every call here is a SELECT
//   SQLite schema changed:    NO
//   Migration required:       NO
//   Restore behaviour:        UNCHANGED — nothing in the restore path calls this yet
//
// Strictly read-only, deliberately. Note it uses readLedgerSyncIdentityV8 and NOT
// ensureLedgerSyncIdentityV8: the latter INSERTs an identity when none exists, and a
// backup read must never bring a ledger identity into being as a side effect of being
// inspected. A missing identity is reported, never invented.

import { ensureColdArchiveSchema, getColdArchiveNamespace, exportColdArchives } from './localArchiveRepository';
import { getLedgerDb, runLedgerReadTransaction } from './ledgerDatabase';
import {
  ensureFinancialLedgerV7,
  getFinancialWorkspaceStateV7,
  readFinancialProjectionV7,
  readLedgerSyncIdentityV8,
} from './financialLedgerV7Repository';

export const CANONICAL_BACKUP_SOURCE_VERSION = 1;

const rows = value => (Array.isArray(value) ? value : []);

const groupEntities = (entityRows) => {
  const grouped = {};
  for (const entity of rows(entityRows)) {
    const type = String(entity?.entityType || 'unknown');
    (grouped[type] || (grouped[type] = [])).push(entity);
  }
  return grouped;
};

const archivedTransactionCount = archives => rows(archives)
  .reduce((sum, item) => sum + rows(item?.data?.trans).length, 0);

/**
 * Read the complete canonical financial graph for one ledger namespace.
 *
 * Returns the raw canonical rows rather than a backup package: the semantic
 * projection and hashing contract are Step 2, and both must consume this same model
 * so source and target are never canonicalised differently. Comparing a raw source
 * representation against a persisted one without matching canonicalisation is the
 * defect that blocked cutover on 2026-08-20 over a single cfg.avatarUri field.
 *
 * @returns {Promise<object>} canonical read model, or a fail-closed reason.
 */
export const readCanonicalBackupSource = async ({
  namespace = 'guest', cfg = {}, database = null,
} = {}) => {
  const ledgerNamespace = String(namespace || '').trim();
  if (!ledgerNamespace) {
    return { supported: true, ok: false, reason: 'canonical_backup_namespace_required' };
  }

  // Cold archives live in the same database, which is what makes a single atomic
  // promotion possible later (Step 5). They are part of financial truth, so a backup
  // that omits them is incomplete.
  //
  // A supplied database is deliberately not supported yet: the restore stage has not
  // defined its stage namespace contract. Keep that boundary fail-closed rather than
  // mixing staged ledger rows with live namespaces by accident.
  //
  // P10-004 moved this ahead of the reads: it depends only on the argument, so there
  // is no reason to open a snapshot and read the whole ledger before refusing it.
  if (database) {
    return {
      supported: true,
      ok: false,
      reason: 'canonical_backup_isolated_database_unsupported',
      detail: "restore-stage canonical reads are not implemented yet; "
        + "the live backup reader only accepts the canonical ledger connection.",
    };
  }

  const db = await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };

  const archiveNamespace = getColdArchiveNamespace(ledgerNamespace, cfg);

  // Both of these enqueue their own DDL on the shared write queue, and the queue is
  // not reentrant — reaching either from inside the read transaction below would
  // deadlock rather than fail. Warm them first; both are memoised, so this is free
  // once the ledger has been opened.
  await ensureFinancialLedgerV7(db);
  await ensureColdArchiveSchema();

  // P10-004: one snapshot, not six SELECTs with gaps between them. Read the ledger
  // and its archives one after another and a concurrent write lands in the middle —
  // a transaction taken from before it, its postings from after — and every checksum
  // computed later certifies that torn pair as sound. The research names this the
  // consistent-read requirement; it is what makes the semantic hash mean anything.
  //
  // The transaction callback supplies an exclusive, transaction-scoped executor.
  // Every reader below receives it explicitly; using the ambient connection for even
  // one archive query would defeat the point-in-time guarantee.
  const snapshot = await runLedgerReadTransaction(db, async (executor) => ({
    projection: await readFinancialProjectionV7({
      namespace: ledgerNamespace, database: executor, schemaReady: true,
    }),
    identity: await readLedgerSyncIdentityV8({
      namespace: ledgerNamespace, database: executor, schemaReady: true,
    }),
    workspaceState: await getFinancialWorkspaceStateV7({
      namespace: ledgerNamespace, database: executor, schemaReady: true,
    }),
    archives: await exportColdArchives(archiveNamespace, { database: executor }),
  }));

  const { projection, identity, workspaceState, archives } = snapshot;
  if (!projection) {
    return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  }
  const transactions = rows(projection.transactions);
  const entities = groupEntities(projection.entities);

  const counts = {
    transactions: transactions.length,
    activeTransactions: transactions.filter(item => !item.deletedAt && !item.archivedAt).length,
    archivedTransactions: transactions.filter(item => item.archivedAt).length,
    deletedTransactions: transactions.filter(item => item.deletedAt).length,
    postings: rows(projection.postings).length,
    links: rows(projection.links).length,
    accounts: rows(projection.accounts).length,
    exchangeRates: rows(projection.exchangeRates).length,
    entities: rows(projection.entities).length,
    wallets: rows(entities.wallet).length,
    debts: rows(entities.debt).length,
    goals: rows(entities.goal).length,
    commitments: rows(entities.commitment).length,
    categories: rows(entities.category).length,
    budgets: rows(entities.budget).length,
    recurringRules: rows(entities.recurring_rule).length,
    coldArchiveBundles: rows(archives).length,
    coldArchiveTransactions: archivedTransactionCount(archives),
  };

  return {
    supported: true,
    ok: true,
    sourceVersion: CANONICAL_BACKUP_SOURCE_VERSION,
    // States plainly where this came from. A backup built from the UI cache and one
    // built from canonical SQLite are not interchangeable, and the package should be
    // able to say which it is.
    source: 'canonical_sqlite',
    namespace: ledgerNamespace,

    // Identity provenance. Absent identity is reported, not created — see the note at
    // the top of this file.
    ledger: identity ? {
      ledgerId: identity.ledgerId,
      restoreEpoch: identity.restoreEpoch,
      protocolVersion: identity.protocolVersion,
      minimumSupportedVersion: identity.minimumSupportedVersion,
    } : null,
    ledgerIdentityPresent: !!identity,

    workspace: workspaceState ? {
      sourceMode: workspaceState.source_mode || null,
      schemaVersion: workspaceState.schema_version ?? null,
      shadowChecksum: workspaceState.shadow_checksum || null,
      cutoverAt: workspaceState.cutover_at || null,
      // SELECT * returns this column as stored: a JSON string, not an object.
      // Naming it `payload` would invite Step 2 to hash a string on one side and a
      // parsed object on the other.
      payloadJson: workspaceState.payload_json || null,
    } : null,
    // False means SQLite is not yet the authoritative source for this namespace, so a
    // backup taken now would not represent a cut-over ledger.
    cutoverComplete: String(workspaceState?.source_mode || '') === 'sqlite',

    accounts: rows(projection.accounts),
    exchangeRates: rows(projection.exchangeRates),
    transactions,
    postings: rows(projection.postings),
    links: rows(projection.links),
    entities,
    archives: rows(archives),

    counts,
  };
};
