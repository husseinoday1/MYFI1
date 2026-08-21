// Phase 10 Step 10 — one atomic local canonical-restore promotion.
//
// This is intentionally not wired to the UI, ZIP import, maintenance fence or
// Supabase. Its single responsibility is the SQLite commit that replaces the live
// canonical ledger with a P10-008-proved private stage and advances the local epoch.

import {
  FINANCIAL_LEDGER_SCHEMA_VERSION,
  runFinancialRestorePromotionTransactionV8,
} from './financialLedgerV7Repository';
import { CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS } from './financialBackupV11';
import { cloudWorkspaceCfg, mergeCloudWorkspaceCfg } from './cloudWorkspaceMetadata.js';

const RESTORE_STAGE_MARKER = '::restore-stage::';
const STAGE_META_PREFIX = 'canonical_restore_stage_v11:';
const PROMOTION_META_PREFIX = 'canonical_restore_promotion_v11:';

const text = value => String(value ?? '');
const nonBlank = value => text(value).trim().length > 0;
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const stageMetaKey = stageNamespace => `${STAGE_META_PREFIX}${text(stageNamespace).trim()}`;
const promotionMetaKey = namespace => `${PROMOTION_META_PREFIX}${text(namespace).trim()}`;
const validStageNamespace = (namespace, stageNamespace) => (
  nonBlank(namespace)
  && text(stageNamespace).startsWith(`${text(namespace).trim()}${RESTORE_STAGE_MARKER}`)
  && text(stageNamespace).length > `${text(namespace).trim()}${RESTORE_STAGE_MARKER}`.length
);

const parseObject = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const safeJson = (value) => {
  try { return JSON.stringify(value); } catch { throw new Error('canonical_restore_promotion_metadata_invalid'); }
};

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

const fault = async (injector, boundary) => {
  if (typeof injector === 'function') await injector(boundary);
};

const mergeRestoredFinancialConfig = ({ currentPayload, stagePayload }) => {
  if (!isObject(stagePayload) || !isObject(stagePayload.cfg)) {
    throw new Error('canonical_restore_promotion_stage_workspace_invalid');
  }
  if (currentPayload === null) {
    throw new Error('canonical_restore_promotion_local_workspace_invalid');
  }

  // A canonical backup carries only the financial config allowlist (currently
  // currency). Retain all local phone preferences and overlay only that allowlist.
  // This keeps language, theme, privacy, notification and presentation settings on
  // this device even when the financial ledger is restored from another one.
  const financialCfg = cloudWorkspaceCfg(stagePayload.cfg);
  if (isObject(currentPayload.localPreferences)) {
    const preferences = currentPayload.localPreferences;
    return {
      ...currentPayload,
      localPreferences: {
        ...preferences,
        cfg: mergeCloudWorkspaceCfg(isObject(preferences.cfg) ? preferences.cfg : {}, financialCfg),
      },
    };
  }
  return {
    ...currentPayload,
    cfg: mergeCloudWorkspaceCfg(isObject(currentPayload.cfg) ? currentPayload.cfg : {}, financialCfg),
  };
};

const failure = reason => ({ supported: true, ok: false, reason });

/**
 * Promote a P10-008 READY stage using exactly one exclusive SQLite transaction.
 * The caller must already have created the V8 restore intent; P10-012 will bind that
 * intent to the server CAS. This function never creates an intent or contacts cloud.
 */
