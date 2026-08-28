// MYFI_ARCHIVE_SUMMARY_DERIVATION_P11C_D5
// Phase 11-C / ruling D5: archived-year totals must be derived at display time
// from the ledger, not read from the floats stored in `cfg.archiveSummaries`.
//
// Those stored values were computed by `calcStats` at archive time and written
// as plain JavaScript numbers. The Financial Contract requires integer minor
// units and balances derived from postings; a float total copied forward from
// years ago is neither.
//
// But §75 also says historical totals must not change silently. So the switch is
// two steps, and this module is the first: derive the same totals from the
// ledger and COMPARE them against what is stored, reporting any divergence.
// Nothing may move to the derived source until that comparison is clean, and a
// divergence is a finding for a human, not something to overwrite. There is no
// repair path here, by design.

import { ARCHIVE_SCOPE } from './archiveScope';
import { queryLedgerSummary } from './activeLedgerRepository';
import { moneyToMinor } from './financialCoreV2';

const isYear = value => Number.isInteger(Number(value)) && Number(value) > 1900;

/**
 * The archived totals for one year, straight from the ledger.
 *
 * Scope is ARCHIVED, not ALL: this is the archived half of a report, which is
 * added to the separately-queried active half. Asking for ALL here would
 * double-count the active years.
 *
 * The year is expressed as date bounds rather than `archive_year` on purpose:
 * `cfg.archiveSummaries` is keyed by the year of each transaction's own date
 * (`yearOf(item.dateISO)` in commitYearArchive), so matching on dates is what
 * makes the two comparable at all.
 */
export const deriveArchivedYearSummary = async ({
  namespace = 'guest', year, scope = null,
} = {}) => {
  if (!isYear(year)) throw new Error('archive_summary_year_invalid');
  const targetYear = Number(year);
  const summary = await queryLedgerSummary({
    namespace,
    fromDate: `${targetYear}-01-01`,
    toDate: `${targetYear}-12-31`,
    scope,
    archiveScope: ARCHIVE_SCOPE.ARCHIVED,
  });
  if (!summary || summary.supported === false) {
    return { supported: false, year: targetYear, reason: summary?.reason || 'unsupported' };
  }
  return {
    supported: true,
    year: targetYear,
    scope: scope || null,
    count: Number(summary.count || 0),
    income: Number(summary.income || 0),
    expense: Number(summary.expense || 0),
    net: Number(summary.net || 0),
    currency: summary.currency || null,
  };
};

/**
 * Compare one stored summary against its derived counterpart.
 *
 * Comparison is in minor units. Comparing the floats directly would report a
 * divergence for values that are actually equal, and — worse — could hide a real
 * one behind rounding.
 */
export const compareArchivedYearSummary = ({
  stored = null, derived = null, currency = 'IQD',
} = {}) => {
  const code = derived?.currency || currency;
  const toMinor = value => moneyToMinor(Number(value || 0), code);

  if (!stored || !derived?.supported) {
    return {
      year: Number(stored?.year ?? derived?.year ?? 0) || null,
      scope: stored?.scope ?? derived?.scope ?? null,
      comparable: false,
      matches: false,
      reason: !stored ? 'no_stored_summary' : (derived?.reason || 'no_derived_summary'),
    };
  }

  const fields = ['income', 'expense', 'net'].map(field => ({
    field,
    storedMinor: toMinor(stored[field]),
    derivedMinor: toMinor(derived[field]),
  }));
  const mismatched = fields.filter(item => item.storedMinor !== item.derivedMinor);

  // The transaction count is stored as an integer already, so it is compared
  // as-is. A count that disagrees means the two sides are not even looking at
  // the same set of rows, which matters more than any single amount.
  const storedCount = Number(stored.count || 0);
  const derivedCount = Number(derived.count || 0);
  const countMatches = storedCount === derivedCount;

  return {
    year: Number(stored.year) || null,
    scope: stored.scope ?? null,
    comparable: true,
    matches: mismatched.length === 0 && countMatches,
    countMatches,
    storedCount,
    derivedCount,
    fields: fields.map(item => ({ ...item, matches: item.storedMinor === item.derivedMinor })),
    mismatchedFields: mismatched.map(item => item.field),
  };
};

/**
 * Compare every stored summary for a workspace.
 *
 * `deriveFor` is injected so this stays a pure reduction over its inputs: the
 * caller decides how a year is derived, and tests can drive it without a
 * database.
 */
export const compareArchiveSummaries = async ({
  storedSummaries = [], deriveFor, currency = 'IQD',
} = {}) => {
  if (typeof deriveFor !== 'function') throw new Error('archive_summary_derive_required');
  const stored = Array.isArray(storedSummaries) ? storedSummaries : [];
  const rows = [];
  for (const item of stored) {
    const derived = await deriveFor({ year: item?.year, scope: item?.scope ?? null });
    rows.push(compareArchivedYearSummary({ stored: item, derived, currency }));
  }
  const diverged = rows.filter(row => !row.matches);
  return {
    // `ok` means every stored summary was comparable AND agreed. An
    // incomparable year is not a pass: it means we could not check, which is
    // exactly the state that must block switching the display source.
    ok: rows.length > 0 && diverged.length === 0,
    checked: rows.length,
    matched: rows.length - diverged.length,
    rows,
    divergedYears: diverged.map(row => row.year),
  };
};

/**
 * Standing Engineering Rule 6: a comparison result carries yearly income,
 * expense and net totals, so the raw object must never reach a log, an
 * acceptance payload or an evidence document. Counts and years only.
 */
export const summarizeArchiveSummaryParityForDiagnostics = (result = {}) => ({
  ok: !!result.ok,
  checked: Number(result.checked || 0),
  matched: Number(result.matched || 0),
  diverged: Array.isArray(result.divergedYears) ? result.divergedYears.length : 0,
  divergedYears: [...(result.divergedYears || [])],
});
