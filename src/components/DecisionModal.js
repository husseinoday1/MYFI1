import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

export default function DecisionModal({
  visible,
  lang = 'ar',
  th,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmIcon = 'checkmark-circle-outline',
  cancelIcon = 'close-outline',
  heroIcon = 'shield-checkmark-outline',
  tone,
  cancelTone,
  dismissible = true,
  busy = false,
  onConfirm,
  onCancel,
  onClose,
}) {
  const isAr = lang === 'ar';
  const direction = isAr ? 'row-reverse' : 'row';
  const accent = tone || th.primary;
  const close = () => { if (!busy && dismissible) onClose?.(); };
  const cancel = () => { if (!busy) (onCancel || onClose)?.(); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.hero, { backgroundColor: `${accent}16`, borderColor: `${accent}35` }]}>
            <View style={[s.heroIcon, { backgroundColor: accent }]}>
              <Ionicons name={heroIcon} size={24} color={th.onPrimary} />
            </View>
            <Text style={[s.title, { color: th.text, textAlign: 'center' }]}>{title}</Text>
            <Text style={[s.message, { color: th.sub, textAlign: 'center' }]}>{message}</Text>
          </View>
          <View style={[s.actions, { flexDirection: direction }]}>
            <TouchableOpacity disabled={busy} onPress={cancel} style={[s.button, { backgroundColor: th.cardHigh, borderColor: cancelTone || th.border, opacity: busy ? 0.55 : 1 }]}>
              <Ionicons name={cancelIcon} size={18} color={cancelTone || th.sub} />
              <Text style={[s.buttonText, { color: cancelTone || th.sub }]}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity disabled={busy} onPress={onConfirm} style={[s.button, { backgroundColor: accent, borderColor: accent, opacity: busy ? 0.65 : 1 }]}>
              <Ionicons name={busy ? 'hourglass-outline' : confirmIcon} size={18} color={th.onPrimary} />
              <Text style={[s.buttonText, { color: th.onPrimary }]}>{busy ? '…' : confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 18 },
  card: { width: '100%', maxWidth: 440, alignSelf: 'center', borderWidth: 1, borderRadius: 24, padding: 14, gap: 13, ...SHADOW.float },
  hero: { borderWidth: 1, borderRadius: RADIUS.lg, paddingHorizontal: 16, paddingVertical: 20, alignItems: 'center', gap: 9 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  title: { fontSize: 18, lineHeight: 25, ...weight('900') },
  message: { fontSize: 13, lineHeight: 21, ...weight('700') },
  actions: { gap: 9 },
  button: { flex: 1, minHeight: 48, borderWidth: 1, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7, paddingHorizontal: 10 },
  buttonText: { fontSize: 12, ...weight('900'), textAlign: 'center' },
});
