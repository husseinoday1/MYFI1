// Backup-format hardening fixtures for src/lib/backupData.js.
//
// Origin: drafted by an external assistant, handed over 2026-08-20. Landed here
// unmodified except for this header. Its harness loads the real source through a vm
// sandbox rather than reimplementing it, which is the right shape, and the gaps it
// describes were re-verified against the source independently before landing:
// backupData.js:303 and :309 short-circuit on `walletIds.size`, so a non-transfer
// transaction naming a wallet that does not exist is accepted whenever the wallet
// list is empty — the :292 guard covers transfers only. :273 accepts any integer
// archive year, including 0 and negatives. And there is no Array.isArray check on
// `currencies` or `rates` anywhere in the file.
//
// WIRED INTO THE QUALITY GATE as of 2026-08-20.
//
// It arrived passing 66/66 against unhardened source, with two tests asserting
// `valid === true` for input that ought to be refused. A security suite that goes
// green on unfixed code describes the present rather than defending against it, so
// it was held out of the gate until inspectBackupData was hardened. Those two tests
// are now inverted and assert rejection, which is what makes this real regression
// cover: if the hardening is ever removed, these fail.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SOURCE_PATH = path.resolve(__dirname, '../src/lib/backupData.js');
const COLLECTION_KEYS = ['trans', 'debts', 'goals', 'wallets', 'commitments', 'cats', 'trackerTypes', 'trackerItems'];

/**
 * Load the real src/lib/backupData.js without adding a transpiler dependency.
 * The current module has no imports and exports only declarations, so the test
 * strips the ESM export keywords and exposes the symbols needed by the suite.
 */
function loadBackupDataModule() {
  const source = fs.readFileSync(SOURCE_PATH, 'utf8')
    .replace(/\bexport\s+async\s+function\s+/g, 'async function ')
    .replace(/\bexport\s+function\s+/g, 'function ')
    .replace(/\bexport\s+const\s+/g, 'const ');

  const moduleShim = { exports: {} };
  const context = vm.createContext({
    module: moduleShim,
    exports: moduleShim.exports,
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Set,
    Map,
    RegExp,
    Error,
  });

  new vm.Script(`${source}\nmodule.exports = {\n  MYFI_BACKUP_DATA_VERSION,\n  MYFI_BACKUP_KIND,\n  MYFI_BACKUP_FORMAT,\n  buildFinancialBackup,\n  inspectBackupData,\n};`, { filename: SOURCE_PATH }).runInContext(context);

  return moduleShim.exports;
}

const {
  MYFI_BACKUP_DATA_VERSION,
  MYFI_BACKUP_KIND,
  MYFI_BACKUP_FORMAT,
  buildFinancialBackup,
  inspectBackupData,
} = loadBackupDataModule();

const clone = value => JSON.parse(JSON.stringify(value));

function baseInput() {
  return {
    trans: [
      {
        id: 'tx-1',
        kind: 'expense',
        walletId: 'wallet-1',
        walletCurrency: 'IQD',
        baseCurrencyCode: 'IQD',
        dateISO: '2026-08-01',
        amt: -1250,
      },
      {
        id: 'tx-2',
        kind: 'transfer',
        fromWalletId: 'wallet-1',
        toWalletId: 'wallet-2',
        fromCurrency: 'IQD',
        toCurrency: 'USD',
        baseCurrencyCode: 'IQD',
        transferRate: 0.00076,
        toBaseRate: 1310,
        dateISO: '2026-08-02',
      },
    ],
    debts: [{ id: 'debt-1', name: 'Debt' }],
    goals: [{ id: 'goal-1', name: 'Goal' }],
    wallets: [
      { id: 'wallet-1', name: 'Cash', currency: 'IQD' },
      { id: 'wallet-2', name: 'USD wallet', currency: 'USD' },
    ],
    commitments: [{ id: 'commitment-1', walletId: 'wallet-1', amount: 100 }],
    cats: [{ id: 'cat-1', name: 'General' }],
    trackerTypes: [{ id: 'tracker-type-1', name: 'Installments', template: 'installment' }],
    trackerItems: [{ id: 'tracker-item-1', typeId: 'tracker-type-1', name: 'Phone', status: 'active' }],
    coldArchives: [
      {
        year: 2024,
        scope: 'personal',
        checksum: 'archive-checksum-2024',
        summary: { entries: 0 },
        data: { trans: [] },
      },
    ],
    cfg: {
      currency: 'IQD',
      profileType: 'personal',
      activeScope: 'personal',
      defaultWalletId: 'wallet-1',
      enabledModules: { debts: true, goals: true },
      categoryBudgets: { 'cat-1': 50000 },
      categoryBudgetsByMonth: { '2026-08': { 'cat-1': 45000 } },
      archiveSummaries: [],
    },
  };
}

