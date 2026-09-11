import React from 'react';
import { View } from 'react-native';
import { useUI, rowDir } from '../UIContext';
import { Txt } from '../Txt';
import { Icon } from '../Icon';
import { Tap } from '../primitives';

// Bottom tab bar (mf.css `.tabs`). Labels sit under their icons; the selected
// tab is marked by color and weight — the tab bar is navigation, not a choice
// control, so the ✓ selection rule does not apply here.
export const TAB_BAR_CONTENT_HEIGHT = 53;

export function TabBar({ tabs, activeKey, onSelect, bottomInset = 0 }) {
  const { palette, isRtl, lang } = useUI();
  return (
    <View
      style={{
        backgroundColor: palette.screen,
        borderTopWidth: 0.5,
        borderTopColor: palette.border,
        paddingTop: 7,
        paddingHorizontal: 4,
        paddingBottom: 9 + bottomInset,
      }}
    >
      <View style={{ flexDirection: rowDir(isRtl) }} accessibilityRole="tablist">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const label = lang === 'ar' ? tab.labelAr : tab.labelEn;
          const color = active ? 'brand' : 'text4';
          return (
            <Tap
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              style={{ flex: 1, alignItems: 'center' }}
              scale={0.95}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
            >
              <Icon name={tab.icon} size={21} color={color} />
              <Txt variant="tab" color={color} weight={active ? 600 : 400} align="center" style={{ marginTop: 1 }}>
                {label}
              </Txt>
            </Tap>
          );
        })}
      </View>
    </View>
  );
}
