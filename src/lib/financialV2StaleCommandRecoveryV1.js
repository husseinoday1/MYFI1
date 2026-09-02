// Phase 12 — the narrow repair for the one V2 conflict that actually happens:
// a single stale workspace command, holding setup metadata only, that the cloud
// has already moved past and will never accept.
//
// The existing prepare/promote path answers this by downloading a full cloud
// bootstrap and replacing the local ledger with it. That is the right shape for
// an empty device restoring a ledger from nothing, and the wrong shape here: the
// bootstrap is a snapshot frozen at the moment it was taken, so replacing a live
// device with it discards everything both sides did since. This path replaces
// nothing. It removes the one command that blocks the queue and lets ordinary
// V2 sync bring the device forward through the path that is already proven.
//
// The cloud revision it needs to prove staleness arrives free, inside the very
// conflict that triggers the repair -- so nothing is downloaded to obtain it.
import { getLedgerDb } from './ledgerDatabase';
import { runFinancialRestorePromotionTransactionV8 } from './financialLedgerV7Repository';
import { staleWorkspaceCommand } from './financialV2ConflictRecoveryV1';

const text = value => String(value ?? '').trim();
const discardKey = namespace => `financial_v2_stale_workspace_discard_v1:${text(namespace)}`;
const failure = (reason, extra = {}) => ({
  supported: true, ok: false, reason: text(reason) || 'financial_v2_stale_command_repair_failed', ...extra,
});

// A repair that removes more than a handful of commands is not the narrow case
// this path was reasoned about; it stops for review instead of widening itself.
const MAX_STALE_COMMANDS = 8;

// Every table this path must leave exactly as it found it.
const FINANCIAL_TABLES = [
  'ledger_accounts_v7', 'ledger_exchange_rates_v7', 'ledger_financial_transactions_v7',
  'ledger_postings_v7', 'ledger_transaction_links_v7',
];

const financialCounts = async (db, namespace) => {
  const entries = await Promise.all(FINANCIAL_TABLES.map(async table => {
    const row = await db.getFirstAsync(`SELECT COUNT(*) AS n FROM ${table} WHERE namespace=?`, namespace);
    return [table, Math.max(0, Number(row?.n || 0))];
  }));
  return Object.fromEntries(entries);
};

const sameCounts = (left, right) => FINANCIAL_TABLES.every(table => Number(left?.[table]) === Number(right?.[table]));

/**
 * The cloud's own answer to "where is this entity now", taken from the conflict
 * the server returned. Only a workspace conflict qualifies: any other entity
 * means the device is behind on real data, which this path must not touch.
 */
export const cloudWorkspaceRevisionFromConflictsV1 = (conflicts = []) => {
  const rows = Array.isArray(conflicts) ? conflicts : [];
  if (!rows.length) return 0;
  const revisions = rows.map(row => {
    const entityId = text(row?.entityId ?? row?.entity_id);
    const entityType = text(row?.entityType ?? row?.entity_type);
    if (entityId !== 'workspace' || (entityType && entityType !== 'workspace')) return 0;
    const current = Number(row?.currentRevision ?? row?.current_revision);
    return Number.isSafeInteger(current) && current > 0 ? current : 0;
  });
  // One non-workspace conflict is enough to disqualify the whole repair.
  return revisions.every(value => value > 0) ? Math.max(...revisions) : 0;
};

const readCandidate = async ({ db, namespace, cloudWorkspaceRevision }) => {
  const target = text(namespace);
  const [identity, sync, workspace] = await Promise.all([
    db.getFirstAsync(`SELECT namespace,ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target),
    db.getFirstAsync(`SELECT activated_at FROM ledger_sync_state_v8 WHERE ledger_id=(
        SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1
      ) AND restore_epoch=(
        SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1
      ) LIMIT 1`, target, target),
    db.getFirstAsync(`SELECT 1 AS present FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, target),
  ]);
  if (!identity?.ledger_id || !sync?.activated_at || !workspace?.present) {
    throw new Error('financial_v2_stale_command_repair_protocol_not_active');
  }
  if (!Number.isSafeInteger(cloudWorkspaceRevision) || cloudWorkspaceRevision < 1) {
    throw new Error('financial_v2_stale_command_repair_cloud_revision_unknown');
  }
  const pending = await db.getAllAsync(
    `SELECT sequence_id,mutation_id,command_id,namespace,ledger_id,restore_epoch,entity_type,entity_id,
            operation,revision,base_revision,payload_json,created_at
       FROM ledger_outbox_v3
      WHERE namespace=? AND ledger_id=? AND restore_epoch=?
        AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL
      ORDER BY sequence_id`,
    target, text(identity.ledger_id), Number(identity.restore_epoch),
  );
  if (!pending.length) throw new Error('financial_v2_stale_command_repair_nothing_pending');
  if (pending.length > MAX_STALE_COMMANDS) throw new Error('financial_v2_stale_command_repair_too_many_pending');
  // The whole safety argument: every queued command must be provably behind the
  // cloud and carry setup metadata only. One row that fails leaves everything.
  if (!pending.every(row => staleWorkspaceCommand(row, cloudWorkspaceRevision))) {
    throw new Error('financial_v2_stale_command_repair_pending_not_stale');
  }
  return {
    ledgerId: text(identity.ledger_id),
    restoreEpoch: Number(identity.restore_epoch),
    cloudWorkspaceRevision,
    commands: pending.map(row => ({
      sequenceId: Number(row.sequence_id), mutationId: text(row.mutation_id), commandId: text(row.command_id),
      entityType: text(row.entity_type), entityId: text(row.entity_id), operation: text(row.operation),
      revision: Number(row.revision), baseRevision: Number(row.base_revision),
      payloadJson: text(row.payload_json), createdAt: text(row.created_at),
    })),
  };
};

