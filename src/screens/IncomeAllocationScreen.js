import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { DEF_INCOME_ALLOCATION_PLAN, INCOME_ALLOCATION_BUCKETS, normalizeIncomeAllocationPlan } from '../lib/constants';
import { AppButton, ScreenScroll, SectionTitle, SurfaceCard, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SPACE, weight } from '../lib/tokens';

const PRESETS = {
  balanced: { needs: 50, wants: 30, savings: 20, debt: 0, investment: 0 },
  debtFirst: { needs: 50, wants: 15, savings: 10, debt: 25, investment: 0 },
  saveFirst: { needs: 50, wants: 20, savings: 25, debt: 5, investment: 0 },
};

const bucketCopy = (isAr) => ({
  needs: { title: isAr ? 'الأساسيات' : 'Essentials', icon: 'home-outline', description: isAr ? 'سكن، فواتير، طعام وتنقل' : 'Housing, bills, food, and transport' },
  wants: { title: isAr ? 'مصاريف مرنة' : 'Flexible spending', icon: 'sparkles-outline', description: isAr ? 'ترفيه وشراء اختياري' : 'Lifestyle and optional spending' },
  savings: { title: isAr ? 'ادخار وأهداف' : 'Savings & goals', icon: 'flag-outline', description: isAr ? 'طوارئ وأهدافك القادمة' : 'Emergency fund and future goals' },
  debt: { title: isAr ? 'سداد ديون' : 'Debt repayment', icon: 'card-outline', description: isAr ? 'فوق الحد الأدنى عند الإمكان' : 'Above minimum payments when possible' },
  investment: { title: isAr ? 'مخصص للاستثمار' : 'Investment allocation', icon: 'trending-up-outline', description: isAr ? 'مبلغ تخطيط فقط، وليس توصية' : 'Planning only, not investment advice' },
});

const strategyCopy = (isAr) => ([
  { key: 'balanced', title: '50 / 30 / 20', description: isAr ? 'نقطة بداية متوازنة' : 'A balanced starting point' },
  { key: 'debtFirst', title: isAr ? 'الديون أولًا' : 'Debt first', description: isAr ? 'ارفع السداد وخفف المرن' : 'Prioritize repayment' },
  { key: 'saveFirst', title: isAr ? 'الادخار أولًا' : 'Save first', description: isAr ? 'ارفع الادخار والأهداف' : 'Prioritize saving and goals' },
  { key: 'custom', title: isAr ? 'خطة مخصصة' : 'Custom plan', description: isAr ? 'اضبطها بنفسك' : 'Set your own percentages' },
]);

const clampPercent = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

