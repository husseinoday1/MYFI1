import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { ScreenScroll, SectionTitle, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

// More is navigation, not a dashboard. Every row below opens a real screen;
// no decorative settings, placeholder dialogs, or trust claims live here.
export default function MoreScreen({
  onOpenSettingsPage,
  onOpenArchive,
  onOpenWallets,
  onOpenCategories,
  onOpenSubscriptions,
  onOpenBenefits,
}) {
  const { th, lang, isAr } = useTheme();
  const groups = [
    {
      title: isAr ? 'أدواتي' : 'My tools',
      items: [
        {
          key: 'wallets', icon: 'wallet-outline', tone: th.primary,
          title: isAr ? 'المحافظ والحسابات' : 'Wallets & accounts',
          description: isAr ? 'الأرصدة، العملات، والمحفظة الافتراضية' : 'Balances, currencies, and your default wallet',
          onPress: onOpenWallets,
        },
        {
          key: 'categories', icon: 'pricetags-outline', tone: th.exp,
          title: isAr ? 'التصنيفات' : 'Categories',
          description: isAr ? 'نظّم تصنيفات الدخل والمصروف وأضف تصنيفك' : 'Organize income and expense categories and add your own',
          onPress: onOpenCategories,
        },
        {
          key: 'archive', icon: 'archive-outline', tone: th.sub,
          title: isAr ? 'الأرشيف' : 'Archive',
          description: isAr ? 'الحسابات والفئات والمتابعات المؤرشفة' : 'Archived accounts, categories, and follow-ups',
          onPress: onOpenArchive,
        },
      ],
    },
    {
      title: isAr ? 'الوصول السريع' : 'Quick access',
      items: [{
        key: 'subscriptions', icon: 'repeat-outline', tone: th.transfer,
        title: isAr ? 'الاشتراكات' : 'Subscriptions',
        description: isAr ? 'ما سيتجدد، موعده، وكلفته المتكررة' : 'What renews, when it is due, and its recurring cost',
        onPress: onOpenSubscriptions,
      }],
    },
    {
      title: isAr ? 'المزايا' : 'Benefits',
      items: [
        {
          key: 'benefits', icon: 'gift-outline', tone: th.warn,
          title: isAr ? 'الهدايا والمكافآت' : 'Gifts & rewards',
          description: isAr ? 'حالة المكافآت والمزايا المتاحة ودعوة الأصدقاء' : 'Reward status, available benefits, and inviting friends',
          onPress: onOpenBenefits,
        },
      ],
    },
    {
      title: isAr ? 'بياناتك' : 'Your data',
      items: [{
        key: 'data', icon: 'cloud-outline', tone: th.transfer,
        title: isAr ? 'البيانات والملفات' : 'Data & files',
        description: isAr ? 'نسخ احتياطي، استعادة، تصدير واستيراد' : 'Backup, restore, export, and import',
        onPress: () => onOpenSettingsPage?.('data'),
      }],
    },
    {
      title: isAr ? 'المساعدة' : 'Help',
      items: [
        {
          key: 'guide', icon: 'book-outline', tone: th.primary,
          title: isAr ? 'دليل MYFI' : 'MYFI guide',
          description: isAr ? 'إجابات عملية حسب المهمة التي تريد إنجازها' : 'Practical help for the task you want to finish',
          onPress: () => onOpenSettingsPage?.('guide'),
        },
        {
          key: 'support', icon: 'help-buoy-outline', tone: th.primary,
          title: isAr ? 'الدعم والمساعدة' : 'Support & help',
          description: isAr ? 'الأسئلة الشائعة وطرق التواصل' : 'FAQs and ways to get help',
          onPress: () => onOpenSettingsPage?.('support'),
        },
      ],
    },
  ];

  return (
    <ScreenScroll th={th}>
      <View style={s.heading}>
        <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'المزيد' : 'More'}</Text>
        <Text style={[s.subtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'أدواتك وبياناتك والمساعدة في مكان هادئ' : 'Your tools, data, and help in one calm place'}</Text>
      </View>

      {groups.map(group => (
        <View key={group.title}>
          <SectionTitle th={th} lang={lang}>{group.title}</SectionTitle>
          <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
            {group.items.map(({ key, ...item }, index) => <MoreRow key={key} th={th} lang={lang} last={index === group.items.length - 1} {...item} />)}
          </View>
        </View>
      ))}

      <SectionTitle th={th} lang={lang}>{isAr ? 'التطبيق' : 'App'}</SectionTitle>
      <View style={[s.group, { backgroundColor: th.card, borderColor: th.border }]}>
        <MoreRow
          th={th}
          lang={lang}
          last
          icon="settings-outline"
          tone={th.primary}
          title={isAr ? 'الإعدادات' : 'Settings'}
          description={isAr ? 'المظهر واللغة والخصوصية والحساب' : 'Appearance, language, privacy, and account'}
          onPress={() => onOpenSettingsPage?.('root')}
        />
      </View>
    </ScreenScroll>
  );
}

function MoreRow({ th, lang, icon, tone, title, description, onPress, last }) {
  const isAr = lang === 'ar';
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={description}
      onPress={onPress}
      style={[s.row, { flexDirection: rowDirection(lang), borderBottomColor: last ? 'transparent' : th.border }]}
    >
      <View style={[s.rowIcon, { backgroundColor: `${tone}18` }]}><Ionicons name={icon} size={20} color={tone} /></View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
        <Text style={[s.rowDescription, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={2}>{description}</Text>
      </View>
      <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={19} color={th.faint} />
    </Touchable>
  );
}

const s = StyleSheet.create({
  heading: { marginTop: 4, marginBottom: SPACE.xl },
  title: { fontSize: 27, lineHeight: 34, ...weight('900') },
  subtitle: { fontSize: 13, lineHeight: 20, ...weight('700'), marginTop: 5 },
  group: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  row: { minHeight: 74, alignItems: 'center', gap: SPACE.md, paddingHorizontal: SPACE.md, paddingVertical: 11, borderBottomWidth: 1 },
  rowIcon: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 13, lineHeight: 18, ...weight('900') },
  rowDescription: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 2 },
});
