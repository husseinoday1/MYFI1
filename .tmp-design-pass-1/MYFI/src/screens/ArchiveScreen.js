import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Touchable } from '../components/AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { STR } from '../lib/strings';
import { getSymbol } from '../lib/constants';
import { byMonth, calcStats, catSpend } from '../utils/calc';
import { generateMonthPDF } from '../lib/pdf';

export default function ArchiveScreen() {
  const { trans, cats, cfg } = useStore();
  const th  = TH[cfg.theme] || TH.dark;
  const L   = STR[cfg.lang]  || STR.ar;
  const sym = getSymbol(cfg.currency);
  const [expanded, setExpanded] = useState(null);
  const now = new Date();

  const months = useMemo(() => {
    const map = {};
    trans.forEach(t => {
      if (!t.dateISO) return;
      const d = new Date(t.dateISO + 'T12:00:00');
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map[key]) map[key] = { year: d.getFullYear(), month: d.getMonth(), trans: [] };
      map[key].trans.push(t);
    });
    return Object.values(map).sort((a,b) => b.year - a.year || b.month - a.month);
  }, [trans]);

  const yearNet = useMemo(() => {
    const yTrans = trans.filter(t => t.dateISO && new Date(t.dateISO + 'T12:00:00').getFullYear() === now.getFullYear());
    return calcStats(yTrans);
  }, [trans]);

  const fmt = (n) => Math.abs(Math.round(n)).toLocaleString();

  return (
    <ScrollView style={{ flex:1, backgroundColor: th.bg }} contentContainerStyle={{ padding:16, paddingBottom:40 }}>
      {months.length > 0 && (
        <View style={[s.card, { backgroundColor: th.primSoft, borderColor: th.primary + '33', marginBottom: 14 }]}>
          <Text style={[s.label, { color: th.primary }]}>{L.yearNetSoFar} — {now.getFullYear()}</Text>
          <Text style={{ color: yearNet.bal >= 0 ? th.inc : th.exp, fontSize: 22, ...weight('800'), marginTop: 4 }}>
            {yearNet.bal >= 0 ? '+' : '-'}{fmt(yearNet.bal)} {sym}
          </Text>
        </View>
      )}

      {months.length === 0 && (
        <Text style={{ color: th.sub, textAlign:'center', marginTop:60 }}>{L.noData}</Text>
      )}

      {months.map(m => {
        const isCurrent = m.month === now.getMonth() && m.year === now.getFullYear();
        const stats = calcStats(m.trans);
        const top   = catSpend(m.trans, cats).sort((a,b) => b.spent - a.spent).slice(0, 3);
        const key   = `${m.year}-${m.month}`;
        const open  = expanded === key;
        const name  = `${L.months[m.month]} ${m.year}`;

        return (
          <View key={key} style={[s.card, { backgroundColor: th.card, borderColor: th.border, marginBottom:10 }]}>
            <Touchable onPress={() => setExpanded(open ? null : key)} style={s.cardHd}>
              <View>
                <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                  <Text style={{ color: th.text, ...weight('700'), fontSize:15 }}>{name}</Text>
                  {isCurrent && (
                    <View style={{ backgroundColor: th.primSoft, borderRadius:8, paddingHorizontal:6, paddingVertical:2 }}>
                      <Text style={{ color: th.primary, fontSize:10, ...weight('700') }}>{L.currentMonth}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection:'row', gap:12, marginTop:4 }}>
                  <Text style={{ color: th.inc, fontSize:12 }}>+{fmt(stats.inc)}</Text>
                  <Text style={{ color: th.exp, fontSize:12 }}>-{fmt(stats.exp)}</Text>
                  <Text style={{ color: stats.bal >= 0 ? th.inc : th.exp, fontSize:12, ...weight('700') }}>
                    {stats.bal >= 0 ? '+' : '-'}{fmt(stats.bal)} {sym}
                  </Text>
                </View>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={th.sub} />
            </Touchable>

            {open && (
              <View style={{ marginTop:10 }}>
                {top.length > 0 && (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={{ color: th.sub, fontSize: 11, ...weight('700'), marginBottom: 6 }}>{L.topCatsSpend}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {top.map(c => (
                        <View key={c.id} style={[s.topChip, { backgroundColor: c.color + '1f', borderColor: c.color + '55' }]}>
                          <Ionicons name={c.icon || 'cube-outline'} size={13} color={c.color} />
                          <Text style={{ color: c.color, fontSize: 11, ...weight('700') }}>
                            {' '}{fmt(c.spent)} {sym}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {m.trans.sort((a,b) => b.ts - a.ts).map(t => {
                  const cat = cats.find(c => c.id === t.cat) || cats.find(c => c.id === 'other') || cats[0];
                  return (
                    <View key={t.id} style={[s.txRow, { borderTopColor: th.border }]}>
                      <View style={{ flex:1 }}>
                        <Text style={{ color: th.text, fontSize:13, ...weight('600') }}>{t.title}</Text>
                        <Text style={{ color: th.sub, fontSize:11 }}>{cfg.lang==='ar' ? cat.label : cat.labelEn} · {t.dateISO}</Text>
                      </View>
                      <Text style={{ color: t.amt > 0 ? th.inc : th.exp, ...weight('700'), fontSize:13 }}>
                        {t.amt > 0 ? '+' : '-'}{fmt(t.amt)} {sym}
                      </Text>
                    </View>
                  );
                })}

                <Touchable
                  onPress={() => generateMonthPDF({ ...m, name, inc: stats.inc, exp: stats.exp, net: stats.bal }, cats, { currency: cfg.currency, lang: cfg.lang, name: cfg.name || 'MYFI' })}
                  style={[s.pdfBtn, { backgroundColor: th.primSoft }]}>
                  <Ionicons name="share-outline" size={15} color={th.primary} />
                  <Text style={{ color: th.primary, ...weight('700'), fontSize:13 }}> {L.exportPDF} / {L.shareBtn}</Text>
                </Touchable>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card:    { borderRadius:18, padding:14, borderWidth:0.5 },
  label:   { fontSize:12, ...weight('600') },
  cardHd:  { flexDirection:'row', justifyContent:'space-between', alignItems:'center' },
  txRow:   { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:10, borderTopWidth:0.5 },
  pdfBtn:  { flexDirection:'row', borderRadius:12, padding:12, alignItems:'center', justifyContent:'center', marginTop:10 },
  topChip: { flexDirection:'row', alignItems:'center', borderRadius:10, paddingHorizontal:8, paddingVertical:5, borderWidth:1 },
});
