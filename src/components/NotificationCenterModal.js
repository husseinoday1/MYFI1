import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationReadKey } from '../lib/notificationCenter';

const labels = (lang) => {
  const ar = lang === 'ar';
  return {
    title: ar ? 'الإشعارات' : 'Notifications',
    count: ar ? 'تنبيه' : 'alerts',
    tap: ar ? 'اضغط للفتح' : 'Tap to open',
    select: ar ? 'تحديد' : 'Select',
    selected: ar ? 'محدد' : 'selected',
    dismissSelected: ar ? 'حذف المحدد' : 'Delete selected',
    cancel: ar ? 'إلغاء' : 'Cancel',
    review: ar ? 'مراجعة الإدخالات الذكية' : 'Review smart entries',
    reviewTitle: ar ? 'إدخالات ذكية تحتاج مراجعة' : 'Smart entries need review',
    reviewBody: ar
      ? 'لا يمكن حذف هذه المراجعة قبل فتح الإدخالات والتأكد منها.'
      : 'This review cannot be dismissed until the entries are opened and confirmed.',
    reviewAction: ar ? 'مراجعة الآن' : 'Review now',
    retention: ar ? 'الإشعارات المحذوفة تختفي 30 يوماً' : 'Dismissed alerts stay hidden for 30 days',
    emptyTitle: ar ? 'لا توجد إشعارات حالياً' : 'No notifications right now',
    emptyBody: ar ? 'كل شيء يحتاج انتباه سيظهر هنا تلقائياً.' : 'Anything that needs attention appears here automatically.',
  };
};

