import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TH } from '../lib/theme';
import { CURRENCIES, detectSystemLang } from '../lib/constants';
import { useStore } from '../store/useStore';
import { DEFAULT_WALLET_ID } from '../lib/wallets';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { defaultScopeForProfile, profileModuleDefaults } from '../lib/modules';
import { getOnboardingPreview } from '../lib/onboardingPreview';
import { weight } from '../lib/tokens';

const copy = lang => {
  const ar = lang === 'ar';
  return {
    skip: ar ? 'تخطي' : 'Skip',
    next: ar ? 'التالي' : 'Next',
    start: ar ? 'ابدأ استخدام MYFI' : 'Start using MYFI',
    heroTitle: ar ? 'كل أموالك.\nبصورة أوضح.' : 'All your money.\nMuch clearer.',
    trustTitle: ar ? 'جاهز تبدأ بدون تعقيد' : 'Ready without friction',
    trustBody: ar
      ? 'MYFI يعطيك بداية نظيفة: سجل واضح، محرك مالي موحد، وحماية بيانات من أول يوم.'
      : 'MYFI gives you a clean start: a clear ledger, one financial engine, and data safety from day one.',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    localFirst: ar ? 'Local-first' : 'Local-first',
    promiseTitle: ar ? 'الأساس جاهز' : 'The foundation is ready',
    unifiedEngine: ar ? 'محرك مالي موحّد' : 'Unified financial engine',
    unifiedEngineSub: ar ? 'كل حركة لها أثر مالي واضح بدل نسخ متفرقة من نفس البيانات.' : 'Every entry has one clear financial effect instead of duplicated data.',
    localFirstSub: ar ? 'بياناتك تبدأ على هذا الهاتف، واستخدام التطبيق لا يحتاج حساباً.' : 'Your data starts on this phone, and the app works without an account.',
    backupReady: ar ? 'نسخ احتياطي واستعادة' : 'Backup and restore',
    backupReadySub: ar ? 'ملفات MYFI منطقية، قابلة للتشفير، ومناسبة لتغير النموذج مستقبلاً.' : 'MYFI backups are logical, encryptable, and ready for future model changes.',
  };
};

