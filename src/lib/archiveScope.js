// MYFI_ARCHIVE_SCOPE_CONTRACT_P11A
// Frozen Master Plan §74: every ledger query declares its archive scope
// explicitly as ACTIVE / ARCHIVED / ALL.
//
// There is deliberately no default. Before Phase 11 the scope was a boolean
// (`archived`) on one query and a differently-shaped boolean (`includeArchived`)
// on another, both defaulting to ACTIVE — so a caller that simply forgot the
// parameter silently got a narrowed result instead of an error. Requiring the
// scope turns "I forgot" into a thrown error at the call site.
//
// §73 keeps this a visibility contract only: nothing here may change an amount,
// a rate or a balance. Archive decides what a query *sees*, never what it *is*.

export const ARCHIVE_SCOPE = Object.freeze({
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  ALL: 'ALL',
});

const ARCHIVE_SCOPE_VALUES = new Set(Object.values(ARCHIVE_SCOPE));

export const isArchiveScope = value => ARCHIVE_SCOPE_VALUES.has(value);

export const requireArchiveScope = (value, caller = 'ledger_query') => {
  if (!ARCHIVE_SCOPE_VALUES.has(value)) throw new Error(`archive_scope_required:${caller}`);
  return value;
};

// §74 "Wallet Balance uses ALL financial postings always". Expressed as an
// executable assertion rather than a comment, so a future caller cannot narrow
// a balance to the active years by accident.
export const requireBalanceArchiveScope = (value, caller = 'wallet_balance') => {
  const scope = requireArchiveScope(value, caller);
  if (scope !== ARCHIVE_SCOPE.ALL) throw new Error(`archive_scope_balance_must_be_all:${caller}`);
  return scope;
};

// Tri-state flag consumed by the V7 row helpers: null means ALL, true means
// ARCHIVED only, false means ACTIVE only.
export const archiveScopeFlag = scope => (
  requireArchiveScope(scope, 'archive_scope_flag') === ARCHIVE_SCOPE.ALL
    ? null
    : scope === ARCHIVE_SCOPE.ARCHIVED
);

// SQL predicate for an `archived_at` column, or null when the scope adds no
// restriction. Callers append it to their WHERE clause list only when non-null.
export const archiveScopeClause = (scope, column = 'archived_at') => {
  switch (requireArchiveScope(scope, 'archive_scope_clause')) {
    case ARCHIVE_SCOPE.ARCHIVED: return `${column} IS NOT NULL`;
    case ARCHIVE_SCOPE.ACTIVE: return `${column} IS NULL`;
    default: return null;
  }
};
