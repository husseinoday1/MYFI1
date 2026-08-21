// Phase 10 — Step 2: the semantic hash contract.
//
// One canonicaliser, used by every side that ever needs to ask "is this the same
// financial truth": backup export, the restore expected-hash, staged restore
// verification, migration parity, diagnostics and tests. The research is explicit
// that building a second, subtly different canonicaliser for restore is how this goes
// wrong — and MYFI has already paid for that once.
//
// On 2026-08-20 cutover was blocked for a day because the source projection hashed the
// raw entity payload while the write path persisted a canonical one that strips
// cfg.avatarUri. Counts matched on every metric; only the checksum differed, by
// exactly the 15 bytes of `,"avatarUri":""`. So this module does not re-implement that
// rule — it imports canonicalFinancialEntityPayload from the repository that persists
// it. There is one rule, in one place.
//
// Package integrity (myfiFiles.js, SHA-256 over the bytes) answers "did the file
// change". This answers "is this the same financial truth". They are different
// questions and neither substitutes for the other. FNV-1a stays where it is for fast
// internal parity checks; it is not the authoritative financial proof.
//
// Impact
//   Financial data changed:   NO — pure functions over an already-read model
//   SQLite schema changed:    NO
//   Migration required:       NO
//   Restore behaviour:        UNCHANGED — nothing calls this yet

import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { pickFinancialBackupConfig } from './backupData';
import { canonicalFinancialEntityPayload } from './financialLedgerV7Repository';

// V1 remains frozen for historical diagnostics. V2 is the first definition allowed
// to certify a Phase-10 restore package, so its scope is deliberately explicit.
export const SEMANTIC_HASH_VERSION = 1;
export const SEMANTIC_HASH_V2_VERSION = 2;
export const SEMANTIC_HASH_V3_VERSION = 3;
export const SEMANTIC_HASH_ALGORITHM = 'SHA-256';

const rows = value => (Array.isArray(value) ? value : []);
const text = value => (value === null || value === undefined ? null : String(value));

// Postings and revisions are integers by contract. Do NOT truncate: truncating
// would make 100.4 and 100.6 hash identically, so a corrupt non-integer amount
// would be rounded out of existence by the very thing meant to detect it.
const minor = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : null;
};

// Exact stored value, whatever it is. Used for the app-level amounts on the
// transaction payload, which are major units and may be fractional.
const exact = (value) => {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Deterministic JSON: object keys sorted at every depth, so two structurally equal
 * objects serialise identically regardless of insertion order.
 */
export const stableSemanticJson = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSemanticJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableSemanticJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
  return JSON.stringify(value);
};

// V3 is deliberately not locale-aware. It compares the UTF-8 bytes that the
// canonical serializer hashes, not a device/UI collation. An unpaired surrogate
// has no stable scalar-value representation across JSON/UTF-8 boundaries, so a
// restore proof rejects it rather than making an arbitrary tie-break choice.
const assertWellFormedCanonicalTextV3 = value => {
  const textValue = String(value ?? '');
  for (let index = 0; index < textValue.length; index += 1) {
    const unit = textValue.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = textValue.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('semantic_hash_v3_malformed_unicode');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('semantic_hash_v3_malformed_unicode');
    }
  }
  return textValue;
};

export const compareCanonicalTextV3 = (leftValue, rightValue) => {
  const left = new TextEncoder().encode(assertWellFormedCanonicalTextV3(leftValue));
  const right = new TextEncoder().encode(assertWellFormedCanonicalTextV3(rightValue));
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  if (left.length === right.length) return 0;
  return left.length < right.length ? -1 : 1;
};

export const stableSemanticJsonV3 = (value) => {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSemanticJsonV3).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareCanonicalTextV3);
    return `{${keys.map(key => `${JSON.stringify(key)}:${stableSemanticJsonV3(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'string') return JSON.stringify(assertWellFormedCanonicalTextV3(value));
  if (typeof value === 'number' && !Number.isFinite(value)) return 'null';
  return JSON.stringify(value);
};

const byId = (left, right) => String(left?.id ?? '').localeCompare(String(right?.id ?? ''));
const byArchiveKey = (left, right) => (
  `${String(left?.year ?? '')}:${String(left?.scope ?? '')}`
    .localeCompare(`${String(right?.year ?? '')}:${String(right?.scope ?? '')}`)
);

