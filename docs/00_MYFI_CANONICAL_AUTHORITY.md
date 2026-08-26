# MYFI — CANONICAL DOCUMENT AUTHORITY
## Effective: 2026-08-16
## Status: BINDING FOR FUTURE MYFI WORK

This document exists to eliminate duplicate/contradictory MYFI planning files.

# 1. Mandatory authority rule

For future MYFI work, **do not choose a document because its filename says
`final`, `frozen`, `REV2`, `release`, `ready`, or because it was used in an older chat**.

Use the authority order below.

If an older ChatGPT/Codex handoff, memory, summary, plan or status conflicts with
this canonical base, **this canonical base wins**.

# 2. Authority order

## A0 — Actual repository state: implementation reality only
Repository:
`https://github.com/husseinoday1/MYFI1`

Before every new code-change session:
- verify local branch;
- verify HEAD;
- verify `git status`;
- verify package/Expo/native/SQLite state;
- run/record the applicable test baseline.

The repository tells us **what exists now**.
It does not override frozen financial invariants merely because code happens to violate them.

## A1 — Phase order / architecture / execution policy
`01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md`

`01_CORE_AUTHORITY/README.md` (added 2026-08-26) classifies every file in that
folder into engineering authority vs. historical raw Product Owner input —
read it before citing anything in that folder as binding.

**Post-Phase-10 phase structure — APPROVED restructure, 2026-08-26:**
`01_CORE_AUTHORITY/MYFI_MASTER_PLAN_RESTRUCTURE_PROPOSAL_2026-08-26.md` is
now the operative phase map for everything after Phase 10 (Phases 0-10
unchanged, already closed). It supersedes the 2026-08-24 addendum's
undated "parallel workstream" framing for sequencing purposes and gives
explicit phase slots to the Design workstream (18-A/18-B) and five
2026-08-26 product decisions (14-B household sharing, 16-B bank-sync
architecture readiness, 17-B contact-linked debt settlement, 17-C budget
prediction, 17-D Smart Capture fixes, 17-E AI financial assistant, 17-F
SMS-based transaction auto-detection). Read that file for the full
dependency graph before assuming any of Phases 14-18 is unchanged from the
original frozen text.

This is the canonical Frozen Master Plan in this package.

It replaces older master-plan variants in previous handoffs, including:
`MYFI_MASTER_PLAN_FROZEN_WITH_USER_AUDIT_ADDENDUM_REV2_2026-08-15.md`.

Its consolidated release cadence is intentional:
adjacent phases may be packaged together where engineering dependencies permit,
while internal patches, rollback evidence and phase gates remain distinct.

## A2 — Active recovery/addendum overlays
`01_CORE_AUTHORITY/MYFI_R04_1_ACCEPTANCE_RECOVERY_ADDENDUM.md`
and
`04_CURRENT_EVIDENCE/MYFI_CURRENT_ACCEPTANCE_DELTA_2026-08-16.md`
and
`01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`

An active addendum overlays the master plan for its stated release/gate only.
It does not rewrite unrelated future phases.

The 2026-08-24 Product/Security addendum registers two post-Phase-10 planning
workstreams. Its `PRODUCT-*` and `SECURITY-*` labels are work-package labels,
not replacements for Frozen Master Plan phase numbers. It cannot authorize a
feature, schema, Supabase, SecureStore, SQLCipher, backup-format, or production
Android change by itself.

Current rule:
R04 automated evidence is baseline evidence; product acceptance is not closed until
the active recovery gate and required real-device acceptance are satisfied.

## A3 — Permanent domain contracts
In conflicts about invariants, these beat design notes, old roadmap prose and status summaries:

- `MYFI_DATA_OWNERSHIP.md`
- `MYFI_FINANCIAL_CONTRACT.md`
- `MYFI_SYNC_PROTOCOL.md`
- `MYFI_BACKUP_FORMAT.md`
- `MYFI_DATE_TIME_CONTRACT.md`
- `MYFI_MIGRATION_POLICY.md`
- `MYFI_PERFORMANCE_SLO.md`
- `MYFI_RELEASE_SCOPE.md`
- `MYFI_SECURITY_THREAT_MODEL.md`

Key invariant:
Cloud auth/session is not the authority that defines local financial-ledger existence.
Logout is not Delete Local Data.

