// Phase 10 Step 11 — post-commit canonical reload and crash recovery.
//
// This module deliberately has no import/export UI, Zustand, maintenance or sync
// wiring. It verifies the committed SQLite ledger, lets a later bounded-cache adapter
// reload from that verified source, then records the durable reconciliation-required
// state. A process death anywhere before that record leaves the prior pending state,
// which is safe to retry from canonical SQLite on next launch.

import { readCanonicalBackupSource } from './financialBackupV2';
import {
  canonicalizeFinancialLedgerV2,
  semanticHashCanonicalV2,
} from './financialSemanticProjection';
import {
  CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS,
  canonicalBackupV11ManifestCounts,
} from './financialBackupV11';
import {
  ensureFinancialLedgerV7,
} from './financialLedgerV7Repository';
import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction } from './ledgerDatabase';

const PROMOTION_META_PREFIX = 'canonical_restore_promotion_v11:';
const RECOVERY_STATES = new Set([
  'local_promoted_pending_reload',
  'local_reloaded_reconciliation_required',
]);

const text = value => String(value ?? '');
const nonBlank = value => text(value).trim().length > 0;
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const promotionMetaKey = namespace => `${PROMOTION_META_PREFIX}${text(namespace).trim()}`;
const validHash = value => /^[a-f0-9]{64}$/i.test(text(value));
const validCounts = value => isObject(value)
  && Object.keys(value).length === CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS.length
  && CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS.every(key => (
    Object.prototype.hasOwnProperty.call(value, key)
    && Number.isSafeInteger(Number(value[key]))
    && Number(value[key]) >= 0
  ));
const sameCounts = (left, right) => {
  const leftKeys = Object.keys(left || {}).sort();
  const rightKeys = Object.keys(right || {}).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && Number(left[key]) === Number(right[key]));
};
const parseObject = value => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const safeJson = value => {
  try { return JSON.stringify(value); } catch { throw new Error('canonical_restore_reload_state_invalid'); }
};
const failure = reason => ({ supported: true, ok: false, reason });
const fault = async (injector, boundary) => {
  if (typeof injector === 'function') await injector(boundary);
};

const validRestoreState = (state, namespace) => (
  isObject(state)
  && RECOVERY_STATES.has(text(state.status))
  && text(state.namespace) === namespace
  && nonBlank(state.ledgerId)
  && Number.isInteger(Number(state.fromEpoch)) && Number(state.fromEpoch) >= 1
  && Number.isInteger(Number(state.toEpoch)) && Number(state.toEpoch) === Number(state.fromEpoch) + 1
  && validHash(state.semanticHash)
  && validCounts(state.counts)
);

const readRestoreState = async (database, namespace) => {
  const row = await database.getFirstAsync(
    `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, promotionMetaKey(namespace),
  );
  return parseObject(row?.value);
};

/** Read the durable local-recovery signal without reading financial payloads. */
export const readCanonicalRestoreRecoveryStateV11 = async ({ namespace, database = null } = {}) => {
  const target = text(namespace).trim();
  if (!target) return failure('canonical_restore_reload_namespace_invalid');
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  try {
    const state = await readRestoreState(db, target);
    if (!state) return { supported: true, ok: true, pending: false, recovery: null };
    if (!validRestoreState(state, target)) return failure('canonical_restore_reload_state_invalid');
    return {
      supported: true,
      ok: true,
      pending: true,
      recovery: {
        status: text(state.status),
        namespace: target,
        ledgerId: text(state.ledgerId),
        restoreEpoch: Number(state.toEpoch),
        reconciliationRequired: true,
      },
    };
  } catch (error) {
    return failure(text(error?.message).trim() || 'canonical_restore_reload_state_read_failed');
  }
};

/**
 * Re-read canonical SQLite after a committed restore, call a supplied bounded-cache
 * adapter, then durably mark the local ledger as reloaded/reconciliation-required.
 * No sync begins here. `reload` is injected so P10-011 remains isolated from Zustand.
 */
export const recoverCanonicalRestoreAfterCommitV11 = async ({
  namespace,
  reload,
  database = null,
  faultInjector = null,
} = {}) => {
  const target = text(namespace).trim();
  if (!target) return failure('canonical_restore_reload_namespace_invalid');
  if (typeof reload !== 'function') return failure('canonical_restore_reload_callback_required');
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };

  try {
    await ensureFinancialLedgerV7(db);
    const beforeReload = await readRestoreState(db, target);
    if (!beforeReload) return failure('canonical_restore_reload_state_missing');
    if (!validRestoreState(beforeReload, target)) return failure('canonical_restore_reload_state_invalid');

    // This is a fresh, transaction-consistent canonical SQLite read, not a Zustand
    // cache or a compatibility snapshot. It is intentionally repeated after a crash.
    const source = await readCanonicalBackupSource({ namespace: target });
    if (!source?.ok || !source.cutoverComplete || !source.ledgerIdentityPresent) {
      return failure(source?.reason || 'canonical_restore_reload_source_invalid');
    }
    const canonical = canonicalizeFinancialLedgerV2(source);
    const actualHash = semanticHashCanonicalV2(canonical);
    const actualCounts = canonicalBackupV11ManifestCounts(canonical);
    if (text(source?.ledger?.ledgerId) !== text(beforeReload.ledgerId)
        || Number(source?.ledger?.restoreEpoch) !== Number(beforeReload.toEpoch)
        || actualHash !== text(beforeReload.semanticHash).toLowerCase()
        || !sameCounts(actualCounts, beforeReload.counts)) {
      return failure('canonical_restore_reload_proof_mismatch');
    }

    // The callback may populate a bounded UI/query cache, but receives data only after
    // canonical proof succeeds. This module never logs or persists that source payload.
    const reloadResult = await reload({
      namespace: target,
      ledgerId: text(beforeReload.ledgerId),
      restoreEpoch: Number(beforeReload.toEpoch),
      source,
    });
    if (reloadResult?.ok === false) return failure(text(reloadResult.reason).trim() || 'canonical_restore_reload_callback_failed');
    await fault(faultInjector, 'after_cache_reload_before_state');

    const result = await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, async txn => {
      const state = await readRestoreState(txn, target);
      const identity = await txn.getFirstAsync(
        `SELECT ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target,
      );
      if (!validRestoreState(state, target)
          || text(state.ledgerId) !== text(beforeReload.ledgerId)
          || text(state.semanticHash).toLowerCase() !== actualHash
          || !sameCounts(state.counts, actualCounts)
          || text(identity?.ledger_id) !== text(beforeReload.ledgerId)
          || Number(identity?.restore_epoch) !== Number(beforeReload.toEpoch)) {
        throw new Error('canonical_restore_reload_state_changed');
      }
      if (text(state.status) === 'local_reloaded_reconciliation_required') {
        return { idempotent: true, reloadedAt: state.reloadedAt || null };
      }
      const reloadedAt = new Date().toISOString();
      await txn.runAsync(
        `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
        promotionMetaKey(target),
        safeJson({
          ...state,
          status: 'local_reloaded_reconciliation_required',
          reloadedAt,
          reconciliationRequired: true,
        }),
        reloadedAt,
      );
      return { idempotent: false, reloadedAt };
    }));

    return {
      supported: true,
      ok: true,
      namespace: target,
      ledgerId: text(beforeReload.ledgerId),
      restoreEpoch: Number(beforeReload.toEpoch),
      reconciliationRequired: true,
      idempotent: result.idempotent,
    };
  } catch (error) {
    return failure(text(error?.message).trim() || 'canonical_restore_reload_failed');
  }
};
