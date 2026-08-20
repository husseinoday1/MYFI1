# MYFI P20-G01-D3 — the checksum field, and why the recovery coordinator already exists

Date: 2026-08-20
Produced by: MYFI Implementation session
Inputs: the device `differences` payload; `MYFI_Restore_Epoch_V2_Deep_Research_Report.txt`
(external, treated as a claim to verify, not as authority)

## 1. The field is `cfg.avatarUri`

Counts matched on every metric; only the checksum differed, and by exactly 15 bytes.

```text
source: fnv1a32:cffb5d15:3834
target: fnv1a32:0ca69208:3819
3834 - 3819 = 15
,"avatarUri":""  = 15 characters
```

The write path stores a **canonical** payload
(`financialLedgerV7Repository.js:2504`):

```js
safeJson(canonicalFinancialEntityPayload(entity.entityType, entity.payload))
```

and `canonicalFinancialEntityPayload` (`:2482`) strips exactly one field —
`cfg.avatarUri` from the `workspace` entity. But `projectionDocument` hashed
`entity.payload` **raw**. Shadow parity was therefore comparing a value against its own
canonical form: identical counts, different checksum, forever.

The 15-byte delta also pins the value: `avatarUri` was an empty string on this
workspace. A real signed URL would have produced a much larger gap.

### Origin

`d847957` ("P20 FINAL close V2 client canonicalization") introduced the stripping so
rotating signed avatar URLs would not manufacture sync conflicts. Its contract test
asserts "canonical cfg omits avatarUri". The shadow-parity projection was never brought
along. **This blocks cutover for every workspace carrying `cfg.avatarUri`, not just
fresh accounts** — the fresh-account framing was incidental.

### Fix

`projectionDocument` now hashes `canonicalFinancialEntityPayload(...)`. The read side
already canonicalises (`:3155`), and the canonicaliser is idempotent, so both sides now
hash the same form. Nothing else about staging or storage changed.

## 2. The external report's central claim is correct — and my earlier claim was wrong

Verified against the migrations, not taken on trust:

```sql
-- 202608170004_financial_bootstrap_v2.sql:56
-- "Any restore-epoch advance invalidates the prior bootstrap. The next epoch
--  must establish a new full baseline before mutation sync can resume."
create trigger financial_ledgers_v2_clear_bootstrap_on_epoch_change
before update of restore_epoch on public.financial_ledgers_v2
```

The trigger nulls `bootstrap_id`, `bootstrap_manifest_hash` and `bootstrapped_at`. So
`financial_bootstrap_required` after an epoch advance is **deliberate design**, not a
defect.

My earlier statement that the advance does not clear bootstrap metadata was wrong: I
read the RPC body and missed the BEFORE UPDATE trigger, whose plpgsql assignments use
`:=` and so did not match the pattern I grepped for. Another session had already
corrected this in `cf7714e`.

Also verified as the report describes: `bootstrapFinancialLedgerV2`
(`financialBootstrapV2.js:265`) and `activateFinancialSyncProtocolV2V8`
(`financialLedgerV7Repository.js:1540`) exist with those names and roles.

## 3. But the proposed new coordinator is not needed — and my own fix was blocking the existing one

`runControlledFinancialV2Activation` (`useSyncSlice.js:912`) already performs the exact
sequence the report proposes: bootstrap → readback + manifest verification → shadow
validation with production apply disabled → quiescence check → activate. It does not
touch `restore_epoch`, so it already satisfies the report's "complete the epoch, never
advance it again" requirement.

What blocked it was the P20-G01-D2 fix. Folding epoch supersession into
`requiresV2Recovery` made the coordinator bail at `:930` — the branch meaning "a
production cursor moved without activation, refuse and demand manual recovery". A
superseding epoch is not that: its sync-state row is created fresh with cursor 0. It is
the *safe* case, and the one that should resume.

### Fix

- `requiresV2Recovery` returns to its original meaning: not activated **and** a
  production cursor already advanced.
- Epoch supersession stays visible through `activationState ===
  'EPOCH_ACTIVATION_REQUIRED'` and `epochActivationPending`, so it is still never
  mistaken for a never-activated V1 ledger.
- If re-activation then fails, `useSyncSlice.js:2235` throws instead of taking the
  `[P19_FINAL_V1_FALLBACK]` branch, preserving the addendum's no-automatic-fallback
  rule.

This reuses a code path that is already covered by the P19-011 and P19-013 contracts,
rather than adding a second orchestrator that would have to re-derive the same
invariants.

**Bound worth stating rather than glossing:** both that guard and the
`requiresV2Recovery` guard beside it read `financialProtocol`, which is only populated
when `financialLedgerV7Cutover` is true. Neither can see a superseded epoch on a
workspace that is not cut over. That is a pre-existing limit of the design, not
something either fix introduces, and the comment now says so.

## 4. Tests

`run-p20-g01-d2-restore-epoch-activation.cjs` was restated around the invariant rather
than the flag that used to carry it:

- a superseding epoch is never `NOT_YET_ACTIVATED`
- it is `EPOCH_ACTIVATION_REQUIRED` with `previouslyActivated: true`
- `requiresV2Recovery` is **false**, so the coordinator can resume it
- the supersession survives two consecutive advances
- **new:** an unactivated ledger whose production cursor already moved still reports
  `requiresV2Recovery: true` — narrowing the flag must not lose the unsafe case

Run against the pre-fix sources it fails on the resumability assertion; it passes after.

## 5. Verification

```text
npm run test:gate ....... 81 passed, 0 failed, 11 skipped
p19-011 / p19-013 / p20 / p19-final / p20-g01 ... PASS
verify:android .......... OK
/code-review (high) ..... 1 finding, fixed before push
```

## Status

Phase 9 remains OPEN. Items 6–10 remain unmet. Two independent blockers are now
removed; whether cutover actually completes on a real device is the next thing to
measure, and it has not been measured yet.
