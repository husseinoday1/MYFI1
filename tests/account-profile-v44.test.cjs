const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (c, m) => { if (!c) throw new Error(m); };

const settings = read('src/screens/SettingsScreen.js');
const identity = read('src/lib/accountIdentity.js');
const sync = read('src/store/slices/useSyncSlice.js');
const boundary = read('src/lib/accountWorkspace.js');
const migration = read('supabase/migrations/202608130001_account_profile_identity_v4_4.sql');

assert(settings.includes("profileSyncedSub"), 'Account page must explain synced profile identity');
assert(settings.includes("profileDeviceOnlySub"), 'Account page must explain device-only profile state');
assert(!settings.includes('usernameDraft'), 'Username field must not remain in the account UX');
assert(!settings.includes('phoneDraft'), 'Phone field must not remain in the account UX');
assert(settings.includes('signUpProfileHint'), 'Signup must explain that name/photo follow the account');
assert(settings.includes('signInProfileHint'), 'Signin must explain profile restoration');
assert(identity.includes('ensureProfileIdentity'), 'Cloud profile hydration helper missing');
assert(identity.includes('uploadProfileAvatar'), 'Cloud avatar upload helper missing');
assert(identity.includes('fetchProfileIdentity'), 'Cloud profile fetch helper missing');
assert(
  sync.includes('const hydrateProfile = async (fallbackIdentity = {}) =>')
    && sync.includes('ensureProfileIdentity(supabase, user, fallbackIdentity)')
    && sync.includes('await hydrateProfile(priorIdentity)'),
  'New-device profile hydration is not wired',
);
assert(sync.includes('workspaceNamespaceForSession'), 'User/workspace boundary is not wired');
assert(boundary.includes('workspace:${id}'), 'Future workspace namespace boundary missing');
assert(migration.includes('public.profiles'), 'profiles migration missing');
assert(migration.includes('myfi-avatars'), 'avatar bucket migration missing');
assert(migration.includes('workspace_id / workspace_members'), 'future room boundary note missing');
console.log('MYFI ACCOUNT PROFILE ARCHITECTURE V4.4: PASSED');