export default function IncomeAllocationScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const { setCfg } = useStore();
  const stored = normalizeIncomeAllocationPlan(cfg.incomeAllocationPlan || DEF_INCOME_ALLOCATION_PLAN);
  const [strategy, setStrategy] = useState(stored.strategy);
  const [incomeText, setIncomeText] = useState(stored.income > 0 ? String(stored.income) : '');
  const [allocations, setAllocations] = useState(stored.allocations);
  const [saved, setSaved] = useState(false);
  const income = Math.max(0, Number(String(incomeText).replace(/,/g, '')) || 0);
  const total = INCOME_ALLOCATION_BUCKETS.reduce((sum, key) => sum + clampPercent(allocations[key]), 0);
  const valid = income > 0 && total === 100;
  const buckets = bucketCopy(isAr);
  const strategies = strategyCopy(isAr);

  const values = useMemo(() => INCOME_ALLOCATION_BUCKETS.reduce((next, key) => ({
    ...next,
    [key]: income * (clampPercent(allocations[key]) / 100),
  }), {}), [income, allocations]);

  const chooseStrategy = (next) => {
    setStrategy(next);
    if (PRESETS[next]) setAllocations(PRESETS[next]);
    setSaved(false);
  };

  const setPercent = (key, value) => {
    setStrategy('custom');
    setAllocations(current => ({ ...current, [key]: clampPercent(value) }));
    setSaved(false);
  };

  const save = async () => {
    if (!valid) return;
    await setCfg({
      incomeAllocationPlan: {
        version: 1,
        strategy,
        income,
        allocations: INCOME_ALLOCATION_BUCKETS.reduce((next, key) => ({ ...next, [key]: clampPercent(allocations[key]) }), {}),
        updatedAt: new Date().toISOString(),
      },
    });
    setSaved(true);
  };

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'توزيع الدخل' : 'Income allocation'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>
          {isAr ? 'خطة عملية لدخلك، قابلة للتعديل دائمًا.' : 'A practical income plan you can adjust anytime.'}
        </Text>
      </View>

      <SurfaceCard th={th} style={s.incomeCard}>
        <View style={[s.incomeHead, { flexDirection: rowDirection(lang) }]}>
          <View style={[s.incomeIcon, { backgroundColor: th.primSoft }]}><Ionicons name="cash-outline" size={21} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.incomeLabel, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'دخلك الصافي للشهر' : 'Your monthly net income'}</Text>
            <Text style={[s.incomeHint, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'اكتب المبلغ الذي تريد التخطيط له.' : 'Enter the amount you want to plan.'}</Text>
          </View>
        </View>
        <View style={[s.incomeField, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
          <TextInput
            accessibilityLabel={isAr ? 'الدخل الصافي الشهري' : 'Monthly net income'}
            keyboardType="decimal-pad"
            value={incomeText}
            onChangeText={(value) => { setIncomeText(value.replace(/[^0-9.,]/g, '')); setSaved(false); }}
            placeholder="0"
            placeholderTextColor={th.faint}
            style={[s.incomeInput, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}
          />
          <Text style={[s.currency, { color: th.sub }]}>{cfg.currency}</Text>
        </View>
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'ابدأ بخطة' : 'Start with a plan'}</SectionTitle>
      <View style={s.strategyList}>
        {strategies.map(item => {
          const active = strategy === item.key;
          return (
            <Touchable
              key={item.key}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={item.title}
              onPress={() => chooseStrategy(item.key)}
              style={[s.strategy, { backgroundColor: active ? th.primSoft : th.card, borderColor: active ? th.primary : th.border, flexDirection: rowDirection(lang) }]}
            >
              <View style={[s.radio, { borderColor: active ? th.primary : th.faint }]}>{active ? <View style={[s.radioDot, { backgroundColor: th.primary }]} /> : null}</View>
              <View style={{ flex: 1 }}>
                <Text style={[s.strategyTitle, { color: th.text, textAlign: textAlign(lang) }]}>{item.title}</Text>
                <Text style={[s.strategyDescription, { color: th.sub, textAlign: textAlign(lang) }]}>{item.description}</Text>
              </View>
            </Touchable>
          );
        })}
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'قسّم دخلك' : 'Divide your income'}</SectionTitle>
      <View style={s.bucketList}>
        {INCOME_ALLOCATION_BUCKETS.map(key => {
          const item = buckets[key];
          const percent = clampPercent(allocations[key]);
          return (
            <SurfaceCard key={key} th={th} style={s.bucket}>
              <View style={[s.bucketHeader, { flexDirection: rowDirection(lang) }]}>
                <View style={[s.bucketIcon, { backgroundColor: th.primSoft }]}><Ionicons name={item.icon} size={18} color={th.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bucketTitle, { color: th.text, textAlign: textAlign(lang) }]}>{item.title}</Text>
                  <Text style={[s.bucketDescription, { color: th.sub, textAlign: textAlign(lang) }]}>{item.description}</Text>
                </View>
                <Text style={[s.bucketValue, { color: th.primary }]}>{formatMoneyNumber(values[key], cfg.currency, cfg.lang)} {cfg.currency}</Text>
              </View>
              <View style={[s.percentRow, { flexDirection: rowDirection(lang) }]}>
                <Touchable accessibilityLabel={isAr ? `تقليل ${item.title}` : `Decrease ${item.title}`} onPress={() => setPercent(key, percent - 1)} style={[s.percentButton, { backgroundColor: th.cardHigh }]}><Ionicons name="remove" size={16} color={th.text} /></Touchable>
                <View style={[s.percentField, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
                  <TextInput
                    accessibilityLabel={isAr ? `نسبة ${item.title}` : `${item.title} percentage`}
                    keyboardType="number-pad"
                    value={String(percent)}
                    onChangeText={(value) => setPercent(key, value.replace(/[^0-9]/g, ''))}
                    style={[s.percentInput, { color: th.text, textAlign: 'center' }]}
                  />
                  <Text style={[s.percentSign, { color: th.sub }]}>%</Text>
                </View>
                <Touchable accessibilityLabel={isAr ? `زيادة ${item.title}` : `Increase ${item.title}`} onPress={() => setPercent(key, percent + 1)} style={[s.percentButton, { backgroundColor: th.cardHigh }]}><Ionicons name="add" size={16} color={th.text} /></Touchable>
              </View>
            </SurfaceCard>
          );
        })}
      </View>

      <View style={[s.totalCard, { backgroundColor: valid ? th.primSoft : th.cardHigh, borderColor: valid ? th.primary : th.border, flexDirection: rowDirection(lang) }]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.totalTitle, { color: valid ? th.primary : th.text, textAlign: textAlign(lang) }]}>{isAr ? 'مجموع التوزيع' : 'Allocation total'}</Text>
          <Text style={[s.totalHint, { color: th.sub, textAlign: textAlign(lang) }]}>
            {total === 100
              ? (isAr ? 'الخطة متوازنة وجاهزة للحفظ.' : 'Your plan is balanced and ready to save.')
              : (isAr ? 'عدّل النسب حتى يصبح مجموعها 100٪.' : 'Adjust percentages until the total reaches 100%.')}
          </Text>
        </View>
        <Text style={[s.totalValue, { color: valid ? th.primary : th.exp }]}>{total}%</Text>
      </View>

      <AppButton
        th={th}
        lang={lang}
        label={saved ? (isAr ? 'تم حفظ الخطة' : 'Plan saved') : (isAr ? 'حفظ الخطة' : 'Save plan')}
        icon={saved ? 'checkmark-circle-outline' : 'save-outline'}
        disabled={!valid}
        onPress={save}
        style={{ marginTop: SPACE.lg, opacity: valid ? 1 : 0.48 }}
      />
      <Text style={[s.disclaimer, { color: th.faint, textAlign: textAlign(lang) }]}>
        {isAr ? 'التوزيع يساعدك على التخطيط، وليس توصية استثمارية أو ضمانًا لنتيجة مالية.' : 'This helps you plan; it is not investment advice or a financial guarantee.'}
      </Text>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.xl },
  title: { fontSize: 27, lineHeight: 34, ...weight('900') },
  subtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  incomeCard: { padding: SPACE.lg, marginBottom: 2 },
  incomeHead: { alignItems: 'center', gap: SPACE.md },
  incomeIcon: { width: 42, height: 42, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  incomeLabel: { fontSize: 15, lineHeight: 21, ...weight('900') },
  incomeHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  incomeField: { minHeight: 54, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', paddingHorizontal: SPACE.md, marginTop: SPACE.lg, gap: 8 },
  incomeInput: { flex: 1, fontSize: 18, lineHeight: 25, ...weight('900'), paddingVertical: 9 },
  currency: { fontSize: 12, ...weight('900') },
  strategyList: { gap: SPACE.sm },
  strategy: { minHeight: 62, borderRadius: RADIUS.xl, borderWidth: 1, paddingHorizontal: SPACE.md, paddingVertical: 10, alignItems: 'center', gap: SPACE.sm },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  strategyTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  strategyDescription: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  bucketList: { gap: SPACE.md },
  bucket: { padding: SPACE.md },
  bucketHeader: { alignItems: 'center', gap: SPACE.sm },
  bucketIcon: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  bucketTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  bucketDescription: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 1 },
  bucketValue: { maxWidth: 126, fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: 'left' },
  percentRow: { alignItems: 'center', gap: SPACE.sm, marginTop: SPACE.md },
  percentButton: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  percentField: { flex: 1, height: 38, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACE.md, gap: 2 },
  percentInput: { flex: 1, fontSize: 14, lineHeight: 20, ...weight('900'), paddingVertical: 2 },
  percentSign: { fontSize: 13, ...weight('900') },
  totalCard: { minHeight: 72, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.md, alignItems: 'center', gap: SPACE.md, marginTop: SPACE.lg },
  totalTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  totalHint: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  totalValue: { fontSize: 24, lineHeight: 30, ...weight('900') },
  disclaimer: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: SPACE.md, marginBottom: 8 },
});
