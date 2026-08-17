# MYFI — P19.001–P19.011 Sync V2 Execution Evidence

## Evidence date
2026-08-17

## Purpose
This file records the implementation sequence, important failures, automated checks,
live Supabase migration state, and the evidence still missing before P19 closure.

## Starting P19 baseline
Historical P19 starting point:
- branch: `r04-p18-020-controlled-recovery-sync`
- HEAD: `ea4c8d48a4417956726bffe14be1d95f5eaaa708`
- SQLite schema: V7
- Phase 9: OPEN
- Phase 10: BLOCKED

## Applied repository patches

| Patch | Result | HEAD / status | Material result |
|---|---|---|---|
| P19-001 | PASS | `3edc38b3670a2595493567f681859f180cef576f` | Durable local active-ledger identity; native SQLite KV primary |
| P19-002 | PASS | `94ceb4a027d05118fe05a9ddaf302b511538adb2` | Revision/paging conflict fail-closed client behavior |
| P19-003 | PASS | `4f4fa06fd9241d6696a69b16efc5beae368b89a0` | V1 RPC ACK hardening; same mutation_id/different payload conflict |
| P19-004 | PASS after assertion-runner corrections | `432bb1e0e5cd5a8edce8a0caae0e048a90617890` | SQLite V7→V8; immutable ledger_id, restore_epoch, V2 shadow tables |
| P19-005 | PASS | `a52d8fc66d2b318c36a7b87aa379c3455e2989af` | Cloud Sync V2 shadow protocol and strict CAS design |
| P19-006 | PASS | `79800b9c21b53cf6a87adcaa77bfa79ccebf82cd` | Atomic local dual-write into V2 shadow outbox |
| P19-007 | PASS after first contract failure | `ed928e1f55e809c1bf129341c1affb2d273612f7` | Signed-in destructive reset/restore temporary fail-closed interlock |
| P19-008 | PASS | `275498ae2ed6b04989efd889ce73b8b030669044` | Crash-safe restore epoch handshake |
| P19-009 | PASS | `f567a2c66ca94cbd24b342647068d68ce969cdea` | Inactive V2 sync client |
| P19-010 | PASS | `ef96bead99187c3c5f2007047956f9624e59c53e` | Verified V2 bootstrap protocol |
| P19-011 | IN PROGRESS | no commit yet at this evidence point | Controlled activation after read-back + shadow validation |

## Important failures that changed the implementation

### P19-004 package/test corrections
Early P19-004 runners exposed test-contract defects around matching V1 outbox insert
statements. The final R3 assertion correctly matched both ordinary and
`INSERT OR IGNORE` outbox writes while excluding V8 migration backfill references.
No destructive Git or database recovery was used.

### P19-007 first failure
Observed:
`reset interlock must run before visible/local financial state is cleared`

Meaning:
the test correctly demanded that the signed-in destructive-operation interlock execute
before any visible/local financial clear.

Result:
P19-007 was corrected and later passed at
`ed928e1f55e809c1bf129341c1affb2d273612f7`.

### P19-011 original contract failure
Observed:
the static contract expected an explicit negative branch equivalent to:
`if (!activationFinancialSync.ok) ... financialV2Active = false`

The implementation used semantically equivalent positive if/else logic.
No commit was created. The recovery path preserved the dirty worktree and did not reset it.

Design improvement adopted instead of only weakening the assertion:
- cloud bootstrap read-back;
- row SHA-256 verification;
- manifest SHA-256 verification;
- V2 shadow quiescence requirement;
- atomic activation evidence;
- no automatic post-activation V1 fallback.

### P19-011R1 P19-010 regression failure
Observed:
`P19-010 must remain inactive and must not wire bootstrap into normal sync yet`

Root cause:
P19-010's historical phase contract intentionally required bootstrap to remain inactive.
P19-011 is the later activation phase, so keeping that assertion globally true would make
the historical test prevent the planned next phase forever.

Resolution in P19-011R2:
P19-010 remains strict when P19-011 is absent. When P19-011 exists, the contract evolves
to require verified controlled activation instead of requiring permanent inactivity.

## Automated checks executed throughout P19

Successful patch runners have repeatedly used the following gates before commit/push:
- exact branch and HEAD verification;
- clean or explicitly validated recovery worktree;
- Node/NPM/package baseline checks;
- SQLite schema/version checks;
- targeted patch contract tests;
- financial ledger runtime regression tests where applicable;
- sync paging/revision/V2 runtime tests where applicable;
- `npm run test:gate`;
- `npm run verify:android`;
- `git diff --check`;
- exact intended-file staging;
- `git diff --cached --check`;
- exact commit-message verification;
- push verification.

P19-011R1 reached and passed before its P19-010 regression failure:
- P19-011R1 static activation contract;
- P19-011R1 bootstrap read-back runtime test.

The P19-010 historical regression then failed and stopped the runner before staging/commit.

## Live Supabase migration verification

Verified live on project `qihahfufuupgivnjzmfe` on 2026-08-17:

- `20260817160852 financial_mutation_v1_ack_hardening`
- `20260817165612 financial_mutation_sync_v2_shadow`
- `20260817165639 financial_restore_epoch_v2`
- `20260817171911 financial_bootstrap_v2`

Fresh live row-count check after those migrations:
- `financial_mutations_v1 = 557`
- `financial_mutations_v2 = 0`
- `financial_ledgers_v2 = 0`
- `financial_bootstrap_sessions_v2 = 0`
- `financial_bootstrap_rows_v2 = 0`

Interpretation:
the V2/restore/bootstrap DDL is live, but no real ledger had been bootstrapped or activated
at the time of this evidence snapshot. Existing V1 mutation count remained 557.

## Financial / schema impact through P19-010
- financial values changed by these patches: NO
- existing transaction/posting/entity values rewritten: NO
- SQLite schema change: YES only at P19-004, V7→V8
- current SQLite schema version: 8
- SecureStore financial-data reset: NO
- destructive user-data reset used to make tests pass: NO

## Device evidence status
Earlier R04.1/P18 device acceptance exists, but it does NOT certify the new P19 V2 activation path.

P19 V2 real-device acceptance is still required and intentionally deferred until the
repository patch chain is ready.

Required device scenarios include at minimum:
- signed-in online baseline;
- signed-in offline reopen with local ledger still visible;
- reconnect and Sync without ledger disappearance;
- logout/re-login ledger identity preservation;
- disposable restore epoch exercise;
- destructive reset/restore interlock verification;
- no V1 fallback after durable V2 activation.

## Current gate
At this evidence point:
- P19-011: IN PROGRESS
- Phase 9: OPEN
- Phase 10: BLOCKED
- Production readiness: NOT YET CLOSED by P19 automated evidence alone
