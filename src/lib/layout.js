export const isRTL = (lang = 'ar') => lang === 'ar';

export const textAlignFor = (lang = 'ar') => (isRTL(lang) ? 'right' : 'left');

export const rowDirFor = (lang = 'ar') => (isRTL(lang) ? 'row-reverse' : 'row');

export const writingDirectionFor = (lang = 'ar') => (isRTL(lang) ? 'rtl' : 'ltr');

export const edgeInsetFor = (lang = 'ar', value = 0) => (
  isRTL(lang)
    ? { marginLeft: value, marginRight: 0 }
    : { marginRight: value, marginLeft: 0 }
);

