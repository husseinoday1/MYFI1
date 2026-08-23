// MYFI Phase 10 / P10-014A-001 — local Strategy B real-device acceptance harness.
// Acceptance-only code. It is inert unless BOTH diagnostic build flags are enabled.
// It never calls Supabase and never counts synthetic server proof as cloud evidence.
// All financial rows created by this harness live under disposable workspace:p10a-*
// namespaces and are removed/verified after every tier or on the next run after a kill.

import { Platform } from 'react-native';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { useStore } from '../store/useStore';
import { getLedgerNamespace } from '../lib/activeLedgerRepository';
import { getLedgerDb } from '../lib/ledgerDatabase';
import {
  ensureFinancialLedgerV7,
  ensureLedgerSyncIdentityV8,
  readFinancialWorkspaceV7,
  readLedgerSyncIdentityV8,
  runFinancialRestorePromotionTransactionV8,
} from '../lib/financialLedgerV7Repository';
import { exportColdArchives, getColdArchiveNamespace } from '../lib/localArchiveRepository';
import {
  CANONICAL_ROW_SOURCE_V3_BATCH_POLICY,
  readCanonicalRowBatchV3,
} from '../lib/financialCanonicalRowSourceV3';
import {
  registerLiveGenerationInTransactionV13,
  readLiveGenerationInTransactionV13,
} from '../lib/financialLiveGenerationV13';
import {
  captureRestoreStartSnapshotInTransactionV13,
} from '../lib/financialRestoreStartSnapshotV13';
import {
  copyBoundedFinancialNamespaceBatchInTransactionV13,
  initializeRestoreCheckpointInTransactionV13,
  copyNextRestoreCheckpointBatchInTransactionV13,
} from '../lib/financialRestoreCheckpointV13';
import {
  computeRestoreCheckpointProofV13,
  guardRestoreSourceBeforeEpochRpcInTransactionV13,
  markRestoreCheckpointReadyInTransactionV13,
  readNamespaceManifestCountsV13,
  writeCanonicalRestoreStageReadinessV13InTransaction,
} from '../lib/financialRestoreSourceGuardV13';
import {
  RESTORE_SQL_VALIDATOR_V13_VERSION,
  proveRestoreNamespaceSqlV13,
} from '../lib/financialRestoreSqlValidatorV13';
import { semanticHashNamespaceV3Bounded } from '../lib/financialSemanticStreamV3';
import {
  SEMANTIC_HASH_V3_VERSION,
  stableSemanticJsonV3,
  canonicalizeFinancialConfigItemV3,
  canonicalizeFinancialAccountItemV3,
  canonicalizeFinancialExchangeRateItemV3,
  canonicalizeFinancialTransactionItemV3,
  canonicalizeFinancialPostingItemV3,
  canonicalizeFinancialLinkItemV3,
  canonicalizeFinancialEntityItemV3,
} from '../lib/financialSemanticProjection';
import { normalizeCanonicalRestoreProofCountsV13 } from '../lib/financialRestoreProofV13';
import {
  createStrategyBRestoreIntentV13InTransaction,
  promoteCanonicalRestoreStageV13,
  recordStrategyBServerProofV13InTransaction,
} from '../lib/financialRestorePromotionV13';
import { runFinancialMaintenanceTask } from '../lib/financialMaintenanceBarrier';
import { disposableBlockers } from './p19RestoreEpochDeviceGate';

const P10_014A_LOCAL_FLAG = process.env.EXPO_PUBLIC_P10_014A_LOCAL_STRATEGY_B === '1';
const PHASE10_BENCHMARK_FLAG = process.env.EXPO_PUBLIC_PHASE10_RESTORE_BENCHMARK === '1';
const P10_014A_FRESH_TEST_FLAG = process.env.EXPO_PUBLIC_FRESH_TEST === '1';
const P10_014A_FRESH_TEST_NAMESPACE = 'fresh-test-new-user';
const P10_014A_CLONE_PROBE_FLAG = process.env.EXPO_PUBLIC_P10_014A_CLONE_PROBE === '1';
const P10_014A_CLONE_MARKER_KEY = 'p10_014a_clone_database_marker';

export const PHASE10_RESTORE_BENCHMARK_ENABLED = (
  P10_014A_LOCAL_FLAG && PHASE10_BENCHMARK_FLAG
);

export const P10_014A_GATE = 'LOCAL_STRATEGY_B_ACCEPTANCE';
export const P10_014B_GATE = 'CLOUD_HANDSHAKE_ACCEPTANCE';
export const SYNTHETIC_SERVER_PROOF_SOURCE = 'synthetic_dev_only';

const REQUIRED_TIERS = Object.freeze([
  { id: '1000', transactions: 1000 },
  { id: '10000', transactions: 10000 },
  { id: '50000', transactions: 50000 },
  { id: '100000', transactions: 100000 },
]);
const REQUIRED_TIER_MAP = new Map(REQUIRED_TIERS.map(item => [item.id, item]));
const PRIVATE_COPY_SECTIONS = Object.freeze([
  'accounts', 'exchangeRates', 'transactions', 'postings', 'links', 'entities',
  'archiveHeaders', 'archiveRecords',
]);
const FIXTURE_SQL_BATCH_ROWS = 500;
const MARKER_PREFIX = 'p10_014a_run:';
const SYNTHETIC_PROOF_MARKER_PREFIX = 'p10_014a_synthetic_proof:';
const LIVE_NAMESPACE_PREFIX = 'workspace:p10a-';
const FIXTURE_TIMESTAMP = '2026-08-22T00:00:00.000Z';
const FIXTURE_WORKSPACE_PAYLOAD = JSON.stringify({
  cfg: { currency: 'IQD', activeScope: 'personal', profileType: 'personal' },
});
const FIXTURE_ARCHIVE_METADATA = JSON.stringify({
  debts: [], goals: [], wallets: [], commitments: [], cats: [],
  cfg: { currency: 'IQD', activeScope: 'personal', profileType: 'personal' },
  archiveScope: 'personal',
});

