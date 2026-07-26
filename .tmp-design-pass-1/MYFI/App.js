import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, AppState, I18nManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useFonts,
  Cairo_300Light,
  Cairo_400Regular,
  Cairo_500Medium,
  Cairo_600SemiBold,
  Cairo_700Bold,
  Cairo_800ExtraBold,
  Cairo_900Black,
} from '@expo-google-fonts/cairo';
import { useStore } from './src/store/useStore';
import { TH } from './src/lib/theme';
import { STR } from './src/lib/strings';
import { STORAGE, getSymbol } from './src/lib/constants';
import { SPACE, RADIUS, ELEVATION, weight } from './src/lib/tokens';
import { supabase } from './src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authenticate } from './src/lib/biometric';
import { checkCommitmentAlerts, checkDebtAndBalanceAlerts, checkRecurringAlerts } from './src/lib/notifications';

import OnboardingScreen from './src/screens/OnboardingScreen';
import HomeScreen        from './src/screens/HomeScreen';
import TrackersLabScreen from './src/screens/TrackersLabScreen';
import ReportsScreen     from './src/screens/ReportsScreen';
import ArchiveScreen     from './src/screens/ArchiveScreen';
import SettingsScreen    from './src/screens/SettingsScreen';
import AddTransModal     from './src/components/AddTransModal';
import NewItemModal      from './src/components/NewItemModal';
import DraggableFab      from './src/components/DraggableFab';
import NotificationCenterModal from './src/components/NotificationCenterModal';
import { Touchable } from './src/components/AppPrimitives';
import { buildNotificationItems } from './src/lib/notificationCenter';

const BASE_TABS = [
  { key:'home',     icon:'home-outline',      labelKey:'home' },
  { key:'trackers', icon:'layers-outline', labelAr:'المتابعات', labelEn:'Trackers' },
  { key:'reports',  icon:'bar-chart-outline', labelKey:'reports' },
  { key:'settings', icon:'settings-outline',  labelKey:'settings' },
];

