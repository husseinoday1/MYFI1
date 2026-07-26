import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { getSymbol } from '../lib/constants';
import { getModules } from '../lib/modules';
import { getDefaultWalletId, getWalletLabel, normalizeWallets } from '../lib/wallets';
import { buildFinancialSnapshot, byMonth, calcStats, catSpend } from '../utils/calc';
import { MetricCard, SectionTitle, Touchable } from '../components/AppPrimitives';
import { generateMonthPDF } from '../lib/pdf';

const monthToken = (m, y) => `${y}-${m}`;

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'تقارير الشهر' : 'Monthly reports',
    subtitle: ar ? 'افهم وضعك بسرعة، ثم انزل للتفاصيل فقط عند الحاجة.' : 'See the month clearly, then drill into what matters.',
    noData: ar ? 'لا توجد بيانات لهذا الشهر' : 'No data for this month',
    categories: ar ? 'أين ذهب المال' : 'Where money went',
    totalSpent: ar ? 'إجمالي الصرف' : 'Total spent',
    wallets: ar ? 'حسب المحافظ' : 'By wallet',
    walletMovement: ar ? 'حركة الشهر' : 'Month movement',
    comparison: ar ? 'مقارنة مع الأشهر' : 'Compare months',
    thisMonth: ar ? 'هذا الشهر' : 'This month',
    income: ar ? 'الإيرادات' : 'Income',
    expense: ar ? 'المصاريف' : 'Expenses',
    net: ar ? 'الصافي' : 'Net',
    savingsRate: ar ? 'معدل الادخار' : 'Savings rate',
    transactions: ar ? 'المعاملات' : 'Transactions',
    left: ar ? 'متبقي' : 'Left',
    over: ar ? 'متجاوز' : 'Over',
    used: ar ? 'مستخدم' : 'Used',
    monthPicker: ar ? 'اختر الشهر' : 'Choose month',
    compareHint: ar ? 'اختر حتى 4 أشهر للمقارنة' : 'Pick up to 4 months to compare',
    incomeShort: ar ? 'دخل' : 'Income',
    expenseShort: ar ? 'صرف' : 'Expense',
    emptyWallets: ar ? 'محفظة واحدة فقط' : 'Only one wallet so far',
    summarySafe: ar ? 'الشهر متوازن.' : 'The month looks balanced.',
    summaryWarn: ar ? 'الصرف يحتاج متابعة.' : 'Spending needs attention.',
    summaryDanger: ar ? 'التوقعات تضغط على نهاية الشهر.' : 'Forecast is putting pressure on month end.',
    summaryNeutral: ar ? 'أضف بيانات أكثر لتظهر صورة أدق.' : 'Add more data for a clearer picture.',
  };
};

const summaryText = (health, C) => {
  if (health === 'danger') return C.summaryDanger;
  if (health === 'warning' || health === 'watch') return C.summaryWarn;
  if (health === 'safe') return C.summarySafe;
  return C.summaryNeutral;
};

