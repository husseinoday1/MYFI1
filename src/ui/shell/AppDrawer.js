import React from 'react';
import { Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUI } from '../UIContext';
import { Txt } from '../Txt';
import { Icon } from '../Icon';
import { Avatar, Row, Tap } from '../primitives';

// The drawer (tools.html frame ١), opened from the account avatar on Home.
// Header: the same account card as Account info (more-screens.html ١٧).
// Groups arrive from the shell with only destinations that exist; an item is
// never drawn without a function behind it.
export function AppDrawer({ visible, onClose, account, groups, onOpenAccount }) {
  const { palette, isRtl } = useUI();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, flexDirection: isRtl ? 'row-reverse' : 'row' }}>
        <View
          style={{
            width: '82%',
            backgroundColor: palette.screen,
            paddingTop: 18 + insets.top,
            paddingBottom: 18 + insets.bottom,
            paddingHorizontal: 14,
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: isRtl ? -4 : 4, height: 0 } },
              android: { elevation: 16 },
              default: {},
            }),
          }}
        >
          <Tap onPress={onOpenAccount} scale={0.99} accessibilityRole="button">
            <Row style={{ gap: 10, paddingBottom: 14, borderBottomWidth: 0.5, borderBottomColor: palette.border }}>
              <Avatar name={account.name} size={42} />
              <View style={{ flex: 1 }}>
                <Txt size={14.5} weight={500} color="text1">{account.name}</Txt>
                <Txt variant="sub">{account.status}</Txt>
              </View>
            </Row>
          </Tap>
          <ScrollView showsVerticalScrollIndicator={false}>
            {groups.map((group) => (
              <View key={group.key}>
                <Txt variant="sub" style={{ marginTop: 14, marginBottom: 4, marginHorizontal: 4 }}>{group.label}</Txt>
                {group.items.map((item) => (
                  <Tap key={item.key} onPress={item.onPress} scale={0.99} accessibilityRole="button" accessibilityLabel={item.label}>
                    <Row style={{ gap: 10, paddingVertical: 9, paddingHorizontal: 4 }}>
                      <Icon name={item.icon} size={19} color="text3" />
                      <Txt size={14} color="text2" style={{ flex: 1 }}>{item.label}</Txt>
                      {item.count ? <Txt size={12} color="text4">{item.count}</Txt> : null}
                    </Row>
                  </Tap>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
        <Pressable style={{ flex: 1, backgroundColor: palette.scrim }} onPress={onClose} accessibilityRole="button" />
      </View>
    </Modal>
  );
}
