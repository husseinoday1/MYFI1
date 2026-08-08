import { Platform, Text, TextInput } from 'react-native';
import { FONT_FAMILY } from './tokens';

let applied = false;

export const fontAssets = {
  [FONT_FAMILY]: require('../../assets/fonts/Cairo.ttf'),
};

const baseFontStyle = {
  fontFamily: FONT_FAMILY,
  ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
};

export const applyGlobalFont = () => {
  if (applied) return;
  applied = true;

  [Text, TextInput].forEach(Component => {
    Component.defaultProps = Component.defaultProps || {};
    const previous = Component.defaultProps.style;
    Component.defaultProps.style = [
      baseFontStyle,
      previous,
    ].filter(Boolean);
  });
};
