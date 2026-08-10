import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Unified date + wallet row for debt/goal/commitment/linked tracker forms.
 *
 * Keep picker logic in the parent. This component only standardizes visual UI.
 */
export default function EntryContextRow({
  th,
  lang = 'ar',
  dateTitle,
  dateValue,
  walletTitle,
  walletValue,
  walletMeta = '',
  onPressDate,
  onPressWallet,
  accentColor,
}) {
  const rtl = lang === 'ar';
  const accent = accentColor || th.primary;

  const Cell = ({ title, value, meta, icon, onPress }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      style={[s.cell, { backgroundColor: th.input, borderColor: th.border }]}
    >
      <Text
        numberOfLines={1}
        style={[s.label, { color: th.sub, textAlign: rtl ? 'right' : 'left' }]}
      >
        {title}
      </Text>

      <View style={[s.valueRow, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={[s.value, { color: th.text, textAlign: rtl ? 'right' : 'left' }]}
          >
            {value}
          </Text>
          {!!meta && (
            <Text
              numberOfLines={1}
              style={[s.meta, { color: th.sub, textAlign: rtl ? 'right' : 'left' }]}
            >
              {meta}
            </Text>
          )}
        </View>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.row, { flexDirection: rtl ? 'row-reverse' : 'row' }]}>
      <Cell
        title={dateTitle}
        value={dateValue}
        icon="calendar-outline"
        onPress={onPressDate}
      />
      <Cell
        title={walletTitle}
        value={walletValue}
        meta={walletMeta}
        icon="wallet-outline"
        onPress={onPressWallet}
      />
    </View>
  );
}

const s = StyleSheet.create({
  row: { gap: 10, width: '100%' },
  cell: {
    flex: 1,
    minHeight: 82,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    marginBottom: 5,
  },
  valueRow: {
    alignItems: 'center',
    gap: 8,
  },
  value: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '900',
  },
  meta: {
    marginTop: 2,
    fontSize: 10,
    lineHeight: 15,
    fontWeight: '600',
  },
});
