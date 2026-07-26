import React, { useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Alert, StyleSheet, Modal } from 'react-native';
import { Touchable } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { COUNTRIES, ICON_OPTIONS, CAT_COLORS } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { isBiometricSupported, authenticate } from '../lib/biometric';
import { setupDailyNotif, cancelNotifs, sendTestNotification } from '../lib/notifications';
import { profileModuleDefaults } from '../lib/modules';
import { getDefaultWalletId, getWalletBalances, getWalletLabel } from '../lib/wallets';
import { DEMO_BACKUP_JSON } from '../lib/sampleBackup';

const UI = {
  ar: {
    title: 'الإعدادات',
    statusLocal: 'محلي',
    general: 'عام',
    usage: 'نوع الاستخدام',
    money: 'التصنيفات',
    alerts: 'الأمان والتنبيهات',
    data: 'البيانات',
    account: 'الحساب',
    language: 'اللغة',
    theme: 'الثيم',
    country: 'الدولة والعملة',
    profile: 'نوع الحساب',
    personal: 'شخصي',
    businessProfile: 'مشروع',
    mixedProfile: 'شخصي + مشروع',
    enabledFeatures: 'الميزات المفعلة',
    wallets: 'محافظ متعددة',
    debtsOwed: 'مبالغ عليّ',
    debtsReceivable: 'مبالغ لي',
    goalsFeature: 'توفير',
    commitments: 'التزامات',
    commitmentsSection: 'التزامات',
    commitmentName: 'اسم الالتزام',
    commitmentAmount: 'مبلغ الالتزام',
    commitmentDay: 'موعد الالتزام',
    nextDeduction: 'الاستقطاع القادم',
    commitmentReminderInline: 'تذكير الالتزامات',
    commitmentWallet: 'محفظة الدفع',
    commitmentCategory: 'تصنيف الالتزام',
    addCommitment: 'إضافة التزام',
    noCommitments: 'لا توجد التزامات',
    repeatMonthly: 'يتكرر شهرياً',
    commitmentDetails: 'تفاصيل الالتزام',
    postponeCommitment: 'تأجيل الدفع',
    postponeDay: 'يوم',
    postpone3Days: '3 أيام',
    postponeNextMonth: 'الشهر القادم',
    deferredUntil: 'مؤجل إلى',
    paidThisMonth: 'مدفوع هذا الشهر',
    inactive: 'متوقف',
    activeStatus: 'مفعل',
    quickEntry: 'إدخال سريع',
    businessFeature: 'أدوات المشروع',
    walletsSection: 'المحافظ',
    walletName: 'اسم المحفظة',
    openingBalance: 'الرصيد الافتتاحي',
    addWallet: 'إضافة محفظة',
    currentBalance: 'الرصيد الحالي',
    defaultWallet: 'المحفظة الافتراضية',
    makeDefaultWallet: 'جعلها افتراضية',
    deleteWalletTitle: 'حذف المحفظة',
    deleteWalletBody: 'سيتم نقل معاملات هذه المحفظة إلى المحفظة الافتراضية أو أقرب محفظة متاحة.',
    categories: 'التصنيفات',
    categoriesCount: 'تصنيفات',
    addCategory: 'إضافة تصنيف',
    categoryName: 'اسم التصنيف',
    icon: 'الأيقونة',
    color: 'اللون',
    biometric: 'قفل التطبيق',
    debtAlert: 'تذكير المستحقات',
    debtBefore: 'قبل الموعد',
    commitmentBefore: 'قبل موعد الالتزام',
    dailyAlert: 'تذكير يومي',
    alertTime: 'وقت التذكير',
    testNotification: 'اختبار إشعار',
    lowBalance: 'انخفاض الرصيد',
    lowBelow: 'أقل من',
    archive: 'الأرشيف الشهري',
    exportBackup: 'تصدير نسخة احتياطية',
    importBackup: 'استيراد نسخة احتياطية',
    pasteBackup: 'الصق محتوى النسخة الاحتياطية',
    fillSampleBackup: 'تعبئة مثال تجريبي',
    importWarning: 'سيتم استبدال بيانات التطبيق الحالية بمحتوى النسخة الاحتياطية.',
    deleteAll: 'حذف كل البيانات',
    deleteConfirm: 'سيتم حذف كل بيانات MYFI من هذا الجهاز.',
    optional: 'اختياري',
    connected: 'متصل',
    notConnected: 'غير متصل',
    signIn: 'دخول',
    signUp: 'إنشاء',
    signOut: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    importDone: 'تم الاستيراد',
    importFailed: 'النسخة غير صالحة',
    cancel: 'إلغاء',
    delete: 'حذف',
    days: 'أيام',
  },
  en: {
    title: 'Settings',
    statusLocal: 'Local',
    general: 'General',
    usage: 'Use type',
    money: 'Categories',
    alerts: 'Security & Alerts',
    data: 'Data',
    account: 'Account',
    language: 'Language',
    theme: 'Theme',
    country: 'Country & currency',
    profile: 'Account type',
    personal: 'Personal',
    businessProfile: 'Business',
    mixedProfile: 'Personal + business',
    enabledFeatures: 'Enabled features',
    wallets: 'Multiple wallets',
    debtsOwed: 'Amounts I owe',
    debtsReceivable: 'Amounts owed to me',
    goalsFeature: 'Saving',
    commitments: 'Commitments',
    commitmentsSection: 'Commitments',
    commitmentName: 'Commitment name',
    commitmentAmount: 'Commitment amount',
    commitmentDay: 'Commitment due date',
    nextDeduction: 'Next deduction',
    commitmentReminderInline: 'Commitment reminders',
    commitmentWallet: 'Payment wallet',
    commitmentCategory: 'Category',
    addCommitment: 'Add commitment',
    noCommitments: 'No commitments',
    repeatMonthly: 'Repeat monthly',
    commitmentDetails: 'Commitment details',
    postponeCommitment: 'Postpone payment',
    postponeDay: '1 day',
    postpone3Days: '3 days',
    postponeNextMonth: 'Next month',
    deferredUntil: 'Deferred until',
    paidThisMonth: 'Paid this month',
    inactive: 'Paused',
    activeStatus: 'Active',
    quickEntry: 'Quick entry',
    businessFeature: 'Business tools',
    walletsSection: 'Wallets',
    walletName: 'Wallet name',
    openingBalance: 'Opening balance',
    addWallet: 'Add wallet',
    currentBalance: 'Current balance',
    defaultWallet: 'Default wallet',
    makeDefaultWallet: 'Make default',
    deleteWalletTitle: 'Delete wallet',
    deleteWalletBody: 'Transactions in this wallet will move to the default or nearest available wallet.',
    categories: 'Categories',
    categoriesCount: 'categories',
    addCategory: 'Add category',
    categoryName: 'Category name',
    icon: 'Icon',
    color: 'Color',
    biometric: 'App lock',
    debtAlert: 'Amount reminder',
    debtBefore: 'Before due',
    commitmentBefore: 'Before due',
    dailyAlert: 'Daily reminder',
    alertTime: 'Reminder time',
    testNotification: 'Test notification',
    lowBalance: 'Low balance',
    lowBelow: 'Below',
    archive: 'Monthly archive',
    exportBackup: 'Export backup',
    importBackup: 'Import backup',
    pasteBackup: 'Paste backup content',
    fillSampleBackup: 'Fill demo backup',
    importWarning: 'Current app data will be replaced with the backup content.',
    deleteAll: 'Delete all data',
    deleteConfirm: 'All MYFI data on this device will be deleted.',
    optional: 'Optional',
    connected: 'Connected',
    notConnected: 'Not connected',
    signIn: 'Sign in',
    signUp: 'Create',
    signOut: 'Sign out',
    email: 'Email',
    password: 'Password',
    importDone: 'Imported',
    importFailed: 'Invalid backup',
    cancel: 'Cancel',
    delete: 'Delete',
    days: 'days',
  },
};

