const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
const legacy = fs.readFileSync(path.join(root, 'src/screens/SettingsLegacyScreen.js'), 'utf8');
const app = fs.readFileSync(path.join(root, 'App.js'), 'utf8');

assert(settings.includes('resetSignal = 0'), 'SettingsScreen must accept a root-reset signal');
assert(settings.includes('const [navStack, setNavStack] = useState([]);'), 'Settings step-back stack missing');
assert(settings.includes('const goBack = () => {'), 'Step-back navigation missing');
assert(settings.includes('const resetToRoot = () => {'), 'Settings root reset missing');
assert(!settings.includes('function SettingsPageMenu('), 'Settings-wide dropdown navigator must be removed');
assert(!settings.includes('function NestedSettingsMenu('), 'Nested settings navigator must be removed');
assert(!settings.includes("page === 'advanced'"), 'Advanced intermediate page must be removed');
assert(settings.includes('<LegacySettingsScreen tabs={tabs} embedded financialOnly financialSection="all" />'), 'Financial configuration must stay on one page');
assert(settings.includes('<LegacySettingsScreen tabs={tabs} embedded financialOnly financialSection="usage" />'), 'Feature visibility must be reachable directly from Settings Root');
assert(settings.includes('<LegacySettingsScreen tabs={tabs} embedded financialOnly financialSection="alerts" />'), 'Notifications must be reachable directly from Settings Root');
assert(settings.includes("onPress={() => onOpen('features')}") && settings.includes("onPress={() => onOpen('notifications')}"), 'Settings Root feature/notification destinations missing');
assert(legacy.includes('financialOpenSection'), 'Financial page must use inline accordion disclosure');
assert(legacy.includes('financialAccordionHead'), 'Financial accordion styling missing');
assert(settings.includes("textAlign: 'center' }]} numberOfLines={1}>{title}</Text>"), 'Subpage headers must be centered');
assert(settings.includes("const localName = /^(المستخدم|user)$/i.test(storedName) ? '' : storedName;"), 'Legacy placeholder name must be treated as empty');
assert(settings.includes('s.profileNameInput'), 'Profile name edit field must use centered input styling');

assert(app.includes('const [settingsResetSignal, setSettingsResetSignal] = useState(0);'), 'App settings reset signal missing');
assert(app.includes('resetSignal={settingsResetSignal}'), 'Settings reset signal not wired to SettingsScreen');
assert(app.includes("if (item.key === 'settings')"), 'Settings tab must have dedicated root-reset behavior');
assert(app.includes("setSettingsOpenRequest({ page: 'root', nonce: Date.now() });"), 'Settings tab must issue an explicit root command even when already selected');

for (const [rel, text] of [['src/screens/SettingsScreen.js', settings], ['src/screens/SettingsLegacyScreen.js', legacy], ['App.js', app]]) {
  text.split(/\r?\n/).forEach((line, i) => assert(!/[ \t]+$/.test(line), `${rel}:${i + 1} trailing whitespace`));
}

console.log('MYFI SETTINGS FLAT NAVIGATION V5: PASSED');
