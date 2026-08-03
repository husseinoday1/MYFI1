import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { decryptStringWithPassword, encryptStringWithPassword } from './cryptoBox';

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

const base64ToBytes = (value) => {
  const binary = globalThis.atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const csvCell = (value) => {
  const source = String(value ?? '');
  return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
};

export const transactionsToCsv = (trans = [], currency = '') => {
  const columns = [
    'id', 'date', 'flow_type', 'title', 'amount', 'currency',
    'transaction_tag', 'category_id', 'wallet_id', 'from_wallet_id', 'to_wallet_id',
    'transfer_amount', 'scope', 'note',
  ];
  const rows = (Array.isArray(trans) ? trans : []).map(item => [
    item.id,
    item.dateISO,
    item.flowType || item.kind || '',
    item.title,
    item.amt,
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
  label = 'MYFI',
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
  const transactionsCsv = transactionsToCsv(data.trans, data.cfg?.currency || '');
  const encrypted = !!String(password || '');
  const aad = `${MYFI_FORMAT}:${kind}:${MYFI_SCHEMA_VERSION}`;
  const encryptedEnvelope = encrypted
    ? JSON.stringify({
        format: MYFI_FORMAT,
        schemaVersion: MYFI_SCHEMA_VERSION,
        kind,
        encrypted: true,
        aad,
        box: await encryptStringWithPassword(backupJson, password, aad),
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
  }, { level: 6 });
  const prefix = kind === 'year_archive' ? `MYFI_Archive_${year}` : 'MYFI_Backup';
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
  if (String(base64 || '').length > 70_000_000) throw new Error('MYFI package is too large');
  const files = unzipSync(base64ToBytes(base64));
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
      payload = JSON.parse(await decryptStringWithPassword(
        encryptedMeta.box,
        password,
        encryptedMeta.aad || `${MYFI_FORMAT}:${encryptedMeta.kind}:${encryptedMeta.schemaVersion}`,
      ));
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
  return {
    payload,
    checksum: manifest.get(encrypted ? 'data/backup.enc' : 'data/backup.json'),
    csv: files['data/transactions.csv'] ? text(files['data/transactions.csv']) : '',
    encrypted,
    passwordRequired: false,
    kind: payload.kind,
  };
};

export const exportMyfiPackage = async (options = {}) => {
  const built = await buildMyfiPackage(options);
  const uri = `${FileSystem.documentDirectory}${built.fileName}`;
  await FileSystem.writeAsStringAsync(uri, built.base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/zip',
      UTI: 'public.zip-archive',
      dialogTitle: options.kind === 'year_archive' ? 'MYFI Annual Archive' : 'MYFI Backup',
    });
  }
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
  const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
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