const nowMs = () => (
  typeof globalThis !== 'undefined'
  && globalThis.performance
  && typeof globalThis.performance.now === 'function'
    ? globalThis.performance.now()
    : Date.now()
);
const roundMs = value => Math.round(Number(value || 0) * 1000) / 1000;
const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const parseObject = value => {
  try {
    const parsed = JSON.parse(String(value ?? ''));
    return object(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const safeError = error => ({
  code: text(error?.message || error || 'p10_014a_unknown_error').slice(0, 240),
});
const assertGate = (condition, code, details = null) => {
  if (condition) return;
  const error = new Error(`p10_014a_${code}`);
  if (details) error.details = details;
  throw error;
};
const uuidValue = value => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
);
const uuid = () => {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const chunk = count => Array.from({ length: count }, hex).join('');
  return `${chunk(8)}-${chunk(4)}-4${chunk(3)}-8${chunk(3)}-${chunk(12)}`;
};
const runToken = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const countsEqual = (left, right) => {
  const keys = [
    'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
    'coldArchiveBundles', 'coldArchiveRecords',
  ];
  return keys.every(key => Number(left?.[key] || 0) === Number(right?.[key] || 0));
};
const zeroCounts = value => (
  countsEqual(value, {
    transactions: 0, postings: 0, links: 0, accounts: 0, exchangeRates: 0,
    entities: 0, coldArchiveBundles: 0, coldArchiveRecords: 0,
  })
);
const exactProofCounts = (left, right) => {
  const a = normalizeCanonicalRestoreProofCountsV13(left);
  const b = normalizeCanonicalRestoreProofCountsV13(right);
  return !!a && !!b && Object.keys(a).every(key => a[key] === b[key]);
};

// P10-014A post-promotion diagnostics. These compare bounded canonical sections but
// expose only section names/booleans. No row, amount, count value or digest is logged.
const POST_PROMOTION_COUNT_SECTIONS = Object.freeze([
  'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
  'coldArchiveBundles', 'coldArchiveRecords',
]);
const POST_PROMOTION_SEMANTIC_SECTIONS = Object.freeze([
  'financialConfig', 'accounts', 'exchangeRates', 'transactions', 'postings',
  'links', 'entities', 'archiveHeaders', 'archiveRecords',
]);
const postPromotionDiagnosticEncoder = new TextEncoder();
const POST_PROMOTION_CANONICALIZER = Object.freeze({
  financialConfig: canonicalizeFinancialConfigItemV3,
  accounts: canonicalizeFinancialAccountItemV3,
  exchangeRates: canonicalizeFinancialExchangeRateItemV3,
  transactions: canonicalizeFinancialTransactionItemV3,
  postings: canonicalizeFinancialPostingItemV3,
  links: canonicalizeFinancialLinkItemV3,
  entities: canonicalizeFinancialEntityItemV3,
  archiveHeaders: value => value,
  archiveRecords: value => value,
});
const diagnosticSectionDigest = async ({ database, namespace, section }) => {
  const canonicalize = POST_PROMOTION_CANONICALIZER[section];
  assertGate(typeof canonicalize === 'function', 'post_promotion_diagnostic_section_invalid', { section });
  const hash = sha256.create();
  let cursor = null;
  while (true) {
    const batch = await readCanonicalRowBatchV3({
      database,
      namespace,
      section,
      cursor,
      maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
      maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
    });
    assertGate(batch?.ok === true, 'post_promotion_diagnostic_row_source_failed', { section });
    for (const row of batch.rows) {
      const serialized = stableSemanticJsonV3(canonicalize(row));
      hash.update(postPromotionDiagnosticEncoder.encode(`${serialized.length}:`));
      hash.update(postPromotionDiagnosticEncoder.encode(serialized));
    }
    if (!batch.hasMore) break;
    assertGate(batch.nextCursor, 'post_promotion_diagnostic_cursor_missing', { section });
    cursor = batch.nextCursor;
  }
  return bytesToHex(hash.digest());
};
const diagnosePostPromotionMismatch = async ({
  database, liveNamespace, incomingNamespace, liveCounts, incomingCounts, semanticHashMatches,
}) => {
  const countFailedSections = POST_PROMOTION_COUNT_SECTIONS.filter(
    key => Number(liveCounts?.[key] || 0) !== Number(incomingCounts?.[key] || 0),
  );
  const semanticFailedSections = [];
  if (!semanticHashMatches) {
    for (const section of POST_PROMOTION_SEMANTIC_SECTIONS) {
      const liveDigest = await diagnosticSectionDigest({
        database, namespace: liveNamespace, section,
      });
      const incomingDigest = await diagnosticSectionDigest({
        database, namespace: incomingNamespace, section,
      });
      if (liveDigest !== incomingDigest) semanticFailedSections.push(section);
    }
    // A full semantic mismatch with equal section digests can only be in top-level
    // framing/ledger binding. Keep this explicit rather than guessing a section.
    if (!semanticFailedSections.length) semanticFailedSections.push('topLevelOrFraming');
  }
  return Object.freeze({
    countFailedSections: Object.freeze(countFailedSections),
    semanticFailedSections: Object.freeze(semanticFailedSections),
  });
};

const withRestoreTransaction = (database, task) => (
  runFinancialRestorePromotionTransactionV8({
    database,
    task: actions => task(actions.database, actions),
  })
);

const assertCloneDatabaseBinding = async database => {
  if (!P10_014A_CLONE_PROBE_FLAG) return null;
  const nonce = text(globalThis?.__MYFI_P10_014A_CLONE_NONCE__);
  assertGate(nonce && nonce.length >= 16 && nonce.length <= 120, 'clone_nonce_missing');
  const row = await database.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
    P10_014A_CLONE_MARKER_KEY,
  );
  assertGate(text(row?.value) === nonce, 'clone_database_marker_missing');
  return Object.freeze({
    ok: true,
    mode: 'original_package_sqlite_backup_clone',
    originalDatabaseReadOnly: true,
    originalDatabaseMutationByHarness: false,
  });
};

const assertDisposableCurrentAccount = async database => {
  if (P10_014A_CLONE_PROBE_FLAG) {
    return Object.freeze({
      ok: true,
      guardMode: 'original_package_clone_database',
      signedInRequirementBypassed: true,
      bypassedBlocker: 'current_account_disposable_guard_not_applicable_to_clone',
      otherBlockers: 0,
      realFinancialNamespaceMutation: false,
    });
  }
  const state = useStore.getState();
  const workspaceNamespace = text(state?.workspaceNamespace);
  assertGate(workspaceNamespace, 'workspace_namespace_missing');
  const ledgerNamespace = getLedgerNamespace(workspaceNamespace, state.cfg);
  const archiveNamespace = getColdArchiveNamespace(workspaceNamespace, state.cfg);
  const coldArchives = await exportColdArchives(archiveNamespace);
  const localWorkspace = await readFinancialWorkspaceV7({
    namespace: ledgerNamespace,
    database,
  });
  const blockers = disposableBlockers({ state, coldArchives, localWorkspace });

  // P10-014A is local-only: it never calls Supabase and never operates on the
  // current workspace financial namespace. R2 runs as a separate Android package
  // with FRESH_TEST=1 under exactly fresh-test-new-user. P19's signed-in
  // requirement belongs to its real cloud restore-epoch gate, so remove ONLY that
  // one blocker under these exact isolated conditions. Every other blocker remains
  // fail-closed.
  const isolatedFreshTestGuest = (
    P10_014A_LOCAL_FLAG
    && PHASE10_BENCHMARK_FLAG
    && P10_014A_FRESH_TEST_FLAG
    && workspaceNamespace === P10_014A_FRESH_TEST_NAMESPACE
    && !state?.user?.id
  );
  const effectiveBlockers = isolatedFreshTestGuest
    ? blockers.filter(blocker => blocker !== 'signed_in_account_required')
    : blockers;

  if (effectiveBlockers.length) {
    const evidence = {
      ok: false,
      blocked: true,
      reason: 'disposable_financially_empty_account_required',
      blockers: effectiveBlockers,
      isolatedFreshTestGuest,
    };
    console.warn('[P10_014A_BLOCKED]', JSON.stringify(evidence));
    assertGate(false, 'disposable_financially_empty_account_required', evidence);
  }

  return Object.freeze({
    ok: true,
    guardMode: isolatedFreshTestGuest ? 'isolated_fresh_test_guest' : 'signed_in_disposable',
    signedInRequirementBypassed: isolatedFreshTestGuest,
    bypassedBlocker: isolatedFreshTestGuest ? 'signed_in_account_required' : null,
    otherBlockers: 0,
  });
};


const readPromotionPreconditionEvidence = async ({
  database, namespace, operationId, guard = null,
}) => withRestoreTransaction(database, async txn => {
  const effectiveGuard = guard?.ok === true
    ? guard
    : await guardRestoreSourceBeforeEpochRpcInTransactionV13({
      database: txn, namespace, operationId,
    });

  if (effectiveGuard?.ok !== true) {
    return Object.freeze({
      guardOk: false,
      immutableIntentMatch: false,
      allMatch: false,
      failedFields: Object.freeze(['guardOk']),
      checks: Object.freeze({ guardOk: false }),
      guardReason: text(effectiveGuard?.reason || 'unknown'),
      guardDigestPrefix: '',
    });
  }

  const intent = parseObject((await txn.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
    `restore_intent:${namespace}`,
  ))?.value);
  const checkpoint = parseObject((await txn.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
    `canonical_restore_checkpoint_v13:${namespace}:${effectiveGuard.snapshot.checkpointId}`,
  ))?.value);
  const stageWorkspace = await txn.getFirstAsync(
    'SELECT source_mode,schema_version FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1',
    effectiveGuard.snapshot.stageNamespace,
  );

  // Mirrors financialRestorePromotionV13.exactImmutableIntent with strict
  // equality. Evidence is booleans/field names only: no financial rows/amounts.
  const immutableChecks = Object.freeze({
    intentPresent: !!intent,
    intentVersion3: intent?.version === 3,
    intentStateVersionValid: Number.isSafeInteger(intent?.stateVersion) && intent.stateVersion >= 1,
    intentStatusAllowed: ['intent_pending_server', 'server_epoch_proven'].includes(intent?.status),
    namespaceMatch: intent?.namespace === effectiveGuard.snapshot.namespace,
    ledgerIdMatch: intent?.ledgerId === effectiveGuard.snapshot.ledgerId,
    operationIdMatch: intent?.operationId === effectiveGuard.snapshot.operationId,
    stageNamespaceMatch: intent?.stageNamespace === effectiveGuard.snapshot.stageNamespace,
    checkpointIdMatch: intent?.checkpointId === effectiveGuard.snapshot.checkpointId,
    checkpointNamespaceMatch: intent?.checkpointNamespace === effectiveGuard.snapshot.checkpointNamespace,
    fromEpochStrictMatch: intent?.fromEpoch === effectiveGuard.snapshot.sourceRestoreEpoch,
    toEpochStrictMatch: intent?.toEpoch === effectiveGuard.snapshot.sourceRestoreEpoch + 1,
    sourceLiveGenerationStrictMatch: intent?.sourceLiveGeneration === effectiveGuard.snapshot.sourceLiveGeneration,
    semanticHashVersionStrictMatch: intent?.semanticHashVersion === effectiveGuard.snapshot.semanticHashVersion,
    incomingSemanticHashMatch: intent?.incomingSemanticHash === effectiveGuard.snapshot.incomingSemanticHash,
    checkpointSemanticHashMatch: intent?.checkpointSemanticHash === effectiveGuard.checkpoint.semanticHash,
    validatorVersionStrictMatch: intent?.validatorVersion === effectiveGuard.snapshot.validatorVersion,
    incomingCountsExact: exactProofCounts(intent?.incomingCounts, effectiveGuard.snapshot.incomingCounts),
    checkpointCountsExact: exactProofCounts(intent?.checkpointCounts, effectiveGuard.checkpoint.counts),
    triggerKindValid: ['restore', 'undo'].includes(intent?.triggerKind),
    restoreProofDigestMatch: intent?.restoreProofDigest === effectiveGuard.restoreProofDigest,
  });
  const immutableIntentMatch = Object.values(immutableChecks).every(Boolean);

  const checks = Object.freeze({
    guardOk: true,
    ...immutableChecks,
    immutableIntentMatch,
    intentServerEpochProven: intent?.status === 'server_epoch_proven',
    intentOperationBackupRestore: intent?.operation === 'backup_restore',
    authUserIdUuid: uuidValue(intent?.authUserId),
    serverEventIdUuid: uuidValue(intent?.serverEventId),
    deviceIdPresent: !!text(intent?.deviceId),
    checkpointPresent: !!checkpoint,
    checkpointReady: checkpoint?.status === 'READY',
    checkpointOperationMatch: checkpoint?.operationId === text(operationId).toLowerCase(),
    stageWorkspacePresent: !!stageWorkspace,
    stageSourceModeShadow: text(stageWorkspace?.source_mode) === 'shadow',
    stageSchemaVersion7: Number(stageWorkspace?.schema_version) === 7,
  });
  const failedFields = Object.freeze(
    Object.entries(checks).filter(([, value]) => value !== true).map(([name]) => name),
  );

  return Object.freeze({
    guardOk: true,
    immutableIntentMatch,
    intentServerEpochProven: checks.intentServerEpochProven,
    checkpointReady: checks.checkpointReady,
    stageSourceModeShadow: checks.stageSourceModeShadow,
    stageSchemaVersion7: checks.stageSchemaVersion7,
    allMatch: failedFields.length === 0,
    failedFields,
    checks,
    guardReason: null,
    guardDigestPrefix: text(effectiveGuard.restoreProofDigest).slice(0, 12),
  });
});

