import * as ScreenOrientation from 'expo-screen-orientation';

export const ORIENTATION_MODES = ['system', 'auto', 'portrait', 'landscape'];

export const normalizeOrientationMode = (mode) =>
  ORIENTATION_MODES.includes(mode) ? mode : 'system';

export async function applyOrientationMode(mode = 'system') {
  const next = normalizeOrientationMode(mode);

  if (next === 'portrait') {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    );
    return;
  }

  if (next === 'landscape') {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE
    );
    return;
  }

  if (next === 'auto') {
    await ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.ALL
    );
    return;
  }

  // "system": MYFI follows the device/user rotation preference.
  await ScreenOrientation.unlockAsync();
}
