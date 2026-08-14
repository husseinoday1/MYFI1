const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let ts;
try { ts = require('typescript'); }
catch { console.log('MYFI FULL JS/JSX PARSE: SKIPPED (typescript not installed)'); process.exit(0); }

const files = [];
const walk = dir => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.expo' || entry.name === '.myfi-backups') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(?:js|jsx)$/.test(entry.name)) files.push(full);
  }
};
walk(path.join(root, 'src'));
for (const entry of ['App.js', 'App.jsx']) {
  const full = path.join(root, entry);
  if (fs.existsSync(full)) files.push(full);
}

const failures = [];
for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  for (const diagnostic of sourceFile.parseDiagnostics || []) {
    const pos = sourceFile.getLineAndCharacterOfPosition(diagnostic.start || 0);
    const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    failures.push(`${path.relative(root, file)}:${pos.line + 1}:${pos.character + 1} ${text}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
}
assert.equal(failures.length, 0, `JS/JSX parse failures: ${failures.length}`);
console.log(`MYFI FULL JS/JSX PARSE: PASSED (${files.length} files)`);
