import React, { useMemo } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { getModules } from '../lib/modules';
import { TH } from '../lib/theme';
import { ScreenScroll, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// This is MYFI's single user-facing personalization surface. It deliberately
// changes visibility only: financial records remain in the ledger/history and
// reappear unchanged when a module is turned back on.
export default function CustomizeMyfiScreen() {
  const { cfg, setCfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const lang = cfg.lang || 'ar';
  const isAr = lang === 'ar';
  const modules = getModules(cfg);
  const homeSections = useMemo(() => new Map((cfg.homeSections || []).map(item => [item.key, item.visible !== false])), [cfg.homeSections]);

  const featureItems = [
    { key: 'debtsOwed', icon: 'arrow-down-outline', tone: th.exp, title: isAr ? 'دين عليّ' : 'Debt I owe', description: isAr ? 'إظهار ما عليك للآخرين وخيارات السداد' : 'Show what you owe and repayment tools' },
    { key: 'debtsReceivable', icon: 'arrow-up-outline', tone: th.inc, title: isAr ? 'دين لي' : 'Debt owed to me', description: isAr ? 'إظهار ما لك عند الآخرين وخيارات التحصيل' : 'Show receivables and collection tools' },
    { key: 'goals', icon: 'flag-outline', tone: th.primary, title: isAr ? 'الأهداف والتوفير' : 'Goals & savings', description: isAr ? 'إظهار أهداف الادخار والتقدم نحوها' : 'Show saving goals and progress' },
    { key: 'commitments', icon: 'calendar-outline', tone: th.warn, title: isAr ? 'الالتزامات' : 'Commitments', description: isAr ? 'إظهار الدفعات والمواعيد المتكررة' : 'Show due dates and recurring payments' },
    { key: 'budgets', icon: 'pie-chart-outline', tone: th.transfer, title: isAr ? 'الخطة والميزانية' : 'Plan & budget', description: isAr ? 'إظهار بوابة الخطة والميزانية في أموالي' : 'Show the plan and budget gateway in My Money' },
  ];
  const homeItems = [
    { key: 'attention', icon: 'alert-circle-outline', tone: th.warn, title: isAr ? 'الحالات المهمة' : 'Important states' },
    { key: 'goals', icon: 'flag-outline', tone: th.primary, title: isAr ? 'التوفير' : 'Savings' },
    { key: 'recentTransactions', icon: 'receipt-outline', tone: th.inc, title: isAr ? 'آخر الحركات' : 'Recent transactions' },
  ];

  const updateModule = (key, value) => setCfg({ enabledModules: { ...modules, [key]: value } });
  const updateHomeSection = (key, value) => {
    const existing = Array.isArray(cfg.homeSections) ? cfg.homeSections : [];
    const found = existing.some(item => item?.key === key);
    setCfg({
      homeSections: found
        ? existing.map(item => item?.key === key ? { ...item, visible: value } : item)
        : [...existing, { key, visible: value }],
    });
  };
  const showAll = () => setCfg({
    enabledModules: { ...modules, debtsOwed: true, debtsReceivable: true, goals: true, commitments: true, budgets: true },
    homeSections: (cfg.homeSections || []).map(item => ({ ...item, visible: true })),
  });

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'تخصيص MYFI' : 'Customize MYFI'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>
          {isAr ? 'اختر ما يظهر لك. الإخفاء لا يحذف بياناتك.' : 'Choose what you see. Hiding never deletes your data.'}
        </Text>
      </View>

      <View style={[s.assurance, { backgroundColor: th.primSoft, borderColor: `${th.primary}45`, flexDirection: rowDirection(lang) }]}>
        <View style={[s.assuranceIcon, { backgroundColor: th.card }]}><Ionicons name="shield-checkmark-outline" size={19} color={th.primary} /></View>
        <Text style={[s.assuranceText, { color: th.text, textAlign: textAlign(lang) }]}>
          {isAr ? 'عند إخفاء ميزة، تبقى حركاتها وبياناتها محفوظة ويمكن إظهارها لاحقًا.' : 'When you hide a feature, its entries remain safe and can be shown again later.'}
        </Text>
      </View>

      <SectionHeading th={th} lang={lang} title={isAr ? 'ما الذي أتابعه؟' : 'What do I follow?'} />
      <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
        {featureItems.map(({ key, ...item }, index) => (
          <CustomizationRow
            key={key}
            th={th}
            lang={lang}
            last={index === featureItems.length - 1}
            value={modules[item.key] !== false}
            onValueChange={value => updateModule(item.key, value)}
            {...item}
          />
        ))}
      </View>

      <SectionHeading th={th} lang={lang} title={isAr ? 'ما الذي يظهر في الرئيسية؟' : 'What appears on Home?'} />
      <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
        {homeItems.map(({ key, ...item }, index) => (
          <CustomizationRow
            key={key}
            th={th}
            lang={lang}
            last={index === homeItems.length - 1}
            value={homeSections.get(item.key) !== false}
            onValueChange={value => updateHomeSection(item.key, value)}
            description={isAr ? 'يمكنك إظهاره أو إخفاؤه من الشاشة الرئيسية' : 'Show or hide it on the Home screen'}
            {...item}
          />
        ))}
      </View>

      <Touchable onPress={showAll} style={[s.showAll, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]} accessibilityRole="button">
        <Ionicons name="eye-outline" size={18} color={th.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[s.showAllTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'إظهار كل الميزات' : 'Show all features'}</Text>
          <Text style={[s.showAllDescription, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'أعد الواجهات القابلة للتخصيص من دون تغيير بياناتك' : 'Restore customizable surfaces without changing data'}</Text>
        </View>
        <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.primary} />
      </Touchable>
    </ScreenScroll>
  );
}

function SectionHeading({ th, lang, title }) {
  return (
    <View style={[s.sectionHeading, { flexDirection: rowDirection(lang) }]}>
      <View style={[s.sectionMark, { backgroundColor: th.primary }]} />
      <Text style={[s.sectionTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
    </View>
  );
}

function CustomizationRow({ th, lang, icon, tone, title, description, value, onValueChange, last }) {
  return (
    <View style={[s.row, { flexDirection: rowDirection(lang), borderBottomColor: last ? 'transparent' : th.border }]}>
      <View style={[s.rowIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={19} color={tone} /></View>
      <View style={s.rowText}>
        <Text style={[s.rowTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
        <Text style={[s.rowDescription, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={2}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: th.cardHigh, true: `${th.primary}88` }}
        thumbColor={value ? th.primary : th.faint}
        accessibilityLabel={title}
      />
    </View>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.lg },
  title: { fontSize: 27, lineHeight: 34, ...weight('900') },
  subtitle: { fontSize: 12, lineHeight: 19, ...weight('700'), marginTop: 4 },
  assurance: { borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', gap: 10, padding: 12, marginBottom: 15, ...SHADOW.card },
  assuranceIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  assuranceText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 17, ...weight('800') },
  sectionHeading: { alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 7 },
  sectionMark: { width: 28, height: 4, borderRadius: 2 },
  sectionTitle: { flex: 1, fontSize: 14, lineHeight: 19, ...weight('900') },
  group: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  row: { minHeight: 72, alignItems: 'center', gap: 10, paddingHorizontal: 11, paddingVertical: 9, borderBottomWidth: 1 },
  rowIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  rowDescription: { fontSize: 9, lineHeight: 14, ...weight('700'), marginTop: 2 },
  showAll: { minHeight: 66, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', gap: 10, paddingHorizontal: 12, marginTop: 18, ...SHADOW.card },
  showAllTitle: { fontSize: 12, lineHeight: 17, ...weight('900') },
  showAllDescription: { fontSize: 9, lineHeight: 14, ...weight('700'), marginTop: 2 },
});
