// Phase 10 / P10-013 Slice 1 — live-ledger freshness token.
//
// These primitives deliberately require a transaction-scoped executor supplied by
// the caller. They never enqueue, begin, commit or create a token while reading or
// advancing it. A later write-path slice must call advance in the same transaction
// as each successful active-ledger mutation.

export const FINANCIAL_LIVE_GENERATION_TOKEN_VERSION = 1;

const tokenKeyForNamespace = namespace => `financial_live_generation_v13:${namespace}`;
const text = value => String(value ?? '').trim();
const validEpoch = value => typeof value === 'number'
  && Number.isSafeInteger(value)
  && value >= 0;
const validStoredInteger = value => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0;

const requireTransaction = database => {
  if (!database || typeof database.getFirstAsync !== 'function' || typeof database.runAsync !== 'function') {
    throw new Error('financial_live_generation_transaction_required');
  }
  return database;
};

const requireIdentity = ({ namespace, ledgerId, restoreEpoch } = {}) => {
  const targetNamespace = text(namespace);
  const targetLedgerId = text(ledgerId);
  if (!targetNamespace) throw new Error('financial_live_generation_namespace_required');
  if (!targetLedgerId) throw new Error('financial_live_generation_ledger_id_required');
  if (!validEpoch(restoreEpoch)) throw new Error('financial_live_generation_restore_epoch_invalid');
  return {
    namespace: targetNamespace,
    ledgerId: targetLedgerId,
    restoreEpoch: Number(restoreEpoch),
  };
};

const parseToken = (value, identity) => {
  let token = null;
  try { token = JSON.parse(String(value ?? '')); } catch { /* handled below */ }
  if (!token || typeof token !== 'object' || Array.isArray(token)) {
    throw new Error('financial_live_generation_malformed');
  }
  if (token.tokenVersion !== FINANCIAL_LIVE_GENERATION_TOKEN_VERSION
      || typeof token.namespace !== 'string' || token.namespace !== identity.namespace
      || typeof token.ledgerId !== 'string' || token.ledgerId !== identity.ledgerId
      || !validStoredInteger(token.restoreEpoch) || token.restoreEpoch !== identity.restoreEpoch
      || !validStoredInteger(token.generation)) {
    throw new Error('financial_live_generation_binding_invalid');
  }
  return Object.freeze({
    tokenVersion: FINANCIAL_LIVE_GENERATION_TOKEN_VERSION,
    namespace: identity.namespace,
    ledgerId: identity.ledgerId,
    restoreEpoch: identity.restoreEpoch,
    generation: Number(token.generation),
  });
};

const readTokenRow = async ({ database, identity }) => {
  const row = await database.getFirstAsync(
    'SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1',
    tokenKeyForNamespace(identity.namespace),
  );
  if (!row || row.value === null || row.value === undefined) {
    throw new Error('financial_live_generation_missing');
  }
  return { token: parseToken(row.value, identity), rawValue: String(row.value) };
};

const serialiseToken = token => JSON.stringify(token);

// Explicit bootstrap/registration only. Callers must use this during a reviewed
// identity-establishment path; promotion must call read/advance and fail closed if
// this metadata is absent.
export const registerLiveGenerationInTransactionV13 = async ({
  database, namespace, ledgerId, restoreEpoch,
} = {}) => {
  const txn = requireTransaction(database);
  const identity = requireIdentity({ namespace, ledgerId, restoreEpoch });
  const key = tokenKeyForNamespace(identity.namespace);
  const existing = await txn.getFirstAsync('SELECT value FROM ledger_v7_meta WHERE key=? LIMIT 1', key);
  if (existing) {
    return readTokenRow({ database: txn, identity }).then(result => result.token);
  }
  const token = Object.freeze({
    tokenVersion: FINANCIAL_LIVE_GENERATION_TOKEN_VERSION,
    ...identity,
    generation: 0,
  });
  const inserted = await txn.runAsync(
    'INSERT INTO ledger_v7_meta(key,value,updated_at) VALUES (?,?,?)',
    key, serialiseToken(token), new Date().toISOString(),
  );
  if (Number(inserted?.changes || 0) !== 1) {
    throw new Error('financial_live_generation_register_failed');
  }
  return token;
};

export const readLiveGenerationInTransactionV13 = async ({
  database, namespace, ledgerId, restoreEpoch,
} = {}) => {
  const txn = requireTransaction(database);
  const identity = requireIdentity({ namespace, ledgerId, restoreEpoch });
  return (await readTokenRow({ database: txn, identity })).token;
};

