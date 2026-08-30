import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { useStore } from '../store/useStore';
import { getModules } from '../lib/modules';
import { ScreenScroll, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// My Money is a calm navigation hub. Wallet management remains available in
// existing flows, but it is intentionally not promoted here until it has a
// clearer job than the user's actual workflow (record, plan, understand).
export default function MyMoneyScreen({
  onOpenHistory,
  onOpenBudget,
  onOpenReports,
  onOpenBasira,
  onOpenIncomeAllocation,
}) {
  const { th, lang, isAr } = useTheme();
  const cfg = useStore(state => state.cfg);
  const modules = getModules(cfg);
  const gateways = [
    {
      key: 'history',
      icon: 'receipt-outline',
      tone: th.primary,
      title: isAr ? 'الحركات والسجل' : 'Transactions & History',
      description: isAr ? 'أضف، ابحث، وعدّل حركاتك' : 'Add, search, and edit your transactions',
      onPress: onOpenHistory,
    },
    {
      key: 'budget',
      icon: 'calendar-outline',
      tone: th.warn,
      title: isAr ? 'الخطة والميزانية' : 'Plan & Budget',
      description: isAr ? 'ضع خطتك وتابع ما صُرف منها' : 'Set your plan and follow what you spend',
      onPress: onOpenBudget,
    },
    {
      key: 'reports',
      icon: 'bar-chart-outline',
      tone: th.inc,
      title: isAr ? 'التقارير' : 'Reports',
      description: isAr ? 'افهم دخلك وصرفك واتخذ قرارك' : 'Understand your money and decide clearly',
      onPress: onOpenReports,
    },
    {
      key: 'basira',
      icon: 'sparkles-outline',
      tone: th.primary,
      title: isAr ? 'بصيرة MYFI' : 'MYFI Basira',
      description: isAr ? 'اكتشف ما تغيّر ولماذا من بياناتك الفعلية' : 'Discover what changed and why from your real data',
      onPress: onOpenBasira,
    },
    {
      key: 'allocation',
      icon: 'pie-chart-outline',
      tone: th.transfer,
      title: isAr ? 'خطة توزيع الدخل' : 'Income allocation plan',
      description: isAr ? 'حوّل نسبك إلى مبالغ وقارن الخطة بالواقع' : 'Turn percentages into amounts and compare plan with reality',
      onPress: onOpenIncomeAllocation,
    },
  ].filter(item => item.key !== 'budget' || modules.budgets);

  return (
    <ScreenScroll th={th}>
      <View style={s.pageHeading}>
        <Text style={[s.pageTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'أموالي' : 'My Money'}</Text>
        <Text style={[s.pageSubtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'سجّل أموالك، نظّم خطتك، وافهمها بوضوح' : 'Record, plan, and understand your money clearly'}</Text>
      </View>

      <View style={[s.gatewayList, { flexDirection: rowDirection(lang) }]}>
        {gateways.map(({ key, ...gateway }) => (
          <MoneyGateway key={key} th={th} lang={lang} {...gateway} />
        ))}
      </View>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  pageHeading: { marginTop: 4, marginBottom: SPACE.xl },
  pageTitle: { fontSize: 27, lineHeight: 34, ...weight('900') },
  pageSubtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  gatewayList: { gap: SPACE.md, flexWrap: 'wrap', alignItems: 'stretch' },
  gateway: {
    width: '47.8%',
    minHeight: 148,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: SPACE.lg,
    justifyContent: 'space-between',
    gap: SPACE.sm,
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
  gatewayTop: { alignItems: 'center', justifyContent: 'space-between' },
  gatewayTitle: { fontSize: 14, lineHeight: 20, ...weight('900') },
  gatewayDescription: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 3 },
});

function MoneyGateway({ th, lang, icon, tone, title, description, onPress }) {
  const isAr = lang === 'ar';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={[s.gateway, { backgroundColor: th.card, borderColor: th.border }]}
    >
      <View style={[s.gatewayTop, { flexDirection: rowDirection(lang) }]}>
        <View style={[s.gatewayIcon, { backgroundColor: `${tone}18` }]}>
          <Ionicons name={icon} size={22} color={tone} />
        </View>
        <Ionicons name={isAr ? 'arrow-back' : 'arrow-forward'} size={18} color={tone} />
      </View>
      <View style={s.gatewayText}>
        <Text style={[s.gatewayTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
        <Text style={[s.gatewayDescription, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={3}>{description}</Text>
      </View>
    </Touchable>
  );
}
