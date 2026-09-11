import React, { memo } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useUI } from './UIContext';
import { ICON_NODES } from './iconNodes';

// Tabler outline icon, drawn exactly as on the design board (24px grid,
// round caps/joins, stroke 2). `color` is a palette role or a raw color.
// Directional icons (chevrons, arrows) are NOT auto-mirrored: callers choose
// the direction that matches the language, as the board does.
function IconImpl({ name, size = 20, color = 'text3', strokeWidth = 2, style }) {
  // Icons keep their designed size: the font-size setting scales text only.
  const { palette } = useUI();
  const nodes = ICON_NODES[name];
  if (!nodes) {
    if (__DEV__) console.warn(`[MaalFlow] unknown icon "${name}" — add it to tools/ui-icons.txt`);
    return null;
  }
  const stroke = palette[color] || color;
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {nodes.map(([, attrs], index) => (
        // Icons never reorder, so the index is a stable key.
        <Path key={index} d={attrs.d} />
      ))}
    </Svg>
  );
}

export const Icon = memo(IconImpl);
