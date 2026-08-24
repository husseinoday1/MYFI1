// Phase 10 Step 8 — isolated canonical V11 restore stage.
//
// This module is deliberately not an importer and not a promotion path. It writes
// only a uniquely named restore-stage namespace, reads that namespace back through
// the canonical projection, and refuses it unless the decoded V11 semantic proof is
// reproduced exactly. The live namespace, sync identity and every outbox remain
// untouched.

import { ensureColdArchiveSchema } from './localArchiveRepository';
import { enqueueLedgerWrite, getLedgerDb, runLedgerExclusiveTransaction, runLedgerReadTransaction } from './ledgerDatabase';
import { FINANCIAL_LEDGER_SCHEMA_VERSION } from './financialLedgerV7Model';
import {
  ensureFinancialLedgerV7,
  proveFinancialLedgerInvariantsV7,
  readFinancialProjectionV7,
} from './financialLedgerV7Repository';
import { canonicalBackupV11ManifestCounts } from './financialBackupV11';
import { canonicalizeFinancialLedgerV2, semanticHashCanonicalV2 } from './financialSemanticProjection';
import { validateCanonicalLedgerStructure } from './financialRestoreValidator';

const RESTORE_STAGE_MARKER = '::restore-stage::';
let restoreStageSequence = 0;
const restoreStageMetaKey = stageNamespace => `canonical_restore_stage_v11:${text(stageNamespace).trim()}`;

const safeJson = value => {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
};

const parseJson = (value, fallback = null) => {
  try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; }
};

const rows = value => (Array.isArray(value) ? value : []);
const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
const text = value => (value === null || value === undefined ? '' : String(value));
const nonBlank = value => text(value).trim().length > 0;
const timestamp = value => Number.isFinite(Date.parse(text(value)));
const integer = value => Number.isSafeInteger(Number(value));
const validScope = value => ['all', 'personal', 'business'].includes(text(value));
const validCurrency = value => /^[A-Z]{3}$/.test(text(value));
const validStageNamespace = (namespace, stageNamespace) => (
  nonBlank(namespace)
  && text(stageNamespace).startsWith(`${text(namespace)}${RESTORE_STAGE_MARKER}`)
  && text(stageNamespace).length > `${text(namespace)}${RESTORE_STAGE_MARKER}`.length
);
const refused = (reason, detail = {}) => ({ supported: true, ok: false, reason, ...detail });

/** Creates a namespace that cannot be mistaken for the older shadow-migration stage. */
export const createCanonicalRestoreStageNamespace = (namespace = 'guest') => {
  const target = text(namespace).trim();
  if (!target) throw new Error('canonical_restore_stage_namespace_required');
  restoreStageSequence += 1;
  return `${target}${RESTORE_STAGE_MARKER}${Date.now().toString(36)}-${restoreStageSequence.toString(36)}`;
};

