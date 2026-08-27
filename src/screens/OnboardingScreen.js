import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { COUNTRIES, CURRENCIES, detectSystemLang } from '../lib/constants';
import { useStore } from '../store/useStore';
import { DEFAULT_WALLET_ID } from '../lib/wallets';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { defaultScopeForProfile, profileModuleDefaults } from '../lib/modules';
import { weight } from '../lib/tokens';
import ChoiceSheet from '../components/ChoiceSheet';

// 6-step onboarding, LOCKED per docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md
// §7: "1. Welcome -> 2. What matters to you first? -> 3. Customize your
// experience -> 4. Create first wallet -> 5. Privacy first -> 6. Everything
// is ready." Full per-step visual detail: 14_MYFI_APPROVED_VISUAL_REFERENCE_
// REGISTER.md (REF-02/03/03B/03D/03C/03E) — copy below is taken directly
// from those approved images. Replaces a 3-slide marketing-preview flow that
// did not match the locked spec (found and rebuilt 2026-08-27).
//
// The prior file's account-type-removal note still applies and is preserved:
// no Personal/Business/Dual selector anywhere in this flow — "priorities"
// (step 2) is a different, explicitly-allowed concept (interests, not
// account type) per the locked doc's own wording.
const PRIORITY_KEYS = ['expenses', 'planning', 'debts', 'goals', 'understand', 'everything'];
const DEFAULT_PRIORITIES = ['expenses', 'planning', 'goals'];

