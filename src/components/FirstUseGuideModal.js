import React, { useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { weight } from '../lib/tokens';

const copy = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'دليل MYFI' : 'MYFI guide',
    skip: ar ? 'تخطي' : 'Skip',
    next: ar ? 'التالي' : 'Next',
    done: ar ? 'ابدأ' : 'Start',
    steps: [
      {
        icon: 'wallet-outline',
        title: ar ? 'الرئيسية' : 'Home',
        body: ar ? 'ابدأ من الرصيد المتاح. هذا هو الرقم الأهم للاستخدام اليومي.' : 'Start with Available balance. It is the key number for daily use.',
      },
      {
        icon: 'add-circle-outline',
        title: ar ? 'سجّل حركة' : 'Add an entry',
        body: ar ? 'استخدم الإجراءات المباشرة للدخل أو الصرف أو التحويل.' : 'Use Direct actions for income, expense, or transfer.',
      },
      {
        icon: 'layers-outline',
        title: ar ? 'المتابعات' : 'Trackers',
        body: ar ? 'تابع الدين والتوفير والالتزامات من مكان واحد.' : 'Track debts, savings, and commitments in one place.',
      },
      {
        icon: 'bar-chart-outline',
        title: ar ? 'السجل والتقارير' : 'History & reports',
        body: ar ? 'السجل للتفاصيل. التقارير للصورة المالية العامة.' : 'History is for detail. Reports show the financial picture.',
      },
    ],
  };
};

export default function FirstUseGuideModal({ visible, onClose, th, lang = 'ar' }) {
  const [index, setIndex] = useState(0);
  const T = useMemo(() => copy(lang), [lang]);
  const isAr = lang === 'ar';
  const step = T.steps[index] || T.steps[0];

  const close = () => {
    setIndex(0);
    onClose?.();
  };

  const next = () => {
    if (index >= T.steps.length - 1) {
      close();
      return;
    }
    setIndex(value => value + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.head, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <Text style={[s.headTitle, { color: th.text, textAlign: isAr ? 'right' : 'left' }]}>{T.title}</Text>
            <Text style={[s.counter, { color: th.sub }]}>{index + 1}/{T.steps.length}</Text>
          </View>

          <View style={[s.icon, { backgroundColor: th.primSoft }]}>
            <Ionicons name={step.icon} size={34} color={th.primary} />
          </View>
          <Text style={[s.title, { color: th.text }]}>{step.title}</Text>
          <Text style={[s.body, { color: th.sub }]}>{step.body}</Text>

          <View style={[s.dots, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            {T.steps.map((_, stepIndex) => (
              <View
                key={stepIndex}
                style={[
                  s.dot,
                  {
                    width: stepIndex === index ? 24 : 7,
                    backgroundColor: stepIndex === index ? th.primary : th.cardHigh,
                  },
                ]}
              />
            ))}
          </View>

          <View style={[s.actions, { flexDirection: isAr ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={close} style={[s.secondary, { backgroundColor: th.cardHigh }]}>
              <Text style={{ color: th.sub, ...weight('900') }}>{T.skip}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={next} style={[s.primary, { backgroundColor: th.primary }]}>
              <Text style={{ color: th.onPrimary, ...weight('900') }}>
                {index === T.steps.length - 1 ? T.done : T.next}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  card: { borderRadius: 24, borderWidth: 1, padding: 20, alignItems: 'center' },
  head: { width: '100%', alignItems: 'center', justifyContent: 'space-between' },
  headTitle: { fontSize: 15, lineHeight: 21, ...weight('900') },
  counter: { fontSize: 11, ...weight('800') },
  icon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 26 },
  title: { fontSize: 22, lineHeight: 29, ...weight('900'), textAlign: 'center', marginTop: 18 },
  body: { fontSize: 13, lineHeight: 21, ...weight('700'), textAlign: 'center', marginTop: 8, maxWidth: 300 },
  dots: { alignItems: 'center', gap: 6, marginTop: 26 },
  dot: { height: 7, borderRadius: 999 },
  actions: { width: '100%', gap: 9, marginTop: 24 },
  secondary: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1.4, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
