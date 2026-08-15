# MYFI R04.1 — Acceptance Recovery Addendum

Status: ACTIVE
Base: `33cce360a118c54daa88332374da07731e5a0641`
Branch: `r04-1-acceptance-recovery`

This addendum does not rewrite the Frozen Master Plan. It records device-proven
R04 acceptance failures and assigns each item one primary implementation owner.

## Release rule

R04 automated evidence remains valid as baseline evidence only. R04 product
acceptance is NOT closed. R05 must not begin until R04.1 passes its combined
automated gate and one real-device acceptance session.

## Internal patch ownership

### P04R1-001 — Account / Ledger Lifecycle Recovery

- Logout ends the local cloud session only.
- Logout does not delete, hide, replace, or silently remount another local ledger.
- The active local ledger has an explicit optional cloud-account link.
- Signed-out use continues on the same active ledger.
- Same-account re-login reuses that ledger and must not create a Guest merge.
- Account switching selects an isolated ledger for the target account.
- Guest→Account transfer is offered only from a true unlinked Guest ledger.
- Name/photo/local identity remain available after logout.
- `Account & Security` opens the actual account page, not generic Settings.
- Delete Account and Delete Local Data remain independent operations.

### P04R1-002 — Multi-Currency + Wallet UX

- Rebuild multi-currency entry/transfer presentation in MYFI design language.
- Explicit source/destination currencies and amounts.
- Explicit historical FX direction, date and source.
- Clear base-currency valuation without rewriting history.
- Wallet create/edit UX: currency, opening balance, scope and current valuation.
- No false single-total aggregation across unrelated native currencies.

### P04R1-003 — Semantic Financial History

- Opening Balance is a visible independent ledger movement, not Income/Expense.
- Balance Reconciliation first explains/resolves differences; only unresolved
  deltas become a Balance Adjustment.
- Generated transaction titles expose semantic type and linked entity.
- Expense↔Income edits update MYFI-generated titles automatically.
- User-written titles are preserved.
- Debt/receivable/goal/commitment payment history and details name the linked entity.

### P04R1-004 — Critical UX Consistency + Build Tooling + Combined Gate

- Critical icon/action semantics.
- Critical financial/account windows use the MYFI design system.
- Permanent controlled EAS CLI build-script fix.
- Combined R04.1 automated gate.
- One final physical-device acceptance session.

## Deferred to owning phases

- Smart Entry full reconstruction: Phase 17.
- Adaptive Smart Budget logic + explainability + MYFI-native visual redesign: Phase 17.
- Multi-device sync is N-device architecture; two devices are only the minimum
  physical conflict gate: Phase 14.
- Full accessibility/global UX audit: Phase 18.
- Performance/reliability: Phase 15.
- Production security/privacy: Phase 16.
- Cleanup only: Phase 19.
- Release Candidate acceptance: Phase 20.

## Acceptance evidence rule

Every device-reported failure follows:

`device before-evidence → regression contract/test → fix → automated after-evidence → final device acceptance`

Static string presence alone is never sufficient to close a device-dependent behavior.
