export const MYFI_BACKUP_DATA_VERSION = 7;

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

export const summarizeBackupData = (data = {}) => {
  const trans = Array.isArray(data.trans) ? data.trans : [];
  const debts = Array.isArray(data.debts) ? data.debts : [];
  const goals = Array.isArray(data.goals) ? data.goals : [];
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const commitments = Array.isArray(data.commitments) ? data.commitments : [];
  const months = [...new Set(
    trans.map(item => String(item?.dateISO || '').slice(0, 7))
      .filter(value => /^\d{4}-\d{2}$/.test(value)),
  )].sort();

  return {
    months,
    entries: trans.length,
    wallets: wallets.length,
    trackers: debts.length + goals.length,
    debts: debts.length,
    goals: goals.length,
    commitments: commitments.length,
    currency: data.cfg?.currency || '',
    name: data.cfg?.name || 'MYFI',
  };
};

export const inspectBackupData = (data, { requireConfig = true } = {}) => {
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

  if (requireConfig && !isObject(data.cfg)) errors.push('backup_config_missing');
  if (data.notif != null && !isObject(data.notif)) errors.push('backup_notifications_invalid');

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

    // Ordinary entries can be repaired safely by prepareWalletData.
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
