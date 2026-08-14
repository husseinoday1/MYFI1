const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
const homeCenter = fs.readFileSync(path.join(root, 'src/components/HomeCenterModal.js'), 'utf8');

const region = (startMarker, endMarker) => {
  const start = settings.indexOf(startMarker);
  const end = settings.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0, `Missing region start: ${startMarker}`);
  assert(end > start, `Missing region end: ${endMarker}`);
  return settings.slice(start, end);
};

// One visible account identity, not a profile card plus a second cloud-account card.
assert(settings.includes("account: ar ? 'الحساب' : 'Account'"), 'Account page title must be simple and unified');
assert(settings.includes("yourInfo: ar ? 'معلوماتك' : 'Your information'"), 'Unified information section missing');
assert(settings.includes("accountSecurity: ar ? 'الحساب والأمان' : 'Account & security'"), 'Account/security section missing');
assert(settings.includes("syncDevices: ar ? 'المزامنة والأجهزة' : 'Sync & devices'"), 'Sync/devices section missing');

const rootSettings = region('function RootSettings(', '\nfunction AccountPage(');
assert(rootSettings.includes('s.accountCard'), 'Root settings must expose one account card');
assert(!rootSettings.includes('title={T.myfiAccountTitle}'), 'Root settings must not show MYFI account as a second account row');
assert(rootSettings.includes('user ? (accountEmail || T.connectedToMyfi) : T.savedOnDevice'), 'Account card must change state without changing identity');

const accountPage = region('function AccountPage(', '\nfunction DevicesPage(');
assert(!accountPage.includes('text={T.yourInfo}'), 'Account page must not repeat the identity in a separate Your information section');
assert(accountPage.includes('T.accountSecurity'), 'Connected account must expose security in the same page');
assert(accountPage.includes('T.syncDevices'), 'Connected account must expose sync/devices in the same page');
assert(accountPage.includes('T.connectAccount'), 'Unconnected account must expose a connect action');
assert(!accountPage.includes('text={T.myfiAccountTitle}'), 'Account page must not render a second MYFI Account section');
assert(!accountPage.includes('s.cloudAccountCard'), 'Account page must not visually split identity into a cloud-account card');
assert(accountPage.includes('accountEmail || T.connectedToMyfi'), 'Connected account must show the account email within the same identity hero');
assert.equal((accountPage.match(/T\.savedOnDevice/g) || []).length, 1, 'Local status should appear once in the hero, not as duplicate text and pill');


// Home account center follows the same one-identity rule.
assert.equal(homeCenter.includes('localIdentity'), false, 'Home account center must not show a Local identity label');
assert.equal(homeCenter.includes('connectedIdentity'), false, 'Home account center must not show MYFI account as a second identity type');
assert.equal(homeCenter.includes('profileHandle'), false, 'Home account center must not invent a username/handle');
assert.equal(homeCenter.includes('getOrCreateDeviceId'), false, 'Device-local technical IDs must stay out of account UX');
assert(homeCenter.includes("connectedAccount && user?.email ? user.email : L.local"), 'Home account center must keep one identity and switch only the account state');
assert(homeCenter.includes('{connectedAccount ? (') && homeCenter.includes('onPress={syncCloud}'), 'Sync action must only render for a connected account');

// Device following is a note/source, never the setting value shown in Settings.
assert(settings.includes("const languageValue = cfg.lang === 'ar' ? T.arabic : T.english;"), 'Language row must show the resolved language');
assert(settings.includes("const themeValue = cfg.theme === 'dark' ? T.dark : T.light;"), 'Theme row must show the resolved appearance');
assert(settings.includes("const languageNote = cfg.langMode === 'system' ? T.followsDevice : null;"), 'Language must show device-following as a note');
assert(settings.includes("const themeNote = cfg.themeMode === 'system' ? T.followsDevice : null;"), 'Theme must show device-following as a note');
assert(!settings.includes("cfg.langMode === 'system' ? T.system"), 'Follow-device must not replace the visible language value');
assert(!settings.includes("cfg.themeMode === 'system' ? T.system"), 'Follow-device must not replace the visible theme value');
assert(settings.includes("label: T.useDeviceSetting"), 'Picker must expose Use device setting as an action');
assert(settings.includes("detail: `${T.followsDevice} · ${cfg.lang === 'ar' ? T.arabic : T.english}`"), 'Language picker must show the currently resolved device language');
assert(settings.includes("const deviceColorScheme = useColorScheme();"), 'Appearance must observe device theme changes');
assert(settings.includes("const deviceTheme = deviceColorScheme === 'light' ? 'light' : 'dark';"), 'Appearance must resolve the live device theme');
assert(settings.includes("detail: `${T.followsDevice} · ${deviceTheme === 'dark' ? T.dark : T.light}`"), 'Theme picker must show the actual device appearance');

// Auth remains minimal and no longer looks like a second profile/account object.
const auth = region('function AuthModal(', '\nfunction PasswordModal(');
assert(!auth.includes('accountLinkNotice'), 'Auth sheet must not use a separate linked-profile card');
assert(auth.includes('authContextText'), 'Auth sheet needs one restrained context line');
assert(!settings.includes('usernameDraft'), 'Username must not return');
assert(!settings.includes('phoneDraft'), 'Phone must not return');
assert(auth.includes("authMode === 'signup' && !profileName"), 'Name is requested only when the user has not already set it');

settings.split(/\r?\n/).forEach((line, i) => {
  assert(!/[ \t]+$/.test(line), `SettingsScreen.js:${i + 1} trailing whitespace`);
});

console.log('MYFI ACCOUNT UX FINAL COMPATIBILITY: PASSED');