export default function ReportsScreen() {
  const { trans, debts, goals, wallets, cats, cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const C = copy(cfg.lang);
  const isAr = cfg.lang === 'ar';
  const exportPdfLabel = isAr ? 'تصدير PDF' : 'Export PDF';
  const sym = getSymbol(cfg.currency);
  const modules = getModules(cfg);
  const align = isAr ? 'right' : 'left';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const now = new Date();

  const monthsList = useMemo(() => {
    const map = new Map();
    map.set(monthToken(now.getMonth(), now.getFullYear()), { m: now.getMonth(), y: now.getFullYear() });
    trans.forEach(t => {
      if (!t.dateISO) return;
      const d = new Date(`${t.dateISO}T12:00:00`);
      if (Number.isNaN(d.getTime())) return;
      map.set(monthToken(d.getMonth(), d.getFullYear()), { m: d.getMonth(), y: d.getFullYear() });
    });
    return [...map.values()].sort((a, b) => (b.y - a.y) || (b.m - a.m));
  }, [trans]);

  const [selectedKey, setSelectedKey] = useState(monthToken(now.getMonth(), now.getFullYear()));
  const [compareKeys, setCompareKeys] = useState([monthToken(now.getMonth(), now.getFullYear())]);

  const selectedMonth = monthsList.find(({ m, y }) => monthToken(m, y) === selectedKey) || { m: now.getMonth(), y: now.getFullYear() };
  const monthTrans = useMemo(
    () => byMonth(trans, selectedMonth.m, selectedMonth.y),
    [trans, selectedMonth.m, selectedMonth.y],
  );

  const monthStats = useMemo(() => calcStats(monthTrans), [monthTrans]);
  const monthDate = useMemo(() => new Date(selectedMonth.y, selectedMonth.m, 15, 12, 0, 0), [selectedMonth.m, selectedMonth.y]);
  const snapshot = useMemo(
    () => buildFinancialSnapshot({ trans, debts, goals, cats }, monthDate),
    [trans, debts, goals, cats, monthDate],
  );
  const spending = useMemo(() => catSpend(monthTrans, cats).sort((a, b) => b.spent - a.spent), [monthTrans, cats]);
  const walletRows = useMemo(() => {
    const defaultWalletId = getDefaultWalletId(wallets, cfg.currency, cfg.defaultWalletId);
    const normalized = normalizeWallets(wallets, cfg.currency);
    const map = new Map(normalized.map(wallet => [wallet.id, { ...wallet, monthNet: 0 }]));
    monthTrans.forEach(tx => {
      if (tx.kind === 'transfer') {
        const amount = Math.abs(Number(tx.transferAmount || 0));
        const fromId = tx.fromWalletId;
        const toId = tx.toWalletId;
        if (!fromId || !toId) return;
        if (map.has(fromId)) map.get(fromId).monthNet -= amount;
        if (map.has(toId)) map.get(toId).monthNet += amount;
        return;
      }
      const walletId = tx.walletId || defaultWalletId;
      if (!walletId) return;
      if (map.has(walletId)) map.get(walletId).monthNet += Number(tx.amt || 0);
    });
    return [...map.values()].sort((a, b) => {
      if (a.id === defaultWalletId) return -1;
      if (b.id === defaultWalletId) return 1;
      return Math.abs(b.monthNet) - Math.abs(a.monthNet);
    });
  }, [wallets, monthTrans, cfg.currency, cfg.defaultWalletId]);

  const compareData = useMemo(() => (
    monthsList
      .filter(({ m, y }) => compareKeys.includes(monthToken(m, y)))
      .map(({ m, y }) => {
        const stats = calcStats(byMonth(trans, m, y));
        return {
          key: monthToken(m, y),
          m,
          y,
          label: `${(cfg.lang === 'ar' ? CfgMonthsAr : CfgMonthsEn)[m]} ${y}`,
          ...stats,
        };
      })
  ), [monthsList, compareKeys, trans, cfg.lang]);

  const maxCompareVal = Math.max(1, ...compareData.flatMap(item => [item.inc, item.exp]));
  const totalCategorySpend = spending.reduce((sum, cat) => sum + Number(cat.spent || 0), 0);
  const categoryShares = spending
    .filter(cat => Number(cat.spent || 0) > 0)
    .map(cat => ({
      ...cat,
      percent: Math.round((Number(cat.spent || 0) / Math.max(1, totalCategorySpend)) * 100),
    }));

  const fmt = (n) => Math.abs(Math.round(Number(n) || 0)).toLocaleString();
  const signed = (n) => `${n >= 0 ? '+' : '-'}${fmt(n)} ${sym}`;

  const monthLabel = `${(cfg.lang === 'ar' ? CfgMonthsAr : CfgMonthsEn)[selectedMonth.m]} ${selectedMonth.y}`;

  const toggleCompare = (key) => {
    setCompareKeys(prev => (
      prev.includes(key)
        ? prev.filter(item => item !== key)
        : prev.length >= 4 ? prev : [...prev, key]
    ));
  };

  const exportCurrentMonth = () => {
    generateMonthPDF(
      {
        name: monthLabel,
        trans: monthTrans,
        inc: monthStats.inc,
        exp: monthStats.exp,
        net: monthStats.bal,
      },
      cats,
      { currency: cfg.currency, lang: cfg.lang, name: cfg.name || 'MYFI' },
    );
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 56 }}>
      <View style={[s.hero, { backgroundColor: th.primaryContainer }]}>
        <Text style={{ color: th.onPrimaryContainer, fontSize: 12, ...weight('900'), textAlign: align }}>{C.title}</Text>
        <Text style={{ color: th.onPrimaryContainer, fontSize: 29, lineHeight: 36, ...weight('900'), marginTop: 8, textAlign: align }} numberOfLines={1} adjustsFontSizeToFit>
          {monthLabel}
        </Text>
        <Text style={{ color: th.onPrimaryContainer, fontSize: 12, lineHeight: 18, opacity: 0.92, marginTop: 8, textAlign: align }}>
          {summaryText(snapshot.health, C)} {C.subtitle}
        </Text>
        <Touchable onPress={exportCurrentMonth} style={[s.exportBtn, { backgroundColor: 'rgba(255,255,255,0.14)', alignSelf: isAr ? 'flex-end' : 'flex-start' }]}>
          <Ionicons name="document-text-outline" size={14} color={th.onPrimaryContainer} />
          <Text style={{ color: th.onPrimaryContainer, fontSize: 12, ...weight('900') }}>{exportPdfLabel}</Text>
        </Touchable>
      </View>

      <SectionTitle th={th} lang={cfg.lang}>{C.monthPicker}</SectionTitle>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        {monthsList.map(({ m, y }) => {
          const key = monthToken(m, y);
          const active = key === selectedKey;
          return (
            <Touchable
              key={key}
              onPress={() => setSelectedKey(key)}
              style={[s.chip, { backgroundColor: active ? th.primary : th.cardHigh }]}
            >
              <Text style={{ color: active ? th.onPrimary : th.sub, ...weight('800'), fontSize: 12 }}>
                {(cfg.lang === 'ar' ? CfgMonthsAr : CfgMonthsEn)[m]} {y}
              </Text>
            </Touchable>
          );
        })}
      </ScrollView>

      <View style={s.metricGrid}>
        <MetricCard th={th} lang={cfg.lang} icon="arrow-down-circle-outline" label={C.income} value={`+${fmt(monthStats.inc)} ${sym}`} tone={th.inc} helper={C.thisMonth} />
        <MetricCard th={th} lang={cfg.lang} icon="arrow-up-circle-outline" label={C.expense} value={`-${fmt(monthStats.exp)} ${sym}`} tone={th.exp} helper={C.thisMonth} />
        <MetricCard th={th} lang={cfg.lang} icon="pulse-outline" label={C.net} value={signed(monthStats.bal)} tone={monthStats.bal >= 0 ? th.inc : th.exp} helper={C.thisMonth} />
        <MetricCard th={th} lang={cfg.lang} icon="leaf-outline" label={C.savingsRate} value={`${snapshot.month.savingsRate}%`} tone={snapshot.month.savingsRate >= 20 ? th.inc : th.warn} helper={C.thisMonth} />
      </View>

      <View style={{ marginTop: 2 }}>
        <SectionTitle th={th} lang={cfg.lang}>{C.categories}</SectionTitle>
        {categoryShares.length === 0 ? (
          <EmptyState label={C.noData} th={th} />
        ) : (
          <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={s.donutWrap}>
              <DonutChart items={categoryShares} bg={th.cardHigh} />
              <View style={s.donutCenter}>
                <Text style={{ color: th.sub, fontSize: 11, ...weight('800'), textAlign: 'center' }}>{C.totalSpent}</Text>
                <Text style={{ color: th.text, fontSize: 18, ...weight('900'), marginTop: 3, textAlign: 'center' }} numberOfLines={1} adjustsFontSizeToFit>
                  {fmt(totalCategorySpend)} {sym}
                </Text>
              </View>
            </View>

            <View style={s.donutLegend}>
              {categoryShares.map(cat => (
                <View key={cat.id} style={[s.legendLine, { flexDirection: rowDir }]}>
                  <View style={[s.legendName, { flexDirection: rowDir }]}>
                    <View style={[s.legendDot, { backgroundColor: cat.color }]} />
                    <Text style={{ color: th.text, fontSize: 12, ...weight('900'), flex: 1, textAlign: align }} numberOfLines={1}>
                      {cfg.lang === 'ar' ? cat.label : cat.labelEn}
                    </Text>
                  </View>
                  <Text style={{ color: th.primary, fontSize: 12, ...weight('900'), minWidth: 44, textAlign: 'center' }}>
                    {cat.percent}%
                  </Text>
                  <Text style={{ color: th.sub, fontSize: 12, ...weight('800'), minWidth: 82, textAlign: isAr ? 'left' : 'right' }} numberOfLines={1}>
                    {fmt(cat.spent)} {sym}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {modules.wallets && (
        <View style={{ marginTop: 16 }}>
          <SectionTitle th={th} lang={cfg.lang}>{C.wallets}</SectionTitle>
          {walletRows.length <= 1 ? (
            <EmptyState label={C.emptyWallets} th={th} />
          ) : walletRows.map(wallet => (
            <View key={wallet.id} style={[s.walletRow, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDir }]}>
              <View style={[s.dotIcon, { backgroundColor: th.primSoft }]}>
                <Ionicons name="wallet-outline" size={14} color={th.primary} />
              </View>
              <Text style={{ color: th.text, fontSize: 13, ...weight('800'), flex: 1, textAlign: align }}>
                {getWalletLabel(wallet, cfg.lang)}
              </Text>
              <Text style={{ color: Number(wallet.monthNet || 0) >= 0 ? th.inc : th.exp, fontSize: 13, ...weight('900') }}>
                {wallet.monthNet >= 0 ? '+' : '-'}{fmt(wallet.monthNet)} {wallet.currency || sym}
              </Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ marginTop: 18 }}>
        <SectionTitle th={th} lang={cfg.lang}>{C.comparison}</SectionTitle>
        <Text style={{ color: th.faint, fontSize: 11, marginBottom: 10, textAlign: align }}>{C.compareHint}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {monthsList.map(({ m, y }) => {
            const key = monthToken(m, y);
            const active = compareKeys.includes(key);
            return (
              <Touchable
                key={key}
                onPress={() => toggleCompare(key)}
                style={[s.chip, { backgroundColor: active ? th.primSoft : th.cardHigh, borderColor: active ? th.primary : 'transparent', borderWidth: 1.5 }]}
              >
                <Text style={{ color: active ? th.primary : th.sub, ...weight('800'), fontSize: 12 }}>
                  {(cfg.lang === 'ar' ? CfgMonthsAr : CfgMonthsEn)[m]} {y}
                </Text>
              </Touchable>
            );
          })}
        </ScrollView>

        {compareData.length > 0 ? (
          <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
            <View style={[s.compareChart, { flexDirection: rowDir }]}>
              {compareData.map(item => (
                <View key={item.key} style={s.compareCol}>
                  <View style={s.compareBars}>
                    <View style={[s.bar, { height: Math.max(5, (item.inc / maxCompareVal) * 110), backgroundColor: th.inc }]} />
                    <View style={[s.bar, { height: Math.max(5, (item.exp / maxCompareVal) * 110), backgroundColor: th.exp }]} />
                  </View>
                  <Text style={{ color: th.sub, fontSize: 10, marginTop: 8, textAlign: 'center' }}>
                    {(cfg.lang === 'ar' ? CfgMonthsAr : CfgMonthsEn)[item.m]}
                  </Text>
                  <Text style={{ color: item.bal >= 0 ? th.inc : th.exp, fontSize: 10, ...weight('900') }}>
                    {item.bal >= 0 ? '+' : '-'}{fmt(item.bal)}
                  </Text>
                </View>
              ))}
            </View>
            <View style={[s.legendRow, { flexDirection: rowDir }]}>
              <LegendItem color={th.inc} label={C.incomeShort} th={th} />
              <LegendItem color={th.exp} label={C.expenseShort} th={th} />
            </View>
          </View>
        ) : (
          <EmptyState label={C.compareHint} th={th} />
        )}
      </View>
    </ScrollView>
  );
}

function DonutChart({ items, bg }) {
  const size = 174;
  const center = size / 2;
  const radius = 60;
  const strokeWidth = 30;
  const circumference = 2 * Math.PI * radius;
  const total = Math.max(1, items.reduce((sum, next) => sum + Number(next.spent || 0), 0));
  let offset = 0;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={bg}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {items.map(item => {
        const length = (Number(item.spent || 0) / total) * circumference;
        const dashOffset = -offset;
        offset += length;
        return (
          <Circle
            key={item.id}
            cx={center}
            cy={center}
            r={radius}
            stroke={item.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${Math.max(0, length)} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="butt"
            transform={`rotate(-90 ${center} ${center})`}
          />
        );
      })}
    </Svg>
  );
}

function LegendItem({ color, label, th }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={[s.legendDot, { backgroundColor: color }]} />
      <Text style={{ color: th.sub, fontSize: 11 }}>{label}</Text>
    </View>
  );
}

function EmptyState({ label, th }) {
  return (
    <View style={[s.empty, { borderColor: th.border }]}>
      <Text style={{ color: th.sub, fontSize: 12, textAlign: 'center' }}>{label}</Text>
    </View>
  );
}

const CfgMonthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const CfgMonthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const s = StyleSheet.create({
  hero: { borderRadius: 16, paddingHorizontal: 18, paddingVertical: 17, marginBottom: 12 },
  exportBtn: { minHeight: 36, borderRadius: 11, paddingHorizontal: 12, paddingVertical: 9, marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 12, ...weight('900'), marginBottom: 8 },
  chip: { minHeight: 38, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, marginRight: 8, justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginBottom: 14 },
  metricCard: { width: '48.8%', borderRadius: 14, padding: 12, borderWidth: 0.5, minHeight: 102 },
  metricIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  card: { borderRadius: 14, padding: 14, borderWidth: 0.5 },
  donutWrap: { width: 194, height: 194, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  donutCenter: { position: 'absolute', width: 112, alignItems: 'center', justifyContent: 'center' },
  donutLegend: { gap: 3 },
  legendLine: { alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 36, paddingVertical: 5 },
  legendName: { alignItems: 'center', gap: 8, flex: 1 },
  dotIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 0.5, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center' },
  walletRow: { borderRadius: 13, borderWidth: 0.5, padding: 12, marginBottom: 8, alignItems: 'center', gap: 8 },
  compareChart: { justifyContent: 'space-around', alignItems: 'flex-end', height: 162 },
  compareCol: { flex: 1, alignItems: 'center' },
  compareBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 116 },
  bar: { width: 16, borderRadius: 4 },
  legendRow: { justifyContent: 'center', gap: 18, marginTop: 14 },
  legendDot: { width: 10, height: 10, borderRadius: 10 },
});
