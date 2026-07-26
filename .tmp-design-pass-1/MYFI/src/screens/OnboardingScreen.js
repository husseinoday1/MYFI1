import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Touchable } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { COUNTRIES } from '../lib/constants';
import { DEFAULT_WALLET_ID } from '../lib/wallets';
import { useStore } from '../store/useStore';
import ChoiceSheet from '../components/ChoiceSheet';
import { profileModuleDefaults } from '../lib/modules';

const preferredCountries = ['IQ', 'SA', 'KW', 'AE', 'QA', 'BH', 'OM', 'JO', 'EG', 'US', 'GB', 'EU'];

const stepText = (lang) => {
  const ar = lang === 'ar';
  return {
    skip: ar ? 'تخطي' : 'Skip',
    next: ar ? 'التالي' : 'Next',
    back: ar ? 'رجوع' : 'Back',
    start: ar ? 'ابدأ الآن' : 'Start now',
    welcomeTitle: ar ? 'فلوسك تحتاج بداية أوضح' : 'Your money needs a clearer start',
    welcomeBody: ar
      ? 'MYFI يضبط لك التجربة من أول تشغيل: نوع الاستخدام، العملة، والميزات التي تحتاجها فقط.'
      : 'MYFI sets up the right experience from the first launch: use type, currency, and only the features you need.',
    identityTitle: ar ? 'هويتك المالية' : 'Your financial setup',
    identityBody: ar ? 'اختر طريقة استخدامك للتطبيق حتى نرتب الشاشات والميزات بشكل منطقي.' : 'Choose how you plan to use MYFI so the app can stay focused and useful.',
    needsTitle: ar ? 'ما الذي تريد متابعته؟' : 'What do you want to track?',
    needsBody: ar ? 'اختر الأساسيات التي تريد أن تظهر لك. يمكن تعديلها لاحقاً من الإعدادات.' : 'Pick the essentials you want to see. You can change them later in settings.',
    reviewTitle: ar ? 'كل شيء جاهز تقريباً' : 'Almost ready',
    reviewBody: ar ? 'هذه التجربة الأولية التي سنبدأ بها.' : 'This is the starter setup we will use.',
    profile: ar ? 'نوع الحساب' : 'Account type',
    country: ar ? 'الدولة' : 'Country',
    language: ar ? 'اللغة' : 'Language',
    currency: ar ? 'العملة' : 'Currency',
    activeFeatures: ar ? 'الميزات المفعلة' : 'Enabled features',
    personal: ar ? 'شخصي' : 'Personal',
    business: ar ? 'مشروع بسيط' : 'Small business',
    mixed: ar ? 'شخصي + مشروع' : 'Personal + business',
    personalDetail: ar ? 'دخل، صرف، ديون، وأهداف' : 'Income, spending, debts, and goals',
    businessDetail: ar ? 'إيرادات، مصاريف، ومستحقات' : 'Revenue, expenses, and receivables',
    mixedDetail: ar ? 'فصل حياتك الشخصية عن المشروع' : 'Separate personal life from business',
    wallets: ar ? 'محافظ متعددة' : 'Multiple wallets',
    debtsOwed: ar ? 'ديون عليّ' : 'Debts I owe',
    debtsReceivable: ar ? 'ديون لي' : 'Money owed to me',
    goals: ar ? 'أهداف توفير' : 'Saving goals',
    commitments: ar ? 'التزامات شهرية' : 'Monthly commitments',
    quickEntry: ar ? 'إدخال سريع' : 'Quick entry',
    selected: ar ? 'مختار' : 'Selected',
  };
};

