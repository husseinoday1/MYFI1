// MaalFlow §111 / threat-model F-02 — screen privacy.
//
// The finding this closes is not really "screenshots". It is that balances and
// transactions sit in the Android recent-apps snapshot, visible to anyone who picks the
// phone up and taps the app switcher — without unlocking the app, so the biometric lock
// in App.js never gets a say. FLAG_SECURE blanks that snapshot.
//
// On Android the same flag also blocks screenshots and screen recording; the platform
// does not let us have one without the other. That is why this is a setting rather than
// a hard rule: a user who wants to screenshot a report should be able to choose that
// trade-off knowingly. The default is protected, because the safe default for a finance
// app is the private one.
//
// Requires a native build. Follows biometric.js in guarding the native import so a
// JS-only runtime (Expo Go before the module ships, web) degrades to a no-op instead of
// crashing at import time.
import { Platform } from 'react-native';

let ScreenCapture = null;
if (Platform.OS !== 'web') {
  try {
    ScreenCapture = require('expo-screen-capture');
  } catch {
    ScreenCapture = null;
  }
}

export const isScreenPrivacySupported = () => !!ScreenCapture;

// cfg.allowScreenshots is the user's opt-out, so protection is on unless they turned it
// off. Reading it this way means an older config that predates the setting is protected
// rather than exposed.
export const screenPrivacyEnabled = cfg => cfg?.allowScreenshots !== true;

// Returns what it actually did, so a caller (and the contract test) can tell the
// difference between "protected" and "asked for protection on a runtime that has none".
export const applyScreenPrivacy = async (cfg) => {
  if (!ScreenCapture) return { applied: false, reason: 'unsupported' };
  const shouldProtect = screenPrivacyEnabled(cfg);
  try {
    if (shouldProtect) {
      await ScreenCapture.preventScreenCaptureAsync();
      return { applied: true, protected: true };
    }
    await ScreenCapture.allowScreenCaptureAsync();
    return { applied: true, protected: false };
  } catch (error) {
    return { applied: false, reason: String(error?.message || error || 'screen_privacy_failed') };
  }
};
