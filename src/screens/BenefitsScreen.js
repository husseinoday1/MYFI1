import React from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../lib/useTheme';
import { PageIntro, ScreenScroll, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

export default function BenefitsScreen() {
  const { th, lang, isAr } = useTheme();
  const invite = () => Share.share({
    message: isAr
      ? 'جرّب MYFI لتنظيم الدخل والمصروف والمتابعات المالية في مكان واحد.'
      : 'Try MYFI to organize income, spending, and financial follow-ups in one place.',
  });

  return (
    <ScreenScroll th={th}>
      <PageIntro th={th} lang={lang} icon="gift-outline" title={isAr ? 'المزايا والهدايا' : 'Benefits & Rewards'} subtitle={isAr ? 'مزايا MYFI المتاحة لك وما سيصل إلى حسابك' : 'Your available MYFI benefits and account rewards'} />
      <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
        <View style={[s.row, { flexDirection: rowDirection(lang) }]}>
          <View style={[s.icon, { backgroundColor: `${th.warn}18` }]}><Ionicons name="gift-outline" size={20} color={th.warn} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'الهدايا والمكافآت' : 'Gifts & rewards'}</Text>
            <Text style={[s.body, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'لا توجد مكافأة نشطة الآن. لن نخفي هذا القسم، وأي مكافأة مستقبلية ستظهر هنا بوضوح.' : 'No reward is active now. This area stays visible and future rewards will appear here clearly.'}</Text>
          </View>
        </View>
        <View style={[s.divider, { backgroundColor: th.border }]} />
        <Touchable onPress={invite} style={[s.row, { flexDirection: rowDirection(lang) }]}>
          <View style={[s.icon, { backgroundColor: `${th.transfer}18` }]}><Ionicons name="share-social-outline" size={20} color={th.transfer} /></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'شارك MYFI' : 'Share MYFI'}</Text>
            <Text style={[s.body, { color: th.sub, textAlign: textAlign(lang) }]}>{isAr ? 'أرسل دعوة حقيقية عبر تطبيقات هاتفك.' : 'Send a real invitation through your phone apps.'}</Text>
          </View>
          <Ionicons name={isAr ? 'chevron-back' : 'chevron-forward'} size={18} color={th.faint} />
        </Touchable>
      </View>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  row: { minHeight: 78, padding: SPACE.md, alignItems: 'center', gap: SPACE.md },
  icon: { width: 40, height: 40, borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 13, lineHeight: 18, ...weight('900') },
  body: { fontSize: 10, lineHeight: 16, ...weight('700'), marginTop: 3 },
  divider: { height: 1, marginHorizontal: SPACE.md },
});
