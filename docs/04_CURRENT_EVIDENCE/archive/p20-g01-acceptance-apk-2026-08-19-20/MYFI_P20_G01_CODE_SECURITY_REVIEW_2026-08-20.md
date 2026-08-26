# MYFI P20-G01 — /code-review and /security-review results, full branch diff

Date: 2026-08-20
Produced by: MYFI Testing & Release session, per Planning & Audit's explicit
request to run both before any Phase 9 closure decision.
Scope: `impl/p20-g01-acceptance-apk-2026-08-19` vs the accepted P20 baseline
`d847957c05dc9fe3cdd0bc3eb9c93d525f65deb0` (the actual scope of this
patch's own code changes — `origin/main` is far behind and would have
included ~50k unrelated lines from Phase 18-20 work not touched by this
patch).

## /security-review — clean

No finding at ≥7/10 confidence. Checked: the `eas.json` Supabase key
migration (publishable key only, no secret/service_role key present), the
acceptance gate's reachability (build-flag gated, confirmed absent from both
`preview` and `production` eas build profiles — dead code in a normally
shipped build), its diagnostics payload (redacted money fields, local device
logs only, no network exfiltration), SQL parameterization in the new
repository queries (all bound params, no string-built SQL), and the two new
CI workflow files (no untrusted-input injection into shell steps, no leaked
secrets).

## /code-review — 10 findings, all PLAUSIBLE, all correctness/efficiency

Most severe first:

1. **`financialLedgerV7Repository.js:1478`** — the new
   `epochActivationPending` lookup checks `ledgerId`/`toEpoch` but never
   re-verifies `namespace` against the fetched row. Namespaces in this
   codebase already contain `::` in some cases, so a key collision could
   silently return a foreign/missing record and skip the
   `EPOCH_ACTIVATION_REQUIRED` fail-closed state — i.e. resurrect today's
   fixed bug through a narrow gap in the fix itself.
2. **`financialLedgerV7Repository.js:876`** — `commitLedgerRestoreEpochV8`
   trusts `outgoingPending.previouslyActivated` without re-checking its
   `ledgerId`/`toEpoch`, unlike the equivalent lookup in
   `readFinancialSyncProtocolV8` a few hundred lines away which does. Same
   collision risk as #1, feeding into `supersedesActivatedEpoch`.
3. **`financialLedgerV7Repository.js:2487`** — `canonicalFinancialEntityPayload`
   (the fix for today's avatarUri checksum bug, now used for both persisting
   and hashing) strips `avatarUri` **unconditionally**, not just when empty.
   A user who sets a real avatar has that field silently dropped from the
   persisted row, and the parity check — hashed through the same lossy
   transform — can never catch that class of loss going forward.
4. **`financialLedgerV7Repository.js:1650`** — the legacy namespace-only
   activation-evidence key is still actively kept fresh (no deprecation
   path). An old/rolled-back binary reading only that key with no epoch
   check would resurrect the original bug via a path this patch itself
   keeps populated.
5. **`p19RestoreEpochDeviceGate.js:102`** — `disposableBlockers` never
   cross-checks the SQLite wallet count against the in-memory store's
   wallet state (only reads it for diagnostics). A store/SQLite desync could
   let real wallet data slip past the "financially empty" guard. Impact is
   bounded — this gate is confirmed unreachable in production builds per the
   security pass.
6. **`financialLedgerV7Repository.js:1521`** — `activationEvidenceValid`
   keeps its old, now-misleading semantics (`true` whenever not activated,
   including the new `EPOCH_ACTIVATION_REQUIRED` state) instead of being
   removed or renamed; the code comments warn readers not to use it but no
   caller was migrated off it.
7. **`financialLedgerV7Repository.js:1439`** — `readFinancialSyncProtocolV8`
   does several sequential unguarded reads outside any transaction, unlike
   the write paths. A commit landing mid-read could produce a momentarily
   torn/misclassified snapshot.
8. **`financialBootstrapV2.js:43`** — the bootstrap manifest-hash builder
   doesn't route through the new `canonicalFinancialEntityPayload`, unlike
   the shadow-parity path. Currently safe (all writes go through
   `upsertEntity`, which already canonicalizes), but latent — the same bug
   class just fixed elsewhere has no test coverage tying these two hash
   computations together.
9. **`p19RestoreEpochDeviceGate.js:302`** — the destructive-interlock check
   reuses one stale in-memory cold-archive snapshot across all
   post-mutation fingerprint comparisons instead of re-reading from storage,
   so a future regression in `resetAll()`/`importBackup()` that both deletes
   real archives *and* returns `false` correctly would still report
   `PASS_FAIL_CLOSED`.
10. **`financialLedgerV7Repository.js:916`** (efficiency) — orphaned
    `epochActivationPending` rows accumulate forever in `ledger_v7_meta` for
    any epoch that gets superseded again before completing activation — no
    reconciliation/cleanup path.

None of these were exercised by today's device testing (which only ever
completed a single clean epoch advance per account, never a
double-supersession or a real-avatar-change scenario), so they're
code-review findings, not contradictions of today's PASS results.

## Recommendation

None of these are blocking-severity for Phase 9 closure on their own
(security review is clean, and #1/#2/#4 require a narrow collision/rollback
condition that isn't part of normal operation) — but #3 (avatarUri data
loss) stands out as worth a real user-facing fix before this ships broadly,
independent of Phase 9. Planning & Audit's call on sequencing.
