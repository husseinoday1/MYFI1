const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const settings = read('src/screens/SettingsScreen.js');
const legacy = read('src/screens/SettingsLegacyScreen.js');
const app = read('App.js');
const home = read('src/screens/HomeScreen.js');
const history = read('src/screens/HistoryScreen.js');
const reports = read('src/screens/ReportsScreen.js');
const sync = read('src/store/slices/useSyncSlice.js');

// Settings navigation is shallow: no settings-wide navigator and no Financial -> submenu -> page chain.
assert(!settings.includes('function SettingsPageMenu('), 'Settings-wide dropdown must be removed');
assert(!settings.includes('function NestedSettingsMenu('), 'Nested navigation dropdown must be removed');
assert(!settings.includes("page === 'advanced'"), 'Advanced settings intermediate page must be removed');
assert(!settings.includes("openPage('advanced')"), 'Financial settings must not route through Advanced');
assert(settings.includes('resetSignal = 0'), 'Settings root reset signal must remain');
assert(app.includes('setSettingsResetSignal(value => value + 1);'), 'Settings tab must still jump directly to Settings root');
assert(settings.includes('const goBack = () => {'), 'Step-back behavior must remain');

// Financial settings are one screen with inline accordion sections.
assert(settings.includes('<LegacySettingsScreen tabs={tabs} embedded financialOnly financialSection="all" />'), 'Financial page must embed the full money configuration once');
assert(legacy.includes('const [financialOpenSection, setFinancialOpenSection] = useState(null);'), 'Financial accordion state missing');
assert(legacy.includes("['usage', 'workspace', 'wallets', 'money', 'alerts'].includes(id)"), 'Financial accordion sections incomplete');
assert(legacy.includes("name={expanded ? 'chevron-up' : 'chevron-down'}"), 'Financial accordion affordance missing');
assert(legacy.includes('const ContentShell = embedded ? View : ScrollView;'), 'Embedded financial settings must not create a nested vertical ScrollView');

// General identity settings stay direct on the Settings root and show resolved value + device source note.
for (const marker of ["onChoice('language')", "onChoice('theme')", "onChoice('orientation')", "onChoice('country')", "onChoice('currency')"]) {
  assert(settings.includes(marker), `Missing direct general setting: ${marker}`);
}
assert(settings.includes("const languageNote = cfg.langMode === 'system' ? T.followsDevice : null;"));
assert(settings.includes("const themeNote = cfg.themeMode === 'system' ? T.followsDevice : null;"));
assert(settings.includes("const rotationNote = cfg.orientationMode === 'system' ? T.followsDevice : null;"));

// Account is one identity. Name is not duplicated in a second information section.
const accountStart = settings.indexOf('function AccountPage(');
const accountEnd = settings.indexOf('\nfunction DevicesPage(', accountStart);
const account = settings.slice(accountStart, accountEnd);
assert(account.includes('s.profileHero'), 'Unified account hero missing');
assert(account.includes('T.connectAccount'), 'Optional MYFI account connection missing');
assert(!account.includes('text={T.yourInfo}'), 'Name must not be repeated in a separate Your information block');
assert(account.includes('title={T.email}'), 'Connected email must remain in account/security');
assert(account.includes('T.syncDevices'), 'Sync and devices must remain part of the same account page');
assert(settings.includes("const accountInitial = editableName.trim().charAt(0).toUpperCase() || 'M';"), 'Placeholder text must not become the avatar initial');

// Help is professional but shallow: direct guide/contact/shortcuts, no nested help menu.
const supportStart = settings.indexOf('function SupportPage(');
const supportEnd = settings.indexOf('\nfunction GuidePage(', supportStart);
const support = settings.slice(supportStart, supportEnd);
for (const marker of ['T.guide', 'T.contactCenter', 'T.accountRecovery', 'T.backupHelp', 'T.securityHelp']) {
  assert(support.includes(marker), `Support shortcut missing: ${marker}`);
}
assert(!support.includes('NestedSettingsMenu'), 'Help must not hide its entries in a navigation dropdown');
assert(settings.includes("const [openGuide, setOpenGuide] = useState('start');"), 'Guide topics should expand inline instead of adding more pages');

// Previously completed Home / History / Reports behavior stays intact.
assert(home.includes('hasMeaningfulHomeData'), 'Home progressive disclosure regressed');
assert(history.includes('hasEntries={scopedTrans.length > 0}'), 'History empty-state progressive disclosure regressed');
assert(reports.includes('const comparisonPeriodSummary = useMemo(() => {'), 'Compact report comparison-period summary regressed');
assert(reports.includes('{comparisonPeriodSummary.primary}'));
assert(reports.includes('{comparisonPeriodSummary.secondary}'));

// Sync core hardening stays present and untouched in behavior.
assert(sync.includes("sync_race_retry_required"), 'Sync race retry guard missing');
assert(sync.includes("supabase.rpc('sync_user_data_v2'"), 'Hardened sync RPC missing');
assert(sync.includes('mergeWorkspaceStates'), 'Three-way merge missing');

for (const rel of ['App.js', 'src/screens/SettingsScreen.js', 'src/screens/SettingsLegacyScreen.js']) {
  read(rel).split(/\r?\n/).forEach((line, i) => assert(!/[ \t]+$/.test(line), `${rel}:${i + 1} trailing whitespace`));
}

console.log('MYFI REAL-STATE CONSOLIDATED UX V5: PASSED');
