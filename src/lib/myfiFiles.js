import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { deflateSync, inflateSync, strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { decryptStringWithPassword, encryptStringWithPassword } from './cryptoBox';
import { getTransactionDisplayAmount } from './modules';
import { inspectBackupData, MYFI_BACKUP_DATA_VERSION } from './backupData';
import { PRODUCT_FILE_PREFIX, PRODUCT_NAME } from './productIdentity';

export const MYFI_SCHEMA_VERSION = 1;
export const MYFI_FORMAT = 'MYFI';

const utf8 = (value) => strToU8(String(value ?? ''));
const text = (value) => strFromU8(value);
const sha256 = (value) => Crypto.digestStringAsync(
  Crypto.CryptoDigestAlgorithm.SHA256,
  String(value ?? ''),
);

const bytesToBase64 = (bytes) => {
  let binary = '';
  const size = 0x8000;
  for (let index = 0; index < bytes.length; index += size) {
    binary += String.fromCharCode(...bytes.subarray(index, index + size));
  }
  return globalThis.btoa(binary);
};
const cleanBase64 = (value) => String(value || '')
  .replace(/^data:[^,]+,/, '')
  .replace(/\s/g, '')
  .trim();

const base64ToBytes = (value) => {
  const source = cleanBase64(value);
  const binary = globalThis.atob(source);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const hasZipSignature = (base64) => {
  try {
    const bytes = base64ToBytes(base64);
    return bytes[0] === 0x50 && bytes[1] === 0x4b;
  } catch {
    return false;
  }
};

const readPickedPackageBase64 = async (asset) => {
  const attempts = [];

  const readBase64 = async (uri, label) => {
    if (!uri) return null;
    try {
      const value = cleanBase64(await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      }));
      attempts.push(`${label}:read`);
      if (hasZipSignature(value)) return value;
      attempts.push(`${label}:not_zip`);
      return value;
    } catch (error) {
      attempts.push(`${label}:${String(error?.message || 'failed')}`);
      return null;
    }
  };

  const direct = await readBase64(asset?.uri, 'direct');
  if (direct && hasZipSignature(direct)) return direct;

  if (FileSystem.cacheDirectory && asset?.uri) {
    const target = `${FileSystem.cacheDirectory}myfi-import-${Date.now()}.zip`;
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: target });
      const copied = await readBase64(target, 'cache_copy');
      if (copied && hasZipSignature(copied)) return copied;
    } catch (error) {
      attempts.push(`cache_copy:${String(error?.message || 'failed')}`);
    }
  }

  throw new Error(`Selected file is not a readable ZIP package (${attempts.join(' | ')})`);
};

const csvCell = (value) => {
  const source = String(value ?? '');
  return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
};

export const transactionsToCsv = (trans = [], currency = '') => {
  const columns = [
    'app', 'id', 'date', 'flow_type', 'title', 'amount', 'currency',
    'transaction_tag', 'category_id', 'wallet_id', 'from_wallet_id', 'to_wallet_id',
    'transfer_amount', 'scope', 'note',
  ];
  const rows = (Array.isArray(trans) ? trans : []).map(item => [
    PRODUCT_NAME,
    item.id,
    item.dateISO,
    item.flowType || item.kind || '',
    item.title,
    getTransactionDisplayAmount(item),
    currency,
    item.transactionTag,
    item.cat,
    item.walletId,
    item.fromWalletId,
    item.toWalletId,
    item.transferAmount,
    item.scope,
    item.note,
  ].map(csvCell).join(','));
  return [columns.join(','), ...rows].join('\r\n');
};

const countData = (data = {}) => ({
  transactions: Array.isArray(data.trans) ? data.trans.length : 0,
  wallets: Array.isArray(data.wallets) ? data.wallets.length : 0,
  debts: Array.isArray(data.debts) ? data.debts.length : 0,
  goals: Array.isArray(data.goals) ? data.goals.length : 0,
  commitments: Array.isArray(data.commitments) ? data.commitments.length : 0,
});

const safeStamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, '-');

export const buildMyfiPackage = async ({
  kind = 'full_backup',
  data = {},
  year = null,
  label = PRODUCT_NAME,
  password = '',
} = {}) => {
  const createdAt = new Date().toISOString();
  const payload = {
    format: MYFI_FORMAT,
    schemaVersion: MYFI_SCHEMA_VERSION,
    kind,
    createdAt,
    appVersion: '1.0.0',
    range: year ? { year: Number(year), from: `${year}-01-01`, to: `${year}-12-31` } : null,
    counts: countData(data),
    data,
  };
  const backupJson = JSON.stringify(payload, null, 2);
  const compactBackupJson = JSON.stringify(payload);
  const transactionsCsv = transactionsToCsv(data.trans, data.cfg?.currency || '');
  const encrypted = !!String(password || '');
  const aad = `${MYFI_FORMAT}:${kind}:${MYFI_SCHEMA_VERSION}`;
  // Password security remains unchanged. For speed, compact + low-level deflate
  // happens BEFORE AES-GCM; compressing encrypted ciphertext is wasted CPU.
  const compressedPlaintext = encrypted
    ? bytesToBase64(deflateSync(utf8(compactBackupJson), { level: 1 }))
    : '';
  const encryptedEnvelope = encrypted
    ? JSON.stringify({
        format: MYFI_FORMAT,
        schemaVersion: MYFI_SCHEMA_VERSION,
        kind,
        encrypted: true,
        compression: 'deflate-base64-v1',
        aad,
        box: await encryptStringWithPassword(compressedPlaintext, password, aad),
      })
    : '';
  const payloadFiles = encrypted
    ? { 'backup.enc': utf8(encryptedEnvelope) }
    : {
        'backup.json': utf8(backupJson),
        'transactions.csv': utf8(transactionsCsv),
      };
  const manifestRows = encrypted
    ? [[await sha256(encryptedEnvelope), 'data/backup.enc']]
    : [
        [await sha256(backupJson), 'data/backup.json'],
        [await sha256(transactionsCsv), 'data/transactions.csv'],
      ];
  const manifest = `${manifestRows.map(([hash, path]) => `${hash}  ${path}`).join('\n')}\n`;
  const backupHash = manifestRows[0][0];
  const bagit = 'BagIt-Version: 1.0\nTag-File-Character-Encoding: UTF-8\n';
  const bagInfo = [
    `Source-Organization: ${label}`,
    `Bagging-Date: ${createdAt.slice(0, 10)}`,
    `External-Identifier: ${MYFI_FORMAT}-${kind}-${createdAt}`,
    `Payload-Oxum: ${Object.values(payloadFiles).reduce((sum, file) => sum + file.length, 0)}.${Object.keys(payloadFiles).length}`,
    `MYFI-Kind: ${kind}`,
    `MYFI-Schema-Version: ${MYFI_SCHEMA_VERSION}`,
    `MYFI-Encrypted: ${encrypted ? 'true' : 'false'}`,
    year ? `MYFI-Year: ${year}` : null,
    '',
  ].filter(value => value !== null).join('\n');
  const tagManifest = [
    `${await sha256(bagit)}  bagit.txt`,
    `${await sha256(bagInfo)}  bag-info.txt`,
    `${await sha256(manifest)}  manifest-sha256.txt`,
    '',
  ].join('\n');
  const zipped = zipSync({
    'bagit.txt': utf8(bagit),
    'bag-info.txt': utf8(bagInfo),
    'manifest-sha256.txt': utf8(manifest),
    'tagmanifest-sha256.txt': utf8(tagManifest),
    data: payloadFiles,
  }, { level: encrypted ? 0 : 6 });
  const prefix = kind === 'year_archive' ? `${PRODUCT_FILE_PREFIX}_Archive_${year}` : `${PRODUCT_FILE_PREFIX}_Backup`;
  return {
    base64: bytesToBase64(zipped),
    fileName: `${prefix}_${safeStamp()}.zip`,
    payload,
    checksum: backupHash,
    encrypted,
  };
};

