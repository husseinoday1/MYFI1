// Phase 10 / P10-013 — bounded SQL structural/financial proof for a single
// private restore namespace. It returns codes + counts only; never raw financial
// rows, amounts, balances, titles or notes.

export const RESTORE_SQL_VALIDATOR_V13_VERSION = 1;

const text = value => String(value ?? '').trim();
const privateNamespace = value => /::(?:shadow-stage|restore-stage|restore-checkpoint)::/.test(text(value));
const issue = (code, count) => Object.freeze({ code, count: Number(count) });

const queryCount = async (database, sql, params) => Number((await database.getFirstAsync(sql, ...params))?.n || 0);
const one = namespace => [namespace];
const twice = namespace => [namespace, namespace];

export const proveRestoreNamespaceSqlV13 = async ({ database, namespace } = {}) => {
  const target = text(namespace);
  if (!database?.getFirstAsync || !target || !privateNamespace(target)) {
    throw new Error('restore_sql_validator_input_invalid');
  }

  // All checks are namespace-scoped scalar counts. Parent lookups use the existing
  // composite primary keys. The one child-existence check uses EXCEPT so postings are
  // scanned once instead of a correlated transaction->postings lookup at 100k rows.
  const checks = [
    ['workspace_row_count', `SELECT ABS(COUNT(*)-1) AS n FROM ledger_workspace_state_v7 WHERE namespace=?`, one],
    ['workspace_payload_invalid', `SELECT COUNT(*) AS n FROM ledger_workspace_state_v7 WHERE namespace=? AND (
       source_mode<>'shadow' OR schema_version<>7 OR NOT json_valid(payload_json)
       OR CASE WHEN json_valid(payload_json) THEN json_type(payload_json)<>'object' OR json_type(payload_json,'$.cfg')<>'object' ELSE 1 END
     )`, one],

    ['transaction_missing_id', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND TRIM(id)=''`, one],
    ['transaction_invalid_revision', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND (typeof(revision)<>'integer' OR revision<1)`, one],
    ['transaction_invalid_date', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND (date(date_iso) IS NULL OR date(date_iso)<>date_iso)`, one],
    ['transaction_invalid_tombstone', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND deleted_at IS NOT NULL AND julianday(deleted_at) IS NULL`, one],
    ['transaction_invalid_archived_at', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND archived_at IS NOT NULL AND julianday(archived_at) IS NULL`, one],
    ['transaction_archive_year_without_archived_at', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND archive_year IS NOT NULL AND archived_at IS NULL`, one],
    ['transaction_payload_invalid_json', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND (
       NOT json_valid(payload_json) OR CASE WHEN json_valid(payload_json) THEN json_type(payload_json)<>'object' ELSE 1 END
     )`, one],
    ['transaction_payload_invalid_date', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND
       CASE WHEN json_valid(payload_json) AND NULLIF(TRIM(CAST(json_extract(payload_json,'$.dateISO') AS TEXT)),'') IS NOT NULL
         THEN date(CAST(json_extract(payload_json,'$.dateISO') AS TEXT)) IS NULL OR date(CAST(json_extract(payload_json,'$.dateISO') AS TEXT))<>CAST(json_extract(payload_json,'$.dateISO') AS TEXT)
         ELSE 0 END`, one],
    ['transaction_payload_invalid_currency', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 WHERE namespace=? AND
       CASE WHEN json_valid(payload_json) THEN
         (NULLIF(TRIM(CAST(json_extract(payload_json,'$.currencyCode') AS TEXT)),'') IS NOT NULL AND
           (length(CAST(json_extract(payload_json,'$.currencyCode') AS TEXT))<>3 OR CAST(json_extract(payload_json,'$.currencyCode') AS TEXT)<>UPPER(CAST(json_extract(payload_json,'$.currencyCode') AS TEXT)) OR CAST(json_extract(payload_json,'$.currencyCode') AS TEXT) NOT GLOB '[A-Z][A-Z][A-Z]'))
         OR (NULLIF(TRIM(CAST(json_extract(payload_json,'$.walletCurrency') AS TEXT)),'') IS NOT NULL AND
           (length(CAST(json_extract(payload_json,'$.walletCurrency') AS TEXT))<>3 OR CAST(json_extract(payload_json,'$.walletCurrency') AS TEXT)<>UPPER(CAST(json_extract(payload_json,'$.walletCurrency') AS TEXT)) OR CAST(json_extract(payload_json,'$.walletCurrency') AS TEXT) NOT GLOB '[A-Z][A-Z][A-Z]'))
         OR (NULLIF(TRIM(CAST(json_extract(payload_json,'$.baseCurrencyCode') AS TEXT)),'') IS NOT NULL AND
           (length(CAST(json_extract(payload_json,'$.baseCurrencyCode') AS TEXT))<>3 OR CAST(json_extract(payload_json,'$.baseCurrencyCode') AS TEXT)<>UPPER(CAST(json_extract(payload_json,'$.baseCurrencyCode') AS TEXT)) OR CAST(json_extract(payload_json,'$.baseCurrencyCode') AS TEXT) NOT GLOB '[A-Z][A-Z][A-Z]'))
       ELSE 0 END`, one],
    // Match the accepted V11 structural validator: a wallet reference resolves to a
    // wallet entity even if that entity is tombstoned; this path must not silently
    // become stricter than the compatibility contract.
    ['transaction_wallet_unresolved', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 tx WHERE tx.namespace=? AND
       CASE WHEN json_valid(tx.payload_json) AND NULLIF(TRIM(CAST(json_extract(tx.payload_json,'$.walletId') AS TEXT)),'') IS NOT NULL
         THEN NOT EXISTS (SELECT 1 FROM ledger_entities_v7 e WHERE e.namespace=tx.namespace AND e.entity_type='wallet' AND e.id=CAST(json_extract(tx.payload_json,'$.walletId') AS TEXT))
         ELSE 0 END`, one],
    ['transaction_exchange_rate_unresolved', `SELECT COUNT(*) AS n FROM ledger_financial_transactions_v7 tx WHERE tx.namespace=? AND
       CASE WHEN json_valid(tx.payload_json) AND NULLIF(TRIM(CAST(json_extract(tx.payload_json,'$.exchangeRateId') AS TEXT)),'') IS NOT NULL
         THEN NOT EXISTS (SELECT 1 FROM ledger_exchange_rates_v7 r WHERE r.namespace=tx.namespace AND r.id=CAST(json_extract(tx.payload_json,'$.exchangeRateId') AS TEXT))
         ELSE 0 END`, one],

    ['posting_missing_id', `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=? AND TRIM(id)=''`, one],
    ['posting_transaction_unresolved', `SELECT COUNT(*) AS n FROM ledger_postings_v7 p LEFT JOIN ledger_financial_transactions_v7 tx ON tx.namespace=p.namespace AND tx.id=p.transaction_id WHERE p.namespace=? AND tx.id IS NULL`, one],
    ['posting_account_unresolved', `SELECT COUNT(*) AS n FROM ledger_postings_v7 p LEFT JOIN ledger_accounts_v7 a ON a.namespace=p.namespace AND a.id=p.account_id WHERE p.namespace=? AND a.id IS NULL`, one],
    ['posting_exchange_rate_unresolved', `SELECT COUNT(*) AS n FROM ledger_postings_v7 p LEFT JOIN ledger_exchange_rates_v7 r ON r.namespace=p.namespace AND r.id=p.exchange_rate_id WHERE p.namespace=? AND p.exchange_rate_id IS NOT NULL AND r.id IS NULL`, one],
    ['posting_amount_not_integer_minor', `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=? AND (typeof(amount_minor)<>'integer' OR amount_minor=0)`, one],
    ['posting_invalid_currency', `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=? AND (length(currency_code)<>3 OR currency_code<>UPPER(currency_code) OR currency_code NOT GLOB '[A-Z][A-Z][A-Z]')`, one],
    ['posting_missing_bucket_or_role', `SELECT COUNT(*) AS n FROM ledger_postings_v7 WHERE namespace=? AND (TRIM(bucket)='' OR TRIM(role)='')`, one],

    ['link_missing_id_or_target', `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=? AND (TRIM(id)='' OR TRIM(link_id)='' OR TRIM(relation)='')`, one],
    ['link_transaction_unresolved', `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 l LEFT JOIN ledger_financial_transactions_v7 tx ON tx.namespace=l.namespace AND tx.id=l.transaction_id WHERE l.namespace=? AND tx.id IS NULL`, one],
    ['link_amount_not_integer_minor', `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=? AND applied_amount_minor IS NOT NULL AND typeof(applied_amount_minor)<>'integer'`, one],
    ['link_invalid_currency', `SELECT COUNT(*) AS n FROM ledger_transaction_links_v7 WHERE namespace=? AND currency_code IS NOT NULL AND (length(currency_code)<>3 OR currency_code<>UPPER(currency_code) OR currency_code NOT GLOB '[A-Z][A-Z][A-Z]')`, one],

    ['account_missing_id_or_type', `SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=? AND (TRIM(id)='' OR TRIM(account_type)='')`, one],
    ['account_currency_invalid', `SELECT COUNT(*) AS n FROM ledger_accounts_v7 WHERE namespace=? AND (length(currency_code)<>3 OR currency_code<>UPPER(currency_code) OR currency_code NOT GLOB '[A-Z][A-Z][A-Z]')`, one],

    ['exchange_rate_missing_id', `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=? AND TRIM(id)=''`, one],
    ['exchange_rate_invalid_value', `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=? AND (typeof(numerator)<>'integer' OR numerator<=0 OR typeof(denominator)<>'integer' OR denominator<=0)`, one],
    ['exchange_rate_invalid_currency', `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=? AND (
       length(base_currency_code)<>3 OR base_currency_code<>UPPER(base_currency_code) OR base_currency_code NOT GLOB '[A-Z][A-Z][A-Z]'
       OR length(quote_currency_code)<>3 OR quote_currency_code<>UPPER(quote_currency_code) OR quote_currency_code NOT GLOB '[A-Z][A-Z][A-Z]')`, one],
    ['exchange_rate_invalid_date', `SELECT COUNT(*) AS n FROM ledger_exchange_rates_v7 WHERE namespace=? AND (date(rate_date) IS NULL OR date(rate_date)<>rate_date)`, one],

    ['entity_missing_identity', `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=? AND (TRIM(entity_type)='' OR TRIM(id)='')`, one],
    ['entity_invalid_revision', `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=? AND (typeof(revision)<>'integer' OR revision<1)`, one],
    ['entity_invalid_tombstone', `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=? AND deleted_at IS NOT NULL AND julianday(deleted_at) IS NULL`, one],
    ['entity_payload_invalid_json', `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=? AND (
       NOT json_valid(payload_json) OR CASE WHEN json_valid(payload_json) THEN json_type(payload_json)<>'object' ELSE 1 END
     )`, one],
    ['wallet_invalid_currency', `SELECT COUNT(*) AS n FROM ledger_entities_v7 WHERE namespace=? AND entity_type='wallet' AND
       CASE WHEN json_valid(payload_json) AND NULLIF(TRIM(CAST(json_extract(payload_json,'$.currency') AS TEXT)),'') IS NOT NULL
         THEN length(CAST(json_extract(payload_json,'$.currency') AS TEXT))<>3 OR CAST(json_extract(payload_json,'$.currency') AS TEXT)<>UPPER(CAST(json_extract(payload_json,'$.currency') AS TEXT)) OR CAST(json_extract(payload_json,'$.currency') AS TEXT) NOT GLOB '[A-Z][A-Z][A-Z]'
         ELSE 0 END`, one],
    ['tracker_wallet_unresolved', `SELECT COUNT(*) AS n FROM ledger_entities_v7 e WHERE e.namespace=? AND e.entity_type IN ('debt','goal','commitment') AND
       CASE WHEN json_valid(e.payload_json) AND NULLIF(TRIM(CAST(json_extract(e.payload_json,'$.walletId') AS TEXT)),'') IS NOT NULL
         THEN NOT EXISTS (SELECT 1 FROM ledger_entities_v7 w WHERE w.namespace=e.namespace AND w.entity_type='wallet' AND w.id=CAST(json_extract(e.payload_json,'$.walletId') AS TEXT))
         ELSE 0 END`, one],

    ['archive_invalid_year', `SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=? AND typeof(year)<>'integer'`, one],
    ['archive_metadata_invalid_json', `SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=? AND (
       NOT json_valid(metadata_json) OR CASE WHEN json_valid(metadata_json) THEN json_type(metadata_json)<>'object' ELSE 1 END
     )`, one],
    ['archive_metadata_collection_invalid', `SELECT COUNT(*) AS n FROM cold_archive_years WHERE namespace=? AND CASE WHEN json_valid(metadata_json) THEN
       (json_type(metadata_json,'$.debts') IS NOT NULL AND json_type(metadata_json,'$.debts')<>'array')
       OR (json_type(metadata_json,'$.goals') IS NOT NULL AND json_type(metadata_json,'$.goals')<>'array')
       OR (json_type(metadata_json,'$.wallets') IS NOT NULL AND json_type(metadata_json,'$.wallets')<>'array')
       OR (json_type(metadata_json,'$.commitments') IS NOT NULL AND json_type(metadata_json,'$.commitments')<>'array')
       OR (json_type(metadata_json,'$.cats') IS NOT NULL AND json_type(metadata_json,'$.cats')<>'array') ELSE 0 END`, one],
    ['archive_payload_invalid_json', `SELECT COUNT(*) AS n FROM cold_archive_transactions WHERE namespace=? AND (
       TRIM(id)='' OR NOT json_valid(payload_json) OR CASE WHEN json_valid(payload_json) THEN json_type(payload_json)<>'object' ELSE 1 END
     )`, one],
    ['archived_transaction_also_active', `SELECT COUNT(*) AS n FROM cold_archive_transactions a JOIN ledger_financial_transactions_v7 tx ON tx.namespace=a.namespace AND tx.id=a.id WHERE a.namespace=?`, one],

    ['transactions_without_postings', `SELECT COUNT(*) AS n FROM (
       SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? AND deleted_at IS NULL
       EXCEPT SELECT transaction_id FROM ledger_postings_v7 WHERE namespace=?
     )`, twice],
    // Scan postings once and join each posting to its transaction by the transaction PK.
    ['invalid_transfer_legs', `SELECT COUNT(*) AS n FROM (
       SELECT p.transaction_id,
              SUM(CASE WHEN p.role='transfer_source' AND p.amount_minor<0 THEN 1 ELSE 0 END) AS sources,
              SUM(CASE WHEN p.role='transfer_destination' AND p.amount_minor>0 THEN 1 ELSE 0 END) AS destinations
         FROM ledger_postings_v7 p
         JOIN ledger_financial_transactions_v7 tx ON tx.namespace=p.namespace AND tx.id=p.transaction_id
        WHERE p.namespace=? AND tx.deleted_at IS NULL AND tx.kind='transfer'
        GROUP BY p.transaction_id HAVING sources<>1 OR destinations<>1
     )`, one],
    ['unresolved_fx', `SELECT COUNT(*) AS n FROM ledger_postings_v7 p JOIN ledger_financial_transactions_v7 tx ON tx.namespace=p.namespace AND tx.id=p.transaction_id WHERE p.namespace=? AND tx.deleted_at IS NULL AND
       CASE WHEN json_valid(tx.payload_json) THEN UPPER(p.currency_code)<>UPPER(COALESCE(json_extract(tx.payload_json,'$.baseCurrencyCode'),p.currency_code)) AND p.exchange_rate_id IS NULL ELSE 0 END`, one],
    ['duplicate_opening_balance', `SELECT COUNT(*) AS n FROM (
       SELECT p.account_id FROM ledger_postings_v7 p JOIN ledger_financial_transactions_v7 tx ON tx.namespace=p.namespace AND tx.id=p.transaction_id
        WHERE p.namespace=? AND tx.deleted_at IS NULL AND tx.kind='opening_balance'
        GROUP BY p.account_id HAVING COUNT(*)>1
     )`, one],
  ];

  const issues = [];
  for (const [code, sql, paramsFor] of checks) {
    const count = await queryCount(database, sql, paramsFor(target));
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('restore_sql_validator_count_invalid');
    if (count) issues.push(issue(code, count));
  }
  return Object.freeze({
    supported: true,
    ok: issues.length === 0,
    validatorVersion: RESTORE_SQL_VALIDATOR_V13_VERSION,
    issueCount: issues.reduce((sum, item) => sum + item.count, 0),
    issues: Object.freeze(issues),
  });
};
