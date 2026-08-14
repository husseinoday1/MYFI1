const RESERVED_USERNAMES = new Set(['admin', 'support', 'myfi', 'root', 'system']);
export const PROFILE_AVATAR_BUCKET = 'myfi-avatars';

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
  const legacyName = cleanDisplayName(cfg?.name);
  const fromCfg = cleanDisplayName(cfg?.displayName || (/^(المستخدم|user)$/i.test(legacyName) ? '' : legacyName));
  const fromUser = cleanDisplayName(metadata.full_name || metadata.name || metadata.displayName);
  const fromEmail = cleanDisplayName(String(user?.email || '').split('@')[0]);
  return fromCfg || fromUser || fromEmail || 'MYFI';
};

export const accountPublicId = ({ user, cfg } = {}) => `@${deriveUsername({ user, cfg })}`;

export const accountIdentityPatch = ({ displayName, username, phone, consentAccepted, avatarUri, avatarPath } = {}) => {
  const patch = {};
  const name = cleanDisplayName(displayName);
  const userName = normalizeUsername(username);
  const phoneValue = normalizePhone(phone);
  if (name) patch.displayName = name;
  if (userName) patch.username = userName;
  if (phone !== undefined) patch.phone = phoneValue;
  if (avatarUri !== undefined) patch.avatarUri = String(avatarUri || '').trim().slice(0, 2048);
  if (avatarPath !== undefined) patch.avatarPath = String(avatarPath || '').trim().slice(0, 512);
  if (consentAccepted !== undefined) patch.accountConsentAccepted = !!consentAccepted;
  return patch;
};

export const isProfileSchemaError = (error) => /schema cache|column .*profiles|could not find the .*column/i.test(String(error?.message || error || ''));

const profilePayload = (id, patch = {}) => {
  const payload = { id };
  if (patch.displayName !== undefined) payload.display_name = cleanDisplayName(patch.displayName) || null;
  if (patch.username !== undefined) payload.username = normalizeUsername(patch.username) || null;
  if (patch.phone !== undefined) payload.phone = normalizePhone(patch.phone) || null;
  if (patch.avatarPath !== undefined) payload.avatar_path = String(patch.avatarPath || '').trim() || null;
  return payload;
};

// Keep login usable while a Supabase project is waiting for the newest profile migration.
export const upsertProfileIdentity = async (client, id, patch = {}) => {
  if (!client || !id) return { error: null, skipped: true };

  const payload = profilePayload(id, patch);
  const candidates = [
    payload,
    Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'avatar_path')),
    Object.fromEntries(Object.entries(payload).filter(([key]) => !['avatar_path', 'phone'].includes(key))),
    Object.fromEntries(Object.entries(payload).filter(([key]) => ['id', 'display_name'].includes(key))),
    { id },
  ];

  let schemaWarning = null;
  const seen = new Set();
  for (const candidate of candidates) {
    const signature = JSON.stringify(candidate);
    if (seen.has(signature)) continue;
    seen.add(signature);
    const result = await client.from('profiles').upsert(candidate);
    if (!result.error) {
      return schemaWarning ? { ...result, warning: schemaWarning, degraded: true } : result;
    }
    if (!isProfileSchemaError(result.error)) return result;
    schemaWarning ||= result.error;
  }

  return { error: schemaWarning, warning: schemaWarning, degraded: true };
};

const signAvatar = async (client, path) => {
  if (!client || !path) return '';
  const { data, error } = await client.storage.from(PROFILE_AVATAR_BUCKET).createSignedUrl(path, 60 * 60 * 24 * 30);
  if (error) return '';
  return String(data?.signedUrl || '');
};

