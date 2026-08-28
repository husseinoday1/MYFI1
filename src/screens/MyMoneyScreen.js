import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { ScreenScroll, SectionTitle, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// My Money is a calm navigation hub. Wallet management remains available in
// existing flows, but it is intentionally not promoted here until it has a
// clearer job than the user's actual workflow (record, plan, understand).
export default function MyMoneyScreen({
  onOpenHistory,
  onOpenBudget,
  onOpenReports,
  onAddTransaction,
}) {
  const { th, lang, isAr } = useTheme();
  const gateways = [
    {
      key: 'history',
      icon: 'receipt-outline',
      title: isAr ? 'الحركات والسجل' : 'Transactions & History',
      description: isAr ? 'أضف، ابحث، وعدّل حركاتك' : 'Add, search, and edit your transactions',
      onPress: onOpenHistory,
    },
    {
      key: 'budget',
      icon: 'calendar-outline',
      title: isAr ? 'الخطة والميزانية' : 'Plan & Budget',
      description: isAr ? 'ضع خطتك وتابع ما صُرف منها' : 'Set your plan and follow what you spend',
      onPress: onOpenBudget,
    },
    {
      key: 'reports',
      icon: 'bar-chart-outline',
      title: isAr ? 'التقارير' : 'Reports',
      description: isAr ? 'افهم دخلك وصرفك واتخذ قرارك' : 'Understand your money and decide clearly',
      onPress: onOpenReports,
    },
  ];

  return (
    <ScreenScroll th={th}>
      <View style={s.pageHeading}>
        <Text style={[s.pageTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'أموالي' : 'My Money'}</Text>
        <Text style={[s.pageSubtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'سجّل أموالك، نظّم خطتك، وافهمها بوضوح' : 'Record, plan, and understand your money clearly'}</Text>
      </View>

      <View style={s.gatewayList}>
        {gateways.map((gateway) => (
          <MoneyGateway key={gateway.key} th={th} lang={lang} {...gateway} />
        ))}
      </View>

      <SectionTitle th={th} lang={lang}>{isAr ? 'اختصار سريع' : 'Quick shortcut'}</SectionTitle>
      <View style={[s.shortcuts, { flexDirection: rowDirection(lang) }]}>
        <QuickShortcut th={th} icon="add" label={isAr ? 'إضافة حركة' : 'Add transaction'} onPress={onAddTransaction} />
        <QuickShortcut th={th} icon="calendar-outline" label={isAr ? 'الخطة والميزانية' : 'Plan & Budget'} onPress={onOpenBudget} />
      </View>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  pageHeading: { marginTop: 4, marginBottom: SPACE.xl },
  pageTitle: { fontSize: 27, lineHeight: 34, ...weight('900') },
  pageSubtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  gatewayList: { gap: SPACE.md },
  gateway: {
    minHeight: 96,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACE.lg,
    alignItems: 'center',
    gap: SPACE.md,
    ...SHADOW.card,
  },
  gatewayIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayText: { flex: 1, gap: 3 },
  gatewayTitle: { fontSize: 16, lineHeight: 22, ...weight('900') },
  gatewayDescription: { fontSize: 12, lineHeight: 18, ...weight('700') },
  shortcuts: { gap: SPACE.md },
  shortcut: {
    flex: 1,
    minHeight: 88,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACE.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...SHADOW.card,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: { fontSize: 12, lineHeight: 17, ...weight('900'), textAlign: 'center' },
});

function MoneyGateway({ th, lang, icon, title, description, onPress }) {
  const isAr = lang === 'ar';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={[s.gateway, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}
    >
      <View style={[s.gatewayIcon, { backgroundColor: th.primSoft }]}>
        <Ionicons name={icon} size={22} color={th.primary} />
      </View>
      <View style={s.gatewayText}>
        <Text style={[s.gatewayTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
        <Text style={[s.gatewayDescription, { color: th.sub, textAlign: textAlign(lang) }]}>{description}</Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={20} color={th.faint} />
    </Touchable>
  );
}

function QuickShortcut({ th, icon, label, onPress }) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.shortcut, { backgroundColor: th.card, borderColor: th.border }]}
    >
      <View style={[s.shortcutIcon, { backgroundColor: th.primSoft }]}>
        <Ionicons name={icon} size={18} color={th.primary} />
      </View>
      <Text style={[s.shortcutLabel, { color: th.text }]} numberOfLines={1}>{label}</Text>
    </Touchable>
  );
}
