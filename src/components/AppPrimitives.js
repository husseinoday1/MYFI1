import React, { useEffect, useRef } from 'react';
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity as NativeTouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RADIUS, SHADOW, SPACE, TYPE } from '../lib/tokens';

export const rtl = (lang) => lang === 'ar';
export const textAlign = (lang) => (rtl(lang) ? 'right' : 'left');
export const rowDirection = (lang) => (rtl(lang) ? 'row-reverse' : 'row');

export function Touchable(props) {
  const {
    onPress,
    disabled = false,
    haptic = 'selection',
    activeOpacity = 0.72,
    ...rest
  } = props;
  const runPress = async (event) => {
    if (disabled) return;
    try {
      if (haptic === 'impact') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (haptic === 'selection') {
        await Haptics.selectionAsync();
      }
    } catch {}
    onPress?.(event);
  };
  return (
    <NativeTouchableOpacity
      activeOpacity={activeOpacity}
      disabled={disabled}
      onPress={runPress}
      {...rest}
    />
  );
}

export function Skeleton({ width = '100%', height = 14, radius = 10, style }) {
  const pulse = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 820, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.55, duration: 820, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: 'rgba(145,170,194,0.18)',
          opacity: pulse,
        },
        style,
      ]}
    />
  );
}

export function ScreenScroll({ th, children, bottom = 88, style }) {
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: th.bg }, style]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      nestedScrollEnabled
      contentContainerStyle={{
        paddingHorizontal: SPACE.screen,
        paddingTop: SPACE.lg,
        paddingBottom: bottom,
      }}
    >
      {children}
    </ScrollView>
  );
}

