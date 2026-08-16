# MYFI — Current Acceptance & Execution Delta
## Canonical overlay date: 2026-08-16

This file is an **overlay**, not a replacement for the Frozen Master Plan.
It records facts newer than the 2026-08-15 source documents.

## Current repository reality known at handoff

Repository:
`https://github.com/husseinoday1/MYFI1`

Last remotely verified branch during the 2026-08-16 acceptance work:
`r04-p18-001-blocking-ux`

Last remotely verified HEAD:
`ef2f2c6bbe07c71f1e94dd8356338285d0b7abd8`

Commit:
`P04R1-004 / P18-005 complete R04.1 critical UX and build tooling`

Current local documentation-sync HEAD:
`b6ec78ab13fcbd5d3f89ef04198a6f6535aed3c1`

**Mandatory rule:** Codex/ChatGPT must re-read the actual local branch, HEAD and
working tree before any new code change. The SHA above is a takeover checkpoint,
not permission to reset a newer checkout.

## Financial-domain automated acceptance reached on 2026-08-16

Applied sequence:
- P04R1-A01/A02 financial-core acceptance checkpoint
- P04U2-001 domain/storage contract freeze
- P04U2-002 historical FX + feature-toggle financial truth enforcement
- P04U2-003 debt component + refund/reversal/sign fail-closed policy
- P18-001 blocking account/entry UX attempt
- P18-002 Settings Root / Home profile route recovery
- P18-003 user-controlled feature surface + direct notification settings
- P04R1-003 / P18-004 semantic financial history recovery
- P04R1-004 / P18-005 decision windows + controlled build tooling

At P04U2-003:
- financial-domain contract: `R04-U2-3`
- automated U-2 enforcement gap inventory: `0`
- SQLite schema: V7
- no intended financial-data rewrite

P18-001 through P18-005:
- full quality gate passed
- Android export verification passed
- controlled EAS build checks passed
- no schema change
- no intended financial-data rewrite

## Latest real-device acceptance result — supersedes older D-09…D-21 rows

Test basis: the above P18-001 through P18-005 checkpoints.

| ID | Latest result | Canonical interpretation |
|---|---|---|
| D-09 | PARTIAL / DEVICE PENDING | Home profile → Account direct routing and Settings Root routing were recovered in code, but final device acceptance is still pending. |
| D-10 | PASS_DEVICE | Login/Connect keyboard behavior accepted in the latest session. |
| D-16 | PARTIAL / DEVICE PENDING | Merge action icon semantics were corrected in code, but final device acceptance is still pending. |
| D-17 | PASS_DEVICE | Persistent financial input labels accepted in latest session. |
| D-18 | PASS_DEVICE | Picker/keyboard handoff accepted in latest session. |
| D-19 | FAIL_DEVICE | Arabic FX/BiDi presentation remains unreadable/unordered. `writingDirection: 'ltr'` alone is explicitly proven insufficient. |
| D-20 | PASS_DEVICE | Duplicate paid-this-month presentation accepted as fixed in latest session. |
| D-21 | NOT_REPORTED | Do not infer PASS from static/domain tests; final device result was not supplied. |

## Acceptance rule learned from device evidence

Static string presence is never enough to close a device-dependent behavior.

Examples:
- callback exists != navigation sequence is correct
- `writingDirection:'ltr'` exists != Arabic FX is visually readable
- a green quality gate != real-device acceptance
- a source-level label exists != the user can read/use it correctly

For a device-reported defect:
`device before-evidence → regression contract/test → fix → automated after-evidence → consolidated device acceptance`

## Immediate status rule

`01_CORE_AUTHORITY/MYFI_R04_1_ACCEPTANCE_RECOVERY_ADDENDUM.md` remains the active acceptance-recovery
overlay unless a newer committed project document explicitly supersedes it.

R04/R04.1 product acceptance must not be declared closed solely from automated evidence.

## Latest clarification overlay — 2026-08-16

- Feature visibility means the user can show or hide optional features; hiding is reversible and must not delete or suppress financial truth.
- Notifications & Reminders belongs as a direct Settings Root destination; notification content privacy remains under Security.
- When the wallet valuation rate or historical FX is already available, asking the user to re-enter the same destination amount is a UX duplication bug. The app should derive it as an editable suggestion and freeze the reviewed result only on confirm.

Before any next release/phase transition:
1. verify exact Git state;
2. reconcile this delta with `01_CORE_AUTHORITY/MYFI_RELEASE_GATE_STATUS_AR.md`;
3. update device evidence;
4. follow the Frozen Master Plan / active addendum gate order.
