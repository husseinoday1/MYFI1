import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { isISODate, today } from '../utils/calc';
import { RADIUS, SHADOW, TYPE, weight } from '../lib/tokens';
import { formatMonthLabel, monthNames } from '../lib/months';

const pad = (n) => String(n).padStart(2, '0');
const toISO = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseISO = (value) => {
  const safe = isISODate(value) ? value : today();
  return new Date(`${safe}T12:00:00`);
};

const shiftMonth = (date, delta) =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1, 12, 0, 0);

const YEAR_PAGE_SIZE = 12;
const yearPageStartFor = (year) => Number(year) - 5;

const AR_DAYS = ['سبت', 'أحد', 'اثن', 'ثلا', 'أرب', 'خمي', 'جمع'];
const EN_DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    pickDate: ar ? 'اختيار التاريخ' : 'Pick date',
    close: ar ? 'إغلاق' : 'Close',
    previousMonth: ar ? 'الشهر السابق' : 'Previous month',
    nextMonth: ar ? 'الشهر التالي' : 'Next month',
    chooseYear: ar ? 'اختر السنة' : 'Choose year',
    previousYears: ar ? 'السنوات السابقة' : 'Previous years',
    nextYears: ar ? 'السنوات التالية' : 'Next years',
    anyDate: ar ? 'أي تاريخ' : 'Any date',
    clear: ar ? 'مسح التاريخ' : 'Clear date',
  };
};

const formatDate = (value, lang, monthNameStyle = 'system') => {
  const date = parseISO(value);
  try {
    return new Intl.DateTimeFormat(monthNameStyle === 'system' ? undefined : (lang === 'ar' ? 'ar-IQ' : 'en-US'), {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
  } catch {
    return toISO(date);
  }
};

const buildMonth = (viewDate) => {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const first = new Date(year, month, 1, 12, 0, 0);
  const startOffset = (first.getDay() + 1) % 7;

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - startOffset + 1, 12, 0, 0);
    return {
      iso: toISO(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month,
    };
  });
};

