// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
// MYFI_REAL_STATE_CONSOLIDATED_UX_V5
// MYFI_SETTINGS_RUNTIME_RECOVERY_V5_0_1
// MYFI_PERFORMANCE_DATA_LAB_V5_1
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useColorScheme,
  View,
  Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { COUNTRIES, CURRENCIES } from '../lib/constants';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import ChoiceSheet from '../components/ChoiceSheet';
import { isBiometricSupported, authenticate } from '../lib/biometric';
import { exportMyfiPackage, pickMyfiPackage, unlockMyfiPackage } from '../lib/myfiFiles';
import { inspectBackupData } from '../lib/backupData';
import AccountDeleteModal from '../components/AccountDeleteModal';
import { supabase } from '../lib/supabase';
import { getAuthRedirectUrl } from '../lib/authCallback';
import {
  accountIdentityPatch,
  cleanDisplayName,
  upsertProfileIdentity,
  uploadProfileAvatar,
  removeProfileAvatar,
} from '../lib/accountIdentity';
import { getModules } from '../lib/modules';
import { RADIUS, weight } from '../lib/tokens';
import LegacySettingsScreen from './SettingsLegacyScreen';
import { PERFORMANCE_TEST_TIERS } from '../dev/performanceTestConfig';
import { PRODUCT_NAME } from '../lib/productIdentity';

const pageCopy = (lang = 'ar') => {
  const ar = lang === 'ar';
  return {
    settings: ar ? 'الإعدادات' : 'Settings',
    account: ar ? 'الحساب' : 'Account',
    accountSub: ar ? 'معلوماتك، الأمان والمزامنة' : 'Your information, security and sync',
    devices: ar ? 'الأجهزة' : 'Devices',
    devicesSub: ar ? 'الجلسات المرتبطة بحساب MYFI' : 'Sessions linked to your MYFI account',
    preferences: ar ? 'التفضيلات' : 'Preferences',
    preferencesSub: ar ? 'اللغة والمظهر' : 'Language and appearance',
    financial: ar ? 'الإعداد المالي' : 'Financial setup',
    financialSub: ar ? 'المحافظ، التصنيفات، الميزانيات والوحدات' : 'Wallets, categories, budgets and modules',
    data: ar ? 'البيانات والتخزين' : 'Data & storage',
    dataSub: ar ? 'النسخ الاحتياطي، الاستيراد والأرشيف' : 'Backup, restore and archive',
    security: ar ? 'الخصوصية والأمان' : 'Privacy & security',
    securitySub: ar ? 'قفل التطبيق وحماية بياناتك المحلية' : 'App lock and local data protection',
    advanced: ar ? 'إدارة المال والتخطيط' : 'Money & planning management',
    advancedSub: ar ? 'المحافظ والتصنيفات والميزانيات والتنبيهات وترتيب الرئيسية' : 'Wallets, categories, budgets, alerts and Home arrangement',
    cloud: ar ? 'حساب MYFI' : 'MYFI account',
    synced: ar ? 'متزامن' : 'Synced',
    syncing: ar ? 'جاري المزامنة' : 'Syncing',
    pending: ar ? 'بانتظار المزامنة' : 'Pending sync',
    needsAttention: ar ? 'تحتاج مراجعة' : 'Needs attention',
    localOnly: ar ? 'على هذا الجهاز' : 'On this device',
    syncNow: ar ? 'مزامنة الآن' : 'Sync now',
    syncStatus: ar ? 'حالة المزامنة' : 'Sync status',
    lastSync: ar ? 'آخر مزامنة' : 'Last sync',
    neverSynced: ar ? 'لم تتم بعد' : 'Not yet',
    syncDone: ar ? 'تم طلب المزامنة.' : 'Sync requested.',
    general: ar ? 'عام' : 'General',
    accountCloud: ar ? 'الحساب' : 'Account',
    money: ar ? 'المال والتخطيط' : 'Money & planning',
    privacyData: ar ? 'البيانات والحماية' : 'Data & protection',
    language: ar ? 'اللغة' : 'Language',
    appearance: ar ? 'المظهر' : 'Appearance',
    country: ar ? 'الدولة' : 'Country',
    currency: ar ? 'العملة الأساسية' : 'Base currency',
    rotation: ar ? 'تدوير الشاشة' : 'Screen rotation',
    autoRotate: ar ? 'تدوير تلقائي' : 'Auto rotate',
    fixedPortrait: ar ? 'ثابت عمودي' : 'Portrait only',
    system: ar ? 'حسب الجهاز' : 'From device',
    useDeviceSetting: ar ? 'استخدام إعداد الجهاز' : 'Use device setting',
    followsDevice: ar ? 'حسب الجهاز' : 'From device',
    light: ar ? 'فاتح' : 'Light',
    dark: ar ? 'داكن' : 'Dark',
    arabic: ar ? 'العربية' : 'Arabic',
    english: ar ? 'English' : 'English',
    myInfo: ar ? 'الملف الشخصي' : 'Profile',
    name: ar ? 'الاسم' : 'Name',
    namePlaceholder: ar ? 'اكتب اسمك' : 'Enter your name',
    email: ar ? 'البريد الإلكتروني' : 'Email',
    localProfile: ar ? 'معلوماتك' : 'Your information',
    localProfileSection: ar ? 'الحساب' : 'Account',
    localProfileDeviceSub: ar ? 'الاسم والصورة والمعلومات الأساسية' : 'Name, photo and basic information',
    profileDeviceOnlySub: ar ? 'محفوظ على هذا الجهاز' : 'Saved on this device',
    profileSyncedSub: ar ? 'متصل بحساب MYFI' : 'Connected to MYFI',
    profileTitle: ar ? 'معلوماتك' : 'Your information',
    profileSub: ar ? 'الاسم والصورة والمعلومات الأساسية' : 'Name, photo and basic information',
    myfiAccountTitle: ar ? 'حساب MYFI' : 'MYFI account',
    myfiAccountSub: ar ? 'المزامنة والاستعادة والأجهزة' : 'Sync, recovery and devices',
    cloudConnectedTitle: ar ? 'متصل بحساب MYFI' : 'Connected to MYFI',
    cloudConnectedSub: ar ? 'المزامنة والاستعادة مفعّلتان لهذا الحساب.' : 'Sync and recovery are enabled for this account.',
    cloudDisconnectedTitle: ar ? 'محفوظ على هذا الجهاز' : 'Saved on this device',
    cloudDisconnectedSub: ar ? 'اربط حساب MYFI فقط إذا أردت المزامنة والاستعادة على أجهزتك.' : 'Connect MYFI only when you want sync and recovery across devices.',
    localCloudNote: ar ? 'حساب واحد ومعلومات واحدة؛ يتغير فقط ما إذا كانت المزامنة مفعّلة أم لا.' : 'One account identity; only sync availability changes.',
    personalAccount: ar ? 'حساب شخصي' : 'Personal account',
    yourInfo: ar ? 'معلوماتك' : 'Your information',
    accountSecurity: ar ? 'الحساب والأمان' : 'Account & security',
    syncDevices: ar ? 'المزامنة والأجهزة' : 'Sync & devices',
    savedOnDevice: ar ? 'محفوظ على هذا الجهاز' : 'Saved on this device',
    connectedToMyfi: ar ? 'متصل بحساب MYFI' : 'Connected to MYFI',
    connectBenefits: ar ? 'فعّل المزامنة والاستعادة على أجهزتك' : 'Enable sync and recovery across your devices',
    connectHint: ar ? 'استخدام MYFI لا يحتاج إلى تسجيل دخول. اربط حسابك عندما تريد استعادة بياناتك أو استخدامها على جهاز آخر.' : 'MYFI works without sign-in. Connect your account when you want recovery or another device.',
    editProfile: ar ? 'تعديل المعلومات' : 'Edit information',
    save: ar ? 'حفظ التغييرات' : 'Save changes',
    cancel: ar ? 'إلغاء' : 'Cancel',
    addPhoto: ar ? 'إضافة صورة' : 'Add photo',
    changePhoto: ar ? 'تغيير الصورة' : 'Change photo',
    removePhoto: ar ? 'إزالة الصورة' : 'Remove photo',
    signInTitle: ar ? 'ربط حساب MYFI' : 'Connect MYFI account',
    connectAccount: ar ? 'ربط حساب MYFI' : 'Connect MYFI account',
    signInSub: ar ? 'سجّل الدخول أو أنشئ حساباً لتفعيل المزامنة والاستعادة.' : 'Sign in or create an account to enable sync and recovery.',
    signUpProfileHint: ar ? 'سيُحفظ اسمك وصورتك ضمن حسابك ليظهرا على أجهزتك.' : 'Your name and photo will be saved with your account and appear on your devices.',
    signInProfileHint: ar ? 'بعد تسجيل الدخول ستظهر معلومات حسابك وبياناتك المتزامنة على هذا الجهاز.' : 'After sign-in, your account information and synced data will appear on this device.',
    signIn: ar ? 'تسجيل الدخول' : 'Sign in',
    signUp: ar ? 'إنشاء حساب' : 'Create account',
    password: ar ? 'كلمة المرور' : 'Password',
    forgotPassword: ar ? 'نسيت كلمة المرور' : 'Forgot password',
    signOut: ar ? 'تسجيل الخروج من هذا الجهاز' : 'Sign out on this device',
    signOutSub: ar ? 'يتم فصل جلسة MYFI فقط؛ تبقى بياناتك المالية محفوظة على هذا الجهاز.' : 'Only the MYFI cloud session is disconnected; your financial data stays on this device.',
    signOutOthers: ar ? 'تسجيل الخروج من الجلسات الأخرى' : 'Sign out other sessions',
    signOutOthersSub: ar ? 'يبقى هذا الجهاز مسجلاً بالدخول.' : 'This device stays signed in.',
    thisDevice: ar ? 'هذا الجهاز' : 'This device',
    currentSession: ar ? 'الجلسة الحالية' : 'Current session',
    otherSessions: ar ? 'الجلسات الأخرى' : 'Other sessions',
    androidDevice: ar ? 'جهاز Android' : 'Android device',
    iosDevice: ar ? 'جهاز iPhone / iPad' : 'iPhone / iPad',
    webDevice: ar ? 'جهاز الويب' : 'Web device',
    connectedNow: ar ? 'متصل الآن' : 'Connected now',
    noCloudSession: ar ? 'سجّل الدخول إلى حساب MYFI لإدارة جلساتك.' : 'Sign in to MYFI to manage your sessions.',
    localData: ar ? 'البيانات المحلية' : 'Local data',
    transactions: ar ? 'الحركات' : 'Transactions',
    wallets: ar ? 'المحافظ' : 'Wallets',
    trackers: ar ? 'المتابعات' : 'Trackers',
    records: ar ? 'السجلات' : 'Records',
    backup: ar ? 'نسخة احتياطية' : 'Backup',
    exportBackup: ar ? 'تصدير نسخة احتياطية' : 'Export backup',
    exportBackupSub: ar ? 'ملف ZIP قابل للتشفير بكلمة مرور' : 'ZIP package with optional password encryption',
    importBackup: ar ? 'استعادة نسخة احتياطية' : 'Restore backup',
    importBackupSub: ar ? 'راجع النسخة ثم استعدها بأمان' : 'Review the backup, then restore it safely',
    archive: ar ? 'الأرشيف الشهري' : 'Monthly archive',
    archiveSub: ar ? 'الوصول إلى الأشهر المؤرشفة' : 'Access archived months',
    deleteLocal: ar ? 'حذف جميع البيانات المحلية' : 'Delete all local data',
    deleteLocalSub: ar ? 'عملية حساسة ولا يمكن التراجع عنها.' : 'Sensitive action that cannot be undone.',
    protectBackup: ar ? 'حماية النسخة الاحتياطية' : 'Protect backup',
    encrypted: ar ? 'تشفير بكلمة مرور' : 'Encrypt with password',
    unencrypted: ar ? 'بدون كلمة مرور' : 'Without password',
    passwordMin: ar ? 'اكتب كلمة مرور من 6 أحرف على الأقل.' : 'Use at least 6 characters.',
    chooseFile: ar ? 'اختيار ملف ZIP' : 'Choose ZIP file',
    restoreNow: ar ? 'استعادة النسخة الآن' : 'Restore backup now',
    backupReady: ar ? 'النسخة صالحة للاستعادة' : 'Backup is ready to restore',
    backupInvalid: ar ? 'النسخة غير صالحة' : 'Backup is invalid',
    securityTitle: ar ? 'أمان التطبيق' : 'App security',
    appLock: ar ? 'قفل التطبيق بالبصمة' : 'Biometric app lock',
    appLockSub: ar ? 'يتطلب بصمة أو تعريفاً حيوياً مدعوماً من الجهاز.' : 'Uses biometrics supported by the device.',
    relock: ar ? 'إعادة القفل' : 'Relock after',
    immediately: ar ? 'فوراً' : 'Immediately',
    oneMinute: ar ? 'دقيقة' : '1 minute',
    fiveMinutes: ar ? '5 دقائق' : '5 minutes',
    fifteenMinutes: ar ? '15 دقيقة' : '15 minutes',
    privacyNote: ar ? 'بياناتك المالية تبدأ محلياً، والمزامنة السحابية اختيارية عند تسجيل الدخول.' : 'Financial data starts locally; cloud sync is optional when you sign in.',
    financialProfile: ar ? 'نوع الاستخدام' : 'Usage type',
    enabledModules: ar ? 'الوحدات المفعلة' : 'Enabled modules',
    categories: ar ? 'التصنيفات' : 'Categories',
    budgets: ar ? 'الميزانيات' : 'Budgets',
    fullFinancial: ar ? 'إدارة تفاصيل المال والتخطيط' : 'Manage money & planning details',
    fullFinancialSub: ar ? 'المحافظ والتصنيفات والميزانيات والوحدات والتنبيهات وترتيب الرئيسية.' : 'Wallets, categories, budgets, modules, alerts and Home arrangement.',
    local: ar ? 'محلي' : 'Local',
    cloudAccount: ar ? 'حساب MYFI' : 'MYFI account',
    connected: ar ? 'متصل' : 'Connected',
    notSignedIn: ar ? 'غير متصل' : 'Not connected',
    terms: ar ? 'أوافق على شروط الحساب والمزامنة' : 'I agree to account and sync terms',
    authFields: ar ? 'اكتب البريد الإلكتروني وكلمة المرور.' : 'Enter your email and password.',
    invalidEmail: ar ? 'اكتب بريداً إلكترونياً صحيحاً.' : 'Enter a valid email address.',
    passwordLength: ar ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.',
    invalidUsername: ar ? 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل ويحتوي أحرفاً إنكليزية أو أرقاماً أو _.' : 'Username must be 3+ characters using letters, numbers or _.',
    accountCreated: ar ? 'تحقق من بريدك لإكمال تفعيل الحساب.' : 'Check your email to complete account activation.',
    authFailed: ar ? 'تعذر إكمال العملية. تحقق من الاتصال والبيانات.' : 'Could not complete the request. Check your connection and details.',
    resetSent: ar ? 'أُرسلت رسالة استعادة كلمة المرور إن كان الحساب موجوداً.' : 'A password recovery email was sent if the account exists.',
    saved: ar ? 'تم الحفظ.' : 'Saved.',
    otherSessionsDone: ar ? 'تم تسجيل الخروج من الجلسات الأخرى.' : 'Other sessions were signed out.',
    noOtherSessions: ar ? 'تعذر إنهاء الجلسات الأخرى.' : 'Could not sign out other sessions.',
    support: ar ? 'المساعدة والدعم' : 'Help & support',
    helpCenter: ar ? 'مركز المساعدة' : 'Help center',
    helpCenterSub: ar ? 'الدليل، النسخ الاحتياطي، الأمان والتواصل مع الدعم' : 'Guide, backup, security and support contact',
    guideProfessionalSub: ar ? 'تعلم MYFI حسب المهمة: البداية، الحركات، المتابعات والتقارير.' : 'Learn MYFI by task: getting started, entries, trackers and reports.',
    contactCenter: ar ? 'التواصل ومركز الدعم' : 'Contact & support',
    contactCenterSub: ar ? 'قنوات الدعم، معلومات التشخيص وملاحظات المنتج' : 'Support channels, diagnostics and product feedback',
    gettingStarted: ar ? 'البدء الصحيح' : 'Getting started',
    gettingStartedSub: ar ? 'المحفظة الأولى، الرصيد المتاح وتسجيل أول حركة.' : 'Your first wallet, available balance and first entry.',
    dailyMoney: ar ? 'إدارة الحركات اليومية' : 'Daily money',
    dailyMoneySub: ar ? 'دخل، مصروف، تحويل، بحث وتصحيح السجل.' : 'Income, expense, transfer, search and ledger corrections.',
    planningGuide: ar ? 'التخطيط والمتابعات' : 'Planning & trackers',
    planningGuideSub: ar ? 'الديون، التوفير، الالتزامات والميزانيات.' : 'Debts, savings, commitments and budgets.',
    reportsGuide: ar ? 'قراءة التقارير' : 'Reading reports',
    reportsGuideSub: ar ? 'الفترة، التدفق النقدي، المقارنة وأين تذهب أموالك.' : 'Periods, cash flow, comparison and where your money goes.',
    cloudGuide: ar ? 'حساب MYFI والمزامنة' : 'MYFI account & sync',
    cloudGuideSub: ar ? 'متى تحتاج حساب MYFI وكيف تنتقل بين الأجهزة بأمان.' : 'When to use a MYFI account and how to move safely between devices.',
    supportDiagnostics: ar ? 'معلومات تساعد الدعم' : 'Support diagnostics',
    supportDiagnosticsSub: ar ? 'الإصدار، المنصة وحالة الحساب بدون كشف بياناتك المالية.' : 'Version, platform and account state without exposing financial data.',
    productFeedback: ar ? 'ملاحظة أو اقتراح' : 'Feedback or suggestion',
    productFeedbackSub: ar ? 'شارك تجربة الاستخدام أو اقترح تحسيناً للمنتج.' : 'Share a usability issue or suggest a product improvement.',
    guide: ar ? 'دليل الاستخدام' : 'User guide',
    guideSub: ar ? 'جولة مختصرة وعملية على أهم أجزاء MYFI' : 'A concise practical tour of the key MYFI areas',
    contactSupport: ar ? 'التواصل مع الدعم' : 'Contact support',
    contactSupportSub: ar ? 'المساعدة الفنية وملاحظات الاستخدام' : 'Technical help and product feedback',
    supportUnavailableTitle: ar ? 'قناة الدعم غير مهيأة' : 'Support channel is not configured',
    supportUnavailableBody: ar ? 'أضف رابط أو بريد الدعم في إعدادات بيئة MYFI ثم أعد تشغيل التطبيق.' : 'Add the MYFI support URL or email to the environment configuration and restart the app.',
    supportResources: ar ? 'موارد المساعدة' : 'Support resources',
    accountRecovery: ar ? 'الحساب والمزامنة' : 'Account & sync',
    accountRecoverySub: ar ? 'حساب MYFI، المزامنة والأجهزة' : 'MYFI account, sync and devices',
    backupHelp: ar ? 'النسخ الاحتياطي والاستعادة' : 'Backup & restore',
    backupHelpSub: ar ? 'حفظ نسخة محلية واستعادتها بأمان' : 'Create and restore a local backup safely',
    securityHelp: ar ? 'الخصوصية والأمان' : 'Privacy & security',
    securityHelpSub: ar ? 'قفل التطبيق وحماية البيانات المحلية' : 'App lock and local data protection',
    legal: ar ? 'القانوني والخصوصية' : 'Legal & privacy',
    termsOfUse: ar ? 'شروط الاستخدام' : 'Terms of use',
    about: ar ? 'حول MYFI' : 'About MYFI',
    aboutSub: ar ? 'هوية المنتج، الإصدار ومبادئ الخصوصية' : 'Product identity, version and privacy principles',
    aboutTagline: ar ? 'إدارة مالية شخصية أوضح، عملية ومحلية أولاً.' : 'Clear, practical, local-first personal finance.',
    aboutPurpose: ar ? 'MYFI يجمع الدخل والمصروفات والمحافظ والمتابعات والتقارير في مساحة مالية واحدة، مع مزامنة سحابية اختيارية.' : 'MYFI brings income, spending, wallets, trackers and reports into one financial workspace, with optional cloud sync.',
    localFirstPrinciple: ar ? 'Local-first' : 'Local-first',
    localFirstPrincipleSub: ar ? 'بياناتك تبدأ على جهازك، واستخدام MYFI لا يتطلب حساباً.' : 'Your data starts on your device; MYFI does not require an account.',
    cloudPrinciple: ar ? 'حساب MYFI اختياري' : 'MYFI account is optional',
    cloudPrincipleSub: ar ? 'تربطه فقط عندما تريد المزامنة أو الاسترجاع بين الأجهزة.' : 'Connect it only when you want sync or recovery across devices.',
    bilingualPrinciple: ar ? 'عربي وإنكليزي' : 'Arabic & English',
    bilingualPrincipleSub: ar ? 'واجهة ثنائية اللغة مع دعم اتجاه RTL وLTR.' : 'Bilingual interface with RTL and LTR support.',
    versionLabel: ar ? 'الإصدار' : 'Version',
    privacy: ar ? 'سياسة الخصوصية' : 'Privacy policy',
    dangerZone: ar ? 'إدارة الحساب' : 'Account management',
    deleteAccount: ar ? 'حذف حساب MYFI نهائياً' : 'Permanently delete MYFI account',
    deleteAccountSub: ar ? 'يحذف الحساب والبيانات السحابية، وتبقى بياناتك المالية محفوظة على هذا الجهاز.' : 'Deletes the account and cloud data while keeping your financial data on this device.',
    deleteAccountTitle: ar ? 'حذف الحساب؟' : 'Delete account?',
    deleteAccountConfirm: ar ? 'سيُحذف حساب MYFI وبياناته السحابية نهائياً. ستبقى بياناتك المالية على هذا الجهاز، وستتوقف المزامنة السحابية.' : 'Your MYFI account and cloud data will be permanently deleted. Your financial data will remain on this device and cloud sync will stop.',
    back: ar ? 'رجوع' : 'Back',
    continueAction: ar ? 'متابعة' : 'Continue',
    deleteAccountDone: ar ? 'تم حذف الحساب. بياناتك المالية ما زالت محفوظة على هذا الجهاز.' : 'Account deleted. Your financial data is still stored on this device.',
    deleteAccountFailed: ar ? 'تعذر حذف الحساب' : 'Could not delete account',
    wrongPassword: ar ? 'كلمة المرور غير صحيحة.' : 'Incorrect password.',
    accountServiceIssue: ar ? 'تحقق من الاتصال وخدمة الحساب ثم حاول مرة أخرى.' : 'Check your connection and account service, then try again.',
    localPreservationFailed: ar ? 'تعذر تجهيز نسخة محلية آمنة. لم يتم حذف الحساب.' : 'A safe local copy could not be prepared. The account was not deleted.',
  };
};

