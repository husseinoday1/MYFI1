const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const settings = read('src/screens/SettingsScreen.js');
const legacy = read('src/screens/SettingsLegacyScreen.js');
const home = read('src/screens/HomeScreen.js');
const history = read('src/screens/HistoryScreen.js');
const reports = read('src/screens/ReportsScreen.js');
const app = read('App.js');

// Financial setup is a professional hub; each row opens only the relevant money section.
for (const marker of ["onManage('usage')", "onManage('wallets')", "onManage('money')", "onManage('workspace')", "onManage('alerts')"]) {
  assert.ok(settings.includes(marker), `financial route missing: ${marker}`);
}
assert.ok(settings.includes('financialSection={financialSection}'));
assert.ok(legacy.includes("showFinancial('wallets')"));
assert.ok(legacy.includes("showFinancial('money')"));
assert.ok(legacy.includes("showFinancial('workspace')"));
assert.ok(legacy.includes("showFinancial('alerts')"));
assert.ok(legacy.includes("showFinancial('usage')"));

// Professional support architecture replaces the fragile tutorial-only entry.
for (const marker of ['function GuidePage(', 'function ContactPage(', 'function AboutPage(', 'supportDiagnostics', 'Product principles', 'مبادئ المنتج']) {
  assert.ok(settings.includes(marker), `support/about marker missing: ${marker}`);
}
assert.ok(settings.includes("onOpenGuide={() => setPage('guide')}"));
assert.ok(settings.includes("onOpenContact={() => setPage('contact')}"));

// Empty states progressively reveal features instead of displaying walls of zeroes.
assert.ok(home.includes('hasMeaningfulHomeData'));
assert.ok(home.includes('hasCashFlowActivity'));
assert.ok(home.includes("item.key === 'dueSoon'"));
assert.ok(home.includes("Start with one entry"));
assert.ok(history.includes('hasEntries={scopedTrans.length > 0}'));
assert.ok(history.includes('emptyActionRow'));
assert.ok(reports.includes('emptyReportState'));
assert.ok(reports.includes('hasPlanningReportContent'));
assert.ok(reports.includes('hasReportContent'));
assert.ok(reports.includes('onAddIncome'));
assert.ok(app.includes('<HistoryScreen onAddExpense={() => openAddExp(true)} onAddIncome={openAddInc}'));
assert.ok(app.includes('<ReportsScreen onAddExpense={() => openAddExp(true)} onAddIncome={openAddInc}'));

console.log('MYFI UX CORE V4: PASSED');
