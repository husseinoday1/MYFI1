import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { COUNTRIES, CURRENCIES, detectSystemLang } from '../lib/constants';
import { useStore } from '../store/useStore';
import { DEFAULT_WALLET_ID } from '../lib/wallets';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { defaultScopeForProfile, profileModuleDefaults } from '../lib/modules';
import { weight } from '../lib/tokens';
import ChoiceSheet from '../components/ChoiceSheet';

// Product Owner update, 2026-08-28: replace the rigid account-type choice and
// the broad multi-select priorities page with three short personalization
// questions. Only the goals question remains intentionally multi-select:
// goals are complementary, while the other questions are mutually exclusive.
// These describe how the user wants MYFI configured; they are not
// identity labels and do not invent family sharing or bank connectivity.
const PERSONALIZATION_QUESTIONS = [
  { id: 'context', title: 'contextTitle', body: 'contextBody', fallback: 'employee', options: [
    ['student', 'school-outline'], ['employee', 'briefcase-outline'], ['freelancer', 'storefront-outline'], ['household', 'home-outline'],
  ] },
  { id: 'focus', title: 'focusTitle', body: 'focusBody', fallback: ['spending'], multiple: true, options: [
    ['spending', 'wallet-outline'], ['planning', 'calendar-outline'], ['obligations', 'time-outline'], ['saving', 'flag-outline'],
  ] },
  { id: 'moneySetup', title: 'moneySetupTitle', body: 'moneySetupBody', fallback: 'oneWallet', options: [
    ['oneWallet', 'wallet-outline'], ['multiWallet', 'albums-outline'], ['personalWork', 'swap-horizontal-outline'], ['notSure', 'help-circle-outline'],
  ] },
];

const resolvedPersonalization = answers => Object.fromEntries(
  PERSONALIZATION_QUESTIONS.map(question => {
    const answer = answers[question.id];
    const resolved = question.multiple
      ? (Array.isArray(answer) && answer.length ? answer : question.fallback)
      : (answer || question.fallback);
    return [question.id, resolved];
  }),
);

const selectedValues = value => (Array.isArray(value) ? value : (value ? [value] : []));

const profileTypeForPersonalization = answers => {
  const choice = resolvedPersonalization(answers);
  // "Freelancer" and "Personal and work" are the only selections that
  // represent two real financial scopes. Household deliberately remains a
  // personal workspace: MYFI does not imply unsupported shared accounts.
  return choice.context === 'freelancer' || choice.moneySetup === 'personalWork'
    ? 'personal_business'
    : 'personal';
};

const modulesForPersonalization = (answers, profileType) => {
  const choice = resolvedPersonalization(answers);
  const focus = selectedValues(choice.focus);
  return {
    ...profileModuleDefaults(profileType),
    wallets: choice.moneySetup === 'multiWallet' || choice.moneySetup === 'personalWork',
    debtsOwed: focus.includes('obligations'),
    debtsReceivable: choice.context === 'freelancer' || choice.moneySetup === 'personalWork',
    goals: focus.includes('saving'),
    commitments: focus.includes('obligations') || choice.context === 'household',
    budgets: focus.includes('planning') || focus.includes('spending'),
    recurring: focus.includes('obligations') || choice.context === 'freelancer',
  };
};

