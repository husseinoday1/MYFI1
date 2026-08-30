import React, { useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { formatMoneyNumber } from '../lib/money';
import { filterByActiveScope } from '../lib/modules';
import { buildLeakInsights } from '../lib/localIntelligence';
import { forecastConfidenceLevel } from '../lib/financialForecast';
import { calcStats, monthlyForecast } from '../utils/calc';
import { formatMonthLabel } from '../lib/months';
import { AppButton, ScreenScroll, SectionTitle, SurfaceCard, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SPACE, weight } from '../lib/tokens';

const isoMonth = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
const monthBounds = (key) => {
  const [year, month] = String(key).split('-').map(Number);
  return { from: `${key}-01`, to: `${key}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}` };
};
const yearBounds = (year) => ({ from: `${year}-01-01`, to: `${year}-12-31` });
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value));

const periodLabel = (period, lang) => {
  if (period.type === 'month') {
    const [year, month] = period.value.split('-').map(Number);
    return formatMonthLabel(year, month - 1, { style: 'text', length: 'short' });
  }
  if (period.type === 'year') return period.value;
  return lang === 'ar' ? `${period.from} إلى ${period.to}` : `${period.from} to ${period.to}`;
};

const makePeriod = (type, value, from, to) => ({
  id: type === 'range' ? `range:${from}:${to}` : `${type}:${value}`,
  type,
  value,
  from,
  to,
});

