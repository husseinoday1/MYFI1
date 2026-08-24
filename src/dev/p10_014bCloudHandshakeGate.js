// MYFI P10-014B — disposable-device proof-bound cloud handshake.
// This gate is inert unless the CI/device build explicitly enables it. It never
// reads or prints financial payloads and refuses to call Supabase for a non-empty
// account. The cloud advance and local epoch CAS are one reviewed acceptance pair.

import * as Crypto from 'expo-crypto';
import { exportColdArchives, getColdArchiveNamespace } from '../lib/localArchiveRepository';
import {
  beginLedgerRestoreEpochV8,
  commitLedgerRestoreEpochV8,
  ensureLedgerSyncIdentityV8,
  readFinancialSyncProtocolV8,
  readFinancialWorkspaceV7,
} from '../lib/financialLedgerV7Repository';
import { getLedgerDb } from '../lib/ledgerDatabase';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { deriveCanonicalRestoreProofDigestV11 } from '../lib/financialRestoreProofV11';
import { readNamespaceManifestCountsV13 } from '../lib/financialRestoreCheckpointV13';
import { semanticHashNamespaceV3Bounded } from '../lib/financialSemanticStreamV3';
import { advanceOrResolveFinancialRestoreEpochV3 } from '../lib/financialRestoreEpochV3Client';
import { resolveCloudLedgerV2 } from '../lib/financialMutationSyncV2';
import { getOrCreateDeviceId } from '../lib/secureVault';
import { supabase } from '../lib/supabase';
import { disposableBlockers } from './p19RestoreEpochDeviceGate';

export const P10_014B_CLOUD_HANDSHAKE_ENABLED = (
  process.env.EXPO_PUBLIC_P10_014B_CLOUD_HANDSHAKE === '1'
);

const text = value => String(value ?? '').trim();
const normalizeRpcObject = value => (Array.isArray(value) ? value[0] : value);
const errorText = error => String(error?.message || error?.code || error || 'p10_014b_unknown_error');

