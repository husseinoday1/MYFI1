import { PALETTE } from '../ui/palette';

// Legacy theme map (`th.*`) used by every screen that predates the 2026-09-11
// redesign. Its keys are kept stable so un-rebuilt screens keep working, but
// every value now resolves from the approved palette in src/ui/palette.js —
// the app shows one color system while screens are rebuilt one by one.
//
// Semantic roles stay independently assignable: brand, income, expense,
// danger and positive are separate keys even where two resolve to the same
// literal, so changing one never silently changes another.
const P = PALETTE;

export const BRAND_GREEN = P.light.brand;
export const INCOME_GREEN = P.light.income;

const legacyKeys = (p) => ({
  bg: p.page,
  card: p.card,
  cardHigh: p.inset,
  input: p.soft,
  nav: p.screen,

  primary: p.brand,
  onPrimary: p.onBrand,
  primaryContainer: p.brandTint,
  onPrimaryContainer: p.text1,
  primSoft: p.brandTint,

  inc: p.income,
  incBg: p.incomeTint,
  exp: p.expense,
  expBg: p.expenseTint,
  warn: p.due,
  warnBg: p.dueTint,

  // Transfers are never income or expense — they need a hue in neither family.
  transfer: p.transfer,
  transferBg: p.transferTint,
  // The board draws destructive actions in the expense role (mf.css `.danger`).
  danger: p.expense,
  dangerBg: p.expenseTint,
  onDanger: p.onBrand,
  positive: p.income,
  positiveBg: p.incomeTint,
  neutral: p.text3,
  neutralBg: p.inset,

  text: p.text1,
  sub: p.text3,
  faint: p.text4,
  border: p.border,
  overlay: p.scrim,
  statusBar: p.statusBar,

  cardAlt: p.inset,
  muted: p.inset,
  onPrim: p.onBrand,

  // Redesign roles, exposed on `th` so rebuilt screens need one theme object.
  screen: p.screen,
  soft: p.soft,
  inset: p.inset,
  text2: p.text2,
  typed: p.typed,
  primaryPressed: p.brandPressed,
  info: p.info,
  infoBg: p.infoTint,
  pro: p.pro,
  proBg: p.proTint,
  toast: p.toast,
  toastLink: p.toastLink,
  skeleton: p.skeleton,
});

export const TH = {
  light: legacyKeys(P.light),
  dark: legacyKeys(P.dark),
};