export const advanceLiveGenerationInTransactionV13 = async ({
  database, namespace, ledgerId, restoreEpoch,
} = {}) => {
  const txn = requireTransaction(database);
  const identity = requireIdentity({ namespace, ledgerId, restoreEpoch });
  const current = await readTokenRow({ database: txn, identity });
  if (current.token.generation >= Number.MAX_SAFE_INTEGER) {
    throw new Error('financial_live_generation_overflow');
  }
  const next = Object.freeze({ ...current.token, generation: current.token.generation + 1 });
  const updated = await txn.runAsync(
    'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?',
    serialiseToken(next), new Date().toISOString(), tokenKeyForNamespace(identity.namespace), current.rawValue,
  );
  if (Number(updated?.changes || 0) !== 1) {
    throw new Error('financial_live_generation_compare_and_swap_failed');
  }
  return next;
};

// Restore identity transition. This never creates metadata: promotion must fail closed
// if the live token is absent or not exactly bound to the outgoing epoch. The caller
// owns the same SQLite transaction as the restore-epoch CAS, so either both identity
// and generation move together or both roll back.
export const rebindLiveGenerationForRestoreEpochInTransactionV13 = async ({
  database, namespace, ledgerId, fromRestoreEpoch, toRestoreEpoch,
} = {}) => {
  const txn = requireTransaction(database);
  const fromIdentity = requireIdentity({
    namespace, ledgerId, restoreEpoch: fromRestoreEpoch,
  });
  if (!validEpoch(toRestoreEpoch) || Number(toRestoreEpoch) !== fromIdentity.restoreEpoch + 1) {
    throw new Error('financial_live_generation_restore_epoch_transition_invalid');
  }
  const current = await readTokenRow({ database: txn, identity: fromIdentity });
  if (current.token.generation >= Number.MAX_SAFE_INTEGER) {
    throw new Error('financial_live_generation_overflow');
  }
  const next = Object.freeze({
    ...current.token,
    restoreEpoch: Number(toRestoreEpoch),
    generation: current.token.generation + 1,
  });
  const updated = await txn.runAsync(
    'UPDATE ledger_v7_meta SET value=?,updated_at=? WHERE key=? AND value=?',
    serialiseToken(next), new Date().toISOString(),
    tokenKeyForNamespace(fromIdentity.namespace), current.rawValue,
  );
  if (Number(updated?.changes || 0) !== 1) {
    throw new Error('financial_live_generation_compare_and_swap_failed');
  }
  return next;
};

// This is intentionally a mutation-only bootstrap path. It establishes identity
// and token together with the caller's real financial mutation; reads and plain
// advances remain fail-closed and never initialise metadata on their own.
export const advanceLiveGenerationForMutationInTransactionV13 = async ({
  database, namespace,
} = {}) => {
  const txn = requireTransaction(database);
  const targetNamespace = text(namespace);
  if (!targetNamespace) throw new Error('financial_live_generation_namespace_required');
  let identity = await txn.getFirstAsync(
    `SELECT namespace,ledger_id,restore_epoch
       FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
    targetNamespace,
  );
  if (!identity?.ledger_id) {
    const now = new Date().toISOString();
    await txn.runAsync(
      `INSERT OR IGNORE INTO ledger_sync_identity_v8
       (namespace,ledger_id,restore_epoch,protocol_version,minimum_supported_version,created_at,updated_at)
       VALUES (?,'ledger-' || lower(hex(randomblob(16))),1,2,2,?,?)`,
      targetNamespace, now, now,
    );
    identity = await txn.getFirstAsync(
      `SELECT namespace,ledger_id,restore_epoch
         FROM ledger_sync_identity_v8 WHERE namespace=? LIMIT 1`,
      targetNamespace,
    );
  }
  if (!identity?.ledger_id || !validEpoch(Number(identity.restore_epoch))) {
    throw new Error('financial_live_generation_identity_missing');
  }
  const boundIdentity = {
    namespace: String(identity.namespace || targetNamespace),
    ledgerId: String(identity.ledger_id),
    restoreEpoch: Number(identity.restore_epoch),
  };
  await registerLiveGenerationInTransactionV13({ database: txn, ...boundIdentity });
  return advanceLiveGenerationInTransactionV13({ database: txn, ...boundIdentity });
};
