import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Touchable } from './AppPrimitives';
import { weight } from '../lib/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const labels = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'الإشعارات' : 'Notifications',
    close: ar ? 'إغلاق' : 'Close',
    count: ar ? 'تنبيه' : 'alerts',
    tap: ar ? 'اضغط للفتح' : 'Tap to open',
    emptyTitle: ar ? 'لا توجد إشعارات حالياً' : 'No notifications right now',
    emptyBody: ar ? 'كل شيء يحتاج انتباه سيظهر هنا تلقائياً.' : 'Anything that needs attention appears here automatically.',
  };
};

export default function NotificationCenterModal({ visible, onClose, onItemPress, items = [], th, lang = 'ar' }) {
  const L = labels(lang);
  const isRtl = lang === 'ar';
  const insets = useSafeAreaInsets();

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Touchable style={[s.overlay, { backgroundColor: th.overlay }]} activeOpacity={1} onPress={onClose}>
        <Touchable activeOpacity={1} style={[s.sheet, { backgroundColor: th.card, paddingBottom: 18 + Math.max(insets.bottom, 8) }]}>
          <View style={[s.handle, { backgroundColor: th.cardHigh }]} />

          <View style={[s.header, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
            <View style={[s.titleIcon, { backgroundColor: th.primSoft }]}>
              <Ionicons name="notifications-outline" size={18} color={th.primary} />
            </View>
            <Text style={[s.title, { color: th.text, textAlign: isRtl ? 'right' : 'left' }]}>{L.title}</Text>
            {items.length > 0 ? (
              <View style={[s.countPill, { backgroundColor: th.primSoft }]}>
                <Text style={{ color: th.primary, fontSize: 11, ...weight('900') }}>{items.length} {L.count}</Text>
              </View>
            ) : null}
            <Touchable onPress={onClose} style={[s.closeBtn, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="close" size={18} color={th.sub} />
            </Touchable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {items.length === 0 ? (
              <View style={[s.empty, { borderColor: th.border }]}>
                <Ionicons name="checkmark-circle-outline" size={36} color={th.inc} />
                <Text style={[s.emptyTitle, { color: th.text }]}>{L.emptyTitle}</Text>
                <Text style={[s.emptyBody, { color: th.sub }]}>{L.emptyBody}</Text>
              </View>
            ) : items.map(item => {
              const color = toneColor(item.tone);
              const actionable = !!item.action;
              return (
                <Touchable
                  key={item.id}
                  disabled={!actionable}
                  onPress={() => actionable && onItemPress?.(item)}
                  style={[s.item, { backgroundColor: th.cardHigh, flexDirection: isRtl ? 'row-reverse' : 'row', borderColor: th.border }]}
                >
                  <View style={[s.itemIcon, { backgroundColor: toneBg(item.tone) }]}>
                    <Ionicons name={item.icon} size={18} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.itemTitle, { color: th.text, textAlign: isRtl ? 'right' : 'left' }]}>{item.title}</Text>
                    <Text style={[s.itemBody, { color: th.sub, textAlign: isRtl ? 'right' : 'left' }]}>{item.body}</Text>
                    {actionable ? (
                      <Text style={{ color, fontSize: 11, ...weight('900'), marginTop: 5, textAlign: isRtl ? 'right' : 'left' }}>{L.tap}</Text>
                    ) : null}
                  </View>
                  {actionable ? <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} /> : null}
                </Touchable>
              );
            })}
          </ScrollView>
        </Touchable>
      </Touchable>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 18, paddingTop: 12, maxHeight: '78%' },
  handle: { width: 38, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  header: { alignItems: 'center', gap: 10, marginBottom: 14 },
  titleIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 18, lineHeight: 24, ...weight('900') },
  countPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  closeBtn: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: 13, padding: 12, gap: 10, marginBottom: 8, borderWidth: 0.5 },
  itemIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, lineHeight: 20, ...weight('900'), marginBottom: 4 },
  itemBody: { fontSize: 12, lineHeight: 19, ...weight('600') },
  empty: { borderWidth: 0.5, borderStyle: 'dashed', borderRadius: 14, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 21, ...weight('900'), marginTop: 10, textAlign: 'center' },
  emptyBody: { fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
