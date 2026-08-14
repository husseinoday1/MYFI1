const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(process.argv[2] || '.');
const files = [
  'src/screens/HomeScreen.js',
  'src/screens/TrackersLabScreen.js',
  'src/screens/ReportsScreen.js',
  'src/screens/HistoryScreen.js',
  'src/screens/SettingsScreen.js',
  'src/screens/OnboardingScreen.js',
  'src/components/FirstUseGuideModal.js',
];
const ui = files.map(rel => fs.readFileSync(path.join(repo, rel), 'utf8')).join('\n');

const forbidden = [
  ['الرصيد المتوفر', 'Use الرصيد المتاح consistently'],
  ['حسب الهاتف', 'Do not expose Follow phone'],
  ['Follow phone', 'Do not expose Follow phone'],
  ['الحساب، التفضيلات، الأمان والبيانات في مكان واحد', 'Remove explanatory Settings marketing copy'],
  ['اللغة والمظهر والتاريخ يتبعون جهازك', 'Do not explain automatic device defaults in onboarding'],
];
for (const [term, message] of forbidden) {
  assert.equal(ui.includes(term), false, `${message}: ${term}`);
}

const required = [
  ['الرصيد المتاح', 'Available balance'],
  ['المتابعات', 'Trackers'],
  ['التوفير', 'Savings'],
  ['الالتزامات', 'Commitments'],
  ['السجل', 'History'],
  ['التقارير', 'Reports'],
  ['الحساب والمزامنة', 'Account & sync'],
  ['الخصوصية والأمان', 'Privacy & security'],
];
for (const [ar, en] of required) {
  assert(ui.includes(ar), `Missing canonical Arabic term: ${ar}`);
  assert(ui.includes(en), `Missing canonical English term: ${en}`);
}

console.log('MYFI terminology audit passed.');
