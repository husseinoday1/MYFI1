import { FLOW_TYPES } from './modules';

export const TRANSACTION_TAGS = [
  { id: 'none', label: 'بدون وسم', labelEn: 'No tag', icon: 'remove-circle-outline' },
  { id: 'debt_owed', label: 'دين عليّ', labelEn: 'Debt I owe', icon: 'arrow-up-circle-outline' },
  { id: 'debt_receivable', label: 'دين لي', labelEn: 'Debt owed to me', icon: 'arrow-down-circle-outline' },
  { id: 'saving', label: 'توفير', labelEn: 'Saving', icon: 'save-outline' },
  { id: 'commitment', label: 'التزام', labelEn: 'Commitment', icon: 'calendar-outline' },
  { id: 'installment', label: 'قسط', labelEn: 'Installment', icon: 'layers-outline' },
  { id: 'subscription', label: 'اشتراك', labelEn: 'Subscription', icon: 'repeat-outline' },
  { id: 'refund', label: 'استرداد', labelEn: 'Refund', icon: 'return-down-back-outline' },
  { id: 'cash_deposit', label: 'إيداع نقدي', labelEn: 'Cash deposit', icon: 'cash-outline' },
  { id: 'cash_withdrawal', label: 'سحب نقدي', labelEn: 'Cash withdrawal', icon: 'card-outline' },
  { id: 'transfer', label: 'تحويل', labelEn: 'Transfer', icon: 'swap-horizontal-outline' },
  { id: 'opening_balance', label: 'رصيد افتتاحي', labelEn: 'Opening balance', icon: 'flag-outline' },
  { id: 'balance_adjustment', label: 'تسوية رصيد', labelEn: 'Balance adjustment', icon: 'git-compare-outline' },
];

const TAG_BY_ID = new Map(TRANSACTION_TAGS.map(item => [item.id, item]));

export const inferTransactionTag = (tx = {}) => {
  if (TAG_BY_ID.has(tx.transactionTag)) return tx.transactionTag;
  if (tx.kind === 'transfer' || tx.flowType === FLOW_TYPES.TRANSFER) return 'transfer';
  if (tx.isOpeningBalance || tx.flowType === FLOW_TYPES.OPENING_BALANCE) return 'opening_balance';
  if (tx.isBalanceAdjustment || tx.flowType === FLOW_TYPES.BALANCE_ADJUSTMENT) return 'balance_adjustment';
  if (tx.isCommitmentPayment || tx.flowType === FLOW_TYPES.COMMITMENT_PAYMENT) return 'commitment';
  if (tx.isGoalSaving || tx.flowType === FLOW_TYPES.GOAL_ALLOCATION) return 'saving';
  if (tx.flowType === FLOW_TYPES.RECEIVABLE_CREATED || tx.flowType === FLOW_TYPES.RECEIVABLE_COLLECTION) return 'debt_receivable';
  if (tx.flowType === FLOW_TYPES.DEBT_PROCEEDS || tx.flowType === FLOW_TYPES.DEBT_PAYMENT) return 'debt_owed';
  if (tx.isDebtOrigin || tx.isDebtPayment) return Number(tx.amt || 0) > 0 ? 'debt_receivable' : 'debt_owed';
  return 'none';
};

export const normalizeTransactionTag = (tx = {}) => ({
  ...tx,
  transactionTag: inferTransactionTag(tx),
});

export const getTransactionTagMeta = (value) => {
  const id = typeof value === 'string' ? value : inferTransactionTag(value);
  return TAG_BY_ID.get(id) || TAG_BY_ID.get('none');
};

export const getTransactionTagLabel = (value, lang = 'ar') => {
  const tag = getTransactionTagMeta(value);
  return lang === 'ar' ? tag.label : tag.labelEn;
};

export const searchableTransactionTags = (lang = 'ar') => TRANSACTION_TAGS.map(item => ({
  ...item,
  displayLabel: lang === 'ar' ? item.label : item.labelEn,
}));