const copy = lang => {
  const ar = lang === 'ar';
  return {
    skip: ar ? 'تخطي' : 'Skip',
    back: ar ? 'رجوع' : 'Back',
    next: ar ? 'متابعة' : 'Continue',
    start: ar ? 'ابدأ استخدام MYFI' : 'Start using MYFI',
    begin: ar ? 'ابدأ' : 'Start',
    notNow: ar ? 'ليس الآن' : 'Not now',
    // Step 1 — Welcome (REF-02)
    welcomeTitle: ar ? 'مرحباً بك في MYFI' : 'Welcome to MYFI',
    welcomeBody: ar
      ? 'نساعدك على فهم أموالك، تنظيمها، واتخاذ قرارات أفضل. سنضبط البداية خلال أقل من دقيقة.'
      : 'We help you understand your money, organize it, and make better decisions. We will set up the basics in under a minute.',
    expenses: ar ? 'المصروفات' : 'Expenses',
    planning: ar ? 'التخطيط' : 'Planning',
    goals: ar ? 'الأهداف' : 'Goals',
    trustBadge: ar ? 'تجربة عربية واضحة، سريعة، وآمنة' : 'A clear, fast, and safe experience',
    // Step 2 — Priorities (REF-03)
    priorityTitle: ar ? 'ما الذي يهمك أولاً؟' : 'What matters to you first?',
    priorityBody: ar
      ? 'اختر ما تريد أن يركز عليه MYFI عند البداية. يمكنك اختيار أكثر من خيار.'
      : 'Choose what you want MYFI to focus on at the start. You can select more than one.',
    priorityHint: ar ? 'يمكنك تعديل هذه الأولويات لاحقاً من داخل التطبيق.' : 'You can adjust these priorities later from inside the app.',
    priority_expenses: ar ? 'تتبع المصروفات' : 'Track expenses',
    priority_planning: ar ? 'التخطيط الشهري والميزانية' : 'Monthly planning and budgeting',
    priority_debts: ar ? 'الديون والالتزامات' : 'Debts and commitments',
    priority_goals: ar ? 'الادخار والأهداف' : 'Saving and goals',
    priority_understand: ar ? 'فهم وضعي المالي' : 'Understand my financial standing',
    priority_everything: ar ? 'استخدام شامل' : 'Comprehensive use',
    // Step 3 — Customize (REF-03B)
    customizeTitle: ar ? 'خصص تجربتك' : 'Customize your experience',
    customizeBody: ar ? 'اختر البلد واللغة والعملة والمظهر بما يناسبك.' : 'Choose the country, language, currency, and appearance that suit you.',
    country: ar ? 'البلد' : 'Country',
    language: ar ? 'اللغة' : 'Language',
    baseCurrency: ar ? 'العملة' : 'Currency',
    appearance: ar ? 'المظهر' : 'Appearance',
    chooseCountry: ar ? 'اختر البلد' : 'Choose country',
    chooseCurrency: ar ? 'اختر العملة' : 'Choose currency',
    chooseLanguage: ar ? 'اختر اللغة' : 'Choose language',
    chooseAppearance: ar ? 'اختر المظهر' : 'Choose appearance',
    arabic: ar ? 'العربية' : 'Arabic',
    english: ar ? 'English' : 'English',
    light: ar ? 'فاتح' : 'Light',
    dark: ar ? 'داكن' : 'Dark',
    customizeNotice: ar
      ? 'تجربة آمنة وخاصة — تفضيلاتك تُحفظ بأمان ويمكنك تغييرها لاحقاً من الإعدادات.'
      : 'A safe and private experience — your preferences are saved securely and can be changed later from Settings.',
    // Step 4 — Create first wallet (REF-03D)
    walletTitle: ar ? 'إعداد المحفظة الأولى' : 'Set up your first wallet',
    walletBody: ar
      ? 'اختر اسماً لمحفظتك الأولى. يمكنك استخدام الاسم الافتراضي أو كتابة اسم مخصص.'
      : 'Choose a name for your first wallet. You can use the default name or write your own.',
    walletNameLabel: ar ? 'اسم المحفظة' : 'Wallet name',
    walletNameHint: ar ? 'يمكنك الإبقاء على الاسم الافتراضي أو تغييره الآن أو لاحقاً.' : 'You can keep the default name or change it now or later.',
    walletDefaultName: ar ? 'المحفظة الرئيسية' : 'Main wallet',
    walletCurrencyConfirmed: ar ? 'تم اعتماد العملة التي اخترتها في الخطوة السابقة.' : 'The currency you chose in the previous step has been confirmed.',
    // Financial-contract disclosure (R03/multicurrency): the base currency is
    // the fixed reporting reference once history starts, and every
    // transaction keeps its own currency/amount/historical rate. REF-03D
    // doesn't show this exact sentence, but the financial contract requires
    // it be explained somewhere in onboarding — kept from the prior flow.
    walletCurrencyRule: ar
      ? 'العملة الأساسية هي مرجع التقارير وتثبت بعد أول سجل مالي؛ كل حركة تحفظ عملتها ومبلغها وسعرها التاريخي.'
      : 'The base currency is the reporting reference and becomes fixed after financial history starts; every transaction keeps its own currency, amount, and historical rate.',
    // Step 5 — Privacy (REF-03C)
    privacyTitle: ar ? 'خصوصيتك أولاً' : 'Your privacy first',
    privacyBody: ar ? 'MYFI يضع خصوصية بياناتك ضمن الأولويات.' : 'MYFI puts your data privacy first.',
    privacyLocal: ar ? 'بياناتك تبدأ محلياً على جهازك' : 'Your data starts locally on your device',
    privacyLocalSub: ar ? 'وتبقى تحت سيطرتك' : 'and stays under your control',
    privacySync: ar ? 'المزامنة اختيارية' : 'Syncing is optional',
    privacySyncSub: ar ? 'يمكنك تفعيلها لاحقاً إذا رغبت' : 'you can enable it later if you want',
    privacyPermissions: ar ? 'الصلاحيات تُطلب وقت الحاجة' : 'Permissions are requested when needed',
    privacyPermissionsSub: ar ? 'لن نطلب أكثر مما يلزم' : 'we will never ask for more than necessary',
    privacyAgree: ar ? 'فهمت وأوافق' : 'I understand and agree',
    // Step 6 — Complete (REF-03E)
    completeTitle: ar ? 'كل شيء جاهز' : 'Everything is ready',
    completeBody: ar
      ? 'تم إعداد MYFI بنجاح. يمكنك البدء الآن وإكمال بقية التفاصيل لاحقاً.'
      : 'MYFI is set up successfully. You can start now and complete the rest of the details later.',
    summaryPriorities: ar ? 'الأولويات' : 'Priorities',
    summaryCountry: ar ? 'الدولة' : 'Country',
    summaryCurrency: ar ? 'العملة' : 'Currency',
    summaryWallet: ar ? 'المحفظة' : 'Wallet',
    summaryWalletHint: ar ? 'يمكنك تعديل اسم المحفظة لاحقاً' : 'You can edit the wallet name later',
  };
};

