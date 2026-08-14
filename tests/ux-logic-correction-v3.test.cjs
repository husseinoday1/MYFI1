const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || process.cwd());
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (ok, message) => { if (!ok) throw new Error(message); };
const settings = read('src/screens/SettingsScreen.js');
const onboarding = read('src/screens/OnboardingScreen.js');
const trackers = read('src/screens/TrackersLabScreen.js');

// Settings: local profile and cloud account must be visibly separate.
assert(settings.includes("localProfileSection: ar ? 'الملف المحلي'"), 'Missing explicit local-profile section');
assert(settings.includes("cloudDisconnectedTitle: ar ? 'لا يوجد حساب MYFI Cloud مربوط'"), 'Missing explicit disconnected cloud state');
assert(settings.includes('T.localCloudNote'), 'Missing local-vs-cloud explanation');
assert(settings.includes('T.cloudDisconnectedTitle'), 'Cloud disconnected card is not rendered');
assert(settings.includes('T.cloudConnectedTitle'), 'Cloud connected card is not rendered');

// Settings root must be flatter: language/theme/country/currency are direct rows.
const rootStart = settings.indexOf('function RootSettings(');
const accountStart = settings.indexOf('function AccountPage(', rootStart);
assert(rootStart >= 0 && accountStart > rootStart, 'Could not isolate RootSettings');
const rootSettings = settings.slice(rootStart, accountStart);
for (const token of ["onChoice('language')", "onChoice('theme')", "onChoice('country')", "onChoice('currency')"]) {
  assert(rootSettings.includes(token), `Root settings missing direct choice: ${token}`);
}
assert(!rootSettings.includes("onOpen('preferences')"), 'Preferences is still an unnecessary intermediate page');
assert(!rootSettings.includes("onOpen('financial')"), 'Financial setup is still routed through an unnecessary intermediate page');
assert(rootSettings.includes('onPress={onAdvanced}'), 'Financial setup should open the full financial settings directly');

// Account page: local profile first, cloud account as a distinct second area.
const devicesStart = settings.indexOf('function DevicesPage(', accountStart);
const accountPage = settings.slice(accountStart, devicesStart);
assert(accountPage.includes('T.localProfileSection'), 'Account page lacks local-profile section');
assert(accountPage.includes('T.cloudDisconnectedSub'), 'Account page lacks cloud explanation for local-only users');
assert(accountPage.includes('cloudAccountCard'), 'Cloud account is not visually separated into its own card');

// Onboarding: every usage type has a plain-language explanation.
for (const token of ['T.personalDesc', 'T.businessDesc', 'T.mixedDesc']) {
  assert(onboarding.includes(`detail: ${token}`), `Missing choice explanation: ${token}`);
}
assert(onboarding.includes('profileDescription'), 'Selected usage type explanation is not shown on the final onboarding screen');

// Trackers: restore the previous direct-action layout (not the single Add tracker button).
assert(trackers.includes("isAr ? 'إجراءات مباشرة' : 'Direct actions'"), 'Direct actions section was not restored');
for (const type of ["trackerType: 'owed'", "trackerType: 'receivable'", "trackerType: 'goal'", "trackerType: 'commitment'"]) {
  assert(trackers.includes(type), `Missing restored tracker direct action: ${type}`);
}
assert(!trackers.includes('s.addTrackerAction'), 'Single Add tracker UX from V2 is still present');

console.log('MYFI UX LOGIC CORRECTION V3 contract: PASSED');
