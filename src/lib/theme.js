export const BRAND_GREEN = '#138A57';

// Semantic financial roles are independently assignable, even where two of them
// currently resolve to the same literal. Per 04_MYFI_DESIGN_TOKEN_CATALOG.md:
// changing the brand color must never silently change the income color, and
// destructive-action red must be able to diverge from expense red later without
// touching either call site.
export const INCOME_GREEN = BRAND_GREEN;

export const TH = {
  light: {
    bg: '#F4F6F5',
    card: '#FFFFFF',
    cardHigh: '#ECEFED',
    input: '#F2F4F3',
    nav: '#FFFFFF',

    primary: BRAND_GREEN,
    onPrimary: '#FFFFFF',
    primaryContainer: '#DCEFE5',
    onPrimaryContainer: '#143326',
    primSoft: 'rgba(22,155,98,0.12)',

    inc: INCOME_GREEN,
    incBg: 'rgba(22,155,98,0.12)',
    exp: '#C74F5C',
    expBg: 'rgba(199,79,92,0.11)',
    warn: '#A96E0A',
    warnBg: 'rgba(169,110,10,0.12)',

    // Transfers are never income or expense — they need a hue in neither family.
    transfer: '#2F6F9F',
    transferBg: 'rgba(47,111,159,0.12)',
    // Destructive actions, kept distinct from both expense red and warning amber.
    danger: '#A6212E',
    dangerBg: 'rgba(166,33,46,0.12)',
    onDanger: '#FFFFFF',
    // Generic positive/neutral indicators outside a strict income/expense context
    // (goal progress, completion). Alias income until evidence requires a split.
    positive: INCOME_GREEN,
    positiveBg: 'rgba(22,155,98,0.12)',
    neutral: '#5D6962',
    neutralBg: 'rgba(93,105,98,0.10)',

    text: '#142019',
    sub: '#5D6962',
    faint: '#758079',
    border: 'rgba(20,32,25,0.12)',
    overlay: 'rgba(12,18,15,0.22)',
    statusBar: 'dark-content',

    cardAlt: '#ECEFED',
    muted: '#ECEFED',
    onPrim: '#FFFFFF',
  },
  dark: {
    bg: '#0D1110',
    card: '#161B19',
    cardHigh: '#202622',
    input: '#1B211E',
    nav: '#121714',

    primary: BRAND_GREEN,
    onPrimary: '#FFFFFF',
    primaryContainer: '#15382A',
    onPrimaryContainer: '#F3FBF7',
    primSoft: 'rgba(22,155,98,0.18)',

    inc: INCOME_GREEN,
    incBg: 'rgba(22,155,98,0.18)',
    exp: '#E06B76',
    expBg: 'rgba(224,107,118,0.14)',
    warn: '#D99A31',
    warnBg: 'rgba(217,154,49,0.14)',

    transfer: '#6BA8D8',
    transferBg: 'rgba(107,168,216,0.16)',
    danger: '#F4796F',
    dangerBg: 'rgba(244,121,111,0.16)',
    onDanger: '#1A0B0A',
    positive: INCOME_GREEN,
    positiveBg: 'rgba(22,155,98,0.18)',
    neutral: '#A4ADA7',
    neutralBg: 'rgba(164,173,167,0.14)',

    text: '#F2F5F3',
    sub: '#A4ADA7',
    faint: '#818B84',
    border: 'rgba(197,207,201,0.18)',
    overlay: 'rgba(5,8,6,0.80)',
    statusBar: 'light-content',

    cardAlt: '#202622',
    muted: '#202622',
    onPrim: '#FFFFFF',
  },
};
