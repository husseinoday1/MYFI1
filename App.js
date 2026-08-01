import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Appearance, I18nManager, Image, Linking, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useStore } from './src/store/useStore';
import { TH } from './src/lib/theme';
import { STR } from './src/lib/strings';
import { STORAGE, getSymbol } from './src/lib/constants';
import { supabase } from './src/lib/supabase';
import { authenticate } from './src/lib/biometric';
import { checkDecisionAlerts } from './src/lib/notifications';
import { buildNotificationItems, notificationReadKey, sanitizeNotificationReadKeys } from './src/lib/notificationCenter';
import { applyGlobalFont, fontAssets } from './src/lib/fonts';
import { RADIUS, SHADOW } from './src/lib/tokens';

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
import { getModules, shouldShowTrackersTab } from './src/lib/modules';
import { handleAuthCallback } from './src/lib/authCallback';

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
    transferGuestToCurrent,
    dismissGuestTransfer,
    syncConflict,
    resolveSyncConflict,
  } = useStore();
  const [tab, setTab] = useState('home');
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
  const guestPromptOpen = useRef(false);
  const conflictPromptOpen = useRef(false);
  const handledAuthUrls = useRef(new Set());
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const fontReady = fontsLoaded || !!fontError;

  useEffect(() => {
    if (cfg.themeMode !== 'system') return undefined;
    const applyTheme = ({ colorScheme } = {}) => {
      const theme = (colorScheme || Appearance.getColorScheme()) === 'light' ? 'light' : 'dark';
      if (theme !== useStore.getState().cfg.theme) useStore.getState().setCfg({ theme });
    };
    applyTheme();
    const sub = Appearance.addChangeListener(applyTheme);
    return () => sub.remove();
  }, [cfg.themeMode]);

  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const sym = getSymbol(cfg.currency);
  const modules = getModules(cfg);
  const isRtl = cfg.lang === 'ar';
  // Row order is mirrored explicitly by each bilingual component.
  // Keeping the shell LTR prevents Arabic rows from being reversed twice.
  const dirStyle = { direction: 'ltr' };
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);
  const notifItems = useMemo(
    () => buildNotificationItems({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol: sym }),
    [trans, debts, goals, wallets, commitments, cats, cfg, notif, sym],
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
      await loadLocal();
      const completed = await AsyncStorage.getItem(STORAGE.ONBOARD);
      setShowOnboard(completed !== 'true');
      setReady(true);
    })();

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
    let active = true;
    const processUrl = async (url) => {
      if (!url || handledAuthUrls.current.has(url)) return;
      handledAuthUrls.current.add(url);
      try {
        const result = await handleAuthCallback(url);
        if (!active || !result.handled) return;
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
  }, [cfg.lang]);

  useEffect(() => {
    if (!ready || !user || !workspaceReady) return;
    loadCloud();
  }, [ready, user, workspaceReady, loadCloud]);

  useEffect(() => {
    if (!ready || !user || !workspaceReady || !pendingGuestTransfer || guestPromptOpen.current) return;
    guestPromptOpen.current = true;
    const ar = cfg.lang === 'ar';
    Alert.alert(
      ar ? 'بيانات محفوظة على الجهاز' : 'Local data found',
      ar
        ? 'توجد بيانات استخدمتها قبل تسجيل الدخول. هل تريد نقلها إلى هذا الحساب؟ لن تُحذف النسخة المحلية إلا بعد نجاح المزامنة.'
        : 'Data created before sign-in was found. Move it to this account? The local copy is kept until sync succeeds.',
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
          text: ar ? 'نقل البيانات' : 'Move data',
          onPress: async () => {
            const moved = await transferGuestToCurrent();
            guestPromptOpen.current = false;
            if (!moved) {
              Alert.alert(
                ar ? 'لم يكتمل النقل' : 'Transfer not completed',
                ar ? 'بقيت بياناتك المحلية محفوظة. تحقق من الاتصال وحاول لاحقاً.' : 'Your local data is still safe. Check the connection and try again.',
              );
            }
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
    cfg.lang,
    transferGuestToCurrent,
    dismissGuestTransfer,
  ]);

  useEffect(() => {
    if (!ready || !syncConflict || conflictPromptOpen.current) return;
    conflictPromptOpen.current = true;
    const ar = cfg.lang === 'ar';
    Alert.alert(
      ar ? 'تغييرات من جهاز آخر' : 'Changes from another device',
      ar
        ? 'توجد نسخة أحدث على السحابة مع تغييرات محلية غير متزامنة. اختر النسخة التي تريد الاحتفاظ بها.'
        : 'A newer cloud copy and unsynced local changes both exist. Choose which copy to keep.',
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

  useEffect(() => {
    AsyncStorage.getItem('MYFI_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (!raw) return;
        const safe = sanitizeNotificationReadKeys(JSON.parse(raw));
        setReadNotifKeys(safe);
        AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(safe)).catch(() => {});
      })
      .catch(() => {});
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
      if (state === 'active') setLocked(true);
    });
    return () => sub.remove();
  }, [ready, cfg.bioLock]);

  useEffect(() => {
    if (!ready) return;
    checkDecisionAlerts({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol: sym });
  }, [ready, trans, debts, goals, wallets, commitments, cats, cfg, notif, sym]);

  useEffect(() => {
    if (!visibleTabs.some(t => t.key === tab)) setTab('home');
  }, [visibleTabs, tab]);

  useEffect(() => {
    if (!ready) return;
    setTab(prev => (prev === 'home' ? preferredTab : prev));
  }, [ready, preferredTab]);

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
    if (!modules.wallets) return;
    setAddDraft(null);
    setAddPreset({ mode: 'transfer', debtId: null, goalId: null, commitmentId: null, focused: true });
    setShowAdd(true);
  };
  const openSmartEntry = () => {
    setAddDraft({ smartMode: 'text' });
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
  const openNewTracker = () => {
    if (!shouldShowTrackersTab(cfg)) return;
    setNewItemPreset(null);
    setShowNewItem(true);
  };
  const openLinkedPlan = (preset) => {
    setNewItemPreset(preset || null);
    setShowNewItem(true);
  };

  const handleFab = tab === 'trackers' ? openNewTracker : () => openAddExp(false);
  const classicEntry = cfg.entryMode === 'classic';

  const openNotifications = async () => {
    setShowNotif(true);
    const next = Array.from(new Set([...readNotifKeys, ...notifKeys])).slice(-80);
    setReadNotifKeys(next);
    await AsyncStorage.setItem('MYFI_READ_NOTIFICATIONS_V1', JSON.stringify(next));
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
        onNotificationAction={handleNotificationPress}
      />
    ),
    history: <HistoryScreen />,
    trackers: <TrackersLabScreen focusRequest={trackerFocus} onQuickPay={openQuickPay} onQuickSave={openQuickSave} onQuickCommitment={openQuickCommitment} onAddLinkedPlan={openLinkedPlan} onNewTracker={openNewTracker} quickEntry={!classicEntry} />,
    reports: <ReportsScreen />,
    settings: <SettingsScreen onOpenArchive={() => setArchiveOpen(true)} tabs={visibleTabs} />,
  };

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={[{ flex: 1, backgroundColor: th.bg }, dirStyle]}>
      <StatusBar style={statusStyle(th)} />

      <View style={{ flex: 1 }}>
        {cfg.demoMode ? (
          <View style={[s.demoBanner, { backgroundColor: th.warnBg, borderColor: th.warn }]}>
            <Ionicons name="flask-outline" size={14} color={th.warn} />
            <Text style={{ color: th.warn, fontSize: 11, fontWeight: '900' }}>
              {cfg.lang === 'ar' ? 'بيانات تجريبية — لا تتم مزامنتها' : 'Demo data — never synced'}
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
                onPress={() => setTab(item.key)}
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

      {classicEntry && ['home', 'trackers'].includes(tab) ? (
        <DraggableFab th={th} onPress={handleFab} bottomInset={bottomInset} label="" color={tab === 'trackers' ? th.warn : th.primary} />
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  crashScreen: { flex: 1, backgroundColor: '#061018', alignItems: 'center', justifyContent: 'center', padding: 32 },
  crashTitle: { color: '#F3F8FC', fontSize: 20, fontWeight: '900', marginTop: 16 },
  crashBody: { color: '#8DA2B6', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 8 },
  demoBanner: { minHeight: 32, borderBottomWidth: 0.5, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 12 },
  splash: {
    flex: 1,
    backgroundColor: '#031D2A',
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
    letterSpacing: 0.4,
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
