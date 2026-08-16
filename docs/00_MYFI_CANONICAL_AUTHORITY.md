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

An active addendum overlays the master plan for its stated release/gate only.
It does not rewrite unrelated future phases.

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
