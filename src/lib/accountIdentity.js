const RESERVED_USERNAMES = new Set(['admin', 'support', 'myfi', 'root', 'system']);

export const cleanDisplayName = (value = '') => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .slice(0, 48);

export const normalizeUsername = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/^@+/, '')
  .replace(/[^a-z0-9_]/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 24);

export const isValidUsername = (value = '') => {
  const username = normalizeUsername(value);
  return username.length >= 3
    && username.length <= 24
    && /^[a-z0-9_]+$/.test(username)
    && !RESERVED_USERNAMES.has(username);
};

export const normalizePhone = (value = '') => String(value || '')
  .trim()
  .replace(/[^\d+]/g, '')
  .slice(0, 18);

export const deriveUsername = ({ user, cfg } = {}) => {
  const metadata = user?.user_metadata || {};
  const emailStem = String(user?.email || '').split('@')[0];
  const candidate = cfg?.username || metadata.username || metadata.preferred_username || emailStem || 'myfi_user';
  const normalized = normalizeUsername(candidate);
  return isValidUsername(normalized) ? normalized : 'myfi_user';
};

export const deriveDisplayName = ({ user, cfg } = {}) => {
  const metadata = user?.user_metadata || {};
  const fromCfg = cleanDisplayName(cfg?.displayName || cfg?.name);
  const fromUser = cleanDisplayName(metadata.full_name || metadata.name || metadata.displayName);
  const fromEmail = cleanDisplayName(String(user?.email || '').split('@')[0]);
  return fromCfg || fromUser || fromEmail || 'MYFI';
};

export const accountPublicId = ({ user, cfg } = {}) => `@${deriveUsername({ user, cfg })}`;

export const accountIdentityPatch = ({ displayName, username, phone, consentAccepted } = {}) => {
  const patch = {};
  const name = cleanDisplayName(displayName);
  const userName = normalizeUsername(username);
  const phoneValue = normalizePhone(phone);
  if (name) patch.displayName = name;
  if (userName) patch.username = userName;
  if (phoneValue) patch.phone = phoneValue;
  if (consentAccepted !== undefined) patch.accountConsentAccepted = !!consentAccepted;
  return patch;
};

export const isProfileSchemaError = (error) => /schema cache|column .*profiles|could not find the .*column/i.test(String(error?.message || error || ''));

// Keep local sign-in usable while an older Supabase project is waiting for the identity migration.
export const upsertProfileIdentity = async (client, id, patch = {}) => {
  if (!client || !id) return { error: null, skipped: true };
  const payload = {
    id,
    display_name: cleanDisplayName(patch.displayName),
    username: normalizeUsername(patch.username),
    phone: normalizePhone(patch.phone) || null,
  };
  const result = await client.from('profiles').upsert(payload);
  if (!result.error) return result;
  if (!isProfileSchemaError(result.error)) return result;
  const fallback = await client.from('profiles').upsert({ id, display_name: payload.display_name });
  return { ...fallback, warning: result.error };
};
