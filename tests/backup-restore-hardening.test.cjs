const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const backupDataPath = path.join(repo, 'src/lib/backupData.js');
const source = fs.readFileSync(backupDataPath, 'utf8');

const transformed = source
  .replace(/export const /g, 'const ')
  + '\nmodule.exports = { MYFI_BACKUP_DATA_VERSION, MYFI_BACKUP_KIND, buildFinancialBackup, inspectBackupData, pickFinancialBackupConfig, mergeFinancialBackupConfig, sanitizeBackupCategories };';

const moduleObj = { exports: {} };
new Function('module', 'exports', transformed)(moduleObj, moduleObj.exports);

const {
  MYFI_BACKUP_DATA_VERSION,
  MYFI_BACKUP_KIND,
  buildFinancialBackup,
  inspectBackupData,
  pickFinancialBackupConfig,
  mergeFinancialBackupConfig,
  sanitizeBackupCategories,
} = moduleObj.exports;

assert.equal(MYFI_BACKUP_DATA_VERSION, 10);
assert.equal(MYFI_BACKUP_KIND, 'myfi_financial_backup');

const sourceCfg = {
  currency: 'IQD',
  profileType: 'personal',
  activeScope: 'personal',
  enabledModules: { goals: true, commitments: true },
  defaultWalletId: 'w1',
  categoryBudgets: { food: 250000 },
  archiveSummaries: [{ year: 2025 }],
  // Must never enter a financial backup:
  displayName: 'Oday',
  username: 'oday',
  phone: '+9647000000000',
  avatarUri: 'file://private.jpg',
  lang: 'ar',
  theme: 'dark',
  orientationMode: 'portrait',
  bioLock: true,
};

const base = buildFinancialBackup({
  cfg: sourceCfg,
  cats: [{ id: 'other', label: 'Other' }],
  wallets: [{ id: 'w1' }, { id: 'w2' }],
  trans: [{ id: 't1', amt: -100, walletId: 'w1', dateISO: '2026-08-01' }],
  debts: [],
  goals: [],
  commitments: [],
});

assert.equal(base.kind, MYFI_BACKUP_KIND);
assert.equal(base.cfg, undefined);
assert.equal(base.notif, undefined);
assert.equal(JSON.stringify(base).includes('Oday'), false);
assert.equal(JSON.stringify(base).includes('oday'), false);
assert.equal(JSON.stringify(base).includes('+964'), false);
assert.equal(JSON.stringify(base).includes('private.jpg'), false);
assert.equal(inspectBackupData(base).valid, true);
assert.equal(base.manifest.format, 'MYFI_LOGICAL_BACKUP');
assert.equal(base.manifest.financialEngineVersion, 7);
assert.ok(base.checksums.financialData);
assert.ok(base.checksums.financialConfig);
assert.deepEqual(base.budgets.current, sourceCfg.categoryBudgets);

const tamperedFlatCollection = JSON.parse(JSON.stringify(base));
tamperedFlatCollection.trans[0].amt = -999;
assert.equal(inspectBackupData(tamperedFlatCollection).valid, false);

const tamperedFinancialConfig = JSON.parse(JSON.stringify(base));
tamperedFinancialConfig.financialConfig.currency = 'USD';
assert.equal(inspectBackupData(tamperedFinancialConfig).valid, false);

const transferBackup = buildFinancialBackup({
  cfg: sourceCfg,
  wallets: [
    { id: 'usd', currency: 'USD' },
    { id: 'eur', currency: 'EUR' },
  ],
  trans: [{
    id: 'transfer-rates', kind: 'transfer', fromWalletId: 'usd', toWalletId: 'eur',
    fromCurrency: 'USD', toCurrency: 'EUR', baseCurrencyCode: 'IQD',
    transferRate: 0.92, fromBaseRate: 1310, toBaseRate: 1423.91,
    transferAmount: 10, transferToAmount: 9.2, dateISO: '2026-08-14',
  }],
});
assert.deepEqual(
  transferBackup.rates.map(item => item.id).sort(),
  [
    'transfer-rates:from-to-base-rate',
    'transfer-rates:to-to-base-rate',
    'transfer-rates:transfer-rate',
  ],
);

// A valid empty financial workspace backup is restorable.
assert.equal(inspectBackupData(buildFinancialBackup({ cfg: sourceCfg })).valid, true);

// Newer inner data is rejected.
assert.equal(inspectBackupData({ ...base, v: 999 }).valid, false);

// Duplicate IDs are rejected.
assert.equal(inspectBackupData(buildFinancialBackup({
  cfg: sourceCfg,
  wallets: base.wallets,
  trans: [base.trans[0], { ...base.trans[0] }],
})).valid, false);

// A broken transfer cannot be silently repaired because that changes money flow.
assert.equal(inspectBackupData(buildFinancialBackup({
  cfg: sourceCfg,
  wallets: base.wallets,
  trans: [{
    id: 'x',
    kind: 'transfer',
    fromWalletId: 'w1',
    toWalletId: 'missing',
    transferAmount: 50,
  }],
})).valid, false);

// Ordinary stale wallet references stay repairable by prepareWalletData.
const repairable = inspectBackupData(buildFinancialBackup({
  cfg: sourceCfg,
  wallets: base.wallets,
  trans: [{ id: 'x', walletId: 'missing', amt: -50 }],
}));
assert.equal(repairable.valid, true);
assert(repairable.warnings.length > 0);

// Old backups remain readable, but their non-financial config is filtered.
const legacy = {
  ...base,
  kind: undefined,
  v: 7,
  cfg: sourceCfg,
  notif: { daily: { on: true } },
};
const legacyInspection = inspectBackupData(legacy);
assert.equal(legacyInspection.valid, true);
assert(legacyInspection.warnings.includes('backup_legacy_settings_filtered'));
assert(legacyInspection.warnings.includes('backup_legacy_notifications_ignored'));

const kept = {
  displayName: 'Current User',
  username: 'current',
  phone: '+9647111111111',
  avatarUri: 'file://current.jpg',
  lang: 'en',
  theme: 'light',
  orientationMode: 'system',
  bioLock: false,
  currency: 'USD',
  profileType: 'business',
  activeScope: 'business',
  enabledModules: { goals: false, commitments: false },
};
const restoredCfg = mergeFinancialBackupConfig(kept, sourceCfg);
assert.equal(restoredCfg.displayName, kept.displayName);
assert.equal(restoredCfg.username, kept.username);
assert.equal(restoredCfg.phone, kept.phone);
assert.equal(restoredCfg.avatarUri, kept.avatarUri);
assert.equal(restoredCfg.lang, kept.lang);
assert.equal(restoredCfg.theme, kept.theme);
assert.equal(restoredCfg.orientationMode, kept.orientationMode);
assert.equal(restoredCfg.bioLock, kept.bioLock);
assert.equal(restoredCfg.currency, 'IQD');
assert.equal(restoredCfg.defaultWalletId, 'w1');

const safeCfg = pickFinancialBackupConfig(sourceCfg);
['displayName', 'username', 'phone', 'avatarUri', 'lang', 'theme', 'orientationMode', 'bioLock']
  .forEach(key => assert.equal(Object.prototype.hasOwnProperty.call(safeCfg, key), false, `Financial config leaked ${key}`));

// Core "other" category remains available after a partial category backup.
const cats = sanitizeBackupCategories(
  [{ id: 'food', label: 'Food' }],
  [{ id: 'other', label: 'Other' }],
);
assert(cats.some(item => item.id === 'other'));

console.log('MYFI financial backup boundary tests passed.');