export const promoteCanonicalRestoreStageV11 = async ({
  namespace,
  stageNamespace,
  stageProof,
  expectedFromEpoch,
  toEpoch,
  database = null,
  faultInjector = null,
} = {}) => {
  const target = text(namespace).trim();
  const stage = text(stageNamespace).trim();
  const proof = isObject(stageProof) ? stageProof : null;
  const from = Number(expectedFromEpoch);
  const next = Number(toEpoch);
  if (!validStageNamespace(target, stage)) return failure('canonical_restore_promotion_namespace_invalid');
  if (!proof || !validHash(proof.semanticHash) || !validCounts(proof.counts)
      || !Number.isInteger(Number(proof.validatorVersion)) || Number(proof.validatorVersion) < 1) {
    return failure('canonical_restore_promotion_proof_invalid');
  }
  if (!Number.isInteger(from) || from < 1 || !Number.isInteger(next) || next !== from + 1) {
    return failure('canonical_restore_promotion_epoch_invalid');
  }

  try {
    return await runFinancialRestorePromotionTransactionV8({ database, task: async actions => {
      const stageMarkerRow = await actions.database.getFirstAsync(
        `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, stageMetaKey(stage),
      );
      const stageMarker = parseObject(stageMarkerRow?.value);
      const identity = await actions.database.getFirstAsync(
        `SELECT ledger_id,restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`, target,
      );
      const stageWorkspaceRow = await actions.database.getFirstAsync(
        `SELECT source_mode,schema_version,payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, stage,
      );
      const currentWorkspaceRow = await actions.database.getFirstAsync(
        `SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1`, target,
      );
      const intentRow = await actions.database.getFirstAsync(
        `SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1`, `restore_intent:${target}`,
      );
      const intent = parseObject(intentRow?.value);
      const stagePayload = parseObject(stageWorkspaceRow?.payload_json);
      const currentPayload = currentWorkspaceRow ? parseObject(currentWorkspaceRow.payload_json) : {};
      if (!stageMarker || stageMarker.state !== 'ready'
          || stageMarker.namespace !== stage
          || !identity?.ledger_id
          || text(stageMarker.ledgerId) !== text(identity.ledger_id)
          || text(stageMarker.semanticHash).toLowerCase() !== text(proof.semanticHash).toLowerCase()
          || !sameCounts(stageMarker.counts, proof.counts)
          || Number(stageMarker.validatorVersion) !== Number(proof.validatorVersion)
          || Number(identity.restore_epoch) !== from
          || text(stageWorkspaceRow?.source_mode) !== 'shadow'
          || Number(stageWorkspaceRow?.schema_version) !== FINANCIAL_LEDGER_SCHEMA_VERSION
          || !intent || !nonBlank(intent.operation)
          || text(intent.ledgerId) !== text(identity.ledger_id)
          || Number(intent.fromEpoch) !== from || Number(intent.toEpoch) !== next) {
        throw new Error('canonical_restore_promotion_precondition_failed');
      }
      const restoredWorkspacePayload = mergeRestoredFinancialConfig({ currentPayload, stagePayload });
      const now = new Date().toISOString();
      await fault(faultInjector, 'before_live_clear');

      await actions.clearFinancialNamespace(target);
      await fault(faultInjector, 'after_live_clear');

      await actions.copyFinancialNamespaceFromStage({ namespace: target, stageNamespace: stage });
      await fault(faultInjector, 'after_hot_copy');

      await actions.replaceColdArchiveNamespaceFromStage({ namespace: target, stageNamespace: stage });
      await fault(faultInjector, 'after_archive_replace');

      await actions.database.runAsync(
        `INSERT INTO ledger_workspace_state_v7
         (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        target, 'sqlite', FINANCIAL_LEDGER_SCHEMA_VERSION, text(proof.semanticHash).toLowerCase(), now, now, now,
        safeJson(restoredWorkspacePayload), now,
      );
      await fault(faultInjector, 'after_workspace_state');

      await actions.database.runAsync(
        `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
        promotionMetaKey(target),
        safeJson({
          version: 1,
          status: 'local_promoted_pending_reload',
          namespace: target,
          ledgerId: text(identity.ledger_id),
          fromEpoch: from,
          toEpoch: next,
          operation: text(intent.operation),
          stageNamespace: stage,
          semanticHash: text(proof.semanticHash).toLowerCase(),
          counts: proof.counts,
          promotedAt: now,
        }),
        now,
      );
      await fault(faultInjector, 'after_restore_metadata');

      const advanced = await actions.advanceRestoreEpoch({
        namespace: target, expectedFromEpoch: from, toEpoch: next,
      });
      await fault(faultInjector, 'after_epoch_cas');

      // Cleanup belongs to this transaction too. If it fails, the old live ledger,
      // the stage and the old epoch all roll back together; no half-promotion survives.
      await actions.clearFinancialNamespace(stage);
      await actions.clearColdArchiveNamespace(stage);
      await actions.database.runAsync(`DELETE FROM ledger_v7_meta WHERE key=?`, stageMetaKey(stage));
      await fault(faultInjector, 'after_stage_cleanup');

      return {
        supported: true,
        ok: true,
        namespace: target,
        ledgerId: advanced.ledgerId,
        restoreEpoch: advanced.restoreEpoch,
        semanticHash: text(proof.semanticHash).toLowerCase(),
      };
    }});
  } catch (error) {
    // Callers need the real classified failure: an epoch CAS race, an SQLite
    // constraint rejection and a storage failure lead to different safe recovery
    // actions. These paths throw stable codes/engine messages only; no financial
    // payload is appended here or logged by this module.
    return failure(text(error?.message).trim() || 'canonical_restore_promotion_failed');
  }
};
