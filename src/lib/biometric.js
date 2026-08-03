import { Platform } from 'react-native';

let LocalAuth = null;
if (Platform.OS !== 'web') {
  LocalAuth = require('expo-local-authentication');
}

export const isBiometricSupported = async () => {
  if (!LocalAuth) return false;
  try {
    const hasHw = await LocalAuth.hasHardwareAsync();
    const enrolled = await LocalAuth.isEnrolledAsync();
    return hasHw && enrolled;
  } catch {
    return false;
  }
};

export const authenticate = async (promptMessage) => {
  if (!LocalAuth) return { success: false, error: 'unavailable' };
  try {
    const res = await LocalAuth.authenticateAsync({
      promptMessage: promptMessage || 'تحقق من هويتك',
      disableDeviceFallback: false,
      cancelLabel: 'إلغاء',
    });
    return res;
  } catch (e) {
    return { success: false, error: e.message };
  }
};
