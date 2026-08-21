// Phase 10 Step 6 — canonical logical backup writer.
//
// This is intentionally an internal writer only. The current Settings export remains
// V10 until the paired strict decoder and staged restore path exist. Publishing a
// format before it can be safely decoded and promoted would create a file users
// reasonably expect to restore but MYFI cannot yet prove it can restore.

import { readCanonicalBackupSource } from './financialBackupV2';
import {
  SEMANTIC_HASH_ALGORITHM,
  SEMANTIC_HASH_V2_VERSION,
  canonicalizeFinancialLedgerV2,
  semanticHashCanonicalV2,
  semanticMetricsV2,
} from './financialSemanticProjection';

export const CANONICAL_BACKUP_V11_FORMAT = 'MYFI_CANONICAL_LEDGER_BACKUP';
export const CANONICAL_BACKUP_V11_DATA_VERSION = 11;

const finiteCount = value => Math.max(0, Number.isSafeInteger(Number(value)) ? Number(value) : 0);

export const canonicalBackupV11ManifestCounts = (canonical = {}) => ({
  transactions: finiteCount(canonical?.transactions?.length),
  postings: finiteCount(canonical?.postings?.length),
  links: finiteCount(canonical?.links?.length),
  accounts: finiteCount(canonical?.accounts?.length),
  exchangeRates: finiteCount(canonical?.exchangeRates?.length),
  entities: finiteCount(canonical?.entities?.length),
  coldArchiveBundles: finiteCount(canonical?.archives?.length),
  coldArchiveRecords: finiteCount((canonical?.archives || []).reduce((sum, archive) => (
    sum + Object.values(archive?.data || {}).reduce((inner, value) => (
      inner + (Array.isArray(value) ? value.length : 0)
    ), 0)
  ), 0)),
});

/**
 * Create an unsigned logical V11 document from an already-read canonical source.
 * The later file/package layer owns ZIP, encryption and byte-level integrity; this
 * layer owns financial semantics and deliberately has no filesystem side effects.
 */
export const buildCanonicalBackupV11 = ({ source, createdAt = new Date().toISOString() } = {}) => {
  if (!source?.supported) {
    return { supported: false, ok: false, reason: source?.reason || 'canonical_backup_source_unsupported' };
  }
  if (!source?.ok) return { supported: true, ok: false, reason: source?.reason || 'canonical_backup_source_invalid' };
  if (!source?.cutoverComplete) {
    return { supported: true, ok: false, reason: 'canonical_backup_cutover_incomplete' };
  }
  if (!source?.ledgerIdentityPresent || !String(source?.ledger?.ledgerId || '').trim()) {
    return { supported: true, ok: false, reason: 'canonical_backup_ledger_identity_missing' };
  }

  const data = canonicalizeFinancialLedgerV2(source);
  const semanticHash = semanticHashCanonicalV2(data);
  const metrics = semanticMetricsV2(source);
  const manifest = {
    format: CANONICAL_BACKUP_V11_FORMAT,
    dataVersion: CANONICAL_BACKUP_V11_DATA_VERSION,
    semanticHashVersion: SEMANTIC_HASH_V2_VERSION,
    semanticHashAlgorithm: SEMANTIC_HASH_ALGORITHM,
    semanticHash,
    createdAt: String(createdAt),
    ledgerId: String(source.ledger.ledgerId),
    counts: canonicalBackupV11ManifestCounts(data),
  };
  return {
    supported: true,
    ok: true,
    // No package-transport metadata belongs in this logical document. The paired
    // package adapter will supply encryption/ZIP bytes and its own byte hash later.
    backup: { kind: 'myfi_canonical_financial_backup', manifest, data },
    semanticHash,
    metrics,
  };
};

/**
 * Canonical SQLite is the only permitted source. This API exists for the future
 * export adapter; it is not wired to Settings or sharing yet.
 */
export const createCanonicalBackupV11 = async (options = {}) => {
  const source = await readCanonicalBackupSource(options);
  return buildCanonicalBackupV11({ source, createdAt: options?.createdAt });
};
