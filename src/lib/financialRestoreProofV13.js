// Phase 10 / P10-013 Strategy B — versioned local restore proof.
// Supabase receives only the resulting opaque digest; this module never exports
// financial rows, amounts, balances, titles or notes.

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS } from './financialBackupV11';
import { SEMANTIC_HASH_V3_VERSION } from './financialSemanticProjection';

export const CANONICAL_RESTORE_PROOF_V13_DOMAIN = 'MYFI:P10-013:STRATEGY-B:RESTORE-PROOF:V1';
export const CANONICAL_RESTORE_PROOF_V13_VERSION = 1;

const text = value => String(value ?? '').trim();
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
const validHash = value => /^[a-f0-9]{64}$/i.test(text(value));
const validUuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
const validInteger = value => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export const normalizeCanonicalRestoreProofCountsV13 = counts => {
  if (!object(counts) || Object.keys(counts).length !== CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS.length) return null;
  const result = {};
  for (const key of CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(counts, key) || !validInteger(counts[key])) return null;
    result[key] = counts[key];
  }
  return result;
};

export const deriveCanonicalRestoreProofDigestV13 = ({
  operationId,
  ledgerId,
  fromEpoch,
  toEpoch,
  sourceLiveGeneration,
  semanticHashVersion,
  incomingSemanticHash,
  checkpointId,
  checkpointSemanticHash,
  validatorVersion,
  incomingCounts,
  checkpointCounts,
} = {}) => {
  const operation = text(operationId).toLowerCase();
  const ledger = text(ledgerId);
  const from = fromEpoch;
  const next = toEpoch;
  const generation = sourceLiveGeneration;
  const semanticVersion = semanticHashVersion;
  const incomingHash = text(incomingSemanticHash).toLowerCase();
  const checkpoint = text(checkpointId).toLowerCase();
  const checkpointHash = text(checkpointSemanticHash).toLowerCase();
  const validator = validatorVersion;
  const stageCounts = normalizeCanonicalRestoreProofCountsV13(incomingCounts);
  const undoCounts = normalizeCanonicalRestoreProofCountsV13(checkpointCounts);
  if (!validUuid(operation) || !ledger
      || !validInteger(from) || from < 1
      || !validInteger(next) || next !== from + 1
      || !validInteger(generation)
      || semanticVersion !== SEMANTIC_HASH_V3_VERSION
      || !validHash(incomingHash)
      || !validUuid(checkpoint) || !validHash(checkpointHash)
      || !validInteger(validator) || validator < 1
      || !stageCounts || !undoCounts) {
    throw new Error('canonical_restore_proof_v13_input_invalid');
  }
  const canonical = JSON.stringify({
    domain: CANONICAL_RESTORE_PROOF_V13_DOMAIN,
    proofVersion: CANONICAL_RESTORE_PROOF_V13_VERSION,
    operationId: operation,
    ledgerId: ledger,
    fromEpoch: from,
    toEpoch: next,
    sourceLiveGeneration: generation,
    semanticHashVersion: semanticVersion,
    incomingSemanticHash: incomingHash,
    checkpointId: checkpoint,
    checkpointSemanticHash: checkpointHash,
    validatorVersion: validator,
    incomingCounts: stageCounts,
    checkpointCounts: undoCounts,
  });
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
};
