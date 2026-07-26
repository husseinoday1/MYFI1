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

export const readVaultSnapshot = async (namespace = GUEST_NAMESPACE) => {
  const key = vaultKey(namespace);
  try {
    const current = await storage.getItem(key);
    const decoded = await decodeSnapshot(current, namespace);
    if (decoded) return { snapshot: decoded, recovered: false };
  } catch {}

  try {
    const previous = await storage.getItem(`${key}${PREVIOUS_SUFFIX}`);
    const decoded = await decodeSnapshot(previous, namespace);
    if (decoded) return { snapshot: decoded, recovered: true };
  } catch {}

  return { snapshot: null, recovered: false };
};

export const writeVaultSnapshot = async (namespace = GUEST_NAMESPACE, snapshot = {}) => {
  const key = vaultKey(namespace);
  const masterKey = await getOrCreateMasterKey();
  const envelope = JSON.stringify(encryptString(JSON.stringify(snapshot), masterKey, key));
  const current = await storage.getItem(key);
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
  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove([key, `${key}${PREVIOUS_SUFFIX}`]);
    return;
  }
  await Promise.all([
    storage.removeItem(key),
    storage.removeItem(`${key}${PREVIOUS_SUFFIX}`),
  ]);
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