const STEP_COUNT = 6;

export default function OnboardingScreen({ cfg, onDone }) {
  const { setCfg, editWallet } = useStore();
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState(detectSystemLang());
  const isAr = lang === 'ar';
  const th = TH[cfg.theme] || TH.dark;
  const T = copy(lang);
  const localeCountry = useMemo(() => {
    try {
      const locale = String(Intl?.DateTimeFormat?.().resolvedOptions?.().locale || '');
      const region = locale.match(/[-_]([A-Za-z]{2})(?:$|[-_])/i)?.[1]?.toUpperCase() || null;
      return COUNTRIES.find(item => item.code === region)?.code || null;
    } catch { return null; }
  }, []);
  const initialCountry = localeCountry || null;
  const initialSuggestedCurrency = COUNTRIES.find(item => item.code === initialCountry)?.currency || '';
  // Account-type selection (Personal/Business/Dual) removed from onboarding
  // per docs/design/06_MYFI_NAVIGATION_AND_INFORMATION_ARCHITECTURE.md §7
  // (LOCKED — explicitly prohibits this step). Every new account starts
  // 'personal' silently; it can still be changed later via the existing,
  // unmodified Settings > ... > profile-type control.
  const profileType = 'personal';
  const [priorities, setPriorities] = useState(DEFAULT_PRIORITIES);
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [currencyCode, setCurrencyCode] = useState(initialSuggestedCurrency);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [themeChoice, setThemeChoice] = useState(cfg.theme === 'light' ? 'light' : 'dark');
  const [walletName, setWalletName] = useState('');
  const [privacyAgreed, setPrivacyAgreed] = useState(true);
  const [choice, setChoice] = useState(null);

  const selectedCountry = COUNTRIES.find(item => item.code === countryCode) || null;
  const selectedCurrency = CURRENCIES.find(item => item.code === currencyCode)
    || CURRENCIES.find(item => item.code === cfg.currency)
    || CURRENCIES.find(item => item.code === 'IQD')
    || CURRENCIES[0];
  const effectiveWalletName = walletName.trim() || T.walletDefaultName;

  const goNext = () => setStep(s => Math.min(STEP_COUNT - 1, s + 1));
  const goBack = () => setStep(s => Math.max(0, s - 1));

  const finish = async () => {
    if (!countryCode || !currencyCode) {
      setStep(2);
      setChoice(!countryCode ? 'country' : 'currency');
      return;
    }
    const scope = defaultScopeForProfile(profileType);
    await setCfg({
      country: countryCode,
      currency: currencyCode,
      baseCurrencyConfirmedAt: new Date().toISOString(),
      profileType,
      activeScope: scope,
      enabledModules: { ...profileModuleDefaults(profileType), commitments: true },
      demoMode: false,
      langMode: 'manual',
      lang,
      themeMode: 'manual',
      theme: themeChoice,
      onboardingPriorities: priorities,
    });
    const walletUpdated = await editWallet(DEFAULT_WALLET_ID, {
      currency: currencyCode,
      scope,
      name: effectiveWalletName,
    });
    if (walletUpdated === false) return;
    onDone();
  };

  const stepBody = () => {
    if (step === 0) {
      return <WelcomeSlide th={th} isAr={isAr} T={T} />;
    }
    if (step === 1) {
      return <PrioritySlide th={th} isAr={isAr} T={T} priorities={priorities} onToggle={(key) => setPriorities(prev => prev.includes(key) ? prev.filter(item => item !== key) : [...prev, key])} />;
    }
    if (step === 2) {
      return (
        <CustomizeSlide
          th={th} isAr={isAr} T={T}
          country={selectedCountry} currency={selectedCurrency}
          lang={lang} themeChoice={themeChoice}
          onCountry={() => setChoice('country')}
          onCurrency={() => setChoice('currency')}
          onLanguage={() => setChoice('language')}
          onAppearance={() => setChoice('appearance')}
        />
      );
    }
    if (step === 3) {
      return (
        <WalletSlide
          th={th} isAr={isAr} T={T}
          walletName={walletName} onChangeWalletName={setWalletName}
          placeholder={T.walletDefaultName}
          currency={selectedCurrency}
        />
      );
    }
    if (step === 4) {
      return <PrivacySlide th={th} isAr={isAr} T={T} agreed={privacyAgreed} onToggleAgree={() => setPrivacyAgreed(v => !v)} />;
    }
    return (
      <CompleteSlide
        th={th} isAr={isAr} T={T}
        priorities={priorities}
        country={selectedCountry} currency={selectedCurrency}
        walletName={effectiveWalletName}
      />
    );
  };

  const canAdvance = step !== 4 || privacyAgreed;

  return (
    <View style={[s.screen, { backgroundColor: th.bg }]}>
      <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.dotsRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {Array.from({ length: STEP_COUNT }).map((_, index) => (
            <View key={index} style={[s.dot, { width: index === step ? 22 : 7, backgroundColor: index === step ? th.primary : th.cardHigh }]} />
          ))}
        </View>
        <View style={[s.brandWrap, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <Text style={[s.brand, { color: th.text }]}>MYFI</Text>
          <View style={[s.brandMark, { backgroundColor: th.primary }]}>
            <Ionicons name="wallet" size={14} color={th.onPrimary} />
          </View>
        </View>
      </View>
      <View style={[s.stepMeta, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <TouchableOpacity onPress={() => setStep(STEP_COUNT - 1)}>
          <Text style={[s.skipText, { color: th.primary }]}>{T.skip}</Text>
        </TouchableOpacity>
        <Text style={[s.stepCount, { color: th.faint }]}>{isAr ? `${step + 1} من ${STEP_COUNT}` : `${step + 1} of ${STEP_COUNT}`}</Text>
      </View>

      <View style={s.stage}>{stepBody()}</View>

      <View style={s.bottomArea}>
        <TouchableOpacity
          disabled={!canAdvance}
          onPress={() => step < STEP_COUNT - 1 ? goNext() : finish()}
          activeOpacity={0.78}
          style={[s.primaryButton, { backgroundColor: canAdvance ? th.primary : th.cardHigh }]}
        >
          <Text style={[s.primaryButtonText, { color: canAdvance ? th.onPrimary : th.faint }]}>
            {step === STEP_COUNT - 1 ? T.start : (step === 0 ? T.begin : T.next)}
          </Text>
          {step === STEP_COUNT - 1 ? null : <Ionicons name={isAr ? 'arrow-back' : 'arrow-forward'} size={18} color={canAdvance ? th.onPrimary : th.faint} />}
        </TouchableOpacity>
        {step > 0 ? (
          <TouchableOpacity onPress={goBack} style={s.backButton}>
            <Text style={[s.backButtonText, { color: th.sub }]}>{T.back}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ChoiceSheet
        visible={choice === 'country'}
        title={T.chooseCountry}
        value={countryCode}
        options={COUNTRIES.map(item => ({ value: item.code, label: isAr ? item.name : item.nameEn, detail: item.currency, leading: item.flag }))}
        onSelect={(value) => {
          const country = COUNTRIES.find(item => item.code === value);
          setCountryCode(value);
          if (!currencyTouched && country?.currency) setCurrencyCode(country.currency);
        }}
        onClose={() => setChoice(null)}
        th={th}
        lang={lang}
      />
      <ChoiceSheet
        visible={choice === 'currency'}
        title={T.chooseCurrency}
        value={currencyCode}
        options={CURRENCIES.map(item => ({ value: item.code, label: isAr ? item.name : item.nameEn, detail: item.code, leading: item.sym }))}
        onSelect={(value) => { setCurrencyCode(value); setCurrencyTouched(true); }}
        onClose={() => setChoice(null)}
        th={th}
        lang={lang}
      />
      <ChoiceSheet
        visible={choice === 'language'}
        title={T.chooseLanguage}
        value={lang}
        options={[
          { value: 'ar', label: T.arabic, leading: 'ع' },
          { value: 'en', label: T.english, leading: 'EN' },
        ]}
        onSelect={(value) => setLang(value)}
        onClose={() => setChoice(null)}
        th={th}
        lang={lang}
      />
      <ChoiceSheet
        visible={choice === 'appearance'}
        title={T.chooseAppearance}
        value={themeChoice}
        options={[
          { value: 'light', label: T.light, icon: 'sunny-outline' },
          { value: 'dark', label: T.dark, icon: 'moon-outline' },
        ]}
        onSelect={(value) => setThemeChoice(value)}
        onClose={() => setChoice(null)}
        th={th}
        lang={lang}
      />
    </View>
  );
}

// Step 1 — REF-02
function WelcomeSlide({ th, isAr, T }) {
  const cards = [
    { key: 'expenses', label: T.expenses, icon: 'bar-chart-outline' },
    { key: 'planning', label: T.planning, icon: 'calendar-outline' },
    { key: 'goals', label: T.goals, icon: 'trending-up-outline' },
  ];
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.welcomeTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.welcomeBody}</Text>
      </View>
      <View style={[s.welcomeCards, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        {cards.map(card => (
          <View key={card.key} style={[s.welcomeCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.welcomeCardIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name={card.icon} size={22} color={th.primary} />
            </View>
            <Text style={[s.welcomeCardLabel, { color: th.text }]}>{card.label}</Text>
          </View>
        ))}
      </View>
      <View style={[s.trustBadge, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <Ionicons name="shield-checkmark-outline" size={16} color={th.primary} />
        <Text style={[s.trustBadgeText, { color: th.sub }]}>{T.trustBadge}</Text>
      </View>
    </View>
  );
}

// Step 2 — REF-03
function PrioritySlide({ th, isAr, T, priorities, onToggle }) {
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.priorityTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.priorityBody}</Text>
      </View>
      <View style={{ gap: 9 }}>
        {PRIORITY_KEYS.map(key => {
          const checked = priorities.includes(key);
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onToggle(key)}
              style={[
                s.priorityRow,
                { flexDirection: isAr ? 'row-reverse' : 'row', backgroundColor: checked ? th.primSoft : th.card, borderColor: checked ? th.primary : th.border },
              ]}
            >
              <Text style={[s.priorityLabel, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T[`priority_${key}`]}</Text>
              <View style={[s.priorityCheck, { backgroundColor: checked ? th.primary : 'transparent', borderColor: checked ? th.primary : th.border }]}>
                {checked ? <Ionicons name="checkmark" size={14} color={th.onPrimary} /> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={[s.hintText, { color: th.faint, textAlign: 'center' }]}>{T.priorityHint}</Text>
    </View>
  );
}

// Step 3 — REF-03B
function CustomizeSlide({ th, isAr, T, country, currency, lang, themeChoice, onCountry, onCurrency, onLanguage, onAppearance }) {
  return (
    <View style={s.slide}>
      <View style={[s.heroCopy, { marginBottom: 14 }]}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.customizeTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.customizeBody}</Text>
      </View>
      <View style={[s.setupCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <SetupRow th={th} isAr={isAr} icon="location-outline" label={T.country} value={country ? `${country.flag} ${isAr ? country.name : country.nameEn}` : T.chooseCountry} onPress={onCountry} />
        <SetupRow th={th} isAr={isAr} icon="language-outline" label={T.language} value={lang === 'ar' ? T.arabic : T.english} onPress={onLanguage} />
        <SetupRow th={th} isAr={isAr} icon="cash-outline" label={T.baseCurrency} value={currency ? `${currency.code} · ${currency.sym}` : T.chooseCurrency} onPress={onCurrency} />
        <SetupRow th={th} isAr={isAr} icon={themeChoice === 'dark' ? 'moon-outline' : 'sunny-outline'} label={T.appearance} value={themeChoice === 'dark' ? T.dark : T.light} onPress={onAppearance} last />
      </View>
      <View style={[s.privacyStrip, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.privacyStripIcon, { backgroundColor: th.primSoft }]}><Ionicons name="lock-closed-outline" size={17} color={th.primary} /></View>
        <Text style={[s.privacyStripText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.customizeNotice}</Text>
      </View>
    </View>
  );
}

// Step 4 — REF-03D
function WalletSlide({ th, isAr, T, walletName, onChangeWalletName, placeholder, currency }) {
  return (
    <View style={s.slide}>
      <View style={[s.walletIconWrap, { backgroundColor: th.primSoft }]}>
        <Ionicons name="wallet-outline" size={30} color={th.primary} />
      </View>
      <View style={[s.heroCopy, { marginTop: 14 }]}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.walletTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.walletBody}</Text>
      </View>
      <View style={[s.walletInputCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.walletNameLabel}</Text>
        <TextInput
          value={walletName}
          onChangeText={onChangeWalletName}
          placeholder={placeholder}
          placeholderTextColor={th.faint}
          style={[s.walletInput, { color: th.text, textAlign: isAr ? 'right' : 'left', borderColor: th.border }]}
        />
      </View>
      <Text style={[s.hintText, { color: th.faint, textAlign: 'center' }]}>{T.walletNameHint}</Text>
      <View style={[s.setupCard, { backgroundColor: th.card, borderColor: th.border, marginTop: 10 }]}>
        <View style={[s.setupRow, { borderBottomColor: 'transparent', flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.quickIcon, { backgroundColor: th.primSoft }]}><Ionicons name="cash-outline" size={17} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.baseCurrency}</Text>
            <Text style={[s.quickValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{currency ? `${currency.code} · ${currency.sym}` : ''}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={18} color={th.primary} />
        </View>
      </View>
      <Text style={[s.hintText, { color: th.faint, textAlign: 'center' }]}>{T.walletCurrencyConfirmed}</Text>
      <Text style={[s.hintText, { color: th.faint, textAlign: 'center', marginTop: 6 }]}>{T.walletCurrencyRule}</Text>
    </View>
  );
}

// Step 5 — REF-03C
function PrivacySlide({ th, isAr, T, agreed, onToggleAgree }) {
  const rows = [
    { icon: 'phone-portrait-outline', title: T.privacyLocal, sub: T.privacyLocalSub },
    { icon: 'sync-outline', title: T.privacySync, sub: T.privacySyncSub },
    { icon: 'shield-checkmark-outline', title: T.privacyPermissions, sub: T.privacyPermissionsSub },
  ];
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.privacyTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.privacyBody}</Text>
      </View>
      <View style={{ gap: 10 }}>
        {rows.map(row => (
          <View key={row.title} style={[s.privacyRow, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <View style={[s.privacyRowIcon, { backgroundColor: th.primSoft }]}><Ionicons name={row.icon} size={20} color={th.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={[s.privacyRowTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{row.title}</Text>
              <Text style={[s.privacyRowSub, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{row.sub}</Text>
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity
        onPress={onToggleAgree}
        style={[s.agreeRow, { backgroundColor: agreed ? th.primSoft : th.card, borderColor: agreed ? th.primary : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}
      >
        <View style={[s.priorityCheck, { backgroundColor: agreed ? th.primary : 'transparent', borderColor: agreed ? th.primary : th.border }]}>
          {agreed ? <Ionicons name="checkmark" size={14} color={th.onPrimary} /> : null}
        </View>
        <Text style={[s.agreeText, { color: th.text }]}>{T.privacyAgree}</Text>
      </TouchableOpacity>
    </View>
  );
}

// Step 6 — REF-03E
function CompleteSlide({ th, isAr, T, priorities, country, currency, walletName }) {
  const priorityLabels = priorities.map(key => T[`priority_${key}`]).join(isAr ? '، ' : ', ');
  return (
    <View style={s.slide}>
      <View style={[s.completeCheck, { backgroundColor: th.primSoft }]}>
        <Ionicons name="checkmark-circle" size={54} color={th.primary} />
      </View>
      <View style={[s.heroCopy, { marginTop: 14 }]}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.completeTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.completeBody}</Text>
      </View>
      <View style={[s.setupCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <SummaryRow th={th} isAr={isAr} icon="flag-outline" label={T.summaryPriorities} value={priorityLabels || '—'} />
        <SummaryRow th={th} isAr={isAr} icon="location-outline" label={T.summaryCountry} value={country ? `${country.flag} ${isAr ? country.name : country.nameEn}` : '—'} />
        <SummaryRow th={th} isAr={isAr} icon="cash-outline" label={T.summaryCurrency} value={currency ? `${currency.code} · ${currency.sym}` : '—'} />
        <SummaryRow th={th} isAr={isAr} icon="wallet-outline" label={T.summaryWallet} value={walletName} sub={T.summaryWalletHint} last />
      </View>
    </View>
  );
}

function SummaryRow({ th, isAr, icon, label, value, sub, last = false }) {
  return (
    <View style={[s.setupRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <View style={[s.quickIcon, { backgroundColor: th.primSoft }]}><Ionicons name={icon} size={17} color={th.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text>
        <Text style={[s.quickValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]} numberOfLines={2}>{value}</Text>
        {sub ? <Text style={[s.hintText, { color: th.faint, textAlign: isAr ? 'right' : 'left', marginTop: 2 }]}>{sub}</Text> : null}
      </View>
    </View>
  );
}

function SetupRow({ th, isAr, icon, label, value, onPress, last = false }) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.setupRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <View style={[s.quickIcon, { backgroundColor: th.primSoft }]}><Ionicons name={icon} size={17} color={th.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text>
        <Text style={[s.quickValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{value}</Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={17} color={th.faint} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  topBar: { height: 40, alignItems: 'center', justifyContent: 'space-between' },
  dotsRow: { alignItems: 'center', gap: 6 },
  dot: { height: 6, borderRadius: 3 },
  brandWrap: { alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 15, lineHeight: 21, ...weight('900'), letterSpacing: 1 },
  stepMeta: { height: 30, alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  skipText: { fontSize: 12, ...weight('900') },
  stepCount: { fontSize: 11, ...weight('800') },
  stage: { flex: 1, justifyContent: 'center' },
  slide: { width: '100%', alignItems: 'stretch' },
  heroCopy: { alignItems: 'center', marginBottom: 20 },
  heroTitle: { fontSize: 26, lineHeight: 34, textAlign: 'center', ...weight('900'), maxWidth: 340 },
  heroBody: { fontSize: 12, lineHeight: 20, textAlign: 'center', ...weight('700'), maxWidth: 340, marginTop: 8 },
  welcomeCards: { gap: 10 },
  welcomeCard: { flex: 1, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 8, paddingVertical: 16 },
  welcomeCardIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  welcomeCardLabel: { fontSize: 11, ...weight('900') },
  trustBadge: { marginTop: 16, borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', gap: 7 },
  trustBadgeText: { fontSize: 11, ...weight('800') },
  priorityRow: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  priorityLabel: { flex: 1, fontSize: 13, ...weight('800') },
  priorityCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 10 },
  setupCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginTop: 4 },
  setupRow: { minHeight: 62, borderBottomWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 9, lineHeight: 14, ...weight('800') },
  quickValue: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 1 },
  privacyStrip: { marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: 'center', gap: 10 },
  privacyStripIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  privacyStripText: { flex: 1, fontSize: 10, lineHeight: 16, ...weight('700') },
  walletIconWrap: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  walletInputCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  walletInput: { minHeight: 44, fontSize: 15, ...weight('800'), borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 },
  privacyRow: { minHeight: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', gap: 12, paddingHorizontal: 14 },
  privacyRowIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  privacyRowTitle: { fontSize: 12, ...weight('900') },
  privacyRowSub: { fontSize: 10, ...weight('700'), marginTop: 2 },
  agreeRow: { marginTop: 14, minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  agreeText: { fontSize: 12, ...weight('900') },
  completeCheck: { alignSelf: 'center', width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  bottomArea: { paddingTop: 10, gap: 8 },
  primaryButton: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { fontSize: 14, lineHeight: 20, ...weight('900') },
  backButton: { minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  backButtonText: { fontSize: 12, ...weight('800') },
});
