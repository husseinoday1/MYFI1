import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable, SurfaceCard, IconContainer, rtl, textAlign, rowDirection } from './AppPrimitives';
import { RADIUS, SPACE, weight } from '../lib/tokens';

// My Money's 4-card gateway pattern, matched to the approved reference mockup:
// icon + title header, a large hero value, a small meta line, then a
// separated bottom "‹ view" link row. Purely presentational — `value`/`meta`
// are already-formatted strings, no financial computation happens here.
export function GatewayCard({
  th,
  lang = 'ar',
  icon,
  title,
  value,
  meta,
  linkLabel,
  tone,
  index,
  onPress,
  style,
}) {
  const toneColor = tone || th.primary;
  return (
    <Touchable onPress={onPress} style={[s.touchable, style]}>
      <SurfaceCard th={th} style={s.card}>
        <View style={[s.headRow, { flexDirection: rowDirection(lang) }]}>
          <View style={s.iconWrap}>
            <IconContainer th={th} icon={icon} tone={toneColor} size="md" solid />
            {index != null ? (
              <View
                style={[
                  s.numberBadge,
                  {
                    backgroundColor: th.primary,
                    [rtl(lang) ? 'left' : 'right']: -2,
                  },
                ]}
              >
                <Text style={[s.numberText, { color: th.onPrimary }]}>{index}</Text>
              </View>
            ) : null}
          </View>
          <Text
            style={[s.title, { color: th.text, textAlign: textAlign(lang) }]}
            numberOfLines={1}
          >
            {title}
          </Text>
        </View>

        {value ? (
          <Text
            style={[s.value, { color: th.text, textAlign: textAlign(lang) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
          >
            {value}
          </Text>
        ) : null}
        {meta ? (
          <Text style={[s.meta, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}

        {linkLabel ? (
          <View style={[s.linkRow, { flexDirection: rowDirection(lang), borderTopColor: th.border }]}>
            <Ionicons
              name={rtl(lang) ? 'chevron-back' : 'chevron-forward'}
              size={14}
              color={toneColor}
            />
            <Text style={[s.linkText, { color: toneColor, textAlign: textAlign(lang) }]} numberOfLines={1}>
              {linkLabel}
            </Text>
          </View>
        ) : null}
      </SurfaceCard>
    </Touchable>
  );
}

const s = StyleSheet.create({
  touchable: {
    borderRadius: RADIUS.lg,
    overflow: 'hidden',
  },
  card: {
    padding: SPACE.md,
  },
  headRow: {
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.sm,
  },
  iconWrap: {
    position: 'relative',
  },
  numberBadge: {
    position: 'absolute',
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberText: {
    fontSize: 9,
    lineHeight: 13,
    ...weight('900'),
  },
  title: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    ...weight('800'),
  },
  value: {
    fontSize: 24,
    lineHeight: 30,
    ...weight('900'),
  },
  meta: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
    ...weight('700'),
  },
  linkRow: {
    alignItems: 'center',
    gap: 4,
    marginTop: SPACE.sm,
    paddingTop: SPACE.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: {
    fontSize: 12,
    ...weight('900'),
  },
});