/**
 * Read-only eligibility. Nothing is downloaded, staged or written: this only
 * answers whether the narrow repair applies, so a caller can choose between it
 * and the full cloud-replacement path.
 */
export const inspectStaleWorkspaceConflictV1 = async ({
  namespace = 'guest', accountId, cloudWorkspaceRevision = 0, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!target || !owner) return failure('financial_v2_stale_command_repair_input_invalid');
  try {
    const candidate = await readCandidate({ db, namespace: target, cloudWorkspaceRevision: Number(cloudWorkspaceRevision) });
    return { supported: true, ok: true, eligible: true, ...candidate };
  } catch (error) {
    return failure(error?.message, { eligible: false });
  }
};

/**
 * Removes the proven-stale commands and nothing else. The inspection is redone
 * inside the transaction rather than trusted from an earlier read, and the
 * financial tables are counted on both sides of the delete so "this path never
 * touches financial data" is enforced here rather than asserted in a comment.
 *
 * The local setup change in those commands is deliberately lost -- the cloud's
 * newer version replaces it on the next ordinary sync. That is the point of the
 * repair, and the caller must say so plainly before asking for confirmation.
 */
export const discardStaleWorkspaceCommandsV1 = async ({
  namespace = 'guest', accountId, cloudWorkspaceRevision = 0, confirmed = false, database = null,
} = {}) => {
  const target = text(namespace);
  const owner = text(accountId);
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  if (!target || !owner) return failure('financial_v2_stale_command_repair_input_invalid');
  if (confirmed !== true) return failure('financial_v2_stale_command_repair_confirmation_required');

  try {
    return await runFinancialRestorePromotionTransactionV8({ database: db, task: async actions => {
      const txn = actions.database;
      const candidate = await readCandidate({
        db: txn, namespace: target, cloudWorkspaceRevision: Number(cloudWorkspaceRevision),
      });
      const before = await financialCounts(txn, target);

      const now = new Date().toISOString();
      const receipt = {
        version: 1, namespace: target, accountId: owner,
        ledgerId: candidate.ledgerId, restoreEpoch: candidate.restoreEpoch,
        cloudWorkspaceRevision: candidate.cloudWorkspaceRevision,
        discardedCommands: candidate.commands, discardedAt: now,
      };
      // Evidence first: the record of what was removed must not depend on the
      // removal succeeding.
      await txn.runAsync(
        `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
        discardKey(target), JSON.stringify(receipt), now,
      );
      for (const command of candidate.commands) {
        const deleted = await txn.runAsync(
          `DELETE FROM ledger_outbox_v3
            WHERE ledger_id=? AND restore_epoch=? AND sequence_id=? AND acknowledged_at IS NULL`,
          candidate.ledgerId, candidate.restoreEpoch, command.sequenceId,
        );
        if (Number(deleted?.changes || 0) !== 1) throw new Error('financial_v2_stale_command_repair_delete_failed');
      }
      const remaining = await txn.getFirstAsync(
        `SELECT COUNT(*) AS n FROM ledger_outbox_v3
          WHERE ledger_id=? AND restore_epoch=? AND acknowledged_at IS NULL AND superseded_by_bootstrap_id IS NULL`,
        candidate.ledgerId, candidate.restoreEpoch,
      );
      if (Number(remaining?.n || 0) !== 0) throw new Error('financial_v2_stale_command_repair_queue_not_empty');

      const after = await financialCounts(txn, target);
      if (!sameCounts(before, after)) throw new Error('financial_v2_stale_command_repair_financial_data_changed');
      const foreignKeys = await txn.getAllAsync('PRAGMA foreign_key_check');
      if (foreignKeys.length) throw new Error('financial_v2_stale_command_repair_foreign_key_failed');
      const quick = await txn.getFirstAsync('PRAGMA quick_check');
      if (String(quick ? Object.values(quick)[0] : '').toLowerCase() !== 'ok') {
        throw new Error('financial_v2_stale_command_repair_quick_check_failed');
      }
      return {
        supported: true, ok: true, namespace: target,
        ledgerId: candidate.ledgerId, restoreEpoch: candidate.restoreEpoch,
        cloudWorkspaceRevision: candidate.cloudWorkspaceRevision,
        discarded: candidate.commands.length,
        discardedCommands: candidate.commands.map(command => ({
          sequenceId: command.sequenceId, mutationId: command.mutationId,
          revision: command.revision, baseRevision: command.baseRevision,
        })),
      };
    }});
  } catch (error) {
    return failure(error?.message);
  }
};
