// Phase 10 — Step 3: the strict structural validator.
//
// Restore must fail closed. The research is explicit that the UI normalisation helpers
// are not appropriate here, and the current import path proves the point:
// dataSlice.js:672 runs prepareWalletData over restored data, which invents a wallet
// with a hard-coded id and Arabic name when none exists for a scope, reassigns
// cfg.defaultWalletId, and attaches a default wallet to transactions that lack one —
// rewriting financial attribution. That is silent repair of a user's ledger, and it
// happens before any financial validation has passed.
//
// So this module shares nothing with that path. It reports; it never fixes. A missing
// wallet reference is an error, not an opportunity to pick one.
//
// It answers "is this structurally coherent" — ids unique, references resolve, minor
// units are integers, currencies well formed, tombstones sane. It does not answer "do
// the balances add up" (proveFinancialLedgerInvariantsV7) or "is it the same ledger"
// (financialSemanticProjection). Three different questions, three separate checks, all
// of which must pass before a restore may promote.
//
// Impact
//   Financial data changed:   NO — pure function over an already-read model
//   SQLite schema changed:    NO
//   Migration required:       NO
//   Restore behaviour:        UNCHANGED — nothing calls this yet

export const RESTORE_VALIDATOR_VERSION = 1;

const rows = value => (Array.isArray(value) ? value : []);
const str = value => (value === null || value === undefined ? '' : String(value));

const CURRENCY = /^[A-Z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Number(null), Number("") and Number(false) are all 0, so a bare
// Number.isInteger(Number(v)) accepts a missing amount as a valid integer — a
// fail-open hole in the one module whose entire job is failing closed. Require an
// actual number or a numeric string, then require it to be whole.
const isIntegerLike = (value) => {
  if (typeof value === 'number') return Number.isInteger(value);
  if (typeof value === 'string' && value.trim() !== '') return Number.isInteger(Number(value));
  return false;
};
const isTimestamp = value => Number.isFinite(Date.parse(str(value)));

// Errors carry the code and the identifier, never amounts. These payloads get logged
// and pasted into evidence files, and the standing rule is that diagnostic output does
// not publish a user's money.
const problem = (code, detail = {}) => ({ code, ...detail });

const collectDuplicates = (items, keyOf) => {
  const seen = new Set();
  const duplicates = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) duplicates.push(key);
    else seen.add(key);
  }
  return { ids: seen, duplicates };
};

/**
 * Validate the structure of a canonical ledger model (the Step 1 read model, or a
 * decoded backup in the same shape).
 *
 * Collects every problem rather than stopping at the first: a restore that is going to
 * be refused should tell the user everything that is wrong in one pass, not one item
 * per attempt.
 *
 * @returns {{ok: boolean, errors: Array<object>, counts: object}}
 */
