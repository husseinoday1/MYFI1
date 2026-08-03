import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationReadKey } from '../lib/notificationCenter';

const labels = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? '\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062a' : 'Notifications',
    count: ar ? '\u062a\u0646\u0628\u064a\u0647' : 'alerts',
    tap: ar ? '\u0627\u0636\u063a\u0637 \u0644\u0644\u0641\u062a\u062d' : 'Tap to open',
    select: ar ? '\u062a\u062d\u062f\u064a\u062f' : 'Select',
    selected: ar ? '\u0645\u062d\u062f\u062f' : 'selected',
    emptyTitle: ar ? '\u0644\u0627 \u062a\u0648\u062c\u062f \u0625\u0634\u0639\u0627\u0631\u0627\u062a \u062d\u0627\u0644\u064a\u0627' : 'No notifications right now',
    emptyBody: ar ? '\u0643\u0644 \u0634\u064a\u0621 \u064a\u062d\u062a\u0627\u062c \u0627\u0646\u062a\u0628\u0627\u0647 \u0633\u064a\u0638\u0647\u0631 \u0647\u0646\u0627 \u062a\u0644\u0642\u0627\u0626\u064a\u0627.' : 'Anything that needs attention appears here automatically.',
  };
};

export default function NotificationCenterModal({ visible, onClose, onItemPress, onDismissItems, items = [], th, lang = 'ar' }) {
  const L = labels(lang);
  const isRtl = lang === 'ar';
  const insets = useSafeAreaInsets();
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const itemKeys = useMemo(() => items.map(notificationReadKey), [items]);

  useEffect(() => {
    if (!visible) {
      setSelecting(false);
      setSelectedKeys([]);
    }
  }, [visible]);

  useEffect(() => {
    setSelectedKeys(current => current.filter(key => itemKeys.includes(key)));
  }, [itemKeys]);

  const toneColor = (tone) => {
    if (tone === 'danger') return th.exp;
    if (tone === 'warning') return th.warn;
    if (tone === 'success') return th.inc;
    return th.primary;
  };

  const toneBg = (tone) => {
    if (tone === 'danger') return th.expBg;
    if (tone === 'warning') return th.warnBg;
    if (tone === 'success') return th.incBg;
    return th.primSoft;
  };

  const toggleSelection = (key) => {
    setSelectedKeys(current => current.includes(key)
      ? current.filter(item => item !== key)
      : [...current, key]);
  };

  const dismiss = (keys) => {
    const safe = keys.filter(key => itemKeys.includes(key));
    if (!safe.length) return;
    onDismissItems?.(safe);
    setSelectedKeys(current => current.filter(key => !safe.includes(key)));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[s.overlay, { backgroundColor: th.overlay }]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { backgroundColor: th.card, paddingBottom: 18 + Math.max(insets.bottom, 8) }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <View style={[s.titleIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="notifications-outline" size={18} color={th.primary} />
            </View>
            <Text style={[s.title, { color: th.text, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>{L.title}</Text>
            {selecting ? (
              <Text style={[s.selectionCount, { color: th.sub }]}>{selectedKeys.length} {L.selected}</Text>
            ) : items.length > 0 ? (
              <View style={[s.countPill, { backgroundColor: th.primSoft }]}>
                <Text style={{ color: th.primary, fontSize: 12, fontWeight: '900' }}>{items.length} {L.count}</Text>
              </View>
            ) : null}
            {items.length > 0 ? (
              <TouchableOpacity
                accessibilityLabel={L.select}
                onPress={() => {
                  setSelecting(current => !current);
                  setSelectedKeys([]);
                }}
                style={[s.headerAction, { backgroundColor: selecting ? th.primSoft : th.cardHigh }]}
              >
                <Ionicons name={selecting ? 'return-down-back-outline' : 'checkmark-circle-outline'} size={18} color={th.primary} />
              </TouchableOpacity>
            ) : null}
            {selecting && selectedKeys.length > 0 ? (
              <TouchableOpacity accessibilityLabel={L.selected} onPress={() => dismiss(selectedKeys)} style={[s.headerAction, { backgroundColor: th.expBg }]}>
                <Ionicons name="trash-outline" size={18} color={th.exp} />
              </TouchableOpacity>
            ) : null}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: 8 }}>
            {items.length === 0 ? (
              <View style={[s.empty, { borderColor: th.border }]}>
                <Ionicons name="checkmark-circle-outline" size={36} color={th.inc} />
                <Text style={[s.emptyTitle, { color: th.text }]}>{L.emptyTitle}</Text>
                <Text style={[s.emptyBody, { color: th.sub }]}>{L.emptyBody}</Text>
              </View>
            ) : items.map(item => {
              const key = notificationReadKey(item);
              const selected = selectedKeys.includes(key);
              const color = toneColor(item.tone);
              const actionable = !!item.action;
              return (
                <View key={key} style={[s.item, { backgroundColor: th.cardHigh, flexDirection: isRtl ? 'row-reverse' : 'row', borderColor: selected ? th.primary : th.border }]}>
                  <TouchableOpacity
                    disabled={!selecting && !actionable}
                    onPress={() => selecting ? toggleSelection(key) : onItemPress?.(item)}
                    style={[s.itemContent, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}
                  >
                    {selecting ? (
                      <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={21} color={selected ? th.primary : th.faint} />
                    ) : (
                      <View style={[s.itemIcon, { backgroundColor: toneBg(item.tone) }]}>
                        <Ionicons name={item.icon} size={18} color={color} />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemTitle, { color: th.text, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>{item.title}</Text>
                      <Text style={[s.itemBody, { color: th.sub, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>{item.body}</Text>
                      {!selecting && actionable ? (
                        <Text style={{ color, fontSize: 12, fontWeight: '900', marginTop: 5, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }}>{L.tap}</Text>
                      ) : null}
                    </View>
                    {!selecting && actionable ? <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} /> : null}
                  </TouchableOpacity>
                  {!selecting ? (
                    <TouchableOpacity accessibilityLabel="Delete notification" onPress={() => dismiss([key])} style={s.deleteAction}>
                      <Ionicons name="trash-outline" size={18} color={th.faint} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 8, borderTopRightRadius: 8, paddingHorizontal: 18, paddingTop: 12, maxHeight: '78%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  header: { alignItems: 'center', gap: 8, marginBottom: 14 },
  titleIcon: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, lineHeight: 24, fontWeight: '900' },
  countPill: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  selectionCount: { fontSize: 12, fontWeight: '800' },
  headerAction: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: 8, padding: 12, gap: 8, marginBottom: 8, borderWidth: 0.5, alignItems: 'stretch' },
  itemContent: { flex: 1, gap: 10, alignItems: 'center' },
  itemIcon: { width: 38, height: 38, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900', marginBottom: 4 },
  itemBody: { fontSize: 12, lineHeight: 19, fontWeight: '600' },
  deleteAction: { width: 30, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 0.5, borderStyle: 'dashed', borderRadius: 8, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  emptyBody: { fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
