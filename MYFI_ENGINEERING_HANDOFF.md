# MYFI — Engineering Handoff

Prepared: 2026-08-19 (last updated 2026-08-24, Product/Security plan integration)
Repository: `https://github.com/husseinoday1/MYFI1`

## 0. What this document is — and is not

This is **context, not truth**. It exists to onboard whichever AI engineering
tool is currently acting as MYFI's primary engineer quickly, without
re-deriving everything from scratch every session. It is not a new authority
level and it does not sit inside the canonical authority order.

If anything in this file conflicts with the repository, `docs/00_MYFI_CANONICAL_AUTHORITY.md`,
the Frozen Master Plan, a domain contract, or newer evidence: **stop, name the
conflict, and resolve it using the canonical authority order in section 2.**
This file will go stale — the repo will not. (It already has once: see §3.)

---

## 1. Project mission

MYFI is a local-first personal-finance Android/Expo app, in Arabic, RTL-first.

- **SQLite is the sole owner of financial operational truth** — ledger identity,
  wallets, transactions, postings, historical FX, debts/receivables, goals,
  commitments, budgets, recurring rules, archive metadata, reconciliation,
  mutation outbox, sync inbox/cursors, and financial schema version.
- **Supabase is transport, auth, and replication only.** It is never the
  authority for whether local financial data exists.
- Everything else (theme/language/country prefs, Zustand UI/query cache,
  SecureStore auth secrets) is explicitly non-financial ownership. See
  `docs/MYFI_DATA_OWNERSHIP.md`.

---

## 2. Source of truth — authority order

Defined canonically in [`docs/00_MYFI_CANONICAL_AUTHORITY.md`](docs/00_MYFI_CANONICAL_AUTHORITY.md).
Do not pick a document because its filename says "final"/"frozen"/"REV2" — use this order:

1. **A0 — Actual Git repository state.** Verify branch, HEAD, `git status`,
   schema state, before every session. The repo defines what exists now; it
   does not override frozen financial invariants just because code violates them.
2. **A1 — Frozen Master Plan.** `docs/01_CORE_AUTHORITY/MYFI_MASTER_PLAN_FROZEN.md`
   — phase order, architecture, execution policy.
3. **A2 — Active recovery/addendum overlays** for the current release only
   (currently the R04.1 recovery addendum, now closed, and the P19 Sync V2
   activation addendum, active and extended by the P19-013 atomic remote-apply
   contract), plus the user-approved post-Phase-10 Product Design and
   Security/Data-Protection planning overlay at
   `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`.
4. **A3 — Permanent domain contracts** (financial, data ownership, sync,
   backup, date/time, migration, performance, release scope, security). These
   beat design notes and status prose.
5. **A4 — Evidence/acceptance truth**, newest real-device evidence first. A
   static PASS never overrules a later device failure.
6. **A5 — Technical design docs** (financial model, SQLite V7/V8 design,
   database architecture). Loses to A1–A4 on conflict.
7. **A6 — Product/UX/support specs.** Cannot weaken financial/migration/
   security/acceptance gates.
8. **A7 — Release/store support docs.** Reverify time-sensitive Play Store
   policy from official sources at submission time, not from a dated doc.

Explicitly **superseded / no execution authority**: everything listed under
`00_MYFI_CANONICAL_AUTHORITY.md` §3 (old REV2 master plan, old reconciliation
notes, old takeover handoffs, `MYFI_IMPLEMENTATION_STATUS.md`,
`FUTURE_ROADMAP_AND_RELEASE_PLAN_AR.md`, `RELEASE_READINESS_AR.md`, etc.) —
consult only for historical archaeology, never as instruction.

`MYFI_PRODUCT_BLUEPRINT.md` at the repo root is an **early, superseded
concept doc** (AsyncStorage as source of truth, a different 6-phase roadmap
than the frozen plan). Treat it as historical product-vision flavor only,
never as current architecture or roadmap.

---

## 3. Current verified state (latest overlay 2026-08-24 — RE-VERIFY, this drifts fast)

### Latest verified overlay — 2026-08-24

This block supersedes older operational status prose later in this section.
The older text remains only as incident and design history.