const stageDataContract = (data) => {
  if (!isObject(data) || !nonBlank(data.ledgerId) || !isObject(data.financialConfig)) {
    return 'canonical_restore_stage_data_invalid';
  }
  for (const transaction of rows(data.transactions)) {
    const storage = transaction?.storage;
    if (!isObject(storage) || !nonBlank(transaction?.id) || !integer(transaction?.revision) || Number(transaction.revision) < 1
        || !nonBlank(storage.kind) || !['posted', 'voided'].includes(text(storage.status))
        || !validScope(storage.scope) || !/^\d{4}-\d{2}-\d{2}$/.test(text(storage.dateISO))
        || !timestamp(storage.occurredAt) || !nonBlank(storage.idempotencyKey)
        || !nonBlank(storage.deviceId) || !timestamp(storage.createdAt) || !timestamp(storage.updatedAt)
        || (transaction?.archiveYear !== null && transaction?.archiveYear !== undefined && !integer(transaction.archiveYear))) {
      return 'canonical_restore_stage_transaction_storage_invalid';
    }
  }
  for (const account of rows(data.accounts)) {
    if (!nonBlank(account?.id) || !nonBlank(account?.accountType) || !validScope(account?.scope)
        || !validCurrency(account?.currencyCode) || !nonBlank(account?.status)
        || !timestamp(account?.createdAt) || !timestamp(account?.updatedAt)) {
      return 'canonical_restore_stage_account_storage_invalid';
    }
  }
  for (const rate of rows(data.exchangeRates)) {
    if (!nonBlank(rate?.id) || !validCurrency(rate?.baseCurrencyCode)
        || !validCurrency(rate?.quoteCurrencyCode) || !integer(rate?.numerator)
        || Number(rate.numerator) <= 0 || !integer(rate?.denominator) || Number(rate.denominator) <= 0
        || !/^\d{4}-\d{2}-\d{2}$/.test(text(rate?.rateDate))
        || !nonBlank(rate?.source) || !timestamp(rate?.capturedAt)) {
      return 'canonical_restore_stage_exchange_rate_storage_invalid';
    }
  }
  for (const posting of rows(data.postings)) {
    if (!nonBlank(posting?.id) || !nonBlank(posting?.transactionId) || !nonBlank(posting?.accountId)
        || !nonBlank(posting?.bucket) || !nonBlank(posting?.role) || !integer(posting?.amountMinor) || Number(posting.amountMinor) === 0
        || !validCurrency(posting?.currencyCode) || !timestamp(posting?.createdAt)) {
      return 'canonical_restore_stage_posting_storage_invalid';
    }
  }
  for (const link of rows(data.links)) {
    if (!nonBlank(link?.id) || !nonBlank(link?.transactionId) || !nonBlank(link?.linkType)
        || !nonBlank(link?.linkId) || !nonBlank(link?.relation) || !integer(link?.appliedAmountMinor)
        || (link?.currencyCode !== null && link?.currencyCode !== undefined && !validCurrency(link.currencyCode))
        || !timestamp(link?.createdAt)) {
      return 'canonical_restore_stage_link_storage_invalid';
    }
  }
  for (const entity of rows(data.entities)) {
    if (!nonBlank(entity?.entityType) || !nonBlank(entity?.id) || !integer(entity?.revision)
        || entity?.payload === undefined || !timestamp(entity?.createdAt) || !timestamp(entity?.updatedAt)) {
      return 'canonical_restore_stage_entity_storage_invalid';
    }
  }
  for (const archive of rows(data.archives)) {
    if (!integer(archive?.year) || !validScope(archive?.scope) || !isObject(archive?.summary)
        || !timestamp(archive.summary.archivedAt) || !integer(archive.summary.count) || Number(archive.summary.count) < 0
        || !Number.isFinite(Number(archive.summary.income)) || !Number.isFinite(Number(archive.summary.expense))
        || !Number.isFinite(Number(archive.summary.net)) || typeof archive.checksum !== 'string'
        || text(archive.summary.scope) !== text(archive.scope) || Number(archive.summary.year) !== Number(archive.year)
        || !isObject(archive?.data)
        || !Array.isArray(archive.data.trans)) {
      return 'canonical_restore_stage_archive_storage_invalid';
    }
  }
  return null;
};

const referencedCurrencies = (data = {}) => {
  const values = new Set();
  const add = value => {
    if (value !== null && value !== undefined && text(value)) values.add(text(value).toUpperCase());
  };
  for (const account of rows(data.accounts)) add(account.currencyCode);
  for (const rate of rows(data.exchangeRates)) {
    add(rate.baseCurrencyCode);
    add(rate.quoteCurrencyCode);
  }
  for (const posting of rows(data.postings)) add(posting.currencyCode);
  for (const link of rows(data.links)) add(link.currencyCode);
  return [...values].sort();
};

const assertStageCurrenciesExist = async (db, data) => {
  for (const code of referencedCurrencies(data)) {
    const row = await db.getFirstAsync('SELECT code FROM ledger_currencies WHERE code=? LIMIT 1', code);
    if (!row) throw new Error('canonical_restore_stage_currency_unavailable');
  }
};

const clearRestoreStageRows = async (db, namespace) => {
  // Cold archive rows depend on their year header, so deleting headers clears both.
  await db.runAsync('DELETE FROM cold_archive_years WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_transaction_links_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_postings_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_financial_transactions_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_exchange_rates_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_accounts_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_entities_v7 WHERE namespace=?', namespace);
  await db.runAsync('DELETE FROM ledger_workspace_state_v7 WHERE namespace=?', namespace);
  // The readiness record is deliberately scoped to the stage namespace. It is not
  // financial data, but it must disappear with an abandoned or promoted stage so a
  // later restore cannot mistake stale proof for current proof.
  await db.runAsync('DELETE FROM ledger_v7_meta WHERE key=?', restoreStageMetaKey(namespace));
};