const markerKey = namespace => `${MARKER_PREFIX}${namespace}`;
const syntheticProofKey = (namespace, operationId) => (
  `${SYNTHETIC_PROOF_MARKER_PREFIX}${namespace}:${text(operationId).toLowerCase()}`
);
const validBenchmarkNamespace = value => (
  text(value).startsWith(LIVE_NAMESPACE_PREFIX)
  && !text(value).slice(LIVE_NAMESPACE_PREFIX.length).includes(':')
);
const validPrivateFor = (namespace, value) => {
  const target = text(value);
  return target.startsWith(`${namespace}::shadow-stage::`)
    || target.startsWith(`${namespace}::restore-stage::`)
    || target.startsWith(`${namespace}::restore-checkpoint::`);
};

const parseRunMarker = value => {
  const marker = parseObject(value);
  if (!marker || marker.version !== 1 || marker.gate !== P10_014A_GATE
      || marker.serverProofSource !== SYNTHETIC_SERVER_PROOF_SOURCE
      || marker.cloudHandshakeAcceptance !== 'NOT_TESTED'
      || !validBenchmarkNamespace(marker.namespace)
      || !validPrivateFor(marker.namespace, marker.incomingSourceNamespace)
      || !validPrivateFor(marker.namespace, marker.stageNamespace)
      || !validPrivateFor(marker.namespace, marker.checkpointNamespace)) {
    return null;
  }
  return marker;
};

const writeRunMarker = async ({ database, marker }) => {
  await withRestoreTransaction(database, async txn => {
    const now = new Date().toISOString();
    await txn.runAsync(
      'INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      markerKey(marker.namespace), JSON.stringify(marker), now,
    );
  });
};

const namespaceRowCount = async (database, namespace) => {
  const row = await database.getFirstAsync(
    `SELECT
      (SELECT COUNT(*) FROM ledger_accounts_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_exchange_rates_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_financial_transactions_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_postings_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_transaction_links_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_entities_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM ledger_workspace_state_v7 WHERE namespace=?) +
      (SELECT COUNT(*) FROM cold_archive_years WHERE namespace=?) +
      (SELECT COUNT(*) FROM cold_archive_transactions WHERE namespace=?) AS n`,
    namespace, namespace, namespace, namespace, namespace, namespace, namespace, namespace, namespace,
  );
  return Math.max(0, Number(row?.n || 0));
};

