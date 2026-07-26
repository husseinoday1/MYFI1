import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Switch, Alert, Pressable, StyleSheet, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { COUNTRIES, CURRENCIES, ICON_OPTIONS, CAT_COLORS } from '../lib/constants';
import { checkSupabaseHealth, supabase } from '../lib/supabase';
import { isBiometricSupported, authenticate } from '../lib/biometric';
import { setupDailyNotif, cancelNotifs } from '../lib/notifications';
import { defaultScopeForProfile, getFeatureDataCount, getModules } from '../lib/modules';
import { getDefaultWalletId, getWalletBalances, getWalletLabel } from '../lib/wallets';
import { RADIUS, SHADOW, TYPE, weight } from '../lib/tokens';
import ActionMenu from '../components/ActionMenu';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
import { MultiSelectBar, SelectionCheckbox, useMultiSelect } from '../components/MultiSelect';
import { detectLocationDefaults } from '../lib/locationDefaults';
import HelpGuideModal from '../components/HelpGuideModal';
import { exportMyfiPackage, pickMyfiPackage, unlockMyfiPackage } from '../lib/myfiFiles';

const UI = {
  ar: {
    title: 'الإعدادات',
    statusLocal: 'محلي',
    general: 'عام',
    usage: 'نوع الاستخدام',
    money: 'التصنيفات',
    security: 'الأمان',
    alerts: 'التنبيهات',
    data: 'البيانات',
    account: 'الحساب',
    language: 'اللغة',
    systemLanguage: 'النظام',
    arabicLanguage: 'عربي',
    englishLanguage: 'English',
    theme: 'المظهر',
    darkTheme: 'داكن',
    lightTheme: 'فاتح',
    country: 'الدولة',
    currency: 'العملة',
    profile: 'نوع الحساب',
    personal: 'شخصي',
    businessProfile: 'مشروع',
    mixedProfile: 'مزدوج',
    enabledFeatures: 'الميزات المفعلة',
    wallets: 'محافظ متعددة',
    debtsOwed: 'دين عليّ',
    debtsReceivable: 'دين لي',
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
    debtAlert: 'تذكير دين عليّ',
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
    importWarning: 'سيتم استبدال بيانات التطبيق الحالية بمحتوى النسخة الاحتياطية.',
    pasteClipboard: 'لصق من الحافظة',
    clearImport: 'مسح النص',
    previewBackup: 'معاينة النسخة',
    backupValid: 'النسخة صالحة للاستيراد',
    backupInvalid: 'النسخة غير صالحة',
    backupMonths: 'الأشهر',
    backupEntries: 'الحركات',
    backupWallets: 'المحافظ',
    backupTrackers: 'المتابعات',
    backupCommitments: 'الالتزامات',
    backupCurrency: 'العملة',
    replaceNow: 'استبدال البيانات الآن',
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
    requiredFields: 'اكتب البريد الإلكتروني وكلمة المرور.',
    invalidEmail: 'اكتب بريداً إلكترونياً صحيحاً.',
    passwordLength: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.',
    verificationTitle: 'الحساب غير مفعّل بعد',
    verificationPending: 'تم إرسال طلب تحقق فقط، ولم يصبح الحساب فعالاً بعد. افتح رابط التحقق في بريدك ثم سجّل الدخول.',
    verificationUnconfirmed: 'لم يتم إنشاء حساب جديد. قد يكون البريد مستخدماً أو غير صالح؛ تحقق من البريد وحاول تسجيل الدخول أو الاستعادة.',
    close: 'إغلاق',
    loginSuccess: 'تم تسجيل الدخول بنجاح.',
    authUnavailable: 'تعذر الوصول إلى خدمة الحساب. تحقق من الإنترنت وإعدادات الخادم.',
    checkingConnection: 'جاري فحص خدمة الحساب...',
    accountServiceReady: 'خدمة الحساب متصلة',
    accountServiceDown: 'خدمة الحساب غير متاحة حالياً',
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
    security: 'Security',
    alerts: 'Notifications',
    data: 'Data',
    account: 'Account',
    language: 'Language',
    systemLanguage: 'System',
    arabicLanguage: 'Arabic',
    englishLanguage: 'English',
    theme: 'Appearance',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    country: 'Country',
    currency: 'Currency',
    profile: 'Account type',
    personal: 'Personal',
    businessProfile: 'Business',
    mixedProfile: 'Dual',
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
    importWarning: 'Current app data will be replaced with the backup content.',
    pasteClipboard: 'Paste from clipboard',
    clearImport: 'Clear text',
    previewBackup: 'Backup preview',
    backupValid: 'Backup is ready to import',
    backupInvalid: 'Invalid backup',
    backupMonths: 'Months',
    backupEntries: 'Entries',
    backupWallets: 'Wallets',
    backupTrackers: 'Trackers',
    backupCommitments: 'Commitments',
    backupCurrency: 'Currency',
    replaceNow: 'Replace data now',
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
    requiredFields: 'Enter your email and password.',
    invalidEmail: 'Enter a valid email address.',
    passwordLength: 'Password must be at least 6 characters.',
    verificationTitle: 'Account not active yet',
    verificationPending: 'Only a verification request was sent; the account is not active yet. Open the email link, then sign in.',
    verificationUnconfirmed: 'No new account was created. The email may already be used or invalid; check the address, then try sign-in or recovery.',
    close: 'Close',
    loginSuccess: 'Signed in successfully.',
    authUnavailable: 'Could not reach the account service. Check the connection and server settings.',
    checkingConnection: 'Checking account service...',
    accountServiceReady: 'Account service connected',
    accountServiceDown: 'Account service is currently unavailable',
    importDone: 'Imported',
    importFailed: 'Invalid backup',
    cancel: 'Cancel',
    delete: 'Delete',
    days: 'days',
  },
};

const formatHour12 = (hour, lang = 'ar') => {
  const value = ((Number(hour || 0) % 24) + 24) % 24;
  const displayHour = value % 12 || 12;
  const locale = lang === 'ar' ? 'ar-IQ' : 'en-US';
  const period = lang === 'ar' ? (value < 12 ? 'ص' : 'م') : (value < 12 ? 'AM' : 'PM');
  return `${displayHour.toLocaleString(locale, { useGrouping: false })}:00 ${period}`;
};

const previewBackupText = (text = '', lang = 'ar') => {
  const raw = String(text || '').trim();
  if (!raw) return { valid: false, empty: true, error: '' };
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { valid: false, error: lang === 'ar' ? 'الملف ليس نسخة احتياطية صالحة.' : 'This is not a valid backup object.' };
    }
    const trans = Array.isArray(data.trans) ? data.trans : [];
    const wallets = Array.isArray(data.wallets) ? data.wallets : [];
    const debts = Array.isArray(data.debts) ? data.debts : [];
    const goals = Array.isArray(data.goals) ? data.goals : [];
    const commitments = Array.isArray(data.commitments) ? data.commitments : [];
    const months = [...new Set(trans.map(t => String(t?.dateISO || '').slice(0, 7)).filter(v => /^\d{4}-\d{2}$/.test(v)))].sort();
    const issues = [];
    if (!data.cfg) issues.push(lang === 'ar' ? 'لا توجد إعدادات داخل النسخة.' : 'Backup has no settings.');
    if (!trans.length && !debts.length && !goals.length && !commitments.length) {
      issues.push(lang === 'ar' ? 'لا توجد بيانات مالية واضحة داخل النسخة.' : 'Backup has no clear financial data.');
    }
    if (wallets.length) {
      const walletIds = new Set(wallets.map(wallet => wallet?.id).filter(Boolean));
      const badWalletRefs = trans.filter(t => (
        t?.kind === 'transfer'
          ? (t.fromWalletId && !walletIds.has(t.fromWalletId)) || (t.toWalletId && !walletIds.has(t.toWalletId))
          : t?.walletId && !walletIds.has(t.walletId)
      )).length;
      if (badWalletRefs) {
        issues.push(lang === 'ar'
          ? `${badWalletRefs} معاملة تشير إلى محفظة غير موجودة.`
          : `${badWalletRefs} entries reference missing wallets.`);
      }
    }
    return {
      valid: issues.length === 0,
      error: issues[0] || '',
      issues,
      name: data.cfg?.name || 'MYFI',
      currency: data.cfg?.currency || '',
      months,
      entries: trans.length,
      wallets: wallets.length,
      trackers: debts.length + goals.length,
      debts: debts.length,
      goals: goals.length,
      commitments: commitments.length,
    };
  } catch (error) {
    return {
      valid: false,
      error: lang === 'ar' ? 'النص ليس JSON صالح.' : 'Text is not valid JSON.',
    };
  }
};

