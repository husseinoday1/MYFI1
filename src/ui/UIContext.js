import React, { createContext, useContext, useMemo } from 'react';
import { paletteFor } from './palette';
import { DEFAULT_FONT_ID, clampFontScale } from './typography';

// Presentation settings for redesigned components, provided once at the app
// root. Components read this context instead of subscribing to the store:
// Phase 15 traced multi-second JS-thread stalls to broad store subscriptions,
// and a text primitive rendered hundreds of times per screen must not add a
// store listener each. The value only changes when a presentation setting does.
const fallback = {
  theme: 'light',
  palette: paletteFor('light'),
  lang: 'ar',
  isRtl: true,
  fontId: DEFAULT_FONT_ID,
  fontScale: 1,
};

const UIContext = createContext(fallback);

export function UIProvider({ theme, lang, fontId, fontScale, children }) {
  const value = useMemo(() => {
    const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
    const resolvedLang = lang || 'ar';
    return {
      theme: resolvedTheme,
      palette: paletteFor(resolvedTheme),
      lang: resolvedLang,
      isRtl: resolvedLang === 'ar',
      fontId: fontId || DEFAULT_FONT_ID,
      fontScale: clampFontScale(fontScale ?? 1),
    };
  }, [theme, lang, fontId, fontScale]);
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export const useUI = () => useContext(UIContext);

// Row direction and text start edge. The app does not force native RTL
// (I18nManager); layout direction is chosen per language, matching src/lib/layout.js.
export const rowDir = (isRtl) => (isRtl ? 'row-reverse' : 'row');
export const startAlign = (isRtl) => (isRtl ? 'right' : 'left');