const parseObject = (value) => {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const sortRecordsById = (value) => rows(value).slice().sort(byId);
const sortRecordsByIdV3 = (value) => rows(value).slice().sort(
  (left, right) => compareCanonicalTextV3(left?.id, right?.id),
);

// ---------------------------------------------------------------------------
// Field policy
// ---------------------------------------------------------------------------
// Excluded: transport and presentation only — export timestamps, package filenames,
// compression metadata, the device-local avatar URI, diagnostic timestamps. Including
// them would make an identical ledger hash differently on two devices.
//
// Included: everything a person would call financial truth — ids, revisions, minor
// amounts, posting roles and buckets, currencies, FX numerator/denominator and date,
// status, tombstones, archive state, and financial configuration.
//
// The test for this policy is simple and absolute: one minor unit must change the hash.

const canonicalTransaction = (transaction) => {
  const payload = transaction?.payload || {};
  return {
    id: text(transaction?.id),
    revision: minor(transaction?.revision),
    // Tombstones and archive membership are financial truth, not bookkeeping noise.
    deletedAt: text(transaction?.deletedAt),
    archivedAt: text(transaction?.archivedAt),
    archiveYear: transaction?.archiveYear ?? null,
    kind: text(payload.kind ?? payload.flowType),
    status: text(payload.status),
    scope: text(payload.scope),
    dateISO: text(payload.dateISO),
    occurredAt: text(payload.occurredAt),
    categoryId: text(payload.cat ?? payload.categoryId),
    walletId: text(payload.walletId),
    currencyCode: text(payload.currencyCode),
    walletCurrency: text(payload.walletCurrency),
    baseCurrencyCode: text(payload.baseCurrencyCode),
    // payload_json stores plan.original — the app-level transaction, whose amounts
    // are amt / walletAmount / baseAmount / feeBaseAmount in MAJOR units, not the
    // *Minor names an earlier draft of this file assumed. Reading names that do not
    // exist would have hashed 0 for every transaction and left the amounts out of
    // the proof entirely, while a fixture using the invented names still passed.
    amount: exact(payload.amt),
    walletAmount: exact(payload.walletAmount),
    baseAmount: exact(payload.baseAmount),
    feeBaseAmount: exact(payload.feeBaseAmount),
    exchangeRate: exact(payload.exchangeRate),
    exchangeRateId: text(payload.exchangeRateId),
  };
};

const canonicalPosting = posting => ({
  id: text(posting?.id),
  transactionId: text(posting?.transactionId),
  accountId: text(posting?.accountId),
  bucket: text(posting?.bucket),
  role: text(posting?.role),
  amountMinor: minor(posting?.amountMinor),
  currencyCode: text(posting?.currencyCode),
  exchangeRateId: text(posting?.exchangeRateId),
});

const canonicalLink = link => ({
  id: text(link?.id),
  transactionId: text(link?.transactionId),
  linkType: text(link?.linkType),
  linkId: text(link?.linkId),
  relation: text(link?.relation),
  appliedAmountMinor: minor(link?.appliedAmountMinor),
  currencyCode: text(link?.currencyCode),
});

const canonicalAccount = account => ({
  id: text(account?.id),
  accountType: text(account?.accountType),
  scope: text(account?.scope),
  currencyCode: text(account?.currencyCode),
  status: text(account?.status),
});

// Numerator and denominator are kept as an exact pair rather than a divided rate:
// dividing loses precision and would let two different frozen rates hash the same.
const canonicalExchangeRate = rate => ({
  id: text(rate?.id),
  baseCurrencyCode: text(rate?.baseCurrencyCode),
  quoteCurrencyCode: text(rate?.quoteCurrencyCode),
  numerator: minor(rate?.numerator),
  denominator: minor(rate?.denominator),
  rateDate: text(rate?.rateDate),
  source: text(rate?.source),
});

const canonicalEntity = entity => ({
  entityType: text(entity?.entityType),
  id: text(entity?.id),
  revision: minor(entity?.revision),
  deletedAt: text(entity?.deletedAt),
  // The single shared rule — imported, never re-implemented. See the header.
  payload: canonicalFinancialEntityPayload(entity?.entityType, entity?.payload ?? null),
});

const canonicalArchive = (archive) => {
  const transactions = rows(archive?.data?.trans)
    .map(item => ({ id: text(item?.id), amount: exact(item?.amt), baseAmount: exact(item?.baseAmount) }))
    .sort(byId);
  return {
    id: text(archive?.id ?? archive?.year ?? archive?.namespace),
    year: archive?.year ?? null,
    scope: text(archive?.scope),
    transactionCount: transactions.length,
    transactions,
  };
};

// Phase 10 V2 policy
// -------------------
// A logical restore promises the complete user-entered financial records, including
// cold archive records. It does not promise device presentation/preferences. The
// same allowlist that the existing backup format uses defines the only workspace cfg
// fields that are financial; theme, language, privacy controls and notifications
// cannot make an otherwise identical ledger fail proof. Per-transaction provenance
// (including its stored device id) is a ledger record and remains covered below.
const canonicalFinancialConfigV2 = (workspace = {}) => {
  const state = parseObject(workspace?.payloadJson ?? workspace?.payload);
  const localCfg = state?.localPreferences?.cfg || state?.cfg || {};
  return pickFinancialBackupConfig(localCfg);
};

const canonicalTransactionV2 = transaction => ({
  id: text(transaction?.id),
  revision: minor(transaction?.revision),
  deletedAt: text(transaction?.deletedAt),
  archivedAt: text(transaction?.archivedAt),
  archiveYear: transaction?.archiveYear ?? null,
  storage: transaction?.storage ?? {},
  // The payload is the canonical user-entered transaction record. Do not reduce it
  // to an amount subset: title, note, transfer/FX fields, links and future approved
  // financial fields must all be detected if a stage read-back loses or changes one.
  payload: transaction?.payload ?? null,
});

const canonicalEntityV2 = entity => ({
  entityType: text(entity?.entityType),
  id: text(entity?.id),
  revision: minor(entity?.revision),
  deletedAt: text(entity?.deletedAt),
  payload: canonicalFinancialEntityPayload(entity?.entityType, entity?.payload ?? null),
  createdAt: text(entity?.createdAt),
  updatedAt: text(entity?.updatedAt),
});

const canonicalPostingV2 = posting => ({ ...canonicalPosting(posting), createdAt: text(posting?.createdAt) });
const canonicalLinkV2 = link => ({ ...canonicalLink(link), createdAt: text(link?.createdAt) });
const canonicalAccountV2 = account => ({
  ...canonicalAccount(account), name: text(account?.name), createdAt: text(account?.createdAt),
  updatedAt: text(account?.updatedAt), archivedAt: text(account?.archivedAt),
});
const canonicalExchangeRateV2 = rate => ({ ...canonicalExchangeRate(rate), capturedAt: text(rate?.capturedAt) });

const canonicalArchiveDataV2 = (data = {}) => {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'cfg') {
      result.cfg = pickFinancialBackupConfig(value || {});
    } else if (Array.isArray(value)) {
      // Archive collections are sets of records. Their physical read order is not
      // financial truth, but every record field remains in the semantic document.
      result[key] = sortRecordsById(value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const canonicalArchiveV2 = archive => ({
  year: archive?.year ?? null,
  scope: text(archive?.scope),
  checksum: text(archive?.checksum),
  summary: archive?.summary ?? {},
  data: canonicalArchiveDataV2(archive?.data),
});

const canonicalArchiveDataV3 = (data = {}) => {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === 'cfg') {
      result.cfg = pickFinancialBackupConfig(value || {});
    } else if (Array.isArray(value)) {
      result[key] = sortRecordsByIdV3(value);
    } else {
      result[key] = value;
    }
  }
  return result;
};

const canonicalArchiveV3 = archive => ({
  year: archive?.year ?? null,
  scope: text(archive?.scope),
  checksum: text(archive?.checksum),
  summary: archive?.summary ?? {},
  data: canonicalArchiveDataV3(archive?.data),
});

/**
 * Reduce a canonical read model (Step 1) to the form the semantic hash is taken over.
 * Pure and order-insensitive: collections are sorted, object keys are sorted at
 * serialisation, and non-financial fields are dropped.
 */
export const canonicalizeFinancialLedger = (model = {}) => {
  const entities = model?.entities && !Array.isArray(model.entities)
    ? Object.values(model.entities).flat()
    : rows(model?.entities);

  return {
    semanticHashVersion: SEMANTIC_HASH_VERSION,
    // Identity is provenance and belongs in the proof: the same rows under a different
    // ledger are not the same financial truth.
    ledgerId: text(model?.ledger?.ledgerId),
    baseCurrency: text(model?.baseCurrency ?? model?.workspace?.baseCurrency),
    accounts: rows(model?.accounts).map(canonicalAccountV2).sort(byId),
    exchangeRates: rows(model?.exchangeRates).map(canonicalExchangeRateV2).sort(byId),
    transactions: rows(model?.transactions).map(canonicalTransaction).sort(byId),
    postings: rows(model?.postings).map(canonicalPostingV2).sort(byId),
    links: rows(model?.links).map(canonicalLinkV2).sort(byId),
    entities: entities.map(canonicalEntity).sort(
      (left, right) => `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`),
    ),
    archives: rows(model?.archives).map(canonicalArchive).sort(byId),
  };
};