const cleanupBenchmarkMarker = async ({ database, marker }) => {
  assertGate(parseRunMarker(JSON.stringify(marker)), 'cleanup_marker_invalid');
  const namespaces = [
    marker.stageNamespace,
    marker.checkpointNamespace,
    marker.incomingSourceNamespace,
    marker.namespace,
  ];
  await withRestoreTransaction(database, async (txn, actions) => {
    for (const namespace of namespaces) {
      await actions.clearFinancialNamespace(namespace);
      await actions.clearColdArchiveNamespace(namespace);
    }

    const identity = await txn.getFirstAsync(
      'SELECT ledger_id FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1',
      marker.namespace,
    );
    const ledgerId = text(identity?.ledger_id);
    if (ledgerId) {
      await txn.runAsync('DELETE FROM ledger_outbox_v3 WHERE ledger_id=?', ledgerId);
      await txn.runAsync('DELETE FROM ledger_inbox_v3 WHERE ledger_id=?', ledgerId);
      await txn.runAsync('DELETE FROM ledger_bootstrap_state_v8 WHERE ledger_id=?', ledgerId);
      await txn.runAsync('DELETE FROM ledger_bootstrap_import_state_v8 WHERE ledger_id=?', ledgerId);
      await txn.runAsync('DELETE FROM ledger_sync_state_v8 WHERE ledger_id=?', ledgerId);
    }
    await txn.runAsync('DELETE FROM ledger_outbox_v2 WHERE namespace=?', marker.namespace);
    await txn.runAsync('DELETE FROM ledger_inbox_v2 WHERE namespace=?', marker.namespace);
    await txn.runAsync('DELETE FROM ledger_sync_state_v7 WHERE namespace=?', marker.namespace);

    const exactKeys = [
      `financial_live_generation_v13:${marker.namespace}`,
      `restore_intent:${marker.namespace}`,
      `canonical_restore_promotion_v13:${marker.namespace}`,
      `canonical_restore_undo_pointer_v13:${marker.namespace}`,
      `active_sync_protocol:${marker.namespace}`,
      syntheticProofKey(marker.namespace, marker.operationId),
    ];
    for (const key of exactKeys) await txn.runAsync('DELETE FROM ledger_v7_meta WHERE key=?', key);
    const prefixKeys = [
      `canonical_restore_start_v13:${marker.namespace}:%`,
      `canonical_restore_checkpoint_v13:${marker.namespace}:%`,
      `canonical_restore_stage_v13:${marker.namespace}:%`,
      `canonical_restore_undo_stage_build_v13:${marker.namespace}:%`,
      `sync_v2_epoch_activation_pending:${marker.namespace}:%`,
      `sync_v2_activation_evidence:${marker.namespace}%`,
    ];
    for (const prefix of prefixKeys) await txn.runAsync('DELETE FROM ledger_v7_meta WHERE key LIKE ?', prefix);
    if (ledgerId) {
      await txn.runAsync(
        'DELETE FROM ledger_sync_identity_v8 WHERE namespace=? AND ledger_id=?',
        marker.namespace, ledgerId,
      );
    }
  });

  for (const namespace of namespaces) {
    const count = await namespaceRowCount(database, namespace);
    assertGate(count === 0, 'cleanup_namespace_not_empty', { rowsRemaining: count });
  }
  const identityAfter = await database.getFirstAsync(
    'SELECT 1 AS present FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1', marker.namespace,
  );
  const durableMarkerRow = await database.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', markerKey(marker.namespace),
  );
  assertGate(!identityAfter, 'cleanup_identity_not_empty');
  assertGate(
    parseRunMarker(durableMarkerRow?.value)
      && parseRunMarker(durableMarkerRow.value).operationId === marker.operationId,
    'cleanup_recovery_marker_missing_before_finalization',
  );

  // The recovery marker is deliberately the LAST durable artifact removed.
  // If any namespace/identity verification above fails, the next app start can
  // still discover this run and finish cleanup rather than losing its locator.
  await withRestoreTransaction(database, async txn => {
    const deleted = await txn.runAsync(
      'DELETE FROM ledger_v7_meta WHERE key=? AND value=?',
      markerKey(marker.namespace),
      String(durableMarkerRow.value),
    );
    assertGate(Number(deleted?.changes || 0) === 1, 'cleanup_recovery_marker_compare_and_swap_failed');
  });
  const markerAfter = await database.getFirstAsync(
    'SELECT 1 AS present FROM ledger_v7_meta WHERE key=? LIMIT 1', markerKey(marker.namespace),
  );
  assertGate(!markerAfter, 'cleanup_recovery_marker_not_finalized');
  return { ok: true, namespacesCleaned: namespaces.length, recoveryMarkerFinalizedLast: true };
};

const sweepOrphanedRuns = async database => {
  let cursor = '';
  let swept = 0;
  while (true) {
    const page = [];
    const iterator = database.getEachAsync(
      `SELECT key,value FROM ledger_v7_meta
        WHERE key LIKE ? AND key>? ORDER BY key COLLATE BINARY LIMIT 33`,
      [`${MARKER_PREFIX}${LIVE_NAMESPACE_PREFIX}%`, cursor],
    );
    for await (const row of iterator) page.push({ key: text(row.key), value: row.value });
    if (!page.length) break;
    const hasMore = page.length > 32;
    const current = hasMore ? page.slice(0, 32) : page;
    for (const row of current) {
      const marker = parseRunMarker(row.value);
      assertGate(marker && row.key === markerKey(marker.namespace), 'orphan_marker_invalid');
      await cleanupBenchmarkMarker({ database, marker });
      swept += 1;
      cursor = row.key;
    }
    if (!hasMore) break;
  }
  const evidence = { swept, cleanupVerified: true };
  console.log('[P10_014A_ORPHAN_RECOVERY]', JSON.stringify(evidence));
  return evidence;
};

const insertFixtureTransactions = async ({ txn, namespace, variant, count }) => {
  for (let offset = 0; offset < count; offset += FIXTURE_SQL_BATCH_ROWS) {
    const batch = Math.min(FIXTURE_SQL_BATCH_ROWS, count - offset);
    const inserted = await txn.runAsync(
      `WITH RECURSIVE seq(n) AS (
         SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?
       ), generated(i,id) AS (
         SELECT ?+n, printf('%s-tx-%06d', ?, ?+n) FROM seq
       )
       INSERT INTO ledger_financial_transactions_v7
       (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
        idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
       SELECT ?,id,'expense','posted','personal','2026-01-01',?,NULL,'','',NULL,NULL,
              printf('%s-idem-%06d', ?, i),'p10-014a-fixture',1,NULL,NULL,NULL,
              json_object('id',id,'dateISO','2026-01-01','baseCurrencyCode','IQD','fixtureVariant',?),?,?
         FROM generated`,
      batch, offset, variant, offset,
      namespace, FIXTURE_TIMESTAMP, variant, variant, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP,
    );
    assertGate(Number(inserted?.changes || 0) === batch, 'fixture_transaction_insert_count_mismatch');

    const postings = await txn.runAsync(
      `WITH RECURSIVE seq(n) AS (
         SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?
       ), generated(i,tx_id,post_id) AS (
         SELECT ?+n,
                printf('%s-tx-%06d', ?, ?+n),
                printf('%s-post-%06d', ?, ?+n)
           FROM seq
       )
       INSERT INTO ledger_postings_v7
       (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
       SELECT ?,post_id,tx_id,'wallet-main','physical','principal',-1,'IQD',NULL,?
         FROM generated`,
      batch, offset, variant, offset, variant, offset, namespace, FIXTURE_TIMESTAMP,
    );
    assertGate(Number(postings?.changes || 0) === batch, 'fixture_posting_insert_count_mismatch');
  }
};

const insertFixtureArchive = async ({ txn, namespace, variant, count }) => {
  if (!count) return;
  const header = await txn.runAsync(
    `INSERT INTO cold_archive_years
     (namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json)
     VALUES (?,'personal',2025,?,'p10-014a-fixture',?,0,0,0,?)`,
    namespace, FIXTURE_TIMESTAMP, count, FIXTURE_ARCHIVE_METADATA,
  );
  assertGate(Number(header?.changes || 0) === 1, 'fixture_archive_header_insert_failed');
  for (let offset = 0; offset < count; offset += FIXTURE_SQL_BATCH_ROWS) {
    const batch = Math.min(FIXTURE_SQL_BATCH_ROWS, count - offset);
    const inserted = await txn.runAsync(
      `WITH RECURSIVE seq(n) AS (
         SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<?
       ), generated(i,id) AS (
         SELECT ?+n, printf('%s-archive-%06d', ?, ?+n) FROM seq
       )
       INSERT INTO cold_archive_transactions
       (namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json)
       SELECT ?,'personal',2025,id,'2025-01-01',i,'wallet-main','','expense','',
              json_object('id',id,'dateISO','2025-01-01','baseCurrencyCode','IQD','fixtureVariant',?)
         FROM generated`,
      batch, offset, variant, offset, namespace, variant,
    );
    assertGate(Number(inserted?.changes || 0) === batch, 'fixture_archive_row_insert_count_mismatch');
  }
};