export default function App() {
  return (
    <SafeAreaProvider>
      <AppRoot />
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const [fontsLoaded, fontError] = useFonts({
    Cairo_300Light,
    Cairo_400Regular,
    Cairo_500Medium,
    Cairo_600SemiBold,
    Cairo_700Bold,
    Cairo_800ExtraBold,
    Cairo_900Black,
  });
  // فشل تحميل الخط ما يوقف التطبيق — يرجع لخط النظام بدل تعليق لا نهائي.
  const fontsReady = fontsLoaded || !!fontError;

  const { cfg, loadLocal, setUser, syncing, user, trans, debts, goals, wallets, commitments, cats, notif } = useStore();
  const [tab,         setTab]         = useState('home');
  const [showAdd,      setShowAdd]      = useState(false);
  const [addPreset,    setAddPreset]    = useState({ mode: 'exp', debtId: null, goalId: null, commitmentId: null });
  const [addDraft,     setAddDraft]     = useState(null);
  const [showNewItem,  setShowNewItem]  = useState(false);
  const [newItemPreset, setNewItemPreset] = useState(null);
  const [ready,        setReady]        = useState(false);
  const [showOnboard,  setShowOnboard]  = useState(false);
  const [archiveOpen,  setArchiveOpen]  = useState(false);
  const [locked,       setLocked]       = useState(false);
  const [showNotif,    setShowNotif]    = useState(false);
  const [readNotifKeys, setReadNotifKeys] = useState([]);

  const th = TH[cfg.theme] || TH.dark;
  const L  = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency);
  const isRtl = cfg.lang === 'ar';
  const dirStyle = { direction: isRtl ? 'rtl' : 'ltr' };
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 0);
  const notifItems = useMemo(
    () => buildNotificationItems({ trans, debts, goals, wallets, commitments, cats, cfg, notif, symbol: sym }),
    [trans, debts, goals, wallets, commitments, cats, cfg, notif, sym],
  );
  const notifKeys = useMemo(() => notifItems.map(item => `${item.id}:${item.body}`), [notifItems]);
  const unreadNotifCount = notifKeys.filter(key => !readNotifKeys.includes(key)).length;
  const visibleTabs = BASE_TABS;

  useEffect(() => {
    (async () => {
      await loadLocal();
      const onboarded = await AsyncStorage.getItem(STORAGE.ONBOARD);
      if (!onboarded) setShowOnboard(true);
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
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('MYFI_READ_NOTIFICATIONS_V1')
      .then(raw => {
        if (raw) setReadNotifKeys(JSON.parse(raw));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== isRtl) I18nManager.forceRTL(isRtl);
  }, [isRtl]);

  // ✅ قفل البصمة عند الفتح ورجوع التطبيق من الخلفية
  useEffect(() => {
    if (!ready || !cfg.bioLock) return;
    setLocked(true);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setLocked(true);
    });
    return () => sub.remove();
  }, [ready, cfg.bioLock]);

  // ✅ فحص تنبيهات الديون/انخفاض الرصيد عند فتح التطبيق (متروتل داخلياً)
  useEffect(() => {
    if (!ready) return;
    checkDebtAndBalanceAlerts(cfg.lang, trans, debts, notif, cfg, wallets);
  }, [ready, cfg, trans, debts, notif, wallets]);

  useEffect(() => {
    if (!ready) return;
    checkRecurringAlerts(cfg.lang, trans);
  }, [ready, cfg.lang, trans]);

  useEffect(() => {
    if (!ready) return;
    checkCommitmentAlerts(cfg.lang, commitments, notif);
  }, [ready, cfg.lang, commitments, notif]);

  useEffect(() => {
    if (!visibleTabs.some(t => t.key === tab)) setTab('home');
  }, [visibleTabs, tab]);

  const finishOnboard = async () => {
    await AsyncStorage.setItem(STORAGE.ONBOARD, 'true');
    setShowOnboard(false);
  };

  const unlock = async () => {
    const res = await authenticate(L.bioPrompt);
    if (res.success) setLocked(false);
  };

  // شاشة التحميل
  if (!ready || !fontsReady) {
    return (
      <View style={{ flex:1, backgroundColor:'#0B1411', alignItems:'center', justifyContent:'center' }}>
        <Text style={{ fontSize:48 }}>🌿</Text>
        <Text style={{ color:'#4ade80', marginTop:12, fontWeight:'900', fontSize:22, letterSpacing:2 }}>MYFI</Text>
      </View>
    );
  }

  // Onboarding (مرة واحدة)
  if (showOnboard) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex:1, backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={cfg.theme === 'dark' ? 'light' : 'dark'} />
        <OnboardingScreen cfg={cfg} onDone={finishOnboard} />
      </SafeAreaView>
    );
  }

  // قفل البصمة
  if (locked) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex:1, backgroundColor: th.bg, alignItems:'center', justifyContent:'center', padding:32 }, dirStyle]}>
        <StatusBar style={cfg.theme === 'dark' ? 'light' : 'dark'} />
        <Ionicons name="lock-closed-outline" size={48} color={th.primary} style={{ marginBottom:18 }} />
        <Text style={{ color: th.text, fontSize:17, ...weight('700'), marginBottom:24, textAlign:'center' }}>{L.bioPrompt}</Text>
        <Touchable onPress={unlock} haptic="light" style={[s.unlockBtn, { backgroundColor: th.primary }]}>
          <Text style={{ color: th.onPrimary, ...weight('800'), fontSize:15 }}>{L.unlockApp}</Text>
        </Touchable>
      </SafeAreaView>
    );
  }

  // الأرشيف (يُفتح كرابط من الإعدادات، خارج التنقل الرئيسي)
  if (archiveOpen) {
    return (
      <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={[{ flex:1, backgroundColor: th.bg }, dirStyle]}>
        <StatusBar style={cfg.theme === 'dark' ? 'light' : 'dark'} />
        <View style={[s.header, { backgroundColor: th.bg, borderBottomColor: th.border, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <Touchable onPress={() => setArchiveOpen(false)} style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
            <Ionicons name={cfg.lang === 'ar' ? 'chevron-forward' : 'chevron-back'} size={20} color={th.text} />
            <Text style={{ color: th.text, fontSize:16, ...weight('700') }}>{L.archiveTitle}</Text>
          </Touchable>
        </View>
        <View style={{ flex:1 }}>
          <ArchiveScreen />
        </View>
      </SafeAreaView>
    );
  }

  const openAddExp  = () => { setAddDraft(null); setAddPreset({ mode:'exp', debtId:null, goalId:null, commitmentId:null }); setShowAdd(true); };
  const openQuickPay  = (debtId) => { setAddDraft(null); setAddPreset({ mode:'debt', debtId, goalId:null, commitmentId:null }); setShowAdd(true); };
  const openQuickSave  = (goalId) => { setAddDraft(null); setAddPreset({ mode:'goal', debtId:null, goalId, commitmentId:null }); setShowAdd(true); };
  const openQuickCommitment = (commitmentId) => { setAddDraft(null); setAddPreset({ mode:'commitment', debtId:null, goalId:null, commitmentId }); setShowAdd(true); };
  const openNewTracker = () => { setNewItemPreset(null); setShowNewItem(true); };
  const openLinkedPlan = (preset) => { setNewItemPreset(preset || null); setShowNewItem(true); };

  const handleFab = () => {
    if (tab === 'trackers') openNewTracker();
    else openAddExp();
  };

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

    if (action.type === 'open_commit_sub') {
      setTab('trackers');
      return;
    }

    if (action.type === 'open_recurring') {
      setTab('home');
      setAddDraft(action.draftData || null);
      setAddPreset({ mode:'exp', debtId:null, goalId:null, commitmentId:null });
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

  const showFab = tab === 'home' || tab === 'trackers';

  const screens = {
    home:     <HomeScreen />,
    trackers: <TrackersLabScreen onQuickPay={openQuickPay} onQuickSave={openQuickSave} onQuickCommitment={openQuickCommitment} onAddLinkedPlan={openLinkedPlan} />,
    reports:  <ReportsScreen />,
    settings: <SettingsScreen onOpenArchive={() => setArchiveOpen(true)} />,
  };

  return (
    <SafeAreaView edges={['top', 'right', 'left']} style={[{ flex:1, backgroundColor: th.bg }, dirStyle]}>
      <StatusBar style={cfg.theme === 'dark' ? 'light' : 'dark'} />

      {/* Header */}
      <View style={[s.header, { backgroundColor: th.bg, borderBottomColor: th.border, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
        <View style={[s.brand, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
          <View style={[s.brandIcon, { backgroundColor: th.primSoft }]}>
            <Ionicons name="leaf-outline" size={20} color={th.primary} />
          </View>
          <Text style={[s.brandText, { color: th.primary }]}>MYFI</Text>
        </View>
        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
          {syncing && <Text style={{ color: th.sub, fontSize:11 }}>{L.syncing}</Text>}
          <Touchable onPress={openNotifications} haptic="light" style={[s.bellBtn, { backgroundColor: th.cardHigh }]}>
            <Ionicons name={unreadNotifCount > 0 ? 'notifications' : 'notifications-outline'} size={18} color={unreadNotifCount > 0 ? th.primary : th.sub} />
            {unreadNotifCount > 0 && (
              <View style={[s.notifBadge, { backgroundColor: th.exp }]}>
                <Text style={s.notifBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text>
              </View>
            )}
          </Touchable>
          {user && (
            <View style={[s.badge, { backgroundColor: th.primSoft }]}>
              <Ionicons name="cloud-done-outline" size={13} color={th.primary} />
            </View>
          )}
        </View>
      </View>

      {/* Screen */}
      <View style={{ flex:1 }}>
        {screens[tab]}
      </View>

      {/* Nav */}
      <View style={[s.navbar, { backgroundColor: th.nav, borderTopColor: th.border, flexDirection: isRtl ? 'row-reverse' : 'row', paddingBottom: Math.max(bottomInset, 8) }]}>
        {visibleTabs.map(t => {
          const active = tab === t.key;
          const label = t.labelKey ? L[t.labelKey] : (cfg.lang === 'ar' ? t.labelAr : t.labelEn);
          return (
            <Touchable
              key={t.key}
              onPress={() => setTab(t.key)}
              haptic="light"
              style={[s.tabBtn, active && { backgroundColor: th.primSoft, ...ELEVATION.e1 }]}
            >
              <Ionicons name={t.icon} size={20} color={active ? th.primary : th.faint} />
              <Text style={{
                color: active ? th.primary : th.faint,
                fontSize: 10,
                lineHeight: 14,
                ...weight(active ? '900' : '700'),
                marginTop: 3,
              }}>
                {label}
              </Text>
            </Touchable>
          );
        })}
      </View>

      {showFab && <DraggableFab th={th} onPress={handleFab} bottomInset={bottomInset} />}

      <AddTransModal
        visible={showAdd}
        onClose={() => { setShowAdd(false); setAddDraft(null); }}
        initialMode={addPreset.mode}
        initialDebtId={addPreset.debtId}
        initialGoalId={addPreset.goalId}
        initialCommitmentId={addPreset.commitmentId}
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

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACE.xl, paddingVertical: SPACE.md, borderBottomWidth: 0.5,
  },
  brand:     { alignItems: 'center', gap: 9 },
  brandIcon: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontSize: 22, lineHeight: 28, ...weight('900'), letterSpacing: 0 },
  badge:     { width: 24, height: 24, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },
  bellBtn:   { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  notifBadge:{ position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  notifBadgeText: { color: '#fff', fontSize: 9, ...weight('900') },
  // نافبار عائم بظل خفيف بدل خط حدّ فقط
  navbar:    { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: SPACE.sm, paddingHorizontal: 10, gap: 6, ...ELEVATION.e2 },
  tabBtn:    { flex: 1, minHeight: 48, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center', paddingVertical: 5 },
  unlockBtn: { borderRadius: RADIUS.xl, paddingHorizontal: SPACE.xxxl, paddingVertical: 14, ...ELEVATION.e1 },
});
