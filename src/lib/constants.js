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

export const LEGACY_STORAGE_KEYS = {
  data: [STORAGE.DATA, 'TERRA_DATA_V1', 'FINANCE_DATA_V1', 'MY_FINANCE_DATA_V1', 'MYFI_APP_DATA_V1'],
  settings: [STORAGE.SETTINGS, 'TERRA_SETTINGS_V1', 'FINANCE_SETTINGS_V1', 'MY_FINANCE_SETTINGS_V1', 'MYFI_APP_SETTINGS_V1'],
  cats: [STORAGE.CATS, 'TERRA_CATS_V1', 'FINANCE_CATS_V1', 'MY_FINANCE_CATS_V1', 'MYFI_APP_CATS_V1'],
  notif: [STORAGE.NOTIF, 'TERRA_NOTIF_V1', 'FINANCE_NOTIF_V1', 'MY_FINANCE_NOTIF_V1', 'MYFI_APP_NOTIF_V1'],
  recovery: [STORAGE.RECOVERY, 'TERRA_RECOVERY_V1', 'FINANCE_RECOVERY_V1', 'MY_FINANCE_RECOVERY_V1', 'MYFI_APP_RECOVERY_V1'],
};

export const detectSystemLang = () => {
  try {
    const locale = Intl?.DateTimeFormat?.().resolvedOptions?.().locale || '';
    return String(locale).toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'ar';
  }
};

export const CURRENCIES = [
  { code:'IQD', sym:'د.ع', name:'الدينار العراقي', nameEn:'Iraqi dinar', digits:3 },
  { code:'SAR', sym:'ر.س', name:'الريال السعودي', nameEn:'Saudi riyal', digits:2 },
  { code:'AED', sym:'د.إ', name:'الدرهم الإماراتي', nameEn:'UAE dirham', digits:2 },
  { code:'KWD', sym:'د.ك', name:'الدينار الكويتي', nameEn:'Kuwaiti dinar', digits:3 },
  { code:'QAR', sym:'ر.ق', name:'الريال القطري', nameEn:'Qatari riyal', digits:2 },
  { code:'BHD', sym:'د.ب', name:'الدينار البحريني', nameEn:'Bahraini dinar', digits:3 },
  { code:'OMR', sym:'ر.ع', name:'الريال العماني', nameEn:'Omani rial', digits:3 },
  { code:'JOD', sym:'د.أ', name:'الدينار الأردني', nameEn:'Jordanian dinar', digits:3 },
  { code:'EGP', sym:'ج.م', name:'الجنيه المصري', nameEn:'Egyptian pound', digits:2 },
  { code:'MAD', sym:'د.م', name:'الدرهم المغربي', nameEn:'Moroccan dirham', digits:2 },
  { code:'DZD', sym:'د.ج', name:'الدينار الجزائري', nameEn:'Algerian dinar', digits:2 },
  { code:'TND', sym:'د.ت', name:'الدينار التونسي', nameEn:'Tunisian dinar', digits:3 },
  { code:'LYD', sym:'د.ل', name:'الدينار الليبي', nameEn:'Libyan dinar', digits:3 },
  { code:'SDG', sym:'ج.س', name:'الجنيه السوداني', nameEn:'Sudanese pound', digits:2 },
  { code:'LBP', sym:'ل.ل', name:'الليرة اللبنانية', nameEn:'Lebanese pound', digits:2 },
  { code:'SYP', sym:'ل.س', name:'الليرة السورية', nameEn:'Syrian pound', digits:2 },
  { code:'YER', sym:'ر.ي', name:'الريال اليمني', nameEn:'Yemeni rial', digits:2 },
  { code:'ILS', sym:'₪', name:'الشيكل', nameEn:'Israeli shekel', digits:2 },
  { code:'TRY', sym:'₺', name:'الليرة التركية', nameEn:'Turkish lira', digits:2 },
  { code:'IRR', sym:'﷼', name:'الريال الإيراني', nameEn:'Iranian rial', digits:2 },
  { code:'USD', sym:'$', name:'الدولار الأمريكي', nameEn:'US dollar', digits:2 },
  { code:'EUR', sym:'€', name:'اليورو', nameEn:'Euro', digits:2 },
  { code:'GBP', sym:'£', name:'الجنيه الإسترليني', nameEn:'British pound', digits:2 },
  { code:'CHF', sym:'CHF', name:'الفرنك السويسري', nameEn:'Swiss franc', digits:2 },
  { code:'CAD', sym:'C$', name:'الدولار الكندي', nameEn:'Canadian dollar', digits:2 },
  { code:'AUD', sym:'A$', name:'الدولار الأسترالي', nameEn:'Australian dollar', digits:2 },
  { code:'NZD', sym:'NZ$', name:'الدولار النيوزيلندي', nameEn:'New Zealand dollar', digits:2 },
  { code:'JPY', sym:'¥', name:'الين الياباني', nameEn:'Japanese yen', digits:0 },
  { code:'CNY', sym:'¥', name:'اليوان الصيني', nameEn:'Chinese yuan', digits:2 },
  { code:'HKD', sym:'HK$', name:'دولار هونغ كونغ', nameEn:'Hong Kong dollar', digits:2 },
  { code:'SGD', sym:'S$', name:'الدولار السنغافوري', nameEn:'Singapore dollar', digits:2 },
  { code:'INR', sym:'₹', name:'الروبية الهندية', nameEn:'Indian rupee', digits:2 },
  { code:'PKR', sym:'₨', name:'الروبية الباكستانية', nameEn:'Pakistani rupee', digits:2 },
  { code:'BDT', sym:'৳', name:'التاكا البنغلاديشي', nameEn:'Bangladeshi taka', digits:2 },
  { code:'IDR', sym:'Rp', name:'الروبية الإندونيسية', nameEn:'Indonesian rupiah', digits:2 },
  { code:'MYR', sym:'RM', name:'الرينغت الماليزي', nameEn:'Malaysian ringgit', digits:2 },
  { code:'THB', sym:'฿', name:'البات التايلندي', nameEn:'Thai baht', digits:2 },
  { code:'PHP', sym:'₱', name:'البيزو الفلبيني', nameEn:'Philippine peso', digits:2 },
  { code:'KRW', sym:'₩', name:'الوون الكوري', nameEn:'South Korean won', digits:0 },
  { code:'RUB', sym:'₽', name:'الروبل الروسي', nameEn:'Russian ruble', digits:2 },
  { code:'BRL', sym:'R$', name:'الريال البرازيلي', nameEn:'Brazilian real', digits:2 },
  { code:'MXN', sym:'MX$', name:'البيزو المكسيكي', nameEn:'Mexican peso', digits:2 },
  { code:'ARS', sym:'AR$', name:'البيزو الأرجنتيني', nameEn:'Argentine peso', digits:2 },
  { code:'ZAR', sym:'R', name:'الراند الجنوب أفريقي', nameEn:'South African rand', digits:2 },
  { code:'NGN', sym:'₦', name:'النيرة النيجيرية', nameEn:'Nigerian naira', digits:2 },
  { code:'KES', sym:'KSh', name:'الشيلنغ الكيني', nameEn:'Kenyan shilling', digits:2 },
];

