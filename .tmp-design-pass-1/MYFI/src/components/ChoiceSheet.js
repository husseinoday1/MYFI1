import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Touchable } from './AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function ChoiceSheet({
  visible,
  title,
  options = [],
  value,
  onSelect,
  onClose,
  th,
  lang = 'ar',
}) {
  const isRtl = lang === 'ar';
  const insets = useSafeAreaInsets();

  const pick = (option) => {
    onSelect?.(option.value, option);
    onClose?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Touchable style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={onClose}>
        <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, paddingBottom: 18 + Math.max(insets.bottom, 8) }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <Text style={[s.title, { color: th.text, textAlign: isRtl ? 'right' : 'left' }]}>{title}</Text>
            <Touchable onPress={onClose} style={[s.closeBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.sub} />
            </Touchable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {options.map(option => {
              const active = value === option.value;
              const accent = option.color || th.primary;
              return (
                <Touchable
                  key={option.value}
                  onPress={() => pick(option)}
                  style={[
                    s.option,
                    {
                      backgroundColor: active ? th.primSoft : th.cardHigh,
                      borderColor: active ? accent : 'transparent',
                      flexDirection: isRtl ? 'row-reverse' : 'row',
                    },
                  ]}
                >
                  <View style={[s.leading, { backgroundColor: `${accent}1F` }]}>
                    {option.leading ? (
                      <Text style={s.leadingText}>{option.leading}</Text>
                    ) : (
                      <Ionicons name={option.icon || 'ellipse-outline'} size={18} color={accent} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={[s.optionLabel, { color: active ? accent : th.text, textAlign: isRtl ? 'right' : 'left' }]}>
                      {option.label}
                    </Text>
                    {!!option.detail && (
                      <Text style={[s.optionDetail, { color: th.sub, textAlign: isRtl ? 'right' : 'left' }]} numberOfLines={1}>
                        {option.detail}
                      </Text>
                    )}
                  </View>

                  {active ? (
                    <Ionicons name="checkmark-circle" size={20} color={accent} />
                  ) : (
                    <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />
                  )}
                </Touchable>
              );
            })}
          </ScrollView>
        </Touchable>
      </Touchable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: '78%' },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { alignItems: 'center', gap: 10, marginBottom: 14 },
  title: { flex: 1, fontSize: 17, ...weight('900') },
  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  option: { alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  leading: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  leadingText: { fontSize: 19 },
  optionLabel: { fontSize: 14, ...weight('900') },
  optionDetail: { fontSize: 11, ...weight('700'), marginTop: 3 },
});