```text
Verified branch: impl/p10-014a-local-strategy-b-device-gate-2026-08-22
Verified HEAD: d2ed3ae03c137d818040dfe77c665c516b8440b7
Remote freshness: git fetch --all --prune completed 2026-08-24;
                  this branch is the newest remote branch by commit time
SQLite schema: V8
Financial ledger model: V7
Current gate: Phase 10 CLOSED; post-Phase-10 Product/Security planning reconciliation is next
```

Current Phase-10 facts:

- Production canonical restore wiring is committed at `5209d17`.
- The schema-version bind failure was fixed at `c8cc663`.
- The empty-shell restore conflict was fixed at `ed436ef` with a narrow
  restore-only quarantine for the exact safe V3/V1 pair; it does not authorize
  broad conflict repair.
- Accepted GitHub Actions normal build run: `32718230827`.
- Accepted artifact: `MYFI-P10-014A-normal-release`, app `com.myfi.app`,
  version `1.0.0` (`versionCode=2`), commit `ed436ef`.
- APK SHA-256:
  `fcd44ff69440dd63469097912636d72112299ac65289ef05de6687f2944435f0`.
- Install mode was `adb install -r`; app data and sign-in state were preserved.
- Automated gate before the live run: `120 passed, 0 failed, 11 skipped`.
- The user completed production restore successfully on a real Android device.
- Runtime/Supabase evidence: `P19_FINAL_V2_ACTIVE`, restore epoch `2 -> 3`,
  bootstrap finalized, expected rows `22`, actual rows `22`, protocol `2/2`.
- Closure evidence:
  `docs/04_CURRENT_EVIDENCE/MYFI_PHASE10_LIVE_PRODUCTION_RESTORE_CLOSURE_2026-08-24.md`.

Phase 10 is **closed**. Do not rebuild, reinstall, or rerun the restore merely
to repeat this evidence. Any later backup/restore change is a new scoped
package with its own tests and acceptance proof.

Next exact planning task:

1. reconcile the new Product Design and Security/Data Protection Blueprint;
2. approve `PRODUCT-P0-A` and `SECURITY-S0` as analysis/current-state outputs;
3. select one small first implementation package only after that approval;
4. keep all Product/Security work subordinate to the existing financial,
   sync, restore, migration, deletion, and security contracts.

### Historical 2026-08-21 snapshot

⚠️ **Re-run `git fetch origin && git log origin/impl/p20-g01-acceptance-apk-2026-08-19 --oneline -10` before trusting anything below.** This project has
multiple simultaneous contributors pushing to the same branch (a Claude
"Implementation" session chain, and OpenAI Codex as of 2026-08-21) — treat
any status snapshot, including this one, as provisional.

