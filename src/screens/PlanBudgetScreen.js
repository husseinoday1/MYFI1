import React, { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { formatNumberInput, parseNumberInput } from '../lib/numberInput';
import { filterByActiveScope } from '../lib/modules';
import { CATEGORY_FLOWS, getCategoriesForFlow } from '../lib/categories';
import {
  budgetMonthId,
  getBudgetMapForMonth,
  getBudgetRows,
  getBudgetSummary,
  suggestBudgetsDetailedFromHistory,
} from '../lib/budgets';
import DateField from '../components/DateField';
import { ScreenScroll, PageIntro, SectionTitle, SurfaceCard, Touchable, IconContainer, rowDirection, textAlign } from '../components/AppPrimitives';

// Plan & Budget — My Money gateway 3. Per
// docs/design/07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md: month selector, donut/
// summary of budget vs. spent vs. remaining, category breakdown. Reuses the
// exact same store actions and src/lib/budgets.js functions already used by
// the existing Settings > Financial > Monthly budgets section
// (SettingsLegacyScreen.js) — no new financial mutation logic is introduced
// here, only a second UI surface over the same, already-tested actions.
// financial-data impact: budgets are presentation/planning data, not ledger
// truth; every write goes through the same store.setCategoryBudget/etc.
// actions SettingsLegacyScreen already exercises.
export default function PlanBudgetScreen() {
  const { th, lang, cfg, isAr } = useTheme();
  const { trans, cats, setCategoryBudget, applySuggestedBudgets, copyPreviousMonthBudgets, clearBudgets } = useStore();

  const [budgetDate, setBudgetDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 15);
  });

  const budgetMonthKey = budgetMonthId(budgetDate);
  const scopedTrans = useMemo(() => filterByActiveScope(trans, cfg), [trans, cfg.activeScope, cfg.profileType]);
  const budgetMap = useMemo(
    () => getBudgetMapForMonth(cfg.categoryBudgetsByMonth || {}, budgetDate, cfg.categoryBudgets || {}),
    [cfg.categoryBudgetsByMonth, cfg.categoryBudgets, budgetMonthKey],
  );
  const budgetRows = useMemo(
    () => getBudgetRows(scopedTrans, cats, cfg.categoryBudgetsByMonth || {}, budgetDate, cfg.categoryBudgets || {}),
    [scopedTrans, cats, cfg.categoryBudgetsByMonth, cfg.categoryBudgets, budgetMonthKey],
  );
  const budgetSummary = useMemo(() => getBudgetSummary(budgetRows), [budgetRows]);
  const budgetSuggestions = useMemo(
    () => suggestBudgetsDetailedFromHistory(scopedTrans, cats, budgetDate),
    [scopedTrans, cats, budgetMonthKey],
  );
  const moveBudgetMonth = (delta) => setBudgetDate((current) => new Date(current.getFullYear(), current.getMonth() + delta, 15));

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="pie-chart-outline"
        title={isAr ? 'الخطة والميزانية' : 'Plan & Budget'}
        subtitle={isAr ? 'هل أنا ضمن الخطة هذا الشهر؟' : 'Am I on track this month?'}
      />

      <SurfaceCard th={th} style={{ padding: 12, marginBottom: 14 }}>
        <View style={{ flexDirection: rowDirection(lang), alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
          <Touchable onPress={() => moveBudgetMonth(-1)} style={[s.iconAction, { backgroundColor: th.cardHigh }]}>
            <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={18} color={th.text} />
          </Touchable>
          <DateField
            value={`${budgetMonthKey}-01`}
            onChange={(value) => {
              const [year, month] = String(value).split('-').map(Number);
              if (Number.isFinite(year) && Number.isFinite(month)) setBudgetDate(new Date(year, month - 1, 15));
            }}
            th={th}
            lang={lang}
            monthNameStyle={cfg.monthNameStyle}
            monthOnly
            style={{ flex: 1 }}
            buttonStyle={{ minHeight: 42 }}
            textStyle={{ fontSize: 15 }}
          />
          <Touchable onPress={() => moveBudgetMonth(1)} style={[s.iconAction, { backgroundColor: th.cardHigh }]}>
            <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.text} />
          </Touchable>
        </View>

        <View style={{ flexDirection: rowDirection(lang), gap: 7 }}>
          {[
            { label: isAr ? 'الميزانية' : 'Budget', value: budgetSummary.limit },
            { label: isAr ? 'المصروف' : 'Spent', value: budgetSummary.spent },
            { label: isAr ? 'المتبقي' : 'Remaining', value: budgetSummary.remaining },
          ].map((item) => (
            <View key={item.label} style={{ flex: 1, minWidth: 0, backgroundColor: th.cardHigh, borderRadius: 12, padding: 8, alignItems: 'center' }}>
              <Text style={{ color: th.sub, fontSize: 10, fontWeight: '800' }}>{item.label}</Text>
              <Text style={{ color: th.text, fontSize: 12, marginTop: 4, fontWeight: '900' }} numberOfLines={1} adjustsFontSizeToFit>
                {formatMoneyNumber(item.value, cfg.currency, cfg.lang)} {cfg.currency}
              </Text>
            </View>
          ))}
        </View>
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'حسب التصنيف' : 'By category'}</SectionTitle>
      <Text style={{ color: th.sub, fontSize: 11, textAlign: textAlign(lang), marginBottom: 10 }}>
        {isAr ? 'ميزانية مستقلة لكل شهر. MYFI يقترح فقط، وأنت تقرر.' : 'Each month has its own budget. MYFI suggests; you decide.'}
      </Text>

      <View style={{ gap: 8, marginBottom: 14 }}>
        {getCategoriesForFlow(cats, CATEGORY_FLOWS.EXPENSE).map((cat) => {
          const row = budgetRows.find((item) => item.categoryId === cat.id);
          const suggestion = budgetSuggestions?.[cat.id];
          const statusText = row?.status === 'over'
            ? (isAr ? 'تجاوز الميزانية' : 'Over budget')
            : row?.status === 'near'
              ? (isAr ? 'اقترب من الحد' : 'Near limit')
              : row ? (isAr ? 'ضمن الميزانية' : 'Within budget') : '';

          return (
            <SurfaceCard key={`${budgetMonthKey}:${cat.id}`} th={th} soft style={{ padding: 10, gap: 7 }}>
              <View style={{ flexDirection: rowDirection(lang), alignItems: 'center', gap: 8 }}>
                <IconContainer th={th} icon={cat.icon || 'cube-outline'} tone={cat.color || th.primary} size="sm" />
                <Text style={{ color: th.text, fontSize: 13, fontWeight: '800', flex: 1, textAlign: textAlign(lang) }}>
                  {isAr ? cat.label : cat.labelEn}
                </Text>
                <BudgetAmountField
                  key={`${budgetMonthKey}:${cat.id}:input`}
                  initialValue={budgetMap?.[cat.id] || ''}
                  onCommit={(value) => setCategoryBudget(cat.id, value, budgetDate)}
                  th={th}
                />
              </View>
              {row ? (
                <>
                  <View style={{ height: 6, borderRadius: 6, backgroundColor: th.input, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.min(100, Math.max(0, row.percent))}%`,
                        height: '100%',
                        backgroundColor: row.status === 'over' ? th.exp : row.status === 'near' ? th.warn : th.primary,
                      }}
                    />
                  </View>
                  <Text style={{ color: row.status === 'over' ? th.exp : row.status === 'near' ? th.warn : th.sub, fontSize: 10, textAlign: textAlign(lang), fontWeight: '800' }}>
                    {statusText} · {isAr ? 'مصروف' : 'spent'} {formatMoneyNumber(row.spent, cfg.currency, cfg.lang)} · {isAr ? 'متبقي' : 'left'} {formatMoneyNumber(row.remaining, cfg.currency, cfg.lang)}
                  </Text>
                </>
              ) : null}
              {suggestion ? (
                <View style={{ flexDirection: rowDirection(lang), gap: 4, alignItems: 'center' }}>
                  <Ionicons name="information-circle-outline" size={14} color={th.primary} />
                  <Text style={{ color: th.primary, fontSize: 10, fontWeight: '800' }}>
                    {isAr
                      ? `اقتراح MYFI ${formatMoneyNumber(suggestion.amount, cfg.currency, cfg.lang)}`
                      : `MYFI suggestion ${formatMoneyNumber(suggestion.amount, cfg.currency, cfg.lang)}`}
                  </Text>
                </View>
              ) : null}
            </SurfaceCard>
          );
        })}
      </View>

      <View style={{ flexDirection: rowDirection(lang), gap: 8, flexWrap: 'wrap' }}>
        <Touchable onPress={() => applySuggestedBudgets(budgetDate)} style={[s.smallAction, { backgroundColor: th.primSoft, flexGrow: 1 }]}>
          <Text style={{ color: th.primary, fontWeight: '900' }}>{isAr ? 'تطبيق اقتراح MYFI' : 'Apply MYFI suggestion'}</Text>
        </Touchable>
        <Touchable
          onPress={async () => {
            const copied = await copyPreviousMonthBudgets(budgetDate);
            if (!copied) {
              Alert.alert(
                isAr ? 'لا توجد ميزانية سابقة' : 'No previous budget',
                isAr ? 'لا توجد ميزانية في الشهر السابق لنسخها.' : 'The previous month has no budget to copy.',
              );
            }
          }}
          style={[s.smallAction, { backgroundColor: th.cardHigh, flexGrow: 1 }]}
        >
          <Text style={{ color: th.text, fontWeight: '900' }}>{isAr ? 'نسخ الشهر السابق' : 'Copy previous month'}</Text>
        </Touchable>
        <Touchable onPress={() => clearBudgets(budgetDate)} style={[s.smallAction, { backgroundColor: th.cardHigh, flexGrow: 1 }]}>
          <Text style={{ color: th.exp, fontWeight: '900' }}>{isAr ? 'مسح هذا الشهر' : 'Clear this month'}</Text>
        </Touchable>
      </View>
    </ScreenScroll>
  );
}

// Same small formatting-input pattern as SettingsLegacyScreen's
// FormattedNumberField (that one isn't exported — Settings/Legacy is
// out of scope for this change per the roadmap's Step 4 boundary). Both
// call the same shared src/lib/numberInput functions; consolidating these
// two into one shared component is Step 4/consolidation cleanup, not this
// change.
function BudgetAmountField({ initialValue, onCommit, th }) {
  const [value, setValue] = useState(() => formatNumberInput(String(initialValue || '')));

  useEffect(() => {
    setValue(formatNumberInput(String(initialValue || '')));
  }, [initialValue]);

  return (
    <TextInput
      value={value}
      onChangeText={(next) => setValue(formatNumberInput(next))}
      onEndEditing={() => onCommit?.(parseNumberInput(value))}
      keyboardType="numeric"
      placeholder="0"
      placeholderTextColor={th.sub}
      style={[s.input, { width: 112, backgroundColor: th.input, color: th.text, borderColor: th.border, textAlign: 'center' }]}
    />
  );
}

const s = StyleSheet.create({
  iconAction: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  smallAction: { minHeight: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  input: { minHeight: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, fontSize: 13, fontWeight: '800' },
});
