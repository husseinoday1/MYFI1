// MYFI Phase 15 — History read-path telemetry.
//
// Diagnostic only. This module counts; it changes no behaviour, and nothing here
// decides what History renders.
//
// WHY THIS EXISTS
//
// HistoryScreen runs a real SQL query (queryLedgerTransactions) but renders it
// behind an in-memory fallback. Two different things get called "falling back",
// and conflating them is exactly what this module prevents:
//
//   1. The by-design first paint. On mount and after every mutation or filter
//      change, HistoryScreen deliberately shows the in-memory list until the SQL
//      query returns ~120ms later. That is intentional and is NOT counted here as
//      a rejection — counting it would make the reject rate look like 100%.
//   2. A rejected SQL page. The SQL result came back and was refused, because
//      ledgerPageCoversFallback found an id in the in-memory list that the SQL
//      page did not contain, or the query failed or was unsupported. THIS is the
//      number nobody has, and the one that decides whether the fallback can be
//      removed safely.
//
// If (2) is effectively zero on a cut-over device in normal use, the fallback is
// a safety net over a risk that no longer materialises. If it is not zero, the
// net is hiding a real defect and removing it would surface bugs rather than fix
// them — which is worth knowing before anyone touches it.
//
// Counters are module-level on purpose: writing them into the Zustand store on
// every query would re-render the very screen being measured.

const EMPTY = () => ({
  accepted: 0,
  rejectedCoverage: 0,
  unsupported: 0,
  errored: 0,
  firstAt: null,
  lastAt: null,
  // Bounded ring of the most recent rejections, for diagnosing WHY coverage
  // failed rather than only how often. Capped so a long session cannot grow it.
  recentRejections: [],
});

const MAX_SAMPLES = 10;

let counters = EMPTY();

const nowIso = () => new Date().toISOString();

/**
 * Record the outcome of one completed SQL page query.
 *
 * Call this only when a query has actually resolved to an outcome — never for
 * the intentional pre-query paint, which is not a fallback in the meaningful
 * sense (see the header).
 *
 * @param {'accepted'|'rejected_coverage'|'unsupported'|'error'} outcome
 * @param {object} [detail] context recorded only for rejections
 */
export const recordHistoryLedgerQueryOutcome = (outcome, detail = {}) => {
  const at = nowIso();
  if (!counters.firstAt) counters.firstAt = at;
  counters.lastAt = at;

  if (outcome === 'accepted') { counters.accepted += 1; return; }
  if (outcome === 'unsupported') { counters.unsupported += 1; return; }
  if (outcome === 'error') {
    counters.errored += 1;
    counters.recentRejections = [
      ...counters.recentRejections.slice(-(MAX_SAMPLES - 1)),
      { at, kind: 'error', reason: String(detail?.reason || '').slice(0, 200) },
    ];
    return;
  }
  if (outcome !== 'rejected_coverage') return;

  counters.rejectedCoverage += 1;
  counters.recentRejections = [
    ...counters.recentRejections.slice(-(MAX_SAMPLES - 1)),
    {
      at,
      kind: 'coverage',
      // Sizes, not row contents: this is a diagnostic surface the user can copy
      // to clipboard, so it must never carry financial data out of the app.
      sqlRows: Number(detail?.sqlRows || 0),
      fallbackRows: Number(detail?.fallbackRows || 0),
      // Which filters were active tells us whether rejections cluster on a
      // particular filter's SQL semantics.
      filters: {
        search: Boolean(detail?.search),
        transactionClass: detail?.transactionClass || null,
        category: Boolean(detail?.category),
        wallet: Boolean(detail?.wallet),
        scope: detail?.scope || null,
        dated: Boolean(detail?.dated),
      },
    },
  ];
};

export const readHistoryReadPathTelemetry = () => {
  const resolved = counters.accepted + counters.rejectedCoverage
    + counters.unsupported + counters.errored;
  return {
    ...counters,
    recentRejections: [...counters.recentRejections],
    resolvedQueries: resolved,
    // Share of resolved queries whose SQL result was NOT used. Null rather than
    // 0 when nothing has been observed, so "no data yet" cannot be misread as
    // "a perfect score".
    rejectRate: resolved > 0
      ? Number(((counters.rejectedCoverage + counters.unsupported + counters.errored) / resolved).toFixed(4))
      : null,
  };
};

export const resetHistoryReadPathTelemetry = () => { counters = EMPTY(); };
