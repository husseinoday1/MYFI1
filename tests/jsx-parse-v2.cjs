const fs = require('node:fs');
const path = require('node:path');
let ts;
try {
  ts = require('typescript');
} catch (error) {
  console.error('TypeScript parser is not installed in node_modules. Run npm install before applying this package.');
  process.exit(2);
}
const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const files = [
  'App.js',
  'src/screens/OnboardingScreen.js',
  'src/screens/SettingsScreen.js',
  'src/screens/HomeScreen.js',
  'src/screens/HistoryScreen.js',
  'src/screens/TrackersLabScreen.js',
  'src/screens/ReportsScreen.js',
];
let failed = false;
for (const rel of files) {
  const full = path.join(root, rel);
  const text = fs.readFileSync(full, 'utf8');
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  if (source.parseDiagnostics.length) {
    failed = true;
    console.error(`JSX parse failed: ${rel}`);
    for (const item of source.parseDiagnostics) {
      const pos = source.getLineAndCharacterOfPosition(item.start || 0);
      console.error(`  ${pos.line + 1}:${pos.character + 1} ${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`);
    }
  }
}
if (failed) process.exit(1);
console.log('MYFI JSX parse V2: PASSED');