export default function NotificationCenterModal({
  visible,
  onClose,
  onItemPress,
  onDismissItems,
  onOpenReview,
  smartReviewCount = 0,
  items = [],
  th,
  lang = 'ar',
}) {
  const L = labels(lang);
  const isRtl = lang === 'ar';
  const insets = useSafeAreaInsets();
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const itemKeys = useMemo(() => items.map(item => String(item.id || 'notification')), [items]);
  const itemsByKey = useMemo(() => new Map(items.map(item => [String(item.id || 'notification'), item])), [items]);

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
    const dismissalKeys = safe
      .map(key => itemsByKey.get(key))
      .filter(Boolean)
      .map(item => notificationReadKey(item, Date.now()));
    onDismissItems?.(dismissalKeys);
    setSelectedKeys(current => current.filter(key => !safe.includes(key)));
  };

  const hasNotifications = items.length > 0;
  const hasSmartReview = smartReviewCount > 0;

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
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.title, { color: th.text, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>{L.title}</Text>
              {hasNotifications ? (
                <Text style={[s.headerMeta, { color: th.sub, textAlign: isRtl ? 'right' : 'left' }]}>
                  {items.length} {L.count}
                </Text>
              ) : null}
            </View>
            <TouchableOpacity accessibilityLabel="Close notifications" onPress={onClose} style={[s.headerAction, { backgroundColor: th.cardHigh }]}>
              <Ionicons name="chevron-down" size={18} color={th.sub} />
            </TouchableOpacity>
          </View>

          {hasNotifications ? (
            <View style={[s.selectionBar, { backgroundColor: th.cardHigh, borderColor: th.border, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
              <TouchableOpacity
                accessibilityLabel={L.select}
                onPress={() => {
                  setSelecting(current => !current);
                  setSelectedKeys([]);
                }}
                style={[s.selectionButton, { backgroundColor: selecting ? th.primSoft : th.card }]}
              >
                <Ionicons name={selecting ? 'return-down-back-outline' : 'checkmark-circle-outline'} size={16} color={th.primary} />
                <Text style={[s.selectionButtonText, { color: th.primary }]}>
                  {selecting ? L.cancel : L.select}
                </Text>
              </TouchableOpacity>

              <Text style={[s.selectionCount, { color: th.sub, textAlign: isRtl ? 'right' : 'left' }]}>
                {selecting ? `${selectedKeys.length} ${L.selected}` : L.retention}
              </Text>

              {selecting && selectedKeys.length > 0 ? (
                <TouchableOpacity
                  accessibilityLabel={L.dismissSelected}
                  onPress={() => dismiss(selectedKeys)}
                  style={[s.deleteSelectedButton, { backgroundColor: th.expBg }]}
                >
                  <Ionicons name="trash-outline" size={15} color={th.exp} />
                  <Text style={[s.deleteSelectedText, { color: th.exp }]}>{L.dismissSelected}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          {!hasNotifications && hasSmartReview ? (
            <View style={[s.policyStrip, { backgroundColor: th.cardHigh, flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
              <Ionicons name="information-circle-outline" size={14} color={th.sub} />
              <Text style={[s.policyText, { color: th.sub, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>
                {L.retention}
              </Text>
            </View>
          ) : null}

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled contentContainerStyle={{ paddingBottom: 8 }}>
            {hasSmartReview ? (
              <View style={[s.reviewCard, { backgroundColor: th.warnBg, borderColor: `${th.warn}66` }]}>
                <View style={[s.reviewTop, { flexDirection: isRtl ? 'row-reverse' : 'row' }]}>
                  <View style={[s.reviewIcon, { backgroundColor: th.cardHigh }]}>
                    <Ionicons name="sparkles-outline" size={19} color={th.warn} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.reviewTitle, { color: th.text, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>
                      {L.reviewTitle} ({smartReviewCount})
                    </Text>
                    <Text style={[s.reviewBody, { color: th.sub, textAlign: isRtl ? 'right' : 'left', writingDirection: isRtl ? 'rtl' : 'ltr' }]}>
                      {L.reviewBody}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity onPress={onOpenReview} style={[s.reviewButton, { backgroundColor: th.warn }]} accessibilityLabel={L.review}>
                  <Text style={[s.reviewButtonText, { color: th.onPrimary || th.bg }]}>{L.reviewAction}</Text>
                  <Ionicons name={isRtl ? 'arrow-back-outline' : 'arrow-forward-outline'} size={16} color={th.onPrimary || th.bg} />
                </TouchableOpacity>
              </View>
            ) : null}

            {!hasNotifications ? (
              !hasSmartReview ? (
                <View style={[s.empty, { borderColor: th.border }]}>
                  <Ionicons name="checkmark-circle-outline" size={36} color={th.inc} />
                  <Text style={[s.emptyTitle, { color: th.text }]}>{L.emptyTitle}</Text>
                  <Text style={[s.emptyBody, { color: th.sub }]}>{L.emptyBody}</Text>
                </View>
              ) : null
            ) : items.map(item => {
              const key = String(item.id || 'notification');
              const selected = selectedKeys.includes(key);
              const color = toneColor(item.tone);
              const actionable = !!item.action;

              return (
                <TouchableOpacity
                  key={key}
                  disabled={!selecting && !actionable}
                  onPress={() => selecting ? toggleSelection(key) : onItemPress?.(item)}
                  style={[
                    s.item,
                    {
                      backgroundColor: th.cardHigh,
                      flexDirection: isRtl ? 'row-reverse' : 'row',
                      borderColor: selected ? th.primary : th.border,
                    },
                  ]}
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
                  </View>

                  {!selecting && actionable ? (
                    <Ionicons name={isRtl ? 'chevron-back' : 'chevron-forward'} size={16} color={th.faint} />
                  ) : null}
                </TouchableOpacity>
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
  sheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 10, maxHeight: '78%' },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { alignItems: 'center', gap: 9, marginBottom: 10 },
  titleIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, lineHeight: 24, fontWeight: '900' },

  headerMeta: { fontSize: 11, lineHeight: 16, fontWeight: '800', marginTop: 1 },
  selectionCount: { flex: 1, minWidth: 0, fontSize: 10, lineHeight: 15, fontWeight: '800' },
  headerAction: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  selectionBar: { minHeight: 44, borderRadius: 13, borderWidth: 1, alignItems: 'center', gap: 8, paddingHorizontal: 7, paddingVertical: 5, marginBottom: 8 },
  selectionButton: { minHeight: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 9 },
  selectionButtonText: { fontSize: 11, lineHeight: 15, fontWeight: '900' },
  deleteSelectedButton: { minHeight: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5, paddingHorizontal: 9 },
  deleteSelectedText: { fontSize: 10, lineHeight: 14, fontWeight: '900' },
  policyStrip: { minHeight: 30, borderRadius: 10, paddingHorizontal: 9, gap: 6, alignItems: 'center', marginBottom: 8 },
  policyText: { flex: 1, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  reviewCard: { borderWidth: 1, borderRadius: 15, padding: 11, marginBottom: 9, gap: 10 },
  reviewTop: { alignItems: 'center', gap: 10 },
  reviewIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  reviewTitle: { fontSize: 14, lineHeight: 20, fontWeight: '900' },
  reviewBody: { marginTop: 3, fontSize: 11, lineHeight: 17, fontWeight: '600' },
  reviewButton: { minHeight: 38, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  reviewButtonText: { fontSize: 12, fontWeight: '900' },
  item: { minHeight: 66, borderRadius: 15, paddingHorizontal: 10, paddingVertical: 9, gap: 10, marginBottom: 7, borderWidth: 1, alignItems: 'center' },
  itemIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900', marginBottom: 2 },
  itemBody: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 15, padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, lineHeight: 21, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  emptyBody: { fontSize: 12, marginTop: 6, textAlign: 'center', lineHeight: 19 },
});
