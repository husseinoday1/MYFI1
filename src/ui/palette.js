// MaalFlow color system — the single source of color values for the app.
//
// Values are copied verbatim from the approved design board (2026-09-11):
//   MaalFlow-Design-Board/colors.html  (light palette, dark swatches)
//   MaalFlow-Design-Board/mf.css       (`.screen.dark` — full dark token set)
// Do not invent or "tune" values here. If a role is missing, add it to the
// board first, then copy it. Roles are semantic, never per-category.
//
// Distribution rule from colors.html: neutral surfaces ~60% of a screen, brand
// ~10% and only for buttons/selected states — never for amounts. Amounts use
// the semantic income/expense/due roles.

export const PALETTE = {
  light: {
    // Neutral surfaces. Phone frames on the board paint the screen with `screen`
    // (white) and group soft blocks (hero, segmented track, soft card) on `soft`.
    screen: '#FFFFFF',
    page: '#F6F8F7',
    soft: '#F6F8F7',
    card: '#FFFFFF',
    inset: '#EDF1EF',
    border: '#E3E8E6',

    // Brand identity — buttons and selected states only.
    brand: '#0A5C4C',
    brandTint: '#EAF4F0',
    brandPressed: '#083F35',
    onBrand: '#FFFFFF',

    // Semantic roles, independent of the brand.
    income: '#2E7D32',
    incomeTint: '#E8F3E9',
    expense: '#B0342A',
    expenseTint: '#FBEAE7',
    due: '#9A6209',
    dueTint: '#FDF3E2',
    transfer: '#5A6A66',
    transferTint: '#EDF1EF',
    info: '#1B5E9E',
    infoTint: '#E8F0F8',
    pro: '#6B4FA8',
    proTint: '#EFEAF8',

    // Four text tiers: amount/heading, chosen value, label, hint.
    text1: '#16201D',
    text2: '#33423E',
    text3: '#5A6A66',
    text4: '#6E7C78',
    typed: '#46554F',

    // Undo toast uses the pressed brand surface (colors.html "مضغوط · إشعار التراجع").
    toast: '#083F35',
    toastLink: '#9FE3CF',
    scrim: 'rgba(10,25,21,0.38)',
    skeleton: '#EEF2F0',
    statusBar: 'dark-content',
  },
  dark: {
    // Dark UI elevation: the embedded surface is lighter than the card.
    screen: '#1A201E',
    page: '#1A201E',
    soft: '#212B27',
    card: '#1A201E',
    inset: '#212B27',
    border: '#333F3A',

    brand: '#2E9B7E',
    brandTint: '#1B3A32',
    brandPressed: '#2E9B7E',
    onBrand: '#06130F',

    income: '#4CAF6A',
    incomeTint: '#18301A',
    expense: '#E8776B',
    expenseTint: '#3A1C19',
    due: '#D9A03C',
    dueTint: '#33270F',
    transfer: '#93A29E',
    transferTint: '#212B27',
    info: '#6FA8E0',
    infoTint: '#152636',
    // The board defines no dark Pro value; the light value is kept (used only
    // as a solid badge fill with white text) and the tint falls back to the
    // embedded surface until one is drawn.
    pro: '#6B4FA8',
    proTint: '#212B27',

    text1: '#E9F0ED',
    text2: '#CFDAD6',
    text3: '#93A29E',
    text4: '#7A8D87',
    typed: '#C4D1CC',

    toast: '#083F35',
    toastLink: '#9FE3CF',
    // Not drawn on the board; keeps the app's existing dark overlay value.
    scrim: 'rgba(5,8,6,0.80)',
    skeleton: '#212B27',
    statusBar: 'light-content',
  },
};

export const paletteFor = (theme) => PALETTE[theme] || PALETTE.light;