## A4 — Evidence / acceptance truth
- `01_CORE_AUTHORITY/MYFI_RELEASE_GATE_STATUS_AR.md`
- `01_CORE_AUTHORITY/MYFI_USER_NOTES_RECONCILIATION_CANONICAL_2026-08-16.md`
- `04_CURRENT_EVIDENCE/MYFI_CURRENT_ACCEPTANCE_DELTA_2026-08-16.md`

`04_CURRENT_EVIDENCE/00_EVIDENCE_INDEX_AND_ROLLUP_POLICY.md` (added
2026-08-26) groups the 74+ files in that folder by phase/cluster and states
the archival policy — read it first instead of listing the raw directory.

Evidence precedence:
1. newer real-device evidence;
2. runtime/integration evidence;
3. automated contract/unit evidence;
4. static source presence.

A static test cannot overrule a later device failure.

Baselines/SHAs written inside evidence documents are historical checkpoints.
Always re-read Git for the current operational SHA.

## A5 — Financial engine technical design
- `FINANCIAL_MODEL_2_0_AR.md`
- `SQLITE_FINANCIAL_CORE_V7_DESIGN_AR.md`
- `DATABASE_ARCHITECTURE.md`
- `BACKFILL_RUNBOOK.md`

If a technical design statement conflicts with A1–A4, A1–A4 wins.

`DATABASE_ARCHITECTURE.md` describes transitional/cloud-normalized architecture;
it is not permission to redefine the local-ledger ownership contract.

## A6 — Product / UX / support specifications
- `MYFI_UI_REDESIGN_SPEC_AR.md`
- `USER_GUIDE_AND_SUPPORT_PLAN_AR.md`
- `SMART_CAPTURE.md`
- `CODE_QUALITY_STANDARDS_AR.md`
- `MYFI_MARKETING_PLAN_AR.md`

These guide their own domains but cannot weaken financial, migration, security or acceptance gates.

**`docs/design/` tier placement (added 2026-08-26, closes a gap the design-system
consolidation left open):** the 14-file design canon under `docs/design/`
(navigation map: `docs/design/00_README_DESIGN_SOURCE_OF_TRUTH.md`) sits at
**A6** — it governs product/UX/visual-identity decisions and is authoritative
for *that* domain, but it cannot override A1 (Frozen Master Plan phase order),
A2 (active addenda), or A3 (permanent financial/security/data contracts). Its
own internal "CANONICAL — highest authority" wording in
`01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` means highest authority *within
the design domain*, not above A0-A5. Where a design-canon file conflicts with
`MYFI_FINANCIAL_CONTRACT.md`, `MYFI_SECURITY_THREAT_MODEL.md`, or the Frozen
Master Plan's phase sequencing, A3/A1 win and the conflict must be escalated
to Planning & Audit rather than resolved by whichever session is doing the
implementation work.

`CODE_QUALITY_STANDARDS_AR.md` contains older command examples.
When commands differ, use the scripts actually present in the current `package.json`
and the master/release gate, normally including the current full quality gate and
Android verification before handoff.

## A7 — Release / store support
- `ANDROID_RELEASE_READINESS_AR.md`
- `PLAY_CONSOLE_SUBMISSION_AR.md`

These are release support references, not proof that the product is ready.
Time-sensitive Google Play requirements must be reverified from official sources
at the time of submission.

# 3. Superseded / historical documents — NO execution authority

The following are intentionally excluded from the canonical working set:

- `MYFI_MASTER_PLAN_FROZEN_WITH_USER_AUDIT_ADDENDUM_REV2_2026-08-15.md`
  - superseded by the newly supplied `MYFI_MASTER_PLAN_FROZEN.md` + active addenda.
- `MYFI_USER_NOTES_RECONCILIATION_REV2_2026-08-15.md`
  - superseded by the newly supplied reconciliation + 2026-08-16 overlay.
- old generated `MYFI_CODEX_TAKEOVER_HANDOFF_2026-08-16.md`
  - superseded by this canonical authority; it encoded an older phase interpretation.
- old `CODEX_START_HERE.txt`
  - superseded.
- `MYFI_LOCAL_SNAPSHOT_INFO.txt`
  - historical local snapshot only.
- `BASELINE_FINANCIAL_CORE_CUTOVER_2026-08-14_AR.md`
  - historical baseline evidence.
- `FINANCIAL_CORE_V7_RELEASE_GATE_2026-08-14_AR.md`
  - historical release-gate snapshot; not current acceptance status.
- `GIT_CHANGESET_REVIEW_AR.md`
  - historical 2026-08-09 change-package review.
