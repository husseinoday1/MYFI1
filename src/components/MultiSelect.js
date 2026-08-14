import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Touchable as TouchableOpacity } from './AppPrimitives';
import { RADIUS, SHADOW, weight } from '../lib/tokens';

export function useMultiSelect(availableIds = []) {
  // Large ledgers can expose tens of thousands of IDs. Serializing the entire
  // list on every render becomes a visible UI stall, so callers pass a stable
  // memoized array and we deduplicate it only when that array changes.
  const ids = useMemo(
    () => [...new Set((availableIds || []).filter(Boolean))],
    [availableIds],
  );
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const available = new Set(ids);
    setSelectedIds(current => {
      const next = current.filter(id => available.has(id));
      return next.length === current.length ? current : next;
    });
  }, [ids]);

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleSelectedCount = ids.reduce((count, id) => count + (selected.has(id) ? 1 : 0), 0);
  const allSelected = ids.length > 0 && visibleSelectedCount === ids.length;

  const start = () => setSelecting(true);
  const cancel = () => {
    setSelecting(false);
    setSelectedIds([]);
  };
  const toggle = (id) => {
    if (!id) return;
    setSelecting(true);
    setSelectedIds(current => (
      current.includes(id)
        ? current.filter(value => value !== id)
        : [...current, id]
    ));
  };
  const toggleAll = () => {
    setSelecting(true);
    setSelectedIds(current => {
      const next = new Set(current);
      const shouldClear = ids.length > 0 && ids.every(id => next.has(id));
      ids.forEach(id => {
        if (shouldClear) next.delete(id);
        else next.add(id);
      });
      return [...next];
    });
  };

  return {
    selecting,
    selected,
    selectedIds,
    selectedCount: selectedIds.length,
    visibleSelectedCount,
    allSelected,
    start,
    cancel,
    toggle,
    toggleAll,
  };
}

export function SelectionCheckbox({ th, selected, onPress, disabled = false }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!selected, disabled }}
      style={[
        s.checkbox,
        {
          backgroundColor: selected ? th.primSoft : th.cardHigh,
          borderColor: selected ? th.primary : th.border,
        },
      ]}
      scale={0.92}
    >
      <Ionicons
        name={selected ? 'checkmark' : 'square-outline'}
        size={selected ? 18 : 16}
        color={selected ? th.primary : th.faint}
      />
    </TouchableOpacity>
  );
}

export function MultiSelectBar({
  th,
  lang = 'ar',
  active,
  count = 0,
  total = 0,
  allSelected = false,
  onStart,
  onToggleAll,
  onDelete,
  onCancel,
  style,
}) {
  if (!total) return null;
  const ar = lang === 'ar';
  const rowDir = ar ? 'row-reverse' : 'row';
  const text = {
    select: ar ? 'تحديد' : 'Select',
    selected: ar ? 'محدد' : 'selected',
    selectAll: ar ? 'تحديد الكل' : 'Select all',
    clearAll: ar ? 'إلغاء تحديد الكل' : 'Deselect all',
    delete: ar ? 'حذف' : 'Delete',
    cancel: ar ? 'إلغاء' : 'Cancel',
  };

  if (!active) return null;

  return (
    <View
      style={[
        s.bar,
        {
          backgroundColor: th.nav || th.card,
          borderColor: th.border,
          flexDirection: rowDir,
        },
        style,
      ]}
    >
      <View style={[s.countBox, { backgroundColor: th.primSoft, flexDirection: rowDir }]}>
        <Ionicons name="checkmark-done" size={15} color={th.primary} />
        <Text style={[s.countText, { color: th.primary }]}>{count}</Text>
      </View>
      <Text style={[s.selectedText, { color: th.text }]}>
        {text.selected}
      </Text>
      <TouchableOpacity onPress={onToggleAll} style={[s.actionButton, { backgroundColor: th.primSoft, borderColor: `${th.primary}45` }]}>
        <Ionicons name={allSelected ? 'remove-circle-outline' : 'checkmark-done-outline'} size={16} color={th.primary} />
        <Text style={[s.actionText, { color: th.primary }]}>
          {allSelected ? text.clearAll : text.selectAll}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onDelete}
        disabled={!count}
        style={[s.iconButton, { backgroundColor: count ? th.expBg : th.cardHigh, borderColor: count ? `${th.exp}35` : th.border }]}
        accessibilityLabel={text.delete}
      >
        <Ionicons name="trash-outline" size={18} color={count ? th.exp : th.faint} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onCancel}
        style={[s.iconButton, { backgroundColor: th.cardHigh, borderColor: th.border }]}
        accessibilityLabel={text.cancel}
      >
        <Ionicons name="arrow-undo-outline" size={19} color={th.sub} />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  bar: {
    minHeight: 50,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 10,
    ...SHADOW.float,
  },
  countBox: {
    minWidth: 30,
    height: 30,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
  },
  countText: { fontSize: 12, lineHeight: 17, ...weight('900') },
  selectedText: { flex: 1, fontSize: 12, lineHeight: 18, ...weight('900') },
  actionButton: {
    minHeight: 34,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 9,
    borderWidth: 1,
  },
  actionText: { fontSize: 12, lineHeight: 18, ...weight('900') },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
