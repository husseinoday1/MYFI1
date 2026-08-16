#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');

const mainStart = source.indexOf('export default function SettingsScreen(');
const rootSettingsStart = source.indexOf('\nfunction RootSettings(');

assert(mainStart >= 0, 'SettingsScreen start must exist.');
assert(rootSettingsStart > mainStart, 'RootSettings must follow SettingsScreen.');

const main = source.slice(mainStart, rootSettingsStart);
const outside = source.slice(rootSettingsStart);

assert(
  main.includes('const [restoreResultOpen, setRestoreResultOpen] = useState(false);'),
  'restoreResultOpen state must be declared inside SettingsScreen.',
);
assert(
  main.includes('visible={restoreResultOpen}'),
  'restore result DecisionModal must render inside SettingsScreen.',
);
assert(
  main.includes('restoreLastBackupRollback()'),
  'post-restore rollback action must remain inside SettingsScreen.',
);
assert.equal(
  (source.match(/visible=\{restoreResultOpen\}/g) || []).length,
  1,
  'Exactly one restore result DecisionModal must exist.',
);
assert(
  !outside.includes('restoreResultOpen'),
  'restoreResultOpen must never be referenced outside SettingsScreen scope.',
);
assert(
  !outside.includes('restoreLastBackupRollback()'),
  'restore rollback action must never be rendered outside SettingsScreen scope.',
);

console.log('P18-008R1 RESTORE RESULT SCOPE CONTRACT: PASSED');