- `FUTURE_ROADMAP_AND_RELEASE_PLAN_AR.md`
  - superseded by the Frozen Master Plan.
- `RELEASE_READINESS_AR.md`
  - high-level readiness summary; cannot close formal gates and contains broad “completed” claims.
- `MYFI_IMPLEMENTATION_STATUS.md`
  - old implementation summary; current repo + formal gate status supersede it.
- `SYNC_RECOVERY_SCENARIOS_AR.md`
  - useful historical scenario inventory but contains old Guest/logout assumptions.
    It must not override the current Data Ownership + Sync Protocol + R04/R04.1 contract.
- `Pasted text(2).txt`
  - transient test/log transcript, not architecture or status authority.

Historical files may be consulted only for provenance or regression archaeology.

# 4. Conflict-resolution rules

When two files disagree:

1. **What code currently does?** → inspect current Git HEAD.
2. **What should be built / in what order?** → Frozen Master Plan + active addendum.
3. **What financial behavior is legal?** → domain contracts.
4. **What has actually passed?** → newest evidence; device failure beats static PASS.
5. **What UI should look like?** → UX spec, unless acceptance evidence proves it unusable.
6. **What cloud/session behavior is allowed?** → Data Ownership + Sync Protocol.
7. **What Google Play currently requires?** → reverify official current policy; dated docs are drafts.

# 5. Non-negotiable development rules retained

- No direct work on `main`.
- No `git reset --hard` as an automatic recovery.
- No `git add .` for financial patches.
- No casual `npm install` / forced dependency upgrades.
- No deletion/reset of user financial SQLite or SecureStore to make tests pass.
- No app uninstall during existing-user financial acceptance unless a specifically isolated test requires it.
- No silent financial repair or invented FX.
- No financial history reinterpretation.
- No logout fix by cloning the same ledger into an unrelated Guest ledger.
- No phase acceptance from compilation/static-string tests alone.
- Keep patches small and auditable even when releases are consolidated.
- One consolidated device acceptance session where the active release plan requires it.

# 6. Required start-of-session check

Before editing MYFI, the assistant/Codex must state:

```text
Verified branch:
Verified HEAD:
Working tree:
Expo SDK:
React Native:
SQLite schema:
Current release/gate:
Active addendum:
Current device failures:
Financial-data impact of proposed work:
Schema/migration impact:
Proposed patch ID:
```

# 7. Required end-of-session status

```text
Current commit:
Current branch:
Current release/gate:
Applied patches:
Passed:
Failed:
Blocked:
Next exact task:
Financial data changed:
SQLite/schema changed:
Migration impact:
Device acceptance status:
```

# 8. Persistence rule

This file is the canonical document-selection rule.
Do not resurrect a superseded file merely because an older chat summary or memory calls it
“Frozen”, “REV2”, “Final”, “Source of Truth” or “approved”.

Only a newer explicit user-approved canonical authority file may supersede this one.

<!-- P18_010_AUTHORITY_REGISTRATION -->
## Authority Registration — 2026-08-17

The following documents are authoritative additions to the frozen plan:

- `docs/01_CORE_AUTHORITY/MYFI_MULTI_CURRENCY_FINANCIAL_POLICY_ADDENDUM.md` — canonical policy for multi-currency financial calculation, historical FX, current valuation, transfers, budgets, debts/goals, Base Currency, and future Display Currency.
- `docs/04_CURRENT_EVIDENCE/MYFI_R04_1_DEVICE_ACCEPTANCE_CLOSURE_2026-08-17.md` — closure evidence for R04.1 real-device acceptance.

R04.1 is CLOSED after P18-009 automated acceptance and the 2026-08-17 real-device PASS. The frozen master plan remains frozen; the multi-currency policy is an addendum and MUST be applied by subsequent relevant phases.


<!-- P19_011_AUTHORITY_REGISTRATION -->
## P19 Sync V2 Authority Registration — 2026-08-17

The Frozen Master Plan remains frozen and is not rewritten by P19.

Active P19 overlay:
- `docs/01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md`

Current P19 execution evidence:
- `docs/04_CURRENT_EVIDENCE/MYFI_P19_001_011_SYNC_V2_EXECUTION_EVIDENCE_2026-08-17.md`

Permanent sync invariants introduced by this overlay are also recorded in:
- `docs/MYFI_SYNC_PROTOCOL.md`

