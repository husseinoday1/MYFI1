# MYFI P20-G01 — Device Acceptance Run: Items 2–7 (Blocked at 6–7)

Date: 2026-08-19
Produced by: MYFI Testing & Release session
Scope: items 2–10 of the P20-G01 checklist (item 1 — build — already DONE, see
`MYFI_P20_G01_ACCEPTANCE_APK_BUILD_2026-08-19.md`).
Device: physical Android device, serial `R5CYA2T9C0M`.
APK installed: `app-release.apk`, SHA-256
`b2bc29d349643eef3729aa66fa9713327be6dd21efa8188d11d6053c2aa80a89` (same file
verified in item-1 evidence).

## Result summary

| Item | Step | Result |
|---|---|---|
| 2 | Install APK over current app, no Clear Data | ✅ PASS — `adb install -r` returned `Success`, app opened normally with existing real-account data intact |
| 3 | Settings row reads acceptance-gate label, not default label | ✅ PASS — row read "اختبار Restore Epoch — بيانات تجريبية فقط" (AR) — confirms `EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1` baked into this build |
| 3 | Gate refuses to run on the real (non-empty) account | ✅ PASS — pressed on real account, real account `workspaceNamespace: user:8d99d077-...`; response `blocked: true`, `reason: disposable_financially_empty_account_required`, `financialDataChangedByGate: false` — no real data touched |
| 4 | Sign out of real account, sign into pre-existing disposable/financially-empty test account | ✅ DONE — confirmed by workspace namespace change to `user:0f5384a8-d22f-4996-a474-816ca81260e9` |
| 5 | Let Protocol V2 reach active/quiescent state on disposable account | ✅ DONE — sync-status row read "متزامن" (synced) before the gate was pressed |
| 6 | Run the restore-epoch gate on the disposable account | ⚠️ **RAN, but did not execute** — see blocker below |
| 7 | Require exact pass marker `[P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS]` | ❌ **NOT REACHED** — gate returned `blocked: true` again, this time on the correct disposable account |
| 8–10 | Supabase server-side audit, sign back into real account, verify real account untouched | NOT ATTEMPTED — blocked on item 6/7, no reason to proceed until the item 6 blocker is understood |

## The item 6/7 blocker (needs Implementation/Planning diagnosis)

Gate response on the disposable account (namespace confirmed different from
the real account's):

```json
{
  "patchId": "P20-G01",
  "gate": "PHASE9_RESTORE_EPOCH_DEVICE_ACCEPTANCE",
  "startedAt": "2026-08-19T16:35:03.180Z",
  "acceptanceOnly": true,
  "financialDataChangedByGate": false,
  "sqliteSchemaChanged": false,
  "secureStoreChanged": false,
  "supabaseSchemaChanged": false,
  "ok": false,
  "blocked": true,
  "reason": "disposable_financially_empty_account_required",
  "blockers": ["financial_v7_cutover_required"],
  "workspaceNamespace": "user:0f5384a8-d22f-4996-a474-816ca81260e9",
  "ledgerNamespace": "user:0f5384a8-d22f-4996-a474-816ca81260e9"
}
```

For comparison, the item-3 refusal on the **real** account (different
namespace `user:8d99d077-...`) returned the identical `reason` string and the
identical `blockers: ["financial_v7_cutover_required"]` array.

**The two responses are indistinguishable except for `workspaceNamespace` /
`startedAt`.** The gate's `reason` field claims the blocking condition is "a
disposable, financially-empty account is required" — but it produced this
exact same reason on an account that already *is* disposable and financially
empty (confirmed by the user prior to the run, and by namespace evidence of
being logged into a different, dedicated test account).

This means either:
1. `financial_v7_cutover_required` is a distinct, unmet precondition
   (something about a "V7 financial cutover" state not yet reached by this
   account/workspace) that the gate is not surfacing clearly — the `reason`
   string is misleading because it names the wrong blocker, or
2. The gate's disposable/empty-account detection itself is broken and is
   never satisfied regardless of which account is used, or
3. The disposable test account, despite having no user-visible transactions,
   has not gone through some required internal migration/cutover step and is
   not actually in the state the gate expects.

**Not diagnosable from this session** — root-causing `financial_v7_cutover_required`
requires reading the gate's source (likely
`src/lib/financialLedgerV7Repository.js` or the P20-G01 gate module) to find
what that blocker actually checks. That is Implementation/Planning &
Audit work, not device-acceptance work.