export const COUNTRIES = [
  { code:'IQ', name:'العراق', nameEn:'Iraq', flag:'🇮🇶', currency:'IQD', lang:'ar' },
  { code:'SA', name:'السعودية', nameEn:'Saudi Arabia', flag:'🇸🇦', currency:'SAR', lang:'ar' },
  { code:'AE', name:'الإمارات', nameEn:'United Arab Emirates', flag:'🇦🇪', currency:'AED', lang:'ar' },
  { code:'KW', name:'الكويت', nameEn:'Kuwait', flag:'🇰🇼', currency:'KWD', lang:'ar' },
  { code:'QA', name:'قطر', nameEn:'Qatar', flag:'🇶🇦', currency:'QAR', lang:'ar' },
  { code:'BH', name:'البحرين', nameEn:'Bahrain', flag:'🇧🇭', currency:'BHD', lang:'ar' },
  { code:'OM', name:'عُمان', nameEn:'Oman', flag:'🇴🇲', currency:'OMR', lang:'ar' },
  { code:'JO', name:'الأردن', nameEn:'Jordan', flag:'🇯🇴', currency:'JOD', lang:'ar' },
  { code:'EG', name:'مصر', nameEn:'Egypt', flag:'🇪🇬', currency:'EGP', lang:'ar' },
  { code:'MA', name:'المغرب', nameEn:'Morocco', flag:'🇲🇦', currency:'MAD', lang:'ar' },
  { code:'DZ', name:'الجزائر', nameEn:'Algeria', flag:'🇩🇿', currency:'DZD', lang:'ar' },
  { code:'TN', name:'تونس', nameEn:'Tunisia', flag:'🇹🇳', currency:'TND', lang:'ar' },
  { code:'LY', name:'ليبيا', nameEn:'Libya', flag:'🇱🇾', currency:'LYD', lang:'ar' },
  { code:'SD', name:'السودان', nameEn:'Sudan', flag:'🇸🇩', currency:'SDG', lang:'ar' },
  { code:'LB', name:'لبنان', nameEn:'Lebanon', flag:'🇱🇧', currency:'LBP', lang:'ar' },
  { code:'SY', name:'سوريا', nameEn:'Syria', flag:'🇸🇾', currency:'SYP', lang:'ar' },
  { code:'YE', name:'اليمن', nameEn:'Yemen', flag:'🇾🇪', currency:'YER', lang:'ar' },
  { code:'PS', name:'فلسطين', nameEn:'Palestine', flag:'🇵🇸', currency:'ILS', lang:'ar' },
  { code:'TR', name:'تركيا', nameEn:'Turkey', flag:'🇹🇷', currency:'TRY', lang:'tr' },
  { code:'IR', name:'إيران', nameEn:'Iran', flag:'🇮🇷', currency:'IRR', lang:'fa' },
  { code:'US', name:'الولايات المتحدة', nameEn:'United States', flag:'🇺🇸', currency:'USD', lang:'en' },
  { code:'GB', name:'بريطانيا', nameEn:'United Kingdom', flag:'🇬🇧', currency:'GBP', lang:'en' },
  { code:'EU', name:'منطقة اليورو', nameEn:'Euro area', flag:'🇪🇺', currency:'EUR', lang:'en' },
  { code:'DE', name:'ألمانيا', nameEn:'Germany', flag:'🇩🇪', currency:'EUR', lang:'en' },
  { code:'FR', name:'فرنسا', nameEn:'France', flag:'🇫🇷', currency:'EUR', lang:'en' },
  { code:'IT', name:'إيطاليا', nameEn:'Italy', flag:'🇮🇹', currency:'EUR', lang:'en' },
  { code:'ES', name:'إسبانيا', nameEn:'Spain', flag:'🇪🇸', currency:'EUR', lang:'en' },
  { code:'NL', name:'هولندا', nameEn:'Netherlands', flag:'🇳🇱', currency:'EUR', lang:'en' },
  { code:'CH', name:'سويسرا', nameEn:'Switzerland', flag:'🇨🇭', currency:'CHF', lang:'en' },
  { code:'CA', name:'كندا', nameEn:'Canada', flag:'🇨🇦', currency:'CAD', lang:'en' },
  { code:'AU', name:'أستراليا', nameEn:'Australia', flag:'🇦🇺', currency:'AUD', lang:'en' },
  { code:'NZ', name:'نيوزيلندا', nameEn:'New Zealand', flag:'🇳🇿', currency:'NZD', lang:'en' },
  { code:'JP', name:'اليابان', nameEn:'Japan', flag:'🇯🇵', currency:'JPY', lang:'en' },
  { code:'CN', name:'الصين', nameEn:'China', flag:'🇨🇳', currency:'CNY', lang:'en' },
  { code:'HK', name:'هونغ كونغ', nameEn:'Hong Kong', flag:'🇭🇰', currency:'HKD', lang:'en' },
  { code:'SG', name:'سنغافورة', nameEn:'Singapore', flag:'🇸🇬', currency:'SGD', lang:'en' },
  { code:'IN', name:'الهند', nameEn:'India', flag:'🇮🇳', currency:'INR', lang:'en' },
  { code:'PK', name:'باكستان', nameEn:'Pakistan', flag:'🇵🇰', currency:'PKR', lang:'en' },
  { code:'BD', name:'بنغلاديش', nameEn:'Bangladesh', flag:'🇧🇩', currency:'BDT', lang:'en' },
  { code:'ID', name:'إندونيسيا', nameEn:'Indonesia', flag:'🇮🇩', currency:'IDR', lang:'en' },
  { code:'MY', name:'ماليزيا', nameEn:'Malaysia', flag:'🇲🇾', currency:'MYR', lang:'en' },
  { code:'TH', name:'تايلند', nameEn:'Thailand', flag:'🇹🇭', currency:'THB', lang:'en' },
  { code:'PH', name:'الفلبين', nameEn:'Philippines', flag:'🇵🇭', currency:'PHP', lang:'en' },
  { code:'KR', name:'كوريا الجنوبية', nameEn:'South Korea', flag:'🇰🇷', currency:'KRW', lang:'en' },
  { code:'RU', name:'روسيا', nameEn:'Russia', flag:'🇷🇺', currency:'RUB', lang:'en' },
  { code:'BR', name:'البرازيل', nameEn:'Brazil', flag:'🇧🇷', currency:'BRL', lang:'en' },
  { code:'MX', name:'المكسيك', nameEn:'Mexico', flag:'🇲🇽', currency:'MXN', lang:'en' },
  { code:'AR', name:'الأرجنتين', nameEn:'Argentina', flag:'🇦🇷', currency:'ARS', lang:'en' },
  { code:'ZA', name:'جنوب أفريقيا', nameEn:'South Africa', flag:'🇿🇦', currency:'ZAR', lang:'en' },
  { code:'NG', name:'نيجيريا', nameEn:'Nigeria', flag:'🇳🇬', currency:'NGN', lang:'en' },
  { code:'KE', name:'كينيا', nameEn:'Kenya', flag:'🇰🇪', currency:'KES', lang:'en' },
];

