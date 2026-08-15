import { currencyFractionDigits } from './money';
import { moneyToMinor, normalizeCurrencyCode } from './financialCoreV2';

export const FINANCIAL_LEDGER_SCHEMA_VERSION = 7;

const requireText = (value, field) => {
  const result = String(value || '').trim();
  if (!result) throw new Error(`financial_v7_${field}_required`);
  return result;
};

const requireMinor = (value, field) => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error(`financial_v7_${field}_must_be_safe_minor_integer`);
  return result;
};

const gcd = (left, right) => {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};

export const exchangeRateFraction = (value, precision = 8) => {
  const rate = Number(value);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('financial_v7_exchange_rate_invalid');
  const scale = 10 ** Math.max(0, Math.min(8, Number(precision) || 0));
  const scaled = Math.round(rate * scale);
  if (!Number.isSafeInteger(scaled) || scaled <= 0) throw new Error('financial_v7_exchange_rate_out_of_range');
  const divisor = gcd(scaled, scale);
  return { numerator: scaled / divisor, denominator: scale / divisor };
};

const occurredAtFor = (transaction, dateISO) => {
  if (transaction?.occurredAt) return String(transaction.occurredAt);
  const timestamp = Number(transaction?.ts);
  if (Number.isFinite(timestamp) && timestamp > 0) return new Date(timestamp).toISOString();
  return `${dateISO}T12:00:00.000Z`;
};

const kindFor = transaction => {
  if (transaction?.kind === 'transfer' || transaction?.flowType === 'transfer') return 'transfer';
  if (transaction?.flowType === 'opening_balance' || transaction?.isOpeningBalance) return 'opening_balance';
  if (transaction?.flowType === 'balance_adjustment' || transaction?.isBalanceAdjustment) return 'balance_adjustment';
  if (transaction?.flowType === 'goal_release' || transaction?.isGoalRelease) return 'goal_release';
  if (transaction?.isGoalSaving) return 'goal_allocation';
  if (transaction?.isDebtOrigin) return 'debt_origin';
  if (transaction?.isDebtPayment) return 'debt_payment';
  if (transaction?.isCommitmentPayment) return 'commitment_payment';
  return Number(transaction?.walletAmount ?? transaction?.amt ?? 0) >= 0 ? 'income' : 'expense';
};

const accountFor = ({ namespace, wallet, scope, fallbackCurrency, createdAt }) => ({
  namespace,
  id: requireText(wallet?.id, 'account_id'),
  name: String(wallet?.name || wallet?.nameEn || ''),
  accountType: String(wallet?.type || 'other'),
  scope: String(wallet?.scope || scope || 'personal'),
  currencyCode: normalizeCurrencyCode(wallet?.currency, fallbackCurrency),
  status: String(wallet?.status || 'active'),
  createdAt: String(wallet?.createdAt || createdAt),
  updatedAt: String(wallet?.updatedAt || createdAt),
  archivedAt: wallet?.archivedAt || null,
});

const rateFor = ({ namespace, id, fromCurrency, toCurrency, rate, transaction, dateISO, createdAt, source }) => {
  if (fromCurrency === toCurrency) return null;
  const fraction = exchangeRateFraction(rate);
  return {
    namespace,
    id,
    baseCurrencyCode: fromCurrency,
    quoteCurrencyCode: toCurrency,
    numerator: fraction.numerator,
    denominator: fraction.denominator,
    rateDate: String(transaction.rateDate || dateISO),
    source: String(transaction.rateSource || source || 'user_entered'),
    capturedAt: String(transaction.rateCapturedAt || createdAt),
  };
};

const linkRowsFor = ({ namespace, transaction, transactionId, createdAt, reportingCurrency }) => {
  const definitions = [
    transaction.debtId && {
      type: 'debt', id: transaction.debtId,
      relation: transaction.isDebtOrigin ? 'origin' : 'payment',
      amount: transaction.baseAmountMinor ?? moneyToMinor(Math.abs(Number(transaction.baseAmount ?? transaction.amt ?? 0)), reportingCurrency),
    },
    transaction.goalId && {
      type: 'goal', id: transaction.goalId,
      relation: transaction.isGoalRelease ? 'release' : 'allocation',
      amount: transaction.allocationBaseAmountMinor
        ?? moneyToMinor(Math.abs(Number(transaction.allocationAmount ?? transaction.baseAmount ?? 0)), reportingCurrency),
    },
    transaction.commitmentId && {
      type: 'commitment', id: transaction.commitmentId, relation: 'payment',
      amount: transaction.baseAmountMinor ?? moneyToMinor(Math.abs(Number(transaction.baseAmount ?? transaction.amt ?? 0)), reportingCurrency),
    },
  ].filter(Boolean);
  return definitions.map((item, index) => ({
    namespace,
    id: `${transactionId}:link:${item.type}:${item.id}:${index}`,
    transactionId,
    linkType: item.type,
    linkId: String(item.id),
    relation: item.relation,
    appliedAmountMinor: Math.abs(requireMinor(item.amount, `${item.type}_link_amount`)),
    currencyCode: reportingCurrency,
    createdAt,
  }));
};

