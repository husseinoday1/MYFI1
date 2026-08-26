import { useStore } from '../store/useStore';
import { TH } from './theme';
import { getSymbol } from './constants';
import { isRTL, textAlignFor, rowDirFor } from './layout';

// Single shared theme-access hook. Replaces the manual `TH[cfg.theme] || TH.dark`
// pattern repeated across 19 screens (see docs/design/03_MYFI_DESIGN_SYSTEM_CANONICAL.md
// §1 — "Confirmed gap, not a redesign"). This is additive only: it does not change
// any screen yet, screens keep working exactly as before until they opt in.
//
// Read-only against the app store — never mutates cfg, never touches financial state.
export function useTheme() {
  const cfg = useStore((state) => state.cfg);
  const th = TH[cfg.theme] || TH.dark;
  const lang = cfg.lang || 'ar';
  return {
    th,
    lang,
    cfg,
    isAr: isRTL(lang),
    align: textAlignFor(lang),
    rowDir: rowDirFor(lang),
    sym: getSymbol(cfg.currency),
  };
}
