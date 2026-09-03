# MYFI P10 — Working State (handoff-ready)

## Date
2026-08-22

## Branch / HEAD
- Branch: `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`
- HEAD: `13347caea3ca5174414bf42d629ad85f6a1071fc`
- Status: clean working tree (IDEA.md untracked only).

## Agent network (skills)
- `myfi-planner` (Planner) · `myfi-implementer` (Implementer) · `myfi-reviewer` (Reviewer + Release Gate) · `myfi-research-intake` (Researcher/Change Intake) · `myfi-network-constitution` (charter, not a conversation).
- Coordinator = main chat. User-approval hard-stop gate on: migrations (incl P10-012), production wiring, src/lib changes (only proven Code defect), push/CI/APK, plan changes, urgent overrides.
- Model: all roles on `hy3-free` (Claude/Codex quota exhausted); upgrade when quota returns.

## P10-014A-001 device run (real device)
- Device: Samsung SM-S938B (R5CYA2T9C0M), Android user 0.
- APK SHA256: `401feb4147125f218a113e197eadda772a26d4a583ffb77cf647f50983a9708a`
- BuildCommit (from P10-014A-R5-build-evidence.txt): `13347ca...` == HEAD → NOT a stale build.
- Original APK restored byte-for-byte after run (SHA `e4be0c10...`). Device safe.
- RESULT: **FAIL** code `p10_014a_canonical_restore_promotion_v13_precondition_failed`.

## Classification (RESOLVED via node:sqlite diagnostic)
- Diagnostic: `tests/diag-p10-014a-full.cjs` reproduces the exact promotion sequence with REAL logic copied from src/lib (exactImmutableIntent lines 50-70). Result: `exactImmutableIntent` = false, and the ONLY false sub-condition is:
  `20 restoreProofDigest match: false`
  (all other 19 sub-conditions true, including uuid(serverEventId), exactCounts, sourceLiveGeneration, etc.)
- ROOT CAUSE: `promoteCanonicalRestoreStageV13` (financialRestorePromotionV13.js:142) RECOMPUTES `guard` internally via `guardRestoreSourceBeforeEpochRpcInTransactionV13`, which derives a fresh `guard.restoreProofDigest` from `deriveCanonicalRestoreProofDigestV13(guard.snapshot re-read from DB)`. The intent's `restoreProofDigest` was set earlier in `createStrategyBRestoreIntentV13InTransaction` from the ORIGINAL `guard.snapshot`. If `guard.snapshot` differs even slightly between the two reads (live-generation / counts re-read), the recomputed digest ≠ intent digest → precondition fails.
- VERDICT: **Instrumentation / sequencing defect in the harness + promotion contract** — NOT a Code defect in production `src/lib`. The production module correctly rejects a non-matching digest (fail-closed, correct behavior).
- `immutableIntentMatch` (harness log) showed all-true because it uses `countsEqual` and a STALE `guard` captured before the synthetic proof / promotion recompute — so it does not reflect the recomputed digest mismatch.

## Next step (requires USER approval — code change)
- Option A (recommended): in the harness, pass the SAME `guard` object used to build intent/synthetic-proof into `promoteCanonicalRestoreStageV13` (or recompute guard BEFORE building intent and freeze its restoreProofDigest), so the recomputed digest always matches. Dev-only change in `src/dev/phase10RestoreBenchmarkHarness.js`.
- Option B: make `promoteCanonicalRestoreStageV13` accept an externally-validated guard (no internal recompute) when called from the harness.
- NO change to `src/lib/financialRestorePromotionV13.js` is justified (it is fail-closed correct).
- After fix: rebuild via CI, re-run P10-014A-001 on device, expect PASS → close P10-014A-001.

## Sequence (frozen — do not jump)
P10-014A (local) → P10-014A-002 (fault matrix) → P10-014B (cloud, after P10-012 with user sign-off) → production wiring.

## Pending user decisions
- Approve the harness fix (Option A or B) before any code change. No push/CI until /code-review clean + CI green with run ID.