const setupFixtureNamespace = async ({ database, namespace, variant, totalTransactions, sourceMode }) => {
  const hotTransactions = Math.floor(totalTransactions * 0.8);
  const coldArchiveTransactions = totalTransactions - hotTransactions;
  await withRestoreTransaction(database, async (txn, actions) => {
    await actions.clearFinancialNamespace(namespace);
    await actions.clearColdArchiveNamespace(namespace);
    await txn.runAsync(
      `INSERT OR IGNORE INTO ledger_currencies(code,minor_exponent,enabled) VALUES ('IQD',0,1)`,
    );
    await txn.runAsync(
      `INSERT INTO ledger_accounts_v7
       (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
       VALUES (?,'wallet-main','Benchmark wallet','asset','personal','IQD','active',?,?,NULL)`,
      namespace, FIXTURE_TIMESTAMP, FIXTURE_TIMESTAMP,
    );
    await txn.runAsync(
      `INSERT INTO ledger_workspace_state_v7
       (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
       VALUES (?,?,7,NULL,NULL,NULL,NULL,?,?)`,
      namespace, sourceMode, FIXTURE_WORKSPACE_PAYLOAD, FIXTURE_TIMESTAMP,
    );
    await insertFixtureTransactions({
      txn, namespace, variant, count: hotTransactions,
    });
    await insertFixtureArchive({
      txn, namespace, variant, count: coldArchiveTransactions,
    });
  });
  return { hotTransactions, coldArchiveTransactions };
};

const initializeRestoreStageWorkspace = async ({ database, sourceNamespace, stageNamespace }) => {
  await withRestoreTransaction(database, async txn => {
    const existing = await txn.getFirstAsync(
      'SELECT 1 AS present FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', stageNamespace,
    );
    assertGate(!existing, 'restore_stage_workspace_not_empty');
    const inserted = await txn.runAsync(
      `INSERT INTO ledger_workspace_state_v7
       (namespace,source_mode,schema_version,shadow_checksum,shadow_verified_at,cutover_at,last_reconciled_at,payload_json,updated_at)
       SELECT ?,'shadow',7,NULL,NULL,NULL,NULL,payload_json,?
         FROM ledger_workspace_state_v7 WHERE namespace=?`,
      stageNamespace, new Date().toISOString(), sourceNamespace,
    );
    assertGate(Number(inserted?.changes || 0) === 1, 'restore_stage_workspace_source_missing');
  });
};

const copyPrivateNamespaceBounded = async ({ database, sourceNamespace, targetNamespace }) => {
  const metrics = { batches: 0, maxBatchRows: 0, maxBatchBytes: 0 };
  for (const section of PRIVATE_COPY_SECTIONS) {
    let cursor = null;
    while (true) {
      const result = await withRestoreTransaction(database, txn => (
        copyBoundedFinancialNamespaceBatchInTransactionV13({
          database: txn,
          sourceNamespace,
          targetNamespace,
          section,
          cursor,
          maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
          maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
        })
      ));
      metrics.batches += 1;
      metrics.maxBatchRows = Math.max(metrics.maxBatchRows, Number(result.rows || 0));
      metrics.maxBatchBytes = Math.max(metrics.maxBatchBytes, Number(result.bytes || 0));
      if (!result.hasMore) break;
      assertGate(result.nextCursor, 'restore_stage_copy_cursor_missing');
      cursor = result.nextCursor;
    }
  }
  assertGate(metrics.maxBatchRows <= CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
    'restore_stage_batch_row_budget_exceeded');
  assertGate(metrics.maxBatchBytes <= CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes
    || metrics.maxBatchRows === 1, 'restore_stage_batch_byte_budget_exceeded');
  return metrics;
};

const buildCheckpointBounded = async ({ database, namespace, operationId, checkpointId }) => {
  let state = await withRestoreTransaction(database, txn => (
    initializeRestoreCheckpointInTransactionV13({ database: txn, namespace, operationId })
  ));
  const metrics = { batches: 0, maxBatchRows: 0, maxBatchBytes: 0 };
  while (state.status !== 'PROVING_CHECKPOINT') {
    state = await withRestoreTransaction(database, txn => (
      copyNextRestoreCheckpointBatchInTransactionV13({
        database: txn,
        namespace,
        checkpointId,
        maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
        maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
      })
    ));
    metrics.batches += 1;
    metrics.maxBatchRows = Math.max(metrics.maxBatchRows, Number(state.lastBatchRows || 0));
    metrics.maxBatchBytes = Math.max(metrics.maxBatchBytes, Number(state.lastBatchBytes || 0));
  }
  assertGate(metrics.maxBatchRows <= CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
    'checkpoint_batch_row_budget_exceeded');
  assertGate(metrics.maxBatchBytes <= CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes
    || metrics.maxBatchRows === 1, 'checkpoint_batch_byte_budget_exceeded');
  return metrics;
};

const recordSyntheticServerProof = async ({
  database, namespace, operationId, guard, authUserId, deviceId, allowRebind = false,
}) => {
  assertGate(P10_014A_LOCAL_FLAG && validBenchmarkNamespace(namespace), 'synthetic_proof_scope_invalid');
  const serverProof = {
    proofSource: SYNTHETIC_SERVER_PROOF_SOURCE,
    ok: true,
    outcome: 'advanced',
    eventId: uuid(),
    ownerId: authUserId,
    ledgerId: guard.snapshot.ledgerId,
    fromEpoch: guard.snapshot.sourceRestoreEpoch,
    toEpoch: guard.snapshot.sourceRestoreEpoch + 1,
    reason: 'backup_restore',
    deviceId,
    operationId,
    restoreProofDigest: guard.restoreProofDigest,
    provedAt: new Date().toISOString(),
  };
  assertGate(serverProof.proofSource === SYNTHETIC_SERVER_PROOF_SOURCE, 'synthetic_proof_label_missing');

  return withRestoreTransaction(database, async txn => {
    const key = syntheticProofKey(namespace, operationId);
    const existingMarker = await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key,
    );

    if (allowRebind) {
      // Dev-only instrumentation repair. The old implementation changed status
      // but kept stale immutable fields and attempted server proof before the
      // rebuild. Delete the stale dev intent + synthetic marker atomically, then
      // recreate the intent from the freshly re-derived production guard.
      const intentKey = `restore_intent:${namespace}`;
      const staleIntentRow = await txn.getFirstAsync(
        'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', intentKey,
      );
      assertGate(!!staleIntentRow?.value, 'rebind_intent_missing');
      const deletedIntent = await txn.runAsync(
        'DELETE FROM ledger_v7_meta WHERE key=? AND value=?',
        intentKey, String(staleIntentRow.value),
      );
      assertGate(Number(deletedIntent?.changes || 0) === 1, 'rebind_intent_delete_failed');

      if (existingMarker?.value != null) {
        const deletedMarker = await txn.runAsync(
          'DELETE FROM ledger_v7_meta WHERE key=? AND value=?',
          key, String(existingMarker.value),
        );
        assertGate(Number(deletedMarker?.changes || 0) === 1, 'rebind_marker_clear_failed');
      }

      await createStrategyBRestoreIntentV13InTransaction({
        database: txn,
        guardResult: guard,
        authUserId,
        deviceId,
        triggerKind: 'restore',
      });
    } else {
      assertGate(!existingMarker, 'synthetic_proof_marker_already_exists');
    }

    const intent = await recordStrategyBServerProofV13InTransaction({
      database: txn, namespace, operationId, serverProof,
    });
    const durableSyntheticEvidence = {
      version: 1,
      gate: P10_014A_GATE,
      cloudGate: P10_014B_GATE,
      namespace,
      operationId: text(operationId).toLowerCase(),
      ledgerId: guard.snapshot.ledgerId,
      fromEpoch: guard.snapshot.sourceRestoreEpoch,
      toEpoch: guard.snapshot.sourceRestoreEpoch + 1,
      serverEventId: text(serverProof.eventId).toLowerCase(),
      restoreProofDigest: guard.restoreProofDigest,
      serverProofSource: SYNTHETIC_SERVER_PROOF_SOURCE,
      cloudHandshakeAcceptance: 'NOT_TESTED',
      syntheticProofCountsAsCloudEvidence: false,
      recordedAt: new Date().toISOString(),
    };
    const inserted = await txn.runAsync(
      'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
      key, JSON.stringify(durableSyntheticEvidence), durableSyntheticEvidence.recordedAt,
    );
    assertGate(Number(inserted?.changes || 0) === 1, 'synthetic_proof_marker_write_failed');
    return { intent, durableSyntheticEvidence };
  });
};

