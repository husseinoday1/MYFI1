import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { parseMoneyInput, preserveNumberInputDraft } from '../lib/numberInput';
import { DEF_INCOME_ALLOCATION_PLAN, INCOME_ALLOCATION_BUCKETS, normalizeIncomeAllocationPlan } from '../lib/constants';
import { CATEGORY_FLOWS, getCategoriesForFlow } from '../lib/categories';
import { buildMyfiFlowPreview } from '../lib/myfiFlow';
import DateField from '../components/DateField';
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
  const { cats, commitments, applyMyfiFlowPlan } = useStore();
  const stored = normalizeIncomeAllocationPlan(cfg.incomeAllocationPlan || DEF_INCOME_ALLOCATION_PLAN);
  const [strategy, setStrategy] = useState(stored.strategy);
  const [incomeText, setIncomeText] = useState(stored.income > 0 ? String(stored.income) : '');
  const [allocations, setAllocations] = useState(stored.allocations);
  const [categoryBindings, setCategoryBindings] = useState(stored.categoryBindings || {});
  const [periodDate, setPeriodDate] = useState(() => {
    const [year, month] = String(stored.period || '').split('-').map(Number);
    return Number.isFinite(year) && Number.isFinite(month) ? new Date(year, month - 1, 15) : new Date();
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const incomeResult = useMemo(
    () => parseMoneyInput(incomeText, { format: cfg.numberInputFormat, currency: cfg.currency, allowNegative: false }),
    [incomeText, cfg.numberInputFormat, cfg.currency],
  );
  const income = incomeResult.ok ? incomeResult.value : 0;
  const total = INCOME_ALLOCATION_BUCKETS.reduce((sum, key) => sum + clampPercent(allocations[key]), 0);
  const valid = incomeResult.ok && income > 0 && total === 100;
  const buckets = bucketCopy(isAr);
  const strategies = strategyCopy(isAr);
  const expenseCategories = useMemo(() => getCategoriesForFlow(cats, CATEGORY_FLOWS.EXPENSE), [cats]);

  const values = useMemo(() => INCOME_ALLOCATION_BUCKETS.reduce((next, key) => ({
    ...next,
    [key]: income * (clampPercent(allocations[key]) / 100),
  }), {}), [income, allocations]);
  const preview = useMemo(() => buildMyfiFlowPreview({
    income,
    allocations,
    categoryBindings,
    categories: expenseCategories,
    commitments,
    date: periodDate,
  }), [income, allocations, categoryBindings, expenseCategories, commitments, periodDate]);

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

  const toggleCategoryBinding = (bucket, categoryId) => {
    setCategoryBindings(current => {
      const next = Object.fromEntries(INCOME_ALLOCATION_BUCKETS.map(key => [key, [...(current[key] || [])]]));
      const alreadySelected = next[bucket].some(item => item.categoryId === categoryId);
      INCOME_ALLOCATION_BUCKETS.forEach(key => {
        next[key] = next[key].filter(item => item.categoryId !== categoryId);
      });
      if (!alreadySelected) next[bucket].push({ categoryId, weight: 1 });
      return next;
    });
    setSaved(false);
    setSaveError('');
  };

  const save = async () => {
    if (!valid) return;
    const result = await applyMyfiFlowPlan({
      strategy,
      income,
      allocations: INCOME_ALLOCATION_BUCKETS.reduce((next, key) => ({ ...next, [key]: clampPercent(allocations[key]) }), {}),
      categoryBindings,
      date: periodDate,
    });
    setSaved(!!result?.ok);
    setSaveError(result?.ok ? '' : (isAr ? 'تعذر حفظ الخطة الآن. لم تتغير الميزانيات.' : 'The plan could not be saved. Budgets were not changed.'));
  };

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'MYFI Flow' : 'MYFI Flow'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>
          {isAr ? 'خطتك المالية الحية: راجع الأثر ثم اربطها بميزانياتك.' : 'Your live money plan: review the impact, then connect it to real budgets.'}
        </Text>
      </View>

      <SurfaceCard th={th} style={s.periodCard}>
        <Text style={[s.periodLabel, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'فترة الخطة' : 'Plan period'}</Text>
        <DateField value={periodDate.toISOString().slice(0, 10)} onChange={value => { setPeriodDate(new Date(`${value}T12:00:00`)); setSaved(false); }} th={th} lang={lang} monthNameStyle={cfg.monthNameStyle} monthOnly />
      </SurfaceCard>

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
            onChangeText={(value) => { setIncomeText(preserveNumberInputDraft(value)); setSaved(false); }}
            placeholder="0"
            placeholderTextColor={th.faint}
            style={[s.incomeInput, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}
          />
          <Text style={[s.currency, { color: th.sub }]}>{cfg.currency}</Text>
        </View>
        {incomeText.trim() && !incomeResult.ok ? (
          <Text style={[s.inputError, { color: th.exp, textAlign: textAlign(lang) }]}>
            {isAr ? 'تحقق من صيغة المبلغ والفواصل قبل الحفظ.' : 'Check the amount and its separators before saving.'}
          </Text>
        ) : null}
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

      <SectionTitle th={th} lang={lang}>{isAr ? 'اربط الخطة بفئاتك' : 'Connect the plan to your categories'}</SectionTitle>
      <Text style={[s.bindingsHint, { color: th.sub, textAlign: textAlign(lang) }]}>
        {isAr ? 'اختر الفئات التي تريد تحديث ميزانيتها. الفئة لا ترتبط إلا ببند واحد، ولا ننشئ ميزانية لأي اختيار غير واضح.' : 'Choose the categories whose budgets you want to update. A category belongs to one bucket only; nothing is created by assumption.'}
      </Text>
      <View style={s.bindingList}>
        {INCOME_ALLOCATION_BUCKETS.filter(bucket => values[bucket] > 0).map(bucket => {
          const item = buckets[bucket];
          const selected = new Set((categoryBindings[bucket] || []).map(row => row.categoryId));
          return (
            <SurfaceCard key={bucket} th={th} style={s.bindingCard}>
              <View style={[s.bindingHead, { flexDirection: rowDirection(lang) }]}>
                <View style={[s.bucketIcon, { backgroundColor: th.primSoft }]}><Ionicons name={item.icon} size={17} color={th.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bindingTitle, { color: th.text, textAlign: textAlign(lang) }]}>{item.title}</Text>
                  <Text style={[s.bindingAmount, { color: th.primary, textAlign: textAlign(lang) }]}>{formatMoneyNumber(values[bucket], cfg.currency, cfg.lang)} {cfg.currency}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.categoryRail, { flexDirection: rowDirection(lang) }]}>
                {expenseCategories.map(category => {
                  const active = selected.has(category.id);
                  return <Touchable key={category.id} accessibilityRole="checkbox" accessibilityState={{ checked: active }} onPress={() => toggleCategoryBinding(bucket, category.id)} style={[s.categoryChip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : th.border }]}><Text style={[s.categoryChipText, { color: active ? th.primary : th.sub }]}>{isAr ? category.label : (category.labelEn || category.label)}</Text></Touchable>;
                })}
              </ScrollView>
            </SurfaceCard>
          );
        })}
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'معاينة الأثر قبل الحفظ' : 'Preview the impact before saving'}</SectionTitle>
      <SurfaceCard th={th} style={s.previewCard}>
        <View style={[s.previewRow, { flexDirection: rowDirection(lang) }]}>
          <PreviewMetric th={th} lang={lang} label={isAr ? 'المرن بعد الخطة' : 'Flexible after plan'} value={formatMoneyNumber(preview.flexibleAmount, cfg.currency, lang)} tone={th.primary} />
          <PreviewMetric th={th} lang={lang} label={isAr ? 'الالتزامات المجدولة' : 'Scheduled commitments'} value={formatMoneyNumber(preview.scheduledAmount, cfg.currency, lang)} tone={th.warn} />
        </View>
        {preview.essentialsGap > 0 ? <Text style={[s.previewNotice, { color: th.warn, textAlign: textAlign(lang) }]}>{isAr ? `تحتاج الأساسيات إلى ${formatMoneyNumber(preview.essentialsGap, cfg.currency, lang)} ${cfg.currency} إضافية لتغطية الالتزامات المجدولة.` : `Essentials need ${formatMoneyNumber(preview.essentialsGap, cfg.currency, lang)} ${cfg.currency} more for scheduled commitments.`}</Text> : <Text style={[s.previewNotice, { color: th.inc, textAlign: textAlign(lang) }]}>{isAr ? 'بند الأساسيات يغطي الالتزامات المجدولة في هذه الفترة.' : 'Essentials cover the scheduled commitments in this period.'}</Text>}
        <Text style={[s.previewDetail, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? `${preview.budgetChanges.length} فئات ستتغير ميزانيتها بعد التأكيد.` : `${preview.budgetChanges.length} category budgets will change after confirmation.`}</Text>
        {preview.unboundBuckets.length ? <Text style={[s.previewDetail, { color: th.faint, textAlign: textAlign(lang) }]}>{isAr ? 'المبالغ غير المرتبطة بفئة تبقى ضمن الخطة فقط ولا تغيّر أي ميزانية.' : 'Amounts without category links remain in the plan only and change no budget.'}</Text> : null}
      </SurfaceCard>

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
        label={saved ? (isAr ? 'تم حفظ الخطة والميزانيات' : 'Plan and budgets saved') : (isAr ? 'حفظ الخطة وربط الميزانيات' : 'Save plan and update budgets')}
        icon={saved ? 'checkmark-circle-outline' : 'save-outline'}
        disabled={!valid}
        onPress={save}
        style={{ marginTop: SPACE.lg, opacity: valid ? 1 : 0.48 }}
      />
      {saveError ? <Text style={[s.inputError, { color: th.exp, textAlign: textAlign(lang) }]}>{saveError}</Text> : null}
      <Text style={[s.disclaimer, { color: th.faint, textAlign: textAlign(lang) }]}>
        {isAr ? 'الخطة لا تنشئ حركة أو تحوّل مالًا تلقائيًا. أنت تؤكد أي عملية مالية من مكانها.' : 'This plan never creates a transaction or moves money automatically. You confirm every financial action where it belongs.'}
      </Text>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.xl },
  title: { fontSize: 27, lineHeight: 34, ...weight('900') },
  subtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  periodCard: { padding: SPACE.md, marginBottom: SPACE.md },
  periodLabel: { fontSize: 13, lineHeight: 18, ...weight('900'), marginBottom: SPACE.sm },
  incomeCard: { padding: SPACE.lg, marginBottom: 2 },
  incomeHead: { alignItems: 'center', gap: SPACE.md },
  incomeIcon: { width: 42, height: 42, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  incomeLabel: { fontSize: 15, lineHeight: 21, ...weight('900') },
  incomeHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  incomeField: { minHeight: 54, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', paddingHorizontal: SPACE.md, marginTop: SPACE.lg, gap: 8 },
  incomeInput: { flex: 1, fontSize: 18, lineHeight: 25, ...weight('900'), paddingVertical: 9 },
  currency: { fontSize: 12, ...weight('900') },
  inputError: { fontSize: 10, lineHeight: 15, ...weight('800'), marginTop: 7 },
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
  bindingsHint: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: -SPACE.sm, marginBottom: SPACE.md },
  bindingList: { gap: SPACE.sm },
  bindingCard: { padding: SPACE.md },
  bindingHead: { alignItems: 'center', gap: SPACE.sm },
  bindingTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  bindingAmount: { fontSize: 11, lineHeight: 16, ...weight('900'), marginTop: 1 },
  categoryRail: { gap: SPACE.sm, paddingTop: SPACE.md },
  categoryChip: { minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  categoryChipText: { fontSize: 11, lineHeight: 15, ...weight('900') },
  previewCard: { padding: SPACE.md, gap: SPACE.sm },
  previewRow: { gap: SPACE.sm },
  previewMetric: { flex: 1, minHeight: 60, borderRadius: RADIUS.md, padding: 9, justifyContent: 'center' },
  previewLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  previewValue: { fontSize: 13, lineHeight: 18, ...weight('900'), marginTop: 3 },
  previewNotice: { fontSize: 11, lineHeight: 17, ...weight('900'), marginTop: 2 },
  previewDetail: { fontSize: 10, lineHeight: 16, ...weight('700') },
  disclaimer: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: SPACE.md, marginBottom: 8 },
});

function PreviewMetric({ th, lang, label, value, tone }) {
  return (
    <View style={[s.previewMetric, { backgroundColor: `${tone}14` }]}>
      <Text style={[s.previewLabel, { color: th.sub, textAlign: textAlign(lang) }]}>{label}</Text>
      <Text style={[s.previewValue, { color: tone, textAlign: textAlign(lang) }]}>{value}</Text>
    </View>
  );
}
