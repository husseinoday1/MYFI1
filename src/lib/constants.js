export const STORAGE = {
  DATA:      'MYFI_DATA_V1',
  SETTINGS:  'MYFI_SETTINGS_V1',
  CATS:      'MYFI_CATS_V1',
  LOCAL_TS:  'MYFI_TS_V1',
  SYNC_TS:   'MYFI_SYNC_TS_V1',
  RECOVERY:  'MYFI_RECOVERY_V1',
  ROLLBACK:  'MYFI_IMPORT_ROLLBACK_V1',
  NOTIF:     'MYFI_NOTIF_V1',
  BIOMETRIC: 'MYFI_BIO_V1',
  ONBOARD:   'MYFI_ONBOARD_V1',
  FAB_POS:   'MYFI_FAB_POS_V1',
  DEMO_REAL: 'MYFI_DEMO_REAL_V1',
  DEMO_DATA: 'MYFI_DEMO_DATA_V1',
};

export const detectSystemLang = () => {
  try {
    const locale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale || '';
    return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'ar';
  }
};

export const COUNTRIES = [
  { code:'IQ', name:'العراق',   nameEn:'Iraq',         flag:'🇮🇶', currency:'IQD', sym:'د.ع', lang:'ar' },
  { code:'SA', name:'السعودية', nameEn:'Saudi Arabia', flag:'🇸🇦', currency:'SAR', sym:'ر.س', lang:'ar' },
  { code:'AE', name:'الإمارات', nameEn:'UAE',          flag:'🇦🇪', currency:'AED', sym:'د.إ', lang:'ar' },
  { code:'KW', name:'الكويت',   nameEn:'Kuwait',       flag:'🇰🇼', currency:'KWD', sym:'د.ك', lang:'ar' },
  { code:'QA', name:'قطر',      nameEn:'Qatar',        flag:'🇶🇦', currency:'QAR', sym:'ر.ق', lang:'ar' },
  { code:'BH', name:'البحرين',  nameEn:'Bahrain',      flag:'🇧🇭', currency:'BHD', sym:'د.ب', lang:'ar' },
  { code:'OM', name:'عُمان',    nameEn:'Oman',         flag:'🇴🇲', currency:'OMR', sym:'ر.ع', lang:'ar' },
  { code:'JO', name:'الأردن',   nameEn:'Jordan',       flag:'🇯🇴', currency:'JOD', sym:'د.أ', lang:'ar' },
  { code:'EG', name:'مصر',      nameEn:'Egypt',        flag:'🇪🇬', currency:'EGP', sym:'ج.م', lang:'ar' },
  { code:'MA', name:'المغرب',   nameEn:'Morocco',      flag:'🇲🇦', currency:'MAD', sym:'د.م', lang:'ar' },
  { code:'US', name:'أمريكا',   nameEn:'USA',          flag:'🇺🇸', currency:'USD', sym:'$',   lang:'en' },
  { code:'GB', name:'بريطانيا', nameEn:'UK',           flag:'🇬🇧', currency:'GBP', sym:'£',   lang:'en' },
  { code:'EU', name:'أوروبا',   nameEn:'Europe',       flag:'🇪🇺', currency:'EUR', sym:'€',   lang:'en' },
  { code:'TR', name:'تركيا',    nameEn:'Turkey',       flag:'🇹🇷', currency:'TRY', sym:'₺',   lang:'tr' },
  { code:'IN', name:'الهند',    nameEn:'India',        flag:'🇮🇳', currency:'INR', sym:'₹',   lang:'en' },
  { code:'CA', name:'كندا',     nameEn:'Canada',       flag:'🇨🇦', currency:'CAD', sym:'C$',  lang:'en' },
  { code:'AU', name:'أستراليا', nameEn:'Australia',    flag:'🇦🇺', currency:'AUD', sym:'A$',  lang:'en' },
];

export const CURRENCIES = Array.from(
  new Map(COUNTRIES.map(country => [
    country.currency,
    { code: country.currency, sym: country.sym },
  ])).values(),
);

export const getSymbol = (currency) => {
  const c = COUNTRIES.find(x => x.currency === currency);
  return c?.sym ?? currency ?? '$';
};

export const DEF_CATS = [
  { id:'food',      label:'طعام',    labelEn:'Food',          emoji:'🍔', icon:'fast-food-outline',     color:'#3ecf6e' },
  { id:'rent',      label:'إيجار',   labelEn:'Rent',          emoji:'🏠', icon:'business-outline',      color:'#38bdf8' },
  { id:'salary',    label:'راتب',    labelEn:'Salary',        emoji:'💼', icon:'briefcase-outline',     color:'#f6ad55' },
  { id:'transport', label:'مواصلات', labelEn:'Transport',     emoji:'🚗', icon:'car-outline',           color:'#94a3b8' },
  { id:'health',    label:'صحة',     labelEn:'Health',        emoji:'🏥', icon:'medkit-outline',        color:'#fc8181' },
  { id:'clothes',   label:'ملابس',   labelEn:'Clothes',       emoji:'👗', icon:'shirt-outline',         color:'#fb923c' },
  { id:'entertain', label:'ترفيه',   labelEn:'Entertainment', emoji:'🎮', icon:'game-controller-outline',color:'#a78bfa' },
  { id:'other',     label:'أخرى',    labelEn:'Other',         emoji:'📦', icon:'cube-outline',          color:'#6b7280' },
];

// أيقونات متاحة عند إنشاء تصنيف جديد بالإعدادات
export const ICON_OPTIONS = [
  'fast-food-outline', 'business-outline', 'briefcase-outline', 'car-outline',
  'medkit-outline', 'shirt-outline', 'game-controller-outline', 'cube-outline',
  'cart-outline', 'home-outline', 'school-outline', 'airplane-outline',
  'gift-outline', 'paw-outline', 'phone-portrait-outline', 'cafe-outline',
  'card-outline', 'construct-outline', 'fitness-outline', 'book-outline',
];

