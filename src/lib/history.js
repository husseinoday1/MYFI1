export const getVisibleHistoryTransactions = (transactions = [], cfg = {}) => {
  const all = Array.isArray(transactions) ? transactions : [];

  // History is the full ledger. Preserve the authoritative array reference when
  // rows are valid so the large-ledger transaction index can be shared/cached.
  // Only malformed/null rows require a defensive filtered copy.
  return all.every(Boolean) ? all : all.filter(Boolean);
};
