const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const settings = read('src/screens/SettingsScreen.js');
const reports = read('src/screens/ReportsScreen.js');
const constants = read('src/lib/constants.js');
const identity = read('src/lib/accountIdentity.js');

// Account terminology: product language, not implementation language.
assert(settings.includes("accountCloud: ar ? 'الحساب والهوية' : 'Account & identity'"));
assert(settings.includes("profileTitle: ar ? 'الملف الشخصي' : 'Profile'"));
assert(settings.includes("myfiAccountTitle: ar ? 'حساب MYFI' : 'MYFI account'"));
assert(!settings.includes('MYFI Cloud'));
assert(!settings.includes('الملف المحلي'));
assert(!settings.includes('Local profile'));

// Both profile and MYFI account are presented under one root account category.
const rootStart = settings.indexOf('function RootSettings(');
const rootEnd = settings.indexOf('function AccountPage(', rootStart);
const rootSettings = settings.slice(rootStart, rootEnd);
assert(rootSettings.includes('text={T.accountCloud}'));
assert(rootSettings.includes('title={T.myfiAccountTitle}'));
assert(!rootSettings.includes('text={T.cloud}'));

// Empty name is a placeholder, never a stored fake user name.
assert(constants.includes("country: 'IQ', name: '', avatar: '🌿'"));
assert(constants.includes('legacyNameIsPlaceholder'));
assert(constants.includes('name: displayName'));
assert(identity.includes("/^(المستخدم|user)$/i.test(legacyName)"));
assert(settings.includes("namePlaceholder: ar ? 'اكتب اسمك' : 'Enter your name'"));
assert(settings.includes('placeholder={T.namePlaceholder}'));
assert(settings.includes('editableIdentityName'));

// Report comparison periods use a compact summary instead of dumping every selected label.
assert(reports.includes('const comparisonPeriodSummary = useMemo(() => {'));
assert(reports.includes("selectedPeriodsLabel: ar ? 'فترات المقارنة' : 'Comparison periods'"));
assert(reports.includes('{comparisonPeriodSummary.primary}'));
assert(reports.includes('{comparisonPeriodSummary.secondary}'));
assert(reports.includes('s.proCompareCountBadge'));
assert(reports.includes("primary: ar ? `${labels[0]} + ${labels.length - 1} أخرى`"));
const pickerStart = reports.indexOf("onPress={() => setSheet('comparisonPeriods')}");
const pickerEnd = reports.indexOf('proCompareViewBar', pickerStart);
const picker = reports.slice(pickerStart, pickerEnd);
assert(!picker.includes(".join(' · ')"), 'selected periods must not be rendered as a long joined label list');
assert(!picker.includes('numberOfLines={3}'), 'selected periods display should stay compact');

// No trailing whitespace in V4.3 touched files.
for (const rel of [
  'src/screens/SettingsScreen.js',
  'src/screens/ReportsScreen.js',
  'src/lib/constants.js',
  'src/lib/accountIdentity.js',
]) {
  const lines = read(rel).split(/\r?\n/);
  lines.forEach((line, i) => assert(!/[ \t]+$/.test(line), `${rel}:${i + 1} trailing whitespace`));
}

console.log('MYFI UX POLISH V4.3: PASSED');