function validBackup() {
  return clone(buildFinancialBackup(baseInput()));
}

function expectInvalid(result, expectedCode) {
  assert.equal(
    result.valid,
    false,
    `Expected invalid backup. Actual result: ${JSON.stringify(result, null, 2)}`,
  );
  assert.ok(
    result.errors.includes(expectedCode),
    `Expected error ${expectedCode}; actual errors: ${JSON.stringify(result.errors)}`,
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = stableValue(value[key]);
    return result;
  }, {});
}

// Test-side copy of the current v10 logical checksum, used only to construct
// coherent adversarial fixtures. It intentionally does not call private source
// internals, so a forged backup can be simulated exactly as an importer sees it.
function logicalChecksum(value) {
  const input = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${input.length}`;
}

function resignLogicalSections(backup) {
  const checksums = {
    financialData: logicalChecksum(backup.financialData),
    financialConfig: logicalChecksum(backup.financialConfig || {}),
    currencies: logicalChecksum(backup.currencies || []),
    rates: logicalChecksum(backup.rates || []),
    budgets: logicalChecksum(backup.budgets || {}),
    archives: logicalChecksum(backup.coldArchives || []),
  };
  backup.checksums = { ...checksums };
  backup.manifest.checksums = { ...checksums };
  return backup;
}

// ---------------------------------------------------------------------------
// Baseline / top-level envelope
// ---------------------------------------------------------------------------

test('valid v10 backup is accepted with no errors', () => {
  const result = inspectBackupData(validBackup());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.errors.length, 0);
});

test('non-object input is rejected', () => {
  expectInvalid(inspectBackupData(null), 'backup_not_object');
});

test('invalid version is rejected', () => {
  const backup = validBackup();
  backup.v = 0;
  expectInvalid(inspectBackupData(backup), 'backup_version_invalid');
});

test('backup newer than MYFI_BACKUP_DATA_VERSION is rejected', () => {
  const backup = validBackup();
  backup.v = MYFI_BACKUP_DATA_VERSION + 1;
  expectInvalid(inspectBackupData(backup), 'backup_version_newer');
});

test('invalid kind is rejected for current-format backup', () => {
  const backup = validBackup();
  backup.kind = `${MYFI_BACKUP_KIND}_tampered`;
  expectInvalid(inspectBackupData(backup), 'backup_kind_invalid');
});

// ---------------------------------------------------------------------------
// 1. Manifest corruption
// ---------------------------------------------------------------------------

test('manifest with wrong format is rejected', () => {
  const backup = validBackup();
  backup.manifest.format = `${MYFI_BACKUP_FORMAT}_BROKEN`;
  expectInvalid(inspectBackupData(backup), 'backup_manifest_invalid');
});

test('manifest with wrong schemaVersion is rejected', () => {
  const backup = validBackup();
  backup.manifest.schemaVersion = 9;
  expectInvalid(inspectBackupData(backup), 'backup_manifest_invalid');
});

test('manifest with missing schemaVersion is rejected', () => {
  const backup = validBackup();
  delete backup.manifest.schemaVersion;
  expectInvalid(inspectBackupData(backup), 'backup_manifest_invalid');
});

// ---------------------------------------------------------------------------
// 2. Missing logical sections
// ---------------------------------------------------------------------------

test('missing financialData is rejected', () => {
  const backup = validBackup();
  delete backup.financialData;
  expectInvalid(inspectBackupData(backup), 'backup_logical_sections_missing');
});

test('missing checksums is rejected', () => {
  const backup = validBackup();
  delete backup.checksums;
  expectInvalid(inspectBackupData(backup), 'backup_logical_sections_missing');
});

// ---------------------------------------------------------------------------
// 3. Duplicate IDs in every logical collection
// ---------------------------------------------------------------------------

for (const key of COLLECTION_KEYS) {
  test(`duplicate IDs in ${key} are rejected`, () => {
    const input = baseInput();
    input[key].push(clone(input[key][0]));
    const duplicateId = input[key][0].id;
    const result = inspectBackupData(buildFinancialBackup(input));
    expectInvalid(result, `backup_${key}_duplicate_ids:${duplicateId}`);
  });
}

// ---------------------------------------------------------------------------
// 4. Missing IDs in every logical collection
// ---------------------------------------------------------------------------

for (const key of COLLECTION_KEYS) {
  test(`missing id in ${key} item is rejected`, () => {
    const input = baseInput();
    delete input[key][0].id;
    const result = inspectBackupData(buildFinancialBackup(input));
    expectInvalid(result, `backup_${key}_id_missing:0`);
  });
}

// Also cover a non-object collection item.
for (const key of COLLECTION_KEYS) {
  test(`non-object item in ${key} is rejected`, () => {
    const input = baseInput();
    input[key][0] = null;
    const result = inspectBackupData(buildFinancialBackup(input));
    expectInvalid(result, `backup_${key}_item_invalid:0`);
  });
}

// ---------------------------------------------------------------------------
// 5. Currency / rate corruption
// ---------------------------------------------------------------------------
// IMPORTANT CURRENT-CODE FACT:
// inspectBackupData has no semantic currency-code validator and no positive-rate
// validator. The only literal errors available today for tampered currencies or
// rates are checksum mismatches. The first two tests prove tampering is caught
// when the original checksum is retained. The following two tests lock in the
// CURRENT VULNERABILITY: a coherent/re-signed malformed section is accepted.
// These are evidence tests, not desired-behavior tests.

test('tampered malformed currency section is detected by currencies checksum', () => {
  const backup = validBackup();
  backup.currencies.push('US');
  expectInvalid(inspectBackupData(backup), 'backup_checksum_mismatch:currencies');
});

test('tampered non-positive exchange rate is detected by rates checksum', () => {
  const backup = validBackup();
  backup.rates.push({
    id: 'forged-rate',
    transactionId: 'tx-1',
    baseCurrency: 'IQD',
    quoteCurrency: 'USD',
    rate: 0,
    rateDate: '2026-08-01',
    source: 'forged',
  });
  expectInvalid(inspectBackupData(backup), 'backup_checksum_mismatch:rates');
});

// Was a KNOWN GAP asserting acceptance. Closed 2026-08-20: a re-signed checksum makes
// a forged section internally coherent, so checksums alone can never catch this — the
// value itself has to be checked. 'US' is two letters and names no currency.
test('coherent malformed currency code is rejected', () => {
  const backup = validBackup();
  backup.currencies = ['IQD', 'US', 'USD'];
  resignLogicalSections(backup);
  expectInvalid(inspectBackupData(backup), 'backup_currency_code_invalid:1');
});

// The check is case-insensitive on purpose: the defect is length, not casing, and
// refusing lowercase would block older backups written before normalisation.
test('lowercase currency codes still restore', () => {
  const backup = validBackup();
  backup.currencies = ['iqd', 'usd'];
  resignLogicalSections(backup);
  const result = inspectBackupData(backup);
  assert.equal(
    result.errors.some(code => String(code).startsWith('backup_currency_code_invalid')),
    false,
    `lowercase codes must not be refused: ${JSON.stringify(result.errors)}`,
  );
});

// Was a KNOWN GAP asserting acceptance. Closed 2026-08-20: a zero rate is not a rate.
// Any conversion using it destroys the amount or flips its sign.
test('coherent non-positive exchange rate is rejected', () => {
  const backup = validBackup();
  backup.rates.push({
    id: 'forged-rate',
    transactionId: 'tx-1',
    baseCurrency: 'IQD',
    quoteCurrency: 'USD',
    rate: 0,
    rateDate: '2026-08-01',
    source: 'forged',
  });
  resignLogicalSections(backup);
  // Assert the code, not the index: the fixture already carries rates, so the forged
  // entry lands wherever the array happens to end.
  const result = inspectBackupData(backup);
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some(code => String(code).startsWith('backup_rate_not_positive')),
    `expected a non-positive rate error; got ${JSON.stringify(result.errors)}`,
  );
});

// ---------------------------------------------------------------------------
// 6. Transfer references unknown wallets
// ---------------------------------------------------------------------------

test('transfer with unknown fromWalletId is rejected', () => {
  const input = baseInput();
  input.trans[1].fromWalletId = 'wallet-missing';
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_transfer_wallet_unknown:1');
});

test('transfer with unknown toWalletId is rejected', () => {
  const input = baseInput();
  input.trans[1].toWalletId = 'wallet-missing';
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_transfer_wallet_unknown:1');
});

test('transfer missing wallet reference is rejected', () => {
  const input = baseInput();
  delete input.trans[1].fromWalletId;
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_transfer_wallet_missing:1');
});

test('transfer is rejected when backup has no wallets', () => {
  const input = baseInput();
  input.trans = [input.trans[1]];
  input.wallets = [];
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_transfer_without_wallets:0');
});

// ---------------------------------------------------------------------------
// 7. Normal transaction references unknown wallet
// ---------------------------------------------------------------------------

test('normal transaction with unknown walletId is rejected', () => {
  const input = baseInput();
  input.trans[0].walletId = 'wallet-missing';
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_transaction_wallet_unknown:0');
});

// ---------------------------------------------------------------------------
// 8. Commitment references unknown wallet
// ---------------------------------------------------------------------------

test('commitment with unknown walletId is rejected', () => {
  const input = baseInput();
  input.commitments[0].walletId = 'wallet-missing';
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_commitment_wallet_unknown:0');
});

// ---------------------------------------------------------------------------
// 9. Every v10 checksum is independently enforced
// ---------------------------------------------------------------------------

for (const key of ['financialData', 'financialConfig', 'currencies', 'rates', 'budgets', 'archives']) {
  test(`checksum mismatch for ${key} is rejected independently`, () => {
    const backup = validBackup();
    backup.checksums[key] = 'fnv1a32:00000000:0';
    const result = inspectBackupData(backup);
    expectInvalid(result, `backup_checksum_mismatch:${key}`);
    for (const other of ['financialData', 'financialConfig', 'currencies', 'rates', 'budgets', 'archives']) {
      if (other !== key) {
        assert.equal(
          result.errors.includes(`backup_checksum_mismatch:${other}`),
          false,
          `Unexpected checksum error for ${other}: ${JSON.stringify(result.errors)}`,
        );
      }
    }
  });
}

// ---------------------------------------------------------------------------
// 10. manifest.collections counts must match actual arrays
// ---------------------------------------------------------------------------

for (const key of COLLECTION_KEYS) {
  test(`manifest.collections.${key} mismatch is rejected`, () => {
    const backup = validBackup();
    backup.manifest.collections[key] += 1;
    const result = inspectBackupData(backup);
    expectInvalid(result, `backup_manifest_count_mismatch:${key}`);
  });
}

// Flat/structured parity is a second independent guard.
for (const key of COLLECTION_KEYS) {
  test(`flat ${key} collection mismatch against financialData is rejected`, () => {
    const backup = validBackup();
    backup[key].push({ id: `${key}-flat-only` });
    const result = inspectBackupData(backup);
    expectInvalid(result, `backup_flat_collection_mismatch:${key}`);
  });
}

// ---------------------------------------------------------------------------
// 11. Cold archive structural corruption
// ---------------------------------------------------------------------------

test('cold archive with non-numeric year is rejected', () => {
  const input = baseInput();
  input.coldArchives[0].year = 'not-a-year';
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_cold_archive_invalid:0');
});

test('cold archive without data object is rejected', () => {
  const input = baseInput();
  delete input.coldArchives[0].data;
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_cold_archive_invalid:0');
});

test('cold archive with non-array data.trans is rejected', () => {
  const input = baseInput();
  input.coldArchives[0].data.trans = { id: 'not-an-array' };
  const result = inspectBackupData(buildFinancialBackup(input));
  expectInvalid(result, 'backup_cold_archive_transactions_invalid:0');
});

test('coldArchives top-level non-array is rejected', () => {
  const backup = validBackup();
  backup.coldArchives = {};
  resignLogicalSections(backup);
  expectInvalid(inspectBackupData(backup), 'backup_cold_archives_not_array');
});

// Related archive manifest/metadata guards.
test('archiveMetadata mismatch is rejected', () => {
  const backup = validBackup();
  backup.archiveMetadata[0].checksum = 'tampered';
  expectInvalid(inspectBackupData(backup), 'backup_archive_metadata_mismatch');
});

test('manifest archiveYears mismatch is rejected', () => {
  const backup = validBackup();
  backup.manifest.archiveYears += 1;
  expectInvalid(inspectBackupData(backup), 'backup_manifest_archive_count_mismatch');
});

// ---------------------------------------------------------------------------
// Budget/config coherence
// ---------------------------------------------------------------------------

test('budgets inconsistent with financialConfig are rejected', () => {
  const backup = validBackup();
  backup.budgets.current['cat-1'] += 1;
  // Re-sign the budget section so this proves semantic coherence is checked
  // independently from the checksum guard.
  resignLogicalSections(backup);
  expectInvalid(inspectBackupData(backup), 'backup_budget_config_mismatch');
});

// ---------------------------------------------------------------------------
// Warnings that should not invalidate an otherwise valid backup
// ---------------------------------------------------------------------------

test('legacy notif section is ignored with warning', () => {
  const backup = validBackup();
  backup.notif = { daily: { enabled: true } };
  const result = inspectBackupData(backup);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.includes('backup_legacy_notifications_ignored'));
});

test('legacy cfg section is filtered with warning', () => {
  const backup = validBackup();
  backup.cfg = { someLegacySetting: true };
  const result = inspectBackupData(backup);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.includes('backup_legacy_settings_filtered'));
});

test('same-wallet transfer produces warning but not an error', () => {
  const input = baseInput();
  input.trans = [{
    ...input.trans[1],
    id: 'tx-same-wallet',
    fromWalletId: 'wallet-1',
    toWalletId: 'wallet-1',
    fromCurrency: 'IQD',
    toCurrency: 'IQD',
  }];
  const result = inspectBackupData(buildFinancialBackup(input));
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.ok(result.warnings.includes('backup_transfer_same_wallet:0'));
});