export const semanticHashV1 = (model = {}) => bytesToHex(
  sha256(new TextEncoder().encode(stableSemanticJson(canonicalizeFinancialLedger(model)))),
);

/**
 * Phase-10 restore proof. V1 remains available above for old diagnostic evidence;
 * do not substitute this under its old version number.
 */
export const canonicalizeFinancialLedgerV2 = (model = {}) => {
  const entities = model?.entities && !Array.isArray(model.entities)
    ? Object.values(model.entities).flat()
    : rows(model?.entities);
  return {
    semanticHashVersion: SEMANTIC_HASH_V2_VERSION,
    ledgerId: text(model?.ledger?.ledgerId),
    financialConfig: canonicalFinancialConfigV2(model?.workspace),
    accounts: rows(model?.accounts).map(canonicalAccountV2).sort(byId),
    exchangeRates: rows(model?.exchangeRates).map(canonicalExchangeRateV2).sort(byId),
    transactions: rows(model?.transactions).map(canonicalTransactionV2).sort(byId),
    postings: rows(model?.postings).map(canonicalPostingV2).sort(byId),
    links: rows(model?.links).map(canonicalLinkV2).sort(byId),
    entities: entities.map(canonicalEntityV2).sort(
      (left, right) => `${left.entityType}:${left.id}`.localeCompare(`${right.entityType}:${right.id}`),
    ),
    archives: rows(model?.archives).map(canonicalArchiveV2).sort(byArchiveKey),
  };
};

