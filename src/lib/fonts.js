import { Platform, Text, TextInput } from 'react-native';
import { FONT_FAMILY } from './tokens';

// Every bundled face, registered as its own family (see src/ui/typography.js).
export { fontAssets } from '../ui/typography';

let applied = false;

const baseFontStyle = {
  fontFamily: FONT_FAMILY,
  ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
};

// Best-effort default for legacy <Text>. React 19's JSX runtime no longer
// applies `defaultProps` to function components such as Text, so this may be
// a no-op; redesigned screens use <Txt> (src/ui/Txt.js), which sets the font
// explicitly and does not depend on it.
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
