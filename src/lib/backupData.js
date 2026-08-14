export const MYFI_BACKUP_DATA_VERSION = 10;
export const MYFI_BACKUP_KIND = 'myfi_financial_backup';
export const MYFI_BACKUP_FORMAT = 'MYFI_LOGICAL_BACKUP';

const COLLECTION_KEYS = ['trans', 'debts', 'goals', 'wallets', 'commitments', 'cats'];
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);

const duplicateIds = (items = []) => {
  const seen = new Set();
  const duplicates = new Set();
  (Array.isArray(items) ? items : []).forEach(item => {
    const id = item?.id;
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    else seen.add(id);
  });
  return [...duplicates];
};

const safeCloneObject = value => (isObject(value) ? { ...value } : {});

const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    if (value[key] !== undefined) result[key] = stableValue(value[key]);
    return result;
  }, {});
};

const logicalChecksum = value => {
  const input = JSON.stringify(stableValue(value));
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, '0')}:${input.length}`;
};

const backupCurrencies = ({ trans = [], wallets = [], cfg = {} }) => [...new Set([
  cfg.currency || 'IQD',
  ...wallets.map(item => item?.currency),
  ...trans.flatMap(item => [item?.walletCurrency, item?.currencyCode, item?.fromCurrency, item?.toCurrency, item?.baseCurrencyCode]),
].filter(Boolean).map(item => String(item).toUpperCase()))].sort();

const backupRates = trans => (Array.isArray(trans) ? trans : []).flatMap(item => {
  if (!item?.id) return [];
  const rows = [];
  const addRate = (id, baseCurrency, quoteCurrency, rate, source = item.rateSource || 'preserved') => {
    const base = String(baseCurrency || '').toUpperCase();
    const quote = String(quoteCurrency || '').toUpperCase();
    const value = Number(rate);
    if (!/^[A-Z]{3}$/.test(base) || !/^[A-Z]{3}$/.test(quote) || base === quote || !(value > 0)) return;
    rows.push({
      id: `${item.id}:${id}`, transactionId: item.id, baseCurrency: base, quoteCurrency: quote,
      rate: value, rateDate: item.rateDate || item.dateISO, source,
    });
  };
  if (item.kind === 'transfer') {
    addRate('transfer-rate', item.fromCurrency, item.toCurrency, item.transferRate || item.exchangeRate);
    addRate('from-to-base-rate', item.fromCurrency, item.baseCurrencyCode, item.fromBaseRate);
    addRate('to-to-base-rate', item.toCurrency, item.baseCurrencyCode, item.toBaseRate);
  } else if (Number(item.exchangeRate) > 0 && item.walletCurrency && item.baseCurrencyCode && item.walletCurrency !== item.baseCurrencyCode) {
    addRate('wallet-to-base-rate', item.walletCurrency, item.baseCurrencyCode, item.exchangeRate);
  }
  return rows;
});

export const pickFinancialBackupConfig = (cfg = {}) => ({
  currency: cfg.currency || 'IQD',
  profileType: cfg.profileType || 'personal',
  activeScope: cfg.activeScope || 'personal',
  enabledModules: safeCloneObject(cfg.enabledModules),
  defaultWalletId: cfg.defaultWalletId || null,
  categoryBudgets: safeCloneObject(cfg.categoryBudgets),
  categoryBudgetsByMonth: safeCloneObject(cfg.categoryBudgetsByMonth),
  archiveSummaries: Array.isArray(cfg.archiveSummaries) ? cfg.archiveSummaries.map(item => ({ ...item })) : [],
});

export const mergeFinancialBackupConfig = (currentCfg = {}, incoming = {}) => {
  const source = isObject(incoming) ? incoming : {};
  return {
    ...currentCfg,
    ...(source.currency ? { currency: source.currency } : {}),
    ...(source.profileType ? { profileType: source.profileType } : {}),
    ...(source.activeScope ? { activeScope: source.activeScope } : {}),
    ...(isObject(source.enabledModules) ? { enabledModules: { ...currentCfg.enabledModules, ...source.enabledModules } } : {}),
    ...(Object.prototype.hasOwnProperty.call(source, 'defaultWalletId') ? { defaultWalletId: source.defaultWalletId || null } : {}),
    ...(isObject(source.categoryBudgets) ? { categoryBudgets: { ...source.categoryBudgets } } : {}),
    ...(isObject(source.categoryBudgetsByMonth) ? { categoryBudgetsByMonth: { ...source.categoryBudgetsByMonth } } : {}),
    ...(Array.isArray(source.archiveSummaries) ? { archiveSummaries: source.archiveSummaries.map(item => ({ ...item })) } : {}),
    demoMode: false,
  };
};

export const buildFinancialBackup = ({
  trans = [],
  debts = [],
  goals = [],
  wallets = [],
  commitments = [],
  cats = [],
  coldArchives = [],
  cfg = {},
} = {}) => {
  const exportedAt = new Date().toISOString();
  const archives = Array.isArray(coldArchives) ? coldArchives : [];
  const financialConfig = pickFinancialBackupConfig(cfg);
  const financialData = { trans, debts, goals, wallets, commitments, cats };
  const currencies = backupCurrencies({ trans: [...trans, ...archives.flatMap(item => item?.data?.trans || [])], wallets, cfg });
  const rates = backupRates([...trans, ...archives.flatMap(item => item?.data?.trans || [])]);
  const budgets = {
    current: safeCloneObject(cfg.categoryBudgets),
    byMonth: safeCloneObject(cfg.categoryBudgetsByMonth),
  };
  const archiveMetadata = archives.map(item => ({
    year: item.year, scope: item.scope, checksum: item.checksum || '', summary: item.summary || {},
  }));
  const checksums = {
    financialData: logicalChecksum(financialData),
    financialConfig: logicalChecksum(financialConfig),
    currencies: logicalChecksum(currencies),
    rates: logicalChecksum(rates),
    budgets: logicalChecksum(budgets),
    archives: logicalChecksum(archives),
  };
  return {
    kind: MYFI_BACKUP_KIND,
    v: MYFI_BACKUP_DATA_VERSION,
    schemaVersion: MYFI_BACKUP_DATA_VERSION,
    exportedAt,
    manifest: {
      format: MYFI_BACKUP_FORMAT,
      schemaVersion: MYFI_BACKUP_DATA_VERSION,
      financialEngineVersion: 7,
      createdAt: exportedAt,
      collections: Object.fromEntries(Object.entries(financialData).map(([key, value]) => [key, value.length])),
      archiveYears: archiveMetadata.length,
      checksums,
    },
    // Flat collections remain for backward-compatible restore readers. ZIP
    // deflate removes almost all duplication with the structured section.
    ...financialData,
    financialData,
    currencies,
    rates,
    budgets,
    archiveMetadata,
    checksums,
    coldArchives: archives,
    financialConfig,
  };
};

export const summarizeBackupData = (data = {}) => {
  const trans = Array.isArray(data.trans) ? data.trans : [];
  const debts = Array.isArray(data.debts) ? data.debts : [];
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const commitments = Array.isArray(data.commitments) ? data.commitments : [];
  const coldArchives = Array.isArray(data.coldArchives) ? data.coldArchives : [];
  const archivedEntries = coldArchives.reduce((sum, archive) => sum + (Array.isArray(archive?.data?.trans) ? archive.data.trans.length : 0), 0);
  const months = [...new Set(
    trans.map(item => String(item?.dateISO || '').slice(0, 7))
      .filter(value => /^\d{4}-\d{2}$/.test(value)),
  )].sort();
  const legacyCfg = isObject(data.cfg) ? data.cfg : {};
  const financialConfig = isObject(data.financialConfig) ? data.financialConfig : legacyCfg;

  return {
    months,
    entries: trans.length + archivedEntries,
    activeEntries: trans.length,
    archivedEntries,
    wallets: wallets.length,
    trackers: debts.length + goals.length,
    debts: debts.length,
    goals: goals.length,
    commitments: commitments.length,
    currency: financialConfig.currency || '',
    legacy: Number(data.v || 0) > 0 && Number(data.v || 0) < MYFI_BACKUP_DATA_VERSION,
  };
};

export const inspectBackupData = (data) => {
  const errors = [];
  const warnings = [];

  if (!isObject(data)) {
    return { valid: false, errors: ['backup_not_object'], warnings, ...summarizeBackupData({}) };
  }

  if (data.v != null) {
    const version = Number(data.v);
    if (!Number.isInteger(version) || version < 1) errors.push('backup_version_invalid');
    else if (version > MYFI_BACKUP_DATA_VERSION) errors.push('backup_version_newer');
  }

  if (Number(data.v || 0) >= MYFI_BACKUP_DATA_VERSION && data.kind && data.kind !== MYFI_BACKUP_KIND) {
    errors.push('backup_kind_invalid');
  }

  if (Number(data.v || 0) >= 10) {
    if (data.manifest?.format !== MYFI_BACKUP_FORMAT || Number(data.manifest?.schemaVersion) !== 10) {
      errors.push('backup_manifest_invalid');
    }
    if (!isObject(data.financialData) || !isObject(data.checksums)) {
      errors.push('backup_logical_sections_missing');
    } else {
      const expected = {
        financialData: logicalChecksum(data.financialData),
        financialConfig: logicalChecksum(data.financialConfig || {}),
        currencies: logicalChecksum(data.currencies || []),
        rates: logicalChecksum(data.rates || []),
        budgets: logicalChecksum(data.budgets || {}),
        archives: logicalChecksum(data.coldArchives || []),
      };
      Object.entries(expected).forEach(([key, value]) => {
        if (data.checksums?.[key] !== value || data.manifest?.checksums?.[key] !== value) {
          errors.push(`backup_checksum_mismatch:${key}`);
        }
      });
      COLLECTION_KEYS.forEach(key => {
        if (logicalChecksum(data[key] || []) !== logicalChecksum(data.financialData?.[key] || [])) {
          errors.push(`backup_flat_collection_mismatch:${key}`);
        }
        const expectedCount = Number(data.manifest?.collections?.[key]);
        if (!Number.isInteger(expectedCount) || expectedCount !== (Array.isArray(data.financialData?.[key]) ? data.financialData[key].length : -1)) {
          errors.push(`backup_manifest_count_mismatch:${key}`);
        }
      });
      const configBudgets = {
        current: safeCloneObject(data.financialConfig?.categoryBudgets),
        byMonth: safeCloneObject(data.financialConfig?.categoryBudgetsByMonth),
      };
      if (logicalChecksum(data.budgets || {}) !== logicalChecksum(configBudgets)) {
        errors.push('backup_budget_config_mismatch');
      }
      const expectedArchiveMetadata = (Array.isArray(data.coldArchives) ? data.coldArchives : []).map(item => ({
        year: item.year, scope: item.scope, checksum: item.checksum || '', summary: item.summary || {},
      }));
      if (logicalChecksum(data.archiveMetadata || []) !== logicalChecksum(expectedArchiveMetadata)) {
        errors.push('backup_archive_metadata_mismatch');
      }
      if (Number(data.manifest?.archiveYears) !== expectedArchiveMetadata.length) {
        errors.push('backup_manifest_archive_count_mismatch');
      }
    }
  }

  if (data.notif != null) warnings.push('backup_legacy_notifications_ignored');
  if (data.cfg != null) warnings.push('backup_legacy_settings_filtered');

  COLLECTION_KEYS.forEach(key => {
    if (data[key] != null && !Array.isArray(data[key])) errors.push(`backup_${key}_not_array`);
  });

  COLLECTION_KEYS.forEach(key => {
    const list = Array.isArray(data[key]) ? data[key] : [];
    list.forEach((item, index) => {
      if (!isObject(item)) errors.push(`backup_${key}_item_invalid:${index}`);
      else if (!item.id) errors.push(`backup_${key}_id_missing:${index}`);
    });
    const duplicates = duplicateIds(list);
    if (duplicates.length) errors.push(`backup_${key}_duplicate_ids:${duplicates.slice(0, 3).join(',')}`);
  });

  if (data.coldArchives != null && !Array.isArray(data.coldArchives)) {
    errors.push('backup_cold_archives_not_array');
  } else {
    (Array.isArray(data.coldArchives) ? data.coldArchives : []).forEach((archive, index) => {
      if (!isObject(archive) || !Number.isInteger(Number(archive.year)) || !isObject(archive.data)) {
        errors.push(`backup_cold_archive_invalid:${index}`);
        return;
      }
      if (!Array.isArray(archive.data.trans)) errors.push(`backup_cold_archive_transactions_invalid:${index}`);
    });
  }

  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const walletIds = new Set(wallets.map(item => item?.id).filter(Boolean));

  (Array.isArray(data.trans) ? data.trans : []).forEach((tx, index) => {
    if (!isObject(tx)) return;

    if (tx.kind === 'transfer') {
      if (!tx.fromWalletId || !tx.toWalletId) {
        errors.push(`backup_transfer_wallet_missing:${index}`);
        return;
      }
      if (!walletIds.size) {
        errors.push(`backup_transfer_without_wallets:${index}`);
        return;
      }
      if (!walletIds.has(tx.fromWalletId) || !walletIds.has(tx.toWalletId)) {
        errors.push(`backup_transfer_wallet_unknown:${index}`);
      }
      if (tx.fromWalletId === tx.toWalletId) warnings.push(`backup_transfer_same_wallet:${index}`);
      return;
    }

    if (tx.walletId && walletIds.size && !walletIds.has(tx.walletId)) {
      warnings.push(`backup_transaction_wallet_repaired:${index}`);
    }
  });

  (Array.isArray(data.commitments) ? data.commitments : []).forEach((item, index) => {
    if (item?.walletId && walletIds.size && !walletIds.has(item.walletId)) {
      warnings.push(`backup_commitment_wallet_repaired:${index}`);
    }
  });

  return { valid: errors.length === 0, errors, warnings, ...summarizeBackupData(data) };
};

export const normalizeBackupNotifications = (notif = {}, defaults = {}) => Object.fromEntries(
  Object.entries(defaults || {}).map(([key, fallback]) => [
    key,
    {
      ...(isObject(fallback) ? fallback : {}),
      ...(isObject(notif?.[key]) ? notif[key] : {}),
    },
  ]),
);

export const sanitizeBackupCategories = (cats = [], fallback = []) => {
  const seen = new Set();
  const cleaned = (Array.isArray(cats) ? cats : [])
    .filter(item => isObject(item) && item.id && !seen.has(item.id) && seen.add(item.id))
    .map(item => ({ ...item }));

  const fallbackRows = (Array.isArray(fallback) ? fallback : [])
    .filter(item => isObject(item) && item.id);

  if (!cleaned.length) return fallbackRows.map(item => ({ ...item }));

  if (!cleaned.some(item => item.id === 'other')) {
    const other = fallbackRows.find(item => item.id === 'other');
    if (other) cleaned.push({ ...other });
  }

  return cleaned;
};
