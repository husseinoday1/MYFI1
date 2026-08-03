import React, { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { COUNTRIES, CURRENCIES, detectSystemLang } from '../lib/constants';
import { DEFAULT_WALLET_ID } from '../lib/wallets';
import { useStore } from '../store/useStore';
import ChoiceSheet from '../components/ChoiceSheet';
import { AppButton, Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { defaultScopeForProfile, profileModuleDefaults } from '../lib/modules';
import { RADIUS, SHADOW, SPACE, TYPE, weight } from '../lib/tokens';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
const stepText = (lang) => {
  const ar = lang === 'ar';
  return {
    skip: ar ? 'تخطي' : 'Skip',
    next: ar ? 'التالي' : 'Next',
    back: ar ? 'رجوع' : 'Back',
    start: ar ? 'ابدأ الآن' : 'Start now',
    ideaTitle: ar ? 'أموالك أمامك بوضوح، في مكان واحد' : 'See all your finances clearly, in one place',
    ideaBody: ar
      ? 'يجمع MYFI دخلك ومصروفاتك ودين عليّ ودين لي وأهدافك لتعرف أين تقف وتتخذ قراراتك بثقة.'
      : 'MYFI brings your income, spending, debts, and goals together, so you always know where you stand.',
    ideaTrack: ar ? 'سجّل بسهولة' : 'Capture with ease',
    ideaTrackBody: ar ? 'حركاتك اليومية تبقى مرتبة وقابلة للبحث.' : 'Daily activity stays organized and searchable.',
    ideaUnderstand: ar ? 'اعرف وضعك' : 'Know where you stand',
    ideaUnderstandBody: ar ? 'ملخصات ورسوم واضحة بلا تكرار أو تعقيد.' : 'Clear summaries and visuals without repetition.',
    ideaShare: ar ? 'شارك عند الحاجة' : 'Share when needed',
    ideaShareBody: ar ? 'تقارير PDF وCSV للإدارة أو التدقيق.' : 'PDF and CSV reports for management or audit.',
    welcomeTitle: ar ? 'أهلاً بك في MYFI' : 'Welcome to MYFI',
    welcomeBody: ar
      ? 'جهزنا MYFI حسب اختياراتك. ابدأ الآن وتابع أموالك من مكان واحد.'
      : 'MYFI is ready with your preferences. Start now and manage your money from one place.',
    identityTitle: ar ? 'كيف ستستخدم MYFI؟' : 'How will you use MYFI?',
    identityBody: ar ? 'اختر الاستخدام الأقرب لك، وسنرتب الأدوات والمعلومات بما يناسب احتياجاتك.' : 'Choose what fits you best, and MYFI will organize the right tools and information for you.',
    needsTitle: ar ? 'ما الذي تريد متابعته؟' : 'What would you like to track?',
    needsBody: ar ? 'حدد ما يهمك، ثم أضف محفظتك الأساسية لتبدأ بأرصدة صحيحة.' : 'Choose what matters, then add your main wallet to start with accurate balances.',
    reviewTitle: ar ? 'راجع إعداداتك' : 'Review your setup',
    reviewBody: ar ? 'تأكد من اختياراتك قبل الانتقال إلى الرئيسية.' : 'Check your choices before continuing to Home.',
    profile: ar ? 'نوع الاستخدام' : 'Usage type',
    country: ar ? 'الدولة' : 'Country',
    language: ar ? 'اللغة' : 'Language',
    systemLanguage: ar ? 'لغة الهاتف' : 'Phone language',
    currency: ar ? 'العملة' : 'Currency',
    activeFeatures: ar ? 'الميزات المفعلة' : 'Enabled features',
    personal: ar ? 'شخصي' : 'Personal',
    business: ar ? 'مشروع بسيط' : 'Small business',
    mixed: ar ? 'مزدوج' : 'Dual',
    personalDetail: ar ? 'دخل، صرف، دين عليّ، دين لي، وأهداف' : 'Income, spending, debts, and goals',
    businessDetail: ar ? 'إيرادات، مصاريف، ومستحقات' : 'Revenue, expenses, and receivables',
    mixedDetail: ar ? 'يجمع ميزات الشخصي والمشروع في مساحة واحدة' : 'Combines personal and business features in one workspace',
    wallets: ar ? 'محافظ متعددة' : 'Multiple wallets',
    debtsOwed: ar ? 'دين عليّ' : 'Debt I owe',
    debtsReceivable: ar ? 'دين لي' : 'Debt owed to me',
    goals: ar ? 'أهداف توفير' : 'Saving goals',
    commitments: ar ? 'الالتزامات' : 'Commitments',
    selected: ar ? 'مطلوب لهذا الاستخدام' : 'Required for this setup',
    countryCurrencyHint: ar ? 'اختيار الدولة يضبط عملتها الرئيسية، ويمكنك تغيير العملة يدويًا.' : 'Choosing a country sets its main currency; you can still change currency manually.',
    startModeTitle: ar ? 'كيف تريد أن تبدأ؟' : 'How would you like to start?',
    startModeBody: ar ? 'يمكنك البدء ببياناتك الحقيقية أو استكشاف نسخة تجريبية كاملة ثم العودة لبياناتك لاحقًا.' : 'Start with your real data or explore a complete demo and return to your real workspace later.',
    realMode: ar ? 'بياناتي الحقيقية' : 'My real data',
    realModeDetail: ar ? 'مساحة محلية فارغة تبدأ منها بأرقامك الفعلية.' : 'A clean local workspace for your actual numbers.',
    demoMode: ar ? 'استكشاف بيانات تجريبية' : 'Explore demo data',
    demoModeDetail: ar ? 'سنة كاملة من الحركات والديون والأهداف للتجربة فقط.' : 'A full year of sample transactions, debts, and goals.',
    localFirst: ar ? 'لا يلزم إنشاء حساب. تُحفظ بياناتك محليًا، ويمكنك تفعيل المزامنة والنسخ الاحتياطي لاحقًا.' : 'No account is required. Data starts locally; sync and backup can be enabled later.',
    startingWorkspace: ar ? 'مساحة البداية' : 'Starting workspace',
  };
};

export default function OnboardingScreen({ cfg, onDone }) {
  const { setCfg, editWallet, enterDemoMode } = useStore();
  const [step, setStep] = useState(0);
  const [countryCode, setCountryCode] = useState(cfg.country || 'IQ');
  const [currencyCode, setCurrencyCode] = useState(cfg.currency || 'IQD');
  const [langMode, setLangMode] = useState(cfg.langMode || 'system');
  const [lang, setLang] = useState(cfg.lang || detectSystemLang());
  const [profileType, setProfileType] = useState(cfg.profileType || 'personal');
  const [startMode, setStartMode] = useState('real');
  const [walletName, setWalletName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [choiceSheet, setChoiceSheet] = useState(null);
  const [needs, setNeeds] = useState(() => {
    const defaults = profileModuleDefaults(cfg.profileType || 'personal');
    return {
      wallets: cfg.enabledModules?.wallets ?? defaults.wallets,
      debtsOwed: cfg.enabledModules?.debtsOwed ?? defaults.debtsOwed,
      debtsReceivable: cfg.enabledModules?.debtsReceivable ?? defaults.debtsReceivable,
      goals: cfg.enabledModules?.goals ?? defaults.goals,
    };
  });

  const th = TH[cfg.theme] || TH.dark;
  const T = stepText(lang);
  const isAr = lang === 'ar';
  const walletText = {
    title: isAr ? 'المحفظة الرئيسية' : 'Main wallet',
    body: isAr ? 'ثبت اسم المحفظة والرصيد الحقيقي حتى تبدأ الأرقام بشكل صحيح.' : 'Set the wallet name and real starting balance so numbers begin correctly.',
    name: isAr ? 'اسم المحفظة' : 'Wallet name',
    balance: isAr ? 'الرصيد الافتتاحي' : 'Opening balance',
  };

  const countries = useMemo(() => COUNTRIES, []);
  const selectedCountry = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];
  const selectedCurrency = CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0];

  const profileOptions = [
    { value: 'personal', label: T.personal, detail: T.personalDetail, icon: 'person-outline' },
    { value: 'business', label: T.business, detail: T.businessDetail, icon: 'storefront-outline' },
    { value: 'personal_business', label: T.mixed, detail: T.mixedDetail, icon: 'albums-outline' },
  ];

  const languageOptions = [
    { value: 'system', label: T.systemLanguage, detail: lang === 'ar' ? 'حسب إعدادات الجهاز' : 'Uses phone setting', icon: 'phone-portrait-outline' },
    { value: 'ar', label: 'العربية', detail: 'RTL', icon: 'language-outline' },
    { value: 'en', label: 'English', detail: 'LTR', icon: 'language-outline' },
  ];

  const countryOptions = countries.map(country => ({
    value: country.code,
    label: lang === 'ar' ? country.name : country.nameEn,
    detail: `${country.code} · ${country.currency}`,
    leading: country.flag,
    country,
  }));
  const currencyOptions = CURRENCIES.map(currency => ({
    value: currency.code,
    label: currency.code,
    detail: `${currency.sym} · ${lang === 'ar' ? currency.name : currency.nameEn}`,
    leading: currency.sym,
    currency,
  }));

  const enabledModules = useMemo(() => {
    const defaults = profileModuleDefaults(profileType);
    return {
      ...defaults,
      wallets: needs.wallets || defaults.wallets,
      debtsOwed: needs.debtsOwed || defaults.debtsOwed,
      debtsReceivable: needs.debtsReceivable || defaults.debtsReceivable,
      goals: profileType !== 'business' && needs.goals,
      commitments: true,
    };
  }, [profileType, needs]);

  const featureRows = [
    ['wallets', T.wallets, 'wallet-outline'],
    ['debtsOwed', T.debtsOwed, 'card-outline'],
    ['debtsReceivable', T.debtsReceivable, 'cash-outline'],
    ['goals', T.goals, 'flag-outline'],
  ];

  const activeFeatures = featureRows.filter(([key]) => enabledModules[key]);

  const choiceConfig = {
    country: {
      title: T.country,
      value: countryCode,
      options: countryOptions,
      onSelect: (_, option) => {
        setCountryCode(option.country.code);
        setCurrencyCode(option.country.currency);
      },
    },
    currency: {
      title: T.currency,
      value: currencyCode,
      options: currencyOptions,
      onSelect: (_, option) => setCurrencyCode(option.currency.code),
    },
    language: {
      title: T.language,
      value: langMode === 'system' ? 'system' : lang,
      options: languageOptions,
      onSelect: (value) => {
        if (value === 'system') {
          setLangMode('system');
          setLang(detectSystemLang());
          return;
        }
        setLangMode('manual');
        setLang(value);
      },
    },
  };
  const activeChoice = choiceConfig[choiceSheet] || null;

  const setProfile = (value) => {
    setProfileType(value);
    const defaults = profileModuleDefaults(value);
    setNeeds(prev => ({
      ...prev,
      wallets: defaults.wallets || prev.wallets,
      debtsOwed: true,
      debtsReceivable: defaults.debtsReceivable || prev.debtsReceivable,
      goals: value !== 'business' ? prev.goals : false,
    }));
  };

  const toggleNeed = (key) => {
    setNeeds(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const finish = async () => {
    await setCfg({
      country: selectedCountry.code,
      currency: selectedCurrency.code,
      lang,
      langMode,
      profileType,
      activeScope: profileType === 'personal_business' ? 'all' : defaultScopeForProfile(profileType),
      enabledModules,
    });
    const balance = parseNumberInput(openingBalance);
    const name = walletName.trim() || walletText.title;
    await editWallet(DEFAULT_WALLET_ID, {
      name,
      nameEn: name,
      currency: selectedCurrency.code,
      scope: defaultScopeForProfile(profileType),
      openingBalance: balance,
    });
    if (startMode === 'demo') await enterDemoMode();
    onDone();
  };

  const renderIdentityRow = ({ icon, label, value, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      style={[s.selectRow, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}
    >
      <View style={[s.selectIcon, { backgroundColor: 'transparent', borderColor: th.border }]}>
        <Ionicons name={icon} size={17} color={th.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.selectLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text>
        <Text
          style={[s.selectValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {value}
        </Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />
    </TouchableOpacity>
  );

  const nextStep = () => {
    if (step < 3) setStep(step + 1);
    else finish();
  };

  return (
    <KeyboardAvoidingView
      style={[s.wrap, { backgroundColor: th.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
    >
      <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        {step === 0 ? (
          <TouchableOpacity onPress={() => setStep(1)} style={s.skipBtn}>
            <Text style={{ color: th.faint, fontSize: 13 }}>{T.skip}</Text>
          </TouchableOpacity>
        ) : <View style={s.skipBtn} />}
        <View style={[s.steps, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {[0, 1, 2, 3].map(index => (
            <View
              key={index}
              style={[
                s.stepDot,
                { backgroundColor: step === index ? th.primary : step > index ? th.primaryContainer : th.cardHigh },
              ]}
            />
          ))}
        </View>
      </View>

      {step === 3 ? (
        <View style={s.hero}>
          <View style={[s.mark, { backgroundColor: th.primaryContainer }]}>
            <Ionicons name="sparkles-outline" size={52} color={th.onPrimaryContainer} />
          </View>
          <Text style={[s.logo, { color: th.primary }]}>MYFI</Text>
          <Text style={[s.title, { color: th.text }]}>{T.welcomeTitle}</Text>
          <Text style={[s.body, { color: th.sub }]}>{T.welcomeBody}</Text>

          <View style={[s.previewCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.previewRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <PreviewBadge icon="wallet-outline" label={T.currency} value={`${selectedCurrency.code} · ${selectedCurrency.sym}`} th={th} />
              <PreviewBadge icon="language-outline" label={T.language} value={langMode === 'system' ? T.systemLanguage : lang === 'ar' ? 'العربية' : 'English'} th={th} />
            </View>
            <View style={[s.previewRow, { flexDirection: isAr ? 'row-reverse' : 'row', marginTop: 10 }]}>
              <PreviewBadge icon="person-outline" label={T.profile} value={profileOptions.find(item => item.value === profileType)?.label || T.personal} th={th} />
              <PreviewBadge icon="flag-outline" label={T.country} value={`${selectedCountry.flag} ${isAr ? selectedCountry.name : selectedCountry.nameEn}`} th={th} />
            </View>
          </View>
        </View>
      ) : step === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={s.startContent}>
          <View style={[s.startBrand, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[s.ideaMiniLogo, { backgroundColor: th.primary }]}>
              <Ionicons name="wallet-outline" size={18} color={th.onPrimary} />
            </View>
            <Text style={[s.ideaBrand, { color: th.text }]}>MYFI</Text>
          </View>
          <Text style={[s.startTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.startModeTitle}</Text>
          <Text style={[s.startBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.startModeBody}</Text>

          <View style={s.startModes}>
            {[
              { id: 'real', title: T.realMode, detail: T.realModeDetail, icon: 'person-outline' },
              { id: 'demo', title: T.demoMode, detail: T.demoModeDetail, icon: 'flask-outline' },
            ].map(item => {
              const active = startMode === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => setStartMode(item.id)}
                  style={[
                    s.startModeRow,
                    {
                      backgroundColor: active ? th.primSoft : th.card,
                      borderColor: active ? th.primary : th.border,
                      flexDirection: isAr ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={[s.startModeIcon, { backgroundColor: active ? th.primary : th.cardHigh }]}>
                    <Ionicons name={item.icon} size={19} color={active ? th.onPrimary : th.sub} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: active ? th.primary : th.text, fontSize: 15, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{item.title}</Text>
                    <Text style={{ color: th.sub, fontSize: 12, lineHeight: 19, marginTop: 3, textAlign: isAr ? 'right' : 'left' }}>{item.detail}</Text>
                  </View>
                  <ChoiceMark active={active} th={th} />
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={[s.localNote, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Ionicons name="phone-portrait-outline" size={18} color={th.primary} />
            <Text style={{ color: th.sub, fontSize: 12, lineHeight: 19, flex: 1, textAlign: isAr ? 'right' : 'left' }}>{T.localFirst}</Text>
          </View>
        </ScrollView>
      ) : step === 1 ? (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={[s.content, { paddingBottom: 110 }]}>
          <Text style={[s.title, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.identityTitle}</Text>
          <Text style={[s.sectionBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.identityBody}</Text>

          <View style={s.profileGrid}>
            {profileOptions.map(option => {
              const active = profileType === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setProfile(option.value)}
                  style={[
                    s.profileCard,
                    {
                      backgroundColor: active ? th.primSoft : th.card,
                      borderColor: active ? th.primary : th.border,
                    },
                  ]}
                >
                  <View style={[s.profileCardRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                    <View style={[s.profileIcon, { backgroundColor: th.cardHigh, borderColor: active ? th.primary : th.border }]}>
                      <Ionicons name={option.icon} size={18} color={active ? th.primary : th.sub} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.86}
                      >
                        {option.label}
                      </Text>
                      <Text style={{ color: th.sub, fontSize: 12, marginTop: 3, lineHeight: 18, textAlign: isAr ? 'right' : 'left' }} numberOfLines={2}>
                        {option.detail}
                      </Text>
                    </View>
                    <ChoiceMark active={active} th={th} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={s.selectGroup}>
            {renderIdentityRow({
              icon: 'flag-outline',
              label: T.country,
              value: `${selectedCountry.flag} ${lang === 'ar' ? selectedCountry.name : selectedCountry.nameEn}`,
              onPress: () => setChoiceSheet('country'),
            })}
            {renderIdentityRow({
              icon: 'language-outline',
              label: T.language,
              value: langMode === 'system' ? T.systemLanguage : lang === 'ar' ? 'العربية' : 'English',
              onPress: () => setChoiceSheet('language'),
            })}
            {renderIdentityRow({
              icon: 'cash-outline',
              label: T.currency,
              value: `${selectedCurrency.code} · ${selectedCurrency.sym}`,
              onPress: () => setChoiceSheet('currency'),
            })}
          </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={[s.content, { paddingBottom: 110 }]}>
          <Text style={[s.title, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.needsTitle}</Text>
          <Text style={[s.sectionBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.needsBody}</Text>

          <View style={[s.needsGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            {featureRows.map(([key, label, icon]) => {
              const active = !!needs[key];
              const forced = !!profileModuleDefaults(profileType)[key] && (key === 'wallets' || key === 'debtsReceivable');
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => !forced && toggleNeed(key)}
                  style={[
                    s.needCard,
                    {
                      backgroundColor: active ? th.primSoft : th.card,
                      borderColor: active ? th.primary : th.border,
                      opacity: forced ? 0.92 : 1,
                    },
                  ]}
                >
                  <View style={[s.needIcon, { backgroundColor: th.cardHigh, borderColor: active ? th.primary : th.border }]}>
                    <Ionicons name={icon} size={16} color={active ? th.primary : th.sub} />
                  </View>
                  <Text
                    style={{ color: active ? th.primary : th.text, fontSize: 12, ...weight('900'), textAlign: 'center' }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                    minimumFontScale={0.84}
                  >
                    {label}
                  </Text>
                  <ChoiceMark active={active} th={th} style={{ marginTop: 6 }} />
                  {forced ? <Text style={{ color: th.faint, fontSize: 11, marginTop: 3 }}>{T.selected}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          {enabledModules.wallets ? (
            <View style={[s.walletStart, { backgroundColor: th.card, borderColor: th.border }]}>
              <View style={[s.walletStartHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <View style={[s.selectIcon, { backgroundColor: 'transparent', borderColor: th.border }]}>
                  <Ionicons name="wallet-outline" size={17} color={th.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 15, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{walletText.title}</Text>
                  <Text style={{ color: th.sub, fontSize: 12, marginTop: 3, lineHeight: 18, textAlign: isAr ? 'right' : 'left' }}>{walletText.body}</Text>
                </View>
              </View>
              <TextInput
                value={walletName}
                onChangeText={setWalletName}
                placeholder={walletText.name}
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
              />
              <TextInput
                value={openingBalance}
                onChangeText={(value) => setOpeningBalance(formatNumberInput(value))}
                keyboardType="numeric"
                placeholder={`${walletText.balance} (${selectedCurrency.code})`}
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]}
              />
            </View>
          ) : null}

          <View style={[s.reviewCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <Text style={{ color: th.text, fontSize: 15, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{T.reviewTitle}</Text>
            <Text style={{ color: th.sub, fontSize: 12, marginTop: 6, textAlign: isAr ? 'right' : 'left' }}>{T.reviewBody}</Text>

            <View style={[s.reviewList, { marginTop: 12 }]}>
              <ReviewRow label={T.profile} value={profileOptions.find(item => item.value === profileType)?.label || T.personal} th={th} isAr={isAr} />
              <ReviewRow label={T.country} value={`${selectedCountry.flag} ${lang === 'ar' ? selectedCountry.name : selectedCountry.nameEn}`} th={th} isAr={isAr} />
              <ReviewRow label={T.currency} value={`${selectedCurrency.code} · ${selectedCurrency.sym}`} th={th} isAr={isAr} />
              <ReviewRow label={T.activeFeatures} value={String(activeFeatures.length)} th={th} isAr={isAr} />
              <ReviewRow label={T.startingWorkspace} value={startMode === 'demo' ? T.demoMode : T.realMode} th={th} isAr={isAr} />
            </View>

            <View style={[s.tags, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              {activeFeatures.map(([key, label, icon]) => (
                <View key={key} style={[s.tag, { backgroundColor: th.cardHigh }]}>
                  <Ionicons name={icon} size={13} color={th.primary} />
                  <Text style={{ color: th.text, fontSize: 11, ...weight('800') }}>{label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      )}

      <View style={[s.footer, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        {step > 0 ? (
          <AppButton th={th} lang={lang} tone="secondary" label={T.back} onPress={() => setStep(step - 1)} style={s.secondaryBtn} />
        ) : <View style={{ flex: 1 }} />}
        <AppButton th={th} lang={lang} label={step === 3 ? T.start : T.next} onPress={nextStep} style={s.primaryBtn} />
      </View>

      <ChoiceSheet
        visible={!!activeChoice}
        title={activeChoice?.title || ''}
        options={activeChoice?.options || []}
        value={activeChoice?.value}
        onSelect={activeChoice?.onSelect}
        onClose={() => setChoiceSheet(null)}
        th={th}
        lang={lang}
      />
    </KeyboardAvoidingView>
  );
}

function PreviewBadge({ icon, label, value, th }) {
  return (
    <View style={[s.previewBadge, { backgroundColor: th.card, borderColor: th.border }]}>
      <Ionicons name={icon} size={14} color={th.primary} />
      <Text style={{ color: th.faint, fontSize: 12, ...weight('900') }}>{label}</Text>
      <Text
        style={{ color: th.text, fontSize: 12, ...weight('900') }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.78}
      >
        {value}
      </Text>
    </View>
  );
}

function ConceptRow({ th, isAr, icon, title, body }) {
  return (
    <View style={[s.conceptRow, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <View style={[s.conceptIcon, { backgroundColor: 'transparent', borderColor: th.border }]}>
        <Ionicons name={icon} size={18} color={th.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.conceptTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
        <Text style={[s.conceptBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{body}</Text>
      </View>
    </View>
  );
}

function ChoiceMark({ active, th, style }) {
  return (
    <View style={[
      s.choiceMark,
      { backgroundColor: active ? th.primary : 'transparent', borderColor: active ? th.primary : th.border },
      style,
    ]}>
      {active ? <Ionicons name="checkmark" size={12} color={th.onPrimary} /> : null}
    </View>
  );
}

function ReviewRow({ label, value, th, isAr }) {
  return (
    <View style={[s.reviewRow, { flexDirection: isAr ? 'row-reverse' : 'row', borderBottomColor: th.border }]}>
      <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, ...weight('800'), flex: 1 }} numberOfLines={2}>{label}</Text>
      <Text
        style={{ color: th.text, fontSize: 12, ...weight('900'), flex: 1, textAlign: isAr ? 'left' : 'right' }}
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.82}
      >
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 18 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  skipBtn: { padding: 8 },
  steps: { gap: 6, alignItems: 'center' },
  stepDot: { width: 26, height: 5, borderRadius: 999 },
  ideaContent: { paddingBottom: 8, alignItems: 'center' },
  startContent: { paddingBottom: 12 },
  startBrand: { alignItems: 'center', gap: 9, marginBottom: 28 },
  startTitle: { fontSize: 26, lineHeight: 34, ...weight('900') },
  startBody: { fontSize: 13, lineHeight: 21, marginTop: 8, marginBottom: 22 },
  startModes: { gap: 10 },
  startModeRow: { minHeight: 92, borderWidth: 1, borderRadius: RADIUS.lg, padding: 13, alignItems: 'center', gap: 11, ...SHADOW.card },
  startModeIcon: { width: 42, height: 42, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  localNote: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 12, alignItems: 'center', gap: 10, marginTop: 14 },
  ideaVisual: { width: '100%', height: 190, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  ideaGlow: { position: 'absolute', width: 210, height: 150, borderRadius: 70, transform: [{ rotate: '-8deg' }] },
  ideaPhone: { width: 174, minHeight: 166, borderWidth: 1, borderRadius: 28, padding: 14, ...SHADOW.float },
  ideaPhoneHead: { alignItems: 'center', gap: 8, marginBottom: 12 },
  ideaMiniLogo: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ideaBrand: { fontSize: 14, ...weight('900') },
  ideaBalance: { flex: 1, borderRadius: RADIUS.lg, padding: 12 },
  ideaBalanceLabel: { fontSize: 11, textAlign: 'center', ...weight('900') },
  ideaBalanceLine: { width: 52, height: 5, borderRadius: 5, alignSelf: 'center', marginTop: 7 },
  ideaBars: { height: 72, alignItems: 'flex-end', justifyContent: 'center', gap: 7, marginTop: 8 },
  ideaBar: { width: 12, borderRadius: 5 },
  ideaTitle: { fontSize: 25, lineHeight: 33, textAlign: 'center', ...weight('900'), maxWidth: 330 },
  ideaBody: { fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 335 },
  ideaList: { width: '100%', gap: 8, marginTop: 18 },
  conceptRow: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 11, alignItems: 'center', gap: 10, ...SHADOW.card },
  conceptIcon: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  conceptTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  conceptBody: { fontSize: 12, lineHeight: 18, marginTop: 2, ...weight('700') },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 18 },
  mark: { width: 120, height: 120, borderRadius: 34, alignItems: 'center', justifyContent: 'center', marginBottom: 24, ...SHADOW.float },
  logo: { fontSize: 34, ...weight('900'), letterSpacing: 0, marginBottom: 10 },
  title: { fontSize: TYPE.title, ...weight('900'), marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  previewCard: { width: '100%', borderRadius: RADIUS.xl, borderWidth: 1, padding: 15, marginTop: 22, ...SHADOW.card },
  previewRow: { gap: 10 },
  previewBadge: { flex: 1, borderRadius: RADIUS.lg, borderWidth: 1, padding: 12, minHeight: 84 },
  content: { paddingBottom: 10 },
  sectionBody: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  profileGrid: { gap: 10, marginBottom: 14 },
  profileCard: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 12, overflow: 'hidden' },
  profileCardRow: { alignItems: 'center', gap: 11 },
  profileIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectGroup: { gap: 10 },
  selectRow: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 13, alignItems: 'center', gap: 10, ...SHADOW.card },
  selectIcon: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  selectLabel: { fontSize: 11, ...weight('900'), marginBottom: 3 },
  selectValue: { fontSize: 15, ...weight('900') },
  currencyBox: { borderWidth: 1, borderRadius: RADIUS.lg, padding: 13, alignItems: 'center', gap: 10, ...SHADOW.card },
  needsGrid: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  needCard: { width: '48.5%', borderWidth: 1, borderRadius: RADIUS.xl, padding: 12, alignItems: 'center', minHeight: 100, justifyContent: 'center', overflow: 'hidden' },
  needIcon: { width: 36, height: 36, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 7 },
  choiceMark: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  walletStart: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 14, marginBottom: 14, ...SHADOW.card },
  walletStartHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  input: { minHeight: 48, borderRadius: RADIUS.md, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 1, marginBottom: 9, fontSize: 14, lineHeight: 19, ...weight('700') },
  reviewCard: { borderWidth: 1, borderRadius: RADIUS.xl, padding: 14, ...SHADOW.card },
  reviewList: { marginBottom: 12 },
  reviewRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1 },
  tags: { flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: RADIUS.md },
  footer: { gap: 10, marginTop: 12 },
  secondaryBtn: { flex: 1 },
  primaryBtn: { flex: 1.4 },
});