// Exported for the V11 package writer/decoder pair. They must hash the exact same
// canonical document rather than try to reverse-engineer a source model first.
export const semanticHashCanonicalV2 = (canonical = {}) => bytesToHex(
  sha256(new TextEncoder().encode(stableSemanticJson(canonical))),
);

export const semanticHashV2 = (model = {}) => semanticHashCanonicalV2(
  canonicalizeFinancialLedgerV2(model),
);

// V3 fixes V2's locale-sensitive collection order. V2 remains frozen for legacy
// package verification; nothing in this isolated primitive upgrades a package or
// makes a restore caller accept V3 yet.
export const canonicalizeFinancialLedgerV3 = (model = {}) => {
  const entities = model?.entities && !Array.isArray(model.entities)
    ? Object.values(model.entities).flat()
    : rows(model?.entities);
  return {
    semanticHashVersion: SEMANTIC_HASH_V3_VERSION,
    ledgerId: text(model?.ledger?.ledgerId),
    financialConfig: canonicalFinancialConfigV2(model?.workspace),
    accounts: rows(model?.accounts).map(canonicalAccountV2).sort(
      (left, right) => compareCanonicalTextV3(left?.id, right?.id),
    ),
    exchangeRates: rows(model?.exchangeRates).map(canonicalExchangeRateV2).sort(
      (left, right) => compareCanonicalTextV3(left?.id, right?.id),
    ),
    transactions: rows(model?.transactions).map(canonicalTransactionV2).sort(
      (left, right) => compareCanonicalTextV3(left?.id, right?.id),
    ),
    postings: rows(model?.postings).map(canonicalPostingV2).sort(
      (left, right) => compareCanonicalTextV3(left?.id, right?.id),
    ),
    links: rows(model?.links).map(canonicalLinkV2).sort(
      (left, right) => compareCanonicalTextV3(left?.id, right?.id),
    ),
    entities: entities.map(canonicalEntityV2).sort(
      (left, right) => compareCanonicalTextV3(
        `${left.entityType}:${left.id}`, `${right.entityType}:${right.id}`,
      ),
    ),
    archives: rows(model?.archives).map(canonicalArchiveV3).sort(
      (left, right) => compareCanonicalTextV3(
        `${String(left?.year ?? '')}:${String(left?.scope ?? '')}`,
        `${String(right?.year ?? '')}:${String(right?.scope ?? '')}`,
      ),
    ),
  };
};

