// MAALFLOW_PERFORMANCE_DATA_RUNTIME_V5_1_2
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Appearance, BackHandler, I18nManager, Image, Linking, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from './src/store/useStore';
import { TH } from './src/lib/theme';
import { STR } from './src/lib/strings';
import { STORAGE, detectSystemLang, getSymbol } from './src/lib/constants';
import { clearVaultSnapshot } from './src/lib/secureVault';
import { supabase } from './src/lib/supabase';
import { authenticate } from './src/lib/biometric';
import { checkDecisionAlerts } from './src/lib/notifications';
import { buildNotificationItems, filterDismissedNotifications, NOTIFICATION_DISMISSED_STORAGE_KEY, notificationReadKey, pruneNotificationKeys, sanitizeNotificationReadKeys } from './src/lib/notificationCenter';
import { applyGlobalFont, fontAssets } from './src/lib/fonts';
import { RADIUS, SHADOW } from './src/lib/tokens';
import { resolveSystemTheme } from './src/lib/systemTheme';
import { applyOrientationMode } from './src/lib/screenOrientation';

import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen from './src/screens/HomeScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import TrackersLabScreen from './src/screens/TrackersLabScreen';
import FollowUpsHubScreen from './src/screens/FollowUpsHubScreen';
import ReportsScreen from './src/screens/ReportsScreen';
import ArchiveScreen from './src/screens/ArchiveScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import MyMoneyScreen from './src/screens/MyMoneyScreen';
import CustomizeMaalFlowScreen from './src/screens/CustomizeMaalFlowScreen';
import WalletsAccountsScreen from './src/screens/WalletsAccountsScreen';
import PaymentHistoryScreen from './src/screens/PaymentHistoryScreen';
import PlanBudgetScreen from './src/screens/PlanBudgetScreen';
import IncomeAllocationScreen from './src/screens/IncomeAllocationScreen';
import BasiraScreen from './src/screens/BasiraScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import BenefitsScreen from './src/screens/BenefitsScreen';
import AddTransModal from './src/components/AddTransModal';
import NewItemModal from './src/components/NewItemModal';
import NotificationCenterModal from './src/components/NotificationCenterModal';
import PressableScale from './src/components/PressableScale';
import AppAlertHost from './src/components/AppAlertHost';
import PasswordRecoveryModal from './src/components/PasswordRecoveryModal';
import DecisionModal from './src/components/DecisionModal';
import { UIProvider } from './src/ui/UIContext';
import { TabBar } from './src/ui/shell/TabBar';
import { Fab } from './src/ui/shell/Fab';
import { HomeTopBar } from './src/ui/shell/HomeTopBar';
import { AppDrawer } from './src/ui/shell/AppDrawer';
import {
  ROOT_TABS,
  currentRoot,
  currentScreen,
  goBack,
  initialStack,
  isRootTab,
  normalizeStartTab,
  openScreen,
  showsFab,
} from './src/ui/shell/navigation';
import { deriveDisplayName } from './src/lib/accountIdentity';
import { filterByActiveScope, getEntryScope, getModules, normalizeScope, shouldShowTrackersTab } from './src/lib/modules';
import { handleAuthCallback } from './src/lib/authCallback';
import { normalizeWallets } from './src/lib/wallets';
import {
  getFinancialMaintenanceSnapshot,
  subscribeFinancialMaintenance,
} from './src/lib/financialMaintenanceBarrier';
import { beginStartupStageTiming, recordStartupTiming } from './src/lib/startupTiming';
import {
  PERFORMANCE_OPERATIONS,
  exportOperationDurationsV1,
  hydrateOperationDurationsV1,
  recordOperationDurationV1,
} from './src/lib/performanceTelemetry';

const FORCE_ONBOARDING = process.env.EXPO_PUBLIC_FORCE_ONBOARDING === '1';
const FRESH_TEST_MODE = process.env.EXPO_PUBLIC_FRESH_TEST === '1';
const FRESH_TEST_NAMESPACE = 'fresh-test-new-user';
const INTERNAL_DEMO_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_INTERNAL_DEMO === '1';
const R01_DEVICE_GATE_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_R01_DEVICE_GATE === '1';
let r01DeviceGateStarted = false;

// Navigation follows the approved redesign (MaalFlow-Design-Board/glossary.html,
// 2026-09-11): four tab roots — Home · Follow-ups · Transactions · Planning —
// with a stack of sub-screens on top (src/ui/shell/navigation.js). The old
// Home / My Money / Follow-ups / More bar is retired; More's destinations moved
// to the drawer opened from Home's account avatar. Screens not yet rebuilt are
// mounted as interim tab content: Follow-ups -> FollowUpsHubScreen,
// Transactions -> HistoryScreen, Planning -> MyMoneyScreen (its gateways are
// the planning destinations until planning.html is built).

const shellCopy = (lang) => (
  lang === 'ar'
    ? {
        archive: 'الأرشيف',
        cloud: 'متصل',
        addEntry: 'إضافة حركة',
        addTracker: 'متابعة جديدة',
      }
    : {
        archive: 'Archive',
        cloud: 'Connected',
        addEntry: 'Add entry',
        addTracker: 'New tracker',
      }
);

const statusStyle = (th) => (th.statusBar === 'light-content' ? 'light' : 'dark');

class BootErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.crashScreen}>
        <Ionicons name="warning-outline" size={42} color="#F0A84A" />
        <Text style={s.crashTitle}>MaalFlow could not start</Text>
        <Text style={s.crashBody}>Close the app and open it again. Your saved data remains on this device.</Text>
        <Text style={s.crashDetails} numberOfLines={5}>
          {String(this.state.error?.message || this.state.error || '')}
        </Text>
      </View>
    );
  }
}

export default function App() {
  return (
    <BootErrorBoundary>
      <SafeAreaProvider>
        <AppAlertHost><AppRoot /></AppAlertHost>
      </SafeAreaProvider>
    </BootErrorBoundary>
  );
}

