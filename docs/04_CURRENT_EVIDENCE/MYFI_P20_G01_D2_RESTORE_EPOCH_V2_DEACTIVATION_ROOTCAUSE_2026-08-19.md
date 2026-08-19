# MYFI P20-G01-D2 — Root cause of the restore-epoch / Protocol-V2 state inconsistency

Date: 2026-08-19
Produced by: MYFI Implementation session
Input: `MYFI_P20_G01_DEVICE_ACCEPTANCE_2026-08-19.md` runs 3a–3c
Status: **root-caused from source. No fix applied — see "Why no fix yet".**

## Verdict

The inconsistency is real, it is reproducible from source, and it is **not a gate
bug**. `commitLedgerRestoreEpochV8()` — production controlled-recovery code in
`src/lib/financialLedgerV7Repository.js`, deployed since P19-008 — structurally
drops the ledger out of Protocol V2 every time a restore epoch is advanced.
The acceptance gate merely made it visible.

## Exact mechanism

`readFinancialSyncProtocolV8()` derives activation state like this
(`src/lib/financialLedgerV7Repository.js:1391`):

```js
const row = await db.getFirstAsync(
  `SELECT activated_at, ... FROM ledger_sync_state_v8
    WHERE ledger_id=? AND restore_epoch=? LIMIT 1`,
  identity.ledgerId, identity.restoreEpoch,      // <-- keyed by CURRENT epoch
);
...
activeProtocolVersion: row?.activated_at ? 2 : 1,
```

`commitLedgerRestoreEpochV8()` (`:824`) does two things and omits a third:

```js
UPDATE ledger_sync_identity_v8 SET restore_epoch=? ...        // 1 -> 2
INSERT OR IGNORE INTO ledger_sync_state_v8
  (ledger_id,restore_epoch,last_server_sequence,last_success_at,
   last_device_id,updated_at)
  VALUES (?,?,0,NULL,NULL,?)                                  // activated_at NOT set
```

The new epoch's sync-state row is created with `activated_at` NULL, because
`activated_at` is not in the insert column list. So the moment the commit lands:

- the identity says epoch 2, protocol version 2;
- `readFinancialSyncProtocolV8()` now looks up **epoch 2's** row, finds
  `activated_at = NULL`, and returns `activeProtocolVersion: 1`.

Separately, the activation evidence is stored under a **namespace-keyed**, not
epoch-keyed, meta key (`:1399`):

```js
`sync_v2_activation_evidence:${identity.namespace}`
```

so it is never migrated or invalidated on epoch change and keeps reporting the
old epoch.

This reproduces both observed mismatches exactly, with no other explanation
required:

| Observed (run 3c) | Source |
|---|---|
| `identity.restoreEpoch: 2` | identity CAS in `commitLedgerRestoreEpochV8` |
| `activationEvidence.restoreEpoch: 1` | namespace-keyed evidence meta, never epoch-migrated |
| `identity.protocolVersion: 2` | identity column, untouched by the commit |
| `protocol.activeProtocolVersion: 1` | new epoch's `ledger_sync_state_v8.activated_at` is NULL |

`activationEvidenceValid: true` in the same payload is **vacuous, not
reassuring**: the check short-circuits on `!row?.activated_at ||` (`:1420`), so it
returns true precisely because V2 is inactive. It should not be read as evidence
of health.

## Why run 3b produced no gate result

`phase9_new_epoch_shadow_validation_failed:...` is thrown at
`src/dev/p19RestoreEpochDeviceGate.js:373` — **outside** the `try/catch` that ends
at `:355`. So it escapes `runP19RestoreEpochDeviceGate()` uncaught: no
`[P20_G01_RESTORE_EPOCH_GATE_FAIL]` payload, no abort, no repair, no record that
the epoch had already advanced. Every step after the commit shares this flaw —
the local postcondition check, the shadow validation, the restore-event check and
the final fingerprint check.

The `catch` block reasons carefully about preserving intent when `serverAdvanced`
is true, and that reasoning is bypassed for every post-commit failure. That is why
the device session saw an epoch silently move from 1 to 2 with no gate output.