const posting = ({ namespace, transactionId, accountId, id, bucket = 'physical', role, amountMinor, currencyCode, exchangeRateId = null, createdAt }) => ({
  namespace,
  id: `${transactionId}:${id}`,
  transactionId,
  accountId: requireText(accountId, 'posting_account_id'),
  bucket,
  role,
  amountMinor: requireMinor(amountMinor, `${role}_amount`),
  currencyCode,
  exchangeRateId,
  createdAt,
});

export const buildFinancialLedgerCommand = ({
  namespace = 'guest', transaction = {}, wallets = [], baseCurrency = 'IQD', entityChanges = [],
  now = new Date().toISOString(),
} = {}) => {
  const normalizedNamespace = requireText(namespace, 'namespace');
  const transactionId = requireText(transaction.id, 'transaction_id');
  const dateISO = requireText(transaction.dateISO, 'date_iso');
  const reportingCurrency = normalizeCurrencyCode(transaction.baseCurrencyCode, baseCurrency);
  const kind = kindFor(transaction);
  const createdAt = String(transaction.createdAt || now);
  const walletMap = new Map((Array.isArray(wallets) ? wallets : []).filter(item => item?.id).map(item => [String(item.id), item]));
  const requiredWalletIds = kind === 'transfer'
    ? [transaction.fromWalletId, transaction.toWalletId]
    : kind === 'goal_release' && Array.isArray(transaction.releaseAllocations)
      ? transaction.releaseAllocations.map(item => item?.walletId)
      : [transaction.walletId];
  const accounts = [...new Set(requiredWalletIds.filter(Boolean).map(String))].map(id => accountFor({
    namespace: normalizedNamespace,
    wallet: walletMap.get(id) || { id, currency: transaction.walletCurrency || transaction.currencyCode },
    scope: transaction.scope,
    fallbackCurrency: reportingCurrency,
    createdAt,
  }));
  if (!accounts.length) throw new Error('financial_v7_account_id_required');

  const idempotencyKey = requireText(
    transaction.idempotencyKey || `${kind}:${transactionId}`,
    'idempotency_key',
  );
  const header = {
    namespace: normalizedNamespace,
    id: transactionId,
    kind,
    status: transaction.status === 'voided' ? 'voided' : 'posted',
    scope: String(transaction.scope || accounts[0]?.scope || 'personal'),
    dateISO,
    occurredAt: occurredAtFor(transaction, dateISO),
    categoryId: transaction.cat ? String(transaction.cat) : null,
    title: String(transaction.title || ''),
    note: String(transaction.note || ''),
    sourceType: transaction.sourceType ? String(transaction.sourceType) : null,
    sourceId: transaction.sourceId ? String(transaction.sourceId) : null,
    idempotencyKey,
    deviceId: String(transaction.deviceId || 'local-device'),
    revision: Math.max(1, Number(transaction.revision || 1)),
    archiveYear: Number.isInteger(Number(transaction.archiveYear)) ? Number(transaction.archiveYear) : null,
    archivedAt: transaction.archivedAt || null,
    deletedAt: transaction.deletedAt || null,
    createdAt,
    updatedAt: String(transaction.updatedAt || createdAt),
  };

  const exchangeRates = [];
  const postings = [];
  const addRate = ({ id, fromCurrency, rate, source }) => {
    const row = rateFor({
      namespace: normalizedNamespace, id: `${transactionId}:${id}`, fromCurrency,
      toCurrency: reportingCurrency, rate, transaction, dateISO, createdAt, source,
    });
    if (row) exchangeRates.push(row);
    return row?.id || null;
  };

  const entityCurrencyCode = transaction?.entityCurrencyCode
    ? normalizeCurrencyCode(transaction.entityCurrencyCode, reportingCurrency)
    : null;
  if (entityCurrencyCode && entityCurrencyCode !== reportingCurrency) {
    addRate({
      id: 'entity-to-base-rate',
      fromCurrency: entityCurrencyCode,
      rate: transaction.entityBaseRate,
      source: 'entity_payment',
    });
  }

  if (kind === 'transfer') {
    const fromAccount = accounts.find(item => item.id === String(transaction.fromWalletId));
    const toAccount = accounts.find(item => item.id === String(transaction.toWalletId));
    if (!fromAccount || !toAccount || fromAccount.id === toAccount.id) throw new Error('financial_v7_transfer_accounts_invalid');
    const fromMinor = requireMinor(
      transaction.transferFromAmountMinor
        ?? moneyToMinor(Math.abs(Number(transaction.transferFromAmount ?? transaction.transferAmount)), fromAccount.currencyCode),
      'transfer_from_amount',
    );
    const toMinor = requireMinor(
      transaction.transferToAmountMinor
        ?? moneyToMinor(Math.abs(Number(transaction.transferToAmount ?? transaction.transferAmount)), toAccount.currencyCode),
      'transfer_to_amount',
    );
    if (fromMinor <= 0 || toMinor <= 0) throw new Error('financial_v7_transfer_amount_must_be_positive');
    const fromRateId = addRate({ id: 'from-to-base-rate', fromCurrency: fromAccount.currencyCode, rate: transaction.fromBaseRate ?? transaction.exchangeRate });
    const toRateId = addRate({ id: 'to-to-base-rate', fromCurrency: toAccount.currencyCode, rate: transaction.toBaseRate ?? transaction.exchangeRate });
    postings.push(
      posting({ namespace: normalizedNamespace, transactionId, accountId: fromAccount.id, id: 'source', role: 'transfer_source', amountMinor: -fromMinor, currencyCode: fromAccount.currencyCode, exchangeRateId: fromRateId, createdAt }),
      posting({ namespace: normalizedNamespace, transactionId, accountId: toAccount.id, id: 'destination', role: 'transfer_destination', amountMinor: toMinor, currencyCode: toAccount.currencyCode, exchangeRateId: toRateId, createdAt }),
    );
    const feeMinor = requireMinor(
      transaction.feeAmountMinor ?? moneyToMinor(Math.abs(Number(transaction.feeAmount || 0)), fromAccount.currencyCode),
      'transfer_fee_amount',
    );
    if (feeMinor > 0) postings.push(posting({
      namespace: normalizedNamespace, transactionId, accountId: fromAccount.id, id: 'fee', role: 'fee',
      amountMinor: -feeMinor, currencyCode: fromAccount.currencyCode, exchangeRateId: fromRateId, createdAt,
    }));
    if (fromAccount.currencyCode !== toAccount.currencyCode) {
      const tradeRate = rateFor({
        namespace: normalizedNamespace, id: `${transactionId}:transfer-rate`,
        fromCurrency: fromAccount.currencyCode, toCurrency: toAccount.currencyCode,
        rate: transaction.transferRate ?? transaction.exchangeRate,
        transaction, dateISO, createdAt, source: 'user_entered',
      });
      if (tradeRate && !exchangeRates.some(item => item.id === tradeRate.id)) exchangeRates.push(tradeRate);
    }
  } else if (kind === 'goal_release' && Array.isArray(transaction.releaseAllocations) && transaction.releaseAllocations.length) {
    for (let index = 0; index < transaction.releaseAllocations.length; index += 1) {
      const allocation = transaction.releaseAllocations[index] || {};
      const account = accounts.find(item => item.id === String(allocation.walletId));
      if (!account) throw new Error('financial_v7_goal_release_account_missing');
      const amountMinor = Math.abs(requireMinor(
        allocation.amountMinor ?? moneyToMinor(Math.abs(Number(allocation.amount || 0)), account.currencyCode),
        'goal_release_amount',
      ));
      if (!amountMinor) continue;
      const rateId = addRate({
        id: `release-${index}-wallet-to-base-rate`, fromCurrency: account.currencyCode,
        rate: allocation.exchangeRate ?? transaction.exchangeRate,
      });
      postings.push(posting({
        namespace: normalizedNamespace, transactionId, accountId: account.id,
        id: `release-${index}`, bucket: 'reserved', role: 'release', amountMinor: -amountMinor,
        currencyCode: account.currencyCode, exchangeRateId: rateId, createdAt,
      }));
    }
    if (!postings.length) throw new Error('financial_v7_goal_release_amount_must_not_be_zero');
  } else {
    const account = accounts[0];
    const isAllocation = kind === 'goal_allocation' || kind === 'goal_release';
    const rawAmount = isAllocation
      ? Number(transaction.allocationWalletAmount ?? transaction.walletAmount ?? transaction.allocationAmount ?? 0)
      : Number(transaction.walletAmount ?? transaction.amt ?? 0);
    let amountMinor = isAllocation
      ? transaction.allocationWalletAmountMinor ?? moneyToMinor(Math.abs(rawAmount), account.currencyCode)
      : transaction.walletAmountMinor ?? moneyToMinor(rawAmount, account.currencyCode);
    amountMinor = requireMinor(amountMinor, 'amount');
    if (isAllocation) amountMinor = (kind === 'goal_release' ? -1 : 1) * Math.abs(amountMinor);
    if (!amountMinor) throw new Error('financial_v7_posting_amount_must_not_be_zero');
    if (kind === 'expense' && amountMinor >= 0) throw new Error('financial_v7_expense_amount_must_be_negative');
    if (kind === 'income' && amountMinor <= 0) throw new Error('financial_v7_income_amount_must_be_positive');
    const rateId = addRate({ id: 'wallet-to-base-rate', fromCurrency: account.currencyCode, rate: transaction.exchangeRate });
    postings.push(posting({
      namespace: normalizedNamespace,
      transactionId,
      accountId: account.id,
      id: 'principal',
      bucket: isAllocation ? 'reserved' : 'physical',
      role: isAllocation ? (kind === 'goal_release' ? 'release' : 'allocation') : 'principal',
      amountMinor,
      currencyCode: account.currencyCode,
      exchangeRateId: rateId,
      createdAt,
    }));
  }

  const links = linkRowsFor({ namespace: normalizedNamespace, transaction, transactionId, createdAt, reportingCurrency });
  const entities = (Array.isArray(entityChanges) ? entityChanges : []).filter(item => item?.id && item?.entityType).map(item => ({
    namespace: normalizedNamespace,
    entityType: String(item.entityType),
    id: String(item.id),
    revision: Math.max(1, Number(item.revision || 1)),
    deletedAt: item.deletedAt || null,
    payload: item.payload ?? null,
    createdAt: String(item.createdAt || createdAt),
    updatedAt: String(item.updatedAt || createdAt),
  }));
  const mutation = {
    namespace: normalizedNamespace,
    mutationId: String(transaction.mutationId || `${normalizedNamespace}:${transactionId}:revision:${header.revision}`),
    entityType: 'financial_transaction',
    entityId: transactionId,
    operation: header.deletedAt ? 'delete' : header.status === 'voided' ? 'void' : 'upsert',
    entityRevision: header.revision,
    payloadVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
    createdAt,
  };
  const currencies = [...new Set([
    reportingCurrency,
    ...accounts.map(item => item.currencyCode),
    ...exchangeRates.flatMap(item => [item.baseCurrencyCode, item.quoteCurrencyCode]),
  ])].map(code => ({ code, minorExponent: currencyFractionDigits(code) }));

  return {
    schemaVersion: FINANCIAL_LEDGER_SCHEMA_VERSION,
    currencies,
    accounts,
    header,
    postings,
    exchangeRates,
    links,
    entities,
    originalTransaction: { ...transaction, id: transactionId, dateISO, revision: header.revision },
    mutation,
    // Compatibility aliases for the first Expense vertical-slice tests.
    account: accounts[0],
    posting: postings[0],
    exchangeRate: exchangeRates.find(item => item.id.endsWith(':wallet-to-base-rate')) || null,
  };
};

export const buildExpenseLedgerCommand = ({
  namespace = 'guest', transaction = {}, wallet = null, baseCurrency = 'IQD', now = new Date().toISOString(),
} = {}) => buildFinancialLedgerCommand({
  namespace,
  transaction: { ...transaction, kind: 'expense' },
  wallets: [wallet || { id: transaction.walletId, currency: transaction.walletCurrency || transaction.currencyCode }],
  baseCurrency,
  now,
});
