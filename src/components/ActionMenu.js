import React, { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

export default function ActionMenu({
  th,
  lang = 'ar',
  items = [],
  title,
  buttonStyle,
  iconColor,
}) {
  const [visible, setVisible] = useState(false);
  const actions = items.filter(Boolean);
  const isAr = lang === 'ar';
  const rowDir = isAr ? 'row-reverse' : 'row';
  const align = isAr ? 'right' : 'left';

  if (actions.length === 0) return null;

  const close = () => setVisible(false);
  const run = (action) => {
    close();
    setTimeout(() => action.onPress?.(), 80);
  };

  return (
    <>
      <TouchableOpacity
        onPress={() => setVisible(true)}
        style={[s.trigger, { backgroundColor: th.cardHigh }, buttonStyle]}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="ellipsis-vertical" size={17} color={iconColor || th.sub} />
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
        <View style={[s.overlay, { backgroundColor: th.overlay }]}>
          <TouchableOpacity activeOpacity={1} onPress={close} style={StyleSheet.absoluteFill} />
          <View style={[s.sheet, { backgroundColor: th.card, borderColor: th.border }]}>
            {!!title && (
              <Text style={[s.title, { color: th.text, textAlign: align }]} numberOfLines={1}>
                {title}
              </Text>
            )}
            {actions.map((action, index) => {
              const color = action.color || (action.danger ? th.exp : th.text);
              return (
                <TouchableOpacity
                  key={`${action.label}-${index}`}
                  onPress={() => run(action)}
                  style={[
                    s.row,
                    {
                      flexDirection: rowDir,
                      borderTopColor: index === 0 ? 'transparent' : th.border,
                      backgroundColor: action.danger ? th.expBg : 'transparent',
                    },
                  ]}
                >
                  <View style={[s.iconBox, { backgroundColor: action.danger ? th.expBg : th.cardHigh }]}>
                    <Ionicons name={action.icon || 'ellipse-outline'} size={16} color={color} />
                  </View>
                  <Text style={[s.label, { color, textAlign: align }]}>{action.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  trigger: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 14, paddingBottom: 18 },
  sheet: { borderRadius: RADIUS.xl, borderWidth: 1, padding: 8, ...SHADOW.card },
  title: { fontSize: 13, lineHeight: 19, ...weight('900'), paddingHorizontal: 10, paddingVertical: 8 },
  row: { minHeight: 48, alignItems: 'center', gap: 10, borderTopWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 10 },
  iconBox: { width: 31, height: 31, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  label: { flex: 1, fontSize: 14, lineHeight: 20, ...weight('900') },
});