const manifestEntries = (source = '') => new Map(
  String(source)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const match = line.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
      return match ? [match[2], match[1].toLowerCase()] : [line, null];
    }),
);

export const inspectMyfiPackage = async (base64, { password = '' } = {}) => {
  const normalizedBase64 = cleanBase64(base64);
  if (String(normalizedBase64 || '').length > 70_000_000) throw new Error('MYFI package is too large');
  let files = null;
  try {
    files = unzipSync(base64ToBytes(normalizedBase64));
  } catch (error) {
    throw new Error(`Selected file is not a valid ZIP backup package: ${String(error?.message || 'zip_failed')}`);
  }
  const uncompressedSize = Object.values(files).reduce((sum, file) => sum + Number(file?.length || 0), 0);
  if (uncompressedSize > 100_000_000) throw new Error('MYFI package expands beyond the safety limit');
  const encrypted = !!files['data/backup.enc'];
  const required = ['bagit.txt', 'manifest-sha256.txt', encrypted ? 'data/backup.enc' : 'data/backup.json'];
  required.forEach(path => {
    if (!files[path]) throw new Error(`MYFI package is missing ${path}`);
  });
  const bagDeclaration = text(files['bagit.txt']);
  if (!bagDeclaration.includes('BagIt-Version: 1.0')) throw new Error('Unsupported BagIt package');
  const manifest = manifestEntries(text(files['manifest-sha256.txt']));
  for (const [path, expected] of manifest.entries()) {
    if (!expected || !files[path]) throw new Error(`Invalid manifest entry: ${path}`);
    const actual = await sha256(text(files[path]));
    if (actual.toLowerCase() !== expected) throw new Error(`Checksum failed: ${path}`);
  }
  if (files['tagmanifest-sha256.txt']) {
    const tagManifest = manifestEntries(text(files['tagmanifest-sha256.txt']));
    for (const [path, expected] of tagManifest.entries()) {
      if (!expected || !files[path]) throw new Error(`Invalid tag manifest entry: ${path}`);
      const actual = await sha256(text(files[path]));
      if (actual.toLowerCase() !== expected) throw new Error(`Tag checksum failed: ${path}`);
    }
  }
  let payload = null;
  let encryptedMeta = null;
  if (encrypted) {
    encryptedMeta = JSON.parse(text(files['data/backup.enc']));
    if (
      encryptedMeta?.format !== MYFI_FORMAT
      || encryptedMeta?.encrypted !== true
      || !encryptedMeta?.box
    ) {
      throw new Error('Invalid encrypted MYFI package');
    }
    if (!String(password || '')) {
      return {
        payload: null,
        checksum: manifest.get('data/backup.enc'),
        csv: '',
        encrypted: true,
        passwordRequired: true,
        kind: encryptedMeta.kind,
      };
    }
    try {
      const decrypted = await decryptStringWithPassword(
        encryptedMeta.box,
        password,
        encryptedMeta.aad || `${MYFI_FORMAT}:${encryptedMeta.kind}:${encryptedMeta.schemaVersion}`,
      );
      payload = encryptedMeta.compression === 'deflate-base64-v1'
        ? JSON.parse(text(inflateSync(base64ToBytes(decrypted))))
        : JSON.parse(decrypted);
    } catch {
      throw new Error('The backup password is incorrect');
    }
  } else {
    payload = JSON.parse(text(files['data/backup.json']));
  }
  if (payload?.format !== MYFI_FORMAT) throw new Error('This is not a MYFI package');
  if (Number(payload.schemaVersion || 0) > MYFI_SCHEMA_VERSION) {
    throw new Error('This backup was created by a newer MYFI version');
  }
  if (!payload?.data || typeof payload.data !== 'object' || Array.isArray(payload.data)) {
    throw new Error('MYFI package has no valid backup data');
  }
  const dataVersion = Number(payload.data.v || 0);
  if (dataVersion > MYFI_BACKUP_DATA_VERSION) {
    throw new Error('This backup data was created by a newer MYFI version');
  }
  const validation = inspectBackupData(payload.data);
  if (!validation.valid) {
    throw new Error('Invalid backup data: ' + (validation.errors[0] || 'unknown'));
  }
  return {
    payload,
    checksum: manifest.get(encrypted ? 'data/backup.enc' : 'data/backup.json'),
    csv: files['data/transactions.csv'] ? text(files['data/transactions.csv']) : '',
    encrypted,
    passwordRequired: false,
    kind: payload.kind,
  };
};