export function SurfaceCard({ th, children, style, soft = false }) {
  return (
    <View
      style={[
        s.surfaceCard,
        {
          backgroundColor: soft ? th.cardHigh : th.card,
          borderColor: th.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function AppButton({
  th,
  label,
  icon,
  tone = 'primary',
  lang = 'ar',
  style,
  textStyle,
  children,
  ...props
}) {
  const palette = tone === 'secondary'
    ? { bg: th.cardHigh, fg: th.sub, border: th.border }
    : tone === 'soft'
      ? { bg: th.primSoft, fg: th.primary, border: 'transparent' }
      : tone === 'danger'
        ? { bg: th.expBg, fg: th.exp, border: 'transparent' }
        : { bg: th.primary, fg: th.onPrimary, border: 'transparent' };
  return (
    <Touchable
      style={[
        s.button,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          flexDirection: rowDirection(lang),
        },
        style,
      ]}
      {...props}
    >
      {icon ? <Ionicons name={icon} size={15} color={palette.fg} /> : null}
      {children || (
        <Text
          style={[s.buttonText, { color: palette.fg }, textStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {label}
        </Text>
      )}
    </Touchable>
  );
}

export function PageIntro({ th, lang = 'ar', icon = 'analytics-outline', title, subtitle, tone, action, children, compact = false }) {
  const accent = tone || th.primary;
  return (
    <SurfaceCard th={th} style={[s.intro, compact && s.introCompact]}>
      <View style={[s.introHeader, { flexDirection: rowDirection(lang) }]}>
        <View style={[s.introIcon, { backgroundColor: `${accent}1A`, borderColor: `${accent}30` }]}>
          <Ionicons name={icon} size={18} color={accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            style={[s.introTitle, { color: th.text, textAlign: textAlign(lang) }]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            {title}
          </Text>
          {!!subtitle && (
            <Text style={[s.introSubtitle, { color: th.sub, textAlign: textAlign(lang) }]}>{subtitle}</Text>
          )}
        </View>
        {action || null}
      </View>
      {children || null}
    </SurfaceCard>
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

export function MetricCard({
  th,
  lang = 'ar',
  icon,
  label,
  value,
  tone,
  helper,
  style,
  center = false,
  compact = false,
  valueStyle,
  labelStyle,
  helperStyle,
  iconPlain = false,
}) {
  const color = tone || th.text;
  const align = center ? 'center' : textAlign(lang);
  return (
    <View
      style={[
        s.metricCard,
        compact && s.metricCardCompact,
        center && s.metricCardCenter,
        { backgroundColor: th.card, borderColor: th.border },
        style,
      ]}
    >
      <View style={[s.metricTop, { flexDirection: center ? 'column' : rowDirection(lang) }]}>
        {!!icon && (
          <View style={[
            s.metricIcon,
            iconPlain && s.metricIconPlain,
            {
              backgroundColor: iconPlain ? 'transparent' : `${color}18`,
              borderColor: iconPlain ? 'transparent' : `${color}30`,
            },
          ]}>
            <Ionicons name={icon} size={16} color={color} />
          </View>
        )}
        <Text
          style={[s.metricLabel, { color: th.sub, textAlign: align, flex: center ? 0 : 1 }, labelStyle]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
      <Text style={[s.metricValue, { color, textAlign: align }, valueStyle]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {!!helper && (
        <Text style={[s.metricHelper, { color: th.faint, textAlign: align }, helperStyle]} numberOfLines={2}>
          {helper}
        </Text>
      )}
    </View>
  );
}

export function EmptyState({ th, icon = 'file-tray-outline', title, body }) {
  return (
    <View style={[s.empty, { borderColor: th.border, backgroundColor: th.card }]}>
      <View style={[s.emptyIcon, { backgroundColor: th.cardHigh }]}>
        <Ionicons name={icon} size={26} color={th.faint} />
      </View>
      {!!title && <Text style={[s.emptyTitle, { color: th.text }]}>{title}</Text>}
      {!!body && <Text style={[s.emptyBody, { color: th.sub }]}>{body}</Text>}
    </View>
  );
}

export function InfoStrip({ th, lang = 'ar', items = [] }) {
  return (
    <View style={[s.infoStrip, { backgroundColor: th.card, borderColor: th.border, flexDirection: rowDirection(lang) }]}>
      {items.map(item => (
        <View key={item.label} style={{ flex: 1 }}>
          <Text style={[s.infoLabel, { color: th.faint, textAlign: textAlign(lang) }]}>{item.label}</Text>
          <Text
            style={[s.infoValue, { color: item.tone || th.text, textAlign: textAlign(lang) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  surfaceCard: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    ...SHADOW.card,
  },
  intro: {
    padding: SPACE.lg,
    marginBottom: SPACE.lg,
  },
  introCompact: { padding: SPACE.md },
  introHeader: { alignItems: 'center', gap: SPACE.md },
  introIcon: {
    width: 38,
    height: 38,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  introTitle: { fontSize: 21, lineHeight: 27, fontWeight: '900' },
  introSubtitle: { fontSize: TYPE.meta, lineHeight: 18, fontWeight: '700', marginTop: 3 },
  sectionWrap: { alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.md, marginTop: SPACE.md },
  sectionMark: { width: 18, height: 4, borderRadius: RADIUS.pill },
  sectionTitle: { flex: 1, fontSize: TYPE.section, lineHeight: 18, fontWeight: '900', letterSpacing: 0 },
  button: {
    minHeight: 44,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACE.lg,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
    borderWidth: 1,
  },
  buttonText: {
    fontSize: TYPE.body,
    lineHeight: 18,
    fontWeight: '900',
  },
  metricCard: {
    width: '48.8%',
    minHeight: 96,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    borderWidth: 1,
    justifyContent: 'space-between',
    ...SHADOW.card,
  },
  metricCardCompact: {
    minHeight: 84,
    padding: SPACE.sm + 2,
  },
  metricCardCenter: {
    alignItems: 'center',
  },
  metricTop: {
    alignItems: 'center',
    gap: SPACE.sm,
  },
  metricIcon: {
    width: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  metricIconPlain: {
    width: 24,
    height: 24,
    borderWidth: 0,
    borderRadius: 0,
  },
  metricLabel: { fontSize: 12, lineHeight: 17, fontWeight: '800' },
  metricValue: { fontSize: 16, lineHeight: 20, fontWeight: '900', marginTop: 6 },
  metricHelper: { fontSize: 12, lineHeight: 17, fontWeight: '700', marginTop: 5 },
  empty: {
    alignItems: 'center',
    padding: SPACE.xxl,
    borderWidth: 1,
    borderRadius: RADIUS.xl,
    borderStyle: 'dashed',
    ...SHADOW.card,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  emptyTitle: { fontSize: 16, lineHeight: 22, fontWeight: '900', textAlign: 'center' },
  emptyBody: { fontSize: TYPE.meta, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  infoStrip: {
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    gap: SPACE.md,
    borderWidth: 1,
    ...SHADOW.card,
  },
  infoLabel: { fontSize: 12, lineHeight: 16, fontWeight: '800' },
  infoValue: { fontSize: TYPE.meta, lineHeight: 17, fontWeight: '900', marginTop: 4 },
});
