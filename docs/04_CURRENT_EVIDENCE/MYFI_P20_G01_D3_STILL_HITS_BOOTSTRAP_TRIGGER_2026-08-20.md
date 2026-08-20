# MYFI P20-G01-D3 — checksum fix confirmed working, but hits the already-known bootstrap-trigger defect

Date: 2026-08-20
Produced by: MYFI Testing & Release session
APK: CI build, commit `b182155`, SHA-256
`a303530b07a3a9796b8ea3ed77edc56e1a382a23d4dcd95ab3879f485729d3cd` —
verified via `gh run view 32322055855` (completed/success) before use.

## Result: progress, not PASS

Brand-new account `myfitest12345@gmail.com` (workspace
`user:7d616a2a-95d9-4743-8699-8fec78b59065`, ledger
`ledger-3f4dcb0600782865774aef9c9c06f7f3`), financially empty. First press
(seconds after account creation) correctly returned
`active_protocol_v2_required` — that account simply hadn't finished initial
V2 activation yet (`activationEvidencePresent: false`, expected for a
brand-new account, not a defect). Ran "Sync Now" explicitly, confirmed
"Last sync" changed from "not yet" to a real timestamp, pressed again:

```json
{
  "ok": false, "blocked": false, "phase": "POST_EPOCH_COMMIT",
  "reason": "phase9_new_epoch_shadow_validation_failed:financial_bootstrap_required",
  "serverAdvanced": true, "localEpochCommitted": true,
  "splitStateRequiresRecovery": true,
  "fromEpoch": 1, "toEpoch": 2,
  "shadow": { "ok": false, "reason": "financial_bootstrap_required", "restoreEpoch": 2 }
}
```

**This is further than any run has gotten today** — the gate got past the
pre-checks (protocol-active, checksum-parity) that blocked every previous
attempt, and actually attempted the restore-epoch commit. The commit
succeeded server-side and locally (epoch 1→2), but the post-commit shadow
validation failed with the exact defect already root-caused in
`MYFI_P20_G01_D2_RESTORE_EPOCH_V2_DEACTIVATION_ROOTCAUSE_2026-08-19.md`: the
new epoch's bootstrap state is never re-established
(`financial_ledgers_v2`'s `BEFORE UPDATE` trigger nulls
`bootstrap_id`/`bootstrap_manifest_hash`/`bootstrapped_at` on any
`restore_epoch` change), so the post-commit shadow pull correctly refuses —
it requires an active, bootstrapped V2 on the new epoch, which the commit
itself just made impossible.

## Read on this

`b182155` fixed the checksum-mismatch defect (D2/round-2 finding, empty
`avatarUri` hashing differently between shadow-stage and real copies) — that
fix is confirmed working, since we got past that check for the first time
today. But the *original* D2 root cause (Option A — re-bootstrap on epoch
advance — vs Option B, still an open Planning & Audit decision per that
file) does not appear to be implemented in this build. This is not a new
defect; it's confirmation of the one already on record, now reproduced live
by actually reaching the commit step for the first time.

## Consequence

- This account (`7d616a2a-...`) is now in the same split state as the
  earlier `0c9600f3-...` one (epoch 2, bootstrap missing) — consumed, do not
  reuse.
- `financialDataChangedByGate: false` held throughout — no real financial
  data at risk.
- Items 6–7 still cannot pass until the Option A (or B) fix from the D2
  report actually lands in a build.

## Next

Confirm with Implementation whether Option A/B has been decided and
implemented yet, or whether `b182155` was only intended to fix the
checksum issue and the bootstrap-trigger fix is still pending. Testing &
Release ready to retry once that lands.
