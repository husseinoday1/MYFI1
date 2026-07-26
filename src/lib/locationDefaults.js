import * as Location from 'expo-location';
import { COUNTRIES } from './constants';

const EURO_AREA = new Set([
  'AT', 'BE', 'HR', 'CY', 'EE', 'FI', 'FR', 'DE', 'GR', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PT', 'SK', 'SI', 'ES',
]);

export const matchSupportedCountry = (isoCountryCode = '') => {
  const iso = String(isoCountryCode || '').trim().toUpperCase();
  const code = EURO_AREA.has(iso) ? 'EU' : iso;
  return COUNTRIES.find(country => country.code === code) || null;
};

export const detectLocationDefaults = async () => {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return { ok: false, reason: permission.canAskAgain === false ? 'blocked' : 'denied' };
  }

  const lastKnown = await Location.getLastKnownPositionAsync({
    maxAge: 10 * 60 * 1000,
    requiredAccuracy: 50000,
  });
  const position = lastKnown || await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
    mayShowUserSettingsDialog: true,
  });
  const addresses = await Location.reverseGeocodeAsync({
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
  });
  const address = addresses[0] || null;
  const country = matchSupportedCountry(address?.isoCountryCode);
  if (!country) {
    return {
      ok: false,
      reason: 'unsupported',
      detectedCode: String(address?.isoCountryCode || '').toUpperCase(),
      detectedName: address?.country || '',
    };
  }
  return {
    ok: true,
    country,
    countryCode: country.code,
    currencyCode: country.currency,
    detectedCode: String(address?.isoCountryCode || country.code).toUpperCase(),
  };
};
