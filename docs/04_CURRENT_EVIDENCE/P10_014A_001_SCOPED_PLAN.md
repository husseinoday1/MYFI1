# P10-014A-001 — Scoped Plan (Planner handoff, no code)

**Role:** MYFI Planner (myfi-planner)
**Branch:** impl/p10-014a-local-strategy-b-device-gate-2026-08-22  (HEAD 13347ca)
**Status:** SCOPED PLAN ONLY. No source modified.

---

## PLAN_SUMMARY
P10-014A-001 fails with `p10_014a_canonical_restore_promotion_v13_precondition_failed`.
Diagnostic `tests/diag-p10-014a-full.cjs` reproduced the promotion with real `src/lib`
logic and printed all 20 sub-conditions of `exactImmutableIntent`: **19 true, 1 false** —
`intent.restoreProofDigest === guard.restoreProofDigest` (false).

Root cause is an **instrumentation/sequencing defect in the dev harness, not in
production `src/lib`**. The harness builds the intent from a guard it validated at
intent-build time, but then calls the public `promoteCanonicalRestoreStageV13` which
re-derives a *second* guard from a *re-read* snapshot; if that snapshot differs even
slightly, the recomputed `restoreProofDigest` != the one baked into the intent, and the
fail-closed precondition correctly rejects promotion.

Fix stays entirely in `src/dev/phase10RestoreBenchmarkHarness.js`. We stop the second
derivation: reuse the already-validated guard the harness already holds.

---

## FIX_LOCATION
- **File:** `src/dev/phase10RestoreBenchmarkHarness.js`  (DEV-ONLY)
- **Never:** `src/lib/financialRestorePromotionV13.js` or any other `src/lib` module.
- The harness already captures the validated guard at **line 939** (`const guard = await
  withRestoreTransaction(...)` returns `result`) and uses it to build the intent
  (line 944) and synthetic proof (line 957). The defect is that this same `guard` is
  **not** threaded into the promotion call at **line 975**.

---

## APPROACH_CHOSEN
**A — freeze/reuse the SAME guard** the harness validated at intent-build time, driving
promotion through a dev-only path that uses that exact `guard` instead of invoking the
public `promoteCanonicalRestoreStageV13` (which re-derives a second, mismatching guard).

**1-line reason:** because the user confirmed harness-side *recompute* failed in every
direction, the only mismatch-proof fix is to **never derive a second guard** — reuse the
exact guard that built the intent.

> Note on B ("make promote accept an externally-validated guard"): that requires adding an
> optional `guard` parameter to the production `promoteCanonicalRestoreStageV13`, which
> contradicts the dev-only mandate (#1). If the team prefers B, it needs explicit user
> approval (see USER_APPROVAL_REQUIRED) and is a backward-compatible, fail-closed-only
> change (prod callers omit the param → identical behavior). A is chosen because it keeps
> the fix 100% in dev and removes the second derivation entirely.

---

## VERIFICATION_GATE (ordered)
1. **Code review clean** — `/code-review` passes on the harness-only change.
2. **Full quality gate green** — lint/type/test/diagnostic suite green (incl.
   `tests/diag-p10-014a-full.cjs` now showing all 20 sub-conditions true).
3. **Push to GitHub** — branch `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`.
4. **CI builds the APK** — GitHub Actions proves SHA/BuildCommit (local Windows build is
   blocked; CI is the only allowed build path).
5. **Coordinator pulls APK** — via `cmd` and runs on device via `adb` (user connects USB).
6. **Expect P10-014A-001 PASS** — precondition `restoreProofDigest` now matches → gate
   closes.

---

## WHAT MUST NOT CHANGE
- `src/lib/financialRestorePromotionV13.js` (and any `src/lib` production module).
- `src/lib/financialRestoreSourceGuardV13.js` (guard derivation stays as-is).
- P10-012 migration — untouched, no sign-off.
- Production wiring — no prod wiring changes.
- Fail-closed behavior of `exactImmutableIntent` must remain intact.

---

## USER_APPROVAL_REQUIRED
- **The push itself** to GitHub (branch above).
- **Confirm Approach A vs B**: A chosen (harness-only). If B is preferred, it requires a
  production signature addition (`promoteCanonicalRestoreStageV13` optional `guard` param)
  → needs explicit approval before any such change; A avoids it.
- **Device run**: user must connect USB so Coordinator can `adb` the CI-built APK and
  observe P10-014A-001 PASS.

---

## EVIDENCE (file:line)
- `src/lib/financialRestorePromotionV13.js:70` — the single false sub-condition
  (`intent.restoreProofDigest === guard.restoreProofDigest`).
- `src/lib/financialRestorePromotionV13.js:50-70` — `exactImmutableIntent` (19/20 true).
- `src/lib/financialRestorePromotionV13.js:92` — intent built from
  `guard.restoreProofDigest` (original snapshot).
- `src/lib/financialRestorePromotionV13.js:134-142` — `promoteCanonicalRestoreStageV13`
  RE-DERIVES guard via `guardRestoreSourceBeforeEpochRpcInTransactionV13` (second read).
- `src/lib/financialRestorePromotionV13.js:150-154` — precondition fail thrown
  (`canonical_restore_promotion_v13_precondition_failed`).
- `src/dev/phase10RestoreBenchmarkHarness.js:939-952` — harness validates `guard`
  (`result`) and builds intent with it (correct, single source).
- `src/dev/phase10RestoreBenchmarkHarness.js:975-977` — harness calls promote WITHOUT the
  guard → triggers the second (mismatching) derivation. **This is the fix site.**
- `tests/diag-p10-014a-full.cjs` — untracked diagnostic proving 19/20 true, only the
  digest comparison false.
