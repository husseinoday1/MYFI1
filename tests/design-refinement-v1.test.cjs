const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const onboarding = read('src/screens/OnboardingScreen.js');
const settings = read('src/screens/SettingsScreen.js');
const legacy = read('src/screens/SettingsLegacyScreen.js');
const identity = read('src/lib/accountIdentity.js');
const deleteModal = read('src/components/AccountDeleteModal.js');

assert(onboarding.includes('dashboardCard'), 'Welcome must show a real MYFI-style financial dashboard visual');
assert(onboarding.includes('insightCard'), 'Second onboarding screen must explain spending insight');
assert(onboarding.includes('cloudVisual') && onboarding.includes('quickSetupCard'), 'Third onboarding screen must combine trust/cloud with quick setup');
assert(onboarding.includes('[0, 1, 2].map') && onboarding.includes("step === 2 ? T.start : T.next"), 'Onboarding must remain exactly three concise steps');
assert(onboarding.includes('finish(true)') && onboarding.includes('demoMode: false'), 'Skip must enter a real non-demo workspace');

assert(settings.includes('function RootSettings'), 'Settings must use a clear index screen');
assert(settings.includes('function AccountPage'), 'Account must be a dedicated detail page');
assert(settings.includes('function DevicesPage'), 'Devices must be a dedicated detail page');
assert(settings.includes('function PreferencesPage'), 'Preferences must be a dedicated detail page');
assert(settings.includes('function FinancialPage'), 'Financial setup must be a dedicated detail page');
assert(settings.includes('function DataPage'), 'Data & Storage must be a dedicated detail page');
assert(settings.includes('function SecurityPage'), 'Privacy & Security must be a dedicated detail page');
assert(settings.includes('MenuGroup') && settings.includes('MenuRow'), 'Settings must use grouped-list information architecture');
assert(settings.includes("system: ar ? 'حسب الجهاز' : 'Follow device'"), 'Device-following terminology must be unified');
assert(settings.includes('SettingsLegacyScreen') && legacy.includes('commitments') && legacy.includes('wallet'), 'Full existing financial configuration must remain reachable in Advanced settings');

assert(settings.includes("supabase.auth.signOut({ scope: 'local' })"), 'Sign out must remain local to this device');
assert(settings.includes("supabase.auth.signOut({ scope: 'others' })"), 'Devices must preserve other-session logout');
assert(settings.includes("supabase.functions.invoke('delete-account'"), 'Account deletion must remain available');
assert(settings.includes('clearVaultSnapshot(namespaceForUser(user))'), 'Account deletion must clear the local user vault');
assert(identity.includes('uploadProfileAvatar') && identity.includes('removeProfileAvatar'), 'Connected profile photo behavior must be preserved');
assert(deleteModal.includes('Delete permanently') && deleteModal.includes('حذف نهائي'), 'Permanent account deletion requires a confirmation modal');

assert(settings.includes('T.guide') && settings.includes('T.about'), 'Settings must keep Guide and About entry points');
assert(settings.includes('EXPO_PUBLIC_MYFI_INSTAGRAM_URL') && settings.includes('EXPO_PUBLIC_MYFI_FACEBOOK_URL'), 'Configured social links must stay available');

console.log('MYFI DESIGN REFINEMENT V1 contract passed.');
