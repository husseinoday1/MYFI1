import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RADIUS, SHADOW } from '../lib/tokens';

export default function ChoiceSheet({
  visible,
  title,
  options = [],
  value,
  values = [],
  multiple = false,
  maxSelections,
  doneLabel,
  onSelect,
  onClose,
  th,
  lang = 'ar',
}) {
  const isRtl = lang === 'ar';
  const insets = useSafeAreaInsets();

  const pick = (option) => {
    if (multiple && !values.includes(option.value) && Number(maxSelections) > 0 && values.length >= Number(maxSelections)) return;
    onSelect?.(option.value, option);
    if (!multiple) onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, paddingBottom: 18 + Math.max(insets.bottom, 8) }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <Text style={[s.title, { color: th.text, textAlign: isRtl ? 'right' : 'left' }]}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={[s.closeBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.sub} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {options.map(option => {
              const active = multiple ? values.includes(option.value) : value === option.value;
              const accent = option.color || th.primary;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => pick(option)}
                  style={[
                    s.option,
                    {
                      backgroundColor: active ? th.primSoft : th.card,
                      borderColor: active ? accent : th.border,
                      flexDirection: isRtl ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={[s.leading, { backgroundColor: 'transparent', borderColor: active ? accent : th.border }]}>
                    {option.leading ? (
                      <Text style={s.leadingText}>{option.leading}</Text>
                    ) : (
                      <Ionicons name={option.icon || 'ellipse-outline'} size={18} color={accent} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[s.optionLabel, { color: active ? accent : th.text, textAlign: isRtl ? 'right' : 'left' }]}
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      minimumFontScale={0.86}
                    >
                      {option.label}
                    </Text>
                    {!!option.detail && (
                      <Text style={[s.optionDetail, { color: th.sub, textAlign: isRtl ? 'right' : 'left' }]} numberOfLines={2}>
                        {option.detail}
                      </Text>
                    )}
                  </View>

                  <View style={[s.choiceMark, { backgroundColor: active ? accent : 'transparent', borderColor: active ? accent : th.border }]}>
                    {active ? <Ionicons name="checkmark" size={12} color={th.onPrimary} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {multiple ? (
            <TouchableOpacity onPress={onClose} style={[s.doneBtn, { backgroundColor: th.primary }]}>
              <Text style={[s.doneText, { color: th.onPrimary }]}>
                {doneLabel || (isRtl ? `تم (${values.length})` : `Done (${values.length})`)}
              </Text>
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet, padding: 18, maxHeight: '78%', ...SHADOW.card },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { alignItems: 'center', gap: 10, marginBottom: 14 },
  title: { flex: 1, fontSize: 17, fontWeight: '900' },
  closeBtn: { width: 44, height: 44, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  option: { minHeight: 64, alignItems: 'center', gap: 10, borderRadius: RADIUS.lg, borderWidth: 1, padding: 12, marginBottom: 8 },
  leading: { width: 38, height: 38, borderRadius: RADIUS.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  choiceMark: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  leadingText: { fontSize: 19 },
  optionLabel: { fontSize: 14, fontWeight: '900' },
  optionDetail: { fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  doneBtn: { minHeight: 48, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  doneText: { fontSize: 14, fontWeight: '900' },
});