const readPostPromotionState = async ({
  database, marker, tierId, incomingHash, incomingCounts, sourceEpoch, sourceGeneration,
}) => {
  const identity = await readLedgerSyncIdentityV8({
    namespace: marker.namespace,
    database,
    schemaReady: true,
  });
  assertGate(identity?.ledgerId === marker.ledgerId, 'post_promotion_identity_changed');
  const transactionState = await withRestoreTransaction(database, async txn => {
    const generation = await readLiveGenerationInTransactionV13({
      database: txn,
      namespace: marker.namespace,
      ledgerId: marker.ledgerId,
      restoreEpoch: identity.restoreEpoch,
    });
    const pointer = parseObject((await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
      `canonical_restore_undo_pointer_v13:${marker.namespace}`,
    ))?.value);
    const checkpoint = parseObject((await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
      `canonical_restore_checkpoint_v13:${marker.namespace}:${marker.checkpointId}`,
    ))?.value);
    const stageMeta = await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
      `canonical_restore_stage_v13:${marker.stageNamespace}`,
    );
    const stageWorkspace = await txn.getFirstAsync(
      'SELECT 1 AS present FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', marker.stageNamespace,
    );
    const syntheticProof = parseObject((await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
      syntheticProofKey(marker.namespace, marker.operationId),
    ))?.value);
    const promotion = parseObject((await txn.getFirstAsync(
      'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
      `canonical_restore_promotion_v13:${marker.namespace}`,
    ))?.value);
    return { generation, pointer, checkpoint, stageMeta, stageWorkspace, syntheticProof, promotion };
  });
  const liveCounts = await readNamespaceManifestCountsV13({ database, namespace: marker.namespace });
  const liveHash = await semanticHashNamespaceV3Bounded({
    database,
    namespace: marker.namespace,
    ledgerId: marker.ledgerId,
  });
  const semanticHashMatches = liveHash === incomingHash;
  const countsMatch = countsEqual(liveCounts, incomingCounts);
  if (!semanticHashMatches || !countsMatch) {
    const mismatch = await diagnosePostPromotionMismatch({
      database,
      liveNamespace: marker.namespace,
      incomingNamespace: marker.incomingSourceNamespace,
      liveCounts,
      incomingCounts,
      semanticHashMatches,
    });
    console.error('[P10_014A_POST_PROMOTION_DIFF]', JSON.stringify({
      tierId: text(tierId),
      semanticHashMatches,
      countsMatch,
      countFailedSections: mismatch.countFailedSections,
      semanticFailedSections: mismatch.semanticFailedSections,
    }));
  }
  const stageCounts = await readNamespaceManifestCountsV13({ database, namespace: marker.stageNamespace });
  const stageCleared = zeroCounts(stageCounts) && !transactionState.stageMeta && !transactionState.stageWorkspace;
  const checkpointReferenced = !!(
    transactionState.pointer
    && transactionState.pointer.checkpointId === marker.checkpointId
    && transactionState.pointer.checkpointNamespace === marker.checkpointNamespace
    && transactionState.checkpoint?.status === 'REFERENCED_FOR_UNDO'
  );
  const syntheticProofDurablyLabeled = !!(
    transactionState.syntheticProof
    && transactionState.syntheticProof.gate === P10_014A_GATE
    && transactionState.syntheticProof.cloudGate === P10_014B_GATE
    && transactionState.syntheticProof.namespace === marker.namespace
    && transactionState.syntheticProof.operationId === marker.operationId
    && transactionState.syntheticProof.ledgerId === marker.ledgerId
    && transactionState.syntheticProof.serverProofSource === SYNTHETIC_SERVER_PROOF_SOURCE
    && transactionState.syntheticProof.cloudHandshakeAcceptance === 'NOT_TESTED'
    && transactionState.syntheticProof.syntheticProofCountsAsCloudEvidence === false
    && transactionState.promotion
    && transactionState.syntheticProof.serverEventId === transactionState.promotion.serverEventId
    && transactionState.syntheticProof.restoreProofDigest === transactionState.promotion.restoreProofDigest
    && transactionState.syntheticProof.fromEpoch === transactionState.promotion.fromEpoch
    && transactionState.syntheticProof.toEpoch === transactionState.promotion.toEpoch
  );
  const evidence = {
    restoreEpochBefore: sourceEpoch,
    restoreEpochAfter: Number(identity.restoreEpoch),
    liveGenerationBefore: sourceGeneration,
    liveGenerationAfter: Number(transactionState.generation.generation),
    semanticHashMatches,
    countsMatch,
    stageCleared,
    undoCheckpointReferenced: checkpointReferenced,
    syntheticProofDurablyLabeled,
  };
  assertGate(evidence.restoreEpochAfter === evidence.restoreEpochBefore + 1, 'post_promotion_epoch_invalid', evidence);
  assertGate(evidence.liveGenerationAfter === evidence.liveGenerationBefore + 1, 'post_promotion_generation_invalid', evidence);
  assertGate(evidence.semanticHashMatches && evidence.countsMatch, 'post_promotion_semantic_mismatch', evidence);
  assertGate(evidence.stageCleared && evidence.undoCheckpointReferenced, 'post_promotion_cleanup_or_undo_invalid', evidence);
  assertGate(evidence.syntheticProofDurablyLabeled, 'synthetic_proof_durable_label_missing', evidence);
  return evidence;
};

