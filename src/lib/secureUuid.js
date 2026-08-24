import * as Crypto from 'expo-crypto';

const bytesToUuidV4 = (source) => {
  const bytes = source instanceof Uint8Array ? source.slice(0, 16) : Uint8Array.from(source || []).slice(0, 16);
  if (bytes.length !== 16) throw new Error('secure_uuid_entropy_unavailable');
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

// Use the long-standing random-bytes bridge instead of relying on randomUUID's
// optional native method being present in every installed Expo binary.
export const createSecureUuidV4 = () => {
  if (typeof Crypto.getRandomBytes !== 'function') throw new Error('secure_uuid_generation_unavailable');
  return bytesToUuidV4(Crypto.getRandomBytes(16));
};