export default function SettingsScreen({ onOpenArchive }) {
  const {
    cfg, setCfg, user, setUser, resetAll,
    notif, setNotif, cats, setCats, trans, setTransCatToOther,
    wallets, addWallet, deleteWallet,
    commitments,
    exportBackup, importBackup,
  } = useStore();

  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const isAr = cfg.lang === 'ar';
  const T = UI[cfg.lang] || UI.ar;
  const selectedCountry = COUNTRIES.find(c => c.code === cfg.country) || COUNTRIES[0];
  const modules = cfg.enabledModules || {};
  const profileOptions = [
    { value: 'personal', label: T.personal },
    { value: 'business', label: T.businessProfile },
    { value: 'personal_business', label: T.mixedProfile },
  ];
  const moduleRows = [
    { key: 'wallets', label: T.wallets, icon: 'wallet-outline' },
    { key: 'debtsOwed', label: T.debtsOwed, icon: 'arrow-up-circle-outline' },
    { key: 'debtsReceivable', label: T.debtsReceivable, icon: 'arrow-down-circle-outline' },
    { key: 'goals', label: T.goalsFeature, icon: 'flag-outline' },
  ];

  const [open, setOpen] = useState(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const emailRef = useRef('');
  const passRef = useRef('');
  const [authMode, setAuthMode] = useState('signin');
  const [loading, setLoading] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState(ICON_OPTIONS[0]);
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletOpening, setNewWalletOpening] = useState('');
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const defaultWalletId = getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId);
  const walletRows = getWalletBalances(wallets, trans, cfg.currency, defaultWalletId)
    .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0));

  const toggleOpen = (key) => setOpen(open === key ? null : key);

  const setProfileType = (profileType) => {
    setCfg({ profileType, enabledModules: profileModuleDefaults(profileType) });
  };

  const setModuleEnabled = (key, on) => {
    setCfg({ enabledModules: { [key]: on } });
  };

  const handleAuth = async () => {
    const emailValue = emailRef.current.trim();
    const passValue = passRef.current;
    if (!emailValue || !passValue.trim()) return;
    setLoading(true);
    try {
      const credentials = { email: emailValue, password: passValue };
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
      if (result.error) throw result.error;
      if (result.data?.user) setUser(result.data.user);
    } catch (e) {
      Alert.alert('', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const addCategory = () => {
    if (!newCatName.trim()) return;
    setCats([
      ...cats,
      {
        id: 'c_' + Date.now().toString(36),
        label: newCatName.trim(),
        labelEn: newCatName.trim(),
        emoji: '',
        icon: newCatIcon,
        color: newCatColor,
      },
    ]);
    setNewCatName('');
    setNewCatIcon(ICON_OPTIONS[0]);
    setNewCatColor(CAT_COLORS[0]);
  };

  const createWallet = async () => {
    if (!newWalletName.trim()) return;
    await addWallet({
      name: newWalletName.trim(),
      nameEn: newWalletName.trim(),
      currency: cfg.currency,
      openingBalance: Number(newWalletOpening.replace(/[^0-9.-]/g, '')) || 0,
    });
    setNewWalletName('');
    setNewWalletOpening('');
    setWalletModalOpen(false);
  };

  const confirmDeleteWallet = (wallet) => {
    if (walletRows.length <= 1) return;
    Alert.alert(T.deleteWalletTitle, T.deleteWalletBody, [
      { text: T.cancel, style: 'cancel' },
      { text: T.delete, style: 'destructive', onPress: () => deleteWallet(wallet.id) },
    ]);
  };

  const deleteCategory = (id) => {
    if (id === 'other') return;
    Alert.alert(L.delete, '', [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.delete,
        style: 'destructive',
        onPress: async () => {
          await setTransCatToOther(id);
          setCats(cats.filter(c => c.id !== id));
        },
      },
    ]);
  };

  const toggleBioLock = async (value) => {
    if (value) {
      const supported = await isBiometricSupported();
      if (!supported) {
        Alert.alert('', L.bioNotAvailable);
        return;
      }
      const res = await authenticate(L.bioPrompt);
      if (!res.success) return;
    }
    setCfg({ bioLock: value });
  };

  const toggleDaily = async (value) => {
    if (!value) {
      await cancelNotifs();
      await setNotif({ daily: { ...notif.daily, on: false } });
      return;
    }
    const result = await setupDailyNotif(cfg.lang, trans, notif.daily.value);
    if (!result?.ok) {
      Alert.alert('', result?.reason || (cfg.lang === 'ar' ? 'تعذر تفعيل الإشعارات' : 'Could not enable notifications'));
      await setNotif({ daily: { ...notif.daily, on: false } });
      return;
    }
    await setNotif({ daily: { ...notif.daily, on: true } });
  };

  const setDailyHour = async (delta) => {
    const value = Math.max(0, Math.min(23, notif.daily.value + delta));
    if (notif.daily.on) {
      const result = await setupDailyNotif(cfg.lang, trans, value);
      if (!result?.ok) {
        Alert.alert('', result?.reason || (cfg.lang === 'ar' ? 'تعذر تحديث الإشعارات' : 'Could not update notifications'));
        await setNotif({ daily: { ...notif.daily, on: false, value } });
        return;
      }
    }
    await setNotif({ daily: { ...notif.daily, value } });
  };

  const testNotification = async () => {
    const result = await sendTestNotification(cfg.lang);
    if (!result?.ok) {
      Alert.alert('', result?.reason || (cfg.lang === 'ar' ? 'تعذر إرسال الإشعار' : 'Could not send notification'));
    }
  };

  const handleExport = async () => {
    try {
      const uri = FileSystem.documentDirectory + `myfi_backup_${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(uri, exportBackup(), { encoding: FileSystem.EncodingType.UTF8 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch (e) {
      Alert.alert('', e.message);
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    Alert.alert(T.importBackup, T.importWarning, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.importBackup,
        onPress: async () => {
          const ok = await importBackup(importText.trim());
          Alert.alert('', ok ? T.importDone : T.importFailed);
          if (ok) {
            setImportText('');
            setOpen(null);
          }
        },
      },
    ]);
  };

  const confirmReset = () => {
    Alert.alert(T.deleteAll, T.deleteConfirm, [
      { text: T.cancel, style: 'cancel' },
      { text: T.delete, style: 'destructive', onPress: resetAll },
    ]);
  };

  const Section = useMemo(() => ({ title, children }) => (
    <View style={s.section}>
      <View style={[s.sectionHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.sectionMark, { backgroundColor: th.primary }]} />
        <Text style={[s.sectionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
      </View>
      <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
        {children}
      </View>
    </View>
  ), [isAr, th]);

  const Row = useMemo(() => ({ label, value, children, onPress, danger = false, last = false }) => {
    const body = (
      <>
        <Text style={[s.rowLabel, { color: danger ? th.exp : th.text, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text>
        <View style={[s.trailing, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {value ? <Text style={{ color: th.sub, fontSize: 12, ...weight('700') }}>{value}</Text> : null}
          {children}
          {onPress ? <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} /> : null}
        </View>
      </>
    );

    const rowStyle = [
      s.row,
      {
        borderBottomColor: last ? 'transparent' : th.border,
        flexDirection: isAr ? 'row-reverse' : 'row',
      },
    ];

    if (onPress) {
      return (
        <Touchable onPress={onPress} style={rowStyle} activeOpacity={0.72}>
          {body}
        </Touchable>
      );
    }
    return <View style={rowStyle}>{body}</View>;
  }, [isAr, th]);

  const Segmented = useMemo(() => ({ options, value, onChange }) => (
    <View style={[s.segmented, { backgroundColor: th.cardHigh }]}>
      {options.map(option => {
        const active = value === option.value;
        return (
          <Touchable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[s.segmentBtn, { backgroundColor: active ? th.card : 'transparent' }]}
          >
            <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900') }}>{option.label}</Text>
          </Touchable>
        );
      })}
    </View>
  ), [th]);

  const Stepper = useMemo(() => ({ value, suffix = '', onMinus, onPlus }) => (
    <View style={[s.stepper, { backgroundColor: th.cardHigh }]}>
      <Touchable onPress={onMinus} style={s.stepButton}>
        <Ionicons name="remove" size={14} color={th.text} />
      </Touchable>
      <Text style={{ color: th.text, minWidth: 54, textAlign: 'center', fontSize: 12, ...weight('900') }}>
        {value}{suffix}
      </Text>
      <Touchable onPress={onPlus} style={s.stepButton}>
        <Ionicons name="add" size={14} color={th.text} />
      </Touchable>
    </View>
  ), [th]);

  const Expanded = useMemo(() => ({ children }) => (
    <View style={[s.expanded, { borderTopColor: th.border }]}>
      {children}
    </View>
  ), [th]);


  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 82 }}>
      <View style={[s.header, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.title}</Text>
          <Text style={[s.subtitle, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
            {user ? T.connected : T.statusLocal}
          </Text>
        </View>
        <View style={[s.statusPill, { backgroundColor: th.primSoft }]}>
          <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>
            {user ? T.connected : T.statusLocal}
          </Text>
        </View>
      </View>

      <Section title={T.general}>
        <Row label={T.language}>
          <Segmented
            value={cfg.lang}
            onChange={(lang) => setCfg({ lang })}
            options={[
              { value: 'ar', label: 'عربي' },
              { value: 'en', label: 'EN' },
            ]}
          />
        </Row>
        <Row label={T.theme}>
          <Switch
            value={cfg.theme === 'dark'}
            onValueChange={(value) => setCfg({ theme: value ? 'dark' : 'light' })}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        <Row
          label={T.country}
          value={`${selectedCountry.flag} ${selectedCountry.currency}`}
          onPress={() => toggleOpen('country')}
          last={open !== 'country'}
        />
        {open === 'country' ? (
          <Expanded>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRail}>
              {COUNTRIES.map(country => {
                const active = country.code === cfg.country;
                return (
                  <Touchable
                    key={country.code}
                    onPress={() => setCfg({ country: country.code, currency: country.currency })}
                    style={[
                      s.countryChip,
                      {
                        backgroundColor: active ? th.primSoft : th.cardHigh,
                        borderColor: active ? th.primary : 'transparent',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 16 }}>{country.flag}</Text>
                    <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('800') }}>
                      {isAr ? country.name : country.nameEn}
                    </Text>
                  </Touchable>
                );
              })}
            </ScrollView>
          </Expanded>
        ) : null}
      </Section>

      <Section title={T.usage}>
        <Row label={T.profile}>
          <Segmented
            value={cfg.profileType || 'personal'}
            onChange={setProfileType}
            options={profileOptions}
          />
        </Row>
        <Row
          label={T.enabledFeatures}
          value={`${moduleRows.filter(item => modules[item.key]).length}/${moduleRows.length}`}
          onPress={() => toggleOpen('modules')}
          last={open !== 'modules'}
        />
        {open === 'modules' ? (
          <Expanded>
            {moduleRows.map(item => (
              <View key={item.key} style={[s.moduleRow, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <View style={[s.moduleInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <View style={[s.moduleIcon, { backgroundColor: modules[item.key] ? th.primSoft : th.card }]}>
                    <Ionicons name={item.icon} size={16} color={modules[item.key] ? th.primary : th.sub} />
                  </View>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('800'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                    {item.label}
                  </Text>
                </View>
                <Switch
                  value={!!modules[item.key]}
                  onValueChange={(on) => setModuleEnabled(item.key, on)}
                  trackColor={{ true: th.primary, false: th.cardHigh }}
                />
              </View>
            ))}
          </Expanded>
        ) : null}
      </Section>

      {modules.wallets ? (
        <Section title={T.walletsSection}>
          {walletRows.map((wallet, index) => (
            <View key={wallet.id} style={[s.walletRow, { borderBottomColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[s.walletIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name={wallet.id === defaultWalletId ? 'star-outline' : 'wallet-outline'} size={16} color={th.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                  {getWalletLabel(wallet, cfg.lang)}
                </Text>
                <Text style={{ color: th.sub, fontSize: 11, marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                  {wallet.id === defaultWalletId ? `${T.defaultWallet} · ` : ''}{T.currentBalance}: {Math.round(wallet.balance || 0).toLocaleString()} {wallet.currency}
                </Text>
              </View>
              {wallet.id !== defaultWalletId ? (
                <Touchable onPress={() => setCfg({ defaultWalletId: wallet.id })} style={[s.iconOnly, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="star-outline" size={15} color={th.primary} />
                </Touchable>
              ) : null}
              {walletRows.length > 1 ? (
                <Touchable onPress={() => confirmDeleteWallet(wallet)} style={[s.iconOnly, { backgroundColor: th.expBg }]}>
                  <Ionicons name="trash-outline" size={15} color={th.exp} />
                </Touchable>
              ) : null}
            </View>
          ))}
          <View style={[s.addPrompt, { borderTopColor: th.border }]}>
            <Touchable
              onPress={() => setWalletModalOpen(true)}
              style={[s.addPromptButton, { backgroundColor: th.primSoft, flexDirection: isAr ? 'row-reverse' : 'row' }]}
              activeOpacity={0.82}
            >
              <View style={[s.addPromptIcon, { backgroundColor: th.primary }]}>
                <Ionicons name="add" size={18} color={th.onPrimary} />
              </View>
              <Text style={{ color: th.primary, fontSize: 13, ...weight('900'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                {T.addWallet}
              </Text>
            </Touchable>
          </View>
        </Section>
      ) : null}

      <Section title={T.money}>
        <Row
          label={T.categories}
          value={`${cats.length} ${T.categoriesCount}`}
          onPress={() => toggleOpen('cats')}
          last={open !== 'cats'}
        />
        {open === 'cats' && (
          <Expanded>
            {cats.map(cat => (
              <View key={cat.id} style={[s.categoryRow, { backgroundColor: th.cardHigh }]}>
                <View style={[s.categoryInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <View style={[s.categoryIcon, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon || 'cube-outline'} size={15} color={cat.color} />
                  </View>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('800') }}>
                    {isAr ? cat.label : cat.labelEn}
                  </Text>
                </View>
                {cat.id !== 'other' ? (
                  <Touchable onPress={() => deleteCategory(cat.id)} style={[s.iconOnly, { backgroundColor: th.expBg }]}>
                    <Ionicons name="trash-outline" size={15} color={th.exp} />
                  </Touchable>
                ) : null}
              </View>
            ))}

            <TextInput
              value={newCatName}
              onChangeText={setNewCatName}
              placeholder={T.categoryName}
              placeholderTextColor={th.sub}
              style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
            />

            <Text style={[s.miniLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.icon}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.iconRail}>
              {ICON_OPTIONS.map(icon => (
                <Touchable
                  key={icon}
                  onPress={() => setNewCatIcon(icon)}
                  style={[
                    s.iconPick,
                    {
                      backgroundColor: newCatIcon === icon ? newCatColor + '33' : th.cardHigh,
                      borderColor: newCatIcon === icon ? newCatColor : 'transparent',
                    },
                  ]}
                >
                  <Ionicons name={icon} size={17} color={newCatIcon === icon ? newCatColor : th.sub} />
                </Touchable>
              ))}
            </ScrollView>

            <Text style={[s.miniLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.color}</Text>
            <View style={s.colorGrid}>
              {CAT_COLORS.map(color => (
                <Touchable
                  key={color}
                  onPress={() => setNewCatColor(color)}
                  style={[s.colorPick, { backgroundColor: color, borderColor: newCatColor === color ? th.text : 'transparent' }]}
                />
              ))}
            </View>
            <Touchable onPress={addCategory} style={[s.primaryButton, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.addCategory}</Text>
            </Touchable>
          </Expanded>
        )}
      </Section>

      <Section title={T.alerts}>
        <Row label={T.biometric}>
          <Switch
            value={!!cfg.bioLock}
            onValueChange={toggleBioLock}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        <Row label={T.debtAlert}>
          <Switch
            value={notif.debt.on}
            onValueChange={(on) => setNotif({ debt: { ...notif.debt, on } })}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.debt.on ? (
          <Row label={T.debtBefore}>
            <Stepper
              value={notif.debt.value}
              suffix={` ${T.days}`}
              onMinus={() => setNotif({ debt: { ...notif.debt, value: Math.max(1, notif.debt.value - 1) } })}
              onPlus={() => setNotif({ debt: { ...notif.debt, value: notif.debt.value + 1 } })}
            />
          </Row>
        ) : null}
        {(commitments || []).length > 0 ? (
          <Row label={T.commitmentReminderInline}>
            <Switch
              value={notif.commitment?.on !== false}
              onValueChange={(on) => setNotif({ commitment: { ...(notif.commitment || { value: 3 }), on } })}
              trackColor={{ true: th.primary, false: th.cardHigh }}
            />
          </Row>
        ) : null}
        {(commitments || []).length > 0 && notif.commitment?.on !== false ? (
          <Row label={T.commitmentBefore}>
            <Stepper
              value={notif.commitment?.value || 3}
              suffix={` ${T.days}`}
              onMinus={() => setNotif({ commitment: { ...(notif.commitment || {}), on: true, value: Math.max(0, Number(notif.commitment?.value || 3) - 1) } })}
              onPlus={() => setNotif({ commitment: { ...(notif.commitment || {}), on: true, value: Number(notif.commitment?.value || 3) + 1 } })}
            />
          </Row>
        ) : null}
        <Row label={T.dailyAlert}>
          <Switch
            value={notif.daily.on}
            onValueChange={toggleDaily}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.daily.on ? (
          <Row label={T.alertTime}>
            <Stepper
              value={`${String(notif.daily.value).padStart(2, '0')}:00`}
              onMinus={() => setDailyHour(-1)}
              onPlus={() => setDailyHour(1)}
            />
          </Row>
        ) : null}
        <Row label={T.testNotification} onPress={testNotification} />
        <Row label={T.lowBalance} last={!notif.low.on}>
          <Switch
            value={notif.low.on}
            onValueChange={(on) => setNotif({ low: { ...notif.low, on } })}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.low.on ? (
          <Expanded>
            <TextInput
              value={String(notif.low.value)}
              onChangeText={(value) => setNotif({ low: { ...notif.low, value: Number(value.replace(/[^0-9]/g, '')) || 0 } })}
              keyboardType="numeric"
              placeholder={T.lowBelow}
              placeholderTextColor={th.sub}
              style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
            />
          </Expanded>
        ) : null}
      </Section>

      <Section title={T.data}>
        <Row label={T.archive} onPress={onOpenArchive} />
        <Row label={T.exportBackup} onPress={handleExport} />
        <Row label={T.importBackup} onPress={() => toggleOpen('import')} last={open !== 'import'} />
        {open === 'import' ? (
          <Expanded>
            <TextInput
              value={importText}
              onChangeText={setImportText}
              multiline
              numberOfLines={4}
              placeholder={T.pasteBackup}
              placeholderTextColor={th.sub}
              style={[s.input, s.textArea, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
            />
            <View style={[s.infoLine, { backgroundColor: th.warnBg, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <Ionicons name="alert-circle-outline" size={14} color={th.warn} />
              <Text style={{ color: th.warn, fontSize: 12, ...weight('800'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                {T.importWarning}
              </Text>
            </View>
            <Touchable
              onPress={() => setImportText(DEMO_BACKUP_JSON)}
              style={[s.secondaryButton, { backgroundColor: th.cardHigh, borderWidth: 0.5, borderColor: th.border }]}
            >
              <Text style={{ color: th.text, fontSize: 13, ...weight('900') }}>{T.fillSampleBackup}</Text>
            </Touchable>
            <Touchable onPress={handleImport} style={[s.primaryButton, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.importBackup}</Text>
            </Touchable>
          </Expanded>
        ) : null}
        <Row label={T.deleteAll} onPress={confirmReset} danger last />
      </Section>

      <Section title={`${T.account} · ${T.optional}`}>
        <Row
          label={user ? T.connected : T.notConnected}
          value={user?.email}
          onPress={() => toggleOpen('account')}
          last={open !== 'account'}
        />
        {open === 'account' ? (
          <Expanded>
            {user ? (
              <Touchable onPress={handleSignOut} style={[s.secondaryButton, { backgroundColor: th.expBg }]}>
                <Text style={{ color: th.exp, fontSize: 13, ...weight('900') }}>{T.signOut}</Text>
              </Touchable>
            ) : (
              <>
                <Segmented
                  value={authMode}
                  onChange={setAuthMode}
                  options={[
                    { value: 'signin', label: T.signIn },
                    { value: 'signup', label: T.signUp },
                  ]}
                />
                <TextInput
                  defaultValue={email}
                  onChangeText={(value) => { emailRef.current = value; }}
                  placeholder={T.email}
                  placeholderTextColor={th.sub}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: 'left', writingDirection: 'ltr' }]}
                />
                <TextInput
                  defaultValue={pass}
                  onChangeText={(value) => { passRef.current = value; }}
                  placeholder={T.password}
                  placeholderTextColor={th.sub}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="password"
                  textContentType="password"
                  importantForAutofill="yes"
                  style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: 'left', writingDirection: 'ltr' }]}
                />
                <Touchable onPress={handleAuth} disabled={loading} style={[s.primaryButton, { backgroundColor: th.primary, opacity: loading ? 0.6 : 1 }]}>
                  <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>
                    {loading ? '...' : authMode === 'signin' ? T.signIn : T.signUp}
                  </Text>
                </Touchable>
              </>
            )}
          </Expanded>
        ) : null}
      </Section>

      <Text style={{ color: th.faint, fontSize: 11, textAlign: 'center', marginTop: 2 }}>
        MYFI · {L.appVersion} 1.0.0
      </Text>
    </ScrollView>
    <Modal visible={walletModalOpen} transparent animationType="slide" onRequestClose={() => setWalletModalOpen(false)}>
      <Touchable style={[s.modalOverlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={() => setWalletModalOpen(false)}>
        <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.addWallet}</Text>
            <Touchable onPress={() => setWalletModalOpen(false)} style={[s.iconOnly, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.text} />
            </Touchable>
          </View>
          <TextInput
            value={newWalletName}
            onChangeText={setNewWalletName}
            placeholder={T.walletName}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
          />
          <TextInput
            value={newWalletOpening}
            onChangeText={setNewWalletOpening}
            keyboardType="numeric"
            placeholder={`${T.openingBalance} (${cfg.currency})`}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
          />
          <Touchable onPress={createWallet} style={[s.primaryButton, { backgroundColor: th.primary }]}>
            <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.addWallet}</Text>
          </Touchable>
        </Touchable>
      </Touchable>
    </Modal>
    </>
  );
}

const s = StyleSheet.create({
  header: { alignItems: 'center', marginBottom: 18, gap: 12 },
  title: { fontSize: 24, lineHeight: 31, ...weight('900') },
  subtitle: { fontSize: 12, lineHeight: 17, ...weight('700'), marginTop: 2 },
  statusPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  section: { marginBottom: 18 },
  sectionHead: { alignItems: 'center', gap: 8, marginBottom: 9, paddingHorizontal: 2 },
  sectionMark: { width: 4, height: 16, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: 13, lineHeight: 18, ...weight('900') },
  group: { borderRadius: 13, borderWidth: 0.5, overflow: 'hidden' },
  row: { minHeight: 54, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10, borderBottomWidth: 0.5 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 20, ...weight('800') },
  trailing: { alignItems: 'center', gap: 8 },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 4, gap: 3 },
  segmentBtn: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, minWidth: 50, alignItems: 'center', justifyContent: 'center' },
  expanded: { padding: 13, gap: 10, borderTopWidth: 0.5 },
  categoryRow: { borderRadius: 11, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  categoryInfo: { alignItems: 'center', gap: 8, flex: 1 },
  categoryIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  iconOnly: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  countryChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11, borderWidth: 1 },
  moduleRow: { alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 11, paddingHorizontal: 11, paddingVertical: 9 },
  moduleInfo: { alignItems: 'center', gap: 9, flex: 1 },
  moduleIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLine: { alignItems: 'center', gap: 8, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10 },
  addPrompt: { padding: 13, borderTopWidth: 0.5 },
  addPromptButton: { minHeight: 48, alignItems: 'center', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  addPromptIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  walletRow: { alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5 },
  detailLine: { alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 34 },
  walletIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, fontSize: 14, lineHeight: 19, ...weight('700') },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  miniLabel: { fontSize: 11, lineHeight: 16, ...weight('900') },
  iconRail: { gap: 8 },
  choiceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1 },
  iconPick: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorPick: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  primaryButton: { minHeight: 46, borderRadius: 12, padding: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 46, borderRadius: 12, padding: 13, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 11, paddingHorizontal: 4, paddingVertical: 3 },
  stepButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { width: '100%', maxHeight: '88%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 0.5, padding: 14, gap: 10 },
  sheetHeader: { alignItems: 'center', gap: 10, marginBottom: 2 },
  sheetTitle: { flex: 1, fontSize: 17, lineHeight: 24, ...weight('900') },
  sheetScroll: { gap: 10, paddingBottom: 2 },
});

