import { supabase } from './supabase';

const AUTH_SCHEME = 'myfi';

export const getAuthRedirectUrl = (kind = 'confirm') => `${AUTH_SCHEME}://auth/${kind}`;

const callbackKind = (url) => {
  const value = String(url || '').toLowerCase();
  if (value.includes('/recovery')) return 'recovery';
  return 'confirm';
};

const readParams = (rawUrl) => {
  const value = String(rawUrl || '').trim();
  if (!value) return new URLSearchParams();
  const queryStart = value.indexOf('?');
  const hashStart = value.indexOf('#');
  const query = queryStart >= 0
    ? value.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined)
    : '';
  const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : '';
  return new URLSearchParams([query, hash].filter(Boolean).join('&'));
};

export const handleAuthCallback = async (rawUrl) => {
  const url = String(rawUrl || '').trim();
  if (!url.toLowerCase().startsWith(`${AUTH_SCHEME}://auth/`)) {
    return { handled: false };
  }

  const params = readParams(url);
  const callbackError = params.get('error_description') || params.get('error');
  if (callbackError) throw new Error(callbackError);

  const kind = callbackKind(url);
  const code = params.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { handled: true, kind, session: data?.session || null };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw error;
    return { handled: true, kind, session: data?.session || null };
  }

  throw new Error('The authentication link is incomplete or has expired.');
};
