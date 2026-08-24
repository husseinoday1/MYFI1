// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS, normalizeCfg } from '../../lib/constants';
import { calcStats, catSpend } from '../../utils/calc';
import { getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { defaultScopeForProfile, getActiveScope, normalizeScope } from '../../lib/modules';
import { clearVaultSnapshot, getOrCreateDeviceId, GUEST_NAMESPACE, readVaultSnapshot, writeVaultSnapshot } from '../../lib/secureVault';
import { buildFinancialBackup, inspectBackupData, mergeFinancialBackupConfig, sanitizeBackupCategories } from '../../lib/backupData';
import {
  archivedWalletMovement,
  financialDataCount,
  normalizeDebtItems,
  normalizeGoalItems,
  prepareWalletData,
  stateFromSnapshot,
  sumAmt,
  yearOf,
} from '../domain';
import { buildPerformanceTestWorkspaceAsync, DEFAULT_PERFORMANCE_TEST_TIER } from '../../dev/performanceTestData';
import { clearPerformanceSnapshot, flushScheduledPerformanceSnapshot } from '../../dev/performanceTestStorage';
import { clearColdArchives, exportColdArchives, getColdArchiveNamespace, replaceColdArchives, storeColdArchiveYear, storeColdArchiveYears } from '../../lib/localArchiveRepository';
import { compareTransactionsNewestFirst } from '../../lib/transactionIndex';
import { activeLedgerSupported, clearLedgerNamespace, getLedgerNamespace, replaceLedgerSnapshot } from '../../lib/activeLedgerRepository';
import { archiveFinancialTransactionsV7, clearFinancialWorkspaceV7 } from '../../lib/financialLedgerV7Repository';
import { runFinancialOperationalCutoverV7, runFinancialShadowMigrationV7 } from '../../lib/financialLedgerV7Migration';
import { createCanonicalBackupV11 } from '../../lib/financialBackupV11';
import { decodeCanonicalBackupV11 } from '../../lib/financialBackupV11Decoder';
import {
  markCanonicalRestoreActivatedV13,
  resumeCanonicalRestoreProductionV13,
  startCanonicalRestoreProductionV13,
} from '../../lib/financialRestoreProductionV13';
import { advanceOrResolveFinancialRestoreEpochV3 } from '../../lib/financialRestoreEpochV3Client';
import { resolveCloudLedgerV2 } from '../../lib/financialMutationSyncV2';
import { supabase } from '../../lib/supabase';

const RESET_MARKER_PREFIX = 'MYFI_INTENTIONAL_RESET_V1';
const syncBaseNamespace = namespace => `sync-base:${String(namespace || GUEST_NAMESPACE)}`;
const backupRestoreRollbackNamespace = namespace => `backup-restore-rollback:${String(namespace || GUEST_NAMESPACE)}`;
const resetMarkerKey = namespace => `${RESET_MARKER_PREFIX}:${String(namespace || GUEST_NAMESPACE)}`;
const canonicalBackupCandidate = value => value?.kind === 'myfi_canonical_financial_backup';
const withRestoreNetworkTimeout = async (promise, code, timeoutMs = 10000) => {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const restoreAdapters = () => ({
  getAuthenticatedUserId: async () => {
    const result = await withRestoreNetworkTimeout(
      supabase.auth.getUser(), 'canonical_restore_authenticated_user_timeout',
    );
    return result?.data?.user?.id || null;
  },
  resolveCloudLedger: identity => withRestoreNetworkTimeout(
    resolveCloudLedgerV2({ supabase, identity }), 'canonical_restore_cloud_identity_timeout',
  ),
  advanceRestoreEpoch: operation => advanceOrResolveFinancialRestoreEpochV3({ supabase, operation }),
});

const stripPerformanceCfg = (cfg = {}) => {
  const {
    performanceTestMode,
    performanceTestTier,
    performanceTestTransactions,
    performanceTestActiveTransactions,
    performanceTestArchivedTransactions,
    performanceTestMonths,
    performanceTestModeKind,
    ...cleanCfg
  } = cfg || {};
  return cleanCfg;
};

export const createDataSlice = (set, get) => ({
  enterDemoMode: async (tierId = DEFAULT_PERFORMANCE_TEST_TIER) => {
    const current = get();
    const requestedTier = String(tierId || DEFAULT_PERFORMANCE_TEST_TIER);
    if (current.cfg.demoMode && current.cfg.performanceTestTier === requestedTier) return true;

    // Before entering test data, force a fresh encrypted snapshot of the real workspace.
    // Demo/test data is then stored only under STORAGE.DEMO_DATA and never sent to cloud sync.
    if (!current.cfg.demoMode) {
      await get().saveLocal({ force: true, dirty: current.dirty });
    }

    const builtDemoState = await buildPerformanceTestWorkspaceAsync(get().cfg, requestedTier);
    const performanceArchives = Array.isArray(builtDemoState.__performanceArchives)
      ? builtDemoState.__performanceArchives
      : [];
    const { __performanceArchives, ...demoState } = builtDemoState;
    const archiveNamespace = getColdArchiveNamespace(
      current.workspaceNamespace || GUEST_NAMESPACE,
      { ...demoState.cfg, performanceTestMode: true },
    );
    await clearColdArchives(archiveNamespace);
    let archivesStored = true;
    if (performanceArchives.length) {
      archivesStored = await storeColdArchiveYears({ namespace: archiveNamespace, archives: performanceArchives });
    }
    if (!archivesStored) {
      // Never drop fixture history because the cold database was unavailable.
      // Fall back to the legacy in-memory layout so the test remains complete.
      const restoredHistory = performanceArchives.flatMap(item => item?.data?.trans || []);
      demoState.trans = [...demoState.trans, ...restoredHistory].sort(compareTransactionsNewestFirst);
      demoState.wallets = performanceArchives[0]?.data?.wallets || demoState.wallets;
      demoState.cfg = {
        ...demoState.cfg,
        archiveSummaries: [],
        performanceTestActiveTransactions: demoState.trans.length,
        performanceTestArchivedTransactions: 0,
      };
    }
    if (activeLedgerSupported()) {
      const ledgerNamespace = getLedgerNamespace(
        current.workspaceNamespace || GUEST_NAMESPACE,
        demoState.cfg,
      );
      // Test workspaces use the lightweight V6 query ledger. A stale V7
      // cutover marker from an older test run would otherwise return zero
      // summaries while the visible fixture rows are present in History.
      await clearFinancialWorkspaceV7({ namespace: ledgerNamespace });
      const prepared = await replaceLedgerSnapshot({
        namespace: ledgerNamespace,
        transactions: demoState.trans,
        wallets: demoState.wallets,
        baseCurrency: demoState.cfg.currency,
      });
      if (!prepared) throw new Error('performance_active_ledger_prepare_failed');
    }
    set({ ...demoState, ledgerReady: activeLedgerSupported(), ledgerError: null });
    await get().saveLocal({ dirty: false });
    await flushScheduledPerformanceSnapshot();
    await AsyncStorage.setItem(STORAGE.DEMO_ACTIVE, JSON.stringify({
      active: true,
      namespace: get().workspaceNamespace || GUEST_NAMESPACE,
      tier: requestedTier,
      startedAt: new Date().toISOString(),
    }));
    return true;
  },
  exitDemoMode: async () => {
    const vault = await readVaultSnapshot(get().workspaceNamespace);
    const legacyRaw = !vault.snapshot ? await AsyncStorage.getItem(STORAGE.DEMO_REAL) : null;
    if (!vault.snapshot && !legacyRaw) {
      const current = get();
      const {
        performanceTestMode,
        performanceTestTier,
        performanceTestTransactions,
        performanceTestActiveTransactions,
        performanceTestArchivedTransactions,
        performanceTestMonths,
        ...realCfg
      } = current.cfg;
      const wallets = normalizeWallets([], current.cfg.currency);
      const defaultWalletId = getDefaultWalletId(wallets, current.cfg.currency, current.cfg.defaultWalletId);
      set({
        trans: [],
        debts: [],
        goals: [],
        wallets,
        commitments: [],
        cats: DEF_CATS,
        cfg: {
          ...realCfg,
          demoMode: false,
          defaultWalletId,
          archiveSummaries: [],
          categoryBudgets: {},
        },
        syncConflict: null,
        lastSyncError: null,
        dirty: true,
      });
      await clearColdArchives(getColdArchiveNamespace(get().workspaceNamespace || GUEST_NAMESPACE, { performanceTestMode: true }));
      if (activeLedgerSupported()) await clearLedgerNamespace(getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, { performanceTestMode: true }));
      await clearPerformanceSnapshot();
      await AsyncStorage.removeItem(STORAGE.DEMO_REAL);
      await get().saveLocal({ force: true, dirty: true });
      return true;
    }
    try {
      const snapshot = vault.snapshot || JSON.parse(legacyRaw);
      const loaded = stateFromSnapshot(snapshot, DEF_CFG);
      set({
        ...loaded,
        workspaceNamespace: get().workspaceNamespace,
        workspaceReady: true,
      });
      await clearColdArchives(getColdArchiveNamespace(get().workspaceNamespace || GUEST_NAMESPACE, { performanceTestMode: true }));
      if (activeLedgerSupported()) await clearLedgerNamespace(getLedgerNamespace(get().workspaceNamespace || GUEST_NAMESPACE, { performanceTestMode: true }));
      await clearPerformanceSnapshot();
      await AsyncStorage.removeItem(STORAGE.DEMO_REAL);
      return true;
    } catch {
      return false;
    }
  },

  resetAll: async (options = {}) => {
    // P19-015A2: destructive local reset owns the maintenance barrier.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'local_financial_reset',
        () => get().resetAll({ maintenanceOwned: true }),
      );
    }
    const current = get();
    if (current.user && current.financialLedgerV7Cutover) {
      // V1 cloud history has no restore epoch. Deleting the local ledger now
      // could allow old cloud mutations/snapshots to resurrect it on reconnect.
      // P19-008 replaces this interlock with the V2 restore-epoch handshake.
      set({
        lastSyncError: 'local_reset_requires_protocol_v2',
        restoreSafety: {
          status: 'restore_interlock_active',
          operation: 'delete_local_data',
          checkedAt: new Date().toISOString(),
        },
      });
      return false;
    }
    const namespace = current.workspaceNamespace || 'guest';
    const wallets = normalizeWallets([], current.cfg.currency);
    const defaultWalletId = getDefaultWalletId(wallets, current.cfg.currency, null);
    const resetCfg = {
      ...stripPerformanceCfg(current.cfg),
      demoMode: false,
      defaultWalletId,
      archiveSummaries: [],
      categoryBudgets: {},
    };
    const resetAt = new Date().toISOString();
    const namespacesToClear = [...new Set([namespace, GUEST_NAMESPACE])];
    try {
      for (const targetNamespace of namespacesToClear) {
        await AsyncStorage.setItem(resetMarkerKey(targetNamespace), JSON.stringify({
          legacyRecoveryDisabled: true,
          pendingCloudSync: targetNamespace === namespace && !!current.user,
          resetAt,
        }));
      }
    } catch (e) {
      console.warn('[STORE] resetAll marker', e);
    }
    set({
      trans: [],
      debts: [],
      goals: [],
      wallets,
      commitments: [],
      cats: DEF_CATS,
      cfg: resetCfg,
      syncConflict: null,
      lastSyncError: null,
      dirty: true,
    });
    try {
      const legacyKeys = Object.values(LEGACY_STORAGE_KEYS).flat();
      await clearColdArchives(getColdArchiveNamespace(namespace, current.cfg));
      await clearColdArchives(getColdArchiveNamespace(namespace, { ...current.cfg, performanceTestMode: true }));
      await clearPerformanceSnapshot();
      await AsyncStorage.multiRemove([
        STORAGE.DATA, STORAGE.CATS, STORAGE.ROLLBACK, STORAGE.DEMO_REAL, STORAGE.DEMO_DATA, STORAGE.DEMO_ACTIVE,
        ...legacyKeys,
      ]);
      for (const targetNamespace of namespacesToClear) {
        await AsyncStorage.setItem(resetMarkerKey(targetNamespace), JSON.stringify({
          legacyRecoveryDisabled: true,
          pendingCloudSync: targetNamespace === namespace && !!current.user,
          resetAt,
        }));
        await clearVaultSnapshot(targetNamespace);
        await clearVaultSnapshot(syncBaseNamespace(targetNamespace));
        if (activeLedgerSupported()) {
          await clearLedgerNamespace(getLedgerNamespace(targetNamespace, current.cfg));
          await clearLedgerNamespace(getLedgerNamespace(targetNamespace, { ...current.cfg, performanceTestMode: true }));
          await clearLedgerNamespace(getLedgerNamespace(syncBaseNamespace(targetNamespace), current.cfg));
          await clearFinancialWorkspaceV7({ namespace: getLedgerNamespace(targetNamespace, current.cfg) });
          await clearFinancialWorkspaceV7({ namespace: getLedgerNamespace(targetNamespace, { ...current.cfg, performanceTestMode: true }) });
          await clearFinancialWorkspaceV7({ namespace: getLedgerNamespace(syncBaseNamespace(targetNamespace), current.cfg) });
        }
      }
      if (activeLedgerSupported()) {
        const resetMigration = await runFinancialShadowMigrationV7({
          namespace: getLedgerNamespace(namespace, resetCfg),
          workspace: get(),
          coldArchives: [],
          forceReplace: true,
        });
        if (resetMigration.supported && !resetMigration.ok) {
          throw new Error(resetMigration.reason || 'financial_v7_reset_cutover_failed');
        }
        if (resetMigration.ok) {
          const cutover = await runFinancialOperationalCutoverV7({
            namespace: getLedgerNamespace(namespace, resetCfg),
            workspace: get(),
            coldArchives: [],
          });
          if (!cutover?.ok || !cutover?.cutover) {
            throw new Error(cutover?.reason || 'financial_v7_reset_cutover_failed');
          }
          set({
            financialLedgerV7Ready: true,
            financialLedgerV7Cutover: true,
            financialLedgerV7Checksum: cutover.checksum || resetMigration.checksum || null,
            financialLedgerV7Migration: cutover,
            ledgerError: null,
          });
        }
      }
      await get().saveLocal({ force: true, dirty: true });
    } catch (e) {
      console.error('[STORE] resetAll storage', e);
      return false;
    }

    if (current.user) {
      try {
        let synced = await get().syncCloud();
        if (!synced && get().syncConflict?.cloud) {
          const revision = Number(get().syncConflict.cloudRevision || 0);
          set({ cloudRevision: revision, syncConflict: null, dirty: true });
          await get().saveLocal({ force: true, dirty: true });
          synced = await get().syncCloud();
        }
        if (synced) {
          await AsyncStorage.setItem(resetMarkerKey(namespace), JSON.stringify({
            legacyRecoveryDisabled: true,
            pendingCloudSync: false,
            resetAt: new Date().toISOString(),
          }));
        }
      } catch (e) {
        console.error('[STORE] resetAll sync', e);
      }
    }

    const verify = get();
    const empty = !verify.trans.length && !verify.debts.length && !verify.goals.length && !verify.commitments.length;
    const namespacesToVerify = [...new Set([namespace, GUEST_NAMESPACE])];
    let vaultEmpty = true;
    for (const targetNamespace of namespacesToVerify) {
      const { snapshot } = await readVaultSnapshot(targetNamespace);
      if (financialDataCount(snapshot?.data || snapshot) > 0) {
        vaultEmpty = false;
        break;
      }
    }
    if (!empty || !vaultEmpty) {
      console.error('[STORE] resetAll verification failed');
      return false;
    }
    return true;
  },


  restoreLastBackupRollback: async () => {
    const current = get();
    if (current.user && current.financialLedgerV7Cutover) {
      return get().importBackup(null, { triggerKind: 'undo' });
    }
    const namespace = get().workspaceNamespace || GUEST_NAMESPACE;
    const { snapshot } = await readVaultSnapshot(backupRestoreRollbackNamespace(namespace));
    if (!snapshot?.backup) return false;
    const ok = await get().importBackup(JSON.stringify(snapshot.backup), { skipRollbackCheckpoint: true });
    if (ok) await clearVaultSnapshot(backupRestoreRollbackNamespace(namespace));
    return !!ok;
  },

  exportBackup: async () => {
    const {
      trans, debts, goals, wallets, commitments, cats, cfg, workspaceNamespace,
      user, financialLedgerV7Cutover,
    } = get();
    if (user && financialLedgerV7Cutover) {
      const canonical = await createCanonicalBackupV11({
        namespace: getLedgerNamespace(workspaceNamespace || GUEST_NAMESPACE, cfg),
      });
      if (!canonical?.ok || !canonical?.backup) {
        throw new Error(canonical?.reason || 'canonical_backup_export_failed');
      }
      const decoded = decodeCanonicalBackupV11(canonical.backup);
      if (!decoded?.ok) throw new Error(decoded?.reason || 'canonical_backup_export_preflight_failed');
      return JSON.stringify(canonical.backup);
    }
    const coldArchives = await exportColdArchives(
      getColdArchiveNamespace(workspaceNamespace || GUEST_NAMESPACE, cfg),
    );
    const backup = buildFinancialBackup({
      trans, debts, goals, wallets, commitments, cats, coldArchives, cfg,
    });

    const positiveRate = value => {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const deriveRate = (baseAmount, nativeAmount) => {
      const baseValue = Math.abs(Number(baseAmount));
      const nativeValue = Math.abs(Number(nativeAmount));
      return Number.isFinite(baseValue) && Number.isFinite(nativeValue) && baseValue > 0 && nativeValue > 0
        ? baseValue / nativeValue
        : null;
    };
    const repairFrozenFx = (transaction, walletList = []) => {
      if (!transaction || typeof transaction !== 'object') return transaction;
      const next = { ...transaction };
      const baseCurrency = String(next.baseCurrencyCode || backup.financialConfig?.currency || cfg.currency || 'IQD').toUpperCase();
      const walletCurrency = walletId => String(
        walletList.find(wallet => wallet?.id === walletId)?.currency || baseCurrency
      ).toUpperCase();

      if (next.kind === 'transfer') {
        const fromCurrency = String(next.fromCurrency || walletCurrency(next.fromWalletId)).toUpperCase();
        const toCurrency = String(next.toCurrency || walletCurrency(next.toWalletId)).toUpperCase();
        const sourceAmount = Math.abs(Number(next.transferFromAmount ?? next.transferAmount ?? 0));
        const targetAmount = Math.abs(Number(next.transferToAmount ?? next.transferAmount ?? 0));
        const directRate = positiveRate(next.transferRate ?? next.exchangeRate)
          || (sourceAmount > 0 && targetAmount > 0 ? targetAmount / sourceAmount : null);

        let fromBaseRate = positiveRate(next.fromBaseRate)
          || deriveRate(next.baseFromAmount ?? next.baseAmount, sourceAmount);
        let toBaseRate = positiveRate(next.toBaseRate)
          || deriveRate(next.baseToAmount, targetAmount);

        if (fromCurrency === toCurrency && fromCurrency !== baseCurrency) {
          fromBaseRate = fromBaseRate || toBaseRate;
          toBaseRate = toBaseRate || fromBaseRate;
        } else if (fromCurrency !== baseCurrency && toCurrency !== baseCurrency && directRate) {
          if (!fromBaseRate && toBaseRate) fromBaseRate = directRate * toBaseRate;
          if (!toBaseRate && fromBaseRate) toBaseRate = fromBaseRate / directRate;
        }

        if (fromCurrency !== baseCurrency && fromBaseRate) next.fromBaseRate = fromBaseRate;
        if (toCurrency !== baseCurrency && toBaseRate) next.toBaseRate = toBaseRate;

        const sourceResolved = fromCurrency === baseCurrency || positiveRate(next.fromBaseRate);
        const targetResolved = toCurrency === baseCurrency || positiveRate(next.toBaseRate);
        if (sourceResolved && targetResolved) {
          next.fxStatus = 'RESOLVED';
          next.unresolvedFxReason = null;
          if (next.fromBaseRate !== transaction.fromBaseRate || next.toBaseRate !== transaction.toBaseRate) {
            next.fxResolutionSource = next.fxResolutionSource || 'backup_derived_from_frozen_amounts';
          }
        }
        return next;
      }

      const nativeCurrency = String(
        next.walletCurrency
        || next.currencyCode
        || walletCurrency(next.walletId)
      ).toUpperCase();

      if (nativeCurrency !== baseCurrency && !positiveRate(next.exchangeRate)) {
        const derived = deriveRate(next.baseAmount ?? next.amt, next.walletAmount);
        if (derived) {
          next.exchangeRate = derived;
          next.fxStatus = 'RESOLVED';
          next.unresolvedFxReason = null;
          next.fxResolutionSource = next.fxResolutionSource || 'backup_derived_from_frozen_amounts';
        }
      }
      return next;
    };

    const repairCollection = (collection, walletList) => (
      Array.isArray(collection) ? collection.map(item => repairFrozenFx(item, walletList)) : collection
    );

    if (backup.financialData && typeof backup.financialData === 'object') {
      const walletList = Array.isArray(backup.financialData.wallets) ? backup.financialData.wallets : wallets;
      backup.financialData = {
        ...backup.financialData,
        trans: repairCollection(backup.financialData.trans, walletList),
      };
    } else {
      backup.trans = repairCollection(backup.trans, backup.wallets || wallets);
    }

    if (Array.isArray(backup.coldArchives)) {
      backup.coldArchives = backup.coldArchives.map(archive => {
        const archiveWallets = Array.isArray(archive?.data?.wallets)
          ? archive.data.wallets
          : (backup.financialData?.wallets || backup.wallets || wallets);
        return {
          ...archive,
          data: archive?.data
            ? {
                ...archive.data,
                trans: repairCollection(archive.data.trans, archiveWallets),
              }
            : archive?.data,
        };
      });
    }

    const serialized = JSON.stringify(backup);
    const roundTrip = JSON.parse(serialized);
    const validation = inspectBackupData(roundTrip);
    if (!validation.valid) {
      throw new Error(`backup_export_preflight_failed:${validation.errors[0] || 'invalid_backup'}`);
    }
    return serialized;
  },

  buildYearArchive: (year, requestedScope = null) => {
    const targetYear = Number(year);
    if (!Number.isInteger(targetYear) || targetYear >= new Date().getFullYear()) return null;
    const { trans, debts, goals, wallets, commitments, cats, cfg } = get();
    const fallbackScope = defaultScopeForProfile(cfg.profileType);
    const archiveScope = requestedScope || getActiveScope(cfg);
    const inArchiveScope = item => (
      archiveScope === 'all'
      || normalizeScope(item?.scope, fallbackScope) === archiveScope
    );
    const archivedTrans = trans.filter(item => yearOf(item.dateISO) === targetYear && inArchiveScope(item));
    if (!archivedTrans.length) return null;
    return {
      trans: archivedTrans,
      debts: debts.filter(inArchiveScope),
      goals: goals.filter(inArchiveScope),
      wallets: wallets.filter(inArchiveScope),
      commitments: commitments.filter(inArchiveScope),
      cats,
      archiveScope,
      cfg: {
        ...cfg,
        archiveYear: targetYear,
        archiveScope,
        archiveSummaries: undefined,
      },
    };
  },

  commitYearArchive: async (year, packageChecksum = '', requestedScope = null, options = {}) => {
    // P19-015A2: archive moves hot/cold financial state under one maintenance barrier.
    if (!options?.maintenanceOwned) {
      return get().runFinancialMaintenance(
        'year_archive',
        () => get().commitYearArchive(year, packageChecksum, requestedScope, { maintenanceOwned: true }),
      );
    }
    const targetYear = Number(year);
    if (!Number.isInteger(targetYear) || targetYear >= new Date().getFullYear()) return false;
    const current = get();
    const fallbackScope = defaultScopeForProfile(current.cfg.profileType);
    const archiveScope = requestedScope || getActiveScope(current.cfg);
    const inArchiveScope = item => (
      archiveScope === 'all'
      || normalizeScope(item?.scope, fallbackScope) === archiveScope
    );
    const archivedTrans = current.trans.filter(item => yearOf(item.dateISO) === targetYear && inArchiveScope(item));
    if (!archivedTrans.length) return false;
    const scopedWallets = current.wallets.filter(inArchiveScope);
    const defaultWalletId = getDefaultWalletId(scopedWallets, current.cfg.currency, current.cfg.defaultWalletId);
    const movement = archivedWalletMovement(archivedTrans, scopedWallets, defaultWalletId);
    const stats = calcStats(archivedTrans);
    const categories = catSpend(archivedTrans, get().cats).map(item => ({
      id: item.id,
      label: item.label,
      labelEn: item.labelEn,
      color: item.color,
      spent: item.spent,
    }));
    const summary = {
      year: targetYear,
      scope: archiveScope,
      archivedAt: new Date().toISOString(),
      checksum: packageChecksum,
      count: archivedTrans.length,
      income: stats.inc,
      expense: stats.exp,
      net: stats.bal,
      categories,
    };
    const nextTrans = current.trans.filter(item => !(yearOf(item.dateISO) === targetYear && inArchiveScope(item)));
    const nextWallets = current.wallets.map(wallet => ({
      ...wallet,
      openingBalance: Number(wallet.openingBalance || 0)
        + (inArchiveScope(wallet) ? Number(movement.get(wallet.id) || 0) : 0),
    }));
    const nextDebts = current.debts.map(debt => {
      if (!inArchiveScope(debt)) return debt;
      const archivedPayments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) === targetYear);
      const payments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) !== targetYear);
      const archivedPaid = Number(debt.archivedPaid || 0) + sumAmt(archivedPayments);
      return { ...debt, archivedPaid, payments, paid: archivedPaid + sumAmt(payments) };
    });
    const nextGoals = current.goals.map(goal => {
      if (!inArchiveScope(goal)) return goal;
      const archivedSavings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) === targetYear);
      const savings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) !== targetYear);
      const archivedSaved = Number(goal.archivedSaved || 0) + sumAmt(archivedSavings);
      return { ...goal, archivedSaved, savings, cur: Math.min(goal.target, archivedSaved + sumAmt(savings)) };
    });
    const nextCfg = {
      ...current.cfg,
      archiveSummaries: [
        ...(current.cfg.archiveSummaries || []).filter(item => !(
          item.year === targetYear
          && (item.scope || defaultScopeForProfile(current.cfg.profileType)) === archiveScope
        )),
        summary,
      ].sort((a, b) => b.year - a.year || String(a.scope || '').localeCompare(String(b.scope || ''))),
    };
    // Persist the detailed year locally in indexed SQLite BEFORE removing it
    // from the hot workspace array. If this fails, archiving aborts with the
    // active data untouched (Zero Data Loss boundary).
    try {
      const archiveStored = await storeColdArchiveYear({
        namespace: getColdArchiveNamespace(current.workspaceNamespace || GUEST_NAMESPACE, current.cfg),
        year: targetYear,
        scope: archiveScope,
        checksum: packageChecksum,
        summary,
        data: {
          trans: archivedTrans,
          debts: current.debts.filter(inArchiveScope),
          goals: current.goals.filter(inArchiveScope),
          wallets: current.wallets.filter(inArchiveScope),
          commitments: current.commitments.filter(inArchiveScope),
          cats: current.cats,
          archiveScope,
          cfg: { ...current.cfg, archiveYear: targetYear, archiveScope, archiveSummaries: undefined },
        },
      });
      if (!archiveStored) return false;
      const v7Archive = await archiveFinancialTransactionsV7({
        namespace: getLedgerNamespace(current.workspaceNamespace || GUEST_NAMESPACE, current.cfg),
        transactionIds: archivedTrans.map(item => item.id),
        year: targetYear,
        archivedAt: summary.archivedAt,
        entityChanges: [
          ...nextWallets.filter(inArchiveScope).map(payload => ({ entityType: 'wallet', id: payload.id, payload })),
          ...nextDebts.filter(inArchiveScope).map(payload => ({ entityType: 'debt', id: payload.id, payload })),
          ...nextGoals.filter(inArchiveScope).map(payload => ({ entityType: 'goal', id: payload.id, payload })),
          {
            entityType: 'workspace', id: 'workspace',
            payload: { cfg: nextCfg, notif: current.notif || {}, cloudRevision: Number(current.cloudRevision || 0) },
          },
        ],
      });
      if (v7Archive.supported && (!v7Archive.ok || v7Archive.changed !== archivedTrans.length)) {
        console.error('[STORE] V7 archive verification failed', v7Archive);
        return false;
      }
    } catch (error) {
      console.error('[STORE] cold archive write failed', error);
      return false;
    }
    set({ trans: nextTrans, wallets: nextWallets, debts: nextDebts, goals: nextGoals, cfg: nextCfg });
    await get().saveLocal();
    await get().syncCloud();
    return true;
  },

  importBackup: async (jsonStr, options = {}) => {
    // P19-015A2: backup restore owns the maintenance barrier.
    if (!options?.maintenanceOwned) {
      let candidate = null;
      if (options?.triggerKind !== 'undo') {
        try { candidate = JSON.parse(jsonStr); } catch { return false; }
      }
      const productionRestore = options?.triggerKind === 'undo'
        || (canonicalBackupCandidate(candidate) && !!get().user && get().financialLedgerV7Cutover);
      if (productionRestore) {
        const synced = await get().syncCloud();
        if (!synced) {
          set({ lastSyncError: 'canonical_restore_preflight_sync_failed' });
          return false;
        }
      }
      const result = await get().runFinancialMaintenance(
        'backup_restore',
        () => get().importBackup(jsonStr, { ...(options || {}), maintenanceOwned: true }),
        { resumeSync: !productionRestore, presentation: 'blocking' },
      );
      if (!productionRestore) return result;
      if (!result?.ok || !result?.promoted) return false;
      const activation = await get().activateFinancialSyncV2();
      if (!activation?.ok) {
        set({
          lastSyncError: activation?.reason || 'canonical_restore_activation_pending',
          restoreSafety: {
            status: 'restore_activation_required',
            operation: 'backup_restore',
            operationId: result.operationId,
            checkedAt: new Date().toISOString(),
          },
        });
        return false;
      }
      const marked = await markCanonicalRestoreActivatedV13({
        namespace: result.namespace,
        operationId: result.operationId,
        activation,
      });
      if (!marked?.ok) {
        set({ lastSyncError: marked?.reason || 'canonical_restore_completion_evidence_failed' });
        return false;
      }
      set({
        lastSyncError: null,
        restoreSafety: {
          status: 'restore_complete',
          operation: 'backup_restore',
          operationId: result.operationId,
          triggerKind: result.triggerKind,
          checkedAt: new Date().toISOString(),
        },
      });
      return true;
    }
    let rollback = null;
    try {
      const data = options?.triggerKind === 'undo' ? null : JSON.parse(jsonStr);
      const current = get();
      if (options?.triggerKind === 'undo' || canonicalBackupCandidate(data)) {
        if (!current.user || !current.financialLedgerV7Cutover) {
          set({ lastSyncError: 'canonical_restore_signed_in_v2_required' });
          return false;
        }
        const namespace = getLedgerNamespace(
          current.workspaceNamespace || GUEST_NAMESPACE, current.cfg,
        );
        const deviceId = await getOrCreateDeviceId();
        const restored = await startCanonicalRestoreProductionV13({
          candidate: data,
          namespace,
          authUserId: current.user.id,
          deviceId,
          adapters: restoreAdapters(),
          triggerKind: options?.triggerKind === 'undo' ? 'undo' : 'restore',
        });
        if (!restored?.ok || !restored?.promoted) {
          set({
            lastSyncError: restored?.reason || 'canonical_restore_failed',
            restoreSafety: {
              status: restored?.pending ? 'restore_recovery_required' : 'restore_blocked',
              operation: 'backup_restore',
              checkedAt: new Date().toISOString(),
            },
          });
          return restored;
        }
        await get().loadLocal(
          current.workspaceNamespace || GUEST_NAMESPACE,
          { allowLegacy: false, maintenanceOwned: true },
        );
        return restored;
      }
      const validation = inspectBackupData(data);
      if (!validation.valid) throw new Error(validation.errors[0] || 'invalid_backup');
      const restoredCollections = Number(data.v || 0) >= 10 ? data.financialData : data;

      if (current.user && current.financialLedgerV7Cutover) {
        set({
          lastSyncError: 'backup_restore_requires_protocol_v2',
          restoreSafety: {
            status: 'restore_interlock_active',
            operation: 'backup_restore',
            checkedAt: new Date().toISOString(),
          },
        });
        return false;
      }
      const coldArchiveNamespace = getColdArchiveNamespace(
        current.workspaceNamespace || GUEST_NAMESPACE,
        current.cfg,
      );
      const rollbackColdArchives = await exportColdArchives(coldArchiveNamespace);
      rollback = {
        trans: current.trans,
        debts: current.debts,
        goals: current.goals,
        wallets: current.wallets,
        commitments: current.commitments,
        cats: current.cats,
        cfg: current.cfg,
        notif: current.notif,
        workspaceNamespace: current.workspaceNamespace,
        financialLedgerV7Ready: current.financialLedgerV7Ready,
        financialLedgerV7Cutover: current.financialLedgerV7Cutover,
        financialLedgerV7Checksum: current.financialLedgerV7Checksum,
        financialLedgerV7Migration: current.financialLedgerV7Migration,
        coldArchiveNamespace,
        coldArchives: rollbackColdArchives,
      };

      const coldRestored = await replaceColdArchives(coldArchiveNamespace, data.coldArchives || []);
      if (!coldRestored) throw new Error('backup_cold_archive_restore_failed');

      // Backups restore the financial workspace only. Identity, account,
      // device presentation, security and notification preferences stay local.
      const importedFinancialCfg = mergeFinancialBackupConfig(
        current.cfg,
        data.financialConfig || data.cfg || {},
      );
      const prepared = prepareWalletData({
        wallets: restoredCollections.wallets,
        trans: restoredCollections.trans || [],
        commitments: restoredCollections.commitments,
        cfg: normalizeCfg(importedFinancialCfg),
      });

      set({
        trans: prepared.trans,
        debts: normalizeDebtItems(restoredCollections.debts, defaultScopeForProfile(prepared.cfg.profileType)),
        goals: normalizeGoalItems(restoredCollections.goals, defaultScopeForProfile(prepared.cfg.profileType)),
        wallets: prepared.wallets,
        commitments: prepared.commitments,
        cats: sanitizeBackupCategories(restoredCollections.cats, DEF_CATS),
        cfg: prepared.cfg,
        notif: current.notif,
      });

      if (activeLedgerSupported()) {
        const restoredState = get();
        const cutover = await runFinancialOperationalCutoverV7({
          namespace: getLedgerNamespace(restoredState.workspaceNamespace || GUEST_NAMESPACE, restoredState.cfg),
          workspace: restoredState,
          coldArchives: data.coldArchives || [],
          forceReplace: true,
          resetPendingOutbox: true,
        });
        if (!cutover?.ok || !cutover?.cutover) throw new Error(cutover?.reason || 'backup_v7_restore_parity_failed');
        set({
          financialLedgerV7Ready: true,
          financialLedgerV7Cutover: true,
          financialLedgerV7Checksum: cutover.checksum || null,
          financialLedgerV7Migration: cutover,
          ledgerError: null,
          dirty: true,
        });
        await get().loadLocal(restoredState.workspaceNamespace || GUEST_NAMESPACE, { allowLegacy: false, maintenanceOwned: true }); // P19-015A2 backup restore reload
        set({ dirty: true });
      } else {
        await get().saveLocal({ force: true, dirty: true });
      }

      if (current.user) {
        let synced = await get().syncCloud();

        if (!synced && get().syncConflict?.cloud) {
          const conflict = get().syncConflict;
          set({
            cloudRevision: Number(conflict.cloudRevision || 0),
            syncConflict: null,
            dirty: true,
            lastSyncError: null,
          });
          await get().saveLocal({ force: true, dirty: true });
          synced = await get().syncCloud();
        }

        if (!synced) {
          set({ dirty: true, lastSyncError: 'backup_restore_sync_pending' });
          await get().saveLocal({ force: true, dirty: true });
        }
      }

      if (!options.skipRollbackCheckpoint && rollback) {
        const { coldArchiveNamespace: _rollbackNamespace, coldArchives: rollbackColdArchives, ...rollbackState } = rollback;
        const rollbackBackup = buildFinancialBackup({
          trans: rollbackState.trans,
          debts: rollbackState.debts,
          goals: rollbackState.goals,
          wallets: rollbackState.wallets,
          commitments: rollbackState.commitments,
          cats: rollbackState.cats,
          coldArchives: rollbackColdArchives,
          cfg: rollbackState.cfg,
        });
        await writeVaultSnapshot(
          backupRestoreRollbackNamespace(current.workspaceNamespace || GUEST_NAMESPACE),
          { v: 1, type: 'backup_restore', createdAt: new Date().toISOString(), backup: rollbackBackup },
          { force: true },
        );
      }

      return true;
    } catch (e) {
      console.error('[STORE] importBackup', e);
      if (rollback) {
        const { coldArchiveNamespace, coldArchives, ...stateRollback } = rollback;
        set(stateRollback);
        try {
          await replaceColdArchives(coldArchiveNamespace, coldArchives || []);
          if (activeLedgerSupported() && stateRollback.financialLedgerV7Cutover) {
            await get().loadLocal(stateRollback.workspaceNamespace || get().workspaceNamespace || GUEST_NAMESPACE, { allowLegacy: false, maintenanceOwned: true }); // P19-015A2 rollback reload
          } else {
            await get().saveLocal({ force: true });
          }
        } catch {}
      }
      return false;
    }
  },

  resumeCanonicalRestoreProduction: async () => {
    const current = get();
    if (!current.user || current.cfg.demoMode || !current.workspaceReady || !current.financialLedgerV7Cutover) {
      return { supported: true, ok: false, pending: false, reason: 'canonical_restore_resume_not_eligible' };
    }
    const namespace = getLedgerNamespace(
      current.workspaceNamespace || GUEST_NAMESPACE, current.cfg,
    );
    const result = await get().runFinancialMaintenance(
      'backup_restore_resume',
      async () => {
        const resumed = await resumeCanonicalRestoreProductionV13({
          namespace,
          authUserId: get().user?.id,
          adapters: restoreAdapters(),
        });
        if (resumed?.ok && resumed?.promoted && resumed?.activationRequired) {
          await get().loadLocal(
            current.workspaceNamespace || GUEST_NAMESPACE,
            { allowLegacy: false, maintenanceOwned: true },
          );
        }
        return resumed;
      },
      { resumeSync: false, presentation: 'blocking' },
    );
    if (!result?.ok || !result?.promoted || !result?.activationRequired) return result;
    const activation = await get().activateFinancialSyncV2();
    if (!activation?.ok) return { ...result, ok: false, reason: activation?.reason || 'canonical_restore_activation_pending' };
    const marked = await markCanonicalRestoreActivatedV13({
      namespace: result.namespace,
      operationId: result.operationId,
      activation,
    });
    if (!marked?.ok) return { ...result, ok: false, reason: marked?.reason };
    set({ lastSyncError: null, restoreSafety: {
      status: 'restore_complete', operation: 'backup_restore', operationId: result.operationId,
      triggerKind: result.triggerKind, checkedAt: new Date().toISOString(),
    } });
    return { ...result, activationComplete: true };
  },
});
