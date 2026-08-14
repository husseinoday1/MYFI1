import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { weight } from '../lib/tokens';

export default function AccountDeleteModal({ visible, onClose, onConfirm, th, lang = 'ar', busy = false }) {
  const [password, setPassword] = useState('');
  const ar = lang === 'ar';

  useEffect(() => {
    if (!visible) setPassword('');
  }, [visible]);

  const close = () => {
    if (busy) return;
    setPassword('');
    onClose?.();
  };

  const confirm = () => {
    if (!password) return;
    onConfirm?.(password);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.icon, { backgroundColor: th.expBg }]}>
            <Ionicons name="trash-outline" size={24} color={th.exp} />
          </View>
          <Text style={[s.title, { color: th.text }]}>{ar ? 'حذف الحساب' : 'Delete account'}</Text>
          <Text style={[s.body, { color: th.sub }]}>
            {ar ? 'أدخل كلمة المرور للتأكيد النهائي.' : 'Enter your password for final confirmation.'}
          </Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="password"
            textContentType="password"
            placeholder={ar ? 'كلمة المرور' : 'Password'}
            placeholderTextColor={th.faint}
            style={[s.input, { backgroundColor: th.cardHigh, borderColor: th.border, color: th.text }]}
          />
          <View style={[s.actions, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <TouchableOpacity onPress={close} disabled={busy} style={[s.cancel, { backgroundColor: th.cardHigh }]}>
              <Text style={{ color: th.sub, ...weight('900') }}>{ar ? 'رجوع' : 'Back'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} disabled={busy || !password} style={[s.delete, { backgroundColor: th.exp, opacity: busy || !password ? 0.5 : 1 }]}>
              <Text style={{ color: '#fff', ...weight('900') }}>{busy ? '...' : (ar ? 'حذف نهائي' : 'Delete permanently')}</Text>
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
  icon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, lineHeight: 25, ...weight('900'), marginTop: 14 },
  body: { fontSize: 12, lineHeight: 18, ...weight('700'), textAlign: 'center', marginTop: 5 },
  input: { width: '100%', minHeight: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 14, marginTop: 18, textAlign: 'left', writingDirection: 'ltr' },
  actions: { width: '100%', gap: 9, marginTop: 14 },
  cancel: { flex: 1, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  delete: { flex: 1.5, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
