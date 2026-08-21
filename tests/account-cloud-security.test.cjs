const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const identity = read('src/lib/accountIdentity.js');
const sync = read('src/store/slices/useSyncSlice.js');
const settings = read('src/screens/SettingsScreen.js');
const constants = read('src/lib/constants.js');
const deleteModal = read('src/components/AccountDeleteModal.js');
const migration = read('supabase/migrations/202608120002_profile_avatar_and_identity.sql');
const edge = read('supabase/functions/delete-account/index.ts');
const srcTree = [
  identity,
  sync,
  settings,
  constants,
  read('src/lib/supabase.js'),
].join('\n');

assert(identity.includes("PROFILE_AVATAR_BUCKET = 'myfi-avatars'"), 'Profile avatars need one dedicated bucket');
assert(identity.includes('fetchProfileIdentity'), 'A connected account must fetch its cloud profile');
assert(identity.includes('uploadProfileAvatar') && identity.includes('removeProfileAvatar'), 'Avatar must support cloud upload/remove');
assert(
  sync.includes('const hydrateProfile = async (fallbackIdentity = {}) =>')
    && sync.includes('ensureProfileIdentity(supabase, user, fallbackIdentity)')
    && sync.includes('hydrateProfileWhenSafe(priorIdentity)'),
  'New-device login must hydrate or seed cloud identity through the account identity boundary',
);
assert(identity.includes('const fetched = await fetchProfileIdentity(client, user.id)'), 'The account identity boundary must fetch the cloud profile before seeding it');
assert(sync.includes('normalizeCfg({ ...get().cfg, ...profile.patch })'), 'Profile hydration must merge into current app config, not replace it');
assert(constants.includes("avatarPath: ''"), 'Avatar storage path must persist locally for the connected profile');
assert(settings.includes("supabase.auth.updateUser"), 'Connected identity should also refresh auth metadata as a fallback');
assert(settings.includes("supabase.functions.invoke('delete-account'"), 'Delete account must call a server-side endpoint');
assert(settings.includes('signInWithPassword({ email: user.email, password })'), 'Delete account must re-authenticate');
assert(
  settings.includes('cleanupDeletedAccountLocalNamespace(localPreservation?.accountNamespace)'),
  'Deleted account cleanup must target the captured account namespace after preserving guest data',
);
assert(deleteModal.includes('حذف نهائي') && deleteModal.includes('Delete permanently'), 'Deletion requires a second explicit confirmation');

assert(migration.includes('add column if not exists username text'), 'Migration must ensure username exists');
assert(migration.includes('add column if not exists phone text'), 'Migration must ensure phone exists');
assert(migration.includes('add column if not exists avatar_path text'), 'Migration must persist avatar path');
assert(migration.includes("'myfi-avatars'"), 'Migration must create/configure avatar bucket');
assert(migration.includes('myfi_avatar_select_own') && migration.includes('myfi_avatar_delete_own'), 'Avatar RLS policies are required');
assert(migration.includes('(storage.foldername(name))[1] = (select auth.uid())::text'), 'Avatar policies must scope files to the signed-in user');

assert(edge.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Delete endpoint requires server-side admin privileges');
assert(edge.includes('auth.getUser()'), 'Delete endpoint must verify the caller');
assert(edge.includes('auth.admin.deleteUser(user.id)'), 'Delete endpoint must delete the authenticated account');
assert.equal(srcTree.includes('SUPABASE_SERVICE_ROLE_KEY'), false, 'Service-role secret must never exist in mobile source');

console.log('MYFI cloud profile and account security contract passed.');
