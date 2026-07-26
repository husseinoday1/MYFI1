import { Text, TextInput } from 'react-native';
import { FONT_FAMILY } from './tokens';

let applied = false;

export const fontAssets = {
  [FONT_FAMILY]: require('../../assets/fonts/Cairo.ttf'),
};

export const applyGlobalFont = () => {
  if (applied) return;
  applied = true;

  [Text, TextInput].forEach(Component => {
    Component.defaultProps = Component.defaultProps || {};
    const previous = Component.defaultProps.style;
    Component.defaultProps.style = [
      { fontFamily: FONT_FAMILY },
      previous,
    ].filter(Boolean);
  });
};
