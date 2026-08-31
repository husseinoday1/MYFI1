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
import { accountIdentityPatch, isValidUsername, normalizePhone, normalizeUsername, upsertProfileIdentity } from '../lib/accountIdentity';

export default function AuthScreen({ onSkip }) {
  const { cfg, setCfg, setUser } = useStore();
  const th = TH[cfg.theme] || TH.dark;
  const ar = cfg.lang === 'ar';

  const [mode,    setMode]    = useState('signin'); // 'signin' | 'signup'
  const [email,   setEmail]   = useState('');
  const [pass,    setPass]    = useState('');
  const [displayName, setDisplayName] = useState(cfg.displayName || '');
  const [username, setUsername] = useState(cfg.username || '');
  const [phone, setPhone] = useState(cfg.phone || '');
  const [termsAccepted, setTermsAccepted] = useState(cfg.accountConsentAccepted === true);
  const [loading, setLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [pendingConfirmationEmail, setPendingConfirmationEmail] = useState('');
  const [resendingConfirmation, setResendingConfirmation] = useState(false);

  const S = {
    signin:   ar ? 'تسجيل الدخول'  : 'Sign In',
    signup:   ar ? 'إنشاء حساب'    : 'Sign Up',
    email:    ar ? 'البريد الإلكتروني' : 'Email',
    password: ar ? 'كلمة المرور'   : 'Password',
    name: ar ? 'الاسم' : 'Name',
    username: ar ? 'اليوزر نيم' : 'Username',
    phone: ar ? 'رقم الهاتف' : 'Phone number',
    terms: ar ? 'أوافق على شروط الحساب والمزامنة' : 'I agree to account and sync terms',
    forgotPassword: ar ? 'نسيت كلمة المرور' : 'Forgot password',
    authErrorTitle: ar ? 'تعذر الدخول' : 'Could not sign in',
    signupErrorTitle: ar ? 'تعذر إنشاء الحساب' : 'Could not create account',
    resetTitle: ar ? 'استعادة كلمة المرور' : 'Password recovery',
    usernameRule: ar ? 'اكتب يوزر نيم فريد من 3 أحرف على الأقل، حروف إنكليزية وأرقام وشرطة سفلية.' : 'Use a unique username, 3+ characters, letters, numbers, and underscore.',
    termsRequired: ar ? 'وافق على شروط الحساب قبل إنشاء حساب جديد.' : 'Accept the account terms before creating an account.',
    offline:  ar ? 'متابعة بدون حساب' : 'Continue Offline',
    noAcc:    ar ? 'ليس لديك حساب؟ ' : "Don't have an account? ",
    hasAcc:   ar ? 'لديك حساب؟ '   : 'Already have an account? ',
    switch_s: ar ? 'أنشئ واحداً'   : 'Create one',
    switch_i: ar ? 'سجّل دخولك'    : 'Sign in',
    tagline:  ar ? 'تحكّم بمصاريفك بذكاء' : 'Smart expense tracking',
    emailChk: ar ? 'تحقق من بريدك لتفعيل الحساب ✉️' : 'Check your email to confirm your account ✉️',
    confirmationPending: ar ? 'الحساب بانتظار تأكيد البريد.' : 'This account is waiting for email confirmation.',
    resendConfirmation: ar ? 'إعادة إرسال رسالة التفعيل' : 'Resend confirmation email',
    confirmationResent: ar ? 'أعدنا إرسال رسالة التفعيل. تحقّق من الوارد والرسائل غير المرغوب فيها.' : 'We sent another confirmation email. Check inbox and spam.',
    unconfirmed: ar ? 'هذا الحساب يحتاج تأكيد البريد أولاً.' : 'This account needs email confirmation first.',
    invalidCredentials: ar ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة.' : 'Email or password is incorrect.',
  };

  const authErrorMessage = (error) => {
    const message = String(error?.message || '');
    if (/email not confirmed|email not verified/i.test(message)) return S.unconfirmed;
    if (/invalid login credentials/i.test(message)) return S.invalidCredentials;
    return message || (ar ? 'تعذر تسجيل الدخول حالياً.' : 'Could not sign in right now.');
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
    const usernameValue = normalizeUsername(username);
    const phoneValue = normalizePhone(phone);
    if (mode === 'signup') {
      if (!displayName.trim()) {
        Alert.alert(S.signupErrorTitle, ar ? 'اكتب اسمك حتى يظهر في هوية المستخدم.' : 'Enter your name for your profile identity.');
        return;
      }
      if (!isValidUsername(usernameValue)) {
        Alert.alert(S.signupErrorTitle, S.usernameRule);
        return;
      }
      if (!termsAccepted) {
        Alert.alert(S.signupErrorTitle, S.termsRequired);
        return;
      }
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
        await setCfg(accountIdentityPatch({ displayName, username: usernameValue, phone: phoneValue }));
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password: pass,
          options: {
            emailRedirectTo: getAuthRedirectUrl('confirm'),
            data: {
              displayName: displayName.trim(),
              full_name: displayName.trim(),
              username: usernameValue,
              phone: phoneValue,
            },
          },
        });
        if (error) throw error;
        if (data.user?.id) {
          const profileResult = await upsertProfileIdentity(supabase, data.user.id, {
            displayName,
            username: usernameValue,
            phone: phoneValue,
          });
          if (profileResult.error) throw profileResult.error;
        }
        await setCfg(accountIdentityPatch({
          displayName,
          username: usernameValue,
          phone: phoneValue,
          consentAccepted: termsAccepted,
        }));
        if (data.user && !data.session) {
          setPendingConfirmationEmail(email.trim().toLowerCase());
          Alert.alert(S.signup, S.emailChk);
        } else {
          await setUser(data.user);
        }
      }
    } catch (e) {
      if (mode === 'signin' && /email not confirmed|email not verified/i.test(String(e?.message || ''))) {
        setPendingConfirmationEmail(email.trim().toLowerCase());
      }
      Alert.alert(mode === 'signin' ? S.authErrorTitle : S.signupErrorTitle, authErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    const confirmationEmail = (pendingConfirmationEmail || email).trim().toLowerCase();
    if (!confirmationEmail) return;
    setResendingConfirmation(true);
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: confirmationEmail,
        options: { emailRedirectTo: getAuthRedirectUrl('confirm') },
      });
      if (error) throw error;
      Alert.alert(S.signup, S.confirmationResent);
    } catch (error) {
      Alert.alert(S.signupErrorTitle, authErrorMessage(error));
    } finally {
      setResendingConfirmation(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      Alert.alert(S.resetTitle, ar ? 'أدخل بريدك الإلكتروني أولاً.' : 'Enter your email first.');
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
      Alert.alert(S.resetTitle, ar ? 'أُرسلت رسالة الاستعادة إلى بريدك.' : 'A recovery email was sent.');
    } catch (error) {
      Alert.alert(S.resetTitle, error?.message || '');
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
          {mode === 'signup' ? (
            <>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={S.name}
                placeholderTextColor={th.sub}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border,
                  textAlign: ar ? 'right' : 'left' }]}
              />
              <TextInput
                value={username}
                onChangeText={(value) => setUsername(normalizeUsername(value))}
                placeholder={S.username}
                placeholderTextColor={th.sub}
                autoCapitalize="none"
                autoCorrect={false}
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border,
                  textAlign: 'left', writingDirection: 'ltr' }]}
              />
              <TextInput
                value={phone}
                onChangeText={(value) => setPhone(normalizePhone(value))}
                placeholder={S.phone}
                placeholderTextColor={th.sub}
                keyboardType="phone-pad"
                style={[s.input, { backgroundColor: th.input, color: th.text, borderColor: th.border,
                  textAlign: 'left', writingDirection: 'ltr' }]}
              />
            </>
          ) : null}
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
                {S.forgotPassword}
              </Text>
            </TouchableOpacity>
          ) : null}
          {pendingConfirmationEmail ? (
            <View style={[s.confirmationPanel, { backgroundColor: th.muted, borderColor: th.border }]}>
              <Ionicons name="mail-unread-outline" size={20} color={th.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: th.text, fontSize: 13, ...weight('800'), textAlign: ar ? 'right' : 'left' }}>{S.confirmationPending}</Text>
                <Text style={{ color: th.sub, fontSize: 12, marginTop: 3, textAlign: ar ? 'right' : 'left' }}>{pendingConfirmationEmail}</Text>
              </View>
              <TouchableOpacity
                onPress={handleResendConfirmation}
                disabled={resendingConfirmation || loading}
                accessibilityRole="button"
                accessibilityLabel={S.resendConfirmation}
              >
                <Text style={{ color: th.primary, fontSize: 12, ...weight('800') }}>{resendingConfirmation ? '…' : S.resendConfirmation}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {mode === 'signup' ? (
            <TouchableOpacity
              onPress={() => setTermsAccepted(value => !value)}
              style={[s.termsRow, { flexDirection: ar ? 'row-reverse' : 'row' }]}
            >
              <Ionicons
                name={termsAccepted ? 'checkbox' : 'square-outline'}
                size={19}
                color={termsAccepted ? th.primary : th.sub}
              />
              <Text style={{ color: th.sub, fontSize: 12, lineHeight: 18, flex: 1, textAlign: ar ? 'right' : 'left' }}>
                {S.terms}
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
  confirmationPanel: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 0.5, borderRadius: 12, padding: 12, marginTop: 14 },
  termsRow: { alignItems: 'center', gap: 8, marginTop: 12 },
  btn:        { borderRadius: 14, padding: 15, alignItems: 'center', marginTop: 4 },
  switchRow:  { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  skipBtn:    { alignItems: 'center', marginTop: 24, padding: 12 },
});