const runTier = async ({ database, tier, baseToken }) => {
  const operationId = uuid();
  const checkpointId = uuid();
  const namespace = `${LIVE_NAMESPACE_PREFIX}${baseToken}-${tier.id}`;
  const incomingSourceNamespace = `${namespace}::shadow-stage::incoming-source`;
  const stageNamespace = `${namespace}::restore-stage::${operationId}`;
  const checkpointNamespace = `${namespace}::restore-checkpoint::${checkpointId}`;
  const authUserId = uuid();
  const deviceId = `p10-014a-${SYNTHETIC_SERVER_PROOF_SOURCE}`;
  let marker = {
    version: 1,
    gate: P10_014A_GATE,
    subgate: 'P10-014A-001_CORE',
    serverProofSource: SYNTHETIC_SERVER_PROOF_SOURCE,
    cloudHandshakeAcceptance: 'NOT_TESTED',
    namespace,
    incomingSourceNamespace,
    stageNamespace,
    checkpointId,
    checkpointNamespace,
    operationId,
    ledgerId: null,
    createdAt: new Date().toISOString(),
  };
  await writeRunMarker({ database, marker });

  let coreEvidence = null;
  let operationError = null;
  try {
    const liveFixture = await setupFixtureNamespace({
      database,
      namespace,
      variant: `live-${tier.id}`,
      totalTransactions: tier.transactions,
      sourceMode: 'sqlite',
    });
    const incomingFixture = await setupFixtureNamespace({
      database,
      namespace: incomingSourceNamespace,
      variant: `incoming-${tier.id}`,
      totalTransactions: tier.transactions,
      sourceMode: 'shadow',
    });
    assertGate(liveFixture.hotTransactions === incomingFixture.hotTransactions
      && liveFixture.coldArchiveTransactions === incomingFixture.coldArchiveTransactions,
    'fixture_shape_mismatch');

    const identity = await ensureLedgerSyncIdentityV8({ namespace, database });
    assertGate(identity?.ledgerId, 'benchmark_identity_missing');
    await withRestoreTransaction(database, txn => (
      registerLiveGenerationInTransactionV13({
        database: txn,
        namespace,
        ledgerId: identity.ledgerId,
        restoreEpoch: identity.restoreEpoch,
      })
    ));
    marker = { ...marker, ledgerId: identity.ledgerId };
    await writeRunMarker({ database, marker });

    const incomingProofStarted = nowMs();
    const incomingSqlProof = await proveRestoreNamespaceSqlV13({
      database,
      namespace: incomingSourceNamespace,
    });
    assertGate(incomingSqlProof.ok, 'incoming_source_sql_proof_failed', {
      issueCount: incomingSqlProof.issueCount,
    });
    const incomingCounts = await readNamespaceManifestCountsV13({
      database,
      namespace: incomingSourceNamespace,
    });
    const incomingHash = await semanticHashNamespaceV3Bounded({
      database,
      namespace: incomingSourceNamespace,
      ledgerId: identity.ledgerId,
    });
    const incomingSourceProofMs = nowMs() - incomingProofStarted;

    const snapshotStarted = nowMs();
    const snapshot = await withRestoreTransaction(database, txn => (
      captureRestoreStartSnapshotInTransactionV13({
        database: txn,
        namespace,
        operationId,
        stageNamespace,
        checkpointId,
        semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
        incomingSemanticHash: incomingHash,
        incomingCounts,
        validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
        batchPolicyVersion: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.version,
      })
    ));
    const startSnapshotMs = nowMs() - snapshotStarted;

    await initializeRestoreStageWorkspace({
      database, sourceNamespace: incomingSourceNamespace, stageNamespace,
    });
    const stageCopyStarted = nowMs();
    const stageCopyMetrics = await copyPrivateNamespaceBounded({
      database,
      sourceNamespace: incomingSourceNamespace,
      targetNamespace: stageNamespace,
    });
    const incomingStageCopyMs = nowMs() - stageCopyStarted;

    const stageProofStarted = nowMs();
    const stageSqlProof = await proveRestoreNamespaceSqlV13({ database, namespace: stageNamespace });
    assertGate(stageSqlProof.ok, 'restore_stage_sql_proof_failed', { issueCount: stageSqlProof.issueCount });
    const stageCounts = await readNamespaceManifestCountsV13({ database, namespace: stageNamespace });
    const stageHash = await semanticHashNamespaceV3Bounded({
      database,
      namespace: stageNamespace,
      ledgerId: identity.ledgerId,
    });
    assertGate(stageHash === incomingHash && countsEqual(stageCounts, incomingCounts),
      'restore_stage_semantic_mismatch');
    await withRestoreTransaction(database, txn => (
      writeCanonicalRestoreStageReadinessV13InTransaction({
        database: txn,
        namespace,
        stageNamespace,
        ledgerId: identity.ledgerId,
        semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
        semanticHash: stageHash,
        counts: stageCounts,
        validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
      })
    ));
    const incomingStageProofMs = nowMs() - stageProofStarted;

    const checkpointCopyStarted = nowMs();
    const checkpointMetrics = await buildCheckpointBounded({
      database, namespace, operationId, checkpointId,
    });
    const checkpointCopyMs = nowMs() - checkpointCopyStarted;

    const checkpointProofStarted = nowMs();
    const checkpointProof = await computeRestoreCheckpointProofV13({
      database, namespace, operationId,
    });
    const checkpointReady = await withRestoreTransaction(database, txn => (
      markRestoreCheckpointReadyInTransactionV13({
        database: txn,
        namespace,
        operationId,
        proof: checkpointProof,
      })
    ));
    assertGate(checkpointReady?.ok === true, checkpointReady?.reason || 'checkpoint_ready_failed');
    const checkpointProofMs = nowMs() - checkpointProofStarted;

    let writerDrainMs = 0;
    let preRpcRevalidationMs = 0;
    let syntheticServerProofRecordMs = 0;
    let atomicPromotionMs = 0;
    let promoted = null;
    let promotionPreconditions = null;
    const localFenceStarted = nowMs();
    await runFinancialMaintenanceTask({
      reason: 'p10_014a_local_strategy_b_final_fence',
      presentation: 'blocking',
    }, async () => {
      const drainStarted = nowMs();
      await withRestoreTransaction(database, async () => ({ ok: true }));
      writerDrainMs = nowMs() - drainStarted;

      const preRpcStarted = nowMs();
      const guard = await withRestoreTransaction(database, async txn => {
        const result = await guardRestoreSourceBeforeEpochRpcInTransactionV13({
          database: txn, namespace, operationId,
        });
        assertGate(result?.ok === true, result?.reason || 'pre_rpc_revalidation_failed');
        await createStrategyBRestoreIntentV13InTransaction({
          database: txn,
          guardResult: result,
          authUserId,
          deviceId,
          triggerKind: 'restore',
        });
        return result;
      });
      preRpcRevalidationMs = nowMs() - preRpcStarted;

      const syntheticStarted = nowMs();
      const syntheticRecord = await recordSyntheticServerProof({
        database, namespace, operationId, guard, authUserId, deviceId,
      });
      assertGate(
        syntheticRecord?.durableSyntheticEvidence?.serverProofSource === SYNTHETIC_SERVER_PROOF_SOURCE
          && syntheticRecord?.durableSyntheticEvidence?.syntheticProofCountsAsCloudEvidence === false,
        'synthetic_proof_durable_label_missing',
      );
      syntheticServerProofRecordMs = nowMs() - syntheticStarted;

      promotionPreconditions = await readPromotionPreconditionEvidence({
        database, namespace, operationId, guard,
      });
      console.log('[P10_014A_PROMOTION_PRECONDITION]', JSON.stringify({
        tierId: tier.id,
        allMatch: promotionPreconditions.allMatch,
        failedFields: promotionPreconditions.failedFields,
        guardDigestPrefix: promotionPreconditions.guardDigestPrefix,
      }));

      // Dev-only digest rebind. Re-derive using the exact production guard. The
      // rebind path now truly recreates the intent/proof if the digest changed.
      let activeGuard = guard;
      const rederiveStarted = nowMs();
      const rederivedGuard = await withRestoreTransaction(database, txn => (
        guardRestoreSourceBeforeEpochRpcInTransactionV13({ database: txn, namespace, operationId })
      ));
      assertGate(rederivedGuard?.ok === true, rederivedGuard?.reason || 'pre_promotion_rederive_failed');
      if (rederivedGuard.restoreProofDigest !== guard.restoreProofDigest) {
        console.log('[P10_014A_DIGEST_REBIND]', JSON.stringify({
          tierId: tier.id,
          previous: text(guard.restoreProofDigest).slice(0, 12),
          current: text(rederivedGuard.restoreProofDigest).slice(0, 12),
        }));
        await recordSyntheticServerProof({
          database, namespace, operationId, guard: rederivedGuard, authUserId, deviceId,
          allowRebind: true,
        });
        activeGuard = rederivedGuard;
      }
      const rebindMs = nowMs() - rederiveStarted;

      const postRebindPreconditions = await readPromotionPreconditionEvidence({
        database, namespace, operationId, guard: activeGuard,
      });
      console.log('[P10_014A_PRECONDITION_DIFF]', JSON.stringify({
        tierId: tier.id,
        allMatch: postRebindPreconditions.allMatch,
        failedFields: postRebindPreconditions.failedFields,
        guardDigestPrefix: postRebindPreconditions.guardDigestPrefix,
      }));
      assertGate(postRebindPreconditions.allMatch === true,
        'post_rebind_precondition_mismatch', {
          tierId: tier.id,
          failedFields: postRebindPreconditions.failedFields,
        });

      // One final fresh-guard transaction immediately before production
      // promotion. This catches any between-transaction state drift without
      // exposing financial payloads.
      const immediatePreconditions = await readPromotionPreconditionEvidence({
        database, namespace, operationId,
      });
      promotionPreconditions = immediatePreconditions;
      console.log('[P10_014A_PRE_PROMOTION_EXACT]', JSON.stringify({
        tierId: tier.id,
        allMatch: immediatePreconditions.allMatch,
        failedFields: immediatePreconditions.failedFields,
        guardDigestPrefix: immediatePreconditions.guardDigestPrefix,
      }));
      assertGate(immediatePreconditions.allMatch === true,
        'pre_promotion_exact_precondition_mismatch', {
          tierId: tier.id,
          failedFields: immediatePreconditions.failedFields,
        });

      const promotionStarted = nowMs();
      promoted = await promoteCanonicalRestoreStageV13({
        namespace, operationId, database,
      });
      atomicPromotionMs = nowMs() - promotionStarted;
      void rebindMs;

      if (promoted?.ok !== true) {
        const postFailurePreconditions = await readPromotionPreconditionEvidence({
          database, namespace, operationId,
        });
        console.error('[P10_014A_PROMOTION_POSTFAIL_DIFF]', JSON.stringify({
          tierId: tier.id,
          reason: text(promoted?.reason || 'unknown'),
          allMatch: postFailurePreconditions.allMatch,
          failedFields: postFailurePreconditions.failedFields,
          guardDigestPrefix: postFailurePreconditions.guardDigestPrefix,
        }));
      }
      assertGate(promoted?.ok === true, promoted?.reason || 'atomic_promotion_failed');
    });
    const localFinalFenceMs = nowMs() - localFenceStarted;

    const postProofStarted = nowMs();
    const postPromotion = await readPostPromotionState({
      database,
      marker,
      tierId: tier.id,
      incomingHash,
      incomingCounts,
      sourceEpoch: snapshot.sourceRestoreEpoch,
      sourceGeneration: snapshot.sourceLiveGeneration,
    });
    const postPromotionProofMs = nowMs() - postProofStarted;

    coreEvidence = {
      tierId: tier.id,
      configuredTransactions: tier.transactions,
      hotTransactions: liveFixture.hotTransactions,
      coldArchiveTransactions: liveFixture.coldArchiveTransactions,
      incomingSourceProofMs: roundMs(incomingSourceProofMs),
      startSnapshotMs: roundMs(startSnapshotMs),
      incomingStageCopyMs: roundMs(incomingStageCopyMs),
      incomingStageProofMs: roundMs(incomingStageProofMs),
      incomingStageBatches: stageCopyMetrics.batches,
      incomingStageMaxBatchRows: stageCopyMetrics.maxBatchRows,
      incomingStageMaxBatchBytes: stageCopyMetrics.maxBatchBytes,
      checkpointCopyMs: roundMs(checkpointCopyMs),
      checkpointProofMs: roundMs(checkpointProofMs),
      checkpointBatches: checkpointMetrics.batches,
      checkpointMaxBatchRows: checkpointMetrics.maxBatchRows,
      checkpointMaxBatchBytes: checkpointMetrics.maxBatchBytes,
      writerDrainMs: roundMs(writerDrainMs),
      preRpcRevalidationMs: roundMs(preRpcRevalidationMs),
      syntheticServerProofRecordMs: roundMs(syntheticServerProofRecordMs),
      promotionPreconditions,
      atomicPromotionMs: roundMs(atomicPromotionMs),
      localFinalFenceMs: roundMs(localFinalFenceMs),
      cloudHandshakeMs: null,
      cloudHandshakeAcceptance: 'NOT_TESTED',
      serverProofSource: SYNTHETIC_SERVER_PROOF_SOURCE,
      syntheticProofCountsAsCloudEvidence: false,
      networkCallPerformedByGate: false,
      postPromotionProofMs: roundMs(postPromotionProofMs),
      ...postPromotion,
      memoryEvidence: 'EXTERNAL_ADB_REQUIRED',
    };
    console.log('[P10_014A_TIER_CORE]', JSON.stringify(coreEvidence));
  } catch (error) {
    operationError = error;
    console.error('[P10_014A_TIER_FAIL]', JSON.stringify({ tierId: tier.id, ...safeError(error) }));
  }

  let cleanup = null;
  let cleanupErrorCaught = null;
  try {
    cleanup = await cleanupBenchmarkMarker({ database, marker });
  } catch (cleanupError) {
    cleanupErrorCaught = cleanupError;
    console.error('[P10_014A_CLEANUP_FAIL]', JSON.stringify({ tierId: tier.id, ...safeError(cleanupError) }));
  }
  if (operationError) throw operationError;
  if (cleanupErrorCaught) throw cleanupErrorCaught;
  const result = {
    ...coreEvidence,
    cleanupVerified: cleanup.ok === true,
    cleanupNamespaces: cleanup.namespacesCleaned,
    recoveryMarkerFinalizedLast: cleanup.recoveryMarkerFinalizedLast === true,
  };
  console.log('[P10_014A_TIER_RESULT]', JSON.stringify(result));
  await new Promise(resolve => setTimeout(resolve, 0));
  return result;
};