export const getSymbol = (currency) => {
  const c = CURRENCIES.find(x => x.code === currency);
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
  { key: 'attention', visible: true },
  { key: 'goals', visible: true },
  { key: 'wallets', visible: true },
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
const HOME_LAYOUT_VERSION = 2;

export const DEF_CFG = {
  theme: 'dark', themeMode: 'manual', lang: detectSystemLang(), langMode: 'system', currency: 'IQD',
  country: 'IQ', name: 'المستخدم', avatar: '🌿',
  profileType: 'personal',
  activeScope: 'personal',
  enabledModules: DEF_MODULES,
  homeCards: DEF_HOME_CARDS,
  homeSections: DEF_HOME_SECTIONS,
  quickActions: DEF_QUICK_ACTIONS,
  homeLayoutVersion: HOME_LAYOUT_VERSION,
  homeBalancesHidden: false,
  entryMode: 'quick',
  startTab: DEF_START_TAB,
  defaultWalletId: null,
  bioLock: false,
  lockDelaySeconds: 300,
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
  const lockDelaySeconds = [0, 60, 300, 900].includes(Number(cfg.lockDelaySeconds))
    ? Number(cfg.lockDelaySeconds)
    : DEF_CFG.lockDelaySeconds;
  const resetHomeLayout = Number(cfg.homeLayoutVersion || 0) < HOME_LAYOUT_VERSION;
  return {
    ...DEF_CFG,
    ...cfg,
    country,
    currency,
    profileType,
    activeScope,
    lockDelaySeconds,
    langMode,
    lang: langMode === 'system' ? detectSystemLang() : manualLang,
    themeMode: cfg.themeMode === 'system' ? 'system' : 'manual',
    theme: cfg.theme === 'light' ? 'light' : 'dark',
    categoryBudgets: Object.fromEntries(Object.entries(cfg.categoryBudgets || {}).filter(([, value]) => Number(value) > 0)),
    // Monthly recurrence is a core entry capability. Existing profiles that
    // hid the old optional module are migrated back to the enabled state.
    enabledModules: { ...normalizeModules(cfg.enabledModules), recurring: true },
    homeCards: normalizeHomeCards(resetHomeLayout ? DEF_HOME_CARDS : cfg.homeCards),
    homeSections: normalizeVisibilityList(DEF_HOME_SECTIONS, resetHomeLayout ? DEF_HOME_SECTIONS : cfg.homeSections),
    quickActions: normalizeVisibilityList(DEF_QUICK_ACTIONS, cfg.quickActions),
    homeLayoutVersion: HOME_LAYOUT_VERSION,
    homeBalancesHidden: cfg.homeBalancesHidden === true,
    entryMode: cfg.entryMode === 'classic' ? 'classic' : 'quick',
    startTab: nextStartTab,
  };
};

export const DEF_NOTIF = {
  debt:   { on: true, value: 3 },
  commitment: { on: true },
  daily:  { on: false, value: 21 },
  low:    { on: false, value: 500000 },
  forecast: { on: false },
  budget: { on: false },
  recurring: { on: true },
  unusualSpend: { on: false },
  goalProgress: { on: false },
};

// لوحة ألوان مختارة لإنشاء تصنيف جديد
export const CAT_COLORS = [
  '#3ecf6e', '#38bdf8', '#f6ad55', '#94a3b8', '#fc8181',
  '#fb923c', '#a78bfa', '#6b7280', '#f472b6', '#34d399',
  '#fbbf24', '#60a5fa',
];
