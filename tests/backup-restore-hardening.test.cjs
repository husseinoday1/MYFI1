const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const backupDataPath = path.join(repo, 'src/lib/backupData.js');
const source = fs.readFileSync(backupDataPath, 'utf8');

const transformed = source
  .replace(/export const /g, 'const ')
  + '\nmodule.exports = { MAALFLOW_BACKUP_DATA_VERSION, MAALFLOW_BACKUP_KIND, buildFinancialBackup, inspectBackupData, pickFinancialBackupConfig, mergeFinancialBackupConfig, sanitizeBackupCategories };';

const moduleObj = { exports: {} };
new Function('module', 'exports', transformed)(moduleObj, moduleObj.exports);

const {
  MAALFLOW_BACKUP_DATA_VERSION,
  MAALFLOW_BACKUP_KIND,
  buildFinancialBackup,
  inspectBackupData,
  pickFinancialBackupConfig,
  mergeFinancialBackupConfig,
  sanitizeBackupCategories,
} = moduleObj.exports;

assert.equal(MAALFLOW_BACKUP_DATA_VERSION, 11);
assert.equal(MAALFLOW_BACKUP_KIND, 'maalflow_financial_backup');

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
  trackerTypes: [{ id: 'type-installments', name: 'Installments', template: 'installment' }],
  trackerItems: [{ id: 'item-phone', typeId: 'type-installments', name: 'Phone', status: 'active' }],
});

assert.equal(base.kind, MAALFLOW_BACKUP_KIND);
assert.equal(base.cfg, undefined);
assert.equal(base.notif, undefined);
assert.equal(JSON.stringify(base).includes('Oday'), false);
assert.equal(JSON.stringify(base).includes('oday'), false);
assert.equal(JSON.stringify(base).includes('+964'), false);
assert.equal(JSON.stringify(base).includes('private.jpg'), false);
assert.equal(inspectBackupData(base).valid, true);
assert.equal(base.manifest.format, 'MAALFLOW_LOGICAL_BACKUP');
assert.equal(base.manifest.financialEngineVersion, 7);
assert.ok(base.checksums.financialData);
assert.ok(base.checksums.financialConfig);
assert.deepEqual(base.budgets.current, sourceCfg.categoryBudgets);
assert.equal(base.financialData.trackerTypes[0].id, 'type-installments');
assert.equal(base.financialData.trackerItems[0].typeId, 'type-installments');
assert.equal(base.manifest.collections.trackerTypes, 1);
assert.equal(base.manifest.collections.trackerItems, 1);

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

// R04 contract: an unknown wallet reference is financial ambiguity, not a
// repair opportunity. Restore must stop for explicit user review.
const repairable = inspectBackupData(buildFinancialBackup({
  cfg: sourceCfg,
  wallets: base.wallets,
  trans: [{ id: 'x', walletId: 'missing', amt: -50 }],
}));
assert.equal(repairable.valid, false);
assert(repairable.errors.some(item => String(item).startsWith('backup_transaction_wallet_unknown:')));

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

// The monthly plan (period start day, income mode/amount, end-of-period
// reviews — 2026-09-11 planning redesign) round-trips like the budgets beside
// it: present in the backup, replaces the current device's plan wholesale on
// restore, and a pre-existing plan survives untouched when the backup has none.
const cfgWithPlan = {
  ...sourceCfg,
  monthlyPlan: {
    version: 1, currencyCode: 'IQD', startDayHistory: [{ effectivePeriod: '2026-11', startDay: 25 }],
    incomeMode: 'fixed', fixedIncomeMinor: 1500000000,
    reviews: { 'personal:2026-08': { choice: 'carry', amountMinor: 60000000, remainderMinor: 60000000, currencyCode: 'IQD', goalId: null, allocationTransactionId: null, decidedAt: '2026-08-25T00:00:00Z' } },
  },
};
const planSafeCfg = pickFinancialBackupConfig(cfgWithPlan);
assert.deepEqual(planSafeCfg.monthlyPlan, cfgWithPlan.monthlyPlan, 'the plan must reach the backup document');
const currentDevicePlan = { version: 1, currencyCode: 'USD', startDayHistory: [], incomeMode: 'fixed', fixedIncomeMinor: 1, reviews: {} };
const restoredWithPlan = mergeFinancialBackupConfig({ ...kept, monthlyPlan: currentDevicePlan }, cfgWithPlan);
assert.deepEqual(restoredWithPlan.monthlyPlan, cfgWithPlan.monthlyPlan, 'restoring a backup with a plan replaces the device plan wholesale');
const restoredWithoutPlan = mergeFinancialBackupConfig({ ...kept, monthlyPlan: currentDevicePlan }, sourceCfg);
assert.deepEqual(restoredWithoutPlan.monthlyPlan, currentDevicePlan, 'a backup with no plan (pre-2026-09-11) leaves the current device plan untouched');

// Core "other" category remains available after a partial category backup.
const cats = sanitizeBackupCategories(
  [{ id: 'food', label: 'Food' }],
  [{ id: 'other', label: 'Other' }],
);
assert(cats.some(item => item.id === 'other'));

console.log('MaalFlow financial backup boundary tests passed.');