export const semanticHashCanonicalV3 = (canonical = {}) => bytesToHex(
  sha256(new TextEncoder().encode(stableSemanticJsonV3(canonical))),
);

export const semanticHashV3 = (model = {}) => semanticHashCanonicalV3(
  canonicalizeFinancialLedgerV3(model),
);

/**
 * Independent metrics. A hash says "different"; metrics say "different how", which is
 * what makes a mismatch diagnosable instead of a dead end.
 */
export const semanticMetricsV1 = (model = {}) => {
  const canonical = canonicalizeFinancialLedger(model);
  const walletBalancesMinor = {};
  for (const posting of canonical.postings) {
    const key = `${posting.accountId}:${posting.currencyCode}:${posting.bucket}`;
    walletBalancesMinor[key] = (walletBalancesMinor[key] || 0) + posting.amountMinor;
  }
  const currencyTotalsMinor = {};
  for (const posting of canonical.postings) {
    const key = String(posting.currencyCode);
    currencyTotalsMinor[key] = (currencyTotalsMinor[key] || 0) + posting.amountMinor;
  }
  const entitiesByType = {};
  for (const entity of canonical.entities) {
    entitiesByType[entity.entityType] = (entitiesByType[entity.entityType] || 0) + 1;
  }

  return {
    transactions: canonical.transactions.length,
    activeTransactions: canonical.transactions.filter(item => !item.deletedAt && !item.archivedAt).length,
    archivedTransactions: canonical.transactions.filter(item => item.archivedAt).length,
    deletedTransactions: canonical.transactions.filter(item => item.deletedAt).length,
    postings: canonical.postings.length,
    links: canonical.links.length,
    accounts: canonical.accounts.length,
    exchangeRates: canonical.exchangeRates.length,
    entities: canonical.entities.length,
    entitiesByType,
    archives: canonical.archives.length,
    archivedArchiveTransactions: canonical.archives.reduce((sum, item) => sum + item.transactionCount, 0),
    walletBalancesMinor,
    currencyTotalsMinor,
  };
};

export const semanticMetricsV2 = (model = {}) => {
  const canonical = canonicalizeFinancialLedgerV2(model);
  const v1Metrics = semanticMetricsV1(model);
  return {
    ...v1Metrics,
    financialConfigKeys: Object.keys(canonical.financialConfig).sort(),
    archiveRecords: canonical.archives.reduce((sum, archive) => (
      sum + Object.values(archive.data || {}).reduce((inner, value) => (
        inner + (Array.isArray(value) ? value.length : 0)
      ), 0)
    ), 0),
  };
};

/**
 * Compare two ledgers that must be identical — a decoded backup against the staged
 * SQLite read-back, for instance. Both sides go through the same canonicaliser; that
 * is the whole point.
 */
export const compareSemanticLedgerV1 = (expected = {}, actual = {}) => {
  const expectedHash = semanticHashV1(expected);
  const actualHash = semanticHashV1(actual);
  if (expectedHash === actualHash) {
    return { ok: true, expectedHash, actualHash, differences: [] };
  }

  const expectedMetrics = semanticMetricsV1(expected);
  const actualMetrics = semanticMetricsV1(actual);
  const differences = [];
  for (const key of Object.keys(expectedMetrics)) {
    const left = stableSemanticJson(expectedMetrics[key]);
    const right = stableSemanticJson(actualMetrics[key]);
    if (left !== right) differences.push({ metric: key });
  }
  // Every metric agreeing while the hashes differ means a field inside a row changed
  // without changing any count — exactly the avatarUri shape. Say so rather than
  // returning an empty differences list that reads like "no difference".
  if (!differences.length) differences.push({ metric: 'row_content_only' });

  return { ok: false, expectedHash, actualHash, differences };
};

export const compareSemanticLedgerV2 = (expected = {}, actual = {}) => {
  const expectedHash = semanticHashV2(expected);
  const actualHash = semanticHashV2(actual);
  if (expectedHash === actualHash) {
    return { ok: true, expectedHash, actualHash, differences: [] };
  }
  const expectedMetrics = semanticMetricsV2(expected);
  const actualMetrics = semanticMetricsV2(actual);
  const differences = [];
  for (const key of Object.keys(expectedMetrics)) {
    if (stableSemanticJson(expectedMetrics[key]) !== stableSemanticJson(actualMetrics[key])) {
      differences.push({ metric: key });
    }
  }
  if (!differences.length) differences.push({ metric: 'row_content_only' });
  return { ok: false, expectedHash, actualHash, differences };
};