export const runP10_014BCloudHandshakeGate = async ({ getState } = {}) => {
  const state = typeof getState === 'function' ? getState() : null;
  const base = {
    patchId: 'P10-014B-001',
    gate: 'CLOUD_HANDSHAKE_ACCEPTANCE',
    acceptanceComplete: false,
    productionRestoreWiring: false,
    p10_012MigrationRequired: true,
    p10_012Rpc: 'advance_financial_restore_epoch_v3',
    financialDataChangedByGate: false,
    secureStoreChangedByGate: false,
    startedAt: new Date().toISOString(),
  };

  if (!P10_014B_CLOUD_HANDSHAKE_ENABLED) {
    return { ...base, blocked: true, reason: 'p10_014b_flag_disabled' };
  }
  if (!state?.user?.id || !state.workspaceReady) {
    return { ...base, blocked: true, reason: 'signed_in_workspace_required' };
  }

  const database = await getLedgerDb();
  if (!database) return { ...base, blocked: true, reason: 'sqlite_unavailable' };
  const workspaceNamespace = text(state.workspaceNamespace || '');
  const ledgerNamespace = getLedgerNamespace(workspaceNamespace, state.cfg || {});
  const localWorkspace = await readFinancialWorkspaceV7({ namespace: ledgerNamespace, database, includeArchived: true });
  const coldArchives = await exportColdArchives(
    getColdArchiveNamespace(workspaceNamespace, state.cfg || {}), { database },
  );
  const blockers = disposableBlockers({ state, coldArchives, localWorkspace });
  if (blockers.length) {
    return {
      ...base,
      blocked: true,
      reason: 'disposable_financially_empty_account_required',
      blockers,
      workspaceNamespace,
      ledgerNamespace,
    };
  }

  const identity = await ensureLedgerSyncIdentityV8({ namespace: ledgerNamespace, database });
  const protocol = await readFinancialSyncProtocolV8({ namespace: ledgerNamespace, database });
  if (!identity?.ledgerId || Number(identity.restoreEpoch || 0) < 1
      || protocol?.activeProtocolVersion !== 2 || !protocol?.activatedAt
      || text(protocol.ledgerId) !== text(identity.ledgerId)
      || Number(protocol.restoreEpoch || 0) !== Number(identity.restoreEpoch || 0)) {
    return { ...base, blocked: true, reason: 'active_protocol_v2_required', identity, protocol };
  }

  const session = await supabase.auth.getUser();
  const sessionUserId = text(session?.data?.user?.id).toLowerCase();
  const ownerId = text(state.user.id).toLowerCase();
  if (!sessionUserId || sessionUserId !== ownerId) {
    return { ...base, blocked: true, reason: 'original_authenticated_session_required' };
  }

  const cloud = await resolveCloudLedgerV2({ supabase, identity });
  if (text(cloud?.ledgerId) !== text(identity.ledgerId)
      || Number(cloud?.restoreEpoch || 0) !== Number(identity.restoreEpoch || 0)
      || Number(cloud?.protocolVersion || 0) !== 2 || !cloud?.bootstrappedAt) {
    return { ...base, blocked: true, reason: 'cloud_v2_identity_not_ready', identity, cloud };
  }

  const fromEpoch = Number(identity.restoreEpoch);
  const toEpoch = fromEpoch + 1;
  const operationId = Crypto.randomUUID().toLowerCase();
  const deviceId = await getOrCreateDeviceId();
  const semanticHash = await semanticHashNamespaceV3Bounded({
    database, namespace: ledgerNamespace, ledgerId: identity.ledgerId,
  });
  const counts = await readNamespaceManifestCountsV13({ database, namespace: ledgerNamespace });
  const restoreProofDigest = deriveCanonicalRestoreProofDigestV11({
    operationId, ledgerId: identity.ledgerId, fromEpoch, toEpoch,
    semanticHash, validatorVersion: 1, counts,
  });

  const intent = await beginLedgerRestoreEpochV8({
    namespace: ledgerNamespace, operation: 'backup_restore', database,
  });
  if (!intent || text(intent.ledgerId) !== text(identity.ledgerId)
      || Number(intent.fromEpoch) !== fromEpoch || Number(intent.toEpoch) !== toEpoch) {
    return { ...base, blocked: false, reason: 'local_restore_intent_invalid', workspaceNamespace, ledgerNamespace };
  }

  let serverResult = null;
  try {
    serverResult = await advanceOrResolveFinancialRestoreEpochV3({
      supabase,
      operation: {
        ownerId, ledgerId: identity.ledgerId, fromEpoch, toEpoch, deviceId,
        operationId, restoreProofDigest, reason: 'backup_restore',
      },
    });
    const proof = normalizeRpcObject(serverResult);
    if (!serverResult?.ok || !proof || text(proof.ownerId).toLowerCase() !== ownerId
        || text(proof.ledgerId) !== text(identity.ledgerId)
        || Number(proof.fromEpoch) !== fromEpoch || Number(proof.toEpoch) !== toEpoch
        || text(proof.reason) !== 'backup_restore' || text(proof.deviceId) !== text(deviceId)
        || text(proof.operationId).toLowerCase() !== operationId
        || text(proof.restoreProofDigest).toLowerCase() !== restoreProofDigest) {
      throw new Error(serverResult?.reason || 'p10_014b_server_proof_invalid');
    }

    const committed = await commitLedgerRestoreEpochV8({
      namespace: ledgerNamespace, expectedFromEpoch: fromEpoch, toEpoch, database,
    });
    if (!committed || Number(committed.restoreEpoch) !== toEpoch) {
      return {
        ...base, blocked: false, reason: 'local_epoch_commit_invalid', serverAdvanced: true,
        splitStateRequiresRecovery: true, workspaceNamespace, ledgerNamespace, serverResult,
      };
    }
    return {
      ...base,
      ok: true,
      acceptanceComplete: true,
      blocked: false,
      workspaceNamespace,
      ledgerNamespace,
      ledgerId: identity.ledgerId,
      fromEpoch,
      toEpoch,
      operationId,
      eventId: text(serverResult.eventId),
      outcome: text(serverResult.outcome),
      restoreProofDigest,
      serverProofSource: 'supabase_rpc_v3',
      localEpochCommitted: true,
      completedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...base,
      ok: false,
      blocked: false,
      reason: errorText(error),
      serverAdvanced: false,
      workspaceNamespace,
      ledgerNamespace,
      ledgerId: identity.ledgerId,
      fromEpoch,
      toEpoch,
      operationId,
      serverResult,
    };
  }
};