export default function OnboardingScreen({ cfg, onDone }) {
  const { setCfg, editWallet } = useStore();
  const [step, setStep] = useState(0);
  const lang = detectSystemLang();
  const isAr = lang === 'ar';
  const th = TH[cfg.theme] || TH.dark;
  const T = copy(lang);

  const selectedCurrency = CURRENCIES.find(item => item.code === cfg.currency) || CURRENCIES.find(item => item.code === 'IQD') || CURRENCIES[0];
  const preview = useMemo(() => getOnboardingPreview({
    symbol: selectedCurrency.sym,
    profileType: 'personal',
    lang,
  }), [selectedCurrency.code, selectedCurrency.sym, lang]);

  const finish = async () => {
    const type = 'personal';
    const currency = cfg.currency || selectedCurrency.code || 'IQD';
    await setCfg({
      currency,
      profileType: type,
      activeScope: defaultScopeForProfile(type),
      enabledModules: { ...profileModuleDefaults(type), commitments: true },
      demoMode: false,
    });
    await editWallet(DEFAULT_WALLET_ID, {
      currency,
      scope: defaultScopeForProfile(type),
    });
    onDone();
  };
  return (
    <View style={[s.screen, { backgroundColor: th.bg }]}>
      <View style={[s.topBar, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.brandWrap, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View style={[s.brandMark, { backgroundColor: th.primary }]}>
            <Ionicons name="wallet" size={16} color={th.onPrimary} />
          </View>
          <Text style={[s.brand, { color: th.text }]}>MYFI</Text>
        </View>
        <TouchableOpacity onPress={finish} style={s.skipBtn}>
          <Text style={[s.skipText, { color: th.sub }]}>{T.skip}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.stage}>
        {step === 0 ? <HeroSlide th={th} isAr={isAr} T={T} preview={preview} /> : null}
        {step === 1 ? <InsightSlide th={th} isAr={isAr} T={T} preview={preview} /> : null}
        {step === 2 ? (
          <TrustSlide
            th={th}
            isAr={isAr}
            T={T}
          />
        ) : null}
      </View>

      <View style={s.bottomArea}>
        <View style={[s.dots, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {[0, 1, 2].map(index => (
            <View key={index} style={[s.dot, { width: index === step ? 24 : 7, backgroundColor: index === step ? th.primary : th.cardHigh }]} />
          ))}
        </View>
        <TouchableOpacity
          onPress={() => step < 2 ? setStep(step + 1) : finish()}
          activeOpacity={0.78}
          style={[s.primaryButton, { backgroundColor: th.primary }]}
        >
          <Text style={[s.primaryButtonText, { color: th.onPrimary }]}>{step === 2 ? T.start : T.next}</Text>
          <Ionicons name={isAr ? 'arrow-back' : 'arrow-forward'} size={18} color={th.onPrimary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function HeroSlide({ th, isAr, T, preview }) {
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.heroTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{preview.heroBody}</Text>
      </View>

      <View style={[s.dashboardCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.dashboardTop, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <View>
            <Text style={[s.dashboardLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{preview.balance}</Text>
            <Text style={[s.balanceValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{preview.balanceValue}</Text>
          </View>
          <View style={[s.walletBadge, { backgroundColor: th.primSoft }]}><Ionicons name="wallet-outline" size={19} color={th.primary} /></View>
        </View>
        <View style={[s.moneyGrid, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          <MoneyTile th={th} label={preview.income} value={preview.incomeValue} tone={th.inc} icon="arrow-down-outline" />
          <MoneyTile th={th} label={preview.expense} value={preview.expenseValue} tone={th.exp} icon="arrow-up-outline" />
        </View>
        <View style={s.chartWrap}>
          <View style={[s.chartHead, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.chartLabel, { color: th.sub }]}>{T.thisMonth}</Text>
            <Text style={[s.chartChange, { color: th.inc }]}>+12%</Text>
          </View>
          <View style={s.chartBars}>
            {[28, 40, 31, 55, 48, 66, 60, 78, 70, 88].map((height, index) => (
              <View key={index} style={[s.chartBar, { height, backgroundColor: index >= 7 ? th.primary : th.cardHigh }]} />
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

function MoneyTile({ th, label, value, tone, icon }) {
  return (
    <View style={[s.moneyTile, { backgroundColor: th.cardHigh }]}>
      <View style={[s.moneyTileHead, { flexDirection: 'row' }]}>
        <Ionicons name={icon} size={13} color={tone} />
        <Text style={[s.moneyTileLabel, { color: th.sub }]}>{label}</Text>
      </View>
      <Text style={[s.moneyTileValue, { color: tone }]}>{value}</Text>
    </View>
  );
}

function InsightSlide({ th, isAr, T, preview }) {
  return (
    <View style={s.slide}>
      <View style={s.heroCopy}>
        <Text style={[s.heroTitle, { color: th.text }]}>{preview.insightTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{preview.insightBody}</Text>
      </View>
      <View style={[s.insightCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={[s.insightAmount, { color: th.text }]}>{preview.spendingValue}</Text>
        <Text style={[s.insightCaption, { color: th.sub }]}>{T.thisMonth}</Text>
        <View style={s.donutWrap}>
          <View style={[s.donutOuter, { borderColor: th.cardHigh }]}>
            <View style={[s.donutArc, { borderColor: th.primary }]} />
            <View style={[s.donutInner, { backgroundColor: th.card }]}><Ionicons name="analytics-outline" size={24} color={th.primary} /></View>
          </View>
        </View>
        <View style={s.insightRows}>
          {preview.rows.map((row, index) => (
            <View key={row.label} style={[s.insightRow, { borderBottomColor: index === preview.rows.length - 1 ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
              <View style={[s.insightIcon, { backgroundColor: th.primSoft }]}><Ionicons name={row.icon} size={15} color={th.primary} /></View>
              <Text style={[s.insightRowLabel, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{row.label}</Text>
              <Text style={[s.insightRowValue, { color: th.sub }]}>{row.value}</Text>
              <Text style={[s.insightPct, { color: th.primary }]}>{row.pct}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function TrustSlide({ th, isAr, T }) {
  const items = [
    { icon: 'git-branch-outline', title: T.unifiedEngine, body: T.unifiedEngineSub },
    { icon: 'phone-portrait-outline', title: T.localFirst, body: T.localFirstSub },
    { icon: 'archive-outline', title: T.backupReady, body: T.backupReadySub },
  ];
  return (
    <View style={s.slide}>
      <View style={[s.heroCopy, { marginBottom: 16 }]}>
        <Text style={[s.heroTitle, { color: th.text }]}>{T.trustTitle}</Text>
        <Text style={[s.heroBody, { color: th.sub }]}>{T.trustBody}</Text>
      </View>

      <Text style={[s.quickSetupLabel, { color: th.primary, textAlign: isAr ? 'right' : 'left' }]}>{T.promiseTitle}</Text>
      <View style={[s.quickSetupCard, { backgroundColor: th.card, borderColor: th.border }]}>
        {items.map((item, index) => (
          <PromiseRow
            key={item.title}
            th={th}
            isAr={isAr}
            icon={item.icon}
            title={item.title}
            body={item.body}
            last={index === items.length - 1}
          />
        ))}
      </View>

      <View style={[s.privacyStrip, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
        <View style={[s.privacyStripIcon, { backgroundColor: th.primSoft }]}>
          <Ionicons name="shield-checkmark-outline" size={17} color={th.primary} />
        </View>
        <Text style={[s.privacyStripText, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>
          {isAr ? 'ابدأ الآن. MYFI لا يطلب إعدادات كثيرة قبل أن ترى قيمة التطبيق.' : 'Start now. MYFI does not ask for heavy setup before showing its value.'}
        </Text>
      </View>
    </View>
  );
}

function PromiseRow({ th, isAr, icon, title, body, last = false }) {
  return (
    <View style={[s.quickRow, { borderBottomColor: last ? 'transparent' : th.border, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
      <View style={[s.quickIcon, { backgroundColor: th.primSoft }]}><Ionicons name={icon} size={16} color={th.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={[s.quickValue, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{title}</Text>
        <Text style={[s.quickLabel, { color: th.sub, textAlign: isAr ? 'right' : 'left' }]}>{body}</Text>
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 18 },
  topBar: { height: 44, alignItems: 'center', justifyContent: 'space-between' },
  brandWrap: { alignItems: 'center', gap: 8 },
  brandMark: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 16, lineHeight: 22, ...weight('900'), letterSpacing: 1 },
  skipBtn: { minWidth: 54, height: 36, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 12, ...weight('900') },
  stage: { flex: 1, justifyContent: 'center' },
  slide: { width: '100%', alignItems: 'stretch' },
  heroCopy: { alignItems: 'center', marginBottom: 22 },
  heroTitle: { fontSize: 29, lineHeight: 39, textAlign: 'center', ...weight('900'), maxWidth: 340 },
  heroBody: { fontSize: 12, lineHeight: 20, textAlign: 'center', ...weight('700'), maxWidth: 340, marginTop: 8 },
  dashboardCard: { borderRadius: 22, borderWidth: 1, padding: 15 },
  dashboardTop: { alignItems: 'center', justifyContent: 'space-between' },
  dashboardLabel: { fontSize: 10, lineHeight: 15, ...weight('800') },
  balanceValue: { fontSize: 19, lineHeight: 27, ...weight('900'), marginTop: 2 },
  walletBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  moneyGrid: { gap: 9, marginTop: 14 },
  moneyTile: { flex: 1, borderRadius: 15, padding: 11 },
  moneyTileHead: { alignItems: 'center', gap: 5 },
  moneyTileLabel: { fontSize: 9, lineHeight: 14, ...weight('800') },
  moneyTileValue: { fontSize: 13, lineHeight: 19, ...weight('900'), marginTop: 6 },
  chartWrap: { marginTop: 14 },
  chartHead: { alignItems: 'center', justifyContent: 'space-between' },
  chartLabel: { fontSize: 10, lineHeight: 15, ...weight('800') },
  chartChange: { fontSize: 10, lineHeight: 15, ...weight('900') },
  chartBars: { height: 94, flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 9 },
  chartBar: { flex: 1, borderRadius: 4, minHeight: 18 },
  insightCard: { borderRadius: 22, borderWidth: 1, padding: 15, alignItems: 'center' },
  insightAmount: { fontSize: 18, lineHeight: 25, ...weight('900') },
  insightCaption: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 1 },
  donutWrap: { marginVertical: 13 },
  donutOuter: { width: 104, height: 104, borderRadius: 52, borderWidth: 14, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  donutArc: { position: 'absolute', width: 104, height: 104, borderRadius: 52, borderWidth: 14, borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: [{ rotate: '28deg' }] },
  donutInner: { width: 61, height: 61, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  insightRows: { width: '100%' },
  insightRow: { minHeight: 48, borderBottomWidth: 1, alignItems: 'center', gap: 8 },
  insightIcon: { width: 31, height: 31, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  insightRowLabel: { flex: 1, fontSize: 11, lineHeight: 16, ...weight('900') },
  insightRowValue: { fontSize: 10, lineHeight: 15, ...weight('800') },
  insightPct: { width: 34, fontSize: 10, lineHeight: 15, textAlign: 'right', ...weight('900') },
  cloudVisual: { height: 122, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  deviceMock: { width: 66, height: 96, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cloudCenter: { alignItems: 'center', justifyContent: 'center', width: 84 },
  cloudCircle: { width: 70, height: 70, borderRadius: 35, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  cloudLine: { position: 'absolute', width: 92, height: 2 },
  trustBadges: { gap: 8, justifyContent: 'center', marginTop: 6 },
  trustBadge: { minHeight: 34, borderRadius: 17, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5 },
  quickSetupLabel: { fontSize: 11, lineHeight: 16, ...weight('900'), marginTop: 18, marginBottom: 7, paddingHorizontal: 3 },
  quickSetupCard: { borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  profileDescriptionRow: { borderBottomWidth: 1, paddingHorizontal: 12, paddingTop: 2, paddingBottom: 10 },
  profileDescriptionText: { fontSize: 9, lineHeight: 15, ...weight('700') },
  privacyStrip: { marginTop: 12, borderRadius: 16, borderWidth: 1, padding: 12, alignItems: 'center', gap: 10 },
  privacyStripIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  privacyStripText: { flex: 1, fontSize: 10, lineHeight: 16, ...weight('700') },
  quickRow: { minHeight: 54, borderBottomWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 12 },
  quickIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 9, lineHeight: 14, ...weight('800') },
  quickValue: { fontSize: 12, lineHeight: 18, ...weight('900'), marginTop: 1 },
  bottomArea: { paddingTop: 10 },
  dots: { height: 20, justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 9 },
  dot: { height: 6, borderRadius: 3 },
  primaryButton: { minHeight: 54, borderRadius: 17, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9 },
  primaryButtonText: { fontSize: 14, lineHeight: 20, ...weight('900') },
});