export async function runPhase10RestoreBenchmarkHarness({
  tierIds = REQUIRED_TIERS.map(item => item.id),
} = {}) {
  assertGate(Platform.OS === 'android' || Platform.OS === 'ios', 'native_platform_required');
  assertGate(PHASE10_RESTORE_BENCHMARK_ENABLED, 'acceptance_build_flags_required');
  assertGate(Array.isArray(tierIds) && tierIds.length > 0, 'tier_ids_required');
  const requested = tierIds.map(value => text(value));
  assertGate(requested.every(id => REQUIRED_TIER_MAP.has(id)), 'tier_ids_invalid');

  const database = await getLedgerDb();
  assertGate(database, 'database_unavailable');
  const cloneDatabaseBinding = await assertCloneDatabaseBinding(database);
  await ensureFinancialLedgerV7(database);
  const disposableGuard = await assertDisposableCurrentAccount(database);
  const orphanRecovery = await sweepOrphanedRuns(database);

  const base = {
    patchId: 'P10-014A-001-R5.2',
    gate: P10_014A_GATE,
    subgate: 'CORE_STRATEGY_B_DEVICE_PATH',
    acceptanceComplete: false,
    nextRequiredSubgate: 'P10-014A-002_FAULT_AND_RESOURCE_MATRIX',
    cloudGate: P10_014B_GATE,
    cloudHandshakeAcceptance: 'NOT_TESTED',
    serverProofSource: SYNTHETIC_SERVER_PROOF_SOURCE,
    syntheticProofCountsAsCloudEvidence: false,
    supabaseRpcCalledByGate: false,
    productionRestoreWiring: false,
    p10_012MigrationAppliedByGate: false,
    financialDataChangedOutsideBenchmarkNamespaces: false,
    sqliteSchemaChanged: false,
    secureStoreChanged: false,
    memoryEvidence: 'EXTERNAL_ADB_REQUIRED',
    cloneDatabaseOnly: P10_014A_CLONE_PROBE_FLAG,
    originalDatabaseMutationByHarness: false,
    cloneDatabaseBinding,
    disposableGuard,
    batchPolicy: {
      version: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.version,
      maxRows: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxRows,
      maxBytes: CANONICAL_ROW_SOURCE_V3_BATCH_POLICY.defaultMaxBytes,
    },
    orphanRecovery,
    startedAt: new Date().toISOString(),
  };

  const token = runToken();
  const tiers = [];
  for (const tierId of requested) {
    tiers.push(await runTier({ database, tier: REQUIRED_TIER_MAP.get(tierId), baseToken: token }));
  }
  const result = {
    ...base,
    ok: tiers.every(item => item.cleanupVerified && item.recoveryMarkerFinalizedLast
      && item.syntheticProofDurablyLabeled && item.semanticHashMatches && item.countsMatch
      && item.stageCleared && item.undoCheckpointReferenced),
    tiers,
    completedAt: new Date().toISOString(),
  };
  console.log('[P10_014A_LOCAL_STRATEGY_B_RESULT]', JSON.stringify(result, null, 2));
  return result;
}