const writeStageRows = async (db, namespace, data) => {
  // Order is the FK order. Every value comes from V11 directly; this path must never
  // call buildFinancialLedgerCommand, workspace normalisers, wallet repair, or FX
  // suggestions because those helpers are allowed to interpret a UI intent.
  for (const account of rows(data.accounts)) {
    await db.runAsync(
      `INSERT INTO ledger_accounts_v7
       (namespace,id,name,account_type,scope,currency_code,status,created_at,updated_at,archived_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      namespace, account.id, account.name ?? null, account.accountType, account.scope,
      account.currencyCode, account.status, account.createdAt, account.updatedAt, account.archivedAt ?? null,
    );
  }
  for (const rate of rows(data.exchangeRates)) {
    await db.runAsync(
      `INSERT INTO ledger_exchange_rates_v7
       (namespace,id,base_currency_code,quote_currency_code,numerator,denominator,rate_date,source,captured_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      namespace, rate.id, rate.baseCurrencyCode, rate.quoteCurrencyCode, rate.numerator,
      rate.denominator, rate.rateDate, rate.source, rate.capturedAt,
    );
  }
  for (const transaction of rows(data.transactions)) {
    const storage = transaction.storage;
    await db.runAsync(
      `INSERT INTO ledger_financial_transactions_v7
       (namespace,id,kind,status,scope,date_iso,occurred_at,category_id,title,note,source_type,source_id,
        idempotency_key,device_id,revision,archive_year,archived_at,deleted_at,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      namespace, transaction.id, storage.kind, storage.status, storage.scope, storage.dateISO,
      storage.occurredAt, storage.categoryId ?? null, storage.title ?? null, storage.note ?? null,
      storage.sourceType ?? null, storage.sourceId ?? null, storage.idempotencyKey, storage.deviceId,
      transaction.revision, transaction.archiveYear ?? null, transaction.archivedAt ?? null,
      transaction.deletedAt ?? null, safeJson(transaction.payload), storage.createdAt, storage.updatedAt,
    );
  }
  for (const posting of rows(data.postings)) {
    await db.runAsync(
      `INSERT INTO ledger_postings_v7
       (namespace,id,transaction_id,account_id,bucket,role,amount_minor,currency_code,exchange_rate_id,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      namespace, posting.id, posting.transactionId, posting.accountId, posting.bucket, posting.role,
      posting.amountMinor, posting.currencyCode, posting.exchangeRateId ?? null, posting.createdAt,
    );
  }
  for (const link of rows(data.links)) {
    await db.runAsync(
      `INSERT INTO ledger_transaction_links_v7
       (namespace,id,transaction_id,link_type,link_id,relation,applied_amount_minor,currency_code,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      namespace, link.id, link.transactionId, link.linkType, link.linkId, link.relation,
      link.appliedAmountMinor, link.currencyCode ?? null, link.createdAt,
    );
  }
  for (const entity of rows(data.entities)) {
    await db.runAsync(
      `INSERT INTO ledger_entities_v7
       (namespace,entity_type,id,revision,deleted_at,payload_json,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      namespace, entity.entityType, entity.id, entity.revision, entity.deletedAt ?? null,
      safeJson(entity.payload), entity.createdAt, entity.updatedAt,
    );
  }
  for (const archive of rows(data.archives)) {
    const { trans, ...metadata } = archive.data;
    const summary = archive.summary;
    await db.runAsync(
      `INSERT INTO cold_archive_years
       (namespace,scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      namespace, archive.scope, archive.year, summary.archivedAt, archive.checksum ?? '',
      summary.count, summary.income, summary.expense, summary.net, safeJson(metadata),
    );
    for (const item of trans) {
      // These five columns are local indexes derived deterministically from the
      // already-backed-up payload. `payload_json` remains the archive record whose
      // semantic equality is proved below; no money or reference is created here.
      const searchText = [item?.title, item?.note, item?.dateISO, item?.cat, item?.walletId,
        item?.fromWalletId, item?.toWalletId, item?.transactionTag].filter(Boolean).join(' ').toLowerCase();
      await db.runAsync(
        `INSERT INTO cold_archive_transactions
         (namespace,scope,year,id,date_iso,ts,wallet_id,category_id,flow_type,search_text,payload_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        namespace, archive.scope, archive.year, item.id, item.dateISO ?? null, Number(item.ts || 0),
        item.walletId ?? item.fromWalletId ?? item.toWalletId ?? null, item.cat ?? null,
        item.flowType ?? item.kind ?? null, searchText, safeJson(item),
      );
    }
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO ledger_workspace_state_v7
     (namespace,source_mode,schema_version,payload_json,updated_at) VALUES (?,?,?,?,?)`,
    namespace, 'shadow', FINANCIAL_LEDGER_SCHEMA_VERSION, safeJson({ cfg: data.financialConfig }), now,
  );
};

const writeRestoreStageReadiness = async ({ db, namespace, decoded, proof }) => {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT OR REPLACE INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)`,
    restoreStageMetaKey(namespace),
    safeJson({
      version: 1,
      state: 'ready',
      namespace,
      ledgerId: text(decoded?.data?.ledgerId),
      semanticHash: text(proof?.semanticHash).toLowerCase(),
      counts: proof?.counts || {},
      validatorVersion: Number(proof?.validatorVersion || 0),
      provedAt: now,
    }),
    now,
  );
};

const readStageArchives = async (db, namespace) => {
  const headers = await db.getAllAsync(
    `SELECT scope,year,archived_at,checksum,transaction_count,income,expense,net,metadata_json
       FROM cold_archive_years WHERE namespace=? ORDER BY year DESC,scope ASC`,
    namespace,
  );
  const result = [];
  for (const header of headers) {
    const archiveRows = await db.getAllAsync(
      `SELECT payload_json FROM cold_archive_transactions
        WHERE namespace=? AND scope=? AND year=? ORDER BY date_iso DESC,ts DESC,id DESC`,
      namespace, header.scope, header.year,
    );
    result.push({
      year: Number(header.year), scope: header.scope, checksum: header.checksum || '',
      summary: {
        year: Number(header.year), scope: header.scope, archivedAt: header.archived_at,
        checksum: header.checksum || '', count: Number(header.transaction_count),
        income: Number(header.income), expense: Number(header.expense), net: Number(header.net),
      },
      data: {
        ...(parseJson(header.metadata_json, {}) || {}),
        trans: archiveRows.map(row => parseJson(row.payload_json, null)).filter(Boolean),
      },
    });
  }
  return result;
};

/** Read a restore stage only. It intentionally cannot read or activate a live ledger. */
export const readCanonicalRestoreStageV11 = async ({ namespace, stageNamespace, ledgerId, database = null } = {}) => {
  const target = text(namespace).trim();
  const stage = text(stageNamespace).trim();
  if (!validStageNamespace(target, stage) || !nonBlank(ledgerId)) {
    return refused('canonical_restore_stage_namespace_invalid');
  }
  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  await ensureColdArchiveSchema();
  return runLedgerReadTransaction(db, async executor => {
    const projection = await readFinancialProjectionV7({ namespace: stage, database: executor, schemaReady: true });
    const workspace = await executor.getFirstAsync(
      'SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=? LIMIT 1', stage,
    );
    if (!workspace) return refused('canonical_restore_stage_missing');
    const archives = await readStageArchives(executor, stage);
    return {
      supported: true, ok: true, source: 'canonical_restore_stage', namespace: stage,
      ledger: { ledgerId: text(ledgerId) }, ledgerIdentityPresent: true,
      workspace: { sourceMode: 'shadow', payloadJson: workspace.payload_json || '{}' },
      cutoverComplete: false,
      accounts: rows(projection?.accounts), exchangeRates: rows(projection?.exchangeRates),
      transactions: rows(projection?.transactions), postings: rows(projection?.postings),
      links: rows(projection?.links), entities: rows(projection?.entities), archives,
    };
  });
};

const proveCanonicalRestoreStage = async ({ namespace, stageNamespace, decoded, database }) => {
  const readback = await readCanonicalRestoreStageV11({
    namespace, stageNamespace, ledgerId: decoded.data.ledgerId, database,
  });
  if (!readback.ok) return refused(readback.reason || 'canonical_restore_stage_readback_failed');
  const structure = validateCanonicalLedgerStructure(readback);
  if (!structure.ok) return refused('canonical_restore_stage_readback_structure_invalid', {
    errorCodes: structure.errors.map(item => item.code),
  });
  const invariant = await proveFinancialLedgerInvariantsV7({ namespace: stageNamespace, database });
  if (!invariant.ok) return refused('canonical_restore_stage_invariant_failed', {
    issueCodes: rows(invariant.issues).map(item => item.code),
  });
  const canonicalReadback = canonicalizeFinancialLedgerV2(readback);
  const actualHash = semanticHashCanonicalV2(canonicalReadback);
  const expectedHash = text(decoded.semanticHash).toLowerCase();
  if (actualHash !== expectedHash) return refused('canonical_restore_stage_semantic_mismatch', {
    expectedHash, actualHash,
  });
  const counts = canonicalBackupV11ManifestCounts(canonicalReadback);
  const expectedCounts = decoded.manifest?.counts || {};
  const countKeys = Object.keys(expectedCounts).filter(key => counts[key] !== expectedCounts[key]);
  if (countKeys.length) return refused('canonical_restore_stage_metrics_mismatch', { countKeys });
  return {
    supported: true, ok: true,
    proof: { semanticHash: actualHash, counts, validatorVersion: structure.validatorVersion },
  };
};

/**
 * Stage and prove one strict-decoded V11 document. This is the only writer in P10-008.
 * It never promotes data; a later P10-010 primitive must be the sole live writer.
 */
export const stageCanonicalRestoreV11 = async ({ namespace, stageNamespace, decoded, database = null } = {}) => {
  const target = text(namespace).trim();
  const stage = text(stageNamespace).trim();
  if (!validStageNamespace(target, stage)) return refused('canonical_restore_stage_namespace_invalid');
  if (!decoded?.ok || !isObject(decoded?.data) || !nonBlank(decoded?.semanticHash)) {
    return refused('canonical_restore_stage_decode_required');
  }
  const structural = validateCanonicalLedgerStructure(decoded.data);
  if (!structural.ok) return refused('canonical_restore_stage_structure_invalid', {
    errorCodes: structural.errors.map(item => item.code),
  });
  const contractFailure = stageDataContract(decoded.data);
  if (contractFailure) return refused(contractFailure);

  const db = database || await getLedgerDb();
  if (!db) return { supported: false, ok: false, reason: 'sqlite_unavailable' };
  await ensureFinancialLedgerV7(db);
  await ensureColdArchiveSchema();
  try {
    await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, async executor => {
      // Currency definitions are static application reference data shared by all
      // namespaces. This stage may read them but must not insert/update them: a
      // missing code fails closed instead of making a global change while staging.
      await assertStageCurrenciesExist(executor, decoded.data);
      await clearRestoreStageRows(executor, stage);
      await writeStageRows(executor, stage, decoded.data);
    }));
  } catch (error) {
    return refused(text(error?.message) === 'canonical_restore_stage_currency_unavailable'
      ? 'canonical_restore_stage_currency_unavailable'
      : 'canonical_restore_stage_write_failed');
  }

  const proof = await proveCanonicalRestoreStage({
    namespace: target, stageNamespace: stage, decoded, database: db,
  });
  if (!proof.ok) {
    await discardCanonicalRestoreStageV11({ namespace: target, stageNamespace: stage, database: db });
    return proof;
  }
  try {
    // P10-010 reads this marker inside its final exclusive transaction. The marker
    // binds the private stage namespace to the proof just performed here; it carries
    // identifiers, a hash and counts only, never financial payloads or amounts.
    await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, executor => (
      writeRestoreStageReadiness({ db: executor, namespace: stage, decoded, proof: proof.proof })
    )));
  } catch {
    await discardCanonicalRestoreStageV11({ namespace: target, stageNamespace: stage, database: db });
    return refused('canonical_restore_stage_readiness_write_failed');
  }
  return { supported: true, ok: true, namespace: target, stageNamespace: stage, ...proof };
};

/** Deletes only an explicitly-shaped restore stage; a live namespace is impossible here. */
export const discardCanonicalRestoreStageV11 = async ({ namespace, stageNamespace, database = null } = {}) => {
  const target = text(namespace).trim();
  const stage = text(stageNamespace).trim();
  if (!validStageNamespace(target, stage)) return false;
  const db = database || await getLedgerDb();
  if (!db) return false;
  await ensureFinancialLedgerV7(db);
  await ensureColdArchiveSchema();
  await enqueueLedgerWrite(() => runLedgerExclusiveTransaction(db, executor => clearRestoreStageRows(executor, stage)));
  return true;
};