## On `financial_bootstrap_required` — SETTLED by read-only Supabase check (2026-08-19, Testing & Release)

`financial_bootstrap_required` is raised server-side when
`financial_ledgers_v2.bootstrapped_at is null`
(`supabase/migrations/202608170002_...sql:264`,
`202608170004_...sql:524`). `advance_financial_restore_epoch_v2`
(`202608170003_...sql:98`) itself updates only `restore_epoch`/`updated_at`, but
there is a **separate BEFORE UPDATE trigger** on `financial_ledgers_v2`
(`202608170004_financial_bootstrap_v2.sql:60-69`):

```sql
if new.restore_epoch is distinct from old.restore_epoch then
  new.bootstrap_id := null;
  new.bootstrap_manifest_hash := null;
  new.bootstrapped_at := null;
end if;
```

This trigger — not the earlier intentional data wipe — is the direct cause.
Confirmed by a read-only `select` against the affected row:

```json
{
  "ledger_id": "ledger-7e217fd55b4633bb82da5689ab97bdb9",
  "owner_user_id": "0c9600f3-0a3f-46fa-8763-113795adf802",
  "restore_epoch": 2,
  "bootstrap_id": null,
  "bootstrap_manifest_hash": null,
  "bootstrapped_at": null,
  "created_at": "2026-08-18 06:54:24.171263+00",
  "updated_at": "2026-08-19 17:46:12.028649+00"
}
```

`updated_at` (17:46:12.028649 UTC) matches `identity.updatedAt`
(`2026-08-19T17:46:12.259Z`) from the run-3c gate payload to within ~230ms —
i.e. this row was written by the same epoch-advance event captured in run
3a→3b, not by any earlier, unrelated wipe. **The prior "most likely
explanation" (intentional earlier wipe) is ruled out for this specific
symptom.**

This means the trigger's own design is now a fourth defect, additive to the
three already identified: every restore-epoch advance unconditionally strips
bootstrap state, which is *consistent* with the app-layer bug (row 3, epoch-keyed
lookup missing `activated_at`) but represents its own decision that Option
A/B in "Why no fix yet" must account for — a chosen fix has to either
re-bootstrap after every epoch advance (which this trigger now makes
mandatory, reinforcing Option A) or stop nulling these columns on epoch
advance as part of Option B.

## Consequences

1. **Production, not test-only.** Any real controlled recovery leaves the user's
   ledger on V1 with stale activation evidence, and the only surfaced symptom is a
   confusing `active_protocol_v2_required`. No silent financial corruption is
   implied — no financial rows are touched — but V2 sync stops.
2. **P20-G01 cannot pass as written.** Its post-commit shadow-pull step requires an
   active, bootstrapped V2 on the new epoch, and the commit itself guarantees V2 is
   inactive on that epoch. Items 6–7 are unachievable without a code change.
3. **The affected disposable account is now in split state** — epoch 2 locally and
   server-side, V2 inactive. It should be treated as consumed and not reused for
   acceptance. The Testing session was right to stop.

## Why no fix yet

Correcting this means deciding what a restore epoch is supposed to mean for V2
activation:

- **Option A** — re-bootstrap and re-activate V2 on the new epoch as part of the
  recovery handshake (evidence keyed per epoch). Semantically clean; larger change;
  touches the bootstrap contract.
- **Option B** — carry activation forward on epoch advance (copy `activated_at` and
  re-key evidence to the new epoch). Small change; weaker, since the new epoch's
  activation would no longer be backed by its own bootstrap evidence.

That is a change to the sync/recovery contract, which per
`docs/00_MYFI_CANONICAL_AUTHORITY.md` is a **PLAN CHANGE PROPOSAL** for the
Planning & Audit session to rule on, not an Implementation judgement call. The
gate's try/catch scope (defect 3) is a separate, self-contained fix that can land
independently either way.

## Recommended sequence

1. Planning & Audit rules between Option A and Option B.
2. Implementation lands the chosen fix plus the try/catch scope correction.
3. One read-only Supabase check on the affected ledger to settle the
   `bootstrapped_at` question.
4. Fresh disposable account, rebuild, re-run items 6–10.

Phase 9 remains OPEN. Items 6–10 remain unmet.