const formatSyncTime = (value, lang = 'ar') => {
  if (!value) return lang === 'ar' ? 'لم تتم بعد' : 'Not yet';
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en', {
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return String(value);
  }
};

const openExternal = async (url, unavailableTitle, unavailableBody) => {
  if (!url) {
    Alert.alert(unavailableTitle, unavailableBody);
    return false;
  }
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('unsupported_url');
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert(unavailableTitle, unavailableBody);
    return false;
  }
};

const editableIdentityName = ({ user, cfg } = {}) => {
  const storedName = cleanDisplayName(cfg?.displayName || cfg?.name);
  const localName = /^(المستخدم|user)$/i.test(storedName) ? '' : storedName;
  const metadata = user?.user_metadata || {};
  return localName || cleanDisplayName(metadata.full_name || metadata.name || metadata.displayName) || '';
};

export default function SettingsScreen({ onOpenArchive, tabs = [], resetSignal = 0, openRequest = null }) {
  const {
    cfg,
    setCfg,
    user,
    setUser,
    disconnectCloudSession,
    resetAll,
    syncing,
    online,
    lastSyncError,
    lastSyncedAt,
    dirty,
    trans,
    wallets,
    debts,
    goals,
    commitments,
    cats,
    exportBackup,
    importBackup,
    syncCloud,
    enterDemoMode,
    exitDemoMode,
    prepareLocalWorkspaceForAccountDeletion,
    rollbackLocalWorkspaceAfterAccountDeletionFailure,
    cleanupDeletedAccountLocalNamespace,
    dataHealth,
    refreshDataHealth,
    financialLedgerV7Cutover,
    financialMutationSync,
  } = useStore();

  const th = TH[cfg.theme] || TH.dark;
  const deviceColorScheme = useColorScheme();
  const deviceTheme = deviceColorScheme === 'light' ? 'light' : 'dark';
  const L = STR[cfg.lang] || STR.ar;
  const isAr = cfg.lang === 'ar';
  const T = pageCopy(cfg.lang);
  const [page, setPage] = useState('root');
  const [navStack, setNavStack] = useState([]);
  const [choice, setChoice] = useState(null);
  const [editIdentity, setEditIdentity] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [loading, setLoading] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [agreement, setAgreement] = useState(cfg.accountConsentAccepted === true);
  const [nameDraft, setNameDraft] = useState(() => editableIdentityName({ user, cfg }));
  const [backupPasswordMode, setBackupPasswordMode] = useState(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupDelivery, setBackupDelivery] = useState('share');
  const [backupExportSheet, setBackupExportSheet] = useState(null);
  const [importPackage, setImportPackage] = useState(null);
  const [fileBusy, setFileBusy] = useState(false);
  const [testDataBusy, setTestDataBusy] = useState(false);
  const emailRef = useRef('');

  const selectedCountry = COUNTRIES.find(item => item.code === cfg.country) || COUNTRIES[0];
  const selectedCurrency = CURRENCIES.find(item => item.code === cfg.currency) || CURRENCIES[0];
  const editableName = editableIdentityName({ user, cfg });
  const accountName = editableName || (isAr ? 'أضف اسمك' : 'Add your name');
  const accountEmail = user?.email || '';
  const accountInitial = editableName.trim().charAt(0).toUpperCase() || 'M';
  const modules = getModules(cfg);

  const openPage = (nextPage) => {
    if (!nextPage || nextPage === page) return;
    setNavStack(stack => [...stack, page]);
    setPage(nextPage);
  };

  const goBack = () => {
    const previous = navStack.length ? navStack[navStack.length - 1] : 'root';
    setNavStack(stack => stack.slice(0, -1));
    setPage(previous);
  };

  const resetToRoot = () => {
    setPage('root');
    setNavStack([]);
  };

  useEffect(() => {
    if (resetSignal > 0) resetToRoot();
  }, [resetSignal]);

  useEffect(() => {
    const requestedPage = String(openRequest?.page || '').trim();
    if (!requestedPage) return;
    setNavStack(requestedPage === 'root' ? [] : ['root']);
    setPage(requestedPage);
  }, [openRequest?.nonce]);

  useEffect(() => {
    setNameDraft(editableIdentityName({ user, cfg }));
    setAgreement(cfg.accountConsentAccepted === true);
  }, [cfg.displayName, cfg.accountConsentAccepted, user?.id]);

  const syncState = cfg.demoMode
    ? { icon: 'flask-outline', color: th.warn, text: isAr ? 'بيانات تجريبية' : 'Demo workspace' }
    : !user
      ? { icon: 'phone-portrait-outline', color: th.sub, text: T.localOnly }
      : syncing
        ? { icon: 'sync-outline', color: th.primary, text: T.syncing }
        : !online || lastSyncError
          ? { icon: 'cloud-offline-outline', color: th.exp, text: T.needsAttention }
          : dirty
            ? { icon: 'cloud-upload-outline', color: th.warn, text: T.pending }
            : { icon: 'cloud-done-outline', color: th.inc, text: T.synced };

  const dataCounts = useMemo(() => ({
    transactions: trans.length,
    wallets: wallets.length,
    trackers: debts.length + goals.length + commitments.length,
    categories: cats.length,
  }), [trans.length, wallets.length, debts.length, goals.length, commitments.length, cats.length]);

  const choiceConfig = useMemo(() => {
    if (choice === 'language') {
      return {
        title: T.language,
        value: cfg.langMode === 'system' ? 'system' : cfg.lang,
        options: [
          { value: 'system', label: T.useDeviceSetting, detail: `${T.followsDevice} · ${cfg.lang === 'ar' ? T.arabic : T.english}`, icon: 'phone-portrait-outline' },
          { value: 'ar', label: T.arabic, leading: 'ع' },
          { value: 'en', label: T.english, leading: 'EN' },
        ],
        onSelect: value => setCfg(value === 'system' ? { langMode: 'system' } : { langMode: 'manual', lang: value }),
      };
    }
    if (choice === 'theme') {
      return {
        title: T.appearance,
        value: cfg.themeMode === 'system' ? 'system' : cfg.theme,
        options: [
          { value: 'system', label: T.useDeviceSetting, detail: `${T.followsDevice} · ${deviceTheme === 'dark' ? T.dark : T.light}`, icon: 'phone-portrait-outline' },
          { value: 'light', label: T.light, icon: 'sunny-outline' },
          { value: 'dark', label: T.dark, icon: 'moon-outline' },
        ],
        onSelect: value => setCfg(value === 'system' ? { themeMode: 'system', theme: deviceTheme } : { themeMode: 'manual', theme: value }),
      };
    }
    if (choice === 'orientation') {
      return {
        title: T.rotation,
        value: ['system', 'auto', 'portrait'].includes(cfg.orientationMode) ? cfg.orientationMode : 'system',
        options: [
          { value: 'system', label: T.useDeviceSetting, detail: isAr ? 'يتبع إعداد قفل الدوران في الهاتف' : 'Follows the phone rotation-lock setting', icon: 'phone-portrait-outline' },
          { value: 'auto', label: T.autoRotate, detail: isAr ? 'يسمح للتطبيق بالدوران تلقائياً' : 'Allows the app to rotate automatically', icon: 'sync-outline' },
          { value: 'portrait', label: T.fixedPortrait, icon: 'lock-closed-outline' },
        ],
        onSelect: value => setCfg({ orientationMode: ['system', 'auto', 'portrait'].includes(value) ? value : 'system' }),
      };
    }
    if (choice === 'country') {
      return {
        title: T.country,
        value: selectedCountry.code,
        options: COUNTRIES.map(item => ({
          value: item.code,
          label: isAr ? item.name : item.nameEn,
          detail: `${item.code} · ${item.currency}`,
          leading: item.flag,
          raw: item,
        })),
        onSelect: async (_, option) => {
          const country = option.raw;
          if (!country) return;
          // Country is context only. Base currency is a separate ledger decision.
          await setCfg({ country: country.code });
        },
      };
    }
    if (choice === 'currency') {
      return {
        title: T.currency,
        value: selectedCurrency.code,
        options: CURRENCIES.map(item => ({
          value: item.code,
          label: item.code,
          detail: `${item.sym} · ${isAr ? item.name : item.nameEn}`,
          leading: item.sym,
        })),
        onSelect: async value => {
          const result = await setCfg({ currency: value });
          if (result?.reason === 'base_currency_locked') {
            Alert.alert(
              isAr ? 'العملة الأساسية ثابتة' : 'Base currency is locked',
              isAr
                ? `السجل يحتوي بيانات مالية، لذلك تبقى العملة الأساسية ${cfg.currency}. يمكنك إضافة محافظ بعملات أخرى بدون تغيير التاريخ.`
                : `This ledger already contains financial history, so the base currency remains ${cfg.currency}. You can still add wallets in other currencies.`,
            );
          }
        },
      };
    }
    return null;
  }, [choice, T, cfg.langMode, cfg.lang, cfg.themeMode, cfg.theme, cfg.orientationMode, deviceTheme, selectedCountry, selectedCurrency, isAr, setCfg]);

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      allowsEditing: true,
      aspect: [1, 1],
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset?.uri) return;

    if (!user?.id) {
      await setCfg({ avatarUri: asset.uri, avatarPath: '' });
      return;
    }

    setLoading(true);
    try {
      const uploaded = await uploadProfileAvatar(supabase, user.id, asset);
      await setCfg(uploaded);
    } catch (error) {
      Alert.alert('', isAr ? 'تعذر رفع الصورة.' : 'Could not upload photo.');
    } finally {
      setLoading(false);
    }
  };

  const removeAvatar = async () => {
    if (!user?.id) {
      await setCfg({ avatarUri: '', avatarPath: '' });
      return;
    }
    setLoading(true);
    try {
      const removed = await removeProfileAvatar(supabase, user.id, cfg.avatarPath);
      await setCfg(removed);
    } catch (error) {
      Alert.alert('', isAr ? 'تعذر إزالة الصورة.' : 'Could not remove photo.');
    } finally {
      setLoading(false);
    }
  };

  const saveIdentity = async () => {
    const name = cleanDisplayName(nameDraft);
    if (!name) {
      Alert.alert('', isAr ? 'اكتب الاسم.' : 'Enter a name.');
      return;
    }
    const patch = accountIdentityPatch({ displayName: name });
    if (user?.id) {
      const result = await upsertProfileIdentity(supabase, user.id, patch);
      if (result.error && !result.degraded) {
        Alert.alert('', result.error.message || T.authFailed);
        return;
      }
      const metadataResult = await supabase.auth.updateUser({
        data: { displayName: patch.displayName, full_name: patch.displayName },
      });
      if (metadataResult.error) {
        Alert.alert('', metadataResult.error.message || T.authFailed);
        return;
      }
    }
    await setCfg(patch);
    setEditIdentity(false);
    Alert.alert('', T.saved);
  };

  const handleAuth = async () => {
    const emailValue = email.trim();
    if (!emailValue || !password) {
      Alert.alert('', T.authFields);
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(emailValue)) {
      Alert.alert('', T.invalidEmail);
      return;
    }
    if (password.length < 8) {
      Alert.alert('', T.passwordLength);
      return;
    }
    if (authMode === 'signup') {
      if (!cleanDisplayName(nameDraft)) {
        Alert.alert('', isAr ? 'اكتب اسمك في الملف الشخصي أولاً.' : 'Enter your name in the profile first.');
        return;
      }
      if (!agreement) {
        Alert.alert('', T.terms);
        return;
      }
    }

    setLoading(true);
    try {
      const credentials = { email: emailValue, password };
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: getAuthRedirectUrl('confirm'),
              data: {
                displayName: cleanDisplayName(nameDraft),
                full_name: cleanDisplayName(nameDraft),
              },
            },
          });
      if (result.error) throw result.error;

      if (authMode === 'signup' && result.data?.user?.id) {
        await upsertProfileIdentity(supabase, result.data.user.id, accountIdentityPatch({ displayName: nameDraft }));
      }

      if (authMode === 'signup') {
        await setCfg(accountIdentityPatch({ displayName: nameDraft, consentAccepted: agreement }));
      }

      if (result.data?.session?.user) {
        await setUser(result.data.session.user);
        setAuthOpen(false);
      } else if (authMode === 'signup' && result.data?.user) {
        Alert.alert('', T.accountCreated);
      }
    } catch (error) {
      Alert.alert('', error?.message || T.authFailed);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    const emailValue = (user?.email || emailRef.current || email).trim();
    if (!emailValue) {
      Alert.alert('', T.invalidEmail);
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailValue, {
        redirectTo: getAuthRedirectUrl('recovery'),
      });
      if (error) throw error;
      Alert.alert('', T.resetSent);
    } catch (error) {
      Alert.alert('', error?.message || T.authFailed);
    } finally {
      setLoading(false);
    }
  };

  const signOutLocal = async () => {
    const result = await disconnectCloudSession();
    if (result?.ok === false) {
      Alert.alert('', result.reason || T.accountServiceIssue);
    }
  };

  const signOutOtherSessions = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'others' });
      if (error) throw error;
      Alert.alert('', T.otherSessionsDone);
    } catch (error) {
      Alert.alert('', error?.message || T.noOtherSessions);
    }
  };

  const confirmDeleteAccount = () => {
    if (!user?.id) return;
    Alert.alert(T.deleteAccountTitle, T.deleteAccountConfirm, [
      { text: T.back, style: 'cancel' },
      { text: T.continueAction, style: 'destructive', onPress: () => setDeleteAccountOpen(true) },
    ]);
  };

  const deleteAccountPermanently = async password => {
    if (!user?.id || !user?.email || !password) return;
    setDeletingAccount(true);
    let localPreservation = null;
    let cloudDeleted = false;
    try {
      const reauth = await supabase.auth.signInWithPassword({ email: user.email, password });
      if (reauth.error) throw reauth.error;

      // Critical safety rule: prepare and verify a local-only workspace BEFORE
      // invoking permanent cloud deletion. If this step fails, the account is
      // not deleted and the user's current financial workspace remains intact.
      localPreservation = await prepareLocalWorkspaceForAccountDeletion();
      if (localPreservation?.ok !== true) throw new Error('local_account_delete_preservation_failed');

      const result = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
      if (result.error) throw result.error;
      if (result.data?.ok !== true) throw new Error(result.data?.error || 'delete_failed');
      cloudDeleted = true;

      try { await supabase.auth.signOut({ scope: 'local' }); } catch {}
      await setUser(null, { preserveWorkspaceOnLogout: false, switchToGuest: true });
      await cleanupDeletedAccountLocalNamespace(localPreservation?.accountNamespace);
      setDeleteAccountOpen(false);
      Alert.alert('', T.deleteAccountDone);
    } catch (error) {
      if (!cloudDeleted && localPreservation?.ok) {
        await rollbackLocalWorkspaceAfterAccountDeletionFailure(localPreservation?.rollbackGuestSnapshot || null);
      }
      const message = String(error?.message || error || '');
      Alert.alert(T.deleteAccountFailed, /invalid login credentials/i.test(message) ? T.wrongPassword : /local_account_delete_preservation_failed|guest_workspace_merge_failed/i.test(message) ? T.localPreservationFailed : T.accountServiceIssue);
    } finally {
      setDeletingAccount(false);
    }
  };

  const runSync = async () => {
    if (!user || syncing) return;
    try {
      await syncCloud({ reason: 'manual_settings' });
    } catch (error) {
      Alert.alert('', error?.message || T.needsAttention);
    }
  };

  const toggleBioLock = async value => {
    if (value) {
      const supported = await isBiometricSupported();
      if (!supported) {
        Alert.alert('', L.bioNotAvailable || (isAr ? 'البصمة غير متاحة على هذا الجهاز.' : 'Biometrics are not available on this device.'));
        return;
      }
      const result = await authenticate(L.bioPrompt || (isAr ? 'تحقق لفتح MYFI' : 'Authenticate to unlock MYFI'));
      if (!result.success) return;
    }
    await setCfg({ bioLock: value });
  };

  const runExport = async (secret = '', delivery = backupDelivery) => {
    if (cfg.demoMode || fileBusy) return;
    setFileBusy(true);
    try {
      await exportMyfiPackage({
        kind: 'full_backup',
        data: JSON.parse(await exportBackup()),
        label: PRODUCT_NAME,
        password: secret,
        delivery,
      });
    } catch (error) {
      Alert.alert('', error?.message || T.authFailed);
    } finally {
      setFileBusy(false);
    }
  };

  const chooseBackupProtection = (delivery) => {
    setBackupDelivery(delivery);
    setBackupExportSheet('protection');
  };

  const handleExport = () => {
    setBackupExportSheet('delivery');
  };

  const exportWithoutPassword = async () => {
    const delivery = backupDelivery;
    setBackupExportSheet(null);
    await runExport('', delivery);
  };

  const exportWithPassword = () => {
    setBackupExportSheet(null);
    setBackupPassword('');
    setBackupPasswordMode('export');
  };

  const selectImport = async () => {
    if (fileBusy) return;
    setFileBusy(true);
    try {
      const picked = await pickMyfiPackage({ kind: 'full_backup' });
      if (!picked) return;
      setImportPackage(picked);
      if (picked.passwordRequired) {
        setBackupPassword('');
        setBackupPasswordMode('import');
      }
    } catch (error) {
      setImportPackage(null);
      Alert.alert('', error?.message || T.backupInvalid);
    } finally {
      setFileBusy(false);
    }
  };

  const submitBackupPassword = async () => {
    if (backupPasswordMode === 'export') {
      if (backupPassword.length < 6) {
        Alert.alert('', T.passwordMin);
        return;
      }
      const secret = backupPassword;
      setBackupPassword('');
      setBackupPasswordMode(null);
      await runExport(secret, backupDelivery);
      return;
    }
    if (backupPasswordMode === 'import' && importPackage) {
      setFileBusy(true);
      try {
        const unlocked = await unlockMyfiPackage(importPackage, backupPassword, 'full_backup');
        setImportPackage(unlocked);
        setBackupPassword('');
        setBackupPasswordMode(null);
      } catch (error) {
        Alert.alert('', error?.message || T.backupInvalid);
      } finally {
        setFileBusy(false);
      }
    }
  };

  const importPreview = useMemo(() => {
    if (!importPackage?.payload?.data) return null;
    try {
      return inspectBackupData(importPackage.payload.data);
    } catch {
      return { valid: false, errors: ['invalid'] };
    }
  }, [importPackage]);

  const restoreImport = async () => {
    if (!importPackage?.payload?.data || !importPreview?.valid) return;
    Alert.alert(
      T.importBackup,
      isAr
        ? 'سيُنشئ MYFI نقطة رجوع آمنة، ثم يستعيد محتوى النسخة. ملف النسخة نفسه لن يُحذف.'
        : 'MYFI will create a safe rollback point, then restore this backup. The backup file itself is not deleted.',
      [
      { text: T.cancel, style: 'cancel' },
      {
        text: isAr ? 'استعادة النسخة الآن' : 'Restore backup now',
        onPress: async () => {
          const ok = await importBackup(JSON.stringify(importPackage.payload.data));
          Alert.alert('', ok ? T.saved : T.backupInvalid);
          if (ok) setImportPackage(null);
        },
      },
      ],
    );
  };

  const activatePerformanceTier = tier => {
    if (!tier || testDataBusy) return;
    const isLarge = Number(tier.transactions) >= 10000;
    const active = cfg.demoMode && cfg.performanceTestTier === tier.id;
    const body = isAr
      ? `سيتم فتح مساحة اختبار منفصلة تحتوي ${Number(tier.transactions).toLocaleString('en-US')} حركة موزعة على ${tier.months} شهراً (${Math.round(tier.months / 12)} سنوات تقريباً). بياناتك الحقيقية تبقى محفوظة ومشفرة ولا تختلط ببيانات الاختبار ولا تتم مزامنة بيانات الاختبار.${isLarge ? '\n\nهذا المستوى ثقيل وقد يحتاج عدة ثوانٍ على الهاتف، لكنه سيبقى فعالاً حتى تختار العودة إلى بياناتك.' : ''}`
      : `An isolated test workspace with ${Number(tier.transactions).toLocaleString('en-US')} transactions across ${tier.months} months (about ${Math.round(tier.months / 12)} years) will be loaded. Your real data stays encrypted and separate, and test data is never synced.${isLarge ? '\n\nThis is a heavy tier and may take several seconds on a phone, but it remains active until you return to your real data.' : ''}`;
    Alert.alert(
      isAr ? `بيانات اختبار · ${Number(tier.transactions).toLocaleString('en-US')} حركة` : `Test data · ${Number(tier.transactions).toLocaleString('en-US')} transactions`,
      body,
      [
        { text: T.cancel, style: 'cancel' },
        {
          text: active ? (isAr ? 'إعادة إنشاء' : 'Regenerate') : (isAr ? 'فتح الاختبار' : 'Open test'),
          onPress: async () => {
            setTestDataBusy(true);
            try {
              const ok = await enterDemoMode(tier.id);
              if (!ok) Alert.alert('', isAr ? 'تعذر فتح بيانات الاختبار.' : 'Could not open test data.');
            } catch (error) {
              Alert.alert('', String(error?.message || (isAr ? 'تعذر فتح بيانات الاختبار.' : 'Could not open test data.')));
            } finally {
              setTestDataBusy(false);
            }
          },
        },
      ],
    );
  };

  const leavePerformanceData = () => {
    if (!cfg.demoMode || testDataBusy) return;
    Alert.alert(
      isAr ? 'العودة إلى بياناتي' : 'Return to my data',
      isAr ? 'سيتم حذف مساحة الاختبار فقط وإعادة بياناتك الحقيقية كما كانت.' : 'Only the test workspace will be removed and your real data will be restored as it was.',
      [
        { text: T.cancel, style: 'cancel' },
        {
          text: isAr ? 'العودة إلى بياناتي' : 'Return to my data',
          onPress: async () => {
            setTestDataBusy(true);
            try {
              const ok = await exitDemoMode();
              if (!ok) Alert.alert('', isAr ? 'تعذر استعادة مساحة البيانات الحقيقية.' : 'Could not restore the real workspace.');
            } finally {
              setTestDataBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmReset = () => {
    if (cfg.demoMode) {
      leavePerformanceData();
      return;
    }
    Alert.alert(T.deleteLocal, T.deleteLocalSub, [
      { text: T.cancel, style: 'cancel' },
      { text: isAr ? 'حذف' : 'Delete', style: 'destructive', onPress: resetAll },
    ]);
  };

  const screenTitle = page === 'account' ? T.account
    : page === 'devices' ? T.devices
      : page === 'financial' ? T.financial
        : page === 'data' ? T.data
          : page === 'security' ? T.security
            : page === 'support' ? T.helpCenter
              : page === 'guide' ? T.guide
                : page === 'contact' ? T.contactCenter
                  : page === 'about' ? T.about
                    : T.settings;

  const root = page === 'root';

  return (
    <>
      <ScrollView
        style={{ flex: 1, backgroundColor: th.bg }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={s.scrollContent}
      >
        {root ? (
          <View style={s.rootHead}>
            <Text style={[s.brandEyebrow, { color: th.primary, textAlign: isAr ? 'right' : 'left' }]}>MYFI</Text>
            <Text style={[s.rootTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{screenTitle}</Text>
          </View>
        ) : (
          <PageHeader
            th={th}
            isAr={isAr}
            title={screenTitle}
            onBack={goBack}
          />
        )}

        {root ? (
          <RootSettings
            th={th}
            isAr={isAr}
            T={T}
            user={user}
            cfg={cfg}
            accountName={accountName}
            accountEmail={accountEmail}
            accountInitial={accountInitial}
            syncState={syncState}
            selectedCountry={selectedCountry}
            selectedCurrency={selectedCurrency}
            onChoice={setChoice}
            onOpen={openPage}
            onAdvanced={() => openPage('financial')}
          />
        ) : null}

        {page === 'account' ? (
          <AccountPage
            th={th}
            isAr={isAr}
            T={T}
            user={user}
            cfg={cfg}
            accountName={accountName}
            accountEmail={accountEmail}
            accountInitial={accountInitial}
            syncState={syncState}
            lastSyncedAt={lastSyncedAt}
            editIdentity={editIdentity}
            setEditIdentity={setEditIdentity}
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            onSaveIdentity={saveIdentity}
            onPickAvatar={pickAvatar}
            onRemoveAvatar={removeAvatar}
            onOpenAuth={() => setAuthOpen(true)}
            onSync={runSync}
            onDevices={() => openPage('devices')}
            onPasswordReset={handlePasswordReset}
            onSignOut={signOutLocal}
            onDeleteAccount={confirmDeleteAccount}
          />
        ) : null}

        {page === 'devices' ? (
          <DevicesPage
            th={th}
            isAr={isAr}
            T={T}
            user={user}
            syncState={syncState}
            lastSyncedAt={lastSyncedAt}
            onSignOutOthers={signOutOtherSessions}
            onSignOut={signOutLocal}
          />
        ) : null}

        {page === 'financial' ? (
          <FinancialPage
            th={th}
            isAr={isAr}
            T={T}
            cfg={cfg}
            modules={modules}
            counts={dataCounts}
            tabs={tabs}
          />
        ) : null}

        {page === 'support' ? (
          <SupportPage
            th={th}
            isAr={isAr}
            T={T}
            onOpenGuide={() => openPage('guide')}
            onOpenContact={() => openPage('contact')}
            onOpenAccount={() => openPage('account')}
            onOpenData={() => openPage('data')}
            onOpenSecurity={() => openPage('security')}
          />
        ) : null}

        {page === 'guide' ? (
          <GuidePage
            th={th}
            isAr={isAr}
            T={T}
            onOpenFinancial={() => openPage('financial')}
            onOpenAccount={() => openPage('account')}
            onOpenReports={() => {}}
          />
        ) : null}

        {page === 'contact' ? (
          <ContactPage th={th} isAr={isAr} T={T} user={user} />
        ) : null}

        {page === 'about' ? (
          <AboutPage th={th} isAr={isAr} T={T} />
        ) : null}

        {page === 'data' ? (
          <DataPage
            th={th}
            isAr={isAr}
            T={T}
            counts={dataCounts}
            fileBusy={fileBusy}
            importPackage={importPackage}
            importPreview={importPreview}
            onArchive={onOpenArchive}
            onExport={handleExport}
            onPickImport={selectImport}
            onRestore={restoreImport}
            onClearImport={() => setImportPackage(null)}
            onReset={confirmReset}
            cfg={cfg}
            testDataBusy={testDataBusy}
            onActivateTestTier={activatePerformanceTier}
            onExitTestData={leavePerformanceData}
            dataHealth={dataHealth}
            onRefreshDataHealth={refreshDataHealth}
            financialLedgerV7Cutover={financialLedgerV7Cutover}
            financialMutationSync={financialMutationSync}
          />
        ) : null}

        {page === 'security' ? (
          <SecurityPage
            th={th}
            isAr={isAr}
            T={T}
            cfg={cfg}
            setCfg={setCfg}
            onToggleBio={toggleBioLock}
          />
        ) : null}

      </ScrollView>

      <ChoiceSheet
        visible={!!choiceConfig}
        title={choiceConfig?.title || ''}
        options={choiceConfig?.options || []}
        value={choiceConfig?.value}
        onSelect={choiceConfig?.onSelect}
        onClose={() => setChoice(null)}
        th={th}
        lang={cfg.lang}
      />

      <AuthModal
        visible={authOpen}
        onClose={() => setAuthOpen(false)}
        th={th}
        isAr={isAr}
        T={T}
        authMode={authMode}
        setAuthMode={setAuthMode}
        loading={loading}
        nameDraft={nameDraft}
        setNameDraft={setNameDraft}
        email={email}
        setEmail={value => { setEmail(value); emailRef.current = value; }}
        password={password}
        setPassword={setPassword}
        passwordVisible={passwordVisible}
        setPasswordVisible={setPasswordVisible}
        agreement={agreement}
        profileName={editableName}
        setAgreement={setAgreement}
        onSubmit={handleAuth}
        onReset={handlePasswordReset}
      />

      <BackupExportSheet
        visible={!!backupExportSheet}
        step={backupExportSheet}
        th={th}
        isAr={isAr}
        T={T}
        delivery={backupDelivery}
        busy={fileBusy}
        onClose={() => setBackupExportSheet(null)}
        onSelectDelivery={chooseBackupProtection}
        onPlain={exportWithoutPassword}
        onEncrypted={exportWithPassword}
      />

      <PasswordModal
        visible={!!backupPasswordMode}
        th={th}
        isAr={isAr}
        T={T}
        mode={backupPasswordMode}
        value={backupPassword}
        setValue={setBackupPassword}
        busy={fileBusy}
        onClose={() => setBackupPasswordMode(null)}
        onSubmit={submitBackupPassword}
      />

      <AccountDeleteModal
        visible={deleteAccountOpen}
        loading={deletingAccount}
        onClose={() => setDeleteAccountOpen(false)}
        onConfirm={deleteAccountPermanently}
        lang={cfg.lang}
        th={th}
      />
    </>
  );
}

function RootSettings({ th, isAr, T, user, cfg, accountName, accountEmail, accountInitial, syncState, selectedCountry, selectedCurrency, onChoice, onOpen, onAdvanced }) {
  const languageValue = cfg.lang === 'ar' ? T.arabic : T.english;
  const themeValue = cfg.theme === 'dark' ? T.dark : T.light;
  const languageNote = cfg.langMode === 'system' ? T.followsDevice : null;
  const themeNote = cfg.themeMode === 'system' ? T.followsDevice : null;
  const rotationValue = cfg.orientationMode === 'system'
    ? T.useDeviceSetting
    : cfg.orientationMode === 'auto' ? T.autoRotate : T.fixedPortrait;
  const rotationNote = cfg.orientationMode === 'system' ? T.followsDevice : null;
  return (
    <>
      <SectionLabel th={th} isAr={isAr} text={T.accountCloud} />
      <TouchableOpacity onPress={() => onOpen('account')} activeOpacity={0.76} style={[s.accountCard, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <Avatar th={th} cfg={cfg} initial={accountInitial} size={58} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={[s.accountCardName, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{accountName}</Text>
          <Text numberOfLines={1} style={[s.accountCardEmail, { color: th.sub, textAlign: isAr ? 'right' : 'left', writingDirection: user ? 'ltr' : undefined }]}>
            {user ? (accountEmail || T.connectedToMyfi) : T.savedOnDevice}
          </Text>
          {user ? (
            <View style={[s.syncInline, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <Ionicons name={syncState.icon} size={13} color={syncState.color} />
              <Text style={[s.syncInlineText, { color: syncState.color }]}>{syncState.text}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.faint} />
      </TouchableOpacity>

      <SectionLabel th={th} isAr={isAr} text={T.general} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="language-outline" title={T.language} subtitle={languageNote} value={languageValue} onPress={() => onChoice('language')} />
        <MenuRow th={th} isAr={isAr} icon="color-palette-outline" title={T.appearance} subtitle={themeNote} value={themeValue} onPress={() => onChoice('theme')} />
        <MenuRow th={th} isAr={isAr} icon="phone-portrait-outline" title={T.rotation} subtitle={rotationNote} value={rotationValue} onPress={() => onChoice('orientation')} />
        <MenuRow th={th} isAr={isAr} icon="flag-outline" title={T.country} value={`${selectedCountry.flag} ${isAr ? selectedCountry.name : selectedCountry.nameEn}`} onPress={() => onChoice('country')} />
        <MenuRow th={th} isAr={isAr} icon="cash-outline" title={T.currency} value={`${selectedCurrency.code} · ${selectedCurrency.sym}`} onPress={() => onChoice('currency')} last />
      </MenuGroup>

      <SectionLabel th={th} isAr={isAr} text={T.money} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="wallet-outline" title={T.financial} subtitle={T.financialSub} onPress={onAdvanced} last />
      </MenuGroup>

      <SectionLabel th={th} isAr={isAr} text={T.privacyData} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="server-outline" title={T.data} subtitle={T.dataSub} onPress={() => onOpen('data')} />
        <MenuRow th={th} isAr={isAr} icon="shield-checkmark-outline" title={T.security} subtitle={T.securitySub} onPress={() => onOpen('security')} last />
      </MenuGroup>

      <SectionLabel th={th} isAr={isAr} text={T.support} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="book-outline" title={T.guide} subtitle={T.guideProfessionalSub} onPress={() => onOpen('guide')} />
        <MenuRow th={th} isAr={isAr} icon="help-buoy-outline" title={T.helpCenter} subtitle={T.helpCenterSub} onPress={() => onOpen('support')} />
        <MenuRow th={th} isAr={isAr} icon="information-circle-outline" title={T.about} subtitle={T.aboutSub} value={process.env.EXPO_PUBLIC_MYFI_VERSION || '1.0.0'} onPress={() => onOpen('about')} last />
      </MenuGroup>
    </>
  );
}

function AccountPage({
  th, isAr, T, user, cfg, accountName, accountEmail, accountInitial, syncState, lastSyncedAt,
  editIdentity, setEditIdentity, nameDraft, setNameDraft, onSaveIdentity, onPickAvatar, onRemoveAvatar, onOpenAuth,
  onSync, onDevices, onPasswordReset, onSignOut, onDeleteAccount,
}) {
  return (
    <>
      <View style={s.profileHero}>
        <View style={s.profileAvatarWrap}>
          <Avatar th={th} cfg={cfg} initial={accountInitial} size={84} />
          <TouchableOpacity onPress={onPickAvatar} style={[s.cameraButton, { backgroundColor: th.primary, borderColor: th.bg }]}>
            <Ionicons name="camera-outline" size={16} color={th.onPrimary} />
          </TouchableOpacity>
        </View>
        <Text style={[s.profileName, { color: th.text, textAlign: 'center' }]}>{accountName}</Text>
        {user ? (
          <Text style={[s.profileMeta, { color: th.sub, writingDirection: 'ltr', textAlign: 'center' }]}>
            {accountEmail || T.connectedToMyfi}
          </Text>
        ) : null}
        <View style={[s.accountStatusPill, { backgroundColor: user ? th.incBg : th.cardHigh, borderColor: user ? `${th.inc}45` : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.accountStatusDot, { backgroundColor: user ? th.inc : th.sub }]} />
          <Text style={[s.accountStatusText, { color: user ? th.inc : th.sub }]}>{user ? T.connectedToMyfi : T.savedOnDevice}</Text>
        </View>
        <TouchableOpacity onPress={() => setEditIdentity(!editIdentity)} style={[s.editPill, { backgroundColor: th.primSoft }]}>
          <Ionicons name="create-outline" size={14} color={th.primary} />
          <Text style={{ color: th.primary, fontSize: 12, ...weight('900') }}>{T.editProfile}</Text>
        </TouchableOpacity>
      </View>

      {editIdentity ? (
        <View style={[s.editorCard, { backgroundColor: th.card, borderColor: th.border }]}>
          <TextInput value={nameDraft} onChangeText={setNameDraft} placeholder={T.namePlaceholder} placeholderTextColor={th.faint} style={[s.input, s.profileNameInput, { backgroundColor: th.input, borderColor: th.border, color: th.text }]} />
          <View style={[s.editorActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={onSaveIdentity} style={[s.primaryAction, { backgroundColor: th.primary }]}><Text style={{ color: th.onPrimary, ...weight('900') }}>{T.save}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => setEditIdentity(false)} style={[s.secondaryAction, { backgroundColor: th.cardHigh }]}><Text style={{ color: th.text, ...weight('900') }}>{T.cancel}</Text></TouchableOpacity>
          </View>
          <View style={[s.photoActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={onPickAvatar} style={[s.textAction, { borderColor: th.border }]}><Text style={{ color: th.primary, ...weight('900') }}>{cfg.avatarUri ? T.changePhoto : T.addPhoto}</Text></TouchableOpacity>
            {cfg.avatarUri ? <TouchableOpacity onPress={onRemoveAvatar} style={[s.textAction, { borderColor: th.border }]}><Text style={{ color: th.exp, ...weight('900') }}>{T.removePhoto}</Text></TouchableOpacity> : null}
          </View>
        </View>
      ) : null}

      {!user ? (
        <TouchableOpacity onPress={onOpenAuth} activeOpacity={0.76} style={[s.connectAccountCard, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.rowIcon, { backgroundColor: th.primSoft }]}><Ionicons name="cloud-outline" size={19} color={th.primary} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.connectAccountTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.connectAccount}</Text>
            <Text style={[s.connectAccountSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.connectHint}</Text>
          </View>
          <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.faint} />
        </TouchableOpacity>
      ) : null}

      {user ? (
        <>
          <SectionLabel th={th} isAr={isAr} text={T.accountSecurity} />
          <MenuGroup th={th}>
            <InfoRow th={th} isAr={isAr} title={T.email} value={accountEmail} ltr />
            <MenuRow th={th} isAr={isAr} icon="key-outline" title={T.forgotPassword} onPress={onPasswordReset} last />
          </MenuGroup>

          <SectionLabel th={th} isAr={isAr} text={T.syncDevices} />
          <MenuGroup th={th}>
            <MenuRow th={th} isAr={isAr} icon={syncState.icon} iconColor={syncState.color} title={T.syncStatus} value={syncState.text} />
            <InfoRow th={th} isAr={isAr} title={T.lastSync} value={formatSyncTime(lastSyncedAt, isAr ? 'ar' : 'en')} />
            <MenuRow th={th} isAr={isAr} icon="phone-portrait-outline" title={T.devices} subtitle={T.devicesSub} onPress={onDevices} />
            <MenuRow th={th} isAr={isAr} icon="sync-outline" title={T.syncNow} subtitle={syncState.text} onPress={onSync} last />
          </MenuGroup>

          <SectionLabel th={th} isAr={isAr} text={T.dangerZone} />
          <MenuGroup th={th}>
            <MenuRow th={th} isAr={isAr} icon="log-out-outline" iconColor={th.exp} title={T.signOut} subtitle={T.signOutSub} danger onPress={onSignOut} />
            <MenuRow th={th} isAr={isAr} icon="trash-outline" iconColor={th.exp} title={T.deleteAccount} subtitle={T.deleteAccountSub} danger onPress={onDeleteAccount} last />
          </MenuGroup>
        </>
      ) : null}
    </>
  );
}

function DevicesPage({ th, isAr, T, user, syncState, lastSyncedAt, onSignOutOthers, onSignOut }) {
  const deviceName = Platform.OS === 'android' ? T.androidDevice : Platform.OS === 'ios' ? T.iosDevice : T.webDevice;
  return (
    <>
      <SectionLabel th={th} isAr={isAr} text={T.thisDevice} />
      <View style={[s.deviceCard, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.deviceIcon, { backgroundColor: th.primSoft }]}><Ionicons name={Platform.OS === 'web' ? 'laptop-outline' : 'phone-portrait-outline'} size={22} color={th.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.deviceTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{deviceName}</Text>
          <Text style={[s.deviceSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>MYFI · {Platform.OS}</Text>
          {user ? <Text style={[s.deviceSub, { color: th.faint, textAlign: isAr ? 'right' : 'left' }]}>{T.lastSync}: {formatSyncTime(lastSyncedAt, isAr ? 'ar' : 'en')}</Text> : null}
          <View style={[s.syncInline, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[s.liveDot, { backgroundColor: user ? th.inc : th.sub }]} />
            <Text style={[s.syncInlineText, { color: user ? th.inc : th.sub }]}>{user ? T.connectedNow : T.localOnly}</Text>
          </View>
        </View>
      </View>

      <SectionLabel th={th} isAr={isAr} text={T.otherSessions} />
      {user ? (
        <MenuGroup th={th}>
          <MenuRow th={th} isAr={isAr} icon="shield-outline" title={T.signOutOthers} subtitle={T.signOutOthersSub} danger onPress={onSignOutOthers} />
          <MenuRow th={th} isAr={isAr} icon="log-out-outline" iconColor={th.exp} title={T.signOut} subtitle={T.signOutSub} danger onPress={onSignOut} last />
        </MenuGroup>
      ) : (
        <View style={[s.noticeCard, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <Ionicons name="cloud-offline-outline" size={20} color={th.sub} />
          <Text style={[s.noticeText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.noCloudSession}</Text>
        </View>
      )}

      <View style={[s.noticeCard, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row', marginTop: 14 }]}>
        <Ionicons name={syncState.icon} size={18} color={syncState.color} />
        <Text style={[s.noticeText, { color: syncState.color, textAlign: isAr ? 'right' : 'left' }]}>{syncState.text}</Text>
      </View>
    </>
  );
}

function PreferencesPage({ th, isAr, T, cfg, onChoice }) {
  const languageValue = cfg.lang === 'ar' ? T.arabic : T.english;
  const themeValue = cfg.theme === 'dark' ? T.dark : T.light;
  const languageNote = cfg.langMode === 'system' ? T.followsDevice : null;
  const themeNote = cfg.themeMode === 'system' ? T.followsDevice : null;
  const rotationValue = cfg.orientationMode === 'system'
    ? T.useDeviceSetting
    : cfg.orientationMode === 'auto' ? T.autoRotate : T.fixedPortrait;
  const rotationNote = cfg.orientationMode === 'system' ? T.followsDevice : null;
  return (
    <>
      <SectionLabel th={th} isAr={isAr} text={T.general} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="language-outline" title={T.language} subtitle={languageNote} value={languageValue} onPress={() => onChoice('language')} />
        <MenuRow th={th} isAr={isAr} icon="color-palette-outline" title={T.appearance} subtitle={themeNote} value={themeValue} onPress={() => onChoice('theme')} />
        <MenuRow th={th} isAr={isAr} icon="phone-portrait-outline" title={T.rotation} subtitle={rotationNote} value={rotationValue} onPress={() => onChoice('orientation')} last />
      </MenuGroup>
    </>
  );
}

function FinancialPage({ th, isAr, T, cfg, modules, counts, tabs = [] }) {
  const enabledCount = Object.values(modules || {}).filter(Boolean).length;
  const profileLabel = cfg.profileType === 'business'
    ? (isAr ? 'مشروع' : 'Business')
    : cfg.profileType === 'personal_business'
      ? (isAr ? 'مزدوج' : 'Dual')
      : (isAr ? 'شخصي' : 'Personal');

  return (
    <>
      <View style={[s.financialHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.financialHeroTop, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.largeIcon, { backgroundColor: th.primSoft }]}><Ionicons name="wallet-outline" size={24} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.financialTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.financial}</Text>
            <Text style={[s.financialSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
              {isAr ? 'كل إعدادات المال في مكان واحد. افتح القسم الذي تحتاجه وعدّل خياراته مباشرة بدون التنقل بين صفحات متداخلة.' : 'All money settings live in one place. Expand the area you need and edit it directly without nested settings pages.'}
            </Text>
          </View>
        </View>
        <View style={[s.metricRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <MiniMetric th={th} label={isAr ? 'نوع الاستخدام' : 'Usage'} value={profileLabel} />
          <MiniMetric th={th} label={T.wallets} value={String(counts.wallets)} />
          <MiniMetric th={th} label={T.enabledModules} value={String(enabledCount)} />
        </View>
      </View>

      <View style={s.financialInlineWrap}>
        <LegacySettingsScreen tabs={tabs} embedded financialOnly financialSection="all" />
      </View>
    </>
  );
}

function SupportPage({ th, isAr, T, onOpenGuide, onOpenContact, onOpenAccount, onOpenData, onOpenSecurity }) {
  return (
    <>
      <View style={[s.supportHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.supportHeroIcon, { backgroundColor: th.primSoft }]}><Ionicons name="help-buoy-outline" size={28} color={th.primary} /></View>
        <Text style={[s.supportHeroTitle, { color: th.text }]}>{T.helpCenter}</Text>
        <Text style={[s.supportHeroText, { color: th.sub }]}>{isAr ? 'ابدأ من نوع المساعدة التي تحتاجها. كل خيار هنا يوصلك مباشرة إلى المكان الصحيح بدون قوائم داخل قوائم.' : 'Start with the kind of help you need. Every option takes you directly to the right place without menus inside menus.'}</Text>
      </View>

      <SectionLabel th={th} isAr={isAr} text={isAr ? 'المساعدة' : 'Help'} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="book-outline" title={T.guide} subtitle={T.guideProfessionalSub} onPress={onOpenGuide} />
        <MenuRow th={th} isAr={isAr} icon="chatbubble-ellipses-outline" title={T.contactCenter} subtitle={T.contactCenterSub} onPress={onOpenContact} last />
      </MenuGroup>

      <SectionLabel th={th} isAr={isAr} text={isAr ? 'اختصارات مفيدة' : 'Useful shortcuts'} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="person-circle-outline" title={T.accountRecovery} subtitle={T.accountRecoverySub} onPress={onOpenAccount} />
        <MenuRow th={th} isAr={isAr} icon="archive-outline" title={T.backupHelp} subtitle={T.backupHelpSub} onPress={onOpenData} />
        <MenuRow th={th} isAr={isAr} icon="shield-checkmark-outline" title={T.securityHelp} subtitle={T.securityHelpSub} onPress={onOpenSecurity} last />
      </MenuGroup>

      <View style={[s.supportNotice, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <Ionicons name="lock-closed-outline" size={18} color={th.primary} />
        <Text style={[s.supportNoticeText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'الدعم لا يحتاج كشف مبالغك أو سجل حركاتك. شارك معلومات التشخيص فقط إذا طُلبت.' : 'Support should not need your balances or transaction history. Share diagnostics only when requested.'}</Text>
      </View>
    </>
  );
}

function GuidePage({ th, isAr, T, onOpenFinancial, onOpenAccount }) {
  const [openGuide, setOpenGuide] = useState('start');
  const guides = [
    { key: 'start', icon: 'rocket-outline', title: T.gettingStarted, sub: T.gettingStartedSub, steps: isAr ? ['اختر الدولة ثم أكد العملة الأساسية بشكل مستقل قبل بدء السجل المالي.', 'بعد أول سجل مالي تبقى العملة الأساسية ثابتة للتقارير، ويمكنك إضافة محافظ بعملات أخرى.', 'كل حركة بعملة مختلفة تحفظ مبلغها وسعر صرفها التاريخي ولا تتغير بتغير سعر المحفظة لاحقاً.'] : ['Choose your country, then confirm the base currency separately before starting financial history.', 'After financial history starts, the base currency stays fixed for reporting; you can still add wallets in other currencies.', 'Each foreign-currency transaction keeps its original amount and historical exchange rate; later wallet-rate changes do not rewrite it.'] },
    { key: 'daily', icon: 'receipt-outline', title: T.dailyMoney, sub: T.dailyMoneySub, steps: isAr ? ['استخدم الإجراءات المباشرة.', 'راجع السجل للتفاصيل.', 'صحح أو كرر الحركة عند الحاجة.'] : ['Use Direct actions.', 'Use History for detail.', 'Edit or duplicate when needed.'] },
    { key: 'planning', icon: 'layers-outline', title: T.planningGuide, sub: T.planningGuideSub, steps: isAr ? ['أضف الدين أو هدف التوفير.', 'اربط الالتزام الشهري عند الحاجة.', 'راجع المتبقي والتقدم من المتابعات.'] : ['Add a debt or saving goal.', 'Link a monthly commitment when needed.', 'Review remaining amounts and progress in Trackers.'] },
    { key: 'reports', icon: 'bar-chart-outline', title: T.reportsGuide, sub: T.reportsGuideSub, steps: isAr ? ['اختر الفترة أولاً.', 'ابدأ بالتدفق النقدي وصافي الدخل.', 'استخدم المقارنة بعد توفر أكثر من فترة.'] : ['Choose the period first.', 'Start with cash flow and net income.', 'Use comparison after multiple periods exist.'] },
  ];
  return (
    <>
      <View style={[s.guideHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.supportHeroIcon, { backgroundColor: th.primSoft }]}><Ionicons name="book-outline" size={27} color={th.primary} /></View>
        <Text style={[s.supportHeroTitle, { color: th.text }]}>{T.guide}</Text>
        <Text style={[s.supportHeroText, { color: th.sub }]}>{isAr ? 'مرجع مختصر حسب المهمة. افتح الموضوع الذي تحتاجه فقط.' : 'A concise reference by task. Expand only the topic you need.'}</Text>
      </View>
      <View style={s.guideAccordionList}>
        {guides.map(item => {
          const expanded = openGuide === item.key;
          return (
            <View key={item.key} style={[s.guideCard, { backgroundColor: th.card, borderColor: th.border }]}>
              <TouchableOpacity
                onPress={() => setOpenGuide(current => current === item.key ? null : item.key)}
                activeOpacity={0.76}
                style={[s.guideCardHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}
              >
                <View style={[s.largeIcon, { backgroundColor: th.primSoft }]}><Ionicons name={item.icon} size={20} color={th.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.guideCardTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{item.title}</Text>
                  <Text style={[s.guideCardSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{item.sub}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={th.sub} />
              </TouchableOpacity>
              {expanded ? (
                <>
                  <View style={s.guideSteps}>{item.steps.map((step, i) => <View key={step} style={[s.guideStep, { flexDirection: isAr ? 'row-reverse' : 'row' }]}><View style={[s.guideStepNo, { backgroundColor: th.primSoft }]}><Text style={{ color: th.primary, ...weight('900'), fontSize: 10 }}>{i + 1}</Text></View><Text style={[s.guideStepText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{step}</Text></View>)}</View>
                  {item.key === 'start' ? <TouchableOpacity onPress={onOpenFinancial} style={[s.guideLink, { backgroundColor: th.primSoft }]}><Text style={{ color: th.primary, ...weight('900') }}>{isAr ? 'فتح الإعداد المالي' : 'Open financial setup'}</Text></TouchableOpacity> : null}
                </>
              ) : null}
            </View>
          );
        })}
      </View>
      <SectionLabel th={th} isAr={isAr} text={T.cloudGuide} />
      <MenuGroup th={th}><MenuRow th={th} isAr={isAr} icon="cloud-outline" title={T.cloudGuide} subtitle={T.cloudGuideSub} onPress={onOpenAccount} last /></MenuGroup>
    </>
  );
}

function ContactPage({ th, isAr, T, user }) {
  const supportEmail = process.env.EXPO_PUBLIC_MYFI_SUPPORT_EMAIL || '';
  const supportUrl = process.env.EXPO_PUBLIC_MYFI_SUPPORT_URL || '';
  const feedbackUrl = process.env.EXPO_PUBLIC_MYFI_FEEDBACK_URL || supportUrl;
  const privacyUrl = process.env.EXPO_PUBLIC_MYFI_PRIVACY_URL || '';
  const termsUrl = process.env.EXPO_PUBLIC_MYFI_TERMS_URL || '';
  const instagramUrl = process.env.EXPO_PUBLIC_MYFI_INSTAGRAM_URL || '';
  const facebookUrl = process.env.EXPO_PUBLIC_MYFI_FACEBOOK_URL || '';
  const version = process.env.EXPO_PUBLIC_MYFI_VERSION || '1.0.0';
  const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  const mailUrl = supportEmail ? `mailto:${supportEmail}?subject=${encodeURIComponent('MYFI Support')}&body=${encodeURIComponent(`MYFI ${version} · ${platform} · ${user ? 'MYFI account connected' : 'No MYFI account'}`)}` : '';
  return (
    <>
      <View style={[s.contactHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.supportHeroIcon, { backgroundColor: th.primSoft }]}><Ionicons name="headset-outline" size={28} color={th.primary} /></View>
        <Text style={[s.supportHeroTitle, { color: th.text }]}>{T.contactCenter}</Text>
        <Text style={[s.supportHeroText, { color: th.sub }]}>{isAr ? 'اختر القناة المناسبة. لا تُرسل نسخة احتياطية أو بيانات مالية إلا إذا كنت تعرف بالضبط لماذا تحتاجها.' : 'Choose the right channel. Do not send backups or financial data unless you know exactly why it is needed.'}</Text>
      </View>
      <SectionLabel th={th} isAr={isAr} text={isAr ? 'قنوات الدعم' : 'Support channels'} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="globe-outline" title={isAr ? 'مركز الدعم على الويب' : 'Web support center'} subtitle={supportUrl || T.contactSupportSub} onPress={() => openExternal(supportUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} />
        <MenuRow th={th} isAr={isAr} icon="mail-outline" title={isAr ? 'البريد الإلكتروني' : 'Email support'} subtitle={supportEmail || T.contactSupportSub} onPress={() => openExternal(mailUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} />
        <MenuRow th={th} isAr={isAr} icon="bulb-outline" title={T.productFeedback} subtitle={T.productFeedbackSub} onPress={() => openExternal(feedbackUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last />
      </MenuGroup>
      <SectionLabel th={th} isAr={isAr} text={T.supportDiagnostics} />
      <View style={[s.diagnosticCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <DiagnosticRow th={th} isAr={isAr} label={T.versionLabel} value={version} />
        <DiagnosticRow th={th} isAr={isAr} label={isAr ? 'المنصة' : 'Platform'} value={platform} />
        <DiagnosticRow th={th} isAr={isAr} label={T.cloudAccount} value={user ? T.connected : T.notSignedIn} last />
      </View>
      {(privacyUrl || termsUrl) ? <><SectionLabel th={th} isAr={isAr} text={T.legal} /><MenuGroup th={th}>{privacyUrl ? <MenuRow th={th} isAr={isAr} icon="document-lock-outline" title={T.privacy} onPress={() => openExternal(privacyUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last={!termsUrl} /> : null}{termsUrl ? <MenuRow th={th} isAr={isAr} icon="document-text-outline" title={T.termsOfUse} onPress={() => openExternal(termsUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last /> : null}</MenuGroup></> : null}
      {(instagramUrl || facebookUrl) ? <><SectionLabel th={th} isAr={isAr} text={isAr ? 'القنوات الرسمية' : 'Official channels'} /><MenuGroup th={th}>{instagramUrl ? <MenuRow th={th} isAr={isAr} icon="logo-instagram" title="Instagram" onPress={() => openExternal(instagramUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last={!facebookUrl} /> : null}{facebookUrl ? <MenuRow th={th} isAr={isAr} icon="logo-facebook" title="Facebook" onPress={() => openExternal(facebookUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last /> : null}</MenuGroup></> : null}
    </>
  );
}

function DiagnosticRow({ th, isAr, label, value, last = false }) {
  return <View style={[s.diagnosticRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}><Text style={[s.diagnosticLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text><Text style={[s.diagnosticValue, { color: th.text }]}>{value}</Text></View>;
}

function AboutPage({ th, isAr, T }) {
  const version = process.env.EXPO_PUBLIC_MYFI_VERSION || '1.0.0';
  const privacyUrl = process.env.EXPO_PUBLIC_MYFI_PRIVACY_URL || '';
  const termsUrl = process.env.EXPO_PUBLIC_MYFI_TERMS_URL || '';
  const platform = Platform.OS === 'ios' ? 'iOS' : Platform.OS === 'android' ? 'Android' : Platform.OS;
  return (
    <>
      <View style={[s.aboutHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.aboutLogo, { backgroundColor: th.primSoft }]}><Ionicons name="layers" size={32} color={th.primary} /></View>
        <Text style={[s.aboutBrand, { color: th.text }]}>MYFI</Text>
        <Text style={[s.aboutTagline, { color: th.sub }]}>{T.aboutTagline}</Text>
        <View style={[s.versionPill, { backgroundColor: th.cardHigh }]}><Text style={[s.versionPillText, { color: th.sub }]}>{T.versionLabel} {version} · {platform}</Text></View>
      </View>
      <View style={[s.aboutStatement, { backgroundColor: th.card, borderColor: th.border }]}><Text style={[s.aboutStatementTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'لماذا MYFI؟' : 'Why MYFI?'}</Text><Text style={[s.aboutPurpose, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.aboutPurpose}</Text></View>
      <SectionLabel th={th} isAr={isAr} text={isAr ? 'مبادئ المنتج' : 'Product principles'} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="phone-portrait-outline" title={T.localFirstPrinciple} subtitle={T.localFirstPrincipleSub} />
        <MenuRow th={th} isAr={isAr} icon="cloud-outline" title={T.cloudPrinciple} subtitle={T.cloudPrincipleSub} />
        <MenuRow th={th} isAr={isAr} icon="language-outline" title={T.bilingualPrinciple} subtitle={T.bilingualPrincipleSub} last />
      </MenuGroup>
      {(privacyUrl || termsUrl) ? <><SectionLabel th={th} isAr={isAr} text={T.legal} /><MenuGroup th={th}>{privacyUrl ? <MenuRow th={th} isAr={isAr} icon="document-lock-outline" title={T.privacy} subtitle={isAr ? 'كيف يتعامل MYFI مع بياناتك وخصوصيتك.' : 'How MYFI handles your data and privacy.'} onPress={() => openExternal(privacyUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last={!termsUrl} /> : null}{termsUrl ? <MenuRow th={th} isAr={isAr} icon="document-text-outline" title={T.termsOfUse} subtitle={isAr ? 'شروط استخدام التطبيق والخدمات المرتبطة.' : 'Terms for using the app and connected services.'} onPress={() => openExternal(termsUrl, T.supportUnavailableTitle, T.supportUnavailableBody)} last /> : null}</MenuGroup></> : null}
      <Text style={[s.aboutFooter, { color: th.faint }]}>{isAr ? 'MYFI · إدارة مالية أوضح بدون تعقيد غير ضروري' : 'MYFI · Clearer money management without unnecessary complexity'}</Text>
    </>
  );
}

function DataPage({ th, isAr, T, counts, fileBusy, importPackage, importPreview, onArchive, onExport, onPickImport, onRestore, onClearImport, onReset, cfg, testDataBusy, onActivateTestTier, onExitTestData, dataHealth, onRefreshDataHealth, financialLedgerV7Cutover, financialMutationSync }) {
  const activeTier = cfg?.demoMode ? String(cfg?.performanceTestTier || '') : '';
  return (
    <>
      {__DEV__ ? (
        <>
          <SectionLabel th={th} isAr={isAr} text={isAr ? 'مختبر بيانات الأداء' : 'Performance data lab'} />
          <View style={[s.testLabCard, { backgroundColor: th.card, borderColor: cfg?.demoMode ? th.warn : th.border }]}>
            <View style={[s.testLabHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[s.testLabIcon, { backgroundColor: cfg?.demoMode ? th.warnBg : th.primSoft }]}>
                <Ionicons name="flask-outline" size={20} color={cfg?.demoMode ? th.warn : th.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.testLabTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'بيانات ضخمة منفصلة للاختبار' : 'Isolated large test data'}</Text>
                <Text style={[s.testLabSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'لا تختلط ببياناتك الحقيقية، لا تُرفع للسحابة، ويمكن حذفها بالكامل بعد انتهاء الاختبار.' : 'Never mixes with your real data, never syncs to cloud, and can be removed completely after testing.'}</Text>
              </View>
            </View>
            <View style={[s.testTierGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              {PERFORMANCE_TEST_TIERS.map(tier => {
                const active = activeTier === tier.id;
                return (
                  <TouchableOpacity
                    key={tier.id}
                    disabled={testDataBusy}
                    onPress={() => onActivateTestTier(tier)}
                    style={[s.testTierButton, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border, opacity: testDataBusy ? 0.6 : 1 }]}
                  >
                    <Text style={[s.testTierCount, { color: active ? th.primary : th.text }]}>{Number(tier.transactions).toLocaleString('en-US')}</Text>
                    <Text style={[s.testTierLabel, { color: th.sub }]}>{isAr ? tier.labelAr : tier.labelEn}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[s.testLabFoot, { color: th.faint, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'المستويات: 200 · 1,000 · 5,000 · 10,000 · 25,000 · 50,000 حركة. كل مستوى موزع على أكثر من سنة، وأقصاها 8 سنوات، وبأنماط ثابتة وليست عشوائية.' : 'Tiers: 200 · 1,000 · 5,000 · 10,000 · 25,000 · 50,000 transactions. Every tier spans more than one year, up to 8 years, and remains deterministic rather than random.'}</Text>
            {cfg?.demoMode ? (
              <TouchableOpacity disabled={testDataBusy} onPress={onExitTestData} style={[s.testExitButton, { backgroundColor: th.warnBg, borderColor: th.warn, opacity: testDataBusy ? 0.6 : 1 }]}>
                <Ionicons name="return-down-back-outline" size={17} color={th.warn} />
                <Text style={{ color: th.warn, ...weight('900') }}>{testDataBusy ? '…' : (isAr ? 'العودة إلى بياناتي الحقيقية' : 'Return to my real data')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      ) : null}

      <SectionLabel th={th} isAr={isAr} text={T.localData} />
      <View style={[s.dataSummary, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.metricRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <MiniMetric th={th} label={T.transactions} value={String(cfg?.demoMode ? Number(cfg?.performanceTestTransactions || counts.transactions) : counts.transactions)} />
          <MiniMetric th={th} label={T.wallets} value={String(counts.wallets)} />
          <MiniMetric th={th} label={T.trackers} value={String(counts.trackers)} />
        </View>
      </View>
      {!dataHealth?.ok ? (
        <MenuGroup th={th}>
          <MenuRow
            th={th}
            isAr={isAr}
            icon="warning-outline"
            iconColor={th.warn}
            title={isAr ? 'تحتاج البيانات إلى فحص' : 'Data needs a check'}
            subtitle={isAr ? 'أعد الفحص، وإذا استمرت الملاحظة احتفظ بنسخة احتياطية.' : 'Run the check again; keep a backup if the warning remains.'}
            onPress={onRefreshDataHealth}
            last
          />
        </MenuGroup>
      ) : null}
      {cfg?.demoMode ? (
        <Text style={[s.testSafetyNote, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
          {isAr
            ? `نشط في الذاكرة الآن: ${Number(cfg?.performanceTestActiveTransactions || counts.transactions).toLocaleString('en-US')} · أرشيف SQLite: ${Number(cfg?.performanceTestArchivedTransactions || 0).toLocaleString('en-US')}`
            : `Hot in memory now: ${Number(cfg?.performanceTestActiveTransactions || counts.transactions).toLocaleString('en-US')} · SQLite archive: ${Number(cfg?.performanceTestArchivedTransactions || 0).toLocaleString('en-US')}`}
        </Text>
      ) : null}

      <SectionLabel th={th} isAr={isAr} text={T.backup} />
      <MenuGroup th={th}>
        <MenuRow th={th} isAr={isAr} icon="archive-outline" title={T.archive} subtitle={T.archiveSub} onPress={onArchive} last={!!cfg?.demoMode} />
        <MenuRow th={th} isAr={isAr} icon="download-outline" title={T.exportBackup} subtitle={cfg?.demoMode ? (isAr ? 'متاح بعد العودة إلى بياناتك الحقيقية' : 'Available after returning to your real data') : T.exportBackupSub} onPress={cfg?.demoMode ? null : onExport} />
        <MenuRow th={th} isAr={isAr} icon="cloud-upload-outline" title={T.importBackup} subtitle={cfg?.demoMode ? (isAr ? 'متاح بعد العودة إلى بياناتك الحقيقية' : 'Available after returning to your real data') : (isAr ? 'راجع النسخة ثم استعدها بأمان' : 'Review the backup, then restore it safely')} onPress={cfg?.demoMode ? null : onPickImport} last />
      </MenuGroup>
      {cfg?.demoMode ? <Text style={[s.testSafetyNote, { color: th.warn, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'التصدير والاستعادة معطلان أثناء بيانات الاختبار حتى لا تختلط ملفات الاختبار بنسخك الحقيقية.' : 'Export and restore are disabled while test data is active so test files cannot be confused with real backups.'}</Text> : null}

      {importPackage ? (
        <View style={[s.importCard, { backgroundColor: th.card, borderColor: importPreview?.valid ? th.primary : th.exp }]}>
          <View style={[s.importHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Ionicons name={importPreview?.valid ? 'checkmark-circle-outline' : 'alert-circle-outline'} size={20} color={importPreview?.valid ? th.primary : th.exp} />
            <View style={{ flex: 1 }}>
              <Text style={[s.importTitle, { color: importPreview?.valid ? th.primary : th.exp, textAlign: isAr ? 'right' : 'left' }]}>{importPreview?.valid ? T.backupReady : T.backupInvalid}</Text>
              <Text style={[s.importFile, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]} numberOfLines={1}>{importPackage.name || 'MYFI backup'}</Text>
            </View>
          </View>
          <View style={[s.editorActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity disabled={!importPreview?.valid || fileBusy} onPress={onRestore} style={[s.primaryAction, { backgroundColor: importPreview?.valid ? th.primary : th.cardHigh, opacity: importPreview?.valid ? 1 : 0.6 }]}><Text style={{ color: importPreview?.valid ? th.onPrimary : th.sub, ...weight('900') }}>{fileBusy ? '…' : (isAr ? 'استعادة النسخة الآن' : 'Restore backup now')}</Text></TouchableOpacity>
            <TouchableOpacity onPress={onClearImport} style={[s.secondaryAction, { backgroundColor: th.cardHigh }]}><Text style={{ color: th.text, ...weight('900') }}>{T.cancel}</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}

      {!cfg?.demoMode ? (
        <>
          <SectionLabel th={th} isAr={isAr} text={isAr ? 'منطقة حساسة' : 'Sensitive area'} />
          <MenuGroup th={th}>
            <MenuRow th={th} isAr={isAr} icon="trash-outline" iconColor={th.exp} title={T.deleteLocal} subtitle={T.deleteLocalSub} danger onPress={onReset} last />
          </MenuGroup>
        </>
      ) : null}
    </>
  );
}

function SecurityPage({ th, isAr, T, cfg, setCfg, onToggleBio }) {
  const delay = Number(cfg.lockDelaySeconds ?? 300);
  const delayLabel = delay === 0 ? T.immediately : delay === 60 ? T.oneMinute : delay === 900 ? T.fifteenMinutes : T.fiveMinutes;
  return (
    <>
      <View style={[s.securityHero, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.largeIcon, { backgroundColor: th.primSoft }]}><Ionicons name="shield-checkmark-outline" size={26} color={th.primary} /></View>
        <Text style={[s.securityHeroTitle, { color: th.text }]}>{T.securityTitle}</Text>
        <Text style={[s.securityHeroSub, { color: th.sub }]}>{T.privacyNote}</Text>
      </View>

      <SectionLabel th={th} isAr={isAr} text={T.securityTitle} />
      <MenuGroup th={th}>
        <SwitchRow th={th} isAr={isAr} icon="eye-off-outline" title={isAr ? 'إخفاء الأرصدة في الرئيسية' : 'Hide Home balances'} subtitle={isAr ? 'تبقى الأرقام مخفية حتى تضغط إظهار.' : 'Balances stay hidden until you tap Show.'} value={!!cfg.homeBalancesHidden} onValueChange={value => setCfg({ homeBalancesHidden: value })} />
        <SwitchRow th={th} isAr={isAr} icon="notifications-off-outline" title={isAr ? 'إخفاء تفاصيل الإشعارات' : 'Hide notification details'} subtitle={isAr ? 'يظهر تنبيه عام على شاشة القفل من دون مبالغ أو أسماء.' : 'Lock-screen alerts omit amounts and names.'} value={cfg.hideNotificationDetails !== false} onValueChange={value => setCfg({ hideNotificationDetails: value })} />
        <SwitchRow th={th} isAr={isAr} icon="finger-print-outline" title={T.appLock} subtitle={T.appLockSub} value={!!cfg.bioLock} onValueChange={onToggleBio} last={!cfg.bioLock} />
        {cfg.bioLock ? (
          <View style={[s.lockOptions, { borderTopColor: th.border }]}>
            <Text style={[s.lockLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.relock}</Text>
            <View style={[s.delayWrap, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              {[0, 60, 300, 900].map(value => {
                const active = delay === value;
                const label = value === 0 ? T.immediately : value === 60 ? T.oneMinute : value === 300 ? T.fiveMinutes : T.fifteenMinutes;
                return (
                  <TouchableOpacity key={value} onPress={() => setCfg({ lockDelaySeconds: value })} style={[s.delayChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border }]}>
                    <Text style={{ color: active ? th.primary : th.sub, fontSize: 11, ...weight('900') }}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[s.lockValue, { color: th.primary, textAlign: isAr ? 'right' : 'left' }]}>{delayLabel}</Text>
          </View>
        ) : null}
      </MenuGroup>
    </>
  );
}

function AuthModal({
  visible, onClose, th, isAr, T, authMode, setAuthMode, loading,
  nameDraft, setNameDraft, profileName,
  email, setEmail, password, setPassword, passwordVisible, setPasswordVisible,
  agreement, setAgreement, onSubmit, onReset,
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
      >
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={s.sheetHandleWrap}><View style={[s.sheetHandle, { backgroundColor: th.cardHigh }]} /></View>
          <View style={[s.sheetTitleRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[s.sheetIcon, { backgroundColor: th.primSoft }]}><Ionicons name="person-circle-outline" size={20} color={th.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.signInTitle}</Text>
              <Text style={[s.sheetSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.signInSub}</Text>
            </View>
          </View>
          <View style={[s.authTabs, { backgroundColor: th.cardHigh }]}>
            {['signin', 'signup'].map(mode => {
              const active = authMode === mode;
              return <TouchableOpacity key={mode} onPress={() => setAuthMode(mode)} style={[s.authTab, { backgroundColor: active ? th.card : 'transparent' }]}><Text style={{ color: active ? th.primary : th.sub, ...weight('900') }}>{mode === 'signin' ? T.signIn : T.signUp}</Text></TouchableOpacity>;
            })}
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
            <Text style={[s.authContextText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
              {authMode === 'signup' ? T.signUpProfileHint : T.signInProfileHint}
            </Text>
            {authMode === 'signup' && !profileName ? (
              <TextInput value={nameDraft} onChangeText={setNameDraft} placeholder={T.namePlaceholder} placeholderTextColor={th.faint} style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: isAr ? 'right' : 'left' }]} />
            ) : null}
            <TextInput value={email} onChangeText={setEmail} placeholder={T.email} placeholderTextColor={th.faint} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: 'left', writingDirection: 'ltr' }]} />
            <View style={[s.passwordField, { backgroundColor: th.input, borderColor: th.border }]}>
              <TextInput value={password} onChangeText={setPassword} placeholder={T.password} placeholderTextColor={th.faint} secureTextEntry={!passwordVisible} autoCapitalize="none" autoCorrect={false} style={[s.passwordInput, { color: th.text }]} />
              <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)} style={s.eyeButton}><Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={19} color={th.sub} /></TouchableOpacity>
            </View>
            {authMode === 'signup' ? (
              <TouchableOpacity onPress={() => setAgreement(!agreement)} style={[s.termsRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <Ionicons name={agreement ? 'checkbox' : 'square-outline'} size={20} color={agreement ? th.primary : th.sub} />
                <Text style={[s.termsText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.terms}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onSubmit} disabled={loading} style={[s.primaryWide, { backgroundColor: th.primary, opacity: loading ? 0.6 : 1 }]}><Text style={{ color: th.onPrimary, ...weight('900') }}>{loading ? '…' : authMode === 'signin' ? T.signIn : T.signUp}</Text></TouchableOpacity>
            {authMode === 'signin' ? <TouchableOpacity onPress={onReset} disabled={loading} style={s.forgotBtn}><Text style={{ color: th.primary, ...weight('900') }}>{T.forgotPassword}</Text></TouchableOpacity> : null}
          </ScrollView>
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BackupExportSheet({
  visible,
  step,
  th,
  isAr,
  T,
  delivery,
  busy,
  onClose,
  onSelectDelivery,
  onPlain,
  onEncrypted,
}) {
  const isProtection = step === 'protection';
  const saveMode = delivery === 'save';
  const title = isProtection
    ? T.protectBackup
    : T.exportBackup;
  const subtitle = isProtection
    ? (isAr
        ? 'اختر مستوى حماية الملف قبل إنشاء النسخة. الملف يبقى منطقي وقابل للاستعادة حتى لو تغيّر شكل قاعدة البيانات لاحقاً.'
        : 'Choose how this file is protected before MYFI creates the backup. The logical format stays restorable across future database changes.')
    : (isAr
        ? 'احفظ نسخة ZIP باسم MYFI داخل الهاتف أو شاركها مع مكان آمن. بياناتك لا تُرسل لأي جهة أثناء الحفظ المحلي.'
        : 'Save a MYFI ZIP backup on this phone or share it to a safe place. Local saving does not upload your data.');
  const systemNote = isProtection && saveMode
    ? (isAr
        ? 'بعد هذه الخطوة سيطلب Android اختيار مجلد والسماح بالحفظ. هذه نافذة نظامية ولا يمكن تغيير شكلها.'
        : 'Next, Android will ask you to choose a folder and allow access. That system screen cannot be styled by MYFI.')
    : null;
  const direction = isAr ? 'row-reverse' : 'row';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.exportSheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={s.sheetHandleWrap}><View style={[s.sheetHandle, { backgroundColor: th.border }]} /></View>
          <View style={[s.exportHero, { backgroundColor: th.primSoft, borderColor: th.border }]}>
            <View style={[s.exportHeroIcon, { backgroundColor: th.primary }]}>
              <Ionicons name={isProtection ? 'shield-checkmark-outline' : 'folder-open-outline'} size={24} color={th.onPrimary} />
            </View>
            <Text style={[s.exportTitle, { color: th.text, textAlign: 'center' }]}>{title}</Text>
            <Text style={[s.exportSub, { color: th.sub, textAlign: 'center' }]}>{subtitle}</Text>
          </View>

          {systemNote ? (
            <View style={[s.exportNotice, { borderColor: th.border, backgroundColor: th.cardHigh, flexDirection: direction }]}>
              <Ionicons name="phone-portrait-outline" size={18} color={th.primary} />
              <Text style={[s.exportNoticeText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{systemNote}</Text>
            </View>
          ) : null}

          {isProtection ? (
            <View style={s.exportActions}>
              <TouchableOpacity onPress={onEncrypted} disabled={busy} style={[s.exportOption, { borderColor: th.primary, backgroundColor: th.primSoft, flexDirection: direction, opacity: busy ? 0.6 : 1 }]}>
                <Ionicons name="lock-closed-outline" size={20} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.exportOptionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.encrypted}</Text>
                  <Text style={[s.exportOptionSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'أفضل للملفات التي ستنقلها أو تحفظها خارج الهاتف.' : 'Best when you will move or store the file outside this phone.'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={onPlain} disabled={busy} style={[s.exportOption, { borderColor: th.border, backgroundColor: th.cardHigh, flexDirection: direction, opacity: busy ? 0.6 : 1 }]}>
                <Ionicons name="document-outline" size={20} color={th.sub} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.exportOptionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.unencrypted}</Text>
                  <Text style={[s.exportOptionSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'مناسب لاختبار سريع أو حفظ محلي داخل مجلد آمن.' : 'Fine for a quick test or local saving in a safe folder.'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={s.exportActions}>
              <TouchableOpacity onPress={() => onSelectDelivery('save')} disabled={busy} style={[s.exportOption, { borderColor: th.primary, backgroundColor: th.primSoft, flexDirection: direction, opacity: busy ? 0.6 : 1 }]}>
                <Ionicons name="phone-portrait-outline" size={20} color={th.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.exportOptionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'حفظ في الهاتف' : 'Save to phone'}</Text>
                  <Text style={[s.exportOptionSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'ينشئ ملف MYFI داخل مجلد تختاره أنت.' : 'Create the MYFI file in a folder you choose.'}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSelectDelivery('share')} disabled={busy} style={[s.exportOption, { borderColor: th.border, backgroundColor: th.cardHigh, flexDirection: direction, opacity: busy ? 0.6 : 1 }]}>
                <Ionicons name="share-social-outline" size={20} color={th.sub} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.exportOptionTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'مشاركة' : 'Share'}</Text>
                  <Text style={[s.exportOptionSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{isAr ? 'أرسل النسخة إلى تطبيق أو مساحة تخزين تختارها.' : 'Send the backup to an app or storage location you choose.'}</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={onClose} disabled={busy} style={[s.exportCancel, { borderColor: th.border }]}>
            <Text style={{ color: th.sub, ...weight('900') }}>{T.cancel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PasswordModal({ visible, th, isAr, T, mode, value, setValue, busy, onClose, onSubmit }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[s.modalOverlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.passwordSheet, { backgroundColor: th.card, borderColor: th.border }]}>
          <Text style={[s.sheetTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{mode === 'export' ? T.encrypted : T.importBackup}</Text>
          <TextInput value={value} onChangeText={setValue} secureTextEntry placeholder={T.password} placeholderTextColor={th.faint} style={[s.input, { backgroundColor: th.input, borderColor: th.border, color: th.text, textAlign: 'left', writingDirection: 'ltr' }]} />
          <TouchableOpacity onPress={onSubmit} disabled={busy} style={[s.primaryWide, { backgroundColor: th.primary, opacity: busy ? 0.6 : 1 }]}><Text style={{ color: th.onPrimary, ...weight('900') }}>{busy ? '…' : mode === 'export' ? T.exportBackup : T.chooseFile}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function PageHeader({ th, isAr, title, onBack }) {
  return (
    <View style={[s.pageHeader, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <TouchableOpacity onPress={onBack} style={[s.backButton, { backgroundColor: th.cardHigh }]}><Ionicons name={isAr ? 'arrow-forward' : 'arrow-back'} size={20} color={th.text} /></TouchableOpacity>
      <Text style={[s.pageTitle, { color: th.text, textAlign: 'center' }]} numberOfLines={1}>{title}</Text>
      <View style={s.headerSpacer} />
    </View>
  );
}

function Avatar({ th, cfg, initial, size = 58 }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: th.primSoft }]}>
      {cfg.avatarUri ? <Image source={{ uri: cfg.avatarUri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <Text style={{ color: th.primary, fontSize: size * 0.32, ...weight('900') }}>{initial}</Text>}
    </View>
  );
}

function SectionLabel({ th, isAr, text }) {
  return <Text style={[s.sectionLabel, { color: th.primary, textAlign: isAr ? 'right' : 'left' }]}>{text}</Text>;
}

function MenuGroup({ th, children, style }) {
  return <View style={[s.menuGroup, { backgroundColor: th.card, borderColor: th.border }, style]}>{children}</View>;
}

function MenuRow({ th, isAr, icon, iconColor, title, subtitle, value, onPress, danger = false, last = false }) {
  const accent = iconColor || (danger ? th.exp : th.primary);
  const body = (
    <>
      <View style={[s.rowIcon, { backgroundColor: danger ? th.expBg : th.primSoft }]}><Ionicons name={icon} size={18} color={accent} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: danger ? th.exp : th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
        {subtitle ? <Text style={[s.rowSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={[s.rowValue, { color: th.sub, textAlign: isAr ? 'left' : 'right' }]} numberOfLines={1}>{value}</Text> : null}
      {onPress ? <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.faint} /> : null}
    </>
  );
  const rowStyle = [s.menuRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }];
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.72} style={rowStyle}>{body}</TouchableOpacity> : <View style={rowStyle}>{body}</View>;
}

function SwitchRow({ th, isAr, icon, title, subtitle, value, onValueChange, last = false }) {
  return (
    <View style={[s.menuRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <View style={[s.rowIcon, { backgroundColor: th.primSoft }]}><Ionicons name={icon} size={18} color={th.primary} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
        {subtitle ? <Text style={[s.rowSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <Switch value={!!value} onValueChange={onValueChange} trackColor={{ true: th.primary, false: th.cardHigh }} />
    </View>
  );
}

function InfoRow({ th, isAr, title, value, ltr = false, last = false }) {
  return (
    <View style={[s.infoRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <Text style={[s.infoLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
      <Text numberOfLines={2} style={[s.infoValue, { color: th.text, textAlign: ltr ? 'left' : (isAr ? 'left' : 'right'), writingDirection: ltr ? 'ltr' : undefined }]}>{value}</Text>
    </View>
  );
}

function MiniMetric({ th, label, value }) {
  return (
    <View style={[s.metricBox, { backgroundColor: th.cardHigh }]}>
      <Text style={[s.metricValue, { color: th.text }]}>{value}</Text>
      <Text style={[s.metricLabel, { color: th.sub }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 96 },
  financialInlineWrap: { marginTop: 14 },
  supportHero: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 22, alignItems: 'center' },
  supportHeroIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  supportHeroTitle: { fontSize: 20, lineHeight: 28, ...weight('900'), marginTop: 12 },
  supportHeroText: { fontSize: 11, lineHeight: 18, ...weight('700'), textAlign: 'center', maxWidth: 330, marginTop: 6 },
  aboutHero: { borderRadius: 24, borderWidth: 1, paddingHorizontal: 18, paddingVertical: 24, alignItems: 'center' },
  aboutLogo: { width: 68, height: 68, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  aboutBrand: { fontSize: 25, lineHeight: 34, ...weight('900'), marginTop: 11 },
  aboutTagline: { fontSize: 11, lineHeight: 18, ...weight('700'), textAlign: 'center', maxWidth: 330, marginTop: 4 },
  versionPill: { minHeight: 28, borderRadius: 14, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', marginTop: 11 },
  versionPillText: { fontSize: 10, lineHeight: 15, ...weight('900') },
  aboutPurpose: { fontSize: 12, lineHeight: 20, ...weight('700'), marginTop: 14, paddingHorizontal: 4 },
  rootHead: { marginBottom: 16 },
  brandEyebrow: { fontSize: 12, lineHeight: 18, letterSpacing: 1.2, ...weight('900') },
  rootTitle: { fontSize: 26, lineHeight: 35, ...weight('900'), marginTop: 2 },
  pageHeader: { minHeight: 54, alignItems: 'center', gap: 11, marginBottom: 14 },
  backButton: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { flex: 1, fontSize: 22, lineHeight: 31, ...weight('900'), textAlign: 'center' },
  headerSpacer: { width: 40 },
  advancedMenuWrap: { paddingHorizontal: 16, paddingTop: 4 },
  accountCard: { minHeight: 92, borderRadius: 20, borderWidth: 1, padding: 14, alignItems: 'center', gap: 12 },
  avatar: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  accountCardName: { fontSize: 15, lineHeight: 21, ...weight('900') },
  accountCardEmail: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  syncInline: { alignItems: 'center', gap: 5, marginTop: 5 },
  syncInlineText: { fontSize: 10, lineHeight: 15, ...weight('900') },
  sectionLabel: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 22, marginBottom: 7, paddingHorizontal: 4 },
  menuGroup: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  menuRow: { minHeight: 66, borderBottomWidth: 1, alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 10 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  rowSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  rowValue: { maxWidth: 115, fontSize: 11, lineHeight: 16, ...weight('800') },
  version: { fontSize: 10, lineHeight: 16, textAlign: 'center', marginTop: 24 },
  profileHero: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  profileAvatarWrap: { position: 'relative' },
  cameraButton: { width: 30, height: 30, borderRadius: 15, borderWidth: 3, alignItems: 'center', justifyContent: 'center', position: 'absolute', right: -2, bottom: -2 },
  profileName: { fontSize: 20, lineHeight: 28, ...weight('900'), marginTop: 11 },
  profileMeta: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 1, writingDirection: 'ltr' },
  accountStatusPill: { minHeight: 28, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, marginTop: 8, alignItems: 'center', gap: 6 },
  accountStatusDot: { width: 6, height: 6, borderRadius: 3 },
  accountStatusText: { fontSize: 10, lineHeight: 14, ...weight('900') },
  connectAccountCard: { minHeight: 78, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, alignItems: 'center', gap: 10, marginBottom: 4 },
  connectAccountTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  connectAccountSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  profileId: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 1, writingDirection: 'ltr' },
  editPill: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  editorCard: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 10, marginBottom: 2 },
  input: { minHeight: 50, borderRadius: 13, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, lineHeight: 19, ...weight('700') },
  profileNameInput: { textAlign: 'center', fontSize: 15, ...weight('900') },
  editorActions: { gap: 8 },
  primaryAction: { flex: 1.35, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaryAction: { flex: 1, minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  photoActions: { gap: 8 },
  textAction: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  infoRow: { minHeight: 58, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  infoLabel: { fontSize: 12, lineHeight: 18, ...weight('800'), flex: 0.8 },
  infoValue: { fontSize: 12, lineHeight: 18, ...weight('900'), flex: 1.2 },
  localCloudDivider: { marginTop: 14, borderRadius: 15, borderWidth: 1, padding: 12, alignItems: 'center', gap: 9 },
  localCloudDividerText: { flex: 1, fontSize: 10, lineHeight: 17, ...weight('700') },
  accountSectionNote: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 8, marginBottom: 16, paddingHorizontal: 4 },
  cloudAccountCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  cloudAccountHead: { alignItems: 'center', gap: 11 },
  cloudAccountTitle: { fontSize: 14, lineHeight: 20, ...weight('900') },
  cloudAccountEmail: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2, textAlign: 'left', writingDirection: 'ltr' },
  cloudAccountId: { fontSize: 9, lineHeight: 14, ...weight('700'), marginTop: 1, textAlign: 'left', writingDirection: 'ltr' },
  cloudAccountNote: { fontSize: 10, lineHeight: 17, ...weight('700') },
  cloudConnectButton: { minHeight: 46, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 12 },
  cloudConnectButtonText: { fontSize: 12, lineHeight: 18, ...weight('900') },
  deviceCard: { minHeight: 96, borderRadius: 18, borderWidth: 1, padding: 14, gap: 12, alignItems: 'center' },
  deviceIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  deviceTitle: { fontSize: 14, lineHeight: 20, ...weight('900') },
  deviceSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  noticeCard: { borderRadius: 16, borderWidth: 1, padding: 13, gap: 9, alignItems: 'center' },
  noticeText: { flex: 1, fontSize: 11, lineHeight: 18, ...weight('800') },
  financialHero: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 14 },
  financialHeroTop: { alignItems: 'center', gap: 11 },
  largeIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  financialTitle: { fontSize: 15, lineHeight: 21, ...weight('900') },
  financialSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  metricRow: { gap: 8 },
  metricBox: { flex: 1, minHeight: 66, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  metricValue: { fontSize: 16, lineHeight: 23, ...weight('900') },
  metricLabel: { fontSize: 9, lineHeight: 14, ...weight('800'), marginTop: 2, textAlign: 'center' },
  testLabCard: { borderRadius: 20, borderWidth: 1, padding: 14, gap: 12 },
  testLabHead: { alignItems: 'center', gap: 10 },
  testLabIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  testLabTitle: { fontSize: 14, lineHeight: 20, ...weight('900') },
  testLabSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  testTierGrid: { flexWrap: 'wrap', gap: 7 },
  testTierButton: { minWidth: 88, flexGrow: 1, flexBasis: '30%', borderWidth: 1, borderRadius: 14, paddingHorizontal: 9, paddingVertical: 10, alignItems: 'center' },
  testTierCount: { fontSize: 14, lineHeight: 19, ...weight('900') },
  testTierLabel: { fontSize: 9, lineHeight: 14, ...weight('800'), marginTop: 1 },
  testLabFoot: { fontSize: 9, lineHeight: 15, ...weight('700') },
  testExitButton: { minHeight: 42, borderRadius: 13, borderWidth: 1, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  testSafetyNote: { fontSize: 10, lineHeight: 16, ...weight('800'), marginTop: 8, paddingHorizontal: 4 },
  dataSummary: { borderRadius: 18, borderWidth: 1, padding: 12 },
  importCard: { borderRadius: 18, borderWidth: 1, padding: 13, gap: 12, marginTop: 14 },
  importHead: { gap: 9, alignItems: 'center' },
  importTitle: { fontSize: 12, lineHeight: 18, ...weight('900') },
  importFile: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  securityHero: { borderRadius: 20, borderWidth: 1, padding: 18, alignItems: 'center' },
  securityHeroTitle: { fontSize: 17, lineHeight: 24, ...weight('900'), marginTop: 10, textAlign: 'center' },
  securityHeroSub: { fontSize: 11, lineHeight: 18, ...weight('700'), marginTop: 5, textAlign: 'center', maxWidth: 310 },
  lockOptions: { borderTopWidth: 1, padding: 13 },
  lockLabel: { fontSize: 11, lineHeight: 17, ...weight('800'), marginBottom: 9 },
  delayWrap: { flexWrap: 'wrap', gap: 7 },
  delayChip: { minHeight: 36, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  lockValue: { fontSize: 10, lineHeight: 16, ...weight('900'), marginTop: 9 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12 },
  sheet: { maxHeight: '86%', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, padding: 16, paddingBottom: 24, gap: 12 },
  sheetHandleWrap: { alignItems: 'center', marginBottom: 2 },
  sheetHandle: { width: 38, height: 4, borderRadius: 2 },
  sheetTitleRow: { alignItems: 'center', gap: 10 },
  sheetIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 17, lineHeight: 24, ...weight('900') },
  sheetSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  authTabs: { minHeight: 46, borderRadius: 14, padding: 4, flexDirection: 'row', gap: 4 },
  authTab: { flex: 1, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  passwordField: { minHeight: 50, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingHorizontal: 13, paddingVertical: 10, fontSize: 13, lineHeight: 19, textAlign: 'left', writingDirection: 'ltr', ...weight('700') },
  eyeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  accountLinkNotice: { borderWidth: 1, borderRadius: 14, padding: 11, flexDirection: 'row', alignItems: 'center', gap: 10 },
  accountLinkName: { fontSize: 12, lineHeight: 17, ...weight('900'), marginBottom: 2 },
  accountLinkHint: { fontSize: 10, lineHeight: 16, ...weight('700') },
  authContextText: { fontSize: 10, lineHeight: 17, ...weight('700'), paddingHorizontal: 2, paddingVertical: 2 },
  termsRow: { alignItems: 'center', gap: 8, paddingVertical: 3 },
  termsText: { flex: 1, fontSize: 11, lineHeight: 17, ...weight('700') },
  primaryWide: { minHeight: 48, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  forgotBtn: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  passwordSheet: { width: '100%', borderRadius: 22, borderWidth: 1, padding: 16, gap: 12, marginBottom: 24 },
  exportSheet: { width: '100%', borderRadius: 24, borderWidth: 1, padding: 16, gap: 12, marginBottom: 24 },
  exportHero: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 18, alignItems: 'center' },
  exportHeroIcon: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  exportTitle: { fontSize: 18, lineHeight: 25, ...weight('900'), marginTop: 10 },
  exportSub: { fontSize: 11, lineHeight: 18, ...weight('700'), marginTop: 5, maxWidth: 330 },
  exportNotice: { borderWidth: 1, borderRadius: 15, padding: 12, alignItems: 'center', gap: 9 },
  exportNoticeText: { flex: 1, fontSize: 10, lineHeight: 16, ...weight('800') },
  exportActions: { gap: 8 },
  exportOption: { minHeight: 74, borderRadius: 16, borderWidth: 1, paddingHorizontal: 13, paddingVertical: 12, alignItems: 'center', gap: 10 },
  exportOptionTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  exportOptionSub: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  exportCancel: { minHeight: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  supportNotice: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 12, alignItems: 'flex-start', gap: 9, marginTop: 14 },
  supportNoticeText: { flex: 1, fontSize: 11, lineHeight: 18, ...weight('700') },
  guideHero: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 18, alignItems: 'center', marginBottom: 18 },
  guideCard: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 14, marginBottom: 12 },
  guideCardHead: { alignItems: 'center', gap: 10 },
  guideCardTitle: { fontSize: 14, lineHeight: 20, ...weight('900') },
  guideCardSub: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
  guideSteps: { gap: 8, marginTop: 12 },
  guideStep: { alignItems: 'center', gap: 9 },
  guideStepNo: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  guideStepText: { flex: 1, fontSize: 11, lineHeight: 17, ...weight('700') },
  guideLink: { minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  contactHero: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 18, alignItems: 'center', marginBottom: 18 },
  diagnosticCard: { borderWidth: 1, borderRadius: RADIUS.xl, overflow: 'hidden' },
  diagnosticRow: { minHeight: 52, borderBottomWidth: 1, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  diagnosticLabel: { flex: 1, fontSize: 11, ...weight('800') },
  diagnosticValue: { fontSize: 11, ...weight('900') },
  aboutStatement: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 15, marginBottom: 16 },
  aboutStatementTitle: { fontSize: 14, lineHeight: 20, ...weight('900'), marginBottom: 6 },
  aboutFooter: { textAlign: 'center', fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 18, marginBottom: 8 },

});
