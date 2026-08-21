# MYFI — Implementation session handoff

Date: 2026-08-21
From: MYFI Implementation (context near exhaustion)
To: MYFI Implementation 2
Branch: `impl/p20-g01-acceptance-apk-2026-08-19`

## Where things stand

```text
Phase 9        CLOSED — recorded as 9/10 confirmed + 1 accepted, not 10/10
Phase 10       Steps 1-3 landed, benchmark harness landed, Step 4 NOT started
Supabase       two FK drifts verified live and fixed; account deletion unblocked
Backup format  7 gaps hardened, fixture suite in the gate
test:gate      87 passed, 0 failed, 11 skipped
```

Every commit below has a confirmed green CI run. Working tree clean, local and origin
in sync.

## The one thing to do next

**Get benchmark numbers from a real device.** Step 4 (the isolated staging engine) is
deliberately on hold until they exist — the user chose to wait for measurement rather
than pick Strategy A on the report's recommendation alone.

Run on device:

1. Install over the app, no Clear Data.
2. **A clean disposable account.** Not a real one. The guard refuses if the ledger holds
   anything, but do not lean on it.
3. Settings → Account → "Restore benchmark — disposable only".
4. Confirm the prompt. It generates and stages 1k + 10k + 50k + 100k transactions in
   sequence — minutes of an apparently frozen app. Do not close it.
5. "Copy evidence" and return the payload.

### Read the numbers with this in mind

`maintenanceBlockedMs` is a **lower bound**, not the production lock window.
`beginLedgerRestoreEpochV8` and `commitLedgerRestoreEpochV8` are excluded from the
measurement, and per the Phase 10 report §13 production would run those under the same
lock. `ffe390f` marks this inside the payload itself so it cannot be read off without
seeing the caveat.

Strategy A (stage inside the maintenance lock) is the report's recommendation on
grounds of simplicity, and it does not cost what the report implies. Promotion scales
well — `promoteFinancialWorkspaceStageV7` moves rows with `INSERT INTO ... SELECT`
inside SQLite, so 100k rows is one statement per table. **Staging** is the row-by-row
JS part, and that is what the lock window is actually made of. That is the number to
look at.

## What landed today

| Commit | What |
|---|---|
| `f7b8b30` | P10-001 canonical backup read model |
| `ddc00d2` | P10-002 semantic hash contract + the §51 permanent regression |
| `c2fbfaa` | P10-003 strict structural validator |
| `9c31529` | profiles_id_fkey drift verified live and fixed |
| `3303f7e` | finance_data_id_fkey cascaded — nothing blocks account deletion now |
| `8cebc61` | backup-format fixtures landed, held out of the gate |
| `ed5bd92` | inspectBackupData hardened, fixtures wired into the gate |
| `5f83034` | benchmark harness wired flag-gated |
| `b827cdc` | benchmark flag added to the D1 build |
| `ffe390f` | `maintenanceBlockedMs` marked a lower bound in the payload |

## Things that will bite you if you do not know them

**Every module written today had a real defect found by review or the gate.** Not one
landed clean first time. Three of those were rules that were too strict and refused
legitimate data — one would have stopped a user opening their own year archive, one
would have refused a valid restore. Before adding any new validation, ask what else
reaches that code path besides the case you have in mind.

**Verify field names against the producer, not the consumer.** P10-002 shipped hashing
`payload.amountMinor`, which does not exist — `payload_json` stores `plan.original`
with `amt`/`walletAmount`/`baseAmount`. Every transaction hashed zero for its amounts
and the fixture passed because it invented the same names.

**A test that goes green on unfixed code is describing the present.** The backup
fixtures arrived passing 66/66 with two tests asserting broken input was accepted.
Inverted before wiring them in.

**The CI scope guard.** `.github/p20-g01-d1-allowed-source.txt` lists the shipped-source
files this branch may touch. Add a file there in the same commit that first changes it,
or the build goes red for a reason unrelated to your change. It caught me twice.

**Nothing counts as done until a green CI run id is confirmed.** Seven consecutive red
runs went unnoticed here because local `test:gate` was green and nobody opened Actions.

## Open, not blocking

- `finance_data` is legacy and still scheduled for Phase 13/19 removal. It now cascades
  rather than blocking, which is a stopgap, not the retirement.
- Supabase performance advisors list 17 unindexed FKs and 17 unused indexes.
  Deliberately not acted on — see the Disk IO assessment for why, and revisit with the
  benchmark numbers.
- `MYFI_CLAUDE_CODE_MASTER_HANDOFF.md` sits untracked at the repo root, not mine.

