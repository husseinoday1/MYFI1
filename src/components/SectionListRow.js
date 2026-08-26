import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable, IconContainer, rtl, textAlign, rowDirection } from './AppPrimitives';
import { SPACE, weight } from '../lib/tokens';

// More/Settings/Follow-ups' icon+title+description+chevron row
// (05_MYFI_COMPONENT_ARCHITECTURE.md). Purely presentational.
export function SectionListRow({
  th,
  lang = 'ar',
  icon,
  tone,
  title,
  description,
  right,
  showChevron = true,
  bordered = false,
  onPress,
  style,
}) {
  return (
    <Touchable
      onPress={onPress}
      style={[
        s.touchable,
        bordered && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: th.border,
        },
        style,
      ]}
    >
      <View style={[s.row, { flexDirection: rowDirection(lang) }]}>
        <IconContainer th={th} icon={icon} tone={tone || th.primary} size="md" />
        <View style={s.textContainer}>
          <Text style={[s.title, { color: th.text, textAlign: textAlign(lang) }]} numberOfLines={1}>
            {title}
          </Text>
          {description ? (
            <Text style={[s.description, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>

        {right != null ? (
          typeof right === 'string' || typeof right === 'number' ? (
            <Text style={[s.rightSlot, { color: th.sub, textAlign: textAlign(lang) }]} numberOfLines={1}>
              {right}
            </Text>
          ) : (
            <View style={s.rightSlot}>{right}</View>
          )
        ) : null}

        {showChevron ? (
          <Ionicons
            name={rtl(lang) ? 'chevron-back' : 'chevron-forward'}
            size={18}
            color={th.faint}
            style={s.chevron}
          />
        ) : null}
      </View>
    </Touchable>
  );
}

const s = StyleSheet.create({
  touchable: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  row: {
    alignItems: 'center',
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    marginStart: SPACE.sm,
  },
  title: {
    fontSize: 15,
    lineHeight: 22,
    ...weight('900'),
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
    ...weight('700'),
  },
  rightSlot: {
    marginStart: SPACE.sm,
    flexShrink: 0,
  },
  chevron: {
    marginStart: SPACE.sm,
  },
});