export default function SettingsScreen({ onOpenArchive, tabs = [] }) {
  const {
    cfg, setCfg, user, setUser, resetAll,
    notif, setNotif, cats, setCats, trans, setTransCatToOther,
    wallets, addWallet, deleteWallet, deleteWalletsMany, deleteCategoriesMany,
    debts, goals, commitments,
    exportBackup, importBackup,
    setCategoryBudget, applySuggestedBudgets, clearBudgets,
    enterDemoMode, exitDemoMode,
  } = useStore();

  const th = TH[cfg.theme] || TH.dark;
  const L = STR[cfg.lang] || STR.ar;
  const isAr = cfg.lang === 'ar';
  const T = UI[cfg.lang] || UI.ar;
  const selectedCountry = COUNTRIES.find(c => c.code === cfg.country) || COUNTRIES[0];
  const selectedCurrency = CURRENCIES.find(item => item.code === cfg.currency) || CURRENCIES[0];
  const modules = getModules(cfg);
  const profileOptions = [
    {
      value: 'personal',
      label: T.personal,
      icon: 'person-outline',
    },
    {
      value: 'business',
      label: T.businessProfile,
      icon: 'storefront-outline',
    },
    {
      value: 'personal_business',
      label: T.mixedProfile,
      icon: 'albums-outline',
    },
  ];
  const moduleRows = [
    { key: 'wallets', label: T.wallets, icon: 'wallet-outline' },
    { key: 'debtsOwed', label: T.debtsOwed, icon: 'arrow-up-circle-outline' },
    { key: 'debtsReceivable', label: T.debtsReceivable, icon: 'arrow-down-circle-outline' },
    { key: 'goals', label: T.goalsFeature, icon: 'flag-outline' },
    { key: 'commitments', label: isAr ? 'الالتزامات المتكررة' : 'Recurring commitments', icon: 'calendar-outline' },
    { key: 'budgets', label: isAr ? 'الميزانيات' : 'Budgets', icon: 'pie-chart-outline' },
    { key: 'recurring', label: isAr ? 'الحركات المتكررة' : 'Recurring entries', icon: 'repeat-outline' },
  ];
  const homeContentTitle = cfg.lang === 'ar' ? 'محتوى الرئيسية' : 'Home content';
  const workspaceTitle = cfg.lang === 'ar' ? 'مساحة العمل' : 'Workspace';
  const startTabTitle = cfg.lang === 'ar' ? 'التبويب الافتراضي' : 'Default start tab';
  const startTabSummary = cfg.lang === 'ar' ? 'أول شاشة عند فتح التطبيق' : 'First screen when the app opens';
  const homeCards = (Array.isArray(cfg.homeCards) ? cfg.homeCards : [])
    .filter(item => item.key !== 'dueSoon' || modules.commitments)
    .map(item => ({
    ...item,
    icon:
      item.key === 'income' ? 'arrow-down-circle-outline'
        : item.key === 'expense' ? 'arrow-up-circle-outline'
          : item.key === 'net' ? 'pulse-outline'
            : 'calendar-outline',
    label:
      item.key === 'income' ? L.income
        : item.key === 'expense' ? L.expense
          : item.key === 'net' ? (cfg.lang === 'ar' ? 'صافي الشهر' : 'Month net')
            : (cfg.lang === 'ar' ? 'التزامات قريبة' : 'Due soon'),
    tone:
      item.key === 'income' ? th.inc
        : item.key === 'expense' ? th.exp
          : item.key === 'net' ? th.primary
            : th.warn,
  }));
  const tabLabelFor = (key) => {
    if (key === 'home') return L.home;
    if (key === 'history') return cfg.lang === 'ar' ? 'السجل' : 'History';
    if (key === 'trackers') return cfg.lang === 'ar' ? 'المتابعات' : 'Trackers';
    if (key === 'reports') return L.reports;
    if (key === 'settings') return L.settings;
    return key;
  };
  const startTabOptions = (tabs.length ? tabs : [
    { key: 'home' },
    { key: 'history' },
    { key: 'trackers' },
    { key: 'reports' },
    { key: 'settings' },
  ]).map((item) => ({
    value: item.key,
    label: tabLabelFor(item.key),
    icon:
      item.key === 'home' ? 'home-outline'
        : item.key === 'history' ? 'receipt-outline'
          : item.key === 'trackers' ? 'layers-outline'
            : item.key === 'reports' ? 'bar-chart-outline'
              : 'settings-outline',
  }));
  const homeSections = (Array.isArray(cfg.homeSections) ? cfg.homeSections : [])
    .filter(item => item?.key !== 'quickActions')
    .filter(item => item?.key !== 'wallets' || modules.wallets)
    .filter(item => item?.key !== 'upcomingRecurring' || modules.recurring)
    .filter(item => item?.key !== 'upcomingCommitments' || modules.commitments)
    .map(item => ({
    ...item,
    icon:
      item.key === 'hero' ? 'pulse-outline'
        : item.key === 'wallets' ? 'wallet-outline'
          : item.key === 'upcomingRecurring' ? 'repeat-outline'
            : item.key === 'upcomingCommitments' ? 'calendar-outline'
              : 'receipt-outline',
    label:
      item.key === 'hero' ? (cfg.lang === 'ar' ? 'البطاقة الرئيسية' : 'Hero card')
        : item.key === 'wallets' ? T.walletsSection
          : item.key === 'upcomingRecurring' ? (cfg.lang === 'ar' ? 'المتكرر القادم' : 'Upcoming recurring')
            : item.key === 'upcomingCommitments' ? (cfg.lang === 'ar' ? 'الالتزامات القادمة' : 'Upcoming commitments')
              : (cfg.lang === 'ar' ? 'أحدث الحركات' : 'Recent transactions'),
    tone:
      item.key === 'hero' ? th.primary
        : item.key === 'wallets' ? th.primary
          : item.key === 'upcomingRecurring' ? th.inc
            : item.key === 'upcomingCommitments' ? th.warn
              : th.exp,
  }));
  const homeContent = [
    ...homeCards.map(item => ({ ...item, source: 'card' })),
    ...homeSections.map(item => ({ ...item, source: 'section' })),
  ];
  const startTabLabel = startTabOptions.find(item => item.value === cfg.startTab)?.label || tabLabelFor(cfg.startTab || 'home');

  const [open, setOpen] = useState(null);
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const emailRef = useRef('');
  const passRef = useRef('');
  const [authMode, setAuthMode] = useState('signin');
  const [loading, setLoading] = useState(false);
  const [authServiceStatus, setAuthServiceStatus] = useState('idle');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState(ICON_OPTIONS[0]);
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletOpening, setNewWalletOpening] = useState('');
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [settingsSheet, setSettingsSheet] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const [importPackage, setImportPackage] = useState(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [backupPasswordMode, setBackupPasswordMode] = useState(null);
  const [backupPassword, setBackupPassword] = useState('');
  const importPreview = useMemo(
    () => importPackage?.payload?.data
      ? previewBackupText(JSON.stringify(importPackage.payload.data), cfg.lang)
      : { valid: false, empty: true, error: '' },
    [importPackage, cfg.lang],
  );
  const defaultWalletId = getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId);
  const walletRows = getWalletBalances(wallets, trans, cfg.currency, defaultWalletId)
    .sort((a, b) => (a.id === defaultWalletId ? -1 : b.id === defaultWalletId ? 1 : 0));
  const walletSelection = useMultiSelect(
    walletRows.filter(wallet => wallet.id !== defaultWalletId).map(wallet => wallet.id),
  );
  const categorySelection = useMultiSelect(
    cats.filter(cat => cat.id !== 'other').map(cat => cat.id),
  );

  const toggleOpen = (key) => setOpen(open === key ? null : key);

  useEffect(() => {
    if (open !== 'account' || user) return undefined;
    let active = true;
    setAuthServiceStatus('checking');
    checkSupabaseHealth().then((health) => {
      if (active) setAuthServiceStatus(health.ok ? 'ready' : 'down');
    });
    return () => { active = false; };
  }, [open, user]);

  const setProfileType = (profileType) => {
    setCfg({
      profileType,
      activeScope: profileType === 'personal_business' ? 'all' : defaultScopeForProfile(profileType),
    });
  };

  const setModuleEnabled = (key, on) => {
    if (on) {
      setCfg({ enabledModules: { [key]: true } });
      return;
    }
    const count = getFeatureDataCount(key, { debts, goals, commitments, wallets, trans, cfg });
    if (!count) {
      setCfg({ enabledModules: { [key]: false } });
      return;
    }
    Alert.alert(
      isAr ? 'إخفاء الميزة؟' : 'Hide feature?',
      isAr
        ? `ستختفي الميزة و${count} عنصر مرتبط بها، لكن لن تُحذف البيانات ويمكن إظهارها لاحقاً.`
        : `The feature and ${count} linked item(s) will be hidden, but no data will be deleted.`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? 'إخفاء' : 'Hide', onPress: () => setCfg({ enabledModules: { [key]: false } }) },
      ],
    );
  };

  const updateHomeCards = (updater) => {
    const next = typeof updater === 'function' ? updater([...(cfg.homeCards || [])]) : updater;
    setCfg({ homeCards: next });
  };
  const updateHomeSections = (updater) => {
    const next = typeof updater === 'function' ? updater([...(cfg.homeSections || [])]) : updater;
    setCfg({ homeSections: next });
  };
  const setHomeCardVisible = (key, visible) => {
    updateHomeCards(cards => cards.map(card => (
      card.key === key ? { ...card, visible } : card
    )));
  };
  const setHomeSectionVisible = (key, visible) => {
    updateHomeSections(items => items.map(item => (
      item.key === key ? { ...item, visible } : item
    )));
  };

  const handleAuth = async () => {
    const emailValue = emailRef.current.trim().toLowerCase();
    const passValue = passRef.current;
    if (!emailValue || !passValue.trim()) {
      Alert.alert('', T.requiredFields);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(emailValue)) {
      Alert.alert('', T.invalidEmail);
      return;
    }
    if (passValue.length < 6) {
      Alert.alert('', T.passwordLength);
      return;
    }
    setLoading(true);
    try {
      const health = await checkSupabaseHealth();
      if (!health.ok) {
        setAuthServiceStatus('down');
        Alert.alert('', T.authUnavailable);
        return;
      }
      setAuthServiceStatus('ready');
      const credentials = { email: emailValue, password: passValue };
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
      if (result.error) throw result.error;
      if (result.data?.session?.user) {
        await setUser(result.data.session.user);
        Alert.alert('', T.loginSuccess);
      } else if (authMode === 'signup' && result.data?.user) {
        const identities = result.data.user.identities;
        const requestAccepted = !Array.isArray(identities) || identities.length > 0;
        Alert.alert(
          T.verificationTitle,
          requestAccepted ? T.verificationPending : T.verificationUnconfirmed,
          [{ text: T.close, style: 'cancel' }],
        );
      } else {
        Alert.alert('', T.authUnavailable);
      }
    } catch (e) {
      const message = String(e?.message || '');
      const networkFailure = /network|fetch|resolve|connection/i.test(message);
      Alert.alert('', networkFailure ? T.authUnavailable : message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    await setUser(null);
  };

  const handlePasswordReset = async () => {
    const emailValue = emailRef.current.trim();
    if (!emailValue) {
      Alert.alert('', isAr ? 'أدخل بريدك الإلكتروني أولاً.' : 'Enter your email first.');
      return;
    }
    setLoading(true);
    try {
      const health = await checkSupabaseHealth();
      if (!health.ok) throw new Error(isAr ? 'خدمة الحساب غير متاحة حالياً.' : 'Account service is currently unavailable.');
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue);
      if (error) throw error;
      Alert.alert(
        '',
        isAr
          ? 'أُرسلت رسالة استعادة كلمة المرور إلى بريدك إن كان الحساب موجوداً.'
          : 'A password recovery email was sent if the account exists.',
      );
    } catch (error) {
      Alert.alert('', error?.message || (isAr ? 'تعذر إرسال رسالة الاستعادة.' : 'Could not send recovery email.'));
    } finally {
      setLoading(false);
    }
  };

  const changeBaseCurrency = (currencyCode) => {
    if (!currencyCode || currencyCode === cfg.currency) {
      setSettingsSheet(null);
      return;
    }
    const apply = async () => {
      await setCfg({ currency: currencyCode });
      setSettingsSheet(null);
    };
    const hasAmounts = trans.length > 0
      || debts.length > 0
      || goals.length > 0
      || commitments.length > 0
      || wallets.some(wallet => Number(wallet.openingBalance || 0) !== 0);
    if (!hasAmounts) {
      apply();
      return;
    }
    Alert.alert(
      isAr ? 'تغيير العملة الأساسية' : 'Change base currency',
      isAr
        ? `ستتغير العملة من ${cfg.currency} إلى ${currencyCode} لجميع المحافظ والتقارير، لكن الأرقام الحالية لن تُحوّل بسعر صرف.`
        : `All wallets and reports will change from ${cfg.currency} to ${currencyCode}, but existing amounts will not be exchange-rate converted.`,
      [
        { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
        { text: isAr ? 'تغيير العملة' : 'Change currency', onPress: apply },
      ],
    );
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
      openingBalance: parseNumberInput(newWalletOpening),
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

  const confirmDeleteSelectedWallets = () => {
    if (!walletSelection.selectedCount) return;
    const body = isAr
      ? `سيتم حذف ${walletSelection.selectedCount} محافظ ونقل حركاتها إلى المحفظة الافتراضية.`
      : `Delete ${walletSelection.selectedCount} wallets and move their transactions to the default wallet?`;
    Alert.alert(T.deleteWalletTitle, body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteWalletsMany(walletSelection.selectedIds);
          walletSelection.cancel();
        },
      },
    ]);
  };

  const confirmDeleteSelectedCategories = () => {
    if (!categorySelection.selectedCount) return;
    const body = isAr
      ? `سيتم حذف ${categorySelection.selectedCount} تصنيفات ونقل حركاتها إلى «أخرى».`
      : `Delete ${categorySelection.selectedCount} categories and move their transactions to Other?`;
    Alert.alert(L.delete, body, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.delete,
        style: 'destructive',
        onPress: async () => {
          await deleteCategoriesMany(categorySelection.selectedIds);
          categorySelection.cancel();
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

  const runExport = async (password = '') => {
    if (cfg.demoMode) {
      Alert.alert('', isAr ? 'اخرج من المساحة التجريبية لتصدير بياناتك الحقيقية.' : 'Exit demo mode before exporting real data.');
      return;
    }
    if (fileBusy) return;
    setFileBusy(true);
    try {
      await exportMyfiPackage({
        kind: 'full_backup',
        data: JSON.parse(exportBackup()),
        label: 'MYFI',
        password,
      });
    } catch (e) {
      Alert.alert('', e.message);
    } finally {
      setFileBusy(false);
    }
  };

  const handleExport = () => {
    if (cfg.demoMode) {
      Alert.alert('', isAr ? 'اخرج من المساحة التجريبية لتصدير بياناتك الحقيقية.' : 'Exit demo mode before exporting real data.');
      return;
    }
    Alert.alert(
      isAr ? 'حماية النسخة الاحتياطية' : 'Protect backup',
      isAr
        ? 'النسخة المشفرة تحمي بياناتك المالية إذا وصل الملف إلى شخص آخر.'
        : 'An encrypted backup protects your financial data if someone obtains the file.',
      [
        {
          text: isAr ? 'بدون كلمة مرور' : 'Without password',
          style: 'destructive',
          onPress: () => Alert.alert(
            isAr ? 'نسخة غير مشفرة' : 'Unencrypted backup',
            isAr
              ? 'سيكون محتوى الملف قابلاً للقراءة. استخدم هذا الخيار فقط إذا كنت ستحفظه في مكان آمن.'
              : 'The file contents will be readable. Use this only if you will store it securely.',
            [
              { text: isAr ? 'إلغاء' : 'Cancel', style: 'cancel' },
              { text: isAr ? 'تصدير' : 'Export', onPress: () => runExport('') },
            ],
          ),
        },
        {
          text: isAr ? 'تشفير بكلمة مرور' : 'Encrypt with password',
          onPress: () => {
            setBackupPassword('');
            setBackupPasswordMode('export');
          },
        },
      ],
    );
  };

  const selectImportFile = async () => {
    if (cfg.demoMode) {
      Alert.alert('', isAr ? 'اخرج من المساحة التجريبية قبل استعادة نسخة.' : 'Exit demo mode before restoring a backup.');
      return;
    }
    if (fileBusy) return;
    setFileBusy(true);
    try {
      const picked = await pickMyfiPackage({ kind: 'full_backup' });
      if (picked?.passwordRequired) {
        setImportPackage(picked);
        setBackupPassword('');
        setBackupPasswordMode('import');
      } else if (picked) {
        setImportPackage(picked);
      }
    } catch (error) {
      setImportPackage(null);
      Alert.alert(T.importBackup, error?.message || T.importFailed);
    } finally {
      setFileBusy(false);
    }
  };

  const submitBackupPassword = async () => {
    if (backupPasswordMode === 'export') {
      if (backupPassword.length < 6) {
        Alert.alert('', isAr ? 'اكتب كلمة مرور من 6 أحرف على الأقل.' : 'Use at least 6 characters.');
        return;
      }
      const password = backupPassword;
      setBackupPasswordMode(null);
      setBackupPassword('');
      await runExport(password);
      return;
    }
    if (backupPasswordMode === 'import') {
      if (!backupPassword || !importPackage) return;
      setFileBusy(true);
      try {
        const unlocked = await unlockMyfiPackage(importPackage, backupPassword, 'full_backup');
        setImportPackage(unlocked);
        setBackupPasswordMode(null);
        setBackupPassword('');
      } catch (error) {
        Alert.alert('', error?.message || T.importFailed);
      } finally {
        setFileBusy(false);
      }
    }
  };

  const handleImport = async () => {
    if (!importPackage?.payload?.data) return;
    if (!importPreview.valid) {
      Alert.alert('', importPreview.error || T.importFailed);
      return;
    }
    Alert.alert(T.importBackup, T.importWarning, [
      { text: T.cancel, style: 'cancel' },
      {
        text: T.replaceNow,
        onPress: async () => {
          const ok = await importBackup(JSON.stringify(importPackage.payload.data));
          Alert.alert('', ok ? T.importDone : T.importFailed);
          if (ok) {
            setImportPackage(null);
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

  const toggleDemoMode = () => {
    if (cfg.demoMode) {
      Alert.alert(
        isAr ? 'الخروج من البيانات التجريبية' : 'Exit demo data',
        isAr ? 'ستعود بياناتك الحقيقية كما كانت.' : 'Your real data will be restored exactly as it was.',
        [
          { text: T.cancel, style: 'cancel' },
          { text: isAr ? 'خروج' : 'Exit', onPress: exitDemoMode },
        ],
      );
      return;
    }
    Alert.alert(
      isAr ? 'فتح مساحة تجريبية' : 'Open demo workspace',
      isAr
        ? 'ستُحفظ بياناتك الحقيقية جانباً، ولن تتم مزامنة البيانات التجريبية أو خلطها معها.'
        : 'Your real data stays isolated. Demo data is never synced or mixed with it.',
      [
        { text: T.cancel, style: 'cancel' },
        { text: isAr ? 'فتح التجربة' : 'Open demo', onPress: enterDemoMode },
      ],
    );
  };

  const Section = useMemo(() => ({ id, title, children }) => {
    const expanded = expandedSections.has(id);
    return (
      <View style={s.section}>
        <TouchableOpacity
          onPress={() => setExpandedSections(current => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={[
            s.sectionToggle,
            {
              backgroundColor: th.card,
              borderColor: th.border,
              flexDirection: isAr ? 'row-reverse' : 'row',
            },
          ]}
        >
          <View style={[s.sectionMark, { backgroundColor: th.primary }]} />
          <Text style={[s.sectionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={th.faint} />
        </TouchableOpacity>
        {expanded ? (
          <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
            {children}
          </View>
        ) : null}
      </View>
    );
  }, [expandedSections, isAr, th]);

  const Row = useMemo(() => ({ label, value, children, onPress, danger = false, last = false }) => {
    const body = (
      <>
        <Text style={[s.rowLabel, { color: danger ? th.exp : th.text, textAlign: isAr ? 'right' : 'left' }]} numberOfLines={2}>{label}</Text>
        <View style={[s.trailing, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {value ? (
            <Text
              style={{
                color: th.sub,
                fontSize: 12,
                ...weight('700'),
                textAlign: isAr ? 'right' : 'left',
                writingDirection: isAr ? 'rtl' : 'ltr',
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {value}
            </Text>
          ) : null}
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
        <TouchableOpacity onPress={onPress} style={rowStyle} activeOpacity={0.72}>
          {body}
        </TouchableOpacity>
      );
    }
    return <View style={rowStyle}>{body}</View>;
  }, [isAr, th]);

  const Segmented = useMemo(() => ({ options, value, onChange }) => (
    <View style={[s.segmented, { backgroundColor: th.cardHigh }]}>
      {options.map(option => {
        const active = value === option.value;
        return (
          <TouchableOpacity
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[s.segmentBtn, { backgroundColor: active ? th.card : 'transparent' }]}
          >
            <Text style={{ color: active ? th.primary : th.sub, fontSize: 12, ...weight('900'), textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  ), [th]);

  const Stepper = useMemo(() => ({ value, suffix = '', onMinus, onPlus }) => (
    <View style={[s.stepper, { backgroundColor: th.cardHigh }]}>
      <TouchableOpacity onPress={onMinus} style={s.stepButton}>
        <Ionicons name="remove" size={14} color={th.text} />
      </TouchableOpacity>
      <Text style={{ color: th.text, minWidth: 54, textAlign: 'center', fontSize: 12, ...weight('900') }}>
        {value}{suffix}
      </Text>
      <TouchableOpacity onPress={onPlus} style={s.stepButton}>
        <Ionicons name="add" size={14} color={th.text} />
      </TouchableOpacity>
    </View>
  ), [th]);

  const Expanded = useMemo(() => ({ children, bottomBorder = false }) => (
    <View style={[s.expanded, { borderTopColor: th.border, borderBottomColor: th.border }, bottomBorder && s.expandedSeparated]}>
      {children}
    </View>
  ), [th]);

  const detectCountryAndCurrency = async () => {
    if (locationBusy) return;
    setLocationBusy(true);
    try {
      const result = await detectLocationDefaults();
      if (result.ok) {
        await setCfg({ country: result.countryCode, currency: result.currencyCode });
        Alert.alert('', isAr
          ? `تم اقتراح ${result.country.name} والعملة ${result.currencyCode}. يمكنك تغييرهما يدويًا.`
          : `Suggested ${result.country.nameEn} and ${result.currencyCode}. You can change them manually.`);
        return;
      }
      Alert.alert('', result.reason === 'unsupported'
        ? (isAr ? 'تم تحديد موقعك، لكن الدولة غير مدعومة بعد. اختر الدولة والعملة يدويًا.' : 'Your location was found, but the country is not supported yet. Choose manually.')
        : (isAr ? 'لم تُمنح صلاحية الموقع. يمكنك الاختيار يدويًا.' : 'Location permission was not granted. You can choose manually.'));
    } catch {
      Alert.alert('', isAr ? 'تعذر تحديد الموقع الآن.' : 'Could not detect location right now.');
    } finally {
      setLocationBusy(false);
    }
  };


  return (
    <>
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 82 }}>
      <Section id="general" title={T.general}>
        <Row
          label={isAr ? 'دليل الاستخدام' : 'User guide'}
          value={isAr ? 'شرح الميزات والخطوات' : 'Features and steps'}
          onPress={() => setGuideOpen(true)}
        />
        <Row
          label={T.language}
          value={cfg.langMode === 'system' ? `${T.systemLanguage} — ${cfg.lang === 'ar' ? T.arabicLanguage : T.englishLanguage}` : cfg.lang === 'ar' ? T.arabicLanguage : T.englishLanguage}
          onPress={() => setSettingsSheet('language')}
        />
        <Row
          label={T.theme}
          value={cfg.themeMode === 'system' ? `${T.systemLanguage} — ${cfg.theme === 'dark' ? T.darkTheme : T.lightTheme}` : cfg.theme === 'dark' ? T.darkTheme : T.lightTheme}
          onPress={() => setSettingsSheet('theme')}
        />
        <Row
          label={T.country}
          value={`${selectedCountry.flag} ${isAr ? selectedCountry.name : selectedCountry.nameEn}`}
          onPress={() => setSettingsSheet('country')}
        />
        <Row
          label={T.currency}
          value={`${selectedCurrency.code} · ${selectedCurrency.sym}`}
          onPress={() => setSettingsSheet('currency')}
          last
        />
      </Section>

      <Section id="usage" title={T.usage}>
        <View style={s.profileBlock}>
          <Text style={[s.focusLabel, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.profile}</Text>
          <View style={s.profileChoiceList}>
            {profileOptions.map(option => {
              const active = option.value === (cfg.profileType || 'personal');
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setProfileType(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={option.label}
                  style={[
                    s.profileChoice,
                    {
                      backgroundColor: th.cardHigh,
                      flexDirection: isAr ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={[s.moduleIcon, { backgroundColor: active ? th.primSoft : th.card }]}>
                    <Ionicons name={option.icon} size={17} color={active ? th.primary : th.sub} />
                  </View>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.9}
                    style={[
                      s.profileChoiceLabel,
                      {
                        color: th.text,
                        textAlign: isAr ? 'right' : 'left',
                      },
                    ]}
                  >
                    {option.label}
                  </Text>
                  <View style={[s.radioOuter, { borderColor: active ? th.primary : th.border }]}>
                    {active ? <View style={[s.radioInner, { backgroundColor: th.primary }]} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
        <Row
          label={T.enabledFeatures}
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
            <View style={[s.moduleRow, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[s.moduleInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <View style={[s.moduleIcon, { backgroundColor: cfg.entryMode !== 'classic' ? th.primSoft : th.card }]}>
                  <Ionicons name="flash-outline" size={16} color={cfg.entryMode !== 'classic' ? th.primary : th.sub} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('800'), textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? 'الإدخال السريع' : 'Quick entry'}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? 'نماذج مستقلة للمصروف والدخل والتحويل' : 'Focused forms for expenses, income, and transfers'}
                  </Text>
                </View>
              </View>
              <Switch
                value={cfg.entryMode !== 'classic'}
                onValueChange={(enabled) => setCfg({ entryMode: enabled ? 'quick' : 'classic' })}
                trackColor={{ true: th.primary, false: th.card }}
              />
            </View>
          </Expanded>
        ) : null}
      </Section>

      <Section id="workspace" title={workspaceTitle}>
        <Row
          label={startTabTitle}
          value={startTabLabel}
          onPress={() => setSettingsSheet('startTab')}
        />
        <Row
          label={homeContentTitle}
          onPress={() => setSettingsSheet('homeContent')}
          last
        />
      </Section>

      {modules.wallets ? (
        <Section id="wallets" title={T.walletsSection}>
          <MultiSelectBar
            th={th}
            lang={cfg.lang}
            active={walletSelection.selecting}
            count={walletSelection.selectedCount}
            total={Math.max(0, walletRows.length - 1)}
            allSelected={walletSelection.allSelected}
            onStart={walletSelection.start}
            onToggleAll={walletSelection.toggleAll}
            onDelete={confirmDeleteSelectedWallets}
            onCancel={walletSelection.cancel}
            style={{ marginHorizontal: 10, marginTop: 10 }}
          />
          {walletRows.map((wallet, index) => (
            <Pressable
              key={wallet.id}
              onLongPress={() => {
                if (wallet.id !== defaultWalletId) walletSelection.toggle(wallet.id);
              }}
              onPress={() => {
                if (walletSelection.selecting && wallet.id !== defaultWalletId) walletSelection.toggle(wallet.id);
              }}
              style={[
                s.walletRow,
                {
                  backgroundColor: 'transparent',
                  borderBottomColor: th.border,
                  flexDirection: isAr ? 'row-reverse' : 'row',
                },
              ]}
            >
              <View style={[s.walletIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name={wallet.id === defaultWalletId ? 'star-outline' : 'wallet-outline'} size={16} color={th.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                  {getWalletLabel(wallet, cfg.lang)}
                </Text>
                <Text style={{ color: th.sub, fontSize: 12, marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                  {wallet.id === defaultWalletId ? `${T.defaultWallet} · ` : ''}{T.currentBalance}: {Math.round(wallet.balance || 0).toLocaleString()} {wallet.currency}
                </Text>
              </View>
              {walletSelection.selecting ? (
                wallet.id !== defaultWalletId ? (
                  <SelectionCheckbox
                    th={th}
                    selected={walletSelection.selected.has(wallet.id)}
                    onPress={() => walletSelection.toggle(wallet.id)}
                  />
                ) : (
                  <Ionicons name="lock-closed-outline" size={16} color={th.faint} />
                )
              ) : (
                <ActionMenu
                  th={th}
                  lang={cfg.lang}
                  title={getWalletLabel(wallet, cfg.lang)}
                  buttonStyle={{ backgroundColor: th.cardHigh }}
                  items={[
                    wallet.id !== defaultWalletId
                      ? {
                          label: cfg.lang === 'ar' ? 'تعيين كافتراضية' : 'Set as default',
                          icon: 'star-outline',
                          color: th.primary,
                          onPress: () => setCfg({ defaultWalletId: wallet.id }),
                        }
                      : null,
                    walletRows.length > 1
                      ? {
                          label: T.delete,
                          icon: 'trash-outline',
                          color: th.exp,
                          danger: true,
                          onPress: () => confirmDeleteWallet(wallet),
                        }
                      : null,
                  ]}
                />
              )}
            </Pressable>
          ))}
          <View style={[s.addPrompt, { borderTopColor: th.border }]}>
            <TouchableOpacity
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
            </TouchableOpacity>
          </View>
        </Section>
      ) : null}

      <Section id="money" title={T.money}>
        {modules.budgets ? <>
        <Row
          label={isAr ? 'الميزانيات الشهرية' : 'Monthly budgets'}
          value={Object.keys(cfg.categoryBudgets || {}).length ? `${Object.keys(cfg.categoryBudgets || {}).length}` : (isAr ? 'غير محددة' : 'Not set')}
          onPress={() => toggleOpen('budgets')}
          last={false}
        />
        {open === 'budgets' ? (
          <Expanded>
            <Text style={[s.miniLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
              {isAr ? 'حد شهري لكل تصنيف. اترك القيمة فارغة لتعطيله.' : 'Monthly limit per category. Leave blank to disable.'}
            </Text>
            {cats.filter(cat => cat.id !== 'salary').map(cat => (
              <View key={cat.id} style={[s.categoryRow, { backgroundColor: th.cardHigh }]}>
                <View style={[s.categoryInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <Ionicons name={cat.icon || 'cube-outline'} size={16} color={cat.color || th.primary} />
                  <Text style={{ color: th.text, fontSize: 13, ...weight('800') }}>{isAr ? cat.label : cat.labelEn}</Text>
                </View>
                <FormattedNumberField
                  initialValue={cfg.categoryBudgets?.[cat.id] || ''}
                  onCommit={(value) => setCategoryBudget(cat.id, value)}
                  th={th}
                  style={[s.input, { width: 120, marginBottom: 0, backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: 'center' }]}
                />
              </View>
            ))}
            <View style={{ flexDirection: isAr ? 'row-reverse' : 'row', gap: 8 }}>
              <TouchableOpacity onPress={applySuggestedBudgets} style={[s.smallAction, { backgroundColor: th.primSoft, flex: 1 }]}>
                <Text style={{ color: th.primary, ...weight('900') }}>{isAr ? 'اقتراح تلقائي' : 'Auto suggest'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={clearBudgets} style={[s.smallAction, { backgroundColor: th.cardHigh, flex: 1 }]}>
                <Text style={{ color: th.exp, ...weight('900') }}>{isAr ? 'مسح الكل' : 'Clear all'}</Text>
              </TouchableOpacity>
            </View>
          </Expanded>
        ) : null}
        </> : null}
        <Row
          label={T.categories}
          value={`${cats.length} ${T.categoriesCount}`}
          onPress={() => toggleOpen('cats')}
          last={open !== 'cats'}
        />
        {open === 'cats' && (
          <Expanded>
            <MultiSelectBar
              th={th}
              lang={cfg.lang}
              active={categorySelection.selecting}
              count={categorySelection.selectedCount}
              total={Math.max(0, cats.length - 1)}
              allSelected={categorySelection.allSelected}
              onStart={categorySelection.start}
              onToggleAll={categorySelection.toggleAll}
              onDelete={confirmDeleteSelectedCategories}
              onCancel={categorySelection.cancel}
            />
            {cats.map(cat => (
              <Pressable
                key={cat.id}
                onLongPress={() => {
                  if (cat.id !== 'other') categorySelection.toggle(cat.id);
                }}
                onPress={() => {
                  if (categorySelection.selecting && cat.id !== 'other') categorySelection.toggle(cat.id);
                }}
                style={[
                  s.categoryRow,
                  {
                    backgroundColor: th.cardHigh,
                    borderColor: 'transparent',
                    borderWidth: 1,
                  },
                ]}
              >
                <View style={[s.categoryInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <View style={[s.categoryIcon, { backgroundColor: cat.color + '22' }]}>
                    <Ionicons name={cat.icon || 'cube-outline'} size={15} color={cat.color} />
                  </View>
                  <Text style={{ color: th.text, fontSize: 13, ...weight('800') }}>
                    {isAr ? cat.label : cat.labelEn}
                  </Text>
                </View>
                {categorySelection.selecting ? (
                  cat.id !== 'other' ? (
                    <SelectionCheckbox
                      th={th}
                      selected={categorySelection.selected.has(cat.id)}
                      onPress={() => categorySelection.toggle(cat.id)}
                    />
                  ) : (
                    <Ionicons name="lock-closed-outline" size={16} color={th.faint} />
                  )
                ) : cat.id !== 'other' ? (
                    <ActionMenu
                      th={th}
                      lang={cfg.lang}
                      title={isAr ? cat.label : cat.labelEn}
                      buttonStyle={{ backgroundColor: th.input }}
                      items={[
                        {
                          label: T.delete,
                          icon: 'trash-outline',
                          color: th.exp,
                          danger: true,
                          onPress: () => deleteCategory(cat.id),
                        },
                      ]}
                    />
                  ) : null}
              </Pressable>
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
                <TouchableOpacity
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
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.miniLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.color}</Text>
            <View style={s.colorGrid}>
              {CAT_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setNewCatColor(color)}
                  style={[s.colorPick, { backgroundColor: color, borderColor: newCatColor === color ? th.text : 'transparent' }]}
                />
              ))}
            </View>
            <TouchableOpacity onPress={addCategory} style={[s.primaryButton, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.addCategory}</Text>
            </TouchableOpacity>
          </Expanded>
        )}
      </Section>

      <Section id="security" title={T.security}>
        <Row
          label={T.biometric}
          value={cfg.bioLock ? T.activeStatus : T.inactive}
          last
        >
          <Switch
            value={!!cfg.bioLock}
            onValueChange={toggleBioLock}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
      </Section>

      <Section id="alerts" title={T.alerts}>
        {modules.debtsOwed ? <>
        <Row
          label={T.debtAlert}
          value={notif.debt.on ? `${notif.debt.value} ${T.days}` : T.inactive}
          last={false}
        >
          <Switch
            value={!!notif.debt.on}
            onValueChange={(on) => setNotif({ debt: { ...notif.debt, on } })}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.debt.on ? (
          <Expanded bottomBorder>
            <View style={[s.detailLine, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{T.debtBefore}</Text>
              <Stepper
                value={notif.debt.value}
                suffix={` ${T.days}`}
                onMinus={() => setNotif({ debt: { ...notif.debt, value: Math.max(1, notif.debt.value - 1) } })}
                onPlus={() => setNotif({ debt: { ...notif.debt, value: notif.debt.value + 1 } })}
              />
            </View>
          </Expanded>
        ) : null}
        </> : null}

        {modules.commitments && (commitments || []).length > 0 ? (
          <>
            <Row
              label={T.commitmentReminderInline}
              value={notif.commitment?.on !== false ? `${notif.commitment?.value || 3} ${T.days}` : T.inactive}
              last={false}
            >
              <Switch
                value={notif.commitment?.on !== false}
                onValueChange={(on) => setNotif({ commitment: { ...(notif.commitment || { value: 3 }), on } })}
                trackColor={{ true: th.primary, false: th.cardHigh }}
              />
            </Row>
            {notif.commitment?.on !== false ? (
              <Expanded bottomBorder>
                <View style={[s.detailLine, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{T.commitmentBefore}</Text>
                  <Stepper
                    value={notif.commitment?.value || 3}
                    suffix={` ${T.days}`}
                    onMinus={() => setNotif({ commitment: { ...(notif.commitment || {}), on: true, value: Math.max(0, Number(notif.commitment?.value || 3) - 1) } })}
                    onPlus={() => setNotif({ commitment: { ...(notif.commitment || {}), on: true, value: Number(notif.commitment?.value || 3) + 1 } })}
                  />
                </View>
              </Expanded>
            ) : null}
          </>
        ) : null}

        <Row
          label={T.dailyAlert}
          value={notif.daily.on ? formatHour12(notif.daily.value, cfg.lang) : T.inactive}
          last={false}
        >
          <Switch
            value={!!notif.daily.on}
            onValueChange={toggleDaily}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.daily.on ? (
          <Expanded bottomBorder>
            <View style={[s.detailLine, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <Text style={{ color: th.sub, fontSize: 12, ...weight('800') }}>{T.alertTime}</Text>
              <Stepper
                value={formatHour12(notif.daily.value, cfg.lang)}
                onMinus={() => setDailyHour(-1)}
                onPlus={() => setDailyHour(1)}
              />
            </View>
          </Expanded>
        ) : null}

        <Row
          label={T.lowBalance}
          value={notif.low.on ? `${Math.round(Number(notif.low.value || 0)).toLocaleString()} ${cfg.currency}` : T.inactive}
          last={!notif.low.on}
        >
          <Switch
            value={!!notif.low.on}
            onValueChange={(on) => setNotif({ low: { ...notif.low, on } })}
            trackColor={{ true: th.primary, false: th.cardHigh }}
          />
        </Row>
        {notif.low.on ? (
          <Expanded>
            <TextInput
              value={formatNumberInput(String(notif.low.value || ''))}
              onChangeText={(value) => setNotif({ low: { ...notif.low, value: parseNumberInput(formatNumberInput(value)) } })}
              keyboardType="numeric"
              placeholder={T.lowBelow}
              placeholderTextColor={th.sub}
              style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
            />
          </Expanded>
        ) : null}
      </Section>

      <Section id="data" title={T.data}>
        <Row label={T.archive} onPress={onOpenArchive} />
        <Row label={T.exportBackup} onPress={handleExport} />
        <Row label={T.importBackup} onPress={() => toggleOpen('import')} last={open !== 'import'} />
        {open === 'import' ? (
          <Expanded>
            <View style={[s.importActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity
                onPress={selectImportFile}
                disabled={fileBusy}
                style={[s.importActionBtn, { backgroundColor: th.cardHigh, borderColor: th.border }]}
              >
                <Ionicons name="document-attach-outline" size={14} color={th.primary} />
                <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>
                  {fileBusy ? (isAr ? 'جاري الفحص...' : 'Validating...') : (isAr ? 'اختيار ملف ZIP' : 'Choose ZIP file')}
                </Text>
              </TouchableOpacity>
              {importPackage ? <TouchableOpacity
                onPress={() => setImportPackage(null)}
                style={[s.importActionBtn, { backgroundColor: th.expBg, borderColor: th.expBg }]}
              >
                <Ionicons name="close-circle-outline" size={14} color={th.exp} />
                <Text style={{ color: th.exp, fontSize: 12, ...weight('900') }}>{T.clearImport}</Text>
              </TouchableOpacity> : null}
            </View>
            {importPackage?.name ? (
              <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, textAlign: isAr ? 'right' : 'left', marginBottom: 8 }}>
                {importPackage.name}
              </Text>
            ) : null}
            {!importPreview.empty ? (
              <View style={[s.previewCard, { backgroundColor: importPreview.valid ? th.primSoft : th.expBg, borderColor: importPreview.valid ? th.primary : th.exp }]}>
                <View style={[s.previewHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                  <Ionicons name={importPreview.valid ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={17} color={importPreview.valid ? th.primary : th.exp} />
                  <Text style={{ color: importPreview.valid ? th.primary : th.exp, fontSize: 13, ...weight('900'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                    {importPreview.valid ? T.backupValid : T.backupInvalid}
                  </Text>
                </View>
                {importPreview.error ? (
                  <Text style={{ color: importPreview.valid ? th.sub : th.exp, fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: isAr ? 'right' : 'left' }}>
                    {importPreview.error}
                  </Text>
                ) : null}
                {importPreview.valid ? (
                  <>
                    <Text style={{ color: th.text, fontSize: 13, ...weight('900'), textAlign: isAr ? 'right' : 'left' }} numberOfLines={1}>
                      {importPreview.name} · {T.backupCurrency}: {importPreview.currency || cfg.currency}
                    </Text>
                    <View style={[s.previewGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                      <PreviewStat th={th} label={T.backupMonths} value={String(importPreview.months.length)} />
                      <PreviewStat th={th} label={T.backupEntries} value={String(importPreview.entries)} />
                      <PreviewStat th={th} label={T.backupWallets} value={String(importPreview.wallets)} />
                      <PreviewStat th={th} label={T.backupTrackers} value={String(importPreview.trackers)} />
                      <PreviewStat th={th} label={T.backupCommitments} value={String(importPreview.commitments)} />
                    </View>
                  </>
                ) : null}
              </View>
            ) : null}
            <View style={[s.infoLine, { backgroundColor: th.warnBg, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <Ionicons name="alert-circle-outline" size={14} color={th.warn} />
              <Text style={{ color: th.warn, fontSize: 12, ...weight('800'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                {T.importWarning}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleImport}
              disabled={!importPreview.valid}
              style={[s.primaryButton, { backgroundColor: importPreview.valid ? th.primary : th.cardHigh, opacity: importPreview.valid ? 1 : 0.7 }]}
            >
              <Text style={{ color: importPreview.valid ? th.onPrimary : th.sub, fontSize: 13, ...weight('900') }}>{T.replaceNow}</Text>
            </TouchableOpacity>
          </Expanded>
        ) : null}
        <Row
          label={cfg.demoMode ? (isAr ? 'الخروج من البيانات التجريبية' : 'Exit demo workspace') : (isAr ? 'تجربة البرنامج ببيانات مثال' : 'Try with demo data')}
          value={cfg.demoMode ? (isAr ? 'نشط' : 'Active') : undefined}
          onPress={toggleDemoMode}
          last={false}
        />
        <Row label={T.deleteAll} onPress={confirmReset} danger last />
      </Section>

      <Section id="account" title={T.account}>
        <Row
          label={user ? T.connected : T.notConnected}
          value={user?.email || (authServiceStatus === 'down' ? T.accountServiceDown : undefined)}
          onPress={() => toggleOpen('account')}
          last={open !== 'account'}
        />
        {open === 'account' ? (
          <Expanded>
            {user ? (
              <TouchableOpacity onPress={handleSignOut} style={[s.secondaryButton, { backgroundColor: th.expBg }]}>
                <Text style={{ color: th.exp, fontSize: 13, ...weight('900') }}>{T.signOut}</Text>
              </TouchableOpacity>
            ) : (
              <>
                <View style={[s.statusNote, { backgroundColor: authServiceStatus === 'ready' ? th.incBg : authServiceStatus === 'down' ? th.expBg : th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}> 
                  <Ionicons
                    name={authServiceStatus === 'ready' ? 'cloud-done-outline' : authServiceStatus === 'down' ? 'cloud-offline-outline' : 'sync-outline'}
                    size={16}
                    color={authServiceStatus === 'ready' ? th.inc : authServiceStatus === 'down' ? th.exp : th.sub}
                  />
                  <Text style={{ color: authServiceStatus === 'ready' ? th.inc : authServiceStatus === 'down' ? th.exp : th.sub, fontSize: 12, ...weight('900') }}>
                    {authServiceStatus === 'ready' ? T.accountServiceReady : authServiceStatus === 'down' ? T.accountServiceDown : T.checkingConnection}
                  </Text>
                </View>
                <Segmented
                  value={authMode}
                  onChange={setAuthMode}
                  options={[
                    { value: 'signin', label: T.signIn },
                    { value: 'signup', label: T.signUp },
                  ]}
                />
                <TextInput
                  value={email}
                  onChangeText={(value) => { setEmail(value); emailRef.current = value; }}
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
                  value={pass}
                  onChangeText={(value) => { setPass(value); passRef.current = value; }}
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
                <TouchableOpacity onPress={handleAuth} disabled={loading} style={[s.primaryButton, { backgroundColor: th.primary, opacity: loading ? 0.6 : 1 }]}>
                  <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>
                    {loading ? '...' : authMode === 'signin' ? T.signIn : T.signUp}
                  </Text>
                </TouchableOpacity>
                {authMode === 'signin' ? (
                  <TouchableOpacity onPress={handlePasswordReset} disabled={loading} style={[s.secondaryButton, { backgroundColor: th.cardHigh }]}>
                    <Text style={{ color: th.primary, fontSize: 13, ...weight('900') }}>
                      {isAr ? 'نسيت كلمة المرور' : 'Forgot password'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            )}
          </Expanded>
        ) : null}
      </Section>

      <Text style={{ color: th.faint, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
        MYFI · {L.appVersion} 1.0.0
      </Text>
    </ScrollView>
    <HelpGuideModal visible={guideOpen} onClose={() => setGuideOpen(false)} th={th} lang={cfg.lang} />
    <Modal visible={!!backupPasswordMode} transparent animationType="fade" onRequestClose={() => setBackupPasswordMode(null)}>
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>
              {backupPasswordMode === 'export'
                ? (isAr ? 'كلمة مرور النسخة' : 'Backup password')
                : (isAr ? 'فتح النسخة المشفرة' : 'Unlock encrypted backup')}
            </Text>
            <TouchableOpacity onPress={() => setBackupPasswordMode(null)} style={[s.iconOnly, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.text} />
            </TouchableOpacity>
          </View>
          <Text style={{ color: th.warn, fontSize: 12, lineHeight: 19, ...weight('800'), textAlign: isAr ? 'right' : 'left', marginBottom: 12 }}>
            {backupPasswordMode === 'export'
              ? (isAr ? 'احفظ كلمة المرور جيداً؛ لا يمكن استعادة الملف بدونها.' : 'Keep this password safe; the file cannot be restored without it.')
              : (isAr ? 'أدخل كلمة المرور التي استُخدمت عند إنشاء الملف.' : 'Enter the password used when this file was created.')}
          </Text>
          <TextInput
            value={backupPassword}
            onChangeText={setBackupPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={isAr ? 'كلمة المرور' : 'Password'}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: 'left', writingDirection: 'ltr' }]}
          />
          <TouchableOpacity
            onPress={submitBackupPassword}
            disabled={fileBusy}
            style={[s.primaryButton, { backgroundColor: th.primary, opacity: fileBusy ? 0.6 : 1 }]}
          >
            <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>
              {fileBusy ? '...' : backupPasswordMode === 'export' ? (isAr ? 'تشفير وتصدير' : 'Encrypt and export') : (isAr ? 'فتح الملف' : 'Unlock file')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    <Modal visible={!!settingsSheet} transparent animationType="slide" onRequestClose={() => setSettingsSheet(null)}>
      <TouchableOpacity style={[s.modalOverlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={() => setSettingsSheet(null)}>
        <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>
              {settingsSheet === 'language'
                ? T.language
                : settingsSheet === 'theme'
                  ? T.theme
                  : settingsSheet === 'startTab'
                    ? startTabTitle
                    : settingsSheet === 'homeContent'
                      ? homeContentTitle
                        : settingsSheet === 'currency'
                          ? T.currency
                          : T.country}
            </Text>
            <TouchableOpacity onPress={() => setSettingsSheet(null)} style={[s.iconOnly, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.text} />
            </TouchableOpacity>
          </View>

          {settingsSheet === 'language' ? (
            <View style={s.sheetScroll}>
              <View style={[s.systemChoice, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <Ionicons name="phone-portrait-outline" size={18} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{isAr ? 'النظام' : 'System'}</Text>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? `الحالية: ${cfg.lang === 'ar' ? 'العربية' : 'English'}` : `Current: ${cfg.lang === 'ar' ? 'Arabic' : 'English'}`}
                  </Text>
                </View>
                <Switch
                  value={cfg.langMode === 'system'}
                  onValueChange={(enabled) => setCfg(enabled ? { langMode: 'system' } : { langMode: 'manual', lang: cfg.lang })}
                  trackColor={{ true: th.primary, false: th.border }}
                />
              </View>
              {cfg.langMode !== 'system' ? [
                { value: 'ar', label: T.arabicLanguage },
                { value: 'en', label: T.englishLanguage },
              ].map(option => {
                const active = cfg.lang === option.value;
                return (
                  <TouchableOpacity key={option.value} onPress={() => { setCfg({ langMode: 'manual', lang: option.value }); setSettingsSheet(null); }}
                    style={[s.optionCard, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                    <Ionicons name="language-outline" size={18} color={active ? th.primary : th.sub} />
                    <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>{option.label}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              }) : null}
            </View>
          ) : null}

          {settingsSheet === 'theme' ? (
            <View style={s.sheetScroll}>
              <View style={[s.systemChoice, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <Ionicons name="phone-portrait-outline" size={18} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{isAr ? 'النظام' : 'System'}</Text>
                  <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? `الحالي: ${cfg.theme === 'dark' ? 'داكن' : 'فاتح'}` : `Current: ${cfg.theme === 'dark' ? 'Dark' : 'Light'}`}
                  </Text>
                </View>
                <Switch
                  value={cfg.themeMode === 'system'}
                  onValueChange={(enabled) => setCfg(enabled ? { themeMode: 'system' } : { themeMode: 'manual', theme: cfg.theme })}
                  trackColor={{ true: th.primary, false: th.border }}
                />
              </View>
              {cfg.themeMode !== 'system' ? [
                { value: 'dark', label: T.darkTheme, icon: 'moon-outline' },
                { value: 'light', label: T.lightTheme, icon: 'sunny-outline' },
              ].map(option => {
                const active = cfg.theme === option.value;
                return (
                  <TouchableOpacity key={option.value} onPress={() => { setCfg({ themeMode: 'manual', theme: option.value }); setSettingsSheet(null); }}
                    style={[s.optionCard, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                    <Ionicons name={option.icon} size={18} color={active ? th.primary : th.sub} />
                    <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>{option.label}</Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              }) : null}
            </View>
          ) : null}

          {settingsSheet === 'startTab' ? (
            <View style={s.sheetScroll}>
              {startTabOptions.map(option => {
                const active = cfg.startTab === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    onPress={() => { setCfg({ startTab: option.value }); setSettingsSheet(null); }}
                    style={[s.optionCard, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  >
                    <Ionicons name={option.icon} size={18} color={active ? th.primary : th.sub} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                        {option.label}
                      </Text>
                      <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                        {startTabSummary}
                      </Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}

          {settingsSheet === 'homeContent' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
              {homeContent.map(item => (
                <View
                  key={`${item.source}-${item.key}`}
                  style={[s.moduleRow, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}
                >
                  <View style={[s.moduleInfo, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                    <View style={[s.moduleIcon, { backgroundColor: item.visible !== false ? th.primSoft : th.card }]}>
                      <Ionicons name={item.icon} size={16} color={item.visible !== false ? item.tone : th.sub} />
                    </View>
                    <Text style={{ color: th.text, fontSize: 13, ...weight('800'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                      {item.label}
                    </Text>
                  </View>
                  <Switch
                    value={item.visible !== false}
                    onValueChange={(value) => (
                      item.source === 'card'
                        ? setHomeCardVisible(item.key, value)
                        : setHomeSectionVisible(item.key, value)
                    )}
                    trackColor={{ true: th.primary, false: th.card }}
                  />
                </View>
              ))}
            </ScrollView>
          ) : null}

          {settingsSheet === 'country' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
              <TouchableOpacity
                onPress={async () => {
                  setSettingsSheet(null);
                  await detectCountryAndCurrency();
                }}
                style={[s.optionCard, { backgroundColor: th.primSoft, borderColor: th.primary, flexDirection: isAr ? 'row-reverse' : 'row' }]}
              >
                <Ionicons name={locationBusy ? 'hourglass-outline' : 'location-outline'} size={20} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.primary, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? 'تلقائي' : 'Auto'}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                    {isAr ? 'حسب الموقع' : 'From location'}
                  </Text>
                </View>
              </TouchableOpacity>
              {COUNTRIES.map(country => {
                const active = country.code === cfg.country;
                return (
                  <TouchableOpacity
                    key={country.code}
                    onPress={() => { setCfg({ country: country.code }); setSettingsSheet(null); }}
                    style={[s.optionCard, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  >
                    <Text style={{ fontSize: 20 }}>{country.flag}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                        {isAr ? country.name : country.nameEn}
                      </Text>
                      <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), marginTop: 2, textAlign: isAr ? 'right' : 'left' }}>
                        {country.code}
                      </Text>
                    </View>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          {settingsSheet === 'currency' ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.sheetScroll}>
              {CURRENCIES.map(currency => {
                const active = currency.code === cfg.currency;
                return (
                  <TouchableOpacity
                    key={currency.code}
                    onPress={() => changeBaseCurrency(currency.code)}
                    style={[s.optionCard, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}
                  >
                    <View style={[s.selectIcon, { backgroundColor: active ? th.primary : th.card }]}>
                      <Text style={{ color: active ? th.onPrimary : th.text, fontSize: 12, ...weight('900') }}>{currency.sym}</Text>
                    </View>
                    <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), flex: 1, textAlign: isAr ? 'right' : 'left' }}>
                      {currency.code}
                    </Text>
                    {active ? <Ionicons name="checkmark-circle" size={18} color={th.primary} /> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    <Modal visible={walletModalOpen} transparent animationType="slide" onRequestClose={() => setWalletModalOpen(false)}>
      <TouchableOpacity style={[s.modalOverlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={() => setWalletModalOpen(false)}>
        <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.sheetHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.addWallet}</Text>
            <TouchableOpacity onPress={() => setWalletModalOpen(false)} style={[s.iconOnly, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.text} />
            </TouchableOpacity>
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
            onChangeText={(value) => setNewWalletOpening(formatNumberInput(value))}
            keyboardType="numeric"
            placeholder={`${T.openingBalance} (${cfg.currency})`}
            placeholderTextColor={th.sub}
            style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
          />
          <TouchableOpacity onPress={createWallet} style={[s.primaryButton, { backgroundColor: th.primary }]}>
            <Text style={{ color: th.onPrimary, fontSize: 13, ...weight('900') }}>{T.addWallet}</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
    </>
  );
}

function PreviewStat({ th, label, value }) {
  return (
    <View style={[s.previewStat, { backgroundColor: th.card }]}>
      <Text style={{ color: th.primary, fontSize: 14, ...weight('900'), textAlign: 'center' }}>{value}</Text>
      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 17, ...weight('800'), textAlign: 'center' }} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function FormattedNumberField({ initialValue, onCommit, th, style }) {
  const [value, setValue] = useState(() => formatNumberInput(String(initialValue || '')));

  useEffect(() => {
    setValue(formatNumberInput(String(initialValue || '')));
  }, [initialValue]);

  return (
    <TextInput
      value={value}
      onChangeText={(next) => setValue(formatNumberInput(next))}
      onEndEditing={() => onCommit?.(parseNumberInput(value))}
      keyboardType="numeric"
      placeholder="0"
      placeholderTextColor={th.sub}
      style={style}
    />
  );
}

const s = StyleSheet.create({
  headerMeta: { alignItems: 'center', marginBottom: 18, gap: 12 },
  profileBlock: { padding: 14, gap: 14 },
  focusLabel: { fontSize: 14, lineHeight: 20, ...weight('900') },
  profileChoiceList: { gap: 8 },
  profileChoice: { minHeight: 52, alignItems: 'center', gap: 10, borderRadius: RADIUS.md, paddingHorizontal: 11, paddingVertical: 9 },
  profileChoiceLabel: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 19, ...weight('800') },
  radioOuter: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 10, height: 10, borderRadius: 5 },
  header: { alignItems: 'center', marginBottom: 18, gap: 12 },
  title: { fontSize: TYPE.title, lineHeight: 31, ...weight('900') },
  subtitle: { fontSize: 12, lineHeight: 17, ...weight('700'), marginTop: 2 },
  statusPill: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 10 },
  statusNote: { minHeight: 42, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  section: { marginBottom: 10 },
  sectionToggle: { minHeight: 52, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 14, marginBottom: 7, ...SHADOW.subtle },
  sectionMark: { width: 4, height: 16, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: 13, lineHeight: 18, ...weight('900') },
  group: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  row: { minHeight: 56, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, gap: 10, borderBottomWidth: 1 },
  rowLabel: { flex: 1, fontSize: 14, lineHeight: 20, ...weight('800') },
  trailing: { alignItems: 'center', gap: 8, flexShrink: 1 },
  segmented: { flexDirection: 'row', borderRadius: RADIUS.md, padding: 4, gap: 3, flexShrink: 1, maxWidth: '100%' },
  segmentBtn: { flex: 1, minHeight: 44, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 12, minWidth: 0, alignItems: 'center', justifyContent: 'center' },
  expanded: { padding: 14, gap: 10, borderTopWidth: 1 },
  expandedSeparated: { borderBottomWidth: 1 },
  categoryRow: { borderRadius: RADIUS.md, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  categoryInfo: { alignItems: 'center', gap: 8, flex: 1 },
  categoryIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconOnly: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  countryChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1 },
  moduleRow: { alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: RADIUS.md, paddingHorizontal: 11, paddingVertical: 9 },
  moduleInfo: { alignItems: 'center', gap: 9, flex: 1 },
  moduleIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  infoLine: { alignItems: 'center', gap: 8, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10 },
  importActions: { gap: 8 },
  importActionBtn: { flex: 1, minHeight: 42, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 7 },
  previewCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: 12, gap: 9 },
  previewHead: { alignItems: 'center', gap: 8 },
  previewGrid: { flexWrap: 'wrap', gap: 7 },
  previewStat: { width: '31.5%', minHeight: 58, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, paddingVertical: 8 },
  addPrompt: { padding: 13, borderTopWidth: 1 },
  addPromptButton: { minHeight: 48, alignItems: 'center', gap: 10, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10 },
  addPromptIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  walletRow: { alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1 },
  detailLine: { alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 34 },
  walletIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  input: { minHeight: 48, borderRadius: RADIUS.md, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, fontSize: 14, lineHeight: 19, ...weight('700') },
  textArea: { minHeight: 92, textAlignVertical: 'top' },
  miniLabel: { fontSize: 12, lineHeight: 18, ...weight('900') },
  iconRail: { gap: 8 },
  choiceChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 9, borderRadius: RADIUS.md, borderWidth: 1 },
  iconPick: { width: 40, height: 40, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  colorPick: { width: 28, height: 28, borderRadius: 14, borderWidth: 2 },
  primaryButton: { minHeight: 48, borderRadius: RADIUS.md, padding: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryButton: { minHeight: 48, borderRadius: RADIUS.md, padding: 13, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: RADIUS.md, paddingHorizontal: 4, paddingVertical: 3 },
  stepButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { width: '100%', maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, padding: 14, gap: 10 },
  sheetHeader: { alignItems: 'center', gap: 10, marginBottom: 2 },
  sheetTitle: { flex: 1, fontSize: TYPE.title, lineHeight: 28, ...weight('900') },
  sheetScroll: { gap: 10, paddingBottom: 2 },
  optionCard: { minHeight: 52, alignItems: 'center', gap: 10, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  systemChoice: { minHeight: 62, alignItems: 'center', gap: 10, borderRadius: RADIUS.md, paddingHorizontal: 12, paddingVertical: 10 },
});