export const shareMyfiPackage = async ({ uri, kind = 'full_backup' } = {}) => {
  if (!uri) throw new Error('MYFI package file is unavailable');
  if (!(await Sharing.isAvailableAsync())) throw new Error('File sharing is unavailable');
  await Sharing.shareAsync(uri, {
    mimeType: 'application/zip',
    UTI: 'public.zip-archive',
    dialogTitle: kind === 'year_archive' ? `${PRODUCT_NAME} Annual Archive` : `${PRODUCT_NAME} Backup`,
  });
  return true;
};

export const saveMyfiPackageToDevice = async ({ base64, fileName, uri, kind = 'year_archive' } = {}) => {
  if (Platform.OS !== 'android') {
    // iOS exposes "Save to Files" through the native share sheet.
    await shareMyfiPackage({ uri, kind });
    return { saved: true, via: 'share' };
  }
  const SAF = FileSystem.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync || !SAF?.createFileAsync) {
    throw new Error('Direct folder saving is unavailable on this device');
  }
  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission?.granted || !permission.directoryUri) return { saved: false, cancelled: true };
  const targetUri = await SAF.createFileAsync(
    permission.directoryUri,
    String(fileName || `${PRODUCT_FILE_PREFIX}_Archive.zip`),
    'application/zip',
  );
  const sourceBase64 = base64 || (uri ? await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }) : '');
  if (!sourceBase64) throw new Error('MYFI package content is unavailable');
  await FileSystem.writeAsStringAsync(targetUri, sourceBase64, { encoding: FileSystem.EncodingType.Base64 });
  return { saved: true, via: 'folder', uri: targetUri };
};

export const exportMyfiPackage = async (options = {}) => {
  const { delivery = 'share', ...buildOptions } = options;
  const built = await buildMyfiPackage(buildOptions);
  const uri = `${FileSystem.documentDirectory}${built.fileName}`;
  await FileSystem.writeAsStringAsync(uri, built.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (delivery === 'share') await shareMyfiPackage({ uri, kind: buildOptions.kind });
  if (delivery === 'save') await saveMyfiPackageToDevice({ ...built, uri, kind: buildOptions.kind });
  return { ...built, uri };
};

export const pickMyfiPackage = async ({ kind = null, password = '' } = {}) => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/zip', 'application/octet-stream'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const asset = result.assets?.[0];
  if (!asset?.uri) return null;
  if (Number(asset.size || 0) > 50_000_000) throw new Error('MYFI package exceeds the 50 MB import limit');
  const base64 = await readPickedPackageBase64(asset);
  const inspected = await inspectMyfiPackage(base64, { password });
  const receivedKind = inspected.payload?.kind || inspected.kind;
  if (kind && receivedKind !== kind) {
    throw new Error(`Expected ${kind}, received ${receivedKind}`);
  }
  return { ...inspected, base64, name: asset.name || '' };
};

export const unlockMyfiPackage = async (picked, password, kind = null) => {
  if (!picked?.base64) throw new Error('Backup file is unavailable');
  const inspected = await inspectMyfiPackage(picked.base64, { password });
  const receivedKind = inspected.payload?.kind || inspected.kind;
  if (kind && receivedKind !== kind) {
    throw new Error(`Expected ${kind}, received ${receivedKind}`);
  }
  return { ...picked, ...inspected, passwordRequired: false };
};