## Safety posture

No real financial data was touched at any point. Every gate invocation in
this run (both the item-3 real-account attempt and the item-6/7
disposable-account attempt) returned `financialDataChangedByGate: false`,
`sqliteSchemaChanged: false`, `secureStoreChanged: false`,
`supabaseSchemaChanged: false`. The gate is behaving safely (refusing to
mutate anything) even though it is not behaving *correctly* (refusing on an
account that should qualify).

## Diagnostic round 2 (requested by Implementation session, later same day)

Implementation asked for a second, deliberate round: press the gate once on
the real account and once on the disposable account, captured via `adb
logcat -s ReactNativeJS:*` (not just the on-screen JSON, which was truncated
in round 1), specifically to inspect `storeCounts`, `sqliteCounts`, and
`cutoverKeyPresent`. Refusal on both presses was expected and correct per
Implementation's own framing — this was a diagnostics round, not an
acceptance round.

### Finding 1 — the requested fields do not exist in this build's output

Full `logcat -s ReactNativeJS:*` capture around both gate presses contains
exactly two JS log lines per press: `[P20_G01_RESTORE_EPOCH_GATE_BLOCKED]`
(warn) and `[P20_G01_PHASE9_RESTORE_EPOCH_GATE_RESULT]` (info), both carrying
the same object already shown above. **Neither line, nor any other line in
the capture, contains `storeCounts`, `sqliteCounts`, or `cutoverKeyPresent`.**
This build does not log those fields anywhere observable from the device.
Answering Implementation's actual question (benign empty-account edge case
vs. real gate defect) is **not possible with the currently installed APK** —
it requires a build that logs those specific fields, or a different
retrieval method (e.g. reading them from a debug screen or exported
diagnostics not yet identified).

### Finding 2 — `[P20_V2_SYNC_CONTEXT]` (logged on app launch, before the gate)

Both accounts logged an identical shape on launch:

```json
{"activeLedgerSupported":true,"financialLedgerV7Cutover":false,"activeProtocolVersion":0,"financialV2Active":false,"ledgerId":null,"restoreEpoch":0}
```

`financialLedgerV7Cutover: false` and `financialV2Active: false` on **both**
the disposable account and the real account. This is a stronger, more
direct signal than the gate's `reason` string: neither account has completed
the V7/V2 cutover, which is plausibly the actual, correctly-named blocker
(`financial_v7_cutover_required`) — the `reason` field
(`disposable_financially_empty_account_required`) may simply be a
poorly-chosen constant/label that doesn't describe this specific blocker,
rather than the gate's disposable-account check itself being broken.

### Finding 3 — `workspaceNamespace` differed across the three presses (resolved, not a bug)

| Press | Account | `workspaceNamespace` |
|---|---|---|
| Round 1, item 3 | real account (original) | `user:8d99d077-...` |
| Round 1, items 6–7 | disposable account | `user:0f5384a8-...` |
| Round 2 | real account (same login, later) | `user:a951f546-...` |

The real account produced two different namespaces at two different times.
**Root cause identified and confirmed with the user, not a gate bug**: between
round 1 and round 2 the user deliberately deleted the real account's local
database data (intentional, for unrelated reasons) and attempted to restore
from an on-device backup; the backup was found invalid/unusable, and the
user confirmed the old data has no value to them and chose to proceed with a
fresh account rather than recover it. This explains both the new namespace
and why the round-2 "real" account also reads `financialLedgerV7Cutover:
false` — it is now, in practice, a fresh/empty workspace. **No accidental
data loss occurred; this was the user's own deliberate action, backups were
checked and found not worth restoring, and the user explicitly accepted
starting over.** No further action needed on this thread.

## Diagnostic round 3 — third test account, three distinct blocker states observed

