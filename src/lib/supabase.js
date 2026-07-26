import { AppState, Platform } from 'react-native';
import { createClient, processLock } from '@supabase/supabase-js';
import { secureAuthStorage } from './secureVault';

export const SUPABASE_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
export const SUPABASE_KEY = String(process.env.EXPO_PUBLIC_SUPABASE_KEY || '').trim();
export const isSupabaseConfigured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL) && SUPABASE_KEY.length > 20;

// createClient requires non-empty values even while the app is used offline.
const clientUrl = isSupabaseConfigured ? SUPABASE_URL : 'https://offline.invalid';
const clientKey = isSupabaseConfigured ? SUPABASE_KEY : 'offline-public-key';

export const supabase = createClient(clientUrl, clientKey, {
  auth: {
    storage: secureAuthStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    lock: processLock,
  },
});

export const checkSupabaseHealth = async (timeoutMs = 6000) => {
  if (!isSupabaseConfigured) return { ok: false, reason: 'not_configured' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
      signal: controller.signal,
    });
    return response.ok
      ? { ok: true }
      : { ok: false, reason: 'server_error', status: response.status };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeout);
  }
};

if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
