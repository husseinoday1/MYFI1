// Central product identity boundary. Keep export/report branding in one place so
// a future Arabic product rename can be applied without hunting through files.
export const PRODUCT_NAME = 'MYFI';
export const PRODUCT_FILE_PREFIX = 'MYFI';
export const PRODUCT_TAGLINE_AR = 'أموالك. بياناتك. قرارك.';
export const PRODUCT_TAGLINE_EN = 'Your money. Your data. Your decision.';

export const productLabel = (lang = 'ar') => (
  lang === 'ar' ? `${PRODUCT_NAME} · ${PRODUCT_TAGLINE_AR}` : `${PRODUCT_NAME} · ${PRODUCT_TAGLINE_EN}`
);