function AppRoot() {
  const {
    cfg,
    loadLocal,
    loadCloud,
    setUser,
    user,
    trans,
    debts,
    goals,
    wallets,
    commitments,
    cats,
    notif,
    workspaceReady,
    pendingGuestTransfer,
    guestTransferPreview,
    transferGuestToCurrent,
    dismissGuestTransfer,
    restoreLastMergeRollback,
    resumeCanonicalRestoreProduction,
    syncConflict,
    resolveSyncConflict,
    exitDemoMode,
  } = useStore();
  const [navStack, setNavStack] = useState(() => initialStack());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const tab = currentScreen(navStack);
  const activeRoot = currentRoot(navStack);
  // Every existing call site keeps calling setTab(key): a root key replaces the
  // stack, any other key is pushed as a sub-screen, legacy keys are aliased.
  const setTab = useCallback((key) => setNavStack(stack => openScreen(stack, key)), []);
  const handleBack = useCallback(() => setNavStack(stack => goBack(stack).stack), []);
  const [historyOpenRequest, setHistoryOpenRequest] = useState(null);
  const [settingsResetSignal, setSettingsResetSignal] = useState(0);
  const [settingsOpenRequest, setSettingsOpenRequest] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addPreset, setAddPreset] = useState({ mode: 'exp', debtId: null, goalId: null, commitmentId: null, focused: false });
  const [addDraft, setAddDraft] = useState(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [newItemPreset, setNewItemPreset] = useState(null);
  const [ready, setReady] = useState(false);
  const [showOnboard, setShowOnboard] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const [passwordRecoveryOpen, setPasswordRecoveryOpen] = useState(false);
  const [trackerFocus, setTrackerFocus] = useState(null);
  const [readNotifKeys, setReadNotifKeys] = useState([]);
  const [dismissedNotifKeys, setDismissedNotifKeys] = useState([]);
  const [mergeResult, setMergeResult] = useState(null);
  const [mergeReviewSeconds, setMergeReviewSeconds] = useState(0);
  const [pendingMergeDuplicateOnly, setPendingMergeDuplicateOnly] = useState(false);
  const [mergeRollbackBusy, setMergeRollbackBusy] = useState(false);
  const guestPromptOpen = useRef(false);
  const mergeRollbackPromptTimer = useRef(null);
  const conflictPromptOpen = useRef(false);
  const handledAuthUrls = useRef(new Set());
  const lockBackgroundAt = useRef(null);
  const authTransitionQueue = useRef(Promise.resolve());
  const [financialMaintenance, setFinancialMaintenance] = useState(() => getFinancialMaintenanceSnapshot());
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontReady = fontsLoaded || !!fontError;
  const systemColorScheme = useColorScheme();

  // P19-015A2: subscribe the shell to the process-wide maintenance barrier.
  useEffect(() => subscribeFinancialMaintenance(setFinancialMaintenance), []);

  useEffect(() => {
    if (!ready || !R01_DEVICE_GATE_ENABLED || r01DeviceGateStarted) return;
    r01DeviceGateStarted = true;
    import('./src/dev/financialLedgerV7DeviceHarness')
      .then(({ runFinancialLedgerV7DeviceHarness }) => runFinancialLedgerV7DeviceHarness())
      .then(result => console.info('[MAALFLOW:R01_DEVICE_GATE] PASS', JSON.stringify(result)))
      .catch(error => console.error('[MAALFLOW:R01_DEVICE_GATE] FAIL', String(error?.message || error)));
  }, [ready]);

  useEffect(() => {
    if (cfg.themeMode !== 'system') return undefined;
    const applyTheme = ({ colorScheme } = {}) => {
      const currentTheme = useStore.getState().cfg.theme;
      const theme = resolveSystemTheme(colorScheme || Appearance.getColorScheme(), currentTheme);
      if (theme !== useStore.getState().cfg.theme) {
        // This is derived device state, not a financial mutation. Updating it
        // directly avoids a full ledger/vault write whenever Android changes
        // light/dark mode while Expo is open.
        useStore.setState(state => ({ cfg: { ...state.cfg, theme } }));
      }
    };
    applyTheme({ colorScheme: systemColorScheme });
    const appearanceSub = Appearance.addChangeListener(applyTheme);
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') applyTheme();
    });
    return () => {
      appearanceSub.remove();
      appStateSub.remove();
    };
  }, [cfg.themeMode, systemColorScheme]);

  useEffect(() => {
    if (cfg.langMode !== 'system') return undefined;
    const applyLanguage = () => {
      const language = detectSystemLang();
      if (language !== useStore.getState().cfg.lang) {
        useStore.setState(state => ({ cfg: { ...state.cfg, lang: language } }));
      }
    };
    applyLanguage();
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') applyLanguage();
    });
    return () => appStateSub.remove();
  }, [cfg.langMode]);

  useEffect(() => {
    const orientationMode = ['system', 'auto', 'portrait'].includes(cfg.orientationMode)
      ? cfg.orientationMode
      : 'system';
    const apply = () => applyOrientationMode(orientationMode).catch(() => {});
    apply();
    if (orientationMode !== 'system') return undefined;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') apply();
    });
    return () => subscription.remove();
  }, [cfg.orientationMode]);

  useEffect(() => {
    if (!archiveOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setArchiveOpen(false);
      return true;
    });
    return () => subscription.remove();
  }, [archiveOpen]);

  useEffect(() => () => {
    if (mergeRollbackPromptTimer.current) clearTimeout(mergeRollbackPromptTimer.current);
  }, []);


  useEffect(() => {
    if (mergeReviewSeconds <= 0) return undefined;
    const timer = setInterval(() => {
      setMergeReviewSeconds(value => Math.max(0, value - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [mergeReviewSeconds > 0]);

  const openMergeReviewNow = () => {
    if (mergeRollbackPromptTimer.current) {
      clearTimeout(mergeRollbackPromptTimer.current);
      mergeRollbackPromptTimer.current = null;
    }
    setMergeReviewSeconds(0);
    setMergeResult({ duplicateOnly: pendingMergeDuplicateOnly });
  };

  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const sym = getSymbol(cfg.currency);
  const accountName = deriveDisplayName({ user, cfg }) || (cfg.lang === 'ar' ? 'حساب محلي' : 'Local account');
  const modules = getModules(cfg);
  const isRtl = cfg.lang === 'ar';
  const transferAvailable = useMemo(() => {
    if (!modules.wallets) return false;
    const activeWallets = filterByActiveScope(normalizeWallets(wallets, cfg.currency), cfg);
    const counts = activeWallets.reduce((map, wallet) => {
      const scope = normalizeScope(wallet.scope, getEntryScope(cfg));
      map.set(scope, (map.get(scope) || 0) + 1);
      return map;
    }, new Map());
    return [...counts.values()].some(count => count > 1);
  }, [modules.wallets, wallets, cfg.currency, cfg.activeScope, cfg.profileType]);
  // Row order is mirrored explicitly by each bilingual component.
  // Keeping the shell LTR prevents Arabic rows from being reversed twice.
  const dirStyle = { direction: 'ltr' };
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);
  const computedNotifItems = useMemo(
    () => buildNotificationItems({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol: sym }),
    [trans, debts, goals, wallets, commitments, cats, cfg, notif, sym],
  );
  const notifItems = useMemo(
    () => filterDismissedNotifications(computedNotifItems, dismissedNotifKeys),
    [computedNotifItems, dismissedNotifKeys],
  );
  const notifKeys = useMemo(() => notifItems.map(notificationReadKey), [notifItems]);
  const unreadNotifCount = notifKeys.filter(key => !readNotifKeys.includes(key)).length;
  const visibleTabs = useMemo(
    () => ROOT_TABS.filter(item => item.key !== 'followups' || shouldShowTrackersTab(cfg)),
    [cfg.enabledModules],
  );
  const normalizedStartTab = normalizeStartTab(cfg.startTab);
  const preferredTab = visibleTabs.some(item => item.key === normalizedStartTab) ? normalizedStartTab : 'home';
  const isSecondaryScreen = !isRootTab(tab);

  // System back (glossary): drawer closes first; a sub-screen returns to where
  // it was opened from; a non-Home root returns to Home; Home leaves the app.
  // Modals (RN <Modal>) receive the press before this handler.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Full-screen states own their back press (archive has its own handler;
      // onboarding and the lock screen keep the OS default).
      if (archiveOpen || showOnboard || locked) return false;
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      const step = goBack(navStack);
      if (step.exit) return false;
      setNavStack(step.stack);
      return true;
    });
    return () => subscription.remove();
  }, [drawerOpen, navStack, archiveOpen, showOnboard, locked]);

  // P19-015A2: startup barrier. Local SQLite mounting/migration completes before
  // any Supabase session transition is allowed to switch the active workspace.
  // Auth callbacks are then serialized through one promise queue.
  useEffect(() => {
    let active = true;
    let authSubscription = null;

    const queueAuthTransition = nextUser => {
      const nextUserId = String(nextUser?.id || '').trim() || null;
      const applyTransition = () => {
        const current = useStore.getState();
        // Supabase normally emits INITIAL_SESSION as well as returning getSession.
        // Do not repeat the same workspace/profile transition at cold start.
        if (current.workspaceReady && (current.user?.id || null) === nextUserId) {
          return { ok: true, unchangedSession: true };
        }
        return setUser(nextUser, { deferProfileHydration: true });
      };
      const queued = authTransitionQueue.current.then(
        applyTransition,
        applyTransition,
      );
      authTransitionQueue.current = queued.catch(() => undefined);
      return queued;
    };

    // Cold start spends 5-10 seconds on the splash during an ordinary daily launch.
    // `ready` is only raised at the end of this whole sequence, and the sequence
    // includes a network round trip, so the first paint waits on Supabase.
    //
    // Measure before reordering. Reordering startup is where this project has
    // produced its worst bugs before, so the order gets changed once, against real
    // numbers from a real device, not against a reading of the code.
    //
    // Durations only. Nothing here touches a balance or an id.
    const startupClock = Date.now();
    const startupMarks = {};
    const mark = (name) => {
      startupMarks[name] = Date.now() - startupClock;
    };
    mark('startupBegin');

    (async () => {
      if (FRESH_TEST_MODE) {
        await clearVaultSnapshot(FRESH_TEST_NAMESPACE);
        await loadLocal(FRESH_TEST_NAMESPACE, { allowLegacy: false });
        if (!active) return;
        setShowOnboard(true);
        setReady(true);
        return;
      }

      const endStartupStageTiming = beginStartupStageTiming(mark);
      try {
        await loadLocal();
      } finally {
        endStartupStageTiming();
      }
      mark('loadLocal');
      if (!active) return;

      const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
        queueAuthTransition(session?.user ?? null).catch(error => {
          console.warn('[MAALFLOW:STARTUP_AUTH_TRANSITION]', String(error?.message || error || 'auth_transition_failed'));
        });
      });
      authSubscription = listener?.subscription || null;

      try {
        const { data } = await supabase.auth.getSession();
        mark('getSession');
        await queueAuthTransition(data?.session?.user ?? null);
      } catch (error) {
        // Mark the failure too. A missing getSession mark would otherwise read the
        // same whether the call threw in 20ms or hung for 8 seconds first.
        mark('getSessionFailed');
        console.warn('[MAALFLOW:STARTUP_SESSION]', String(error?.message || error || 'session_read_failed'));
        await queueAuthTransition(null);
      }

      await authTransitionQueue.current.catch(() => undefined);
      mark('authTransition');
      if (!active) return;
      const completed = await AsyncStorage.getItem(STORAGE.ONBOARD);
      mark('onboardFlag');
      setShowOnboard(FORCE_ONBOARDING || completed !== 'true');
      setReady(true);
      mark('ready');
      // One line, one launch. The gaps between marks are where the seconds are: if
      // getSession dominates, the fix is to stop blocking first paint on it.
      //
      // `ready` marks the moment React is told to render, NOT the moment pixels
      // appear. If these numbers add up to far less than the delay the user feels,
      // the cost is downstream in the first render, not in this sequence, and
      // reordering startup would fix nothing. Read them with that in mind.
      // Kept in memory as well as logged, so the numbers can be read from the
      // Settings diagnostic panel instead of requiring adb from a workstation. The
      // person who needs to produce them is holding a phone.
      const startupTiming = recordStartupTiming(startupMarks, 'completed');
      // §97 cold-start sample. One launch produces one measurement, so the
      // ring is carried across launches -- otherwise p50/p95 would describe a
      // single number forever. Off any render path, once per launch, and the
      // stored value is a list of durations with nothing else in it.
      try {
        const raw = await AsyncStorage.getItem(STORAGE.PERF_COLD_START);
        const parsed = raw ? JSON.parse(raw) : [];
        hydrateOperationDurationsV1(PERFORMANCE_OPERATIONS.COLD_START, Array.isArray(parsed) ? parsed : []);
        recordOperationDurationV1(PERFORMANCE_OPERATIONS.COLD_START, startupTiming?.totalMs);
        await AsyncStorage.setItem(
          STORAGE.PERF_COLD_START,
          JSON.stringify(exportOperationDurationsV1(PERFORMANCE_OPERATIONS.COLD_START)),
        );
      } catch {}
      console.log('[MAALFLOW:STARTUP_TIMING]', JSON.stringify(startupMarks));
    })().catch(error => {
      // A launch that failed part-way is the one we most want numbers from, so the
      // marks collected before the throw are reported here too.
      mark('failed');
      recordStartupTiming(startupMarks, 'failed');
      console.log('[MAALFLOW:STARTUP_TIMING]', JSON.stringify(startupMarks));
      console.error('[MAALFLOW:STARTUP_BARRIER]', String(error?.message || error || 'startup_failed'));
      if (active) setReady(true);
    });

    return () => {
      active = false;
      authSubscription?.unsubscribe?.();
    };
  }, [loadLocal, setUser]);

  useEffect(() => {
    if (FRESH_TEST_MODE || !ready) return undefined;
    let active = true;
    const processUrl = async (url) => {
      if (!url || handledAuthUrls.current.has(url)) return;
      handledAuthUrls.current.add(url);
      try {
        const result = await handleAuthCallback(url);
        if (!active || !result.handled) return;
        if (result.session?.user) {
          await setUser(result.session.user);
        }
        if (result.kind === 'recovery') {
          setPasswordRecoveryOpen(true);
        } else {
          Alert.alert(
            '',
            cfg.lang === 'ar'
              ? 'تم تفعيل الحساب وتسجيل الدخول بنجاح.'
              : 'Your account is confirmed and signed in.',
          );
        }
      } catch (error) {
        if (!active) return;
        Alert.alert(
          cfg.lang === 'ar' ? 'تعذر فتح الرابط' : 'Could not open link',
          cfg.lang === 'ar'
            ? 'قد يكون رابط الحساب منتهياً أو مستخدماً. اطلب رسالة جديدة من إعدادات الحساب.'
            : 'The account link may be expired or already used. Request a new email from account settings.',
        );
      }
    };

    Linking.getInitialURL().then(processUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => processUrl(url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, [ready, cfg.lang, setUser]); // P19-015A2 auth URL startup barrier

  useEffect(() => {
    if (!ready || !user || !workspaceReady) return undefined;
    let active = true;
    Promise.resolve(resumeCanonicalRestoreProduction?.())
      .then((result) => {
        const blockedByRestore = result?.pending === true
          || (result?.promoted === true && result?.ok === false);
        if (active && !blockedByRestore) loadCloud();
      })
      .catch(() => null)
    return () => { active = false; };
  }, [ready, user, workspaceReady, resumeCanonicalRestoreProduction, loadCloud]);

  useEffect(() => {
    if (!ready || !user || !workspaceReady) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') loadCloud();
    });
    return () => subscription.remove();
  }, [ready, user, workspaceReady, loadCloud]);

  useEffect(() => {
    if (!ready || !user || !workspaceReady || !pendingGuestTransfer || guestPromptOpen.current) return;
    guestPromptOpen.current = true;
    const ar = cfg.lang === 'ar';
    const preview = guestTransferPreview || {};
    const incoming = Number(preview.incomingRecords || 0);
    const added = Number(preview.addedRecords || 0);
    const duplicates = Number(preview.duplicateRecords || 0);
    const previewLine = ar
      ? `العناصر القادمة: ${incoming}. المختلف الذي سيضاف: ${added}. المكرر الذي سيدمج بدون تكرار: ${duplicates}.`
      : `Incoming items: ${incoming}. New items to add: ${added}. Duplicates to merge without repeating: ${duplicates}.`;
    Alert.alert(
      ar ? 'مراجعة دمج البيانات' : 'Review data merge',
      ar
        ? `توجد بيانات محفوظة على هذا الجهاز قبل تسجيل الدخول. إذا وافقت، سيضيف MaalFlow المعلومات المختلفة فقط، ويدمج المعلومات المكررة حتى لا تظهر مرتين. ${previewLine} سنحفظ نقطة رجوع قبل التنفيذ.`
        : `Data saved on this device was found before sign-in. If you continue, MaalFlow will add only different information; duplicates are merged without repetition. ${previewLine} A rollback point will be saved before the change.`,
      [
        {
          text: ar ? 'إبقاؤها منفصلة' : 'Keep separate',
          style: 'cancel',
          onPress: () => {
            guestPromptOpen.current = false;
            dismissGuestTransfer();
          },
        },
        {
          text: ar ? 'دمج بأمان' : 'Merge safely',
          onPress: async () => {
            const result = await transferGuestToCurrent();
            const moved = result === true || !!result?.ok;
            guestPromptOpen.current = false;
            if (!moved) {
              Alert.alert(
                ar ? 'لم يكتمل الدمج' : 'Merge not completed',
                ar ? 'بقيت بياناتك المحلية محفوظة. تحقق من الاتصال وحاول لاحقاً.' : 'Your local data is still safe. Check the connection and try again.',
              );
              return;
            }
            if (mergeRollbackPromptTimer.current) clearTimeout(mergeRollbackPromptTimer.current);
            setPendingMergeDuplicateOnly(result?.reason === 'duplicate_only');
            setMergeReviewSeconds(30);
            mergeRollbackPromptTimer.current = setTimeout(() => {
              mergeRollbackPromptTimer.current = null;
              setMergeReviewSeconds(0);
              setMergeResult({ duplicateOnly: result?.reason === 'duplicate_only' });
            }, 30000);
          },
        },
      ],
      { cancelable: false },
    );
  }, [
    ready,
    user,
    workspaceReady,
    pendingGuestTransfer,
    guestTransferPreview,
    cfg.lang,
    transferGuestToCurrent,
    dismissGuestTransfer,
    restoreLastMergeRollback,
  ]);

  useEffect(() => {
    if (!ready || !syncConflict || conflictPromptOpen.current) return;
    conflictPromptOpen.current = true;
    const ar = cfg.lang === 'ar';
    if (syncConflict.type === 'merged_changes' && !syncConflict.cloud) {
      resolveSyncConflict('dismiss').finally(() => {
        conflictPromptOpen.current = false;
      });
      return;
    }
    Alert.alert(
      ar ? 'تعارض في البيانات' : 'Data conflict',
      ar
        ? 'توجد نسخة سحابية وتغييرات محلية لا يمكن دمجها تلقائيا بثقة. اختر النسخة التي تريد الاحتفاظ بها.'
        : 'A cloud copy and local changes cannot be merged with confidence. Choose which copy to keep.',
      [
        {
          text: ar ? 'استخدام نسخة السحابة' : 'Use cloud copy',
          onPress: async () => {
            await resolveSyncConflict('cloud');
            conflictPromptOpen.current = false;
          },
        },
        {
          text: ar ? 'الاحتفاظ بهذا الجهاز' : 'Keep this device',
          onPress: async () => {
            await resolveSyncConflict('local');
            conflictPromptOpen.current = false;
          },
        },
      ],
      { cancelable: false },
    );
  }, [ready, syncConflict, cfg.lang, resolveSyncConflict]);

  const keepMergeChanges = () => {
    if (!mergeRollbackBusy) setMergeResult(null);
  };

  const rollbackMergedChanges = async () => {
    if (mergeRollbackBusy) return;
    setMergeRollbackBusy(true);
    try {
      const restored = await restoreLastMergeRollback();
      setMergeResult(null);
      Alert.alert(
        restored ? (cfg.lang === 'ar' ? 'تم الرجوع' : 'Rolled back') : (cfg.lang === 'ar' ? 'تعذر الرجوع' : 'Rollback failed'),
        restored ? (cfg.lang === 'ar' ? 'عادت البيانات إلى حالتها قبل خطوة الدمج.' : 'Your data is back to the state before the merge.') : (cfg.lang === 'ar' ? 'لم نجد نقطة رجوع صالحة لهذه العملية.' : 'No valid rollback point was found for this operation.'),
      );
    } catch {
      setMergeResult(null);
      Alert.alert(
        cfg.lang === 'ar' ? 'تعذر الرجوع' : 'Rollback failed',
        cfg.lang === 'ar' ? 'لم نجد نقطة رجوع صالحة لهذه العملية.' : 'No valid rollback point was found for this operation.',
      );
    } finally {
      setMergeRollbackBusy(false);
    }
  };

  useEffect(() => {
    AsyncStorage.getItem('MAALFLOW_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (!raw) return;
        const safe = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw)));
        setReadNotifKeys(safe);
        AsyncStorage.setItem('MAALFLOW_READ_NOTIFICATIONS_V1', JSON.stringify(safe)).catch(() => {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATION_DISMISSED_STORAGE_KEY)
      .then(raw => {
        if (!raw) return;
        const safe = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw)));
        setDismissedNotifKeys(safe);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const cleanExpiredNotificationKeys = async () => {
      try {
        const entries = await AsyncStorage.multiGet(['MAALFLOW_READ_NOTIFICATIONS_V1', NOTIFICATION_DISMISSED_STORAGE_KEY]);
        const values = new Map(entries);
        const nextRead = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(values.get('MAALFLOW_READ_NOTIFICATIONS_V1') || '[]')));
        const nextDismissed = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(values.get(NOTIFICATION_DISMISSED_STORAGE_KEY) || '[]')));
        setReadNotifKeys(current => JSON.stringify(current) === JSON.stringify(nextRead) ? current : nextRead);
        setDismissedNotifKeys(current => JSON.stringify(current) === JSON.stringify(nextDismissed) ? current : nextDismissed);
        await AsyncStorage.multiSet([
          ['MAALFLOW_READ_NOTIFICATIONS_V1', JSON.stringify(nextRead)],
          [NOTIFICATION_DISMISSED_STORAGE_KEY, JSON.stringify(nextDismissed)],
        ]);
      } catch {}
    };
    const timer = setInterval(cleanExpiredNotificationKeys, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // MaalFlow mirrors its rows and text direction explicitly. Forcing the native
    // RTL flag here asks React Native/Expo Go to restart the whole app when the
    // onboarding language is saved. On some Expo Go builds that restart never
    // stabilizes and becomes a reload loop. Allow RTL capability, but never
    // force a process-level direction change from application state.
    I18nManager.allowRTL(true);
  }, []);

  useEffect(() => {
    if (fontsLoaded) applyGlobalFont();
    if (fontError) console.warn('[MaalFlow] App fonts failed to load; falling back to system font.', fontError);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!ready || !cfg.bioLock) return;
    setLocked(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        lockBackgroundAt.current = Date.now();
        return;
      }
      if (state === 'active') {
        const elapsed = lockBackgroundAt.current ? Date.now() - lockBackgroundAt.current : 0;
        lockBackgroundAt.current = null;
        if (elapsed >= Number(cfg.lockDelaySeconds ?? 300) * 1000) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [ready, cfg.bioLock, cfg.lockDelaySeconds]);

  useEffect(() => {
    if (!ready) return;
    try { checkDecisionAlerts({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol: sym }); } catch {}
  }, [ready, trans, debts, goals, wallets, commitments, cats, cfg, notif, sym]);

  useEffect(() => {
    // A root hidden by customization cannot stay open underneath the user.
    if (!visibleTabs.some(t => t.key === activeRoot)) setNavStack(initialStack());
  }, [visibleTabs, activeRoot]);

  useEffect(() => {
    if (!ready) return;
    setNavStack(stack => (stack.length === 1 && stack[0] === 'home' ? initialStack(preferredTab) : stack));
  }, [ready, preferredTab]);

  useEffect(() => {
    // Legacy internal demo data must never leak into a normal build. The
    // performance lab is intentionally different: when the user activates it,
    // it must remain active until they explicitly return to their real
    // workspace.
    //
    // The exemption below used to also require __DEV__, which was harmless
    // while the lab itself was __DEV__-only (Settings never offered a tier to
    // press outside dev). Opening the lab to installed builds (2026-09-06, for
    // Phase 15 §96/§98/§100, which can only be measured on a device) turned it
    // from redundant into a real bug: cfg.demoMode flips true when a tier is
    // entered, this effect re-runs, __DEV__ is false in a release build, so the
    // exemption never matched and exitDemoMode fired immediately -- the mode
    // toggled on and off in the same tick, which is what read on device as the
    // screen flickering and refusing to enter. performanceTestMode is already
    // the flag that actually distinguishes the lab from stray legacy demo
    // state; __DEV__ was never doing real work here.
    if (!ready || INTERNAL_DEMO_ENABLED || !cfg.demoMode) return;
    if (cfg.performanceTestMode === true) return;
    Promise.resolve(exitDemoMode?.()).catch(() => {});
  }, [ready, cfg.demoMode, cfg.performanceTestMode, exitDemoMode]);

  const finishOnboard = async () => {
    await AsyncStorage.setItem(STORAGE.ONBOARD, 'true');
    setShowOnboard(false);
  };

  const unlock = async () => {
    const res = await authenticate(L.bioPrompt);
    if (res.success) setLocked(false);
  };

  if (!ready || !fontReady) {
    return (
      <View style={s.splash}>
        <StatusBar style="light" />
        <Image source={require('./assets/maalflow-splash-logo.png')} style={s.splashLogo} resizeMode="contain" />
        <Text style={s.splashTitle}>MaalFlow</Text>
        <Text style={s.splashSubtitle}>
          {cfg.lang === 'ar' ? 'أموالك بوضوح' : 'Your finances, clearly'}
        </Text>
      </View>
    );
  }

  // The maintenance screen used to `return` here, replacing the whole tree. That does
  // not hide the app, it unmounts it — and when the barrier lifts the tree is rebuilt
  // from scratch, so every component loses its state. Two reported bugs came from
  // exactly that:
  //
  //   - Toggling a feature ran the barrier, so Settings was torn down and rebuilt at
  //     its root page. The user saw a flash and found themselves back at the top.
  //   - Restore calls the barrier itself (dataSlice.js:616). SettingsScreen unmounted
  //     mid-await, so when importBackup resolved, setRestoreResultOpen(true) ran
  //     against a component that no longer existed. The restore had already
  //     succeeded; only the confirmation was lost, which reads to the user as a
  //     failed restore.
  //
  // It is rendered as an overlay below instead. The barrier still does its real work
  // — writes and sync stay paused — but the tree underneath stays mounted, so state
  // survives and in-flight callbacks still have a component to talk to.
  const maintenanceOverlay = financialMaintenance.visible ? (
    <View style={[s.splash, StyleSheet.absoluteFill, { zIndex: 999 }]} pointerEvents="auto">
      <StatusBar style="light" />
      <Ionicons name="shield-checkmark-outline" size={42} color="#159A6A" />
      <Text style={s.splashTitle}>
        {cfg.lang === 'ar' ? 'جاري تأمين البيانات' : 'Securing financial data'}
      </Text>
      <Text style={[s.splashSubtitle, { textAlign: 'center', maxWidth: 320 }]}>
        {cfg.lang === 'ar'
          ? 'تتوقف الكتابة والمزامنة مؤقتاً حتى تكتمل العملية بأمان.'
          : 'Writes and sync are temporarily paused until this operation completes safely.'}
      </Text>
    </View>
  ) : null;

  if (showOnboard) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={statusStyle(th)} />
        <OnboardingScreen cfg={cfg} onDone={finishOnboard} />
        {maintenanceOverlay}
      </SafeAreaView>
    );
  }

  if (locked) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[s.centerScreen, { backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={statusStyle(th)} />
        <View style={[s.lockCard, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.lockMark, { backgroundColor: th.primSoft }]}>
            <Ionicons name="lock-closed-outline" size={28} color={th.primary} />
          </View>
          <Text style={[s.lockTitle, { color: th.text, textAlign: 'center' }]}>{L.bioPrompt}</Text>
          <Text style={[s.lockBody, { color: th.sub, textAlign: 'center' }]}>
            {cfg.lang === 'ar' ? 'افتح التطبيق للعودة إلى لوحتك المالية.' : 'Unlock to return to your financial workspace.'}
          </Text>
          <PressableScale onPress={unlock} style={[s.unlockBtn, { backgroundColor: th.primary }]} scale={0.94} haptic="impact">
            <Text style={{ color: th.onPrimary, fontWeight: '900', fontSize: 15 }}>{L.unlockApp}</Text>
          </PressableScale>
        </View>
        {maintenanceOverlay}
      </SafeAreaView>
    );
  }

  if (archiveOpen) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={statusStyle(th)} />
        <View style={s.shellBackdrop}>
          <View style={[s.archiveBackRow, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <PressableScale onPress={() => setArchiveOpen(false)} style={[s.backBtn, { backgroundColor: th.card }]}>
              <Ionicons name={cfg.lang === 'ar' ? 'chevron-forward' : 'chevron-back'} size={18} color={th.text} />
            </PressableScale>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <ArchiveScreen />
        </View>
        {maintenanceOverlay}
      </SafeAreaView>
    );
  }

  const openAddExp = (focused = false) => {
    setAddDraft(null);
    setAddPreset({ mode: 'exp', debtId: null, goalId: null, commitmentId: null, focused });
    setShowAdd(true);
  };
  const openAddInc = () => {
    setAddDraft(null);
    setAddPreset({ mode: 'inc', debtId: null, goalId: null, commitmentId: null, focused: true });
    setShowAdd(true);
  };
  const openTransfer = () => {
    if (!transferAvailable) return;
    setAddDraft(null);
    setAddPreset({ mode: 'transfer', debtId: null, goalId: null, commitmentId: null, focused: true });
    setShowAdd(true);
  };
  const openSmartEntry = () => {
    setAddDraft({ smartMode: 'image' });
    setAddPreset({ mode: 'exp', debtId: null, goalId: null, commitmentId: null, focused: true });
    setShowAdd(true);
  };
  const openQuickPay = (debtId) => {
    setAddDraft(null);
    setAddPreset({ mode: 'debt', debtId, goalId: null, commitmentId: null });
    setShowAdd(true);
  };
  const openQuickSave = (goalId) => {
    setAddDraft(null);
    setAddPreset({ mode: 'goal', debtId: null, goalId, commitmentId: null });
    setShowAdd(true);
  };
  const openQuickCommitment = (commitmentId) => {
    setAddDraft(null);
    setAddPreset({ mode: 'commitment', debtId: null, goalId: null, commitmentId });
    setShowAdd(true);
  };
  const openNewTracker = (preset = null) => {
    if (!shouldShowTrackersTab(cfg)) return;
    setNewItemPreset(preset || null);
    setShowNewItem(true);
  };
  const openLinkedPlan = (preset) => {
    setNewItemPreset(preset || null);
    setShowNewItem(true);
  };

  const openSettingsPage = (page = 'root') => {
    setSettingsOpenRequest({ page, nonce: Date.now() });
    setTab('settings');
  };

  const openHistoryWithContext = (request = {}) => {
    setHistoryOpenRequest({ ...request, nonce: Date.now() });
    setTab('history');
  };

  const handleFab = () => openAddExp(false);
  const classicEntry = cfg.entryMode === 'classic';

  const openNotifications = async () => {
    setShowNotif(true);
    const next = Array.from(new Set([...readNotifKeys, ...notifKeys])).slice(-80);
    setReadNotifKeys(next);
    await AsyncStorage.setItem('MAALFLOW_READ_NOTIFICATIONS_V1', JSON.stringify(next));
  };

  const dismissNotifications = async (keys = []) => {
    const next = pruneNotificationKeys(Array.from(new Set([...dismissedNotifKeys, ...keys])).slice(-200));
    setDismissedNotifKeys(next);
    await AsyncStorage.setItem(NOTIFICATION_DISMISSED_STORAGE_KEY, JSON.stringify(next));
  };

  const handleNotificationPress = (item) => {
    const action = item?.action;
    if (!action) return;
    setShowNotif(false);

    if (action.type === 'open_tab') {
      setTab(action.tab || 'home');
      return;
    }

    if (action.type === 'open_tracker' || action.type === 'open_commit_sub') {
      setTrackerFocus({
        kind: action.trackerKind || action.sub || 'debt',
        id: action.trackerId || null,
        nonce: Date.now(),
      });
      setTab('followupsAll');
      return;
    }

    if (action.type === 'open_recurring') {
      setTab('home');
      setAddDraft(action.draftData || null);
      setAddPreset({ mode: 'exp', debtId: null, goalId: null, commitmentId: null });
      setShowAdd(true);
      return;
    }

    if (action.type === 'open_add') {
      if (action.mode === 'goal' && action.goalId) {
        setTab('followupsAll');
        openQuickSave(action.goalId);
        return;
      }
      if (action.mode === 'debt' && action.debtId) {
        setTab('followupsAll');
        openQuickPay(action.debtId);
        return;
      }
      if (action.mode === 'commitment' && action.commitmentId) {
        setTab('followupsAll');
        openQuickCommitment(action.commitmentId);
        return;
      }
      openAddExp();
    }
  };

  const homeTopBar = (
    <HomeTopBar
      accountName={accountName}
      hasNewNotifications={unreadNotifCount > 0}
      onOpenDrawer={() => setDrawerOpen(true)}
      onOpenNotifications={openNotifications}
      labels={{
        drawer: cfg.lang === 'ar' ? 'فتح القائمة والحساب' : 'Open menu and account',
        notifications: cfg.lang === 'ar' ? 'الإشعارات' : 'Notifications',
        share: cfg.lang === 'ar' ? 'مشاركة' : 'Share',
      }}
    />
  );

  const screens = {
    home: (
      <HomeScreen
        topBar={homeTopBar}
        onAddExpense={() => openAddExp(true)}
        onAddIncome={openAddInc}
        onTransfer={openTransfer}
        onNewTracker={openNewTracker}
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onSmartEntry={openSmartEntry}
        onOpenTab={setTab}
        onOpenSettingsPage={openSettingsPage}
        onNotificationAction={handleNotificationPress}
      />
    ),
    // Both screens declare onAddExpense/onAddIncome with a no-op default, and neither
    // was given one here — so the +/- buttons on their empty states were decorative.
    // A user with no transactions taps the one obvious call to action and nothing
    // happens. Same handlers HomeScreen already uses.
    // Interim Transactions root until transactions.html is built.
    transactions: <HistoryScreen onAddExpense={() => openAddExp(true)} onAddIncome={openAddInc} openRequest={historyOpenRequest} />,
    // Interim Follow-ups root (thin hub, REF-05) until followups.html is built.
    // The full/unfiltered TrackersLabScreen (needed for trackerFocus deep-links
    // from notifications and quick-pay/save/commitment shortcuts) lives at the
    // 'followupsAll' sub-screen key below.
    followups: (
      <FollowUpsHubScreen
        onOpenOwed={() => setTab('followupsOwed')}
        onOpenReceivable={() => setTab('followupsReceivable')}
        onOpenCommitments={() => setTab('followupsCommitments')}
        onOpenGoals={() => setTab('followupsGoals')}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsAll: (
      <TrackersLabScreen
        focusRequest={trackerFocus}
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsDebts: (
      <TrackersLabScreen
        initialFilter="debts"
        screenVariant="debts"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsOwed: (
      <TrackersLabScreen
        initialFilter="owed"
        screenVariant="owed"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsReceivable: (
      <TrackersLabScreen
        initialFilter="receivable"
        screenVariant="receivable"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsCommitments: (
      <TrackersLabScreen
        initialFilter="monthly"
        screenVariant="commitments"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsInstallments: (
      <TrackersLabScreen
        initialFilter="installment"
        screenVariant="installments"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsSubscriptions: (
      <TrackersLabScreen
        initialFilter="subscription"
        screenVariant="subscriptions"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    followupsGoals: (
      <TrackersLabScreen
        initialFilter="saving"
        screenVariant="savings"
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
        onOpenPaymentHistory={() => setTab('paymentHistory')}
      />
    ),
    paymentHistory: <PaymentHistoryScreen />,
    reports: <ReportsScreen onAddExpense={() => openAddExp(true)} onAddIncome={openAddInc} onOpenIncomeAllocation={() => setTab('incomeAllocation')} onOpenHistory={openHistoryWithContext} onOpenBasira={() => setTab('basira')} />,
    settings: <SettingsScreen tabs={visibleTabs} resetSignal={settingsResetSignal} openRequest={settingsOpenRequest} onExit={handleBack} />,
    // Interim Planning root until planning.html is built: My Money's gateways
    // (budget, reports, Basira, income allocation) are the planning destinations.
    planning: (
      <MyMoneyScreen
        onOpenHistory={() => setTab('transactions')}
        onOpenBudget={() => setTab('budget')}
        onOpenReports={() => setTab('reports')}
        onOpenBasira={() => setTab('basira')}
        onOpenIncomeAllocation={() => setTab('incomeAllocation')}
      />
    ),
    wallets: <WalletsAccountsScreen />,
    customize: <CustomizeMaalFlowScreen />,
    categories: <CategoriesScreen />,
    benefits: <BenefitsScreen />,
    budget: <PlanBudgetScreen />,
    incomeAllocation: <IncomeAllocationScreen />,
    basira: <BasiraScreen onOpenHistory={openHistoryWithContext} onOpenFollowUps={() => setTab('followups')} />,
  };

  // Drawer (tools.html frame ١). Only destinations that exist today are listed;
  // Follow-up types, Recently deleted and Subscription join when their screens
  // are built — the glossary forbids items without a function behind them.
  const openFromDrawer = (action) => () => {
    setDrawerOpen(false);
    action();
  };
  const drawerGroups = cfg.lang === 'ar'
    ? [
        { key: 'tools', label: 'أدواتي', items: [
          { key: 'wallets', icon: 'wallet', label: 'المحافظ', onPress: openFromDrawer(() => setTab('wallets')) },
          { key: 'categories', icon: 'category', label: 'الفئات', onPress: openFromDrawer(() => setTab('categories')) },
          { key: 'archive', icon: 'archive', label: 'الأرشيف', onPress: openFromDrawer(() => setArchiveOpen(true)) },
        ] },
        { key: 'app', label: 'التطبيق', items: [
          { key: 'settings', icon: 'settings', label: 'الإعدادات', onPress: openFromDrawer(() => openSettingsPage('root')) },
          { key: 'customize', icon: 'layout-grid', label: 'تخصيص مالفلو', onPress: openFromDrawer(() => setTab('customize')) },
          { key: 'data', icon: 'database', label: 'البيانات والنسخ', onPress: openFromDrawer(() => openSettingsPage('data')) },
          { key: 'benefits', icon: 'gift', label: 'المزايا والدعوة', onPress: openFromDrawer(() => setTab('benefits')) },
        ] },
        { key: 'support', label: 'الدعم', items: [
          { key: 'help', icon: 'help-circle', label: 'المساعدة', onPress: openFromDrawer(() => openSettingsPage('support')) },
          { key: 'about', icon: 'info-circle', label: 'حول مالفلو', onPress: openFromDrawer(() => openSettingsPage('about')) },
        ] },
      ]
    : [
        { key: 'tools', label: 'My tools', items: [
          { key: 'wallets', icon: 'wallet', label: 'Wallets', onPress: openFromDrawer(() => setTab('wallets')) },
          { key: 'categories', icon: 'category', label: 'Categories', onPress: openFromDrawer(() => setTab('categories')) },
          { key: 'archive', icon: 'archive', label: 'Archive', onPress: openFromDrawer(() => setArchiveOpen(true)) },
        ] },
        { key: 'app', label: 'App', items: [
          { key: 'settings', icon: 'settings', label: 'Settings', onPress: openFromDrawer(() => openSettingsPage('root')) },
          { key: 'customize', icon: 'layout-grid', label: 'Customize MaalFlow', onPress: openFromDrawer(() => setTab('customize')) },
          { key: 'data', icon: 'database', label: 'Data & backup', onPress: openFromDrawer(() => openSettingsPage('data')) },
          { key: 'benefits', icon: 'gift', label: 'Benefits & invites', onPress: openFromDrawer(() => setTab('benefits')) },
        ] },
        { key: 'support', label: 'Support', items: [
          { key: 'help', icon: 'help-circle', label: 'Help', onPress: openFromDrawer(() => openSettingsPage('support')) },
          { key: 'about', icon: 'info-circle', label: 'About MaalFlow', onPress: openFromDrawer(() => openSettingsPage('about')) },
        ] },
      ];
  const drawerAccount = {
    name: accountName,
    status: user
      ? (user.email || (cfg.lang === 'ar' ? 'مسجّل الدخول' : 'Signed in'))
      : (cfg.lang === 'ar' ? 'غير مسجّل · بياناتك على هذا الجهاز' : 'Not signed in · your data is on this device'),
  };

  return (
    <UIProvider theme={cfg.theme} lang={cfg.lang} fontId={cfg.fontId} fontScale={cfg.fontScale}>
    <SafeAreaView edges={['top', 'right', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
      <StatusBar style={statusStyle(th)} />

      {mergeReviewSeconds > 0 ? (
        <View style={{
          marginHorizontal: 12,
          marginTop: 6,
          marginBottom: 4,
          paddingHorizontal: 12,
          paddingVertical: 9,
          borderRadius: 12,
          backgroundColor: th.card,
          borderWidth: 1,
          borderColor: th.primary,
          flexDirection: isRtl ? 'row-reverse' : 'row',
          alignItems: 'center',
          gap: 10,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: th.text, fontSize: 12, fontWeight: '800', textAlign: isRtl ? 'right' : 'left' }}>
              {cfg.lang === 'ar' ? 'تم الدمج · نقطة الرجوع محفوظة' : 'Merge complete · rollback point saved'}
            </Text>
            <Text style={{ color: th.sub, fontSize: 10, marginTop: 2, textAlign: isRtl ? 'right' : 'left' }}>
              {cfg.lang === 'ar'
                ? `تظهر مراجعة النتيجة خلال ${mergeReviewSeconds} ثانية`
                : `Review opens in ${mergeReviewSeconds} seconds`}
            </Text>
          </View>
          <Pressable onPress={openMergeReviewNow} hitSlop={8} style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
            <Text style={{ color: th.primary, fontSize: 11, fontWeight: '900' }}>
              {cfg.lang === 'ar' ? 'مراجعة الآن' : 'Review now'}
            </Text>
          </Pressable>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {/* Same stale __DEV__ coupling as the exit-effect above, and the same
            fix: performanceTestMode is the real signal for a genuine lab
            session, so the warning banner must not depend on __DEV__ either --
            otherwise a release-build tester sees no "this is test data" banner
            at all while genuinely inside the performance lab. */}
        {(INTERNAL_DEMO_ENABLED || cfg.performanceTestMode) && cfg.demoMode ? (
          <View style={[s.demoBanner, { backgroundColor: th.warnBg, borderColor: th.warn }]}>
            <Ionicons name="flask-outline" size={14} color={th.warn} />
            <Text style={{ color: th.warn, fontSize: 11, fontWeight: '900' }}>
              {cfg.lang === 'ar' ? 'بيانات تجريبية - لا تتم مزامنتها' : 'Demo data - never synced'}
            </Text>
          </View>
        ) : null}
        {/* Interim back affordance for legacy sub-screens that draw no back
            arrow of their own; rebuilt screens bring the sub-screen bar
            (arrow + title) and this row disappears with them. Settings has
            its own header and exit. */}
        {isSecondaryScreen && tab !== 'settings' ? (
          <Pressable
            onPress={handleBack}
            style={[s.backToHubBar, { flexDirection: isRtl ? 'row-reverse' : 'row', borderBottomColor: th.border }]}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Ionicons name={isRtl ? 'chevron-forward' : 'chevron-back'} size={20} color={th.text} />
            <Text style={{ color: th.text, fontSize: 13, fontWeight: '800' }}>
              {cfg.lang === 'ar' ? 'رجوع' : 'Back'}
            </Text>
          </Pressable>
        ) : null}
        {screens[tab]}
      </View>

      <TabBar tabs={visibleTabs} activeKey={activeRoot} onSelect={setTab} bottomInset={bottomInset} />

      {/* + is Home-only. Until Home is rebuilt, the legacy quick-entry mode
          still draws its own add buttons, so the FAB keeps its classic-mode gate. */}
      {classicEntry && showsFab(navStack) ? (
        <Fab
          onPress={handleFab}
          bottomInset={bottomInset}
          accessibilityLabel={cfg.lang === 'ar' ? 'حركة جديدة' : 'New transaction'}
        />
      ) : null}
      <AppDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        account={drawerAccount}
        groups={drawerGroups}
        onOpenAccount={openFromDrawer(() => openSettingsPage('account'))}
      />

      <AddTransModal
        visible={showAdd}
        onClose={() => {
          setShowAdd(false);
          setAddDraft(null);
        }}
        initialMode={addPreset.mode}
        initialDebtId={addPreset.debtId}
        initialGoalId={addPreset.goalId}
        initialCommitmentId={addPreset.commitmentId}
        focusedEntry={addPreset.focused}
        draftData={addDraft}
      />
      <NewItemModal visible={showNewItem} kind="tracker" preset={newItemPreset} onClose={() => { setShowNewItem(false); setNewItemPreset(null); }} />
      <NotificationCenterModal
        visible={showNotif}
        onClose={() => setShowNotif(false)}
        onItemPress={handleNotificationPress}
        onDismissItems={dismissNotifications}
        items={notifItems}
        th={th}
        lang={cfg.lang}
      />
      <PasswordRecoveryModal
        visible={passwordRecoveryOpen}
        onClose={() => setPasswordRecoveryOpen(false)}
        th={th}
        lang={cfg.lang}
      />
      <DecisionModal
        visible={!!mergeResult}
        lang={cfg.lang}
        th={th}
        title={mergeResult?.duplicateOnly
          ? (cfg.lang === 'ar' ? 'تم تنظيف البيانات المكررة' : 'Duplicate data cleaned')
          : (cfg.lang === 'ar' ? 'تم دمج البيانات' : 'Data merged')}
        message={mergeResult?.duplicateOnly
          ? (cfg.lang === 'ar' ? 'كانت البيانات الموجودة على الجهاز مكررة ولا تضيف معلومات جديدة، لذلك تم تنظيف نسخة الضيف بدون تكرار السجل.' : 'The device data was duplicated and added no new information, so the guest copy was cleaned without repeating history.')
          : (cfg.lang === 'ar' ? 'تمت إضافة المختلف ودمج المكرر. إذا لاحظت نتيجة غير مناسبة يمكنك الرجوع إلى حالة ما قبل الدمج الآن.' : 'Different information was added and duplicates were merged. You can roll back to the pre-merge state now if the result is not right.')}
        confirmLabel={cfg.lang === 'ar' ? 'إبقاء التغييرات' : 'Keep changes'}
        cancelLabel={cfg.lang === 'ar' ? 'رجوع' : 'Roll back'}
        confirmIcon="checkmark-circle-outline"
        cancelIcon="arrow-undo-outline"
        heroIcon="git-merge-outline"
        cancelTone={th.warn}
        dismissible={false}
        busy={mergeRollbackBusy}
        onConfirm={keepMergeChanges}
        onCancel={rollbackMergedChanges}
        onClose={keepMergeChanges}
      />
      {maintenanceOverlay}
    </SafeAreaView>
    </UIProvider>
  );
}

const s = StyleSheet.create({
  crashScreen: { flex: 1, backgroundColor: '#061018', alignItems: 'center', justifyContent: 'center', padding: 32 },
  crashTitle: { color: '#F3F8FC', fontSize: 20, fontWeight: '900', marginTop: 16 },
  crashBody: { color: '#8DA2B6', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  crashDetails: { color: '#F0A84A', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 },
  demoBanner: { minHeight: 32, borderBottomWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12 },
  backToHubBar: { minHeight: 44, borderBottomWidth: 0.5, alignItems: 'center', gap: 6, paddingHorizontal: 16 },
  splash: {
    flex: 1,
    backgroundColor: '#0D1110',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  splashLogo: {
    width: 164,
    height: 164,
    marginBottom: 14,
  },
  splashTitle: {
    color: '#F3F8FC',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
  },
  splashSubtitle: {
    color: '#8DA2B6',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    ...SHADOW.card,
  },
  lockMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  lockTitle: { fontSize: 18, fontWeight: '900' },
  lockBody: { fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 18 },
  unlockBtn: {
    minWidth: 180,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  shellBackdrop: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  headerFrame: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 14,
    ...SHADOW.card,
  },
  headerTop: { alignItems: 'center', gap: 12 },
  brandMark: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
  },
  headerActions: { alignItems: 'center', gap: 8 },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  notifBadgeText: { color: '#fff', fontSize: 10, lineHeight: 13, fontWeight: '900' },
  cloudBadge: {
    minHeight: 38,
    borderRadius: 13,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexDirection: 'row',
  },
  cloudBadgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '900',
  },
  headerFoot: {
    marginTop: 12,
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '900',
  },
  syncText: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
    marginTop: 10,
  },
  archiveHead: { alignItems: 'center', gap: 12 },
  archiveBackRow: { alignItems: 'center' },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  archiveTitle: { fontSize: 18, lineHeight: 23, fontWeight: '900' },
});