The addendum/evidence cannot by themselves close Phase 9; newer real-device
evidence retains higher precedence than automated/static evidence.

<!-- PLANNING_AUDIT_FRESHNESS_RULE_2026-08-19 -->
## Evidence Freshness Rule — 2026-08-19

Added by the MYFI Planning & Audit process after a 2026-08-19 incident: a
prepared handoff document named a "verified" branch/HEAD that was already 29
commits behind the true GitHub tip, because multiple environments (local
clones, Codespaces, separate patch worktrees) were pushing to this repository
in parallel without any of them re-checking the others.

Binding rule going forward:

1. Every new file under `docs/04_CURRENT_EVIDENCE/` and every new/updated
   handoff or status document MUST state the exact branch name and full
   commit SHA it was verified against, and the date/time of that verification.
2. Before publishing such a document, the author MUST run
   `git fetch --all && git branch -r --sort=-committerdate` (or equivalent)
   and confirm no branch with newer commits already exists. If one does,
   either reconcile against it first or explicitly note it as an unreconciled
   newer branch.
3. A reader MUST treat any status/evidence document that does not state its
   verification branch+SHA+date as unverified, not as current truth.
4. This rule does not create a new authority level; it is a freshness
   precondition on A0 (actual repository state) and A4 (evidence/acceptance
   truth) as already defined above.

Consolidated current Phase 9 status:
`docs/04_CURRENT_EVIDENCE/MYFI_PHASE9_STATUS_CONSOLIDATED_2026-08-19.md`
supersedes the older `MYFI_P18_013_PHASE9_MINIMUM_ACCEPTANCE_MATRIX` as the
first document to read for "what is actually left in Phase 9" — the P18-013
matrix remains historically useful but is not reconciled against P19/P20
evidence on its own.

<!-- P19_012_013_AUTHORITY_REGISTRATION -->
## P19-012/P19-013 Authority Registration — 2026-08-18

The Frozen Master Plan remains frozen.

Active P19 overlay remains:
- `docs/01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md`, now including the P19-012 empty-shell recovery and P19-013 atomic V2 remote-apply rules.

Current P19-013 execution evidence:
- `docs/04_CURRENT_EVIDENCE/MYFI_P19_013_ATOMIC_V2_REMOTE_APPLY_2026-08-18.md`.

Permanent recovery/sync invariants are recorded in:
- `docs/MYFI_SYNC_PROTOCOL.md`.

P19-013 automated evidence cannot close real-device acceptance. Production V2 use remains blocked until the reviewed APK is installed and the device recovery/sync acceptance is executed without conflict, cursor regression, financial-value drift, or fallback.

<!-- STANDING_ENGINEERING_RULES_2026-08-20 -->
## Standing Engineering Rules — 2026-08-20

Adopted after the P20-G01 gate produced five back-to-back, mostly avoidable
problems in one day (a device-only sync bug, a second bug in that fix caught
only after it was already pushed once, a local-build tooling gap that
produced a false "credential rotation" diagnosis, and a hand-maintained CI
scope-gate that blocked its own fix). Binding on every session and every
future phase, not just Phase 9:

1. **CI is the only build path trusted for acceptance evidence.** A local
   `gradlew`/manual build may be used for quick dev iteration, but a build
   used to accept any gate (device test, release candidate, etc.) must come
   from CI (GitHub Actions). Local builds have already produced at least one
   false diagnosis by silently failing to bake in required env vars.
2. **Stateful/counter logic (epoch, revision, cycle, retry count, etc.) must
   have a test that exercises the action at least twice in sequence**, not
   only the first pass. A prior fix here passed 81/81 tests while still
   containing a bug that only appeared on the second restore-epoch advance.
3. **`/code-review` must run and be clean before every push, with no
   exceptions** — never as a check applied after the change is already live.
4. **CI scope/safety gates must not hardcode a single exact base commit and
   file list per patch.** Use an ancestry check
   (`git merge-base --is-ancestor <base> HEAD`) plus a repo-tracked,
   easily-updatable expected-files list, not a brittle single-commit
   exact-match — the latter breaks the moment legitimate follow-up commits
   land, which is exactly what happened to the P20-G01 workflow on
   2026-08-20. Several other workflow files share this same brittle pattern
   (`p19-014a-*`, `p19-final-*`, `p20-final-*`) — worth fixing when next
   touched, not urgent on its own.

   **Refinement (2026-08-20, after the P20-G01 gate broke CI a second time
   the same day):** keep the expected-files list in its own repo-tracked
   file (e.g. `.github/<workflow>-allowed-source.txt`), not inline in the
   YAML — reviewed like code, one place to update per legitimate change.
   Strip `\r` before comparing: the repo is edited on Windows, CI runs on
   Linux.

