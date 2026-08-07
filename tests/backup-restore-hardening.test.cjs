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

// A valid empty workspace backup is restorable.
assert.equal(inspectBackupData({
  ...base,
  trans: [],
  debts: [],
  goals: [],
  commitments: [],
  wallets: [],
}).valid, true);

// Newer inner data is rejected.
assert.equal(inspectBackupData({ ...base, v: 999 }).valid, false);

// Duplicate IDs are rejected.
assert.equal(inspectBackupData({
  ...base,
  trans: [base.trans[0], { ...base.trans[0] }],
}).valid, false);

// A broken transfer cannot be silently repaired because that changes money flow.
assert.equal(inspectBackupData({
  ...base,
  trans: [{
    id: 'x',
    kind: 'transfer',
    fromWalletId: 'w1',
    toWalletId: 'missing',
    transferAmount: 50,
  }],
}).valid, false);

// An ordinary entry with a stale wallet reference can be repaired to the
// imported default wallet by prepareWalletData.
const repairable = inspectBackupData({
  ...base,
  trans: [{ id: 'x', walletId: 'missing', amt: -50 }],
});
assert.equal(repairable.valid, true);
assert(repairable.warnings.length > 0);

// Nested notification defaults survive old/partial backups.
const defaults = {
  daily: { on: false, value: 21 },
  debt: { on: true, value: 3 },
};
const notif = normalizeBackupNotifications({ daily: { on: true } }, defaults);
assert.deepEqual(notif.daily, { on: true, value: 21 });
assert.deepEqual(notif.debt, { on: true, value: 3 });

// Core "other" category remains available after a partial category backup.
const cats = sanitizeBackupCategories(
  [{ id: 'food', label: 'Food' }],
  [{ id: 'other', label: 'Other' }],
);
assert(cats.some(item => item.id === 'other'));

console.log('MYFI backup/restore validation tests passed.');
