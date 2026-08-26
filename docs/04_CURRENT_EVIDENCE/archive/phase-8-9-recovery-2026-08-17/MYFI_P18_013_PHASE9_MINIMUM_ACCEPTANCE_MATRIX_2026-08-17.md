# MYFI P18-013 — Phase 9 Minimum Acceptance Matrix

**Date:** 2026-08-17
**Baseline HEAD:** `486731ea3b6e980a4eaa5540f953cc831e228e3e`
**Phase 8 device state:** PASS
**R04.1:** CLOSED
**Purpose:** close only the minimum Account Lifecycle Gate required before Phase 10.

The Frozen Master Plan defines Phase 9 as an independent data-loss prevention gate. This matrix preserves its Scenario A–H structure.

## Acceptance Rules

1. Never clear/reset the user's current financial database merely to create a clean test.
2. Never delete the user's real cloud account as a test.
3. Never invoke Delete Local Data against the user's real financial ledger for acceptance.
4. Scenarios G/H require a disposable test account/dataset.
5. Scenario E requires a genuinely isolated second device/session.
6. Advanced sync conflicts/retry/stale-device protocol hardening remains Phase 14; Phase 9 still requires correct second-device account/ledger bootstrap and convergence.
7. No scenario may mutate historical currency meaning, transaction IDs, balances, wallet ownership, or ledger/account mapping.

## Scenario A — Local-only

Frozen requirement:
- install;
- skip account;
- create wallet/data;
- close/reopen;
- data remains.

**Status:** PENDING REAL-DEVICE ACCEPTANCE
**Environment:** disposable/fresh isolated workspace; do not clear the current real ledger.
**Pass:** wallet/data survive close/reopen with no account.

## Scenario B — Guest → Signup

Frozen requirement:
- Guest IQD;
- Guest USD wallet;
- financial history;
- create account;
- attach ledger;
- no currency mutation;
- no ID corruption;
- no balance change.

**Status:** PENDING REAL-DEVICE ACCEPTANCE
**Environment:** disposable Guest + disposable account.
**Pass:** native currencies, IDs, balances, and history semantics are identical before/after attachment.

## Scenario C — Logout

Frozen requirement:
- cloud session removed/invalidated;
- ledger not deleted.

**Automated contract:** PRESENT / PASS before this matrix.
**Status:** PENDING DEVICE CONFIRMATION
**Pass:** logout disconnects cloud session while local ledger remains accessible and unchanged.

## Scenario D — Re-login

Frozen requirement:
- ledger remains accessible;
- sync resumes safely.

**Automated contract:** PRESENT / PASS before this matrix.
**Status:** PENDING DEVICE CONFIRMATION
**Pass:** same account reuses the same local ledger and does not duplicate/reinterpret data.

## Scenario E — Second device

Frozen requirement:
- login;
- bootstrap cloud ledger;
- verify convergence.

**Status:** PENDING — PHYSICAL SECOND DEVICE / ISOLATED SESSION REQUIRED
**Minimum Phase 9 pass:** correct account → ledger bootstrap, correct currencies/IDs/balances, and convergence without cross-account contamination.
**Deferred to Phase 14:** advanced conflict race testing, stale-device protocol, retry/backoff stress, mutation ordering hardening.

## Scenario F — Account Switch

Frozen requirement:
Account A / Account B must not produce:
- cross-account wallets;
- cross-account outbox;
- mixed sync cursor;
- wrong ledger opened.

**Automated contract:** PRESENT / PASS before this matrix.
**Status:** PENDING DEVICE CONFIRMATION
**Environment:** two testable accounts; do not delete either.
**Pass:** each account opens only its mapped ledger/context.

## Scenario G — Delete Account

Frozen requirement before cloud delete:
- local ledger secured;
- ledger becomes local-only/unlinked;
- cloud identity deleted;
- user can continue.

**Status:** PENDING — DISPOSABLE ACCOUNT ONLY
**Safety:** NEVER run this acceptance against the user's real account.
**Pass:** disposable cloud identity is removed while the local disposable ledger remains usable and unlinked.

## Scenario H — Delete Local Data

Frozen requirement:
- separate operation;
- warning;
- re-auth/confirmation when required;
- clear consequences;
- never triggered by Logout/Delete Account.

**Status:** PENDING — ISOLATED/DISPOSABLE DATASET ONLY
**Safety:** NEVER run this acceptance against the user's real ledger.
**Pass:** deletion occurs only after the explicit destructive flow; logout/delete-account cannot trigger it.

## Current Gate Decision

- Phase 6: implementation/automated evidence present; formal reconciliation pending.
- Phase 7: implementation/automated evidence present; formal reconciliation pending.
- Phase 8: **REAL-DEVICE OPERATIONAL STATE PASS**.
- Phase 9: **OPEN — device/environment acceptance A–H pending as classified above**.
- Phase 10: **BLOCKED BY PHASE 9 MINIMUM ACCEPTANCE**.

## Next Exact Session

Start with the non-destructive current-device acceptance that does not require clearing financial data:

**Scenario C + D: Logout → verify local ledger remains → re-login same account → verify same ledger/data remains.**

Record only:
- PASS/FAIL;
- whether balances/history stayed unchanged;
- whether the same account reopened the same ledger;
- whether sync resumed without duplication.

Do not perform Scenarios G/H until a disposable account/dataset is prepared.
