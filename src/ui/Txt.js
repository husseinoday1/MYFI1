import React from 'react';
import { Text } from 'react-native';
import { useUI, startAlign } from './UIContext';
import { TEXT_VARIANTS, baseTextStyle, fontFamilyFor } from './typography';

// The one text primitive for redesigned screens. It applies, in one place:
//  - the chosen font, with the real face for the requested weight;
//  - the global font-size multiplier from settings (sizes and line heights);
//  - palette colors by role name ("text1", "income", ...) or a raw value.
// Never truncates with an ellipsis (glossary rule: no "..." cut-offs), so
// `numberOfLines` is deliberately not defaulted.
export function Txt({
  variant = 'body',
  size,
  weight,
  color,
  align,
  lineHeight,
  style,
  children,
  ...rest
}) {
  const { palette, fontId, fontScale, isRtl } = useUI();
  const base = TEXT_VARIANTS[variant] || TEXT_VARIANTS.body;
  const fontSize = (size ?? base.size) * fontScale;
  const resolvedColor = color ? (palette[color] || color) : palette[base.color];
  return (
    <Text
      {...rest}
      style={[
        baseTextStyle,
        {
          fontFamily: fontFamilyFor(fontId, weight ?? base.weight),
          fontSize,
          color: resolvedColor,
          textAlign: align || startAlign(isRtl),
          writingDirection: isRtl ? 'rtl' : 'ltr',
        },
        lineHeight ? { lineHeight: lineHeight * fontScale } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// Amount text: digits are laid out LTR even inside Arabic so separators and
// the minus sign never reorder.
export function AmountTxt({ style, ...props }) {
  return <Txt {...props} style={[{ writingDirection: 'ltr' }, style]} />;
}
