// MYFI_R04_U2_FINANCIAL_COMMAND_POLICY
// Fail-closed semantic guards required before Phase 6 write-path work.
// Unsupported financial meanings are rejected rather than guessed.

const DEBT_FLOWS = new Set([
  'debt_payment',
  'debt_proceeds',
  'receivable_created',
  'receivable_collection',
]);

const REVERSAL_FLOWS = new Set(['refund', 'reversal']);

const nonEmpty = value => String(value ?? '').trim();

const amountForSignPolicy = transaction => {
  const value = transaction?.walletAmount
    ?? transaction?.amt
    ?? transaction?.baseAmount
    ?? null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
};

export const isDebtFinancialTransaction = (transaction = {}) => (
  !!transaction?.debtId
  || !!transaction?.isDebtPayment
  || !!transaction?.isDebtOrigin
  || DEBT_FLOWS.has(String(transaction?.flowType || ''))
);

export const assertDebtComponentPolicy = (transaction = {}) => {
  if (!isDebtFinancialTransaction(transaction)) return true;

  const component = nonEmpty(
    transaction.debtComponent
    ?? transaction.debtPaymentComponent
    ?? transaction.componentType
    ?? 'principal',
  ).toLowerCase();

  if (component !== 'principal') {
    throw new Error('financial_debt_component_not_supported');
  }

  const unsupportedAmountFields = [
    'interestAmount',
    'interestAmountMinor',
    'debtInterest',
    'debtInterestAmount',
    'debtInterestAmountMinor',
    'feeAmount',
    'feeAmountMinor',
    'debtFee',
    'debtFeeAmount',
    'debtFeeAmountMinor',
  ];

  for (const key of unsupportedAmountFields) {
    if (!Object.prototype.hasOwnProperty.call(transaction, key)) continue;
    const value = Number(transaction[key]);
    if (Number.isFinite(value) && Math.abs(value) > 0) {
      throw new Error('financial_debt_component_not_supported');
    }
  }

  const components = Array.isArray(transaction.debtComponents)
    ? transaction.debtComponents
    : Array.isArray(transaction.paymentComponents)
      ? transaction.paymentComponents
      : [];

  for (const item of components) {
    const type = nonEmpty(item?.type ?? item?.component ?? 'principal').toLowerCase();
    if (type && type !== 'principal') {
      throw new Error('financial_debt_component_not_supported');
    }
  }

  return true;
};

export const assertReversalPolicy = (transaction = {}) => {
  const flow = nonEmpty(transaction.flowType).toLowerCase();
  const kind = nonEmpty(transaction.kind).toLowerCase();

  const explicitReference = [
    transaction.refundOf,
    transaction.refundOfTransactionId,
    transaction.reversalOf,
    transaction.reversalOfTransactionId,
    transaction.reversesTransactionId,
  ].some(value => !!nonEmpty(value));

  if (
    REVERSAL_FLOWS.has(flow)
    || REVERSAL_FLOWS.has(kind)
    || transaction.isRefund === true
    || transaction.isReversal === true
    || explicitReference
  ) {
    throw new Error('financial_refund_reversal_not_supported');
  }

  return true;
};

export const assertFlowSignPolicy = (transaction = {}) => {
  const flow = nonEmpty(transaction.flowType).toLowerCase();
  const amount = amountForSignPolicy(transaction);
  if (amount == null || amount === 0) return true;

  if (flow === 'income' && amount < 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'expense' && amount > 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'commitment_payment' && amount > 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'debt_payment' && amount > 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'debt_proceeds' && amount < 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'receivable_created' && amount > 0) {
    throw new Error('financial_flow_sign_mismatch');
  }
  if (flow === 'receivable_collection' && amount < 0) {
    throw new Error('financial_flow_sign_mismatch');
  }

  return true;
};

export const assertFinancialCommandPolicy = (transaction = {}) => {
  assertReversalPolicy(transaction);
  assertDebtComponentPolicy(transaction);
  assertFlowSignPolicy(transaction);
  return true;
};
