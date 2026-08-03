export const resolveSystemTheme = (colorScheme, fallback = 'dark') => {
  if (colorScheme === 'dark') return 'dark';
  if (colorScheme === 'light') return 'light';
  return fallback === 'light' ? 'light' : 'dark';
};