export const validateCanonicalLedgerStructure = (model = {}) => {
  const errors = [];

  const transactions = rows(model?.transactions);
  const postings = rows(model?.postings);
  const links = rows(model?.links);
  const accounts = rows(model?.accounts);
  const exchangeRates = rows(model?.exchangeRates);
  const entities = model?.entities && !Array.isArray(model.entities)
    ? Object.values(model.entities).flat()
    : rows(model?.entities);
  const archives = rows(model?.archives);

  // --- identity: nothing may appear twice ---------------------------------
  const tx = collectDuplicates(transactions, item => str(item?.id));
  for (const id of tx.duplicates) errors.push(problem('duplicate_transaction_id', { id }));

  const posting = collectDuplicates(postings, item => str(item?.id));
  for (const id of posting.duplicates) errors.push(problem('duplicate_posting_id', { id }));

  const link = collectDuplicates(links, item => str(item?.id));
  for (const id of link.duplicates) errors.push(problem('duplicate_link_id', { id }));

  const account = collectDuplicates(accounts, item => str(item?.id));
  for (const id of account.duplicates) errors.push(problem('duplicate_account_id', { id }));

  const rate = collectDuplicates(exchangeRates, item => str(item?.id));
  for (const id of rate.duplicates) errors.push(problem('duplicate_exchange_rate_id', { id }));

  // Entities are unique per (type, id), not per id — a wallet and a goal may share one.
  const entity = collectDuplicates(entities, item => `${str(item?.entityType)}:${str(item?.id)}`);
  for (const id of entity.duplicates) errors.push(problem('duplicate_entity_id', { id }));

  const walletIds = new Set(
    entities.filter(item => str(item?.entityType) === 'wallet').map(item => str(item?.id)),
  );

  // --- transactions --------------------------------------------------------
  for (const item of transactions) {
    const id = str(item?.id);
    if (!id) { errors.push(problem('transaction_missing_id')); continue; }
    if (!isIntegerLike(item?.revision) || Number(item?.revision) < 1) {
      errors.push(problem('transaction_invalid_revision', { id }));
    }
    if (item?.deletedAt && !isTimestamp(item.deletedAt)) {
      errors.push(problem('transaction_invalid_tombstone', { id }));
    }
    if (item?.archivedAt && !isTimestamp(item.archivedAt)) {
      errors.push(problem('transaction_invalid_archived_at', { id }));
    }
    // archivedAt is what actually decides archive membership, here and in the
    // semantic projection. A year claimed without it is a row asserting it belongs
    // to an archive with nothing recording that it was archived, so that direction
    // is refused.
    //
    // The reverse — archived with no year recorded — is deliberately NOT refused.
    // markLedgerYearArchived COALESCEs the two columns independently, so a row
    // archived without a year is reachable, and blocking it would refuse a
    // legitimate restore on an assumption this module has not verified. An
    // over-strict rule costs a user their restore just as surely as a lax one lets
    // bad data in.
    const hasYear = item?.archiveYear !== null && item?.archiveYear !== undefined;
    if (hasYear && !item?.archivedAt) {
      errors.push(problem('transaction_archive_year_without_archived_at', { id }));
    }

    const payload = item?.payload;
    if (!payload || typeof payload !== 'object') {
      errors.push(problem('transaction_missing_payload', { id }));
      continue;
    }
    if (payload.dateISO && !ISO_DATE.test(str(payload.dateISO))) {
      errors.push(problem('transaction_invalid_date', { id }));
    }
    for (const [field, code] of [
      ['currencyCode', 'transaction_invalid_currency'],
      ['walletCurrency', 'transaction_invalid_wallet_currency'],
      ['baseCurrencyCode', 'transaction_invalid_base_currency'],
    ]) {
      if (payload[field] && !CURRENCY.test(str(payload[field]))) {
        errors.push(problem(code, { id }));
      }
    }
    // No default-wallet repair. An unresolvable wallet reference blocks the restore.
    if (payload.walletId && !walletIds.has(str(payload.walletId))) {
      errors.push(problem('transaction_wallet_unresolved', { id, walletId: str(payload.walletId) }));
    }
    if (payload.exchangeRateId && !rate.ids.has(str(payload.exchangeRateId))) {
      errors.push(problem('transaction_exchange_rate_unresolved', { id }));
    }
  }

  // --- postings ------------------------------------------------------------
  for (const item of postings) {
    const id = str(item?.id);
    if (!id) { errors.push(problem('posting_missing_id')); continue; }
    if (!tx.ids.has(str(item?.transactionId))) {
      errors.push(problem('posting_transaction_unresolved', { id, transactionId: str(item?.transactionId) }));
    }
    if (!account.ids.has(str(item?.accountId))) {
      errors.push(problem('posting_account_unresolved', { id, accountId: str(item?.accountId) }));
    }
    if (item?.exchangeRateId && !rate.ids.has(str(item.exchangeRateId))) {
      errors.push(problem('posting_exchange_rate_unresolved', { id }));
    }
    // Minor units are integers by contract. A fractional one means something upstream
    // already lost precision, and importing it would make that permanent.
    if (!isIntegerLike(item?.amountMinor)) {
      errors.push(problem('posting_amount_not_integer_minor', { id }));
    }
    if (!CURRENCY.test(str(item?.currencyCode))) {
      errors.push(problem('posting_invalid_currency', { id }));
    }
    if (!str(item?.bucket)) errors.push(problem('posting_missing_bucket', { id }));
    if (!str(item?.role)) errors.push(problem('posting_missing_role', { id }));
  }

  // --- links ---------------------------------------------------------------
  for (const item of links) {
    const id = str(item?.id);
    if (!id) { errors.push(problem('link_missing_id')); continue; }
    if (!tx.ids.has(str(item?.transactionId))) {
      errors.push(problem('link_transaction_unresolved', { id, transactionId: str(item?.transactionId) }));
    }
    if (!str(item?.linkId)) errors.push(problem('link_missing_target', { id }));
    if (!str(item?.relation)) errors.push(problem('link_missing_relation', { id }));
    if (!isIntegerLike(item?.appliedAmountMinor)) {
      errors.push(problem('link_amount_not_integer_minor', { id }));
    }
    if (item?.currencyCode && !CURRENCY.test(str(item.currencyCode))) {
      errors.push(problem('link_invalid_currency', { id }));
    }
  }

  // --- accounts ------------------------------------------------------------
  for (const item of accounts) {
    const id = str(item?.id);
    if (!id) { errors.push(problem('account_missing_id')); continue; }
    if (!CURRENCY.test(str(item?.currencyCode))) {
      errors.push(problem('account_invalid_currency', { id }));
    }
    if (!str(item?.accountType)) errors.push(problem('account_missing_type', { id }));
  }

  // --- exchange rates ------------------------------------------------------
  for (const item of exchangeRates) {
    const id = str(item?.id);
    if (!id) { errors.push(problem('exchange_rate_missing_id')); continue; }
    for (const [field, code] of [
      ['baseCurrencyCode', 'exchange_rate_invalid_base_currency'],
      ['quoteCurrencyCode', 'exchange_rate_invalid_quote_currency'],
    ]) {
      if (!CURRENCY.test(str(item?.[field]))) errors.push(problem(code, { id }));
    }
    if (!isIntegerLike(item?.numerator)) errors.push(problem('exchange_rate_invalid_numerator', { id }));
    if (!isIntegerLike(item?.denominator) || Number(item?.denominator) === 0) {
      errors.push(problem('exchange_rate_invalid_denominator', { id }));
    }
    if (!ISO_DATE.test(str(item?.rateDate))) errors.push(problem('exchange_rate_invalid_date', { id }));
  }

  // --- entities ------------------------------------------------------------
  for (const item of entities) {
    const type = str(item?.entityType);
    const id = str(item?.id);
    if (!type) { errors.push(problem('entity_missing_type', { id })); continue; }
    if (!id) { errors.push(problem('entity_missing_id', { entityType: type })); continue; }
    if (!isIntegerLike(item?.revision) || Number(item?.revision) < 1) {
      errors.push(problem('entity_invalid_revision', { entityType: type, id }));
    }
    if (item?.deletedAt && !isTimestamp(item.deletedAt)) {
      errors.push(problem('entity_invalid_tombstone', { entityType: type, id }));
    }
    const payload = item?.payload;
    if (payload === undefined) {
      errors.push(problem('entity_missing_payload', { entityType: type, id }));
      continue;
    }
    if (type === 'wallet' && payload && !CURRENCY.test(str(payload.currency))) {
      errors.push(problem('wallet_invalid_currency', { id }));
    }
    // Trackers that name a wallet must name one that exists. No name matching, no
    // fallback to a default: an unresolvable reference is refused.
    if (['debt', 'goal', 'commitment'].includes(type)
        && payload && payload.walletId && !walletIds.has(str(payload.walletId))) {
      errors.push(problem('tracker_wallet_unresolved', { entityType: type, id, walletId: str(payload.walletId) }));
    }
  }

  // --- archives ------------------------------------------------------------
  for (const item of archives) {
    const archiveTransactions = rows(item?.data?.trans);
    const year = item?.year;
    if (year !== null && year !== undefined && !isIntegerLike(year)) {
      errors.push(problem('archive_invalid_year', { year: str(year) }));
    }
    const archiveIds = collectDuplicates(archiveTransactions, row => str(row?.id));
    for (const id of archiveIds.duplicates) errors.push(problem('duplicate_archived_transaction_id', { id }));
    for (const row of archiveTransactions) {
      if (!str(row?.id)) errors.push(problem('archived_transaction_missing_id', { year: str(year) }));
    }
    // The same id living in both the active ledger and an archive is ambiguous about
    // which copy is current.
    for (const row of archiveTransactions) {
      if (tx.ids.has(str(row?.id))) {
        errors.push(problem('archived_transaction_also_active', { id: str(row?.id) }));
      }
    }
  }

  return {
    ok: errors.length === 0,
    validatorVersion: RESTORE_VALIDATOR_VERSION,
    errors,
    counts: {
      transactions: transactions.length,
      postings: postings.length,
      links: links.length,
      accounts: accounts.length,
      exchangeRates: exchangeRates.length,
      entities: entities.length,
      archives: archives.length,
      errors: errors.length,
    },
  };
};
