// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Appearance, BackHandler, I18nManager, Image, Linking, StyleSheet, Text, useColorScheme, View } from 'react-native';
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
import ReportsScreen from './src/screens/ReportsScreen';
import ArchiveScreen from './src/screens/ArchiveScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AddTransModal from './src/components/AddTransModal';
import NewItemModal from './src/components/NewItemModal';
import DraggableFab from './src/components/DraggableFab';
import NotificationCenterModal from './src/components/NotificationCenterModal';
import PressableScale from './src/components/PressableScale';
import AppAlertHost from './src/components/AppAlertHost';
import PasswordRecoveryModal from './src/components/PasswordRecoveryModal';
import DecisionModal from './src/components/DecisionModal';
import { filterByActiveScope, getEntryScope, getModules, normalizeScope, shouldShowTrackersTab } from './src/lib/modules';
import { handleAuthCallback } from './src/lib/authCallback';
import { normalizeWallets } from './src/lib/wallets';

const FORCE_ONBOARDING = process.env.EXPO_PUBLIC_FORCE_ONBOARDING === '1';
const FRESH_TEST_MODE = process.env.EXPO_PUBLIC_FRESH_TEST === '1';
const FRESH_TEST_NAMESPACE = 'fresh-test-new-user';
const INTERNAL_DEMO_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_INTERNAL_DEMO === '1';
const R01_DEVICE_GATE_ENABLED = __DEV__ && process.env.EXPO_PUBLIC_R01_DEVICE_GATE === '1';
let r01DeviceGateStarted = false;

