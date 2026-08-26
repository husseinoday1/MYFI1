# MYFI — P19-012 Empty-Shell Cloud Recovery Evidence

## Date
2026-08-17

## Trigger
A real account was signed out, local financial data was deleted from the installed
older build, and the account was signed in again. The UI showed a local zero balance
and no restored account data.

## Cloud evidence before P19-012
Direct production Supabase verification showed that the account cloud data still existed:

- 80 transactions
- 7 wallets
- 5 debts
- 4 goals
- 14 commitments
- 8 categories
- user_data revision 300
- 282 V1 mutation rows
- 0 V2 ledger rows
- 0 V2 bootstrap sessions

Conclusion: the observed zero state was local. It was not proof that cloud financial data
had been deleted.

## Root cause
After V7 cutover, generic `user_data` financial snapshot pull is intentionally forbidden.
P19-011 then attempted V2 bootstrap/activation before the compatibility snapshot fetch.
On a truly empty post-cutover ledger with pre-V2 cloud history, that ordering could register
and bootstrap the empty local ledger instead of first recovering the existing cloud snapshot.

P19-012 inserts a narrowly scoped verified recovery gate BEFORE P19-011 activation.

## Recovery contract
Automatic cloud-to-local recovery is allowed only when:
- the user is authenticated;
- the workspace is operational SQLite V7/V8;
- the UI looks like an empty shell;
- SQLite proves zero transactions/postings/links/non-workspace entities;
- there are no non-workspace pending V1/V2 mutations;
- no V2 bootstrap/import state is in progress;
- V2 is not already activated;
- no restore intent is active.

For a pre-V2 account, the server returns the exact legacy snapshot text plus SHA-256.
The client recomputes the hash before parsing, restores through the existing staged
operational-cutover mechanism, runs SQLite invariant proof, then re-reads SQLite and
requires semantic round-trip equality.

A finalized V2 cloud ledger is NOT reinterpreted through `user_data`. P19-012 blocks with
`financial_v2_bootstrap_import_required`; verified direct bootstrap import remains a
separate subsequent protocol patch.

After a successful legacy recovery, the same sync attempt must proceed toward V2.
It must not fall back to V1 if the immediate V2 activation attempt fails.

## Build failure evidence
The attempted EAS Internal APK build did not fail because of MYFI source code.
EAS reported that the account had exhausted its Android builds for the Free plan
and the quota would reset later.

P19-012 therefore adds a local Gradle internal APK path:
- `npm run build:apk:local`
- no EAS cloud build quota is consumed;
- output is internal-test only;
- production signing is not certified by this path.

The installer first attempts `adb install -r`. If Android reports a signing mismatch,
the script stops and performs NO uninstall and NO app-data clear automatically.

## Gate status
P19-012 code/tests/build path must pass before live deployment of its read-only recovery RPC.
Real-device recovery remains required after deployment.

Phase 9 remains OPEN.

## P19-012R1 evidence-contract correction

The observed build failure was caused by the **EAS Free-plan Android build quota**
being exhausted for the current month. This was an account/service quota condition,
not an Android compile/source-code failure.

The P19-012 repository contract therefore validates the meaning of this evidence
instead of depending on one exact punctuation/capitalization spelling.
