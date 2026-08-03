const configuredMode = String(process.env.EXPO_PUBLIC_NORMALIZED_READ_MODE || 'off')
  .trim()
  .toLowerCase();

export const NORMALIZED_READ_MODE = ['preview', 'shadow'].includes(configuredMode)
  ? configuredMode
  : 'off';

export const normalizedPreviewEnabled = NORMALIZED_READ_MODE !== 'off';
export const normalizedShadowEnabled = NORMALIZED_READ_MODE === 'shadow';
