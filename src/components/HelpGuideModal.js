import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

const content = (lang = 'ar') => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'دليل الاستخدام' : 'User guide',
    close: ar ? 'إغلاق' : 'Close',
    intro: ar ? 'أربع أفكار تكفي لتبدأ بثقة.' : 'Four ideas are enough to get started confidently.',
    sections: [
      {
        icon: 'add-circle-outline',
        title: ar ? 'سجّل حركة' : 'Record an entry',
        body: ar ? 'من الرئيسية أو المعاملات اختر مصروفاً أو دخلاً أو تحويلاً. أدخل المبلغ أولاً، ثم راجع التفاصيل واحفظ.' : 'From Home or Transactions, choose an expense, income, or transfer. Enter the amount first, review the details, then save.',
      },
      {
        icon: 'mic-outline',
        title: ar ? 'استخدم الإدخال الذكي عند الحاجة' : 'Use smart entry when useful',
        body: ar ? 'يمكنك قراءة فاتورة أو وصف الحركة بالصوت أو النص. تبقى المراجعة والحفظ بيدك دائماً.' : 'Read a receipt or describe an entry by voice or text. You always review and confirm before saving.',
      },
      {
        icon: 'wallet-outline',
        title: ar ? 'تابع ما يهمك' : 'Track what matters',
        body: ar ? 'اربط الحركات بمحافظك ودين عليّ ودين لي وأهدافك والتزاماتك، وسيحدّث MYFI الأرصدة والتقدم تلقائياً.' : 'Link entries to wallets, debts, goals, and commitments. MYFI updates balances and progress automatically.',
      },
      {
        icon: 'analytics-outline',
        title: ar ? 'افهم وشارك' : 'Understand and share',
        body: ar ? 'اختر فترة التقرير، أضف مقارنة عند الحاجة، ثم شارك PDF للعرض أو CSV للتحليل والتدقيق.' : 'Choose a report period, add a comparison when needed, then share PDF for viewing or CSV for analysis and audit.',
      },
    ],
  };
};

export default function HelpGuideModal({ visible, onClose, th, lang = 'ar' }) {
  const T = content(lang);
  const ar = lang === 'ar';
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <View style={[s.sheet, { backgroundColor: th.bg, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={[s.header, { backgroundColor: th.card, borderBottomColor: th.border, flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{T.title}</Text>
              <Text style={[s.intro, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{T.intro}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={[s.close, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={19} color={th.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
            {T.sections.map(section => (
              <View key={section.title} style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
                <View style={[s.cardHead, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
                  <View style={[s.icon, { backgroundColor: th.primSoft }]}>
                    <Ionicons name={section.icon} size={18} color={th.primary} />
                  </View>
                  <Text style={[s.cardTitle, { color: th.text, textAlign: ar ? 'right' : 'left' }]}>{section.title}</Text>
                </View>
                <Text style={[s.body, { color: th.sub, textAlign: ar ? 'right' : 'left' }]}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { height: '92%', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden', ...SHADOW.float },
  header: { paddingHorizontal: 18, paddingVertical: 16, alignItems: 'center', gap: 12, borderBottomWidth: 1 },
  title: { fontSize: 20, ...weight('900') },
  intro: { fontSize: 12, lineHeight: 19, ...weight('700'), marginTop: 3 },
  close: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 28, gap: 10 },
  card: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 14 },
  cardHead: { alignItems: 'center', gap: 9 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { flex: 1, fontSize: 14, ...weight('900') },
  body: { fontSize: 12, lineHeight: 20, ...weight('700'), marginTop: 9 },
});