export default function OnboardingScreen({ cfg, onDone }) {
  const { setCfg, editWallet } = useStore();
  const [step, setStep] = useState(0);
  const [countryCode, setCountryCode] = useState(cfg.country || 'IQ');
  const [lang, setLang] = useState(cfg.lang || 'ar');
  const [profileType, setProfileType] = useState(cfg.profileType || 'personal');
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

  const countries = useMemo(
    () => preferredCountries.map(code => COUNTRIES.find(c => c.code === code)).filter(Boolean),
    [],
  );
  const selectedCountry = COUNTRIES.find(c => c.code === countryCode) || COUNTRIES[0];

  const profileOptions = [
    { value: 'personal', label: T.personal, detail: T.personalDetail, icon: 'person-outline' },
    { value: 'business', label: T.business, detail: T.businessDetail, icon: 'storefront-outline' },
    { value: 'personal_business', label: T.mixed, detail: T.mixedDetail, icon: 'albums-outline' },
  ];

  const languageOptions = [
    { value: 'ar', label: 'العربية', detail: 'RTL', icon: 'language-outline' },
    { value: 'en', label: 'English', detail: 'LTR', icon: 'language-outline' },
  ];

  const countryOptions = countries.map(country => ({
    value: country.code,
    label: lang === 'ar' ? country.name : country.nameEn,
    detail: `${country.currency} · ${country.sym}`,
    leading: country.flag,
    country,
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
      quickEntry: true,
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
        setLang(option.country.lang === 'ar' ? 'ar' : lang);
      },
    },
    language: {
      title: T.language,
      value: lang,
      options: languageOptions,
      onSelect: setLang,
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
      currency: selectedCountry.currency,
      lang,
      profileType,
      enabledModules,
    });
    if (enabledModules.wallets) {
      const balance = Number(String(openingBalance || '').replace(/[^0-9.-]/g, '')) || 0;
      const name = walletName.trim() || walletText.title;
      await editWallet(DEFAULT_WALLET_ID, {
        name,
        nameEn: name,
        currency: selectedCountry.currency,
        openingBalance: balance,
      });
    }
    onDone();
  };

  const renderIdentityRow = ({ icon, label, value, onPress }) => (
    <Touchable
      onPress={onPress}
      style={[s.selectRow, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}
    >
      <View style={[s.selectIcon, { backgroundColor: th.primSoft }]}>
        <Ionicons name={icon} size={17} color={th.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.selectLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{label}</Text>
        <Text style={[s.selectValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{value}</Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />
    </Touchable>
  );

  const nextStep = () => {
    if (step < 2) setStep(step + 1);
    else finish();
  };

  return (
    <View style={[s.wrap, { backgroundColor: th.bg }]}>
      <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <Touchable onPress={finish} style={s.skipBtn}>
          <Text style={{ color: th.faint, fontSize: 13 }}>{T.skip}</Text>
        </Touchable>
        <View style={[s.steps, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {[0, 1, 2].map(index => (
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

      {step === 0 ? (
        <View style={s.hero}>
          <View style={[s.mark, { backgroundColor: th.primaryContainer }]}>
            <Ionicons name="sparkles-outline" size={52} color={th.onPrimaryContainer} />
          </View>
          <Text style={[s.logo, { color: th.primary }]}>MYFI</Text>
          <Text style={[s.title, { color: th.text }]}>{T.welcomeTitle}</Text>
          <Text style={[s.body, { color: th.sub }]}>{T.welcomeBody}</Text>

          <View style={[s.previewCard, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.previewRow, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <PreviewBadge icon="wallet-outline" label={T.currency} value={`${selectedCountry.currency} · ${selectedCountry.sym}`} th={th} />
              <PreviewBadge icon="language-outline" label={T.language} value={lang === 'ar' ? 'العربية' : 'English'} th={th} />
            </View>
            <View style={[s.previewRow, { flexDirection: isAr ? 'row-reverse' : 'row', marginTop: 10 }]}>
              <PreviewBadge icon="person-outline" label={T.profile} value={profileOptions.find(item => item.value === profileType)?.label || T.personal} th={th} />
              <PreviewBadge icon="grid-outline" label={T.activeFeatures} value={`${activeFeatures.length}`} th={th} />
            </View>
          </View>
        </View>
      ) : step === 1 ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
          <Text style={[s.title, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.identityTitle}</Text>
          <Text style={[s.sectionBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.identityBody}</Text>

          <View style={s.profileGrid}>
            {profileOptions.map(option => {
              const active = profileType === option.value;
              return (
                <Touchable
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
                  <View style={[s.profileIcon, { backgroundColor: active ? th.primary : th.cardHigh }]}>
                    <Ionicons name={option.icon} size={18} color={active ? th.onPrimary : th.sub} />
                  </View>
                  <Text style={{ color: active ? th.primary : th.text, fontSize: 14, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>
                    {option.label}
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 11, marginTop: 6, lineHeight: 17, textAlign: isAr ? 'right' : 'left' }}>
                    {option.detail}
                  </Text>
                </Touchable>
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
              value: lang === 'ar' ? 'العربية' : 'English',
              onPress: () => setChoiceSheet('language'),
            })}
            <View style={[s.currencyBox, { backgroundColor: th.card, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[s.selectIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="cash-outline" size={17} color={th.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.selectLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.currency}</Text>
                <Text style={[s.selectValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{selectedCountry.currency} · {selectedCountry.sym}</Text>
              </View>
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.content}>
          <Text style={[s.title, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.needsTitle}</Text>
          <Text style={[s.sectionBody, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{T.needsBody}</Text>

          <View style={[s.needsGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            {featureRows.map(([key, label, icon]) => {
              const active = !!needs[key];
              const forced = !!profileModuleDefaults(profileType)[key] && (key === 'wallets' || key === 'debtsReceivable');
              return (
                <Touchable
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
                  <View style={[s.needIcon, { backgroundColor: active ? th.primary : th.cardHigh }]}>
                    <Ionicons name={icon} size={16} color={active ? th.onPrimary : th.sub} />
                  </View>
                  <Text style={{ color: active ? th.primary : th.text, fontSize: 12, ...weight('900'), textAlign: 'center' }}>
                    {label}
                  </Text>
                  {forced ? (
                    <Text style={{ color: th.faint, fontSize: 10, marginTop: 5 }}>{T.selected}</Text>
                  ) : null}
                </Touchable>
              );
            })}
          </View>

          {enabledModules.wallets ? (
            <View style={[s.walletStart, { backgroundColor: th.card, borderColor: th.border }]}>
              <View style={[s.walletStartHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
                <View style={[s.selectIcon, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="wallet-outline" size={17} color={th.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: th.text, fontSize: 15, ...weight('900'), textAlign: isAr ? 'right' : 'left' }}>{walletText.title}</Text>
                  <Text style={{ color: th.sub, fontSize: 11, marginTop: 3, lineHeight: 17, textAlign: isAr ? 'right' : 'left' }}>{walletText.body}</Text>
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
                onChangeText={setOpeningBalance}
                keyboardType="numeric"
                placeholder={`${walletText.balance} (${selectedCountry.currency})`}
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
              <ReviewRow label={T.currency} value={`${selectedCountry.currency} · ${selectedCountry.sym}`} th={th} isAr={isAr} />
              <ReviewRow label={T.activeFeatures} value={String(activeFeatures.length)} th={th} isAr={isAr} />
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
          <Touchable onPress={() => setStep(step - 1)} style={[s.secondaryBtn, { backgroundColor: th.cardHigh }]}>
            <Text style={{ color: th.sub, ...weight('900'), fontSize: 14 }}>{T.back}</Text>
          </Touchable>
        ) : <View style={{ flex: 1 }} />}
        <Touchable onPress={nextStep} style={[s.primaryBtn, { backgroundColor: th.primary }]}>
          <Text style={{ color: th.onPrimary, ...weight('900'), fontSize: 15 }}>
            {step === 2 ? T.start : T.next}
          </Text>
        </Touchable>
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
    </View>
  );
}

function PreviewBadge({ icon, label, value, th }) {
  return (
    <View style={[s.previewBadge, { backgroundColor: th.cardHigh }]}>
      <Ionicons name={icon} size={14} color={th.primary} />
      <Text style={{ color: th.faint, fontSize: 10, ...weight('900') }}>{label}</Text>
      <Text style={{ color: th.text, fontSize: 12, ...weight('900') }} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function ReviewRow({ label, value, th, isAr }) {
  return (
    <View style={[s.reviewRow, { flexDirection: isAr ? 'row-reverse' : 'row', borderBottomColor: th.border }]}>
      <Text style={{ color: th.sub, fontSize: 11, ...weight('800') }}>{label}</Text>
      <Text style={{ color: th.text, fontSize: 12, ...weight('900') }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 18 },
  topBar: { alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  skipBtn: { padding: 8 },
  steps: { gap: 6, alignItems: 'center' },
  stepDot: { width: 26, height: 5, borderRadius: 999 },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 18 },
  mark: { width: 112, height: 112, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  logo: { fontSize: 34, ...weight('900'), letterSpacing: 1, marginBottom: 10 },
  title: { fontSize: 24, ...weight('900'), marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 320 },
  previewCard: { width: '100%', borderRadius: 18, borderWidth: 0.5, padding: 14, marginTop: 24 },
  previewRow: { gap: 10 },
  previewBadge: { flex: 1, borderRadius: 14, padding: 12, minHeight: 84 },
  content: { paddingBottom: 10 },
  sectionBody: { fontSize: 13, lineHeight: 20, marginBottom: 14 },
  profileGrid: { gap: 10, marginBottom: 14 },
  profileCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  profileIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  selectGroup: { gap: 10 },
  selectRow: { borderWidth: 0.5, borderRadius: 14, padding: 13, alignItems: 'center', gap: 10 },
  selectIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selectLabel: { fontSize: 11, ...weight('900'), marginBottom: 3 },
  selectValue: { fontSize: 15, ...weight('900') },
  currencyBox: { borderWidth: 0.5, borderRadius: 14, padding: 13, alignItems: 'center', gap: 10 },
  needsGrid: { flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  needCard: { width: '48.5%', borderWidth: 1, borderRadius: 16, padding: 12, alignItems: 'center', minHeight: 102, justifyContent: 'center' },
  needIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  walletStart: { borderWidth: 0.5, borderRadius: 16, padding: 14, marginBottom: 14 },
  walletStartHead: { alignItems: 'center', gap: 10, marginBottom: 12 },
  input: { minHeight: 46, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10, borderWidth: 0.5, marginBottom: 9, fontSize: 14, lineHeight: 19, ...weight('700') },
  reviewCard: { borderWidth: 0.5, borderRadius: 16, padding: 14 },
  reviewList: { marginBottom: 12 },
  reviewRow: { justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 0.5 },
  tags: { flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 12 },
  footer: { gap: 10, marginTop: 12 },
  secondaryBtn: { flex: 1, borderRadius: 16, padding: 15, alignItems: 'center' },
  primaryBtn: { flex: 1.4, borderRadius: 16, padding: 15, alignItems: 'center' },
});
