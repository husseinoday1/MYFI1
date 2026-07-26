import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SPACE, RADIUS, ELEVATION, weight } from '../lib/tokens';

export const TYPE = {
  hero: 30,
  title: 20,
  section: 13,
  body: 14,
  meta: 12,
  tiny: 11,
};

export const rtl = (lang) => lang === 'ar';
export const textAlign = (lang) => (rtl(lang) ? 'right' : 'left');
export const rowDirection = (lang) => (rtl(lang) ? 'row-reverse' : 'row');

const HAPTIC_STYLE = {
  light: Haptics.ImpactFeedbackStyle?.Light,
  medium: Haptics.ImpactFeedbackStyle?.Medium,
  heavy: Haptics.ImpactFeedbackStyle?.Heavy,
};

// عنصر ضغط موحّد لكل الواجهة: انضغاطة بصرية خفيفة (scale) + اهتزاز لمسي.
// بديل مباشر لـ TouchableOpacity — نفس props (style, onPress, children...).
export function Touchable({
  onPress,
  onLongPress,
  disabled,
  haptic = 'light',
  scaleTo = 0.96,
  style,
  children,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (value) => {
    Animated.spring(scale, { toValue: value, useNativeDriver: true, speed: 40, bounciness: 0 }).start();
  };

  const handlePress = (e) => {
    if (haptic && Platform.OS !== 'web') {
      const hapticStyle = HAPTIC_STYLE[haptic] || HAPTIC_STYLE.light;
      if (hapticStyle) Haptics.impactAsync(hapticStyle).catch(() => {});
    }
    onPress?.(e);
  };

  return (
    <Pressable
      disabled={disabled}
      onPress={handlePress}
      onLongPress={onLongPress}
      onPressIn={() => animateTo(scaleTo)}
      onPressOut={() => animateTo(1)}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.5 }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// عنصر تحميل نابض — يستخدم أثناء أول مزامنة سحابية أو أي جلب بيانات غير فوري.
// ملاحظة: أغلب شاشات MYFI تقرأ من Zustand/AsyncStorage محلياً وتظهر فوراً،
// فاستخدامه الحقيقي محصور بلحظة سحب بيانات Supabase الأولى بعد تسجيل الدخول.
export function Skeleton({ th, width = '100%', height = 16, radius = RADIUS.sm, style }) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[{ width, height, borderRadius: radius, backgroundColor: th.cardHigh, opacity }, style]}
    />
  );
}

export function ScreenScroll({ th, children, bottom = 72, style }) {
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: th.bg }, style]}
      contentContainerStyle={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.lg, paddingBottom: bottom }}
    >
      {children}
    </ScrollView>
  );
}

export function PageIntro({ th, lang = 'ar', icon = 'analytics-outline', title, subtitle, tone }) {
  const accent = tone || th.primary;
  return (
    <View style={[s.intro, { backgroundColor: th.card, borderColor: th.border }]}>
      <View style={[s.introHeader, { flexDirection: rowDirection(lang) }]}>
        <View style={[s.introIcon, { backgroundColor: `${accent}18` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <Text style={[s.introTitle, { color: th.text, textAlign: textAlign(lang) }]}>{title}</Text>
      </View>
      {!!subtitle && (
        <Text style={[s.introSubtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{subtitle}</Text>
      )}
    </View>
  );
}

export function SectionTitle({ th, lang = 'ar', children, style }) {
  return (
    <View style={[s.sectionWrap, { flexDirection: rowDirection(lang) }]}>
      <View style={[s.sectionMark, { backgroundColor: th.primary }]} />
      <Text style={[s.sectionTitle, { color: th.text, textAlign: textAlign(lang) }, style]}>
        {children}
      </Text>
    </View>
  );
}

export function MetricCard({ th, lang = 'ar', icon, label, value, tone, helper }) {
  const color = tone || th.text;
  return (
    <View style={[s.metricCard, { backgroundColor: th.card, borderColor: th.border }]}>
      {!!icon && (
        <View style={[s.metricIcon, { backgroundColor: `${color}18` }]}>
          <Ionicons name={icon} size={15} color={color} />
        </View>
      )}
      <Text style={[s.metricLabel, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={1}>{label}</Text>
      <Text style={[s.metricValue, { color, textAlign: textAlign(lang) }]} numberOfLines={1}>{value}</Text>
      {!!helper && (
        <Text style={[s.metricHelper, { color: th.faint, textAlign: textAlign(lang) }]} numberOfLines={1}>{helper}</Text>
      )}
    </View>
  );
}

export function EmptyState({ th, lang = 'ar', icon = 'file-tray-outline', title, body }) {
  return (
    <View style={[s.empty, { borderColor: th.border }]}>
      <Ionicons name={icon} size={32} color={th.faint} />
      {!!title && <Text style={[s.emptyTitle, { color: th.text, textAlign: 'center' }]}>{title}</Text>}
      {!!body && <Text style={[s.emptyBody, { color: th.sub, textAlign: 'center' }]}>{body}</Text>}
    </View>
  );
}

export function InfoStrip({ th, lang = 'ar', items = [] }) {
  return (
    <View style={[s.infoStrip, { backgroundColor: th.cardHigh, flexDirection: rowDirection(lang) }]}>
      {items.map(item => (
        <View key={item.label} style={{ flex: 1 }}>
          <Text style={[s.infoLabel, { color: th.faint, textAlign: textAlign(lang) }]}>{item.label}</Text>
          <Text style={[s.infoValue, { color: item.tone || th.text, textAlign: textAlign(lang) }]} numberOfLines={1}>
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  intro: { borderRadius: RADIUS.lg, borderWidth: 0.5, padding: SPACE.md + 2, marginBottom: SPACE.md + 2, ...ELEVATION.e1 },
  introHeader: { alignItems: 'center', gap: 10 },
  introIcon: { width: 34, height: 34, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },
  introTitle: { flex: 1, fontSize: TYPE.title, lineHeight: 27, ...weight('900') },
  introSubtitle: { fontSize: TYPE.meta, lineHeight: 19, marginTop: 10, ...weight('600') },
  sectionWrap: { alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 10 },
  sectionMark: { width: 4, height: 16, borderRadius: 4 },
  sectionTitle: { flex: 1, fontSize: TYPE.section, lineHeight: 18, ...weight('900') },
  metricCard: { width: '48.8%', minHeight: 104, borderRadius: RADIUS.md, padding: SPACE.md, borderWidth: 0.5, ...ELEVATION.e1 },
  metricIcon: { width: 28, height: 28, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricLabel: { fontSize: TYPE.tiny, lineHeight: 15, ...weight('800') },
  metricValue: { fontSize: 17, lineHeight: 22, ...weight('900'), marginTop: 6 },
  metricHelper: { fontSize: 10, lineHeight: 14, ...weight('700'), marginTop: 5 },
  empty: { alignItems: 'center', padding: SPACE.xl + 2, borderWidth: 0.5, borderRadius: RADIUS.lg, borderStyle: 'dashed' },
  emptyTitle: { fontSize: 15, lineHeight: 21, ...weight('900'), marginTop: 10 },
  emptyBody: { fontSize: TYPE.meta, lineHeight: 19, marginTop: 6, ...weight('400') },
  infoStrip: { borderRadius: RADIUS.md, padding: SPACE.md, gap: 12, ...ELEVATION.e1 },
  infoLabel: { fontSize: 10, lineHeight: 14, ...weight('800') },
  infoValue: { fontSize: TYPE.meta, lineHeight: 17, ...weight('900'), marginTop: 4 },
});