```text
Branch: impl/p20-g01-acceptance-apk-2026-08-19 (single active branch — the
        earlier r05-p19/r05-p20 branch confusion from 2026-08-19 is over,
        everything lives on this one branch now)
SQLite schema: V8

Phase 9 (Account Lifecycle Gate): CLOSED — 2026-08-20/21. 9/10 items fully
  confirmed on real device; item 10 was accepted as data-safety-confirmed
  with V2-sync-health verification deferred (root Supabase resource
  constraint, since resolved). Do not describe this as "10/10" — the
  evidence file is explicit that it's a conditional accept, and that
  wording distinction has already had to be corrected once.

Phase 10 (Atomic Backup/Restore Engine): OPEN, in active progress.
  Architecture decided and real-device-validated: canonical SQLite read
  model -> semantic hash proof -> strict decoder -> isolated staging ->
  ATOMIC promotion (Strategy B: staging happens OUTSIDE the maintenance
  lock, only the final promotion + epoch handshake are locked — proven
  ~25x faster than locking the whole staging phase at 100k rows; the
  tradeoff this buys is a hard requirement that promotion detect any live
  ledger write that happened during unlocked staging and refuse rather
  than silently overwrite it — this is enforced by an atomic per-write
  "ledger generation" counter, including cold-archive writes). P10-004
  through P10-012 done and merged. P10-013 (Undo via the same restore
  engine, using a new locale-independent V3 semantic hash since V2's
  ordering was found to be locale-dependent) is in progress in reviewed
  slices. P10-014 (final device performance/fault-injection proof) not
  started. Full design: docs/04_CURRENT_EVIDENCE/MYFI_PHASE10_BACKUP_RESTORE_RESEARCH_2026-08-20.md
  and Codex's own execution-audit doc in the same folder (search
  "MYFI_PHASE10" and "MYFI_P10_" for the full evidence trail — there are
  many dated files, each one commit's worth of independently-reviewed
  work). A Supabase migration for P10-012's cloud RPC exists in the repo
  but is DELIBERATELY NOT APPLIED to the live database — it's dormant,
  unwired code; applying it needs its own explicit user-approved
  preflight/review/apply/postcheck pass, not a side effect of a code push.

All 5 real bugs the user found in daily use (broken restore confirmation,
UI flash + nav reset, blocking sync screen, decorative +/- buttons, slow
cold start) are FIXED and confirmed on device. The cold-start fix in
particular: measure the *installed APK's actual commit*, not the branch tip,
before trusting a device timing number — a stale-build measurement wasted
real time here.

Team structure as of 2026-08-21 (see docs/00_MYFI_CANONICAL_AUTHORITY.md
"Standing Engineering Rules" for the full rule list this implies):
Codex is the day-to-day executor on Phase 10; a Claude "Implementation"
session chain (numbered: Implementation, Implementation 2, ...) is the
primary/backup executor and — critically — the mandatory independent
reviewer for everything Codex writes before it may be pushed. This
review-before-push gate has been breached by accident twice; treat it as
non-negotiable going forward. Whichever AI is acting as engineer here
should expect this same review relationship to apply to its own commits.

**Known regression pattern to watch for:** P18-016 documented that after V7
cutover, the legacy `user_data` snapshot merge must never again be used as a
financial pull path (absence-as-deletion caused real tombstones — see §8).
Any future touch to sync/reconciliation code must re-verify this guard is
still in effect.

---

## 4. Architecture

```text
UI (React Native / Expo, RTL Arabic-first)
  → Command/Query layer
    → SQLite V8 local financial core (financialLedgerV7Repository.js et al.)
        entities / postings / historical FX / outbox — one atomic transaction
    → ledger_outbox_v2 / ledger_inbox_v2 / financial_mutations_v1(+v2)
      → Supabase (transport, auth, RLS-protected compatibility + V2 schema)
