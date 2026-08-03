import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SQLiteStorage from 'expo-sqlite/kv-store';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import {
  base64ToBytes,
  bytesToBase64,
  decryptString,
  encryptString,
  randomKey,
} from './cryptoBox';

const VAULT_KEY_ID = 'MYFI_VAULT_MASTER_KEY_V1';
const WEB_KEY_ID = 'MYFI_WEB_VAULT_MASTER_KEY_V1';
const DEVICE_ID = 'MYFI_DEVICE_ID_V1';
const VAULT_PREFIX = 'MYFI_ENCRYPTED_SNAPSHOT_V1';
const AUTH_PREFIX = 'MYFI_ENCRYPTED_AUTH_V1';
const PREVIOUS_SUFFIX = ':previous';
const BACKUP_SUFFIXES = [':previous:1', ':previous:2', ':previous:3'];

export const GUEST_NAMESPACE = 'guest';
export const namespaceForUser = (user) => user?.id ? `user:${user.id}` : GUEST_NAMESPACE;

const storage = Platform.OS === 'web' ? AsyncStorage : SQLiteStorage;
const vaultKey = namespace => `${VAULT_PREFIX}:${String(namespace || GUEST_NAMESPACE)}`;

let cachedMasterKey = null;

const secureStoreAvailable = async () => (
  Platform.OS !== 'web' && await SecureStore.isAvailableAsync()
);

const getOrCreateMasterKey = async () => {
  if (cachedMasterKey) return cachedMasterKey;
  const secure = await secureStoreAvailable();
  const keyId = secure ? VAULT_KEY_ID : WEB_KEY_ID;
  const existing = secure
    ? await SecureStore.getItemAsync(keyId)
    : await AsyncStorage.getItem(keyId);
  if (existing) {
    cachedMasterKey = base64ToBytes(existing);
    return cachedMasterKey;
  }
  cachedMasterKey = randomKey();
  const encoded = bytesToBase64(cachedMasterKey);
  if (secure) {
    await SecureStore.setItemAsync(keyId, encoded, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } else {
    await AsyncStorage.setItem(keyId, encoded);
  }
  return cachedMasterKey;
};

const decodeSnapshot = async (raw, namespace) => {
  if (!raw) return null;
  const envelope = JSON.parse(raw);
  const key = await getOrCreateMasterKey();
  return JSON.parse(decryptString(envelope, key, vaultKey(namespace)));
};

const hasFinancialData = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const data = snapshot.data || snapshot;
  return (
    (Array.isArray(data.trans) && data.trans.length > 0)
    || (Array.isArray(data.debts) && data.debts.length > 0)
    || (Array.isArray(data.goals) && data.goals.length > 0)
    || (Array.isArray(data.commitments) && data.commitments.length > 0)
  );
};

const isSnapshotEmpty = (snapshot) => !hasFinancialData(snapshot);

export const readVaultSnapshot = async (namespace = GUEST_NAMESPACE) => {
  const key = vaultKey(namespace);
  const readBackup = async (backupKey, index) => {
    try {
      const raw = await storage.getItem(backupKey);
      const decoded = await decodeSnapshot(raw, namespace);
      if (decoded) return { snapshot: decoded, recovered: true, backupIndex: index, hasRaw: !!raw };
    } catch (e) {
      console.warn(`[Vault] Backup #${index} unreadable:`, e?.message);
    }
    return null;
  };

  try {
    const currentRaw = await storage.getItem(key);
    const decoded = await decodeSnapshot(currentRaw, namespace);
    if (decoded) return { snapshot: decoded, recovered: false, hasRaw: !!currentRaw };
  } catch (e) {
    console.warn('[Vault] Current snapshot unreadable:', e?.message);
  }

  for (let index = 1; index <= 3; index += 1) {
    const result = await readBackup(`${key}${PREVIOUS_SUFFIX}:${index}`, index);
    if (result) return result;
  }

  return { snapshot: null, recovered: false, hasRaw: false };
};

export const writeVaultSnapshot = async (namespace = GUEST_NAMESPACE, snapshot = {}, options = {}) => {
  const key = vaultKey(namespace);
  const masterKey = await getOrCreateMasterKey();
  const current = await storage.getItem(key);
  if (current && isSnapshotEmpty(snapshot)) {
    let currentHasData = true;
    try {
      const decodedCurrent = await decodeSnapshot(current, namespace);
      currentHasData = hasFinancialData(decodedCurrent);
    } catch {
      currentHasData = true;
    }
    if (currentHasData && !options.force) {
      throw new Error('snapshot_empty_overwrite_denied');
    }
  }
  const envelope = JSON.stringify(encryptString(JSON.stringify(snapshot), masterKey, key));
  if (current) await storage.setItem(`${key}${PREVIOUS_SUFFIX}`, current);
  await storage.setItem(key, envelope);
  return true;
};

export const hasVaultSnapshot = async (namespace = GUEST_NAMESPACE) => {
  const result = await readVaultSnapshot(namespace);
  return !!result.snapshot;
};

export const clearVaultSnapshot = async (namespace = GUEST_NAMESPACE) => {
  const key = vaultKey(namespace);
  const backupKeys = BACKUP_SUFFIXES.map(suffix => `${key}${suffix}`);
  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove([key, ...backupKeys]);
    return;
  }
  await Promise.all([storage.removeItem(key), ...backupKeys.map(item => storage.removeItem(item))]);
};

export const getOrCreateDeviceId = async () => {
  const secure = await secureStoreAvailable();
  const existing = secure
    ? await SecureStore.getItemAsync(DEVICE_ID)
    : await AsyncStorage.getItem(DEVICE_ID);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  if (secure) {
    await SecureStore.setItemAsync(DEVICE_ID, id, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } else {
    await AsyncStorage.setItem(DEVICE_ID, id);
  }
  return id;
};

const authStorageKey = key => `${AUTH_PREFIX}:${String(key || '')}`;

export const secureAuthStorage = {
  getItem: async (key) => {
    const encryptedKey = authStorageKey(key);
    const raw = await storage.getItem(encryptedKey);
    if (raw) {
      try {
        const masterKey = await getOrCreateMasterKey();
        return decryptString(JSON.parse(raw), masterKey, encryptedKey);
      } catch {
        await storage.removeItem(encryptedKey);
      }
    }

    // One-time migration from the previous plaintext AsyncStorage auth session.
    const legacy = await AsyncStorage.getItem(key);
    if (!legacy) return null;
    await secureAuthStorage.setItem(key, legacy);
    await AsyncStorage.removeItem(key);
    return legacy;
  },
  setItem: async (key, value) => {
    const encryptedKey = authStorageKey(key);
    const masterKey = await getOrCreateMasterKey();
    const envelope = encryptString(String(value ?? ''), masterKey, encryptedKey);
    await storage.setItem(encryptedKey, JSON.stringify(envelope));
  },
  removeItem: async (key) => {
    await Promise.all([
      storage.removeItem(authStorageKey(key)),
      AsyncStorage.removeItem(key),
    ]);
  },
};
