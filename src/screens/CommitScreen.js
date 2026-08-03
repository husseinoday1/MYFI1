import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import DebtsScreen from './DebtsScreen';
import GoalsScreen from './GoalsScreen';
import { getCommitModes, getDefaultCommitSub } from '../lib/modules';
import { PageIntro } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';

export default function CommitScreen({ sub, setSub, onQuickPay, onQuickSave }) {
  const { cfg } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const L  = STR[cfg.lang]  || STR.ar;
  const modes = getCommitModes(cfg);
  const activeSub = modes.includes(sub) ? sub : getDefaultCommitSub(cfg);
  const isAr = cfg.lang === 'ar';

  useEffect(() => {
    if (sub !== activeSub) setSub(activeSub);
  }, [sub, activeSub, setSub]);

  if (modes.length === 0) return null;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: th.bg }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" nestedScrollEnabled contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 120 }}>
      <PageIntro
        th={th}
        lang={cfg.lang}
        icon="card-outline"
        title={cfg.lang === 'ar' ? 'الدين والأهداف' : 'Debt and goals'}
        subtitle={cfg.lang === 'ar'
          ? 'نفّذ الدفعات والتوفير من نفس المكان، وابدأ بالأقرب للإنجاز أو الأكثر تأثيراً.'
          : 'Handle payments and savings from one place, starting with the most important items.'}
      />
      {modes.length > 1 && (
        <View style={[s.segment, { backgroundColor: th.cardHigh, flexDirection: isAr ? 'row-reverse' : 'row' }]}>
          {modes.includes('debt') && (
            <TouchableOpacity onPress={() => setSub('debt')}
              style={[s.segBtn, { borderBottomColor: activeSub === 'debt' ? th.exp : 'transparent' }]}>
              <Ionicons name="card-outline" size={14} color={activeSub === 'debt' ? th.exp : th.sub} />
              <Text style={{ color: activeSub === 'debt' ? th.exp : th.sub, ...weight('700'), fontSize: 12 }}> {cfg.lang === 'ar' ? 'دين عليّ' : 'Debt I owe'}</Text>
            </TouchableOpacity>
          )}
          {modes.includes('receivable') && (
            <TouchableOpacity onPress={() => setSub('receivable')}
              style={[s.segBtn, { borderBottomColor: activeSub === 'receivable' ? th.inc : 'transparent' }]}>
              <Ionicons name="cash-outline" size={14} color={activeSub === 'receivable' ? th.inc : th.sub} />
              <Text style={{ color: activeSub === 'receivable' ? th.inc : th.sub, ...weight('700'), fontSize: 12 }}> {cfg.lang === 'ar' ? 'دين لي' : 'Debt owed to me'}</Text>
            </TouchableOpacity>
          )}
          {modes.includes('goal') && (
            <TouchableOpacity onPress={() => setSub('goal')}
              style={[s.segBtn, { borderBottomColor: activeSub === 'goal' ? th.primary : 'transparent' }]}>
              <Ionicons name="flag-outline" size={14} color={activeSub === 'goal' ? th.primary : th.sub} />
              <Text style={{ color: activeSub === 'goal' ? th.primary : th.sub, ...weight('700'), fontSize: 12 }}> {L.goals}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {activeSub === 'debt' || activeSub === 'receivable'
        ? <DebtsScreen direction={activeSub === 'receivable' ? 'receivable' : 'owed'} onQuickPay={onQuickPay} />
        : <GoalsScreen onQuickSave={onQuickSave} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  segment: { borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 },
  segBtn:  { flex: 1, minHeight: 40, flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