const copy = lang => {
  const ar = lang === 'ar';
  return {
    back: ar ? 'رجوع' : 'Back',
    next: ar ? 'متابعة' : 'Continue',
    start: ar ? 'ابدأ استخدام MYFI' : 'Start using MYFI',
    begin: ar ? 'ابدأ' : 'Start',
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
    contextTitle: ar ? 'ما الذي يصف استخدامك أكثر؟' : 'What best describes your use?',
    contextBody: ar ? 'نستخدم الإجابة لترتيب البداية فقط، ويمكنك تغييرها لاحقاً.' : 'We use this only to shape your starting setup. You can change it later.',
    context_student: ar ? 'طالب' : 'Student',
    context_studentSub: ar ? 'مصروف ودراسة وأهداف قريبة' : 'Spending, study, and near-term goals',
    context_employee: ar ? 'موظف' : 'Employee',
    context_employeeSub: ar ? 'راتب ومصروفات والتزامات' : 'Salary, spending, and commitments',
    context_freelancer: ar ? 'عمل حر' : 'Freelancer',
    context_freelancerSub: ar ? 'دخل متغير ومصاريف عمل' : 'Variable income and work costs',
    context_household: ar ? 'إدارة المنزل' : 'Household',
    context_householdSub: ar ? 'ميزانية ومصروفات والتزامات منزلية' : 'Household budget, spending, and commitments',
    focusTitle: ar ? 'ما أول نتيجة تريدها من MYFI؟' : 'What is your first goal with MYFI?',
    focusBody: ar ? 'اختر هدفاً واحداً أو أكثر؛ يمكنك اختيار الخيارات الأربعة كلها.' : 'Choose one or more goals. You can select all four.',
    focus_spending: ar ? 'ضبط المصروف' : 'Control spending',
    focus_spendingSub: ar ? 'تسجيل وفهم أين يذهب المال' : 'Track and understand where money goes',
    focus_planning: ar ? 'تخطيط الشهر' : 'Plan the month',
    focus_planningSub: ar ? 'موازنة واضحة قبل الصرف' : 'Build a clear budget before spending',
    focus_obligations: ar ? 'تنظيم الالتزامات' : 'Manage obligations',
    focus_obligationsSub: ar ? 'ديون ودفعات ومواعيد' : 'Debts, payments, and due dates',
    focus_saving: ar ? 'زيادة الادخار' : 'Grow savings',
    focus_savingSub: ar ? 'أهداف وتقدم واضح' : 'Goals with visible progress',
    moneySetupTitle: ar ? 'كيف ترتب أموالك اليوم؟' : 'How is your money organized today?',
    moneySetupBody: ar ? 'هذا يحدد هل نُظهر أدوات المحافظ المتعددة من البداية.' : 'This decides whether multi-wallet tools appear from the start.',
    moneySetup_oneWallet: ar ? 'محفظة واحدة' : 'One wallet',
    moneySetup_oneWalletSub: ar ? 'بداية بسيطة ومباشرة' : 'A simple, direct start',
    moneySetup_multiWallet: ar ? 'عدة محافظ أو حسابات' : 'Several wallets',
    moneySetup_multiWalletSub: ar ? 'نقد وبنك وادخار مثلاً' : 'Cash, bank, and savings for example',
    moneySetup_personalWork: ar ? 'شخصي وعمل' : 'Personal and work',
    moneySetup_personalWorkSub: ar ? 'تحتاج فصلاً أوضح بينهما' : 'You need a clearer separation',
    moneySetup_notSure: ar ? 'لست متأكداً' : 'Not sure yet',
    moneySetup_notSureSub: ar ? 'ابدأ بمحفظة ويمكنك التوسّع لاحقاً' : 'Start with one wallet and expand later',
    // Financial essentials
    customizeTitle: ar ? 'خصص تجربتك' : 'Customize your experience',
    customizeBody: ar ? 'اختر البلد والعملة والمظهر، ثم سمِّ محفظتك الأولى.' : 'Choose your country, currency, appearance, and name your first wallet.',
    country: ar ? 'البلد' : 'Country',
    baseCurrency: ar ? 'العملة' : 'Currency',
    appearance: ar ? 'المظهر' : 'Appearance',
    language: ar ? 'لغة التطبيق' : 'App language',
    chooseCountry: ar ? 'اختر البلد' : 'Choose country',
    chooseCurrency: ar ? 'اختر العملة' : 'Choose currency',
    chooseAppearance: ar ? 'اختر المظهر' : 'Choose appearance',
    chooseLanguage: ar ? 'اختر لغة التطبيق' : 'Choose app language',
    arabic: ar ? 'العربية' : 'Arabic',
    english: ar ? 'English' : 'English',
    light: ar ? 'فاتح' : 'Light',
    dark: ar ? 'داكن' : 'Dark',
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

// Five concise screens: welcome with its language choice, three visual
// personalization questions, then the financial essentials. Privacy remains
// a short, visible notice inside essentials instead of becoming a sixth screen.
const WELCOME_STEP = 0;
const QUESTION_START_STEP = 1;
const ESSENTIALS_STEP = QUESTION_START_STEP + PERSONALIZATION_QUESTIONS.length;
const STEP_COUNT = ESSENTIALS_STEP + 1;

export default function OnboardingScreen({ cfg, onDone }) {
  const { setCfg, editWallet } = useStore();
  const [step, setStep] = useState(0);
  // `lang` drives onboarding's own reading direction/copy across all five
  // steps from the moment it's picked on Welcome, including the default
  // wallet name and placeholder (both use T/lang, never a separately-saved
  // language) - it is a live preview only while onboarding is in progress;
  // it becomes the app's real language (cfg.lang/langMode) only once, at
  // the end, when Essentials' own Language row is confirmed and the user
  // presses Start (see finish()). Changing it again on Essentials updates
  // the preview for the rest of onboarding too, same as Welcome's toggle.
  const [lang, setLang] = useState(detectSystemLang());
  const isAr = lang === 'ar';
  // Preview the appearance choice immediately. Before this, the screen kept
  // reading cfg.theme (the previously saved preference) until Start was
  // pressed, which made the selector look broken.
  const [themeChoice, setThemeChoice] = useState(cfg.theme === 'light' ? 'light' : 'dark');
  const th = TH[themeChoice] || TH[cfg.theme] || TH.dark;
  const T = copy(lang);
  // Product default is Iraq. Existing valid saved choices are respected, but
  // a phone region must not silently replace the onboarding default.
  const initialCountry = COUNTRIES.some(item => item.code === cfg.country) ? cfg.country : 'IQ';
  const initialSuggestedCurrency = COUNTRIES.find(item => item.code === initialCountry)?.currency || '';
  const [personalization, setPersonalization] = useState({});
  const [countryCode, setCountryCode] = useState(initialCountry);
  const [currencyCode, setCurrencyCode] = useState(initialSuggestedCurrency);
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [walletName, setWalletName] = useState('');
  const [choice, setChoice] = useState(null);

  const selectedCountry = COUNTRIES.find(item => item.code === countryCode) || null;
  const selectedCurrency = CURRENCIES.find(item => item.code === currencyCode)
    || CURRENCIES.find(item => item.code === cfg.currency)
    || CURRENCIES.find(item => item.code === 'IQD')
    || CURRENCIES[0];
  // The default wallet name follows the same live language as everything
  // else on screen (T/lang) — finish() commits this same `lang` value as
  // the new app language, so the name and the app language always match.
  const effectiveWalletName = walletName.trim() || T.walletDefaultName;

  const goNext = () => setStep(s => Math.min(STEP_COUNT - 1, s + 1));
  const goBack = () => setStep(s => Math.max(0, s - 1));

  const finish = async () => {
    if (!countryCode || !currencyCode) {
      setStep(STEP_COUNT - 1);
      setChoice(!countryCode ? 'country' : 'currency');
      return;
    }
    const answers = resolvedPersonalization(personalization);
    const profileType = profileTypeForPersonalization(answers);
    const walletScope = defaultScopeForProfile(profileType);
    const focusPriorities = selectedValues(answers.focus)
      .map(key => ({ spending: 'expenses', planning: 'planning', obligations: 'debts', saving: 'goals' }[key]))
      .filter(Boolean);
    await setCfg({
      langMode: 'manual',
      lang,
      country: countryCode,
      currency: currencyCode,
      baseCurrencyConfirmedAt: new Date().toISOString(),
      profileType,
      activeScope: profileType === 'personal_business' ? 'all' : walletScope,
      enabledModules: modulesForPersonalization(answers, profileType),
      demoMode: false,
      themeMode: 'manual',
      theme: themeChoice,
      onboardingPriorities: focusPriorities,
      onboardingPersonalization: answers,
    });
    const walletUpdated = await editWallet(DEFAULT_WALLET_ID, {
      currency: currencyCode,
      scope: walletScope,
      name: effectiveWalletName,
    });
    if (walletUpdated === false) return;
    onDone();
  };

  const stepBody = () => {
    if (step === WELCOME_STEP) {
      return <WelcomeSlide th={th} isAr={isAr} T={T} selectedLanguage={lang} onSelectLanguage={setLang} />;
    }
    if (step >= QUESTION_START_STEP && step < ESSENTIALS_STEP) {
      const question = PERSONALIZATION_QUESTIONS[step - QUESTION_START_STEP];
      return (
        <PersonalizationSlide
          th={th}
          isAr={isAr}
          T={T}
          question={question}
          value={personalization[question.id]}
          onSelect={value => setPersonalization(current => ({ ...current, [question.id]: value }))}
        />
      );
    }
    if (step === ESSENTIALS_STEP) {
      return (
        <EssentialsSlide
          th={th} isAr={isAr} T={T}
          country={selectedCountry} currency={selectedCurrency}
          themeChoice={themeChoice} language={lang}
          walletName={walletName} onChangeWalletName={setWalletName}
          placeholder={T.walletDefaultName}
          onCountry={() => setChoice('country')}
          onCurrency={() => setChoice('currency')}
          onAppearance={() => setChoice('appearance')}
          onLanguage={() => setChoice('language')}
        />
      );
    }
    return null;
  };

  const activeQuestion = step >= QUESTION_START_STEP && step < ESSENTIALS_STEP
    ? PERSONALIZATION_QUESTIONS[step - QUESTION_START_STEP]
    : null;
  const activeAnswer = activeQuestion ? personalization[activeQuestion.id] : null;
  const canAdvance = activeQuestion
    ? (activeQuestion.multiple ? selectedValues(activeAnswer).length > 0 : Boolean(activeAnswer))
    : true;
  return (
    <View style={[s.screen, { backgroundColor: th.bg }]}>
      <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.dotsRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {Array.from({ length: STEP_COUNT }).map((_, index) => (
            <View key={index} style={[s.dot, { width: index === step ? 22 : 7, backgroundColor: index === step ? th.primary : th.cardHigh }]} />
          ))}
        </View>
        <View style={[s.topActions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {step === WELCOME_STEP ? <LanguagePicker th={th} selected={lang} onSelect={setLang} /> : null}
          <View style={[s.brandWrap, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.brand, { color: th.text }]}>MYFI</Text>
            <View style={[s.brandMark, { backgroundColor: th.primary }]}>
              <Ionicons name="wallet" size={14} color={th.onPrimary} />
            </View>
          </View>
        </View>
      </View>
      <View style={[s.stepMeta, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <Text style={[s.stepCount, { color: th.faint }]}>{isAr ? `${step + 1} من ${STEP_COUNT}` : `${step + 1} of ${STEP_COUNT}`}</Text>
      </View>

      <ScrollView
        style={s.stage}
        contentContainerStyle={s.stageContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {stepBody()}
      </ScrollView>

      <View style={s.bottomArea}>
        <TouchableOpacity
          disabled={!canAdvance}
          onPress={() => step < STEP_COUNT - 1 ? goNext() : finish()}
          activeOpacity={0.78}
          style={[s.primaryButton, { backgroundColor: canAdvance ? th.primary : th.cardHigh }]}
        >
          <Text style={[s.primaryButtonText, { color: canAdvance ? th.onPrimary : th.faint }]}>
            {step === STEP_COUNT - 1 ? T.start : (step === WELCOME_STEP ? T.begin : T.next)}
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
      <ChoiceSheet
        visible={choice === 'language'}
        title={T.chooseLanguage}
        value={lang}
        options={[
          { value: 'ar', label: T.arabic, icon: 'language-outline' },
          { value: 'en', label: T.english, icon: 'language-outline' },
        ]}
        onSelect={(value) => setLang(value)}
        onClose={() => setChoice(null)}
        th={th}
        lang={lang}
      />
    </View>
  );
}

// Small, unobtrusive pill toggle — top-right of Welcome only, not its own
// step, not a card grid, not titled "choose language". Switches onboarding
// reading language/direction immediately for every step; only becomes the
// app's real language when finish() runs (see the Language row on
// Essentials, which reads/writes this same value).
function LanguagePicker({ th, selected, onSelect }) {
  const options = ['ar', 'en'];
  return (
    <View style={[s.languagePicker, { borderColor: th.border, backgroundColor: th.cardHigh }]}>
      {options.map((key, index) => {
        const active = selected === key;
        return (
          <React.Fragment key={key}>
            {index > 0 ? <View style={[s.languageSeparator, { backgroundColor: th.border }]} /> : null}
            <TouchableOpacity
              onPress={() => onSelect(key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: active, selected: active }}
              accessibilityLabel={key === 'ar' ? 'AR العربية' : 'EN English'}
              style={[s.languageOption, { backgroundColor: active ? th.primSoft : 'transparent' }]}
            >
              <Text style={[s.languageCode, { color: active ? th.primary : th.sub }]}>{key.toUpperCase()}</Text>
              {active ? <Ionicons name="checkmark-circle" size={12} color={th.primary} /> : null}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
}

function WelcomeSlide({ th, isAr, T, selectedLanguage, onSelectLanguage }) {
  const cards = [
    { key: 'expenses', label: T.expenses, icon: 'bar-chart-outline' },
    { key: 'planning', label: T.planning, icon: 'calendar-outline' },
    { key: 'goals', label: T.goals, icon: 'trending-up-outline' },
  ];
  return (
    <View style={s.slide}>
      <LanguagePicker th={th} selected={selectedLanguage} onSelect={onSelectLanguage} />
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

function PersonalizationSlide({ th, isAr, T, question, value, onSelect }) {
  const values = selectedValues(value);
  const toggle = key => {
    if (!question.multiple) {
      onSelect(key);
      return;
    }
    onSelect(values.includes(key)
      ? values.filter(item => item !== key)
      : [...values, key]);
  };
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T[question.title]}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T[question.body]}</Text>
      </View>
      <View style={[s.personalizationGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        {question.options.map(([key, icon]) => {
          const selected = values.includes(key);
          return (
            <TouchableOpacity
              key={key}
              onPress={() => toggle(key)}
              accessibilityRole={question.multiple ? 'checkbox' : 'radio'}
              accessibilityState={question.multiple ? { checked: selected } : { selected }}
              style={[
                s.personalizationOption,
                {
                  backgroundColor: selected ? th.primSoft : th.card,
                  borderColor: selected ? th.primary : th.border,
                },
              ]}
            >
              <View style={[s.personalizationIcon, { backgroundColor: selected ? th.primary : th.cardHigh }]}>
                <Ionicons name={icon} size={25} color={selected ? th.onPrimary : th.primary} />
              </View>
              <Text style={[s.personalizationLabel, { color: th.text }]}>{T[`${question.id}_${key}`]}</Text>
              <Text style={[s.personalizationSub, { color: th.sub }]}>{T[`${question.id}_${key}Sub`]}</Text>
              {selected ? (
                <View style={[s.personalizationCheck, { backgroundColor: th.primary }]}>
                  <Ionicons name="checkmark" size={12} color={th.onPrimary} />
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function EssentialsSlide({
  th, isAr, T, country, currency, themeChoice, language,
  walletName, onChangeWalletName, placeholder,
  onCountry, onCurrency, onAppearance, onLanguage,
}) {
  return (
    <View style={s.slide}>
      <View style={[s.heroCopy, { marginBottom: 12 }]}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.customizeTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.customizeBody}</Text>
      </View>
      <View style={[s.setupCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <SetupRow th={th} isAr={isAr} icon="language-outline" label={T.language} value={language === 'ar' ? T.arabic : T.english} onPress={onLanguage} />
        <SetupRow th={th} isAr={isAr} icon="location-outline" label={T.country} value={country ? `${country.flag} ${isAr ? country.name : country.nameEn}` : T.chooseCountry} onPress={onCountry} />
        <SetupRow th={th} isAr={isAr} icon="cash-outline" label={T.baseCurrency} value={currency ? `${currency.code} · ${currency.sym}` : T.chooseCurrency} onPress={onCurrency} />
        <SetupRow th={th} isAr={isAr} icon={themeChoice === 'dark' ? 'moon-outline' : 'sunny-outline'} label={T.appearance} value={themeChoice === 'dark' ? T.dark : T.light} onPress={onAppearance} last />
      </View>
      <View style={[s.walletInputCard, { backgroundColor: th.card, borderColor: th.border, marginTop: 12 }]}>
        <View style={[s.walletInputHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.quickIcon, { backgroundColor: th.primSoft }]}><Ionicons name="wallet-outline" size={17} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.quickValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.walletNameLabel}</Text>
            <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.walletNameHint}</Text>
          </View>
        </View>
        <TextInput
          value={walletName}
          onChangeText={onChangeWalletName}
          placeholder={placeholder}
          placeholderTextColor={th.faint}
          style={[s.walletInput, { color: th.text, textAlign: isAr ? 'right' : 'left', borderColor: th.border }]}
        />
      </View>
      <Text style={[s.hintText, { color: th.faint, textAlign: 'center' }]}>{T.walletCurrencyRule}</Text>
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
  topActions: { alignItems: 'center', gap: 8 },
  brandWrap: { alignItems: 'center', gap: 8 },
  brandMark: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 15, lineHeight: 21, ...weight('900'), letterSpacing: 1 },
  stepMeta: { height: 30, alignItems: 'center', justifyContent: 'flex-end', marginBottom: 4 },
  stepCount: { fontSize: 11, ...weight('800') },
  stage: { flex: 1 },
  stageContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 8 },
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
  languagePicker: { alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center', borderRadius: 999, borderWidth: 1, padding: 3, marginBottom: 14 },
  languageOption: { minWidth: 36, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  languageCode: { fontSize: 10, lineHeight: 14, ...weight('900'), letterSpacing: 0.6 },
  languageSeparator: { width: 1, height: 14, marginHorizontal: 2 },
  priorityRow: { minHeight: 52, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14 },
  priorityLabel: { flex: 1, fontSize: 13, ...weight('800') },
  priorityCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  personalizationGrid: { flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  personalizationOption: { width: '48.5%', minHeight: 150, borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 14, position: 'relative' },
  personalizationIcon: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  personalizationLabel: { fontSize: 15, lineHeight: 21, textAlign: 'center', ...weight('900') },
  personalizationSub: { fontSize: 10, lineHeight: 16, textAlign: 'center', ...weight('700'), marginTop: 5 },
  personalizationCheck: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', position: 'absolute', top: 9, right: 9 },
  hintText: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 10 },
  setupCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginTop: 4 },
  setupRow: { minHeight: 62, borderBottomWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 9, lineHeight: 14, ...weight('800') },
  quickValue: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 1 },
  walletIconWrap: { alignSelf: 'center', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  walletInputCard: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8 },
  walletInputHead: { alignItems: 'center', gap: 10 },
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
