export const getVisibleHistoryTransactions = (transactions = [], cfg = {}) => {
  const all = Array.isArray(transactions) ? transactions : [];

  // History is the full ledger. Preserve the authoritative array reference when
  // rows are valid so the large-ledger transaction index can be shared/cached.
  // Only malformed/null rows require a defensive filtered copy.
  return all.every(Boolean) ? all : all.filter(Boolean);
};


export const ledgerPageCoversFallback = (ledgerRows = [], fallbackRows = [], limit = 250) => {
  const ledgerIds = new Set((Array.isArray(ledgerRows) ? ledgerRows : []).map(item => String(item?.id || '')).filter(Boolean));
  const expected = (Array.isArray(fallbackRows) ? fallbackRows : [])
    .slice(0, Math.max(1, Number(limit) || 250))
    .map(item => String(item?.id || ''))
    .filter(Boolean);
  return expected.every(id => ledgerIds.has(id));
};
