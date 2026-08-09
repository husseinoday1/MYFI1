import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { supabase } from '../lib/supabase';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

export default function PasswordRecoveryModal({ visible, onClose, th, lang = 'ar' }) {
  const ar = lang === 'ar';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const passwordStarted = password.length > 0;
  const confirmationStarted = confirmation.length > 0;
  const passwordsMatch = passwordStarted && confirmationStarted && password === confirmation;
  const passwordsMismatch = passwordStarted && confirmationStarted && password !== confirmation;
  const passwordTooShort = passwordStarted && password.length < 8;
  const helperText = passwordTooShort
    ? (ar ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.')
    : passwordsMatch
      ? (ar ? 'كلمتا المرور متطابقتان.' : 'Passwords match.')
      : passwordsMismatch
        ? (ar ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.')
        : (ar ? 'استخدم 8 أحرف على الأقل، ثم أكّدها في الحقل الثاني.' : 'Use at least 8 characters, then confirm it below.');

  const resetAndClose = () => {
    setPassword('');
    setConfirmation('');
    setPasswordVisible(false);
    setConfirmationVisible(false);
    onClose?.();
  };

  const close = () => {
    if (loading) return;
    resetAndClose();
  };

  const submit = async () => {
    if (password.length < 8) {
      Alert.alert('', ar ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmation) {
      Alert.alert('', ar ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      Alert.alert('', ar ? 'تم تحديث كلمة المرور بنجاح.' : 'Password updated successfully.');
      resetAndClose();
    } catch (error) {
      Alert.alert('', error?.message || (ar ? 'تعذر تحديث كلمة المرور.' : 'Could not update the password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>
          <View style={[s.icon, { backgroundColor: th.primSoft }]}>
            <Ionicons name="key-outline" size={26} color={th.primary} />
          </View>
          <Text style={[s.title, { color: th.text }]}>{ar ? 'كلمة مرور جديدة' : 'New password'}</Text>
          <Text style={[s.body, { color: th.sub }]}>
            {ar ? 'اكتب كلمة مرور قوية لحساب MYFI.' : 'Choose a strong password for your MYFI account.'}
          </Text>
          <View style={[s.passwordField, { backgroundColor: th.input, borderColor: th.border }]}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder={ar ? 'كلمة المرور الجديدة' : 'New password'}
              placeholderTextColor={th.faint}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              style={[s.input, { color: th.text }]}
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible(value => !value)}
              style={s.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide new password' : 'Show new password'}
            >
              <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={th.sub} />
            </TouchableOpacity>
          </View>
          <View style={[s.passwordField, { backgroundColor: th.input, borderColor: th.border }]}>
            <TextInput
              value={confirmation}
              onChangeText={setConfirmation}
              placeholder={ar ? 'تأكيد كلمة المرور' : 'Confirm password'}
              placeholderTextColor={th.faint}
              secureTextEntry={!confirmationVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              style={[s.input, { color: th.text }]}
            />
            <TouchableOpacity
              onPress={() => setConfirmationVisible(value => !value)}
              style={s.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={confirmationVisible ? 'Hide confirmation password' : 'Show confirmation password'}
            >
              <Ionicons name={confirmationVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={th.sub} />
            </TouchableOpacity>
          </View>
          <View style={[s.matchRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}>
            <Ionicons
              name={passwordsMatch ? 'checkmark-circle-outline' : passwordsMismatch || passwordTooShort ? 'alert-circle-outline' : 'information-circle-outline'}
              size={17}
              color={passwordsMatch ? th.inc : passwordsMismatch || passwordTooShort ? th.exp : th.sub}
            />
            <Text style={[s.matchText, { color: passwordsMatch ? th.inc : passwordsMismatch || passwordTooShort ? th.exp : th.sub, textAlign: ar ? 'right' : 'left' }]}>
              {helperText}
            </Text>
          </View>
          <TouchableOpacity onPress={submit} disabled={loading} style={[s.primary, { backgroundColor: th.primary, opacity: loading ? 0.6 : 1 }]}>
            <Text style={[s.primaryText, { color: th.onPrimary }]}>{loading ? '...' : (ar ? 'حفظ كلمة المرور' : 'Save password')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={close} disabled={loading} style={s.cancel}>
            <Text style={{ color: th.sub, ...weight('800') }}>{ar ? 'إلغاء' : 'Cancel'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', maxWidth: 420, borderRadius: RADIUS.xl, borderWidth: 1, padding: 20, alignItems: 'center', ...SHADOW.card },
  icon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  title: { fontSize: 18, ...weight('900'), textAlign: 'center' },
  body: { fontSize: 12, lineHeight: 19, ...weight('700'), textAlign: 'center', marginTop: 6, marginBottom: 16 },
  passwordField: { width: '100%', minHeight: 50, borderRadius: RADIUS.md, borderWidth: 1, marginBottom: 10, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, textAlign: 'left', writingDirection: 'ltr' },
  eyeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  matchRow: { width: '100%', alignItems: 'center', gap: 7, marginBottom: 10 },
  matchText: { flex: 1, fontSize: 12, lineHeight: 18, ...weight('800') },
  primary: { width: '100%', minHeight: 50, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { fontSize: 14, ...weight('900') },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, marginTop: 6 },
});