```

- **Local write boundary (non-negotiable):**
  `BEGIN → entity/header → postings → links → revision → outbox → COMMIT → UI cache → success`.
  Outbox mutation must be in the *same* SQLite transaction as the financial write.
- **Money:** integer minor units internally; decimals are display/input only.
- **Supabase compatibility layer:** `public.user_data` / `sync_user_data_v2` —
  intentionally still exists as a **compatibility mirror output only**, not a
  financial pull source, post-cutover (see §8 incident).
- **Cloud normalized schema** (`workspace_id`-scoped tables, RLS, `numeric(20,4)`)
  described in `docs/DATABASE_ARCHITECTURE.md` is a transitional/compatibility
  design, not the local storage contract — it does not redefine local-ledger
  ownership.
- Full technical design: `docs/SQLITE_FINANCIAL_CORE_V7_DESIGN_AR.md`,
  `docs/FINANCIAL_MODEL_2_0_AR.md`, `docs/DATABASE_ARCHITECTURE.md`,
  `docs/BACKFILL_RUNBOOK.md`.

---

## 5. Financial contracts — non-negotiable

From `docs/MYFI_FINANCIAL_CONTRACT.md` and the multi-currency policy addendum:

1. Financial history is never reinterpreted for country/login/guest-merge/
   archive/restore/sync/timezone/upgrade reasons.
2. Local-first: durable SQLite commit precedes UI success; cloud is later.
3. Every balance must be derivable from authoritative postings.
4. No silent repair. A financial mismatch is detected, classified, and stops
   the risky operation — it is never quietly fixed.
5. Financial IDs are immutable; edits raise a revision, never
   delete/recreate under a new unrelated ID.
6. Financial delete defaults to void/tombstone — never untracked disappearance.
7. Historical FX snapshot is immutable per transaction; current valuation
   rate is a separate concept. **Changing today's rate must never rewrite
   any previously saved historical income/expense/net/budget value.**
8. A transfer = source posting + destination posting + optional fee +
   FX snapshot on currency mismatch. It is never counted as income/expense.
9. Base/Home Currency is a ledger identity property, locked once history
   exists; changing it later needs an explicit reviewed migration
   (backup + preview + verification + recovery), never a plain setting toggle.
10. Unknown wallet references in restore input are blocking errors — never
    auto-repaired to a default wallet.
11. Feature visibility (hiding a module) never deletes entities, transactions,
    historical totals, backups, or evidence — navigation only.

Also binding: `docs/MYFI_DATA_OWNERSHIP.md`, `docs/MYFI_SYNC_PROTOCOL.md`,
`docs/MYFI_BACKUP_FORMAT.md`, `docs/MYFI_DATE_TIME_CONTRACT.md`,
`docs/MYFI_MIGRATION_POLICY.md`, `docs/MYFI_PERFORMANCE_SLO.md`,
`docs/MYFI_RELEASE_SCOPE.md`, `docs/MYFI_SECURITY_THREAT_MODEL.md`. Read the
relevant one before touching that area — don't rely on this summary alone for
implementation decisions.

---

## 6. Data ownership & account lifecycle

- `ledger_id` is independent from `supabase_user_id`. **Never** `ledger_id = supabase_user_id`.
  A ledger has an *optional* cloud-account link, not an identity equivalence.
- **Logout ≠ Delete Local Data ≠ Delete Account.** Three independent operations:
  - Logout: ends cloud session only; local ledger stays active and accessible.
  - Delete Account: local ledger is secured/unlinked *before* cloud identity
    deletion; user can continue local-only afterward.
  - Delete Local Data: separate, explicit, warned, re-authed; never triggered
    implicitly by the other two.
- Account switch is an explicit namespace transition, never an implicit
  Guest-ledger remount.
- Full scenario matrix (A-H) is in Phase 9 of the Frozen Master Plan and is
  now historical closure context plus a standing lifecycle-safety contract;
  see §3 and §9.

---

## 7. Sync model

- Post-V7-cutover rule (hard-learned, see §8): **financial remote changes are
  accepted only through explicit `sync_financial_mutations_v1`(/v2) mutations
  or tombstones.** Mutation sync failure never falls back to a financial
  snapshot pull. `user_data` snapshot is compatibility-mirror output only.
- Outbox lifecycle: `pending → in_flight → acknowledged | failed_retryable | failed_permanent`,
  backoff+jitter retry, not infinite fixed retry.
- Inbox is idempotent on repeated delivery via mutation id/server sequence.
- No automatic field-level merge on monetary conflict.
- Sync worker pauses during restore / schema migration / canonical cutover.
- **P19 Sync V2 activation is a verified cutover, not a successful upload.**
  Required sequence: local authoritative SQLite → staged bootstrap → finalize
  in Supabase → cloud read-back → per-row SHA-256 verification → ordered
  manifest SHA-256 verification → V2 shadow drain → quiescent validation pass
  (`pending=0, uploaded=0, downloaded=0, hasMore=false`) → atomic activation
  evidence (`ledger_id`, `restore_epoch`, `bootstrap_id`, `manifest_hash`,
  timestamps) + `activated_at`.
  - Before durable `activated_at`: a failed verification may leave V1 operational.
  - After durable `activated_at`: **automatic fallback to V1 is forbidden** —
    a post-activation V2 failure is fail-closed and handled as a protocol
    recovery event, not silently downgraded.
- **P19-013 hardening (2026-08-18):** removed a temporary reuse of the V7
  remote-apply engine for V2. Production apply now stays independent from
  shadow validation (`allowProductionApply=false` by default), requires exact
  V3-outbox-equality to recognize a local echo, requires local revision ==
  remote `base_revision` for anything else, and commits financial rows +
  inbox state + cursor in one SQLite transaction per command.
- P19-012 narrow rule: if a post-cutover local ledger is a provably empty
  shell for an authenticated user with pre-existing pre-V2 cloud history, the
  server returns the exact legacy snapshot + SHA-256, client verifies the hash
  before parsing, restores via the staged operational-cutover path, and then
  **must continue toward V2** — it must not fall back to V1 on the same
  attempt. A finalized V2 cloud ledger is never reinterpreted through
  `user_data`; that's a separate `financial_v2_bootstrap_import_required` path.
- **P20-G01 (2026-08-19, later closed):** before Phase 9 closed, the
  destructive restore-epoch handshake (`advance_financial_restore_epoch_v2`
  CAS → local epoch CAS commit → new-epoch shadow pull → verify zero
  old-epoch replay → verify server restore-event evidence → verify the
  financial fingerprint is unchanged) must pass on a real device against a
  genuinely disposable, financially-empty test account — never the real one.
  The gate itself refuses to run if it observes any real financial state
  (any transaction/debt/goal/commitment/second wallet/etc.) on the active
  account, and separately proves `resetAll`/`importBackup` still fail closed.

Full contract: `docs/MYFI_SYNC_PROTOCOL.md`,
`docs/01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md`,
`docs/04_CURRENT_EVIDENCE/MYFI_P20_G01_PHASE9_RESTORE_EPOCH_GATE_2026-08-19.md`.

---

## 8. Known incidents (why we're strict)

### Phase 9 legacy-snapshot-omission incident (CLOSED 2026-08-17, P18-021)

After V7 operational cutover, `syncCloud` still ran the **legacy `user_data`
three-way-merge as a financial pull path**. That merge interprets record
*absence* as deletion. `reconcileFinancialWorkspaceV7` then treated records
missing from the desired snapshot as `missingIds` and called
`voidFinancialTransactionsV7` — turning a stale/incomplete cloud snapshot into
**real local V7 void/delete mutations** across multiple account namespaces.

Root cause fix (P18-016): post-cutover, financial remote changes are accepted
only through explicit mutation/tombstone protocol; snapshot pull for finance
is permanently forbidden (`financial_v7_snapshot_pull_forbidden`) and
`user_data` becomes compatibility-mirror output only.

Recovery (P18-017 → P18-020): a separate controlled operation, scoped only to
the proven accidental-deletion cluster (32 recovery upserts, real-device
verified), explicitly **not** touching earlier deliberate user deletions.

**Lesson:** component-level PASS is not sufficient. Cross-layer sequences
(cutover + sync + reconciliation together) must be tested explicitly, and any
code path that can convert "record not present in a snapshot" into a delete
is a standing financial-safety risk.

### P19-011 activation ordering gap → P19-012 (evidence 2026-08-17)

A real account was signed out, local data cleared on an older build, then
signed back in. UI showed zero balance. Cloud data was intact (80
transactions, 7 wallets, etc. — verified directly in Supabase). Root cause:
P19-011 could attempt V2 bootstrap/activation on a truly empty local ledger
*before* recovering existing pre-V2 cloud history, effectively registering an
empty shell instead of recovering. Fixed by inserting the P19-012 narrow
verified-recovery gate before P19-011 activation (§7).

**Lesson:** ordering between "is this ledger really empty" and "should we
bootstrap fresh" matters as much as the mutation logic itself.

### Signed avatar URL causing spurious sync revisions (found/fixed 2026-08-19, P20 FINAL)

Workspace sync revisions 7–12 for a test profile rotated on every check even
though nothing the user controlled had changed. Root cause: a Supabase
signed/rotating avatar-image URL (`cfg.avatarUri`) was being included in the
canonical workspace payload used for equality/three-way-merge, so its
rotation alone looked like a real edit and bumped the revision. Fixed by
treating `avatarUri` as local/derived display state (excluded from equality
and from the compatibility snapshot's `p_cfg`), keeping only the stable
`avatarPath` as canonical/syncable.

**Lesson:** not every corruption risk is a delete — a field that "looks like"
config but is actually derived/ephemeral (signed URLs, computed caches) can
silently pollute sync equality checks and cause spurious churn. Worth
checking for elsewhere before trusting revision numbers as a change signal.

---

## 9. Phase roadmap (0–21, Frozen Master Plan)

⚠️ **Naming trap:** commit-message patch IDs like `P18-xxx`, `P19-xxx`,
`P20-xxx` are **sequential session/patch counters**, not Phase numbers. The
P19/P20 patch chain implements Sync V2 hardening for **Phase 9** (Account
Lifecycle Gate) and **Phase 14** (Sync Hardening) — it has nothing to do with
"Phase 19"/"Phase 20" below (Codebase Final Cleanup / Release Candidate).
Always check the Frozen Master Plan's own phase number, not the patch prefix.

| # | Phase |
|---|---|
| 0 | Governance, Evidence, Contracts & Scope |
| 1 | Android Native + SQLite V7 Reality Proof |
| 2 | Migration Infrastructure Minimum |
| 3 | Confirmed P0 Financial Safety Fixes |
| 4 | Balance Proof + Financial Invariant Engine |
| 5 | Shadow Migration / Migration Readiness Gate |
| 6 | SQLite-first Write Path |
| 7 | SQLite-first Read Path |
| 8 | Operational Canonical Cutover |
| 9 | Account Lifecycle Gate — closed by later device/runtime evidence |
| 10 | Atomic Backup / Restore Engine — closed by 2026-08-24 live production restore evidence |
| 11 | Archive Consolidation |
| 12 | Final Semantic Backup Round Trip |
| 13 | Compatibility / Dual-write Retirement |
| 14 | Sync Hardening (multi-device conflict/retry/stale-device — beyond the 2-device minimum) |
| 15 | Performance + Reliability Gate |
| 16 | Android Production + Security Gate |
| 17 | Budget Intelligence + Recurring + Product Correctness |
| 18 | Structural Refactor + UX / Accessibility |
| 19 | Codebase Final Cleanup |
| 20 | Final Release Candidate Gate |
| 21 | Rollout / Rollback |

Each phase has an explicit Definition of Done and several phases have hard
prerequisites (e.g. no Phase 6 without Phase 5 readiness, no Phase 8 cutover
without Phase 7 complete) — see `MYFI_MASTER_PLAN_FROZEN.md` §167 ("Definition
of Done لكل Phase") and §185A ("Phase Ownership / Non-Intersection Rule")
before assuming a phase can start early.

---

## 10. Current phase — what "done" looks like next

Phase 10 is closed. The immediate next work is not another restore build and
not a broad Product/Security implementation patch.

The next planning/current-state outputs are:

1. `PRODUCT-P0-A` — Competitive Design Translation Blueprint:
   screen-by-screen target behavior, UX rules, design-system direction,
   Settings IA, Home/Quick Add/Onboarding direction, component reuse inventory,
   and explicit unchanged financial behavior.
2. `SECURITY-S0` — Security & Data Current-State Blueprint:
   real code/runtime evidence for SQLite at rest, SecureStore use, Android
   backup state, logs, Supabase/RLS/sync boundaries, backup/restore security,
   and smart-data privacy boundaries.

After those two are reviewed and approved, choose exactly one small package
from the refined roadmap. That package gets its own scope, tests, CI evidence
where relevant, and device/runtime acceptance when behavior depends on Android
or persistent financial data.

---

## 11. Testing strategy

```powershell
npm run test:database   # schema + backfill + logic
npm run test:logic      # tests/run-financial-core.cjs
npm run test:ui         # tests/ui-contract.test.cjs
npm run test:gate       # tests/run-quality-gate.cjs (full)
npm run test:gate:static
npm run test:gate:runtime
npm run test:gate:cloud     # --include-cloud
npm run test:gate:android   # --include-android
npm run test:cloud          # tests/run-cloud-integration.cjs
npm run test:sync:two-client   # real two-device/two-client mutation sync e2e
npm run verify:android         # expo export --platform android (build sanity)
```

Rules (canonical authority §5, evidence precedence in §2/A4, and
`docs/CODE_QUALITY_STANDARDS_AR.md`):

- Static/compile/string-presence tests alone never close a device-dependent
  behavior. Evidence precedence is real-device > runtime/integration >
  automated contract/unit > static presence.
- Device-reported failures follow: before-evidence → regression test → fix →
  automated after-evidence → final device acceptance.
- `NOT PROVEN` never silently becomes PASS.
- Any change touching balance/movements needs a test in
  `tests/financial-core.test.mjs`; UI-important changes need a contract test
  in `tests/ui-contract.test.cjs` where text-checkable.
- Before considering an edit done, ask: can it allow spending unavailable
  money? Can a modal close despite a failed save? Did the entry UI grow
  without necessity? Any dead code left? Is there a regression test?

**Standing rules added 2026-08-20** (full detail in
`docs/00_MYFI_CANONICAL_AUTHORITY.md` § "Standing Engineering Rules"),
binding on every phase, not just Phase 9:

- Only a CI-built (GitHub Actions) APK counts as acceptance evidence for any
  gate. Local `gradlew`/manual builds are dev-iteration only — one already
  produced a false "credential rotation" diagnosis by silently not baking in
  required env vars.
- Any stateful/counter logic (epoch, revision, cycle, retry count) needs a
  test that runs the action **at least twice in sequence** — a prior fix
  passed 81/81 tests while still breaking on the second restore-epoch advance.
- `/code-review` runs and must be clean **before** every push, never as a
  check applied after the change is already live.
- CI scope/safety gates use `git merge-base --is-ancestor` + a repo-tracked
  expected-files list, never a hardcoded single-commit exact-match — the
  latter breaks the moment legitimate follow-up commits land.

---

## 12. Real financial data safety

- Never clear/reset the user's real financial database to create a clean test.
- Never delete the user's real cloud account, or invoke Delete Local Data
  against the real ledger, as a test.
- P20-G01 and Scenarios G/H (account delete, local-data delete) require a
  disposable test account/dataset — never the real one.
- Scenario E (second device) requires a genuinely isolated second
  device/session, not a simulated one.
- No scenario may mutate historical currency meaning, transaction IDs,
  balances, wallet ownership, or ledger/account mapping.
- If real user data must be inspected, it is **read-only**, with an audit
  harness that reports `queryOnly=true`/`financialWrites=0` and is restored
  afterward (the P18-012 pattern is the template to follow).

---

## 13. Git policy

- No direct work on `main`.
- No `git reset --hard` as an automatic recovery move.
- No `git add .` / `git add -A` for financial patches — stage exact files.
- No casual `npm install` / forced dependency upgrades.
- No deleting/resetting user financial SQLite or SecureStore just to make
  tests pass.
- No app uninstall during existing-user financial acceptance unless a
  specifically isolated test requires it.
- No silent financial repair, no invented FX.
- No financial history reinterpretation.
- No "fixing" logout by cloning the same ledger into an unrelated Guest ledger.
- No phase acceptance from compilation/static-string tests alone.
- Keep patches small and auditable even when releases are consolidated.
- One consolidated device-acceptance session where the active release plan requires it.
- A failed/incomplete patch attempt is not committed; the dirty worktree is
  preserved (not reset) so the next session can see exactly what was tried —
  this is the established pattern from P19-011's first contract failure.

---

## 14. Execution autonomy

**MUST (never violate without explicit user-approved change to canonical authority):**
Financial-safety invariants (§5), data-ownership rules (§6), sync contract
(§7), git policy (§13), real-data safety (§12), source-of-truth order (§2).

**SHOULD (default working method):**
Audit broadly before patching narrowly; fix root causes, not symptoms (P18-016
over a one-off recovery); keep evidence docs current when you close or open a
gate; prefer coherent patch batches over scattered one-liners; run the
relevant automated gate before calling anything done; write the end-of-session
status block (§19) every session.

**AUTONOMOUS (the engineering session decides):**
Which files to touch and how to sequence work inside a phase; test design;
internal refactors that don't change contracts; script/tooling creation;
whether a dependency addition is justified (state why); when a phase's own
sequencing in the Frozen Master Plan looks wrong given current evidence —
propose the change explicitly with evidence, do not silently reinterpret the
plan.

---

## 15. Future product roadmap

**Currently authorized / in progress:** Phases 9 → 21 as scoped in the Frozen
Master Plan (§9 above), including Phase 17 (Budget Intelligence + Recurring +
Product Correctness) and Phase 18 (Structural Refactor + UX/Accessibility).

The user approved the planning direction registered in:

`docs/01_CORE_AUTHORITY/MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md`

It establishes three equal dimensions: Financial Integrity, Product
Experience, and Security & Privacy. It does not authorize implementation by
itself and does not renumber the Frozen Master Plan.

Post-Phase-10 planning is organized into two parallel tracks:

- **Product:** `PRODUCT-P0-A` Competitive Design Translation → `P0-B` Design
  System → `P0-C` Onboarding/First Use → `P0-D` Settings/Education → `P1-A`
  Home/Needs Attention → `P1-B` Quick Add/Smart Defaults → `P1-C`
  Insights/Search/Goals → `P2` Smart Automation → `P3` Advanced Intelligence.
- **Security/Data:** `SECURITY-S0` Threat Model/Current State → `S1` SQLCipher
  feasibility/decision → `S2` key lifecycle/recovery → `S3` backup/restore
  security → `S4` cloud/sync acceptance → `S5` smart-data privacy → `S6`
  production security gate.

After live Phase-10 closure, `PRODUCT-P0-A` and `SECURITY-S0` become the next
planning/current-state outputs to reconcile and approve. The first
implementation package must be selected from those approved outputs and scoped
separately. Quick Add, templates, category changes, OCR, SMS, Voice, Statement
Import, Safe-to-Spend, and “Ask Your Money” are backlog candidates to evaluate,
not a single pre-approved implementation batch.

Contacts/Financial Parties linking remains a separate proposal unless a later
canonical package explicitly scopes it.

**Deferred/conditional by explicit plan** (not future ideas, already decided):
OCR, Voice, and multi-device sync are conditional — not described as
production-ready before their specific gates close. Workspaces/shared ledgers
and experimental/developer screens stay hidden if incomplete.

---

## 16. Brand / naming

Final branding/rebranding is explicitly `DEFERRED_BY_PLAN until Arabic name is
selected` (Frozen Master Plan). Do not rename the product, package, or
user-facing brand strings speculatively.

---

## 17. Definition of done (general shape)

Per-phase Definition of Done lives in the Frozen Master Plan §167 — read the
specific phase's entry before declaring it closed. As a floor, closing any
phase/gate requires, in this order of precedence: newer real-device evidence
> runtime/integration evidence > automated contract/unit evidence > static
source presence — never the reverse. A phase is not done because code exists;
it's done when the evidence chain proves the frozen scenario matrix for that
phase.

---

## 18. First-session instructions

Do not start with "begin Phase 10" or any specific task. Start with:

1. Inspect the repo yourself: `git fetch --all`, then check branch/HEAD
   against `git branch -r --sort=-committerdate` — confirm you're looking at
   the true tip, not a stale local checkout (this has already bitten this
   project once — see §3). Confirm SQLite schema version.
2. Read `docs/00_MYFI_CANONICAL_AUTHORITY.md`, then the Frozen Master Plan
   sections for Phase 9 and Phase 10, then the P19/P20 evidence under
   `docs/04_CURRENT_EVIDENCE/`.
3. If working from this local Windows clone specifically, diagnose the
   uncommitted `financialLedgerV7Repository.js` change flagged in §3 before
   writing any new code in that file.
4. Confirm whether the 10-item P20-G01 checklist (§10) is still the exact
   next task, or whether a newer session has since progressed it.
5. State the required-start-of-session block from canonical authority §6
   before making any change:
   ```text
   Verified branch / HEAD / Working tree / Expo SDK / React Native /
   SQLite schema / Current release/gate / Active addendum /
   Current device failures / Financial-data impact of proposed work /
   Schema/migration impact / Proposed patch ID
   ```
6. Do not trust this handoff blindly where it disagrees with what you find.

---

## 19. End-of-session handoff format

Per canonical authority §7, close every session with:

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