export const DEF_MODULES = {
  wallets: false,
  debtsOwed: true,
  debtsReceivable: false,
  goals: true,
  commitments: true,
  recurring: true,
  budgets: true,
};
export const DEF_HOME_CARDS = [
  { key: 'income', visible: true },
  { key: 'expense', visible: true },
  { key: 'net', visible: true },
  { key: 'dueSoon', visible: true },
];
export const DEF_HOME_SECTIONS = [
  { key: 'hero', visible: true },
  { key: 'wallets', visible: true },
  { key: 'upcomingRecurring', visible: true },
  { key: 'upcomingCommitments', visible: true },
  { key: 'recentTransactions', visible: true },
];
export const DEF_QUICK_ACTIONS = [
  { key: 'expense', visible: true },
  { key: 'income', visible: true },
  { key: 'transfer', visible: true },
  { key: 'newTracker', visible: true },
  { key: 'payDebt', visible: true },
  { key: 'saveGoal', visible: true },
  { key: 'payCommitment', visible: true },
];
export const DEF_START_TAB = 'home';

export const DEF_CFG = {
  theme: 'dark', themeMode: 'manual', lang: detectSystemLang(), langMode: 'system', currency: 'IQD',
  country: 'IQ', name: 'المستخدم', avatar: '🌿',
  profileType: 'personal',
  activeScope: 'personal',
  enabledModules: DEF_MODULES,
  homeCards: DEF_HOME_CARDS,
  homeSections: DEF_HOME_SECTIONS,
  quickActions: DEF_QUICK_ACTIONS,
  entryMode: 'quick',
  startTab: DEF_START_TAB,
  defaultWalletId: null,
  bioLock: false,
  categoryBudgets: {},
};

const normalizeModules = (modules = {}) =>
  Object.keys(DEF_MODULES).reduce((next, key) => ({
    ...next,
    [key]: modules[key] ?? DEF_MODULES[key],
  }), {});

const normalizeVisibilityOrder = (defaults = [], items = []) => {
  const list = Array.isArray(items) ? items : [];
  const allowed = new Set(defaults.map(item => item.key));
  const seen = new Set();
  const ordered = list
    .filter(item => item && allowed.has(item.key) && !seen.has(item.key) && seen.add(item.key))
    .map(item => ({ key: item.key, visible: item.visible !== false }));
  defaults.forEach(item => {
    if (!seen.has(item.key)) ordered.push({ ...item });
  });
  return ordered;
};

export const normalizeHomeCards = (items = []) =>
  normalizeVisibilityOrder(DEF_HOME_CARDS, items);

const normalizeVisibilityList = (defaults = [], items = []) =>
  normalizeVisibilityOrder(defaults, items);

export const normalizeCfg = (cfg = {}) => {
  const hasLangMode = Object.prototype.hasOwnProperty.call(cfg, 'langMode');
  const hasLang = Object.prototype.hasOwnProperty.call(cfg, 'lang');
  const langMode = hasLangMode ? cfg.langMode : hasLang ? 'manual' : DEF_CFG.langMode;
  const manualLang = cfg.lang === 'ar' ? 'ar' : 'en';
  const nextStartTab = ['home', 'history', 'trackers', 'reports', 'settings'].includes(cfg.startTab)
    ? cfg.startTab
    : DEF_START_TAB;
  const country = COUNTRIES.some(item => item.code === cfg.country) ? cfg.country : DEF_CFG.country;
  const currency = CURRENCIES.some(item => item.code === cfg.currency) ? cfg.currency : DEF_CFG.currency;
  const profileType = ['personal', 'personal_business', 'business'].includes(cfg.profileType)
    ? cfg.profileType
    : DEF_CFG.profileType;
  const activeScope = profileType === 'personal'
    ? 'personal'
    : profileType === 'business'
      ? 'business'
      : ['personal', 'business', 'all'].includes(cfg.activeScope) ? cfg.activeScope : 'personal';
  return {
    ...DEF_CFG,
    ...cfg,
    country,
    currency,
    profileType,
    activeScope,
    langMode,
    lang: langMode === 'system' ? detectSystemLang() : manualLang,
    themeMode: cfg.themeMode === 'system' ? 'system' : 'manual',
    theme: cfg.theme === 'light' ? 'light' : 'dark',
    categoryBudgets: Object.fromEntries(Object.entries(cfg.categoryBudgets || {}).filter(([, value]) => Number(value) > 0)),
    enabledModules: normalizeModules(cfg.enabledModules),
    homeCards: normalizeHomeCards(cfg.homeCards),
    homeSections: normalizeVisibilityList(DEF_HOME_SECTIONS, cfg.homeSections),
    quickActions: normalizeVisibilityList(DEF_QUICK_ACTIONS, cfg.quickActions),
    entryMode: cfg.entryMode === 'classic' ? 'classic' : 'quick',
    startTab: nextStartTab,
  };
};

export const DEF_NOTIF = {
  debt:   { on: true, value: 3 },
  commitment: { on: true, value: 3 },
  daily:  { on: false, value: 21 },
  low:    { on: false, value: 500000 },
};

// لوحة ألوان مختارة لإنشاء تصنيف جديد
export const CAT_COLORS = [
  '#3ecf6e', '#38bdf8', '#f6ad55', '#94a3b8', '#fc8181',
  '#fb923c', '#a78bfa', '#6b7280', '#f472b6', '#34d399',
  '#fbbf24', '#60a5fa',
];