5. **A change is not "done" on green local tests/review alone — it needs a
   confirmed green CI run, by run ID, checked after the push.** Discovered
   2026-08-20: a scope-gate the same session had written earlier that day
   silently failed 7 consecutive CI runs (a different workflow, tightened by
   an earlier fix, now rejecting the session's own legitimate files) while
   local `test:gate` stayed green throughout — nobody had actually opened CI
   to look. Passing local tests plus a clean `/code-review` is necessary but
   not sufficient; always confirm the actual CI run went green before
   reporting a change complete.

6. **Any diagnostic field added to a payload that gets logged, persisted, or
   copied across sessions/evidence docs must be checked for real financial
   content first.** If it can carry amounts, balances, or monthly totals,
   summarize it (e.g. `{type, keys}` shape only) instead of logging the raw
   value. Discovered 2026-08-20: a shadow-migration parity diagnostic almost
   logged `walletBalances`/`currencyBalances`/`monthlyTotals` verbatim for a
   real account into a device evidence log that travels between sessions —
   caught by `/code-review` before the push, not after. Diagnostics are
   themselves a data-safety surface, not just a debugging convenience.

   **Refinement (2026-08-20):** this leaked a second time the same day (a
   coordinator/bootstrap result object passed whole into a failure payload,
   carrying `rows`). `/code-review` caught it both times, but relying on
   review alone for a repeating pattern is thin. Add an automated contract
   test that forbids passing a raw coordinator/bootstrap/activation result
   object into any diagnostic payload under `src/dev/` — summarize
   (ids/counts) before it's ever eligible to be logged.

7. **Before any device measurement or diagnosis, verify the installed APK's
   build commit actually matches the branch HEAD you think you're testing.**
   Discovered 2026-08-21: an hour was spent diagnosing a "still slow"
   startup bug that had already been fixed 4 commits earlier — nobody
   checked whether the phone's installed build matched HEAD before
   measuring. Measure the *installed* build, not the pulled branch.

**Explicitly declined (2026-08-20):** a separate staging Supabase project
isolated from the "Production"-labeled one. Do not re-propose this unless a
concrete incident makes the case again.

<!-- PRODUCT_SECURITY_ADDENDUM_AUTHORITY_REGISTRATION_2026_08_24 -->
## Product Design and Security/Data-Protection Authority Registration — 2026-08-24

The user explicitly approved integrating the product-design and
security/data-protection direction into the project plan and document
hierarchy, without conflicting with the existing financial and Phase-10 work.

Registered planning overlay:

- `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`

The Frozen Master Plan remains frozen and retains its engineering phase order.
The new overlay makes Competitive Design Translation and Security & Data
Protection first-class parallel workstreams after Phase 10. Phase 10 is now
closed by:

- `docs/04_CURRENT_EVIDENCE/MYFI_PHASE10_LIVE_PRODUCTION_RESTORE_CLOSURE_2026-08-24.md`

The closure evidence was recorded at
`d2ed3ae03c137d818040dfe77c665c516b8440b7`, after accepting the CI-built APK
from `ed436efab2cdee118fb21113c12026012cba14c1` on a real Android production
restore path.

The next authorized work is planning reconciliation and approval of
`PRODUCT-P0-A` and `SECURITY-S0`. No Product or security implementation is
authorized until its own scoped gate and dependencies are approved.

<!-- PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_REGISTRATION_2026_08_25 -->
## Product Design Restructure Blueprint Registration — 2026-08-25

The user supplied a new Product Owner design blueprint (visual identity,
Design System, full-product UI/navigation audit). It is registered as an
active planning overlay, alongside — not replacing — the 2026-08-24
Product/Security addendum:

- `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`

Planning & Audit reconciliation against the live repo (confirmed navigation
conflict, current screen/component inventory, working-tree state) is recorded in:

- `docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`

This blueprint authorizes a **design/product/architecture documentation
audit only** — it creates new files under `docs/design/` and explicitly does
not authorize any UI migration, code change, or financial/schema/backup/sync
change. The Frozen Master Plan remains frozen; this overlay does not
renumber or replace its phases. Handoff for execution goes to the
Implementation session per the standing session-structure rule.