export default function DateField({
  value,
  onChange,
  th,
  lang = 'ar',
  label,
  style,
  buttonStyle,
  textStyle,
  allowEmpty = false,
  monthOnly = false,
  labelInside = false,
  monthNameStyle = 'system',
}) {
  const [open, setOpen] = useState(false);
  const currentValue = isISODate(value) ? value : today();
  const selectedDate = parseISO(currentValue);
  const [viewDate, setViewDate] = useState(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12, 0, 0));
  const [pickerView, setPickerView] = useState('calendar');
  const [yearPageStart, setYearPageStart] = useState(yearPageStartFor(selectedDate.getFullYear()));
  const T = useMemo(() => copy(lang), [lang]);
  const isAr = lang === 'ar';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const align = isAr ? 'right' : 'left';
  const monthName = monthNames({ style: monthNameStyle, length: 'long' })[viewDate.getMonth()];
  const dayNames = isAr ? AR_DAYS : EN_DAYS;
  const days = useMemo(() => buildMonth(viewDate), [viewDate]);
  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, month) => ({
    month,
    label: monthNames({ style: monthNameStyle, length: 'long' })[month],
  })), [monthNameStyle]);
  const yearOptions = useMemo(
    () => Array.from({ length: YEAR_PAGE_SIZE }, (_, index) => yearPageStart + index),
    [yearPageStart],
  );
  const todayISO = today();

  const openPicker = () => {
    const date = parseISO(currentValue);
    setViewDate(new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0));
    setYearPageStart(yearPageStartFor(date.getFullYear()));
    setPickerView('calendar');
    setOpen(true);
  };

  const openYearPicker = () => {
    setYearPageStart(yearPageStartFor(viewDate.getFullYear()));
    setPickerView('year');
  };

  const chooseYear = (year) => {
    setViewDate(prev => new Date(year, prev.getMonth(), 1, 12, 0, 0));
    setPickerView('calendar');
  };

  const chooseDate = (iso) => {
    onChange?.(iso);
    setOpen(false);
  };

  const chooseMonth = (month) => {
    onChange?.(`${viewDate.getFullYear()}-${pad(month + 1)}-01`);
    setOpen(false);
  };

  return (
    <View style={style}>
      {!!label && !labelInside && <Text style={[s.label, { color: th.sub, textAlign: align }]}>{label}</Text>}
      <TouchableOpacity
        onPress={openPicker}
        style={[
          s.button,
          { backgroundColor: th.input, borderColor: isISODate(value) || allowEmpty ? th.border : th.exp, flexDirection: rowDir },
          buttonStyle,
        ]}
      >
        <Ionicons name="calendar-outline" size={16} color={th.sub} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {!!label && labelInside ? (
            <Text style={[s.inlineLabel, { color: th.sub, textAlign: align }]}>{label}</Text>
          ) : null}
          <Text style={[s.buttonText, { color: th.text, textAlign: align }, textStyle]} numberOfLines={1} adjustsFontSizeToFit>
            {isISODate(value) ? (monthOnly ? formatMonthLabel(selectedDate.getFullYear(), selectedDate.getMonth(), { style: monthNameStyle, length: 'long' }) : formatDate(currentValue, lang, monthNameStyle)) : T.anyDate}
          </Text>
          {labelInside ? <Text style={[s.inlineDetail, { color: th.sub, textAlign: align }]}>{' '}</Text> : null}
        </View>
        {allowEmpty && isISODate(value) ? (
          <TouchableOpacity onPress={() => onChange?.('')} accessibilityLabel={T.clear} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="backspace-outline" size={17} color={th.sub} />
          </TouchableOpacity>
        ) : null}
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={[s.overlay, { backgroundColor: th.overlay || 'rgba(0,0,0,0.46)' }]}>
          <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[s.sheet, { backgroundColor: th.cardHigh, borderColor: th.border }]}>
            <View style={[s.sheetHead, { flexDirection: rowDir }]}>
              <View style={[s.sheetIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="calendar-outline" size={18} color={th.primary} />
              </View>
              <Text style={[s.sheetTitle, { color: th.text, textAlign: align }]}>{label || T.pickDate}</Text>
            </View>

            {pickerView === 'year' ? (
              <>
                <View style={[s.monthHead, { flexDirection: rowDir }]}>
                  <TouchableOpacity
                    onPress={() => setYearPageStart(prev => prev - YEAR_PAGE_SIZE)}
                    accessibilityLabel={T.previousYears}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={18} color={th.text} />
                  </TouchableOpacity>
                  <Text style={[s.monthTitle, { color: th.text }]}>
                    {yearPageStart} – {yearPageStart + YEAR_PAGE_SIZE - 1}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setYearPageStart(prev => prev + YEAR_PAGE_SIZE)}
                    accessibilityLabel={T.nextYears}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.text} />
                  </TouchableOpacity>
                </View>
                <Text style={[s.yearHint, { color: th.sub, textAlign: align }]}>{T.chooseYear}</Text>
                <View style={s.yearGrid}>
                  {yearOptions.map(year => {
                    const active = viewDate.getFullYear() === year;
                    const current = new Date().getFullYear() === year;
                    return (
                      <TouchableOpacity
                        key={year}
                        onPress={() => chooseYear(year)}
                        style={[
                          s.yearCell,
                          {
                            backgroundColor: active ? th.primary : current ? th.primSoft : th.input,
                            borderColor: active || current ? th.primary : th.border,
                          },
                        ]}
                      >
                        <Text style={[s.yearCellText, { color: active ? th.onPrimary : current ? th.primary : th.text }]}>
                          {year}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : monthOnly ? (
              <>
                <View style={[s.monthHead, { flexDirection: rowDir }]}>
                  <TouchableOpacity
                    onPress={() => setViewDate(prev => new Date(prev.getFullYear() - 1, 0, 1, 12, 0, 0))}
                    accessibilityLabel={T.previousMonth}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={18} color={th.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openYearPicker}
                    accessibilityLabel={T.chooseYear}
                    style={[s.yearTitleButton, { backgroundColor: th.input, borderColor: th.border }]}
                  >
                    <Text style={[s.monthTitle, { color: th.text }]}>{viewDate.getFullYear()}</Text>
                    <Ionicons name="chevron-down" size={15} color={th.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewDate(prev => new Date(prev.getFullYear() + 1, 0, 1, 12, 0, 0))}
                    accessibilityLabel={T.nextMonth}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.text} />
                  </TouchableOpacity>
                </View>
                <View style={s.monthGrid}>
                  {monthOptions.map(item => {
                    const active = selectedDate.getFullYear() === viewDate.getFullYear()
                      && selectedDate.getMonth() === item.month;
                    return (
                      <TouchableOpacity
                        key={item.month}
                        onPress={() => chooseMonth(item.month)}
                        style={[
                          s.monthCell,
                          {
                            backgroundColor: active ? th.primary : th.input,
                            borderColor: active ? th.primary : th.border,
                          },
                        ]}
                      >
                        <Text style={[s.monthCellText, { color: active ? th.onPrimary : th.text }]} numberOfLines={1} adjustsFontSizeToFit>
                          {item.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={[s.monthHead, { flexDirection: rowDir }]}>
                  <TouchableOpacity
                    onPress={() => setViewDate(prev => shiftMonth(prev, -1))}
                    accessibilityLabel={T.previousMonth}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-forward' : 'chevron-back'} size={18} color={th.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={openYearPicker}
                    accessibilityLabel={T.chooseYear}
                    style={[s.yearTitleButton, { backgroundColor: th.input, borderColor: th.border }]}
                  >
                    <Text style={[s.monthTitle, { color: th.text }]}>
                      {monthName} {viewDate.getFullYear()}
                    </Text>
                    <Ionicons name="chevron-down" size={15} color={th.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setViewDate(prev => shiftMonth(prev, 1))}
                    accessibilityLabel={T.nextMonth}
                    style={[s.monthBtn, { backgroundColor: th.input }]}
                  >
                    <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.text} />
                  </TouchableOpacity>
                </View>

                <View style={s.weekRow}>
                  {dayNames.map((name) => (
                    <Text key={name} style={[s.weekDay, { color: th.faint }]}>{name}</Text>
                  ))}
                </View>

                <View style={s.grid}>
                  {days.map((item) => {
                    const active = item.iso === currentValue;
                    const isToday = item.iso === todayISO;
                    return (
                      <TouchableOpacity
                        key={item.iso}
                        onPress={() => chooseDate(item.iso)}
                        style={[
                          s.dayCell,
                          {
                            backgroundColor: active ? th.primary : isToday ? th.primSoft : 'transparent',
                            borderColor: active ? th.primary : isToday ? th.primary : th.border,
                            opacity: item.inMonth ? 1 : 0.42,
                          },
                        ]}
                      >
                        <Text style={[s.dayText, { color: active ? th.onPrimary : isToday ? th.primary : th.text }]}>
                          {item.day}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  label: { fontSize: TYPE.meta, lineHeight: 17, ...weight('900'), marginBottom: 8 },
  inlineLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  inlineDetail: { fontSize: 9, lineHeight: 12, ...weight('700'), marginTop: 1 },
  button: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 0.5,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonText: { fontSize: 13, lineHeight: 18, ...weight('900') },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 14,
  },
  sheet: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
    borderRadius: RADIUS.sheet,
    borderWidth: 0.5,
    padding: 14,
    gap: 12,
    ...SHADOW.float,
  },
  sheetHead: { alignItems: 'center', gap: 10 },
  sheetIcon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { flex: 1, fontSize: TYPE.body, lineHeight: 21, ...weight('900') },
  monthHead: { alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  monthBtn: { width: 38, height: 38, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  monthTitle: { flex: 1, textAlign: 'center', fontSize: 16, lineHeight: 23, ...weight('900') },
  yearTitleButton: { flex: 1, minHeight: 38, borderRadius: RADIUS.md, borderWidth: 0.5, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  yearHint: { fontSize: TYPE.meta, lineHeight: 18, ...weight('800') },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  yearCell: { width: '22%', minHeight: 48, flexGrow: 1, borderRadius: RADIUS.md, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  yearCellText: { fontSize: TYPE.body, lineHeight: 21, ...weight('900'), textAlign: 'center' },
  weekRow: { flexDirection: 'row', gap: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 12, lineHeight: 17, ...weight('900') },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthCell: { width: '31%', minHeight: 44, flexGrow: 1, borderRadius: RADIUS.md, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  monthCellText: { fontSize: TYPE.meta, lineHeight: 18, ...weight('900'), textAlign: 'center' },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    borderRadius: RADIUS.sm,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: { fontSize: TYPE.meta, lineHeight: 17, ...weight('900') },
});
