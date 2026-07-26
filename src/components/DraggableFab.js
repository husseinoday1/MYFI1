import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SHADOW } from '../lib/tokens';
import PressableScale from './PressableScale';

const FAB_SIZE = 56;

export default function DraggableFab({ th, onPress, bottomInset = 0, label = '', color }) {
  return (
    <View style={[s.fixedWrap, { bottom: 82 + Math.max(Number(bottomInset) || 0, 0) }]}>
      {!!label && (
        <View style={[s.labelPill, { backgroundColor: th.card, borderColor: th.border }]}>
          <Text style={[s.labelText, { color: th.text }]} numberOfLines={1}>{label}</Text>
        </View>
      )}
      <PressableScale
        onPress={onPress}
        style={[s.fixedFab, { backgroundColor: color || th.primary }]}
        haptic="impact"
        scale={0.92}
        accessibilityRole="button"
      >
        <Ionicons name="add" size={31} color="#FFFFFF" />
      </PressableScale>
    </View>
  );
}

const s = StyleSheet.create({
  fixedWrap: {
    position: 'absolute',
    left: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 999,
  },
  fixedFab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.float,
  },
  labelPill: {
    maxWidth: 150,
    minHeight: 40,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.card,
  },
  labelText: {
    fontSize: 12,
    fontWeight: '900',
  },
});
