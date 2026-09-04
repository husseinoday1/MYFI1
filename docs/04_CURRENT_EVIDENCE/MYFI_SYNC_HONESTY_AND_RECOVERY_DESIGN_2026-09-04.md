# MYFI — design: honest sync status + recovery path for V2 ledger-id conflict

Date: 2026-09-04
Status: **design only, no code written.** Per PA instruction, this is the
proposal to review before anything is implemented.

Follows the investigation reported to PA (msg `fae50b4e`): 37 real financial
mutations are stuck in `ledger_outbox_v3` behind a `financial_v2_ledger_id_conflict`
(a correct guard, not a bug), while the UI's sync indicator silently falls back
to a V1 path and reports "synced" — because nothing in `syncState` (or anywhere
else visible) reads V2 activation's own status.

## 1. Honest sync status

### What's wrong, precisely

`SettingsScreen.js:438` computes `syncState` from `demoMode`, `user`, `syncing`,
`online`, `lastSyncError`, `dirty` — none of which are set by
`runControlledFinancialV2Activation`'s failure path. When activation fails and
falls through to the V1 fallback (`useSyncSlice.js` ~2805, no matching escape
hatch), and the V1 call itself succeeds, `persistSynced` sets `dirty:false` and
`lastSyncError:null` for reasons that have nothing to do with whether the real
financial data (queued in V3) ever reached the cloud.

### Proposed fix

Add one more input to `syncState`'s computation, checked **before** the
existing `dirty`/`lastSyncError` branches (highest-priority except `demoMode`
and `!user`, since it is a stronger, more specific fact than a generic
"pending"):

```
const v2Stuck = financialLedgerV7Cutover
  && financialSyncV2Activation?.status === 'failed_before_activation'
  && financialMutationSyncProtocol !== 2;
```

Both `financialSyncV2Activation` and `financialMutationSyncProtocol` are
already store state, set every sync attempt — **no new DB read, no new sync
call.** This is deliberately narrow: it does not try to re-derive "protocol
never reached 2" from scratch, it reads the exact field the activation
function already writes.

`v2Stuck` gets its own branch, reusing the existing `needsAttention` visual
language (icon `cloud-offline-outline`, color `th.exp`) since that pairing
already exists and is themed — but a **distinct string**, not the same
"Needs attention" text used for `!online || lastSyncError`, because the two
have different meanings for the owner (transient network problem vs. a
standing ledger-identity conflict that needs a real decision). Something like:
"Some data isn't syncing" / "بعض البيانات لا تُزامَن" — deliberately not
alarming, but deliberately not "Synced" either.

A tap target (the existing `MenuRow` for `syncStatus` already supports this
pattern) should route to Diagnostics' "conflict recovery" section, or a
future purpose-built recovery screen (see §2), rather than silently sitting
there. **Not proposing an aggressive banner or modal** — the data is confirmed
safe locally, this is not an emergency interrupt, just a status that must stop
lying.

### Why not read outbox count directly for this

Considered adding a live `outboxV3PendingCount > 0` check instead of/in
addition to the activation-status check. Decided against it for the indicator
itself: it would require a DB read on a UI-render path (or a new periodic
poll), for a fact the activation status already implies whenever it matters
(V3 can only be genuinely stuck if activation never reached protocol 2). Count
belongs in the recovery screen (§2), where the user is already committing to
look closely, not in a value computed on every Settings render.

## 2. Recovery path for `financial_v2_ledger_id_conflict`

### Why the existing P12 recovery UI doesn't cover this

Every gate in `conflictRecoveryGatesV1` (`canRestore`, `canDiscard`,
`canActivate`, `canDiscardAcknowledgedLegacy`) keys off `ledger.intent.status`
— a `ledger_bootstrap_recovery_import_v9`/checkpoint-style record. Nothing
in the activation failure path (`runControlledFinancialV2Activation` →
`resolveCloudLedgerV2`) creates an intent row; a `financial_v2_ledger_id_conflict`
is a plain returned `{ok:false, reason}`, never an intent. So today this state
is invisible to that entire recovery surface — confirmed by PA independently.