A third, freely-disposable test account (`workspaceNamespace:
user:0c9600f3-0a3f-46fa-8763-113795adf802`, `ledgerId:
ledger-7e217fd55b4633bb82da5689ab97bdb9`) produced three *different* gate
outcomes across three presses, which materially changes the round-1/2
conclusion:

**3a. V2-active account, 1 real transaction present:**
```json
"reason": "disposable_financially_empty_account_required",
"blockers": ["transactions_present:1", "sqlite_transactions_present:1"]
```
This is the gate working *correctly* — specific, accurate blockers naming
exactly what's present. This is why round 1/2's `financial_v7_cutover_required`
blocker on the empty accounts looked plausible as a "real, correctly-named
precondition" rather than a bug (see round 2 Finding 2).

**3b. Same account, transaction deleted via in-app delete (now 0 transactions), gate pressed immediately after:**
No `GATE_BLOCKED`/`GATE_RESULT` line appeared at all. Only one unrelated
warn-level line fired:
```json
'[P19-015B0_LEDGER_IDENTITY_FORENSICS]', {"patchId":"P19-015B0","readOnly":true,"ok":false,"reason":"phase9_new_epoch_shadow_validation_failed:financial_bootstrap_required"}
```
No visible in-app dialog — user described it as "the screen just refreshed."
`readOnly: true` so nothing was mutated, but the gate's own result flow did
not run/complete at all this time.

**3c. Same account, gate pressed again (no other change) — reproduced with a new reason and an internal inconsistency:**
```json
"reason": "active_protocol_v2_required",
"identity": {"restoreEpoch": 2, "protocolVersion": 2, ...},
"protocol": {"activeProtocolVersion": 1, "activationEvidence": {"restoreEpoch": 1, ...}, "activationEvidenceValid": true}
```
`identity.restoreEpoch` (2) disagrees with
`protocol.activationEvidence.restoreEpoch` (1), and `identity.protocolVersion`
(2) disagrees with `protocol.activeProtocolVersion` (1) — **two fields on the
same response, both meant to describe this account's protocol state, do not
agree with each other.** `financialDataChangedByGate` was still `false`, so
nothing was persisted as a financial mutation, but something did advance
`restoreEpoch` from 1 to 2 between attempts 3b and 3c without the gate ever
reporting a completed run in between.

**This is the clearest concrete lead in this evidence file**: emptying a
previously-active V2 account down to zero transactions appears to push it
into a transitional state (`financial_bootstrap_required` in 3b) that then
produces an internally-inconsistent identity/protocol pair in 3c, rather than
a clean "eligible, 0 blockers, PASS" result. This looks more like a real
state-machine gap in the gate/protocol-version tracking than a UI/label
issue. No further presses were attempted on this account after 3c to avoid
compounding the inconsistency — this is disposable/free-to-use account, so
low risk, but the state is now unclear and shouldn't be built on top of
without Implementation looking at it first.

## Next

Do not attempt items 8–10, and do not press the gate again on the
`user:0c9600f3-...` account, until Implementation has looked at the round-3
findings. Open questions for Implementation/Planning & Audit:
1. Why did emptying a V2-active account's last transaction (3a→3b) produce
   `financial_bootstrap_required` instead of a clean empty-eligible state?
2. Why does `identity.restoreEpoch`/`protocolVersion` disagree with
   `protocol.activationEvidence.restoreEpoch`/`activeProtocolVersion` in the
   same response (3c) — is `restoreEpoch` advancing somewhere it shouldn't
   between gate attempts even though `financialDataChangedByGate: false`?
3. Is there a legitimate path to reach "V2-active, cutover done, 0
   transactions" cleanly (e.g. a brand-new account that never has a
   transaction, rather than one that had one and was emptied) — if so,
   Testing & Release can try that path fresh in the next round to see if it
   reaches `[P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS]`.
4. Ship a build that logs `storeCounts`, `sqliteCounts`, and
   `cutoverKeyPresent` explicitly, since the `blockers` array (e.g.
   `transactions_present:1`) turned out to answer the same question in
   round-3a without needing those exact field names.
