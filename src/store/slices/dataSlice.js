import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE, DEF_CATS, DEF_CFG, DEF_NOTIF, LEGACY_STORAGE_KEYS, normalizeCfg } from '../../lib/constants';
import { calcStats, catSpend } from '../../utils/calc';
import { getDefaultWalletId, normalizeWallets } from '../../lib/wallets';
import { defaultScopeForProfile, getActiveScope, normalizeScope } from '../../lib/modules';
import { clearVaultSnapshot, GUEST_NAMESPACE, readVaultSnapshot } from '../../lib/secureVault';
import { inspectBackupData, MYFI_BACKUP_DATA_VERSION, normalizeBackupNotifications, sanitizeBackupCategories } from '../../lib/backupData';
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
import { buildDemoWorkspace } from '../demoData';

export const createDataSlice = (set, get) => ({
  enterDemoMode: async () => {
    if (get().cfg.demoMode) return true;
    // The real workspace is already encrypted in the vault. Demo data never overwrites it.
    set(buildDemoWorkspace(get().cfg));
    await get().saveLocal();
    return true;
  },
  exitDemoMode: async () => {
    const vault = await readVaultSnapshot(get().workspaceNamespace);
    const legacyRaw = !vault.snapshot ? await AsyncStorage.getItem(STORAGE.DEMO_REAL) : null;
    if (!vault.snapshot && !legacyRaw) {
      const current = get();
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
          ...current.cfg,
          demoMode: false,
          defaultWalletId,
          archiveSummaries: [],
          categoryBudgets: {},
        },
        syncConflict: null,
        lastSyncError: null,
        dirty: true,
      });
      await AsyncStorage.multiRemove([STORAGE.DEMO_REAL, STORAGE.DEMO_DATA]);
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
      await AsyncStorage.multiRemove([STORAGE.DEMO_REAL, STORAGE.DEMO_DATA]);
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
      ...current.cfg,
      demoMode: false,
      defaultWalletId,
      archiveSummaries: [],
      categoryBudgets: {},
    };
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
      await AsyncStorage.multiRemove([
        STORAGE.DATA, STORAGE.CATS, STORAGE.ROLLBACK, STORAGE.DEMO_REAL, STORAGE.DEMO_DATA,
        ...legacyKeys,
      ]);
      const resetAt = new Date().toISOString();
      const namespacesToClear = [...new Set([namespace, GUEST_NAMESPACE])];
      for (const targetNamespace of namespacesToClear) {
        await AsyncStorage.setItem(`MYFI_INTENTIONAL_RESET_V1:${targetNamespace}`, JSON.stringify({
          legacyRecoveryDisabled: true,
          pendingCloudSync: targetNamespace === namespace && !!current.user,
          resetAt,
        }));
        await clearVaultSnapshot(targetNamespace);
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
          await AsyncStorage.setItem(`MYFI_INTENTIONAL_RESET_V1:${namespace}`, JSON.stringify({
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

  exportBackup: () => {
    const { trans, debts, goals, wallets, commitments, cats, cfg, notif } = get();
    return JSON.stringify({
      trans, debts, goals, wallets, commitments, cats, cfg, notif,
      exportedAt: new Date().toISOString(),
      v: MYFI_BACKUP_DATA_VERSION,
    });
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
    set(state => ({
      trans: state.trans.filter(item => !(yearOf(item.dateISO) === targetYear && inArchiveScope(item))),
      wallets: state.wallets.map(wallet => ({
        ...wallet,
        openingBalance: Number(wallet.openingBalance || 0)
          + (inArchiveScope(wallet) ? Number(movement.get(wallet.id) || 0) : 0),
      })),
      debts: state.debts.map(debt => {
        if (!inArchiveScope(debt)) return debt;
        const archivedPayments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) === targetYear);
        const payments = (debt.payments || []).filter(payment => yearOf(payment.date || payment.dateISO) !== targetYear);
        const archivedPaid = Number(debt.archivedPaid || 0) + sumAmt(archivedPayments);
        return { ...debt, archivedPaid, payments, paid: archivedPaid + sumAmt(payments) };
      }),
      goals: state.goals.map(goal => {
        if (!inArchiveScope(goal)) return goal;
        const archivedSavings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) === targetYear);
        const savings = (goal.savings || []).filter(saving => yearOf(saving.date || saving.dateISO) !== targetYear);
        const archivedSaved = Number(goal.archivedSaved || 0) + sumAmt(archivedSavings);
        return { ...goal, archivedSaved, savings, cur: Math.min(goal.target, archivedSaved + sumAmt(savings)) };
      }),
      cfg: {
        ...state.cfg,
        archiveSummaries: [
          ...(state.cfg.archiveSummaries || []).filter(item => !(
            item.year === targetYear
            && (item.scope || defaultScopeForProfile(state.cfg.profileType)) === archiveScope
          )),
          summary,
        ].sort((a, b) => b.year - a.year || String(a.scope || '').localeCompare(String(b.scope || ''))),
      },
    }));
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

      const current = get();
      rollback = {
        trans: current.trans,
        debts: current.debts,
        goals: current.goals,
        wallets: current.wallets,
        commitments: current.commitments,
        cats: current.cats,
        cfg: current.cfg,
        notif: current.notif,
      };

      const importedCfg = data.cfg ? normalizeCfg(data.cfg) : current.cfg;
      const prepared = prepareWalletData({
        wallets: data.wallets,
        trans: data.trans || [],
        commitments: data.commitments,
        cfg: importedCfg,
      });

      set({
        trans: prepared.trans,
        debts: normalizeDebtItems(data.debts, defaultScopeForProfile(prepared.cfg.profileType)),
        goals: normalizeGoalItems(data.goals, defaultScopeForProfile(prepared.cfg.profileType)),
        wallets: prepared.wallets,
        commitments: prepared.commitments,
        cats: sanitizeBackupCategories(data.cats, DEF_CATS),
        cfg: prepared.cfg,
        notif: normalizeBackupNotifications(data.notif, DEF_NOTIF),
      });

      await get().saveLocal({ force: true, dirty: true });

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
        set(rollback);
        try {
          await get().saveLocal({ force: true });
        } catch {}
      }
      return false;
    }
  },
});
