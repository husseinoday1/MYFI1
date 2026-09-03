# MYFI My Money and Reports refinement — 2026-08-28

## Current state

The prior My Money hub promoted Wallets & Accounts as the first gateway and
offered a transfer shortcut. Reports opened with a large period/share command
bar followed by a dense expandable details list.

## Visual problem

The wallet gateway did not have a clear job in the current user workflow and
made the hub feel like a feature inventory. The Reports screen did not match
the approved reference's clear reading order: title, period, report type,
summary, then top spending.

## Product Owner decision

Wallet management is contextual/secondary for the current product phase. My
Money now leads with the three actions users can use immediately: review
transactions, plan the budget, and understand reports. Existing wallet data
and screens remain intact; this is a navigation and presentation decision,
not a removal of financial capability.

Reports now use title → compact period control → direct tabs → overview
summary and top categories. Existing report details, comparison, and related
financial views remain available behind an explicit "More details" control
or the relevant tab.

## User benefit

The five-second reading order is clear and the primary choices are usable
without passing through a wallet-management concept that is not needed for
normal entry, planning, or review.

## Reference reconciliation

REF-04 historically depicts Wallets & Accounts as a first gateway. The
current explicit Product Owner decision supersedes that part of the older
reference for this phase. The reference's vertical drill-through rhythm,
named destination links, report title/tab/summary hierarchy, and top-category
reading order are retained.

## Safety impact

- Financial data changed: **NO**
- SQLite schema changed: **NO**
- Migration required: **NO**
- SecureStore changed: **NO**
- Existing-user financial data preserved: **YES**

## Verification

- Static quality gate: `72 passed / 0 failed / 11 skipped`.
- Expo web semantic review: My Money shows the three intended gateways and
  three shortcuts; Reports shows its title, period control, and tabs.
- Android device acceptance: pending.
