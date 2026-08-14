const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const rel = 'src/screens/SettingsScreen.js';
const source = fs.readFileSync(path.join(root, rel), 'utf8');

assert(source.includes('MYFI_SETTINGS_RUNTIME_RECOVERY_V5_0_1'), 'V5.0.1 recovery marker missing');
for (const name of ['Avatar', 'SectionLabel', 'MenuGroup', 'MenuRow', 'SwitchRow', 'InfoRow']) {
  assert(new RegExp(`function\\s+${name}\\s*\\(`).test(source), `${name} is referenced by Settings but not defined`);
}

// Runtime-oriented JSX contract: every capitalized JSX tag must either be imported
// or declared in this module. This specifically prevents the V5 SectionLabel regression.
const imported = new Set();
for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+['"][^'"]+['"];?/g)) {
  const spec = match[1].trim();
  if (spec.startsWith('* as ')) {
    imported.add(spec.slice(5).trim());
    continue;
  }
  const namedStart = spec.indexOf('{');
  if (namedStart >= 0) {
    const before = spec.slice(0, namedStart).replace(/,$/, '').trim();
    if (before) imported.add(before);
    const inside = spec.slice(namedStart + 1, spec.lastIndexOf('}'));
    for (const item of inside.split(',')) {
      const clean = item.trim();
      if (!clean) continue;
      const alias = clean.split(/\s+as\s+/).pop().trim();
      if (alias) imported.add(alias);
    }
  } else if (spec) {
    imported.add(spec.split(',')[0].trim());
  }
}
const declared = new Set([
  ...Array.from(source.matchAll(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/g), m => m[1]),
  ...Array.from(source.matchAll(/(?:const|let|var|class)\s+([A-Z][A-Za-z0-9_]*)\b/g), m => m[1]),
]);
const jsx = new Set(Array.from(source.matchAll(/<([A-Z][A-Za-z0-9_]*)\b/g), m => m[1]));
const missing = [...jsx].filter(name => !imported.has(name) && !declared.has(name));
assert.deepEqual(missing, [], `Undefined JSX component(s): ${missing.join(', ')}`);

source.split(/\r?\n/).forEach((line, index) => {
  assert(!/[ \t]+$/.test(line), `${rel}:${index + 1} trailing whitespace`);
});

console.log('MYFI SETTINGS RUNTIME COMPONENT CONTRACT V5.0.1: PASSED');
