// Phase 10 — proof binding shared by the isolated local/cloud restore coordinator.
// Supabase receives only the opaque digest. The semantic hash and row counts remain
// local, so the cloud event proves which stage was authorized without becoming a
// second financial manifest.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS } from './financialBackupV11';

export const CANONICAL_RESTORE_PROOF_V11_DOMAIN = 'MYFI:P10-012:RESTORE-PROOF:V1';

const text = value => String(value ?? '').trim();
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const validHash = value => /^[a-f0-9]{64}$/i.test(text(value));
const validUuid = value => (
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
);
const normalizedCounts = counts => {
  if (!isObject(counts)
      || Object.keys(counts).length !== CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS.length) {
    return null;
  }
  const result = {};
  for (const key of CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(counts, key)
        || !Number.isSafeInteger(Number(counts[key]))
        || Number(counts[key]) < 0) {
      return null;
    }
    result[key] = Number(counts[key]);
  }
  return result;
};

export const isCanonicalRestoreOperationIdV11 = validUuid;

export const deriveCanonicalRestoreProofDigestV11 = ({
  operationId,
  ledgerId,
  fromEpoch,
  toEpoch,
  semanticHash,
  validatorVersion,
  counts,
} = {}) => {
  const operation = text(operationId).toLowerCase();
  const ledger = text(ledgerId);
  const from = Number(fromEpoch);
  const next = Number(toEpoch);
  const hash = text(semanticHash).toLowerCase();
  const validator = Number(validatorVersion);
  const proofCounts = normalizedCounts(counts);
  if (!validUuid(operation) || !ledger
      || !Number.isInteger(from) || from < 1
      || !Number.isInteger(next) || next !== from + 1
      || !validHash(hash)
      || !Number.isInteger(validator) || validator < 1
      || !proofCounts) {
    throw new Error('canonical_restore_proof_input_invalid');
  }
  const canonical = JSON.stringify({
    domain: CANONICAL_RESTORE_PROOF_V11_DOMAIN,
    operationId: operation,
    ledgerId: ledger,
    fromEpoch: from,
    toEpoch: next,
    semanticHash: hash,
    validatorVersion: validator,
    counts: proofCounts,
  });
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
};