### What this conflict actually means, and why it must not become a single button

`resolveCloudLedgerV2` fires when the account's cloud-registered ledger
(`cloud.ledgerId`) doesn't match this device's local ledger identity
(`identity.ledgerId`). Two ways this happens, and they call for **opposite**
actions:

- **(a) This account has real prior cloud data from another device/session,**
  and this device is new to it. The correct action is to **adopt the cloud
  ledger as authoritative** and re-file the local pending mutations against
  it — not silently merge, since the local 37 rows were written against a
  ledger id/epoch the cloud has never seen.
- **(b) The wrong account is signed in on this device** (a mistaken switch,
  not the account the local data was meant for). The correct action is **do
  nothing to the data** — send the owner back to account selection, since
  "fixing" the conflict here would file real transactions under the wrong
  account's cloud ledger permanently.

A single "just activate"/"just resolve" button cannot distinguish these, and
guessing wrong is exactly the class of mistake Phase 12 was built to prevent
(the file's own header: two things got this wrong twice in one day, only
human review caught it). So this needs the same shape as the existing legacy
outbox review — surfaced facts, then an explicit per-situation choice, never
an auto-resolve.

### Proposed flow (design, not implementation)

1. **Detection.** When `financialSyncV2Activation.status === 'failed_before_activation'`
   and `reason === 'financial_v2_ledger_id_conflict'`, the recovery surface
   activates (new gate in `conflictRecoveryGatesV1`, independent of
   `ledger.intent` — this failure never produces one).

2. **Comparison, read-only.** Resolve and show, side by side, in plain terms:
   - This device's pending local changes: count, and (like
     `reviewableLegacyRows`) a per-row list summarized as entity type +
     amount + date — never a blind "37 items", the owner reviews individual
     entries the way Phase 12's legacy-outbox review already works.
   - What is known about the cloud ledger for this account: created when,
     restore epoch, and — if `resolveCloudLedgerV2`'s RPC exposes it or can
     be extended to — a row count / last-activity hint, so the owner can
     judge "yes, that's my other device's real data" vs. "I don't recognize
     that."
   - **No fetch of the cloud ledger's actual transaction contents at this
     stage** — that's a heavier, separate operation (akin to bootstrap
     import) that should only run after the owner picks (a) below.

3. **Two explicit choices**, each requiring the owner to actively pick — no
   default, no pre-checked option:

   - **(a) "This is my account's existing data — combine them."** Triggers a
     bootstrap-import-shaped flow: pull the cloud ledger's state (using the
     existing bootstrap/readback-verification machinery already proven in
     `bootstrapFinancialLedgerV2`), re-key the 37 local pending mutations
     onto the cloud's `ledgerId`/`restoreEpoch`, and re-run shadow validation
     before any production apply — reusing the existing 3-pass shadow +
     durable-activation-barrier design already in
     `runControlledFinancialV2Activation`, just fed the adopted identity
     instead of failing on it. The 37 rows are never discarded by this
     choice; they get re-filed and their outcome (accepted/conflicted per
     row) is what finally lets `canDiscardAcknowledgedLegacy`-style per-row
     acknowledgement apply, if any true conflict remains after merge.

   - **(b) "This isn't the right account — stop."** No merge, no data
     mutation. Clear messaging: nothing was changed, the 37 items are still
     safely local, and the fix is to sign in with the correct account. This
     choice should be just as prominent as (a) — not a small "cancel" link
     — since picking wrong here is the actual danger.

4. **New intent-style record**, mirroring the pattern P12 already uses for
   checkpoints, so a half-finished (a) choice is itself recoverable/resumable
   rather than needing to restart the comparison from scratch if the app is
   closed mid-flow.

### Open questions — resolved

