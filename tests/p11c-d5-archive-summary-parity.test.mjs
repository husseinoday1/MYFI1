// P11-C / D5 — deriving archived-year totals, and proving they agree with the
// stored floats before anything switches to them.
//
// §75: historical totals must not change silently. The stored
// cfg.archiveSummaries values are floats written by calcStats at archive time;
// the derived values come from the ledger in integer minor units. They should
// be identical. This proves the comparison would actually notice if they were
// not — including the float-rounding cases that are the whole reason the
// comparison is done in minor units.
import assert from 'node:assert/strict';
import {
  compareArchivedYearSummary,
  compareArchiveSummaries,
  summarizeArchiveSummaryParityForDiagnostics,
} from '../src/lib/archiveSummaryDerivation';

const stored = (overrides = {}) => ({
  year: 2025, scope: 'personal', count: 12,
  income: 1500.5, expense: 400.25, net: 1100.25,
  ...overrides,
});
const derived = (overrides = {}) => ({
  supported: true, year: 2025, scope: 'personal', count: 12,
  income: 1500.5, expense: 400.25, net: 1100.25, currency: 'USD',
  ...overrides,
});

// --- agreement ---------------------------------------------------------------

const agreeing = compareArchivedYearSummary({ stored: stored(), derived: derived() });
assert.equal(agreeing.comparable, true);
assert.equal(agreeing.matches, true, 'identical totals must compare equal');
assert.equal(agreeing.countMatches, true);
assert.deepEqual(agreeing.mismatchedFields, []);

// --- the comparison must actually catch a divergence ------------------------

const driftedIncome = compareArchivedYearSummary({
  stored: stored({ income: 1500.5 }),
  derived: derived({ income: 1500.51 }),
});
assert.equal(driftedIncome.matches, false, 'a one-cent income drift must be reported');
assert.deepEqual(driftedIncome.mismatchedFields, ['income']);

const driftedNet = compareArchivedYearSummary({
  stored: stored({ net: 1100.25 }),
  derived: derived({ net: 1099.25 }),
});
assert.deepEqual(driftedNet.mismatchedFields, ['net']);

// A count disagreement means the two sides are not looking at the same rows,
// which matters even when every amount happens to line up.
const driftedCount = compareArchivedYearSummary({
  stored: stored({ count: 12 }),
  derived: derived({ count: 11 }),
});
assert.equal(driftedCount.matches, false, 'a count disagreement must fail the comparison');
assert.equal(driftedCount.countMatches, false);
assert.deepEqual(driftedCount.mismatchedFields, [], 'amounts agreed; only the count did not');

// --- minor units are the point, not a detail --------------------------------
// Comparing the floats directly would report these as different. In USD (2dp)
// they are the same amount, and reporting a false divergence would block a
// switch that is actually safe — or train someone to ignore the check.

const floatNoise = compareArchivedYearSummary({
  stored: stored({ income: 0.1 + 0.2 }),      // 0.30000000000000004
  derived: derived({ income: 0.3 }),
});
assert.equal(
  floatNoise.matches,
  true,
  'float representation noise must not be reported as a real divergence',
);
assert.notEqual(0.1 + 0.2, 0.3, 'the fixture must actually exercise float noise');

// The currency drives the rounding, so a currency with no minor unit must not
// silently collapse genuinely different amounts.
const iqdIsThreeDecimals = compareArchivedYearSummary({
  stored: stored({ income: 1000.001 }),
  derived: derived({ income: 1000.002, currency: 'IQD' }),
});
assert.equal(iqdIsThreeDecimals.matches, false, 'IQD has 3 decimals; a 0.001 difference is real');

// --- incomparable is not a pass ---------------------------------------------
// The whole purpose is to gate a source switch. "I could not check" must never
// read as "it agrees".

const noDerived = compareArchivedYearSummary({ stored: stored(), derived: null });
assert.equal(noDerived.comparable, false);
assert.equal(noDerived.matches, false, 'a missing derived summary must not count as agreement');
assert.equal(noDerived.reason, 'no_derived_summary');

const unsupported = compareArchivedYearSummary({
  stored: stored(),
  derived: { supported: false, year: 2025, reason: 'missing_base_minor' },
});
assert.equal(unsupported.matches, false);
assert.equal(unsupported.reason, 'missing_base_minor', 'the underlying reason must be carried through');

const run = async () => {
  // --- the workspace-level reduction ------------------------------------------

  const summaries = [stored({ year: 2024 }), stored({ year: 2025 })];

  const allAgree = await compareArchiveSummaries({
    storedSummaries: summaries,
    deriveFor: async ({ year }) => derived({ year }),
    currency: 'USD',
  });
  assert.equal(allAgree.ok, true);
  assert.equal(allAgree.checked, 2);
  assert.deepEqual(allAgree.divergedYears, []);

  const oneDiverges = await compareArchiveSummaries({
    storedSummaries: summaries,
    deriveFor: async ({ year }) => derived({ year, expense: year === 2024 ? 999 : 400.25 }),
    currency: 'USD',
  });
  assert.equal(oneDiverges.ok, false);
  assert.deepEqual(oneDiverges.divergedYears, [2024]);
  assert.equal(oneDiverges.matched, 1);

  // A workspace with nothing archived has nothing to prove, and must not be
  // reported as a verified pass.
  const nothingStored = await compareArchiveSummaries({
    storedSummaries: [],
    deriveFor: async () => derived(),
  });
  assert.equal(nothingStored.ok, false, 'zero checks must not read as a clean comparison');
  assert.equal(nothingStored.checked, 0);

  // The scope of each stored summary must reach the derivation, or a personal and
  // a business summary for the same year would be compared against one another.
  const seenScopes = [];
  await compareArchiveSummaries({
    storedSummaries: [stored({ scope: 'personal' }), stored({ scope: 'business' })],
    deriveFor: async ({ year, scope }) => { seenScopes.push(scope); return derived({ year, scope }); },
    currency: 'USD',
  });
  assert.deepEqual(seenScopes, ['personal', 'business'], 'each summary must be derived within its own scope');

  // A missing derivation function is a programming error, not a silent pass.
  await assert.rejects(
    () => compareArchiveSummaries({ storedSummaries: summaries }),
    /archive_summary_derive_required/,
  );

  // --- Standing Rule 6: the loggable summary carries no amounts ---------------

  const diagnostics = summarizeArchiveSummaryParityForDiagnostics(oneDiverges);
  assert.deepEqual(
    Object.keys(diagnostics).sort(),
    ['checked', 'diverged', 'divergedYears', 'matched', 'ok'],
  );
  assert.deepEqual(diagnostics.divergedYears, [2024]);

  const diagnosticsJson = JSON.stringify(diagnostics);
  for (const amount of ['1500', '400.25', '1100', '999', 'income', 'expense', 'net', 'storedMinor']) {
    assert.equal(
      diagnosticsJson.includes(amount),
      false,
      `Standing Rule 6: the diagnostic summary must not carry ${amount}`,
    );
  }

  // --- no repair path ----------------------------------------------------------
  // D5 and §75: a divergence is a finding, never something this module fixes.

  const guarded = stored();
  const guardedBefore = JSON.stringify(guarded);
  compareArchivedYearSummary({ stored: guarded, derived: derived({ income: 1 }) });
  assert.equal(JSON.stringify(guarded), guardedBefore, 'comparing must not rewrite the stored summary');

  console.log('PASS p11c_d5_archive_summary_parity');

};

run().catch(error => { console.error(error); process.exitCode = 1; });
