// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_PERFORMANCE_DATA_PERSISTENCE_V5_1_1
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS, normalizeCfg } from '../../lib/constants';
import { calcStats, catSpend } from '../../utils/calc';
import { getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { defaultScopeForProfile, getActiveScope, normalizeScope } from '../../lib/modules';
import { clearVaultSnapshot, GUEST_NAMESPACE, readVaultSnapshot } from '../../lib/secureVault';
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

const RESET_MARKER_PREFIX = 'MYFI_INTENTIONAL_RESET_V1';
const syncBaseNamespace = namespace => `sync-base:${String(namespace || GUEST_NAMESPACE)}`;
const resetMarkerKey = namespace => `${RESET_MARKER_PREFIX}:${String(namespace || GUEST_NAMESPACE)}`;

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

  resetAll: async () => {
    const current = get();
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

  exportBackup: async () => {
    const { trans, debts, goals, wallets, commitments, cats, cfg, workspaceNamespace } = get();
    const coldArchives = await exportColdArchives(
      getColdArchiveNamespace(workspaceNamespace || GUEST_NAMESPACE, cfg),
    );
    return JSON.stringify(buildFinancialBackup({
      trans, debts, goals, wallets, commitments, cats, coldArchives, cfg,
    }));
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

  commitYearArchive: async (year, packageChecksum = '', requestedScope = null) => {
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

  importBackup: async (jsonStr) => {
    let rollback = null;
    try {
      const data = JSON.parse(jsonStr);
      const validation = inspectBackupData(data);
      if (!validation.valid) throw new Error(validation.errors[0] || 'invalid_backup');
      const restoredCollections = Number(data.v || 0) >= 10 ? data.financialData : data;

      const current = get();
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
        await get().loadLocal(restoredState.workspaceNamespace || GUEST_NAMESPACE, { allowLegacy: false });
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

      return true;
    } catch (e) {
      console.error('[STORE] importBackup', e);
      if (rollback) {
        const { coldArchiveNamespace, coldArchives, ...stateRollback } = rollback;
        set(stateRollback);
        try {
          await replaceColdArchives(coldArchiveNamespace, coldArchives || []);
          if (activeLedgerSupported() && stateRollback.financialLedgerV7Cutover) {
            await get().loadLocal(stateRollback.workspaceNamespace || get().workspaceNamespace || GUEST_NAMESPACE, { allowLegacy: false });
          } else {
            await get().saveLocal({ force: true });
          }
        } catch {}
      }
      return false;
    }
  },
});
