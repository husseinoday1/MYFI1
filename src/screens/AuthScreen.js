import React, { useState } from 'react';
import {
  View, Text, TextInput,
  StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { checkSupabaseHealth, supabase } from '../lib/supabase';
import { getAuthRedirectUrl } from '../lib/authCallback';
import { Touchable as TouchableOpacity } from '../components/AppPrimitives';
import { useStore } from '../store/useStore';
import { TH } from '../lib/theme';
import { weight } from '../lib/tokens';

export default function AuthScreen({ onSkip }) {
  const { cfg, setUser } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const ar = cfg.lang === 'ar';

  const [mode,    setMode]    = useState('signin'); // 'signin' | 'signup'
  const [email,   setEmail]   = useState('');
  const [pass,    setPass]    = useState('');
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const S = {
    signin:   ar ? 'تسجيل الدخول'  : 'Sign In',
    signup:   ar ? 'إنشاء حساب'    : 'Sign Up',
    email:    ar ? 'البريد الإلكتروني' : 'Email',
    password: ar ? 'كلمة المرور'   : 'Password',
    offline:  ar ? 'متابعة بدون حساب' : 'Continue Offline',
    noAcc:    ar ? 'ليس لديك حساب؟ ' : "Don't have an account? ",
    hasAcc:   ar ? 'لديك حساب؟ '   : 'Already have an account? ',
    switch_s: ar ? 'أنشئ واحداً'   : 'Create one',
    switch_i: ar ? 'سجّل دخولك'    : 'Sign in',
    tagline:  ar ? 'تحكّم بمصاريفك بذكاء' : 'Smart expense tracking',
    emailChk: ar ? 'تحقق من بريدك لتفعيل الحساب ✉️' : 'Check your email to confirm your account ✉️',
  };

  const authHealthMessage = (health = {}) => {
    if (health.reason === 'not_configured') {
      return ar
        ? '\u0625\u0639\u062f\u0627\u062f\u0627\u062a \u0627\u0644\u062e\u0627\u062f\u0645 \u063a\u064a\u0631 \u0645\u0636\u0645\u0646\u0629 \u062f\u0627\u062e\u0644 \u0647\u0630\u0647 \u0627\u0644\u0646\u0633\u062e\u0629.'
        : 'Server settings are not embedded in this build.';
    }
    if (health.reason === 'timeout') {
      return ar
        ? '\u0627\u0646\u062a\u0647\u062a \u0645\u0647\u0644\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644. \u062c\u0631\u0628 \u0634\u0628\u0643\u0629 \u0623\u062e\u0631\u0649 \u0623\u0648 \u0623\u0637\u0641\u0626 VPN/Private DNS.'
        : 'Connection timed out. Try another network or turn off VPN/Private DNS.';
    }
    if (health.reason === 'network') {
      return ar
        ? '\u0627\u0644\u0647\u0627\u062a\u0641 \u0644\u0627 \u064a\u0635\u0644 \u0625\u0644\u0649 \u062e\u0627\u062f\u0645 \u0627\u0644\u062d\u0633\u0627\u0628. \u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a \u0623\u0648 DNS.'
        : 'This phone cannot reach the account server. Check internet or DNS.';
    }
    if (health.reason === 'server_error') {
      return ar
        ? `\u0627\u0644\u062e\u0627\u062f\u0645 \u0631\u062f \u0628\u062e\u0637\u0623 ${health.status || ''}.`
        : `Server returned error ${health.status || ''}.`;
    }
    return ar
      ? '\u062a\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0625\u0644\u0649 \u062e\u062f\u0645\u0629 \u0627\u0644\u062d\u0633\u0627\u0628 \u062d\u0627\u0644\u064a\u0627\u064b.'
      : 'The account service is currently unavailable.';
  };

  const handleAuth = async () => {
    if (!email.trim() || !pass.trim()) {
      Alert.alert('', ar ? 'أدخل البريد وكلمة المرور' : 'Enter email and password');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email.trim())) {
      Alert.alert('', ar ? 'اكتب بريداً إلكترونياً صحيحاً.' : 'Enter a valid email address.');
      return;
    }
    if (pass.length < 8) {
      Alert.alert('', ar ? 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' : 'Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    try {
      const health = await checkSupabaseHealth(10000);
      if (!health.ok) {
        Alert.alert('', authHealthMessage(health));
        return;
      }
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
        if (error) throw error;
        await setUser(data.user);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password: pass,
          options: { emailRedirectTo: getAuthRedirectUrl('confirm') },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          Alert.alert('', S.emailChk);
        } else {
          await setUser(data.user);
        }
      }
    } catch (e) {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.user) {
        await setUser(data.session.user);
        return;
      }
      Alert.alert('', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      Alert.alert('', ar ? 'أدخل بريدك الإلكتروني أولاً.' : 'Enter your email first.');
      return;
    }
    setLoading(true);
    try {
      const health = await checkSupabaseHealth(10000);
      if (!health.ok) throw new Error(authHealthMessage(health));
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getAuthRedirectUrl('recovery'),
      });
      if (error) throw error;
      Alert.alert('', ar ? 'أُرسلت رسالة الاستعادة إلى بريدك.' : 'A recovery email was sent.');
    } catch (error) {
      Alert.alert('', error?.message || '');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: th.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={s.logoWrap}>
          <Text style={s.emoji}>🌿</Text>
          <Text style={[s.logo, { color: th.primary }]}>MYFI</Text>
          <Text style={[s.tagline, { color: th.sub }]}>{S.tagline}</Text>
        </View>

        {/* Card */}
        <View style={[s.card, { backgroundColor: th.card, borderColor: th.border }]}>

          {/* Mode toggle */}
          <View style={[s.toggle, { backgroundColor: th.muted }]}>
            {['signin', 'signup'].map(m => (
              <TouchableOpacity
                key={m}
                onPress={() => setMode(m)}
                style={[s.toggleBtn, mode === m && { backgroundColor: th.primary }]}
              >
                <Text style={{ color: mode === m ? th.onPrim : th.sub, ...weight('700'), fontSize: 13 }}>
                  {m === 'signin' ? S.signin : S.signup}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Inputs */}
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder={S.email}
            placeholderTextColor={th.sub}
            keyboardType="email-address"
            autoCapitalize="none"
            style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border,
              textAlign: ar ? 'right' : 'left' }]}
          />
          <View style={[s.passwordField, { backgroundColor: th.input, borderColor: th.border }]}>
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder={S.password}
              placeholderTextColor={th.sub}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === 'signup' ? 'new-password' : 'password'}
              textContentType={mode === 'signup' ? 'newPassword' : 'password'}
              style={[s.passwordInput, { color: th.text, textAlign: ar ? 'right' : 'left' }]}
            />
            <TouchableOpacity
              onPress={() => setPasswordVisible((value) => !value)}
              style={s.eyeButton}
              accessibilityRole="button"
              accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
            >
              <Ionicons name={passwordVisible ? 'eye-off-outline' : 'eye-outline'} size={20} color={th.sub} />
            </TouchableOpacity>
          </View>

          {/* Submit */}
          <TouchableOpacity
            onPress={handleAuth}
            disabled={loading}
            style={[s.btn, { backgroundColor: th.primary, opacity: loading ? 0.6 : 1 }]}
          >
            <Text style={{ color: th.onPrim, ...weight('800'), fontSize: 15 }}>
              {loading ? '...' : mode === 'signin' ? S.signin : S.signup}
            </Text>
          </TouchableOpacity>
          {mode === 'signin' ? (
            <TouchableOpacity onPress={handlePasswordReset} disabled={loading} style={{ alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: th.primary, fontSize: 13, ...weight('700') }}>
                {ar ? 'نسيت كلمة المرور' : 'Forgot password'}
              </Text>
            </TouchableOpacity>
          ) : null}

          {/* Switch mode */}
          <View style={s.switchRow}>
            <Text style={{ color: th.sub, fontSize: 13 }}>
              {mode === 'signin' ? S.noAcc : S.hasAcc}
            </Text>
            <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text style={{ color: th.primary, fontSize: 13, ...weight('700') }}>
                {mode === 'signin' ? S.switch_s : S.switch_i}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Skip */}
        <TouchableOpacity onPress={onSkip} style={s.skipBtn}>
          <Text style={{ color: th.faint, fontSize: 13 }}>{S.offline}</Text>
        </TouchableOpacity>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scroll:     { flexGrow: 1, justifyContent: 'center', padding: 24, paddingBottom: 40 },
  logoWrap:   { alignItems: 'center', marginBottom: 36 },
  emoji:      { fontSize: 52 },
  logo:       { fontSize: 34, ...weight('900'), letterSpacing: 0, marginTop: 8 },
  tagline:    { fontSize: 14, marginTop: 6 },
  card:       { borderRadius: 20, padding: 20, borderWidth: 0.5 },
  toggle:     { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 18 },
  toggleBtn:  { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  input:      { borderRadius: 12, padding: 14, borderWidth: 0.5, marginBottom: 12, fontSize: 14 },
  passwordField: { minHeight: 50, borderRadius: 12, borderWidth: 0.5, marginBottom: 12, flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingVertical: 14, paddingHorizontal: 14, fontSize: 14 },
  eyeButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  btn:        { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  switchRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  skipBtn:    { alignItems: 'center', marginTop: 24, padding: 12 },
});