const BASE_TABS = [
  { key: 'home', icon: 'home-outline', labelKey: 'home' },
  { key: 'history', icon: 'receipt-outline', labelAr: 'السجل', labelEn: 'History' },
  { key: 'trackers', icon: 'layers-outline', labelAr: 'المتابعات', labelEn: 'Trackers' },
  { key: 'reports', icon: 'bar-chart-outline', labelKey: 'reports' },
  { key: 'settings', icon: 'settings-outline', labelKey: 'settings' },
];

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
        <Text style={s.crashTitle}>MYFI could not start</Text>
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
    syncConflict,
    resolveSyncConflict,
    exitDemoMode,
  } = useStore();
  const [tab, setTab] = useState('home');
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
  const [mergeRollbackBusy, setMergeRollbackBusy] = useState(false);
  const guestPromptOpen = useRef(false);
  const mergeRollbackPromptTimer = useRef(null);
  const conflictPromptOpen = useRef(false);
  const handledAuthUrls = useRef(new Set());
  const lockBackgroundAt = useRef(null);
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontReady = fontsLoaded || !!fontError;
  const systemColorScheme = useColorScheme();

  useEffect(() => {
    if (!ready || !R01_DEVICE_GATE_ENABLED || r01DeviceGateStarted) return;
    r01DeviceGateStarted = true;
    import('./src/dev/financialLedgerV7DeviceHarness')
      .then(({ runFinancialLedgerV7DeviceHarness }) => runFinancialLedgerV7DeviceHarness())
      .then(result => console.info('[MYFI:R01_DEVICE_GATE] PASS', JSON.stringify(result)))
      .catch(error => console.error('[MYFI:R01_DEVICE_GATE] FAIL', String(error?.message || error)));
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

  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const sym = getSymbol(cfg.currency);
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
    () => BASE_TABS.filter(item => item.key !== 'trackers' || shouldShowTrackersTab(cfg)),
    [cfg.enabledModules],
  );
  const preferredTab = visibleTabs.some(item => item.key === cfg.startTab) ? cfg.startTab : 'home';

  useEffect(() => {
    (async () => {
      if (FRESH_TEST_MODE) {
        await clearVaultSnapshot(FRESH_TEST_NAMESPACE);
        await loadLocal(FRESH_TEST_NAMESPACE, { allowLegacy: false });
        setShowOnboard(true);
        setReady(true);
        return;
      }

      await loadLocal();
      const completed = await AsyncStorage.getItem(STORAGE.ONBOARD);
      setShowOnboard(FORCE_ONBOARDING || completed !== 'true');
      setReady(true);
    })();

    if (FRESH_TEST_MODE) return undefined;

    supabase.auth.getSession()
      .then(({ data }) => {
        if (data?.session?.user) setUser(data.session.user);
      })
      .catch(() => setUser(null));

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, [loadLocal, setUser]);

  useEffect(() => {
    if (FRESH_TEST_MODE) return undefined;
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
  }, [cfg.lang, setUser]);

  useEffect(() => {
    if (!ready || !user || !workspaceReady) return;
    loadCloud();
  }, [ready, user, workspaceReady, loadCloud]);

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
        ? `توجد بيانات محفوظة على هذا الجهاز قبل تسجيل الدخول. إذا وافقت، سيضيف MYFI المعلومات المختلفة فقط، ويدمج المعلومات المكررة حتى لا تظهر مرتين. ${previewLine} سنحفظ نقطة رجوع قبل التنفيذ.`
        : `Data saved on this device was found before sign-in. If you continue, MYFI will add only different information; duplicates are merged without repetition. ${previewLine} A rollback point will be saved before the change.`,
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
            mergeRollbackPromptTimer.current = setTimeout(() => {
              mergeRollbackPromptTimer.current = null;
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
    AsyncStorage.getItem('MYFI_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (!raw) return;
        const safe = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(raw)));
        setReadNotifKeys(safe);
        AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(safe)).catch(() => {});
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
        const entries = await AsyncStorage.multiGet(['MYFI_READ_NOTIFICATIONS_V1', NOTIFICATION_DISMISSED_STORAGE_KEY]);
        const values = new Map(entries);
        const nextRead = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(values.get('MYFI_READ_NOTIFICATIONS_V1') || '[]')));
        const nextDismissed = pruneNotificationKeys(sanitizeNotificationReadKeys(JSON.parse(values.get(NOTIFICATION_DISMISSED_STORAGE_KEY) || '[]')));
        setReadNotifKeys(current => JSON.stringify(current) === JSON.stringify(nextRead) ? current : nextRead);
        setDismissedNotifKeys(current => JSON.stringify(current) === JSON.stringify(nextDismissed) ? current : nextDismissed);
        await AsyncStorage.multiSet([
          ['MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(nextRead)],
          [NOTIFICATION_DISMISSED_STORAGE_KEY, JSON.stringify(nextDismissed)],
        ]);
      } catch {}
    };
    const timer = setInterval(cleanExpiredNotificationKeys, 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== isRtl) I18nManager.forceRTL(isRtl);
  }, [isRtl]);

  useEffect(() => {
    if (fontsLoaded) applyGlobalFont();
    if (fontError) console.warn('[MYFI] Cairo font failed to load; falling back to system font.', fontError);
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
    if (!visibleTabs.some(t => t.key === tab)) setTab('home');
  }, [visibleTabs, tab]);

  useEffect(() => {
    if (!ready) return;
    setTab(prev => (prev === 'home' ? preferredTab : prev));
  }, [ready, preferredTab]);

  useEffect(() => {
    // Legacy internal demo data must never leak into a normal build. The
    // development-only performance lab is intentionally different: when the
    // user activates it, it must remain active until they explicitly return
    // to their real workspace.
    if (!ready || INTERNAL_DEMO_ENABLED || !cfg.demoMode) return;
    if (__DEV__ && cfg.performanceTestMode === true) return;
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
        <Image source={require('./assets/myfi-splash-logo.png')} style={s.splashLogo} resizeMode="contain" />
        <Text style={s.splashTitle}>MYFI</Text>
        <Text style={s.splashSubtitle}>
          {cfg.lang === 'ar' ? 'أموالك بوضوح' : 'Your finances, clearly'}
        </Text>
      </View>
    );
  }

  if (showOnboard) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={statusStyle(th)} />
        <OnboardingScreen cfg={cfg} onDone={finishOnboard} />
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

  const handleFab = () => openAddExp(false);
  const classicEntry = cfg.entryMode === 'classic';

  const openNotifications = async () => {
    setShowNotif(true);
    const next = Array.from(new Set([...readNotifKeys, ...notifKeys])).slice(-80);
    setReadNotifKeys(next);
    await AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(next));
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
      setTab('trackers');
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
        setTab('trackers');
        openQuickSave(action.goalId);
        return;
      }
      if (action.mode === 'debt' && action.debtId) {
        setTab('trackers');
        openQuickPay(action.debtId);
        return;
      }
      if (action.mode === 'commitment' && action.commitmentId) {
        setTab('trackers');
        openQuickCommitment(action.commitmentId);
        return;
      }
      openAddExp();
    }
  };

  const screens = {
    home: (
      <HomeScreen
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
    history: <HistoryScreen />,
    trackers: (
      <TrackersLabScreen
        focusRequest={trackerFocus}
        onQuickPay={openQuickPay}
        onQuickSave={openQuickSave}
        onQuickCommitment={openQuickCommitment}
        onAddLinkedPlan={openLinkedPlan}
        onNewTracker={openNewTracker}
      />
    ),
    reports: <ReportsScreen />,
    settings: <SettingsScreen onOpenArchive={() => setArchiveOpen(true)} tabs={visibleTabs} resetSignal={settingsResetSignal} openRequest={settingsOpenRequest} />,
  };

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
      <StatusBar style={statusStyle(th)} />

      <View style={{ flex: 1 }}>
        {INTERNAL_DEMO_ENABLED && cfg.demoMode ? (
          <View style={[s.demoBanner, { backgroundColor: th.warnBg, borderColor: th.warn }]}>
            <Ionicons name="flask-outline" size={14} color={th.warn} />
            <Text style={{ color: th.warn, fontSize: 11, fontWeight: '900' }}>
              {cfg.lang === 'ar' ? 'بيانات تجريبية - لا تتم مزامنتها' : 'Demo data - never synced'}
            </Text>
          </View>
        ) : null}
        {screens[tab]}
      </View>

      <View
        style={[
          s.navWrap,
          {
            backgroundColor: th.nav,
            borderTopColor: th.border,
            paddingBottom: Math.max(bottomInset, 8) + 4,
          },
        ]}
      >
        <View style={[s.navbar, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          {visibleTabs.map((item) => {
            const active = tab === item.key;
            const label = item.labelKey ? L[item.labelKey] : (cfg.lang === 'ar' ? item.labelAr : item.labelEn);
            return (
              <PressableScale
                key={item.key}
                onPress={() => {
                  if (item.key === 'settings') {
                    // A bottom-tab entry is an explicit root navigation command.
                    // Keep it separate from Home's requested subpage route.
                    setSettingsOpenRequest({ page: 'root', nonce: Date.now() });
                    setTab('settings');
                    return;
                  }
                  setTab(item.key);
                }}
                style={s.tabBtn}
                haptic="selection"
                scale={0.95}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={label}
              >
                <View style={s.tabIconWrap}>
                  <Ionicons
                    name={active ? item.icon.replace('-outline', '') : item.icon}
                    size={23}
                    color={active ? th.primary : th.faint}
                  />
                </View>
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={[
                    s.tabLabel,
                    {
                      color: active ? th.primary : th.faint,
                      fontWeight: active ? '900' : '700',
                    },
                  ]}
                >
                  {label}
                </Text>
              </PressableScale>
            );
          })}
        </View>
      </View>

      {classicEntry && tab === 'home' ? (
        <DraggableFab th={th} onPress={handleFab} bottomInset={bottomInset} label="" color={th.primary} />
      ) : null}
      {classicEntry && tab === 'trackers' ? (
        <DraggableFab th={th} onPress={() => openNewTracker()} bottomInset={bottomInset} label="" color={th.primary} />
      ) : null}

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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  crashScreen: { flex: 1, backgroundColor: '#061018', alignItems: 'center', justifyContent: 'center', padding: 32 },
  crashTitle: { color: '#F3F8FC', fontSize: 20, fontWeight: '900', marginTop: 16 },
  crashBody: { color: '#8DA2B6', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  crashDetails: { color: '#F0A84A', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 },
  demoBanner: { minHeight: 32, borderBottomWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12 },
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
  navWrap: {
    paddingHorizontal: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navbar: {
    paddingHorizontal: 2,
    paddingTop: 5,
  },
  tabBtn: {
    flex: 1,
    minHeight: 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5,
  },
  tabIconWrap: {
    width: 32,
    height: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 12,
    lineHeight: 14,
  },
});
