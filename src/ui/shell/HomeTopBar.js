import React from 'react';
import { View } from 'react-native';
import { useUI } from '../UIContext';
import { Icon } from '../Icon';
import { Avatar, Row, Tap } from '../primitives';

// Home's top bar (home.html `.topicons`): the account avatar opens the drawer
// directly (no separate menu button) on the start side; notifications with a
// red dot when something is new, and share, on the end side.
// `onShare` is optional: the share icon only renders once the share center
// exists, because the glossary forbids icons without a decided function.
export function HomeTopBar({ accountName, hasNewNotifications, onOpenDrawer, onOpenNotifications, onShare, labels }) {
  const { palette, isRtl } = useUI();
  return (
    <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
      <Tap onPress={onOpenDrawer} accessibilityRole="button" accessibilityLabel={labels.drawer} hitSlop={8}>
        <Avatar name={accountName} size={32} />
      </Tap>
      <Row style={{ gap: 16 }}>
        <Tap onPress={onOpenNotifications} accessibilityRole="button" accessibilityLabel={labels.notifications} hitSlop={8}>
          <View>
            <Icon name="bell" size={21} color="text3" />
            {hasNewNotifications ? (
              <View
                style={{
                  position: 'absolute',
                  top: -2,
                  [isRtl ? 'left' : 'right']: -2,
                  width: 7,
                  height: 7,
                  borderRadius: 3.5,
                  backgroundColor: palette.expense,
                  borderWidth: 1.5,
                  borderColor: palette.screen,
                }}
              />
            ) : null}
          </View>
        </Tap>
        {onShare ? (
          <Tap onPress={onShare} accessibilityRole="button" accessibilityLabel={labels.share} hitSlop={8}>
            <Icon name="share-2" size={21} color="text3" />
          </Tap>
        ) : null}
      </Row>
    </Row>
  );
}