## Standing rules in force

Six of them, in `docs/00_MYFI_CANONICAL_AUTHORITY.md`: CI-only acceptance builds;
counter/epoch logic tested across two consecutive iterations; `/code-review` clean
before push, not after; CI gates keyed on ancestry plus a repo-tracked allowlist rather
than a hard-coded commit; a confirmed green CI run id before calling anything done; and
diagnostic payloads that summarise rather than publish a user's money.

The last one has an automated control now — `tests/dev-diagnostic-payload-privacy.test.cjs`
— because three separate leaks appeared in one day and reviewer attention is not a
control.

---

# Second handoff — 2026-08-21, Implementation → Implementation 2

Context exhausted. Branch state: `341b047` on origin, tree clean, `test:gate` 91/0,
every commit below confirmed green in CI.

## What I did after the branch came back to me

| Bug | Result | Commit |
|---|---|---|
| 2, 3, 4 | one defect — `App.js:644` returned the maintenance screen instead of overlaying it, unmounting the tree | `abe8fd7` |
| 5 | `App.js` rendered History and Reports with no props; their no-op defaults made the +/- buttons decorative | `0609cf8` |
| 1 | instrumented, not fixed — measure before reordering startup | `03db96b` |

Bug 3's finding is the one that mattered: **the restore was succeeding all along**, and
only its confirmation was lost when SettingsScreen unmounted mid-await. The user had
been retrying an operation that had already worked. Duplicate protection held — the
user confirmed transaction counts show no duplication.

Three regression guards added, all of which fail against the pre-fix source:
`app-maintenance-overlay`, `screen-action-props-wired`, and (earlier) the
diagnostic-payload privacy control.

## Pick this up first: the user could not follow my measurement request

I asked for two sets of device numbers and the user said plainly that they did not
understand what I was asking for. That is my failure of explanation, not theirs, and it
is the live blocker — both remaining decisions are waiting on numbers that nobody has
been able to produce yet.

What is actually needed, in plain terms:

**Number set 1 — why the app is slow to open.** After installing a build from
`03db96b` or later, opening the app once writes a single line to the device log. That
line says how many milliseconds each startup step took. It settles whether the delay is
the network call, the local database work, or neither.

**Number set 2 — how long a restore takes at scale.** A button in Settings → Account
generates test data at four sizes and times the staging and promotion of each. It
decides whether restore staging can run inside the maintenance lock (Strategy A) or has
to move outside it (Strategy B).

Both come from the same build, so one device session covers both. The second one runs
for minutes with the app looking frozen, and it must only be run on a disposable
account.

**Suggestion:** do not ask for `adb logcat` output. The user is testing on a real
phone in ordinary daily use, not at a workstation. Either surface the startup timing in
the same Settings diagnostic panel the benchmark already uses — where "Copy evidence"
already exists and the user has used it successfully before — or walk them through it
step by step. The mechanism for getting numbers out of the device should be the one
they have already done, not a new one.

## How to read the numbers when they arrive

Two caveats, both deliberately recorded inside the payloads so they cannot be read
without them:

- `mark('ready')` is when React is told to render, **not** when pixels appear. If the
  marks sum to far less than the delay the user feels, the cost is in the first render
  and reordering startup fixes nothing — while touching the code path that produced
  this project's worst bugs.
- `maintenanceBlockedMs` is a **lower bound**. `begin`/`commitLedgerRestoreEpochV8` are
  excluded from the measurement, and production runs those under the same lock.

Also worth knowing before Strategy A vs B: promotion already scales well —
`promoteFinancialWorkspaceStageV7` moves rows with `INSERT INTO ... SELECT` inside
SQLite. **Staging** is the row-by-row JS part, and that is what the lock window is
actually made of. That is the number that decides it.

## Direction recorded, not queued

The user wants ordinary sync to be **invisible** — no screen, no flash — and debounced
until editing stops. The overlay fix is a step toward that, not the destination: the
maintenance panel still shows for ordinary sync, which is exactly what they asked to
stop seeing. The hard part is that the barrier has one `blocked` state shared by eleven
call sites, so separating "must block the user" from "should never surface" means
letting callers declare intent rather than inferring it.

## Still open

- Phase 10 Step 4 (isolated staging engine) — waiting on number set 2.
- Bug 1 fix — waiting on number set 1.
- `finance_data` still scheduled for Phase 13/19 removal; it cascades now, which is a
  stopgap.
- Supabase advisors deliberately not acted on until the benchmark exists.