- **RPC contents (checked directly, `supabase/migrations/20260817165612_financial_mutation_sync_v2_shadow.sql`):**
  `get_financial_ledger_v2()` already returns `bootstrappedAt` (plus
  `restoreEpoch`, `protocolVersion`, `status`, `bootstrapId`,
  `bootstrapManifestHash`) — enough for "this cloud ledger was created on
  [date]" in the comparison step with zero new backend work. It does **not**
  expose a row/mutation count. A new read-only RPC (`select count(*) from
  financial_mutations_v2 where ledger_id=...`, gated by the same
  `owner_user_id = auth.uid()` pattern the existing functions use) would be
  needed for that — small, normal scope, not a blocker.

- **`bootstrapFinancialLedgerV2` traced in full (`financialBootstrapV2.js:276`)
  — my original "mostly wiring" estimate was wrong, correcting it here.**
  This function calls `resolveCloudLedgerV2({ supabase, identity })` using
  **this device's own local identity** (`ensureLedgerSyncIdentityV8`) — the
  exact identity already known to conflict. Its entire flow (stage-building,
  manifest hash, readback verification) is built around the premise "this
  device's local ledger becomes the canonical one," i.e. first-time
  activation. It has no parameter for "adopt a different, already-existing
  ledger id." Direction matters here: choice (a) needs the opposite of what
  this function does — pull the **cloud's** existing mutation history down
  and reconcile it with 37 **local** pending rows that were written with
  revision/base_revision chains computed against the local ledger's own
  (different) entity history. `ledger_sync_identity_v8` (where the local
  identity lives) has no "adopt this identity instead" path either — it's
  generated once, randomly, on first use, and nothing reads it back with an
  override.

  Reusing `syncFinancialMutationsV2`'s existing download loop (it already
  applies remote mutations via `applyRemoteLedgerMutationsV8`) can plausibly
  supply the "pull cloud history" half. But safely reconciling the 37 local
  rows against a foreign entity history — where the same ids may or may not
  exist under the cloud ledger, with different revision chains — is a real
  merge problem, not a re-key. **Revised recommendation:** choice (a) should
  not attempt an automatic re-key/merge. Instead: download and apply the
  cloud ledger's full history locally under its own identity (adopting it as
  this device's identity going forward — that part IS close to existing
  machinery), then put the 37 pending local items through the **same
  per-row review pattern** already in `conflictRecoveryGatesV1`
  (`reviewableLegacyRows`/`acknowledgedLegacyRows`) — the owner looks at each
  one and either re-enters it as a fresh action against the now-correct
  ledger, or discards it as a mistaken/duplicate entry. More manual for the
  owner, far lower engineering risk than an automatic merge across two
  independent optimistic-concurrency chains. This is now a bigger, separate
  design/implementation effort than §1 — not scoping it further without a
  go-ahead, given the risk class.

## Status

§1 (sync honesty) implemented and tested: `SettingsScreen.js`'s `syncState`
now carries a `v2Stuck` branch reusing existing store fields
(`financialSyncV2Activation`, `financialMutationSyncProtocol`), no new DB
read. `tests/phase15-sync-honesty-v2stuck.test.cjs` executes the actual
extracted expression against 9 fixtures (the reported scenario, protocol
recovering to 2, no-cutover guard, every intermediate activation status,
priority ordering against demoMode/`!user`/dirty). Gate: 173 passed, 0
failed, 11 skipped. `/code-review` (high effort, 8 angles): clean, no
findings. Financial-impact verdict: Financial Data NONE, SQLite Schema NONE,
Migration Required NO, Existing User Data PRESERVED — read-only UI
derivation, no write path touched.

§2 (recovery path) is **not implemented** — the corrected estimate above
makes it a separate, larger effort than originally scoped. Holding until
PA/owner decide whether and how to proceed with it.

Resuming the goal/tracker transaction-integrity investigation
(`myfi_goal_transaction_integrity_bug_2026-09-04`) — update: that was
completed and reported to PA before this note was written (see msg
`5e966a87`).