export default function BasiraScreen({ onOpenHistory, onOpenFollowUps }) {
  const { th, lang, isAr, cfg } = useTheme();
  const { trans, cats, commitments } = useStore();
  const now = new Date();
  const currentMonth = isoMonth(now);
  const currentDateISO = now.toISOString().slice(0, 10);
  const previousMonth = isoMonth(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const [periods, setPeriods] = useState(() => [
    makePeriod('month', currentMonth, ...Object.values(monthBounds(currentMonth))),
    makePeriod('month', previousMonth, ...Object.values(monthBounds(previousMonth))),
  ]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState('month');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const scopedTrans = useMemo(() => filterByActiveScope(trans, cfg).filter(item => item.kind !== 'transfer'), [trans, cfg.activeScope, cfg.profileType]);
  const scopedCommitments = useMemo(() => filterByActiveScope(commitments, cfg), [commitments, cfg.activeScope, cfg.profileType]);
  const monthOptions = useMemo(() => {
    const set = new Set([currentMonth, previousMonth]);
    scopedTrans.forEach(item => { if (/^\d{4}-\d{2}-\d{2}$/.test(item?.dateISO || '')) set.add(item.dateISO.slice(0, 7)); });
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, 36);
  }, [scopedTrans, currentMonth, previousMonth]);
  const yearOptions = useMemo(() => {
    const set = new Set([String(now.getFullYear()), String(now.getFullYear() - 1)]);
    scopedTrans.forEach(item => { if (/^\d{4}/.test(item?.dateISO || '')) set.add(item.dateISO.slice(0, 4)); });
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [scopedTrans, now.getFullYear()]);
  const series = useMemo(() => periods.map(period => ({
    ...period,
    label: periodLabel(period, lang),
    stats: calcStats(scopedTrans.filter(item => item.dateISO >= period.from && item.dateISO <= period.to)),
  })), [periods, scopedTrans, lang]);
  const insights = useMemo(() => buildLeakInsights(scopedTrans, cats, now, scopedCommitments), [scopedTrans, cats, scopedCommitments, now.getFullYear(), now.getMonth(), now.getDate()]);
  const forecast = useMemo(() => monthlyForecast(scopedTrans, now, scopedCommitments), [scopedTrans, scopedCommitments, now.getFullYear(), now.getMonth(), now.getDate()]);
  const maxExpense = Math.max(1, ...series.map(item => item.stats.exp));
  const addPeriod = (period) => {
    setPeriods(current => current.some(item => item.id === period.id) ? current : [...current, period]);
  };
  const addRange = () => {
    if (!validDate(rangeFrom) || !validDate(rangeTo) || rangeFrom > rangeTo) return;
    addPeriod(makePeriod('range', `${rangeFrom}:${rangeTo}`, rangeFrom, rangeTo));
    setRangeFrom('');
    setRangeTo('');
  };
  const removePeriod = (id) => setPeriods(current => current.filter(item => item.id !== id));
  const money = (value) => `${formatMoneyNumber(value, cfg.currency, lang)} ${cfg.currency}`;
  const current = series[series.length - 1]?.stats || { inc: 0, exp: 0, bal: 0 };
  const change = insights.whyChanged?.[0] || null;
  const forecastConfidence = forecastConfidenceLevel(forecast.baselineMonthCount);
  const forecastCopy = {
    none: isAr
      ? 'نحتاج شهرًا سابقًا واحدًا فيه حركات مصروف متغير كافية قبل أن نعرض توقعًا.'
      : 'Add enough variable spending in one previous month before we show a forecast.',
    initial: isAr
      ? 'تقدير أولي — مبني على شهر واحد بعدد كافٍ من الحركات.'
      : 'Initial estimate — based on one month with enough activity.',
    supported: isAr
      ? 'تقدير أوثق — مبني على شهرين مؤهلين للتحليل.'
      : 'More grounded estimate — based on two eligible months.',
    reading_trend: isAr
      ? `اتجاه للقراءة والمقارنة، لا استنتاج إحصائي — مبني على ${forecast.baselineMonthCount} أشهر مؤهلة.`
      : `A reading and comparison trend, not a statistical conclusion — based on ${forecast.baselineMonthCount} eligible months.`,
  };

  return (
    <ScreenScroll th={th} bottom={104}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'بصيرة MYFI' : 'MYFI Insight'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>
          {isAr ? 'تحليل محلي قابل للتحقق من حركاتك.' : 'Local analysis you can verify from your activity.'}
        </Text>
      </View>

      <SurfaceCard th={th} style={s.intro}>
        <View style={[s.introHead, { flexDirection: rowDirection(lang) }]}>
          <View style={[s.introIcon, { backgroundColor: th.primSoft }]}><Ionicons name="sparkles-outline" size={21} color={th.primary} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[s.introTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'استوديو المقارنة' : 'Comparison studio'}</Text>
            <Text style={[s.introBody, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'أضف أي أشهر أو سنوات أو نطاقات تاريخية تريدها.' : 'Add any months, years, or date ranges you want.'}</Text>
          </View>
        </View>
        <AppButton th={th} lang={lang} tone="soft" icon="add" label={isAr ? 'إضافة فترة' : 'Add period'} onPress={() => setPickerOpen(true)} style={{ marginTop: SPACE.md }} />
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'الفترات المختارة' : 'Selected periods'}</SectionTitle>
      <View style={s.periodList}>
        {!series.length ? <EmptyState th={th} lang={lang} /> : series.map(item => (
          <SurfaceCard key={item.id} th={th} style={s.periodCard}>
            <View style={[s.periodHead, { flexDirection: rowDirection(lang) }]}>
              <View style={[s.periodIcon, { backgroundColor: th.primSoft }]}><Ionicons name={item.type === 'year' ? 'calendar-number-outline' : 'calendar-outline'} size={17} color={th.primary} /></View>
              <Text style={[s.periodTitle, { color: th.text, textAlign: textAlign(lang), flex: 1 }]} numberOfLines={1}>{item.label}</Text>
              <Touchable accessibilityLabel={isAr ? `حذف ${item.label}` : `Remove ${item.label}`} onPress={() => removePeriod(item.id)} style={[s.remove, { backgroundColor: th.cardHigh }]}><Ionicons name="trash-outline" size={16} color={th.sub} /></Touchable>
            </View>
            <View style={[s.metricRow, { flexDirection: rowDirection(lang) }]}>
              <Metric th={th} lang={lang} label={isAr ? 'دخل' : 'Income'} value={money(item.stats.inc)} tone={th.inc} />
              <Metric th={th} lang={lang} label={isAr ? 'مصروف' : 'Expense'} value={money(item.stats.exp)} tone={th.exp} />
              <Metric th={th} lang={lang} label={isAr ? 'صافي' : 'Net'} value={money(item.stats.bal)} tone={item.stats.bal >= 0 ? th.inc : th.exp} />
            </View>
          </SurfaceCard>
        ))}
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'اتجاه الإنفاق' : 'Spending trend'}</SectionTitle>
      <SurfaceCard th={th} style={s.trendCard}>
        {series.length ? series.map(item => (
          <View key={`trend-${item.id}`} style={s.trendRow}>
            <View style={[s.trendLabels, { flexDirection: rowDirection(lang) }]}>
              <Text style={[s.trendLabel, { color: th.sub, textAlign: textAlign(lang), flex: 1 }]} numberOfLines={1}>{item.label}</Text>
              <Text style={[s.trendValue, { color: th.exp }]}>{money(item.stats.exp)}</Text>
            </View>
            <View style={[s.trendTrack, { backgroundColor: th.cardHigh }]}><View style={[s.trendFill, { backgroundColor: th.exp, width: `${Math.round((item.stats.exp / maxExpense) * 100)}%` }]} /></View>
          </View>
        )) : <EmptyState th={th} lang={lang} compact />}
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'لماذا تغيّر؟' : 'Why did it change?'}</SectionTitle>
      <SurfaceCard th={th} style={s.evidenceCard}>
        {change ? (
          <>
            <View style={[s.evidenceHead, { flexDirection: rowDirection(lang) }]}>
              <View style={[s.evidenceIcon, { backgroundColor: change.actualVariableDelta >= 0 ? th.expBg : th.incBg }]}><Ionicons name={change.actualVariableDelta >= 0 ? 'trending-up-outline' : 'trending-down-outline'} size={19} color={change.actualVariableDelta >= 0 ? th.exp : th.inc} /></View>
              <Text style={[s.evidenceTitle, { color: th.text, textAlign: textAlign(lang), flex: 1 }]}>{isAr ? 'تغيّر يمكن التحقق منه' : 'A change you can verify'}</Text>
            </View>
            <Text style={[s.evidenceText, { color: th.sub, textAlign: textAlign(lang) }]}>
              {isAr
                ? `مصروف ${change.label || 'غير مصنف'} ${change.actualVariableDelta >= 0 ? 'أعلى' : 'أقل'} من متوسطه بمقدار ${money(Math.abs(change.actualVariableDelta))}.`
                : `${change.labelEn || change.label || 'A category'} is ${change.actualVariableDelta >= 0 ? 'above' : 'below'} its usual spending by ${money(Math.abs(change.actualVariableDelta))}.`}
            </Text>
            <Text style={[s.evidenceSource, { color: th.faint, textAlign: textAlign(lang) }]}>
              {isAr
                ? (change.whyChanged.wording === 'single_event'
                  ? 'السبب: حركة واحدة كبيرة، لا نمط متكرر.'
                  : `السبب: ${change.eligibleVariableTransactionCount} حركات مصروف متغير في هذه الفترة، مقارنة بمتوسط ${change.historicalEligibleMonthCount} أشهر.`)
                : (change.whyChanged.wording === 'single_event'
                  ? 'Reason: one large movement, not a recurring pattern.'
                  : `Reason: ${change.eligibleVariableTransactionCount} variable spending movements this period, compared with ${change.historicalEligibleMonthCount} months.`)}
            </Text>
            <AppButton
              th={th}
              lang={lang}
              tone="soft"
              icon="receipt-outline"
              label={isAr ? 'افتح الحركات' : 'Open activity'}
              onPress={() => onOpenHistory({
                categoryId: change.id,
                type: 'exp',
                fromDate: `${currentMonth}-01`,
                toDate: currentDateISO,
              })}
              style={{ marginTop: SPACE.md }}
            />
          </>
        ) : (
          <Text style={[s.evidenceText, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'نحتاج تاريخًا أطول قليلًا لنشرح التغيّر بثقة. لا نعرض استنتاجًا عندما لا يكفي الدليل.' : 'A little more history is needed before we explain a change confidently. We do not invent conclusions without evidence.'}</Text>
        )}
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'توقع نهاية الشهر' : 'Month-end forecast'}</SectionTitle>
      <SurfaceCard th={th} style={s.forecastCard}>
        {forecastConfidence === 'none' ? (
          <>
            <View style={[s.forecastHead, { flexDirection: rowDirection(lang) }]}>
              <View style={[s.forecastIcon, { backgroundColor: th.warnBg }]}><Ionicons name="information-circle-outline" size={19} color={th.warn} /></View>
              <Text style={[s.forecastTitle, { color: th.text, textAlign: textAlign(lang), flex: 1 }]}>{isAr ? 'توقع نهاية الشهر غير جاهز' : 'Month-end forecast is not ready'}</Text>
            </View>
            <Text style={[s.forecastBody, { color: th.sub, textAlign: textAlign(lang) }]}>{forecastCopy.none}</Text>
          </>
        ) : (
          <>
            <View style={[s.forecastHead, { flexDirection: rowDirection(lang) }]}>
              <View style={[s.forecastIcon, { backgroundColor: forecast.status === 'danger' ? th.expBg : th.primSoft }]}><Ionicons name="analytics-outline" size={19} color={forecast.status === 'danger' ? th.exp : th.primary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={[s.forecastTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'المصروف المتوقع' : 'Projected expense'}</Text>
                <Text style={[s.forecastValue, { color: forecast.status === 'danger' ? th.exp : th.primary, textAlign: textAlign(lang) }]}>{money(forecast.projected)}</Text>
              </View>
            </View>
            <Text style={[s.forecastBody, { color: th.sub, textAlign: textAlign(lang) }]}>{forecastCopy[forecastConfidence]}</Text>
            <Text style={[s.forecastBody, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? `يتضمن ${money(forecast.remainingCommitments)} من الالتزامات المجدولة المتبقية.` : `Includes ${money(forecast.remainingCommitments)} in remaining scheduled commitments.`}</Text>
          </>
        )}
        <Text style={[s.disclaimer, { color: th.faint, textAlign: textAlign(lang) }]}>{isAr ? 'تقدير مشروط بالنمط الحالي، وليس وعدًا أو نصيحة مالية.' : 'An estimate based on the current pattern, not a promise or financial advice.'}</Text>
      </SurfaceCard>

      <SectionTitle th={th} lang={lang}>{isAr ? 'الالتزامات القادمة' : 'Upcoming commitments'}</SectionTitle>
      <Touchable onPress={onOpenFollowUps} style={[s.followUpsLink, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
        <View style={[s.followUpsIcon, { backgroundColor: th.warnBg }]}><Ionicons name="calendar-outline" size={18} color={th.warn} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[s.followUpsTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? `${scopedCommitments.length} متابعة مسجلة` : `${scopedCommitments.length} follow-ups recorded`}</Text>
          <Text style={[s.followUpsHint, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'افتحها لرؤية الموعد والفعل المطلوب.' : 'Open follow-ups to see dates and required actions.'}</Text>
        </View>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.faint} />
      </Touchable>

      <PeriodPicker
        visible={pickerOpen}
        th={th}
        lang={lang}
        mode={pickerMode}
        setMode={setPickerMode}
        monthOptions={monthOptions}
        yearOptions={yearOptions}
        selectedIds={new Set(periods.map(item => item.id))}
        onAdd={(type, value) => {
          const bounds = type === 'month' ? monthBounds(value) : yearBounds(value);
          addPeriod(makePeriod(type, value, bounds.from, bounds.to));
        }}
        rangeFrom={rangeFrom}
        rangeTo={rangeTo}
        onRangeFrom={setRangeFrom}
        onRangeTo={setRangeTo}
        onAddRange={addRange}
        onClose={() => setPickerOpen(false)}
      />
    </ScreenScroll>
  );
}

function Metric({ th, lang, label, value, tone }) {
  return <View style={[s.metric, { backgroundColor: th.cardHigh }]}><Text style={[s.metricLabel, { color: th.sub, textAlign: textAlign(lang) }]}>{label}</Text><Text style={[s.metricValue, { color: tone, textAlign: textAlign(lang) }]} numberOfLines={1}>{value}</Text></View>;
}

function EmptyState({ th, lang, compact = false }) {
  const isAr = lang === 'ar';
  return <View style={[s.empty, compact && { minHeight: 76 }]}><Ionicons name="analytics-outline" size={compact ? 20 : 28} color={th.faint} /><Text style={[s.emptyText, { color: th.sub }]}>{isAr ? 'أضف فترة لتبدأ المقارنة.' : 'Add a period to start comparing.'}</Text></View>;
}

function PeriodPicker({ visible, th, lang, mode, setMode, monthOptions, yearOptions, selectedIds, onAdd, rangeFrom, rangeTo, onRangeFrom, onRangeTo, onAddRange, onClose }) {
  const isAr = lang === 'ar';
  const modes = [{ key: 'month', label: isAr ? 'شهر' : 'Month' }, { key: 'year', label: isAr ? 'سنة' : 'Year' }, { key: 'range', label: isAr ? 'نطاق' : 'Range' }];
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[s.modalOverlay, { backgroundColor: th.overlay }]}><Touchable style={{ flex: 1 }} onPress={onClose} /><View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
    <View style={[s.sheetHead, { flexDirection: rowDirection(lang) }]}><Text style={[s.sheetTitle, { color: th.text, textAlign: textAlign(lang), flex: 1 }]}>{isAr ? 'أضف فترة للمقارنة' : 'Add a comparison period'}</Text><Touchable accessibilityLabel={isAr ? 'إغلاق' : 'Close'} onPress={onClose} style={[s.remove, { backgroundColor: th.cardHigh }]}><Ionicons name="chevron-down" size={18} color={th.sub} /></Touchable></View>
    <View style={[s.modeBar, { backgroundColor: th.cardHigh, flexDirection: rowDirection(lang) }]}>{modes.map(item => <Touchable key={item.key} onPress={() => setMode(item.key)} style={[s.mode, { backgroundColor: mode === item.key ? th.card : 'transparent' }]}><Text style={[s.modeText, { color: mode === item.key ? th.primary : th.sub }]}>{item.label}</Text></Touchable>)}</View>
    {mode === 'range' ? <View style={s.rangeBlock}><Text style={[s.rangeHint, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'اكتب تاريخ البداية والنهاية بصيغة YYYY-MM-DD' : 'Enter start and end dates as YYYY-MM-DD'}</Text><TextInput value={rangeFrom} onChangeText={onRangeFrom} placeholder="2026-01-01" placeholderTextColor={th.faint} style={[s.rangeInput, { color: th.text, backgroundColor: th.cardHigh, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]} /><TextInput value={rangeTo} onChangeText={onRangeTo} placeholder="2026-01-31" placeholderTextColor={th.faint} style={[s.rangeInput, { color: th.text, backgroundColor: th.cardHigh, borderColor: th.border, textAlign: isAr ? 'right' : 'left' }]} /><AppButton th={th} lang={lang} icon="add" label={isAr ? 'إضافة النطاق' : 'Add range'} onPress={onAddRange} /></View> : <ScrollView style={s.choiceScroll} contentContainerStyle={s.choiceList}>{(mode === 'month' ? monthOptions : yearOptions).map(value => { const bounds = mode === 'month' ? monthBounds(value) : yearBounds(value); const id = `${mode}:${value}`; const added = selectedIds.has(id); const label = mode === 'month' ? periodLabel(makePeriod('month', value, bounds.from, bounds.to), lang) : value; return <Touchable key={id} disabled={added} onPress={() => onAdd(mode, value)} style={[s.choice, { backgroundColor: added ? th.primSoft : th.cardHigh, borderColor: added ? th.primary : th.border, flexDirection: rowDirection(lang) }]}><Ionicons name={added ? 'checkmark-circle-outline' : 'calendar-outline'} size={17} color={added ? th.primary : th.sub} /><Text style={[s.choiceText, { color: added ? th.primary : th.text, textAlign: textAlign(lang), flex: 1 }]}>{label}</Text></Touchable>; })}</ScrollView>}
  </View></View></Modal>;
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.xl }, title: { fontSize: 27, lineHeight: 34, ...weight('900') }, subtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  intro: { padding: SPACE.lg }, introHead: { alignItems: 'center', gap: SPACE.md }, introIcon: { width: 44, height: 44, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' }, introTitle: { fontSize: 15, lineHeight: 21, ...weight('900') }, introBody: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: 2 },
  periodList: { gap: SPACE.md }, periodCard: { padding: SPACE.md }, periodHead: { alignItems: 'center', gap: SPACE.sm }, periodIcon: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' }, periodTitle: { fontSize: 13, lineHeight: 18, ...weight('900') }, remove: { width: 32, height: 32, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' }, metricRow: { gap: 7, marginTop: SPACE.md }, metric: { flex: 1, minWidth: 0, borderRadius: RADIUS.md, padding: 8 }, metricLabel: { fontSize: 9, lineHeight: 13, ...weight('800') }, metricValue: { fontSize: 11, lineHeight: 17, ...weight('900'), marginTop: 2 },
  trendCard: { padding: SPACE.md, gap: SPACE.md }, trendRow: { gap: 6 }, trendLabels: { alignItems: 'center', gap: SPACE.sm }, trendLabel: { fontSize: 11, lineHeight: 16, ...weight('800') }, trendValue: { fontSize: 11, lineHeight: 16, ...weight('900') }, trendTrack: { height: 7, borderRadius: 99, overflow: 'hidden' }, trendFill: { height: 7, borderRadius: 99 },
  evidenceCard: { padding: SPACE.lg }, evidenceHead: { alignItems: 'center', gap: SPACE.sm }, evidenceIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' }, evidenceTitle: { fontSize: 14, lineHeight: 20, ...weight('900') }, evidenceText: { fontSize: 12, lineHeight: 19, ...weight('700'), marginTop: SPACE.md }, evidenceSource: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: SPACE.sm },
  forecastCard: { padding: SPACE.lg }, forecastHead: { alignItems: 'center', gap: SPACE.md }, forecastIcon: { width: 42, height: 42, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' }, forecastTitle: { fontSize: 11, lineHeight: 16, ...weight('800') }, forecastValue: { fontSize: 20, lineHeight: 28, ...weight('900'), marginTop: 2 }, forecastBody: { fontSize: 11, lineHeight: 17, ...weight('700'), marginTop: SPACE.md }, disclaimer: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: SPACE.sm },
  followUpsLink: { minHeight: 72, borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.md, alignItems: 'center', gap: SPACE.sm }, followUpsIcon: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' }, followUpsTitle: { fontSize: 13, lineHeight: 18, ...weight('900') }, followUpsHint: { fontSize: 10, lineHeight: 15, ...weight('700'), marginTop: 2 },
  empty: { minHeight: 118, alignItems: 'center', justifyContent: 'center', gap: 8 }, emptyText: { fontSize: 11, lineHeight: 17, ...weight('800') }, modalOverlay: { flex: 1, justifyContent: 'flex-end' }, sheet: { maxHeight: '78%', borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, borderWidth: 1, padding: SPACE.lg, gap: SPACE.md }, sheetHead: { alignItems: 'center', gap: SPACE.sm }, sheetTitle: { fontSize: 17, lineHeight: 24, ...weight('900') }, modeBar: { borderRadius: RADIUS.lg, padding: 4, gap: 4 }, mode: { flex: 1, minHeight: 39, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' }, modeText: { fontSize: 11, lineHeight: 16, ...weight('900') }, choiceScroll: { maxHeight: 390 }, choiceList: { gap: 7, paddingBottom: 4 }, choice: { minHeight: 47, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACE.md, alignItems: 'center', gap: SPACE.sm }, choiceText: { fontSize: 12, lineHeight: 17, ...weight('800') }, rangeBlock: { gap: SPACE.sm }, rangeHint: { fontSize: 11, lineHeight: 17, ...weight('700') }, rangeInput: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: SPACE.md, fontSize: 13, ...weight('800') },
});
