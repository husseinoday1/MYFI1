import React from 'react';
import { Platform } from 'react-native';
import { useUI } from '../UIContext';
import { Icon } from '../Icon';
import { Tap } from '../primitives';
import { TAB_BAR_CONTENT_HEIGHT } from './TabBar';

// The + button (mf.css `.fab`). Home only; it means "new transaction" and
// nothing else. It sits on the end side above the tab bar: left in Arabic,
// right in English. Long-press variants arrive with long-press.html.
export function Fab({ onPress, onLongPress, bottomInset = 0, accessibilityLabel }) {
  const { palette, isRtl } = useUI();
  return (
    <Tap
      onPress={onPress}
      onLongPress={onLongPress}
      haptic="impact"
      scale={0.94}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={{
        position: 'absolute',
        [isRtl ? 'left' : 'right']: 16,
        bottom: TAB_BAR_CONTENT_HEIGHT + bottomInset + 17,
        width: 54,
        height: 54,
        borderRadius: 17,
        backgroundColor: palette.brand,
        alignItems: 'center',
        justifyContent: 'center',
        ...Platform.select({
          ios: { shadowColor: palette.brand, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
          android: { elevation: 6 },
          default: {},
        }),
      }}
    >
      <Icon name="plus" size={26} color="onBrand" />
    </Tap>
  );
}
