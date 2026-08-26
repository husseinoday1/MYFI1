# tests — quality gate

Entry points: `run-quality-gate.cjs` (`npm run test:gate`, the acceptance suite)
and `run-financial-core.cjs`. Groups can be run alone: `test:gate:static`,
`test:gate:runtime`, `test:gate:cloud`, `test:gate:android`.

## Local rules

- **A skipped test is not a passing test.** Report passed/failed/skipped counts as
  three numbers. Never silence, skip, or loosen an assertion to get green — fix the
  code or surface the conflict.
- **Repetition rule (standing).** Anything with an epoch, counter, revision, or
  cycle must be exercised at least twice in sequence in the same test. A single
  pass has already hidden a real second-pass defect here.
- **Financial tests assert semantics, not just shape**: balances derived from
  postings, transfers excluded from income/expense, integer minor units, frozen
  historical FX.
- **Cloud and device groups are not run implicitly.** Cloud tests touch a real
  Supabase project; never point them at real user data.
- Diagnostic scripts (`diag-*`) are throwaway investigation aids, not gate
  evidence. Do not cite them as acceptance.

Local green is necessary but not sufficient: acceptance requires a named green CI
run ID for the exact commit.
