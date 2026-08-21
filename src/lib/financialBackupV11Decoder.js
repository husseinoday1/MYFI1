// Phase 10 Step 7 — strict decoder for the internal V11 logical document.
//
// This accepts an already parsed object only. The future ZIP/file adapter must apply
// byte and JSON-size limits before it calls this function. No normalisation, default
// creation, wallet matching, FX repair or UI helper is permitted here.

import {
  CANONICAL_BACKUP_V11_DATA_VERSION,
  CANONICAL_BACKUP_V11_FORMAT,
  canonicalBackupV11ManifestCounts,
} from './financialBackupV11';
import { SEMANTIC_HASH_ALGORITHM, SEMANTIC_HASH_V2_VERSION, semanticHashCanonicalV2 } from './financialSemanticProjection';
import { validateCanonicalLedgerStructure } from './financialRestoreValidator';

const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const isHash = value => /^[0-9a-f]{64}$/.test(String(value || '').toLowerCase());
const isTimestamp = value => Number.isFinite(Date.parse(String(value || '')));
const sameCounts = (left, right) => {
  const leftKeys = Object.keys(left || {}).sort();
  const rightKeys = Object.keys(right || {}).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && left[key] === right[key]);
};

const refused = (reason, detail = {}) => ({ supported: true, ok: false, reason, ...detail });

/**
 * Validate V11's format, semantic proof, count manifest and structural ledger model.
 * Error detail is code/count-key only; financial content never leaves `data` on a
 * refused result, so diagnostics cannot accidentally log balances or notes.
 */
export const decodeCanonicalBackupV11 = (candidate) => {
  if (!isObject(candidate)) return refused('canonical_backup_document_invalid');
  if (candidate.kind !== 'myfi_canonical_financial_backup') {
    return refused('canonical_backup_kind_invalid');
  }
  const manifest = candidate.manifest;
  if (!isObject(manifest) || manifest.format !== CANONICAL_BACKUP_V11_FORMAT
      || Number(manifest.dataVersion) !== CANONICAL_BACKUP_V11_DATA_VERSION
      || Number(manifest.semanticHashVersion) !== SEMANTIC_HASH_V2_VERSION
      || manifest.semanticHashAlgorithm !== SEMANTIC_HASH_ALGORITHM
      || !isHash(manifest.semanticHash)
      || !String(manifest.ledgerId || '').trim()
      || !isTimestamp(manifest.createdAt)
      || !isObject(manifest.counts)) {
    return refused('canonical_backup_manifest_invalid');
  }
  const data = candidate.data;
  if (!isObject(data) || Number(data.semanticHashVersion) !== SEMANTIC_HASH_V2_VERSION
      || String(data.ledgerId || '') !== String(manifest.ledgerId || '')) {
    return refused('canonical_backup_data_invalid');
  }
  const actualHash = semanticHashCanonicalV2(data);
  if (actualHash !== String(manifest.semanticHash).toLowerCase()) {
    return refused('canonical_backup_semantic_hash_mismatch');
  }
  const expectedCounts = canonicalBackupV11ManifestCounts(data);
  if (!sameCounts(manifest.counts, expectedCounts)) {
    return refused('canonical_backup_manifest_counts_mismatch', {
      countKeys: Object.keys(expectedCounts).filter(key => manifest.counts?.[key] !== expectedCounts[key]),
    });
  }
  const structure = validateCanonicalLedgerStructure(data);
  if (!structure.ok) {
    return refused('canonical_backup_structure_invalid', {
      validatorVersion: structure.validatorVersion,
      errorCodes: structure.errors.map(item => item.code),
    });
  }
  return {
    supported: true,
    ok: true,
    manifest,
    data,
    semanticHash: actualHash,
    structure: { validatorVersion: structure.validatorVersion, counts: structure.counts },
  };
};
