const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const backupDataPath = path.join(repo, 'src/lib/backupData.js');
const source = fs.readFileSync(backupDataPath, 'utf8');

const transformed = source
  .replace(/export const /g, 'const ')
  + '\nmodule.exports = { MYFI_BACKUP_DATA_VERSION, summarizeBackupData, inspectBackupData, normalizeBackupNotifications, sanitizeBackupCategories };';

const moduleObj = { exports: {} };
new Function('module', 'exports', transformed)(moduleObj, moduleObj.exports);
const {
  MYFI_BACKUP_DATA_VERSION,
  inspectBackupData,
  normalizeBackupNotifications,
  sanitizeBackupCategories,
} = moduleObj.exports;

assert.equal(MYFI_BACKUP_DATA_VERSION, 7);

const base = {
  v: 7,
  cfg: { currency: 'IQD', name: 'Test' },
  notif: {},
  cats: [{ id: 'other', label: 'Other' }],
  wallets: [{ id: 'w1' }, { id: 'w2' }],
  trans: [{ id: 't1', amt: -100, walletId: 'w1', dateISO: '2026-08-01' }],
  debts: [],
  goals: [],
  commitments: [],
};
assert.equal(inspectBackupData(base).valid, true);

// Empty backup is legitimate and must be restorable.
assert.equal(inspectBackupData({ ...base, trans: [], wallets: [] }).valid, true);

// Newer data is rejected.
assert.equal(inspectBackupData({ ...base, v: 999 }).valid, false);

// Duplicate IDs are rejected.
assert.equal(inspectBackupData({ ...base, trans: [base.trans[0], { ...base.trans[0] }] }).valid, false);

// Broken transfer references are not silently repaired.
assert.equal(inspectBackupData({
  ...base,
  trans: [{ id: 'x', kind: 'transfer', fromWalletId: 'w1', toWalletId: 'missing', transferAmount: 50 }],
}).valid, false);

// Ordinary missing wallet can be safely repaired by prepareWalletData.
const repairable = inspectBackupData({
  ...base,
  trans: [{ id: 'x', walletId: 'missing', amt: -50 }],
});
assert.equal(repairable.valid, true);
assert(repairable.warnings.length > 0);

// Notification defaults are merged one level deeper.
const defaults = { daily: { on: false, value: 21 }, debt: { on: true, value: 3 } };
const notif = normalizeBackupNotifications({ daily: { on: true } }, defaults);
assert.deepEqual(notif.daily, { on: true, value: 21 });
assert.deepEqual(notif.debt, { on: true, value: 3 });

// "other" category is preserved.
const cats = sanitizeBackupCategories([{ id: 'food', label: 'Food' }], [{ id: 'other', label: 'Other' }]);
assert(cats.some(item => item.id === 'other'));

console.log('backup restore validation tests passed');
