#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

const data = read('src/store/slices/dataSlice.js');
const history = read('src/screens/HistoryScreen.js');
const details = read('src/components/TransactionDetailsModal.js');
const add = read('src/components/AddTransModal.js');

assert(data.includes('backup_derived_from_frozen_amounts'), 'Backup FX repair must derive only from frozen historical amounts.');
assert(data.includes('const serialized = JSON.stringify(backup);'), 'Backup must validate exact serialized export.');
assert(data.includes('inspectBackupData(roundTrip)'), 'Fresh backup must be inspected before export completes.');

assert(history.includes("const transferArrow = cfg.lang === 'ar' ? '←' : '→';"), 'History arrow must depend on locale.');
assert(history.includes("flexDirection: cfg.lang === 'ar' ? 'row-reverse' : 'row'"), 'History transfer layout must depend on locale.');
assert(!history.includes("textAlign: isTransfer ? 'left' : align"), 'History must not force English alignment in Arabic.');

assert(details.includes("const transferArrow = cfg.lang === 'ar' ? '←' : '→';"), 'Details arrow must depend on locale.');
assert(details.includes("flexDirection: cfg.lang === 'ar' ? 'row-reverse' : 'row'"), 'Details transfer layout must depend on locale.');
assert(!details.includes('{transferSourceText} → {transferTargetText}'), 'Details must not use a fixed English arrow.');

assert(add.includes('value={displayFxValue(exchangeRate)}'), 'Foreign entry equation must show actual editable rate.');
assert(add.includes('value={displayFxValue(transferFromBaseRate)}'), 'Transfer source FX equation must show current rate.');
assert(add.includes('value={displayFxValue(transferToBaseRate)}'), 'Transfer target FX equation must show current rate.');
assert(add.includes('value={displayFxValue(entityBaseRate)}'), 'Tracker FX equation must show current rate.');
assert(add.includes('سعر الصرف لهذه الحركة · قابل للتعديل'), 'Arabic FX field must state editability.');
assert(add.includes('Exchange rate · editable'), 'English FX field must state editability.');

console.log('P18-009 FINAL CONTRACT: PASSED');