export const fetchProfileIdentity = async (client, id) => {
  if (!client || !id) return { patch: {}, error: null, skipped: true };

  const candidates = [
    'display_name,username,phone,avatar_path',
    'display_name,username,phone',
    'display_name,username',
    'display_name',
  ];
  let schemaWarning = null;

  for (const select of candidates) {
    const result = await client.from('profiles').select(select).eq('id', id).maybeSingle();
    if (result.error) {
      if (!isProfileSchemaError(result.error)) return { patch: {}, error: result.error };
      schemaWarning ||= result.error;
      continue;
    }

    const row = result.data || {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(row, 'display_name')) patch.displayName = cleanDisplayName(row.display_name);
    if (Object.prototype.hasOwnProperty.call(row, 'username')) patch.username = normalizeUsername(row.username);
    if (Object.prototype.hasOwnProperty.call(row, 'phone')) patch.phone = normalizePhone(row.phone);
    if (Object.prototype.hasOwnProperty.call(row, 'avatar_path')) {
      patch.avatarPath = String(row.avatar_path || '');
      patch.avatarUri = row.avatar_path ? await signAvatar(client, row.avatar_path) : '';
    }
    return { patch, error: null, warning: schemaWarning, degraded: !!schemaWarning, exists: !!result.data };
  }

  return { patch: {}, error: schemaWarning, warning: schemaWarning, degraded: true, exists: false };
};

export const uploadProfileAvatar = async (client, id, asset) => {
  if (!client || !id || !asset?.uri) throw new Error('avatar_invalid');
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('avatar_read_failed');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength) throw new Error('avatar_empty');
  if (bytes.byteLength > 5 * 1024 * 1024) throw new Error('avatar_too_large');

  const path = `${id}/avatar`;
  const contentType = String(asset.mimeType || 'image/jpeg').startsWith('image/') ? asset.mimeType : 'image/jpeg';
  const { error: uploadError } = await client.storage.from(PROFILE_AVATAR_BUCKET).upload(path, bytes, {
    contentType,
    cacheControl: '3600',
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const profile = await upsertProfileIdentity(client, id, { avatarPath: path });
  if (profile.error) throw profile.error;
  const avatarUri = await signAvatar(client, path);
  return { avatarPath: path, avatarUri };
};

export const removeProfileAvatar = async (client, id, currentPath = '') => {
  if (!client || !id) return { avatarPath: '', avatarUri: '' };
  const path = String(currentPath || `${id}/avatar`).trim();
  if (path) {
    const { error } = await client.storage.from(PROFILE_AVATAR_BUCKET).remove([path]);
    if (error && !/not found/i.test(String(error.message || error))) throw error;
  }
  const profile = await upsertProfileIdentity(client, id, { avatarPath: '' });
  if (profile.error) throw profile.error;
  return { avatarPath: '', avatarUri: '' };
};

const metadataDisplayName = (user = {}) => cleanDisplayName(
  user?.user_metadata?.full_name
  || user?.user_metadata?.displayName
  || user?.user_metadata?.name
  || '',
);

const isLocalAvatarUri = value => /^(file|content):/i.test(String(value || ''));

// Identity is an account domain, not a financial-workspace domain. If a cloud
// profile already exists it always wins on sign-in. If it does not exist yet,
// seed it from auth metadata / the device profile once, then keep it in profiles.
export const ensureProfileIdentity = async (client, user, fallback = {}) => {
  if (!client || !user?.id) return { patch: {}, error: null, skipped: true };

  const fetched = await fetchProfileIdentity(client, user.id);
  if (fetched.error && !fetched.degraded) return fetched;
  if (fetched.exists) return fetched;

  const seedName = metadataDisplayName(user) || cleanDisplayName(fallback.displayName);
  const seedPatch = {
    ...(seedName ? { displayName: seedName } : {}),
  };
  if (Object.keys(seedPatch).length) {
    const seeded = await upsertProfileIdentity(client, user.id, seedPatch);
    if (seeded.error && !seeded.degraded) return { patch: seedPatch, error: seeded.error };
  }

  if (!fallback.avatarPath && isLocalAvatarUri(fallback.avatarUri)) {
    try {
      await uploadProfileAvatar(client, user.id, { uri: fallback.avatarUri, mimeType: 'image/jpeg' });
    } catch (error) {
      console.warn('[PROFILE] deferred avatar upload', error);
    }
  }

  const refreshed = await fetchProfileIdentity(client, user.id);
  if (refreshed.exists) return refreshed;
  return { patch: seedPatch, error: refreshed.error || null, degraded: !!refreshed.degraded, exists: false };
};
