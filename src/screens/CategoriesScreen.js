import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '../store/useStore';
import { useTheme } from '../lib/useTheme';
import { CATEGORY_FLOWS, categoryFlowLabel, normalizeCategoryFlow } from '../lib/categories';
import { AppButton, PageIntro, ScreenScroll, Touchable, rowDirection, textAlign } from '../components/AppPrimitives';
import { RADIUS, SHADOW, SPACE, weight } from '../lib/tokens';

export default function CategoriesScreen() {
  const { th, lang, isAr } = useTheme();
  const { cats, setCats } = useStore();
  const [name, setName] = useState('');
  const [flow, setFlow] = useState(CATEGORY_FLOWS.EXPENSE);
  const activeCategories = useMemo(() => (cats || []).filter(item => !item.archivedAt && item.status !== 'archived'), [cats]);

  const addCategory = async () => {
    const label = name.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!label) return;
    const created = {
      id: `c_${Date.now().toString(36)}`,
      label,
      labelEn: label,
      icon: flow === CATEGORY_FLOWS.INCOME ? 'arrow-down-circle-outline' : 'pricetag-outline',
      color: flow === CATEGORY_FLOWS.INCOME ? th.inc : th.exp,
      flow,
    };
    // Preserve archived categories in storage; this screen filters them only
    // for display and must never rewrite the collection from that filtered view.
    const saved = await setCats([...(cats || []), created]);
    if (saved !== false) setName('');
  };

  return (
    <ScreenScroll th={th}>
      <PageIntro
        th={th}
        lang={lang}
        icon="pricetags-outline"
        title={isAr ? 'التصنيفات' : 'Categories'}
        subtitle={isAr ? 'نظّم الدخل والمصروف بتصنيفاتك الفعلية' : 'Organize income and spending with your own categories'}
      />

      <View style={[s.createCard, { backgroundColor: th.card, borderColor: th.border }]}>
        <Text style={[s.createTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? 'تصنيف جديد' : 'New category'}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder={isAr ? 'مثلاً: قهوة أو عمل حر' : 'e.g. Coffee or freelance'}
          placeholderTextColor={th.faint}
          textAlign={textAlign(lang)}
          style={[s.input, { color: th.text, backgroundColor: th.cardHigh, borderColor: th.border }]}
          maxLength={40}
        />
        <View style={[s.flowRow, { flexDirection: rowDirection(lang) }]}>
          {[
            { key: CATEGORY_FLOWS.EXPENSE, label: isAr ? 'مصروف' : 'Expense', tone: th.exp },
            { key: CATEGORY_FLOWS.INCOME, label: isAr ? 'دخل' : 'Income', tone: th.inc },
            { key: CATEGORY_FLOWS.BOTH, label: isAr ? 'مشترك' : 'Shared', tone: th.primary },
          ].map(item => {
            const active = flow === item.key;
            return (
              <Touchable key={item.key} onPress={() => setFlow(item.key)} accessibilityRole="radio" accessibilityState={{ checked: active }} style={[s.flowChip, { backgroundColor: active ? `${item.tone}1F` : th.cardHigh, borderColor: active ? item.tone : th.border }]}>
                <Text style={[s.flowText, { color: active ? item.tone : th.sub }]}>{item.label}</Text>
              </Touchable>
            );
          })}
        </View>
        <AppButton th={th} lang={lang} icon="add" label={isAr ? 'إضافة التصنيف' : 'Add category'} onPress={addCategory} disabled={!name.trim()} />
      </View>

      <Text style={[s.sectionTitle, { color: th.text, textAlign: textAlign(lang) }]}>{isAr ? `تصنيفاتك · ${activeCategories.length}` : `Your categories · ${activeCategories.length}`}</Text>
      <View style={[s.list, { backgroundColor: th.card, borderColor: th.border }]}>
        {activeCategories.map((category, index) => {
          const categoryFlow = normalizeCategoryFlow(category);
          const tone = category.color || (categoryFlow === CATEGORY_FLOWS.INCOME ? th.inc : categoryFlow === CATEGORY_FLOWS.EXPENSE ? th.exp : th.primary);
          return (
            <View key={category.id} style={[s.row, { flexDirection: rowDirection(lang), borderBottomColor: index === activeCategories.length - 1 ? 'transparent' : th.border }]}>
              <View style={[s.icon, { backgroundColor: `${tone}1C` }]}><Ionicons name={category.icon || 'pricetag-outline'} size={18} color={tone} /></View>
              <Text style={[s.name, { color: th.text, textAlign: textAlign(lang) }]} numberOfLines={1}>{isAr ? category.label : (category.labelEn || category.label)}</Text>
              <View style={[s.badge, { backgroundColor: `${tone}16` }]}><Text style={[s.badgeText, { color: tone }]}>{categoryFlowLabel(category, lang)}</Text></View>
            </View>
          );
        })}
      </View>
    </ScreenScroll>
  );
}

const s = StyleSheet.create({
  createCard: { borderRadius: RADIUS.xl, borderWidth: 1, padding: SPACE.lg, gap: SPACE.md, ...SHADOW.card },
  createTitle: { fontSize: 15, lineHeight: 21, ...weight('900') },
  input: { minHeight: 48, borderRadius: RADIUS.lg, borderWidth: 1, paddingHorizontal: SPACE.md, fontSize: 14, ...weight('800') },
  flowRow: { gap: SPACE.sm },
  flowChip: { flex: 1, minHeight: 40, borderRadius: RADIUS.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  flowText: { fontSize: 11, ...weight('900') },
  sectionTitle: { fontSize: 14, lineHeight: 20, ...weight('900'), marginTop: SPACE.xl, marginBottom: SPACE.sm },
  list: { borderRadius: RADIUS.xl, borderWidth: 1, overflow: 'hidden', ...SHADOW.card },
  row: { minHeight: 64, paddingHorizontal: SPACE.md, alignItems: 'center', gap: SPACE.sm, borderBottomWidth: 1 },
  icon: { width: 36, height: 36, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  name: { flex: 1, minWidth: 0, fontSize: 13, ...weight('900') },
  badge: { minHeight: 24, borderRadius: RADIUS.pill, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 10, ...weight('900') },
});
