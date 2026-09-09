// MaalFlow §109 — local encryption honesty contract.
//
// Option A (plaintext local ledger, protected by the sandbox and device encryption) is
// only defensible while the product never claims otherwise. That condition decays the
// moment someone writes reassuring marketing copy, so it is enforced here rather than
// trusted.
//
// The distinction this has to draw: "encrypted backup" is TRUE and must stay sayable --
// backup export really does use AES-GCM with a user password. "Your data is encrypted"
// is FALSE. So a line is only a violation when it ties encryption to the stored data or
// the device, and does not scope itself to a backup, file or archive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const listJs = dir => fs.readdirSync(path.join(root, dir))
  .filter(name => name.endsWith('.js'))
  .map(name => `${dir}/${name}`);

const targets = [
  'src/lib/strings.js',
  ...listJs('src/screens'),
  ...listJs('src/components'),
  'docs/MAALFLOW_MARKETING_PLAN_AR.md',
  'docs/PLAY_CONSOLE_SUBMISSION_AR.md',
  'docs/ANDROID_RELEASE_READINESS_AR.md',
  'docs/USER_GUIDE_AND_SUPPORT_PLAN_AR.md',
].filter(rel => fs.existsSync(path.join(root, rel)));

const ENCRYPTION = /(مشفّر|مشفر|تشفير|encrypt)/i;
// The stored data or the device itself -- the thing we must not claim is encrypted.
const STORED_DATA = /(بياناتك|بياناتي|قاعدة البيانات|على جهازك|على الجهاز|محلياً|محليا|your data|the database|on[- ]device|stored locally|on your (phone|device))/i;
// Scoping that makes an encryption claim true: it is about an exported artefact.
const ARTEFACT = /(نسخة|النسخ|نسخ|ملف|الملف|أرشيف|الأرشيف|backup|file|archive|export|package|zip)/i;
// Claims that are false regardless of scoping.
const ABSOLUTE = /(end[- ]to[- ]end|fully encrypted|تشفير كامل|تشفير تام|مشفرة بالكامل|مشفّرة بالكامل|military[- ]grade)/i;

const violations = [];
for (const rel of targets) {
  const lines = read(rel).split(/\r?\n/);
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
    if (ABSOLUTE.test(line)) {
      violations.push(`${rel}:${index + 1} absolute encryption claim\n      ${trimmed.slice(0, 140)}`);
      return;
    }
    if (!ENCRYPTION.test(line) || !STORED_DATA.test(line)) return;
    if (ARTEFACT.test(line)) return; // scoped to a backup/file: true, allowed
    violations.push(`${rel}:${index + 1} claims stored data is encrypted\n      ${trimmed.slice(0, 140)}`);
  });
}

assert.equal(
  violations.length,
  0,
  'The local SQLite ledger is plaintext (§109 Option A). These lines claim otherwise:\n\n'
  + violations.map(entry => `  - ${entry}`).join('\n')
  + '\n\n  Either scope the claim to a backup file, or reopen §109 and adopt Option B.\n',
);

// Guard the guard: if the decision document disappears or silently flips, this contract
// is enforcing a condition nobody agreed to any more.
const decision = read('docs/MAALFLOW_LOCAL_ENCRYPTION_DECISION.md');
assert.match(decision, /\*\*Option A\.\*\*/, '§109 decision record must state the chosen option');
assert.match(decision, /plaintext/i, '§109 record must state plainly that the ledger is plaintext');

console.log(`MaalFlow §109 local encryption honesty contract: PASS (${targets.length} files scanned)`);
