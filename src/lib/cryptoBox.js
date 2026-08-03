import * as Crypto from 'expo-crypto';
import { gcm } from '@noble/ciphers/aes.js';
import { bytesToUtf8, utf8ToBytes } from '@noble/ciphers/utils.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

export const CRYPTO_BOX_VERSION = 1;
export const CRYPTO_BOX_ALGORITHM = 'A256GCM';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;
const PASSWORD_ITERATIONS = 210_000;

export const bytesToBase64 = (bytes = new Uint8Array()) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return globalThis.btoa(binary);
};

export const base64ToBytes = (value = '') => {
  const binary = globalThis.atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

export const randomKey = () => Crypto.getRandomBytes(KEY_BYTES);

const aadBytes = (aad = '') => utf8ToBytes(String(aad || ''));

export const encryptString = (plainText, key, aad = '') => {
  const nonce = Crypto.getRandomBytes(NONCE_BYTES);
  const cipher = gcm(key, nonce, aadBytes(aad));
  const encrypted = cipher.encrypt(utf8ToBytes(String(plainText ?? '')));
  return {
    v: CRYPTO_BOX_VERSION,
    alg: CRYPTO_BOX_ALGORITHM,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(encrypted),
  };
};

export const decryptString = (box, key, aad = '') => {
  if (!box || Number(box.v) !== CRYPTO_BOX_VERSION || box.alg !== CRYPTO_BOX_ALGORITHM) {
    throw new Error('Unsupported encrypted data format');
  }
  const nonce = base64ToBytes(box.nonce);
  const encrypted = base64ToBytes(box.ciphertext);
  const cipher = gcm(key, nonce, aadBytes(aad));
  return bytesToUtf8(cipher.decrypt(encrypted));
};

export const derivePasswordKey = async (password, salt, iterations = PASSWORD_ITERATIONS) => (
  pbkdf2Async(
    sha256,
    utf8ToBytes(String(password || '')),
    salt,
    { c: Math.max(100_000, Number(iterations || PASSWORD_ITERATIONS)), dkLen: KEY_BYTES },
  )
);

export const encryptStringWithPassword = async (plainText, password, aad = '') => {
  if (!String(password || '')) throw new Error('A backup password is required');
  const salt = Crypto.getRandomBytes(16);
  const key = await derivePasswordKey(password, salt);
  return {
    ...encryptString(plainText, key, aad),
    kdf: 'PBKDF2-SHA256',
    iterations: PASSWORD_ITERATIONS,
    salt: bytesToBase64(salt),
  };
};

export const decryptStringWithPassword = async (box, password, aad = '') => {
  if (box?.kdf !== 'PBKDF2-SHA256' || !box?.salt) {
    throw new Error('Unsupported backup password format');
  }
  const key = await derivePasswordKey(password, base64ToBytes(box.salt), box.iterations);
  return decryptString(box, key, aad);
};
