import React from 'react';
import { View } from 'react-native';
import PressableScale from '../components/PressableScale';
import { useUI, rowDir } from './UIContext';
import { Txt } from './Txt';

// Horizontal row that follows the language direction (the shell stays LTR and
// Arabic rows are mirrored explicitly — see App.js `dirStyle`).
export function Row({ style, children, ...rest }) {
  const { isRtl } = useUI();
  return (
    <View {...rest} style={[{ flexDirection: rowDir(isRtl), alignItems: 'center' }, style]}>
      {children}
    </View>
  );
}

// Pressable with the app's existing press feedback (scale + selection haptic).
export function Tap({ children, style, haptic = 'selection', scale = 0.97, ...rest }) {
  return (
    <PressableScale {...rest} style={style} haptic={haptic} scale={scale}>
      {children}
    </PressableScale>
  );
}

// Round initial avatar (home.html `.avatar-sm` 32px, tools.html `.avatar` 42px).
export function Avatar({ name, size = 32 }) {
  const { palette } = useUI();
  const initial = String(name || '').trim().charAt(0).toUpperCase() || 'M';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: palette.brandTint,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Txt size={size >= 40 ? 18 : 14} weight={600} color="brand" align="center">{initial}</Txt>
    </View>
  );
}
