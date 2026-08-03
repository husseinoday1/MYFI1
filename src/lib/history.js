export const getVisibleHistoryTransactions = (transactions = [], cfg = {}) => {
  const all = Array.isArray(transactions) ? transactions.filter(Boolean) : [];

  // History is the full ledger. It must not disappear because a transaction
  // belongs to an older scope or a feature was later disabled.
  return all;
};
