# .github — CI and safety gates

CI is the **only** trusted build path for acceptance evidence. Local builds are
for dev iteration and are never accepted as gate evidence.

## Local rules

- **Scope gates use ancestry plus a tracked allowlist**, never a hardcoded expected
  base commit or an inline file list. Use `git merge-base --is-ancestor` and a
  repo-tracked `*-allowed-source.txt` file. Hardcoding a single commit has blocked
  legitimate follow-up work more than once.
- **Strip carriage returns when comparing allowlists.** These lists are authored on
  Windows and compared on Linux runners; a trailing `\r` silently mismatches every
  entry.
- **A push is not done until a named run ID is green.** Open the run and cite its
  ID. A green local gate has coexisted with seven consecutive silent CI failures
  here — local green proves nothing about CI.
- Several existing workflows repeat the brittle single-commit pattern
  (`p19-*`, `p20-*`). Consolidate toward one reusable ancestry+allowlist check when
  touching them; this is cleanup, not urgent on its own.
- Never add a step that prints secrets, and never disable a gate to make a run pass.
