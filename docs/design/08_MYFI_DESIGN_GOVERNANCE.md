# MYFI — Design Governance

**Registered:** 2026-08-25 · **Status:** CANONICAL

This document defines how MYFI stays visually coherent after the current
audit closes — the process, not the content (content lives in the other six
`docs/design/*.md` files).

## 1. Source-of-truth hierarchy (binding on all future design work)

1. Actual current repository/runtime evidence.
2. Latest explicit Product Owner decision (text overrides an image artifact —
   see §2).
3. `docs/01_CORE_AUTHORITY/MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md`.
4. `docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`.
5. `docs/design/14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`.
6. Older MYFI design/product documents (`MYFI_UI_REDESIGN_SPEC_AR.md`, etc.).
7. Existing legacy UI behavior.
8. Competitor/reference patterns.
9. Claude/AI recommendations.

This mirrors — and does not replace — the repository-wide A0-A7 authority
order in `docs/00_MYFI_CANONICAL_AUTHORITY.md`; this section is the
design-specific instance of that same rule.

## 2. Textual decisions override image artifacts

An approved mockup can contain an accidental or obsolete element. When a
supplied image conflicts with an explicit textual Product Owner rule, the
text wins, and the conflict is recorded in the Visual Reference Register —
never silently promoted into a canonical token, component, or rule. Three
confirmed instances exist today (see `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`,
REF-01 and REF-07): a superseded bottom-nav labeling, a rejected
user-selectable accent-color picker, and an unconfirmed payment-methods/VAT
row.

## 3. Reuse before creation

Every new screen or component must answer, before a line of UI code is
written:

- Which tokens does it use (`04_MYFI_DESIGN_TOKEN_CATALOG.md`)?
- Which existing primitive(s) does it reuse (`03_MYFI_DESIGN_SYSTEM_CANONICAL.md`,
  `05_MYFI_COMPONENT_ARCHITECTURE.md`)?
- Which existing composite/domain component does it reuse?
- Does it introduce a genuinely new interaction pattern? If yes, why — what
  semantic role, interaction contract, state model, or accessibility need is
  not already covered?
- Should the new pattern become reusable, and does the Design System document
  need updating as a result?
- Does it preserve RTL, accessibility, Light/Dark parity, and financial
  semantics?

Do not abstract for abstraction's sake — three similar screens do not
automatically need a shared component; only build one when the semantic role,
interaction contract, state model, and visual behavior are genuinely shared
(this is the same rule the Blueprint states in §20 and §31, restated here as
the operative governance check).

## 4. Component approval rules

- A new primitive requires an entry added to `05_MYFI_COMPONENT_ARCHITECTURE.md`
  before or alongside its implementation — no primitive should exist in code
  without a corresponding inventory row.
- A new token requires an entry in `04_MYFI_DESIGN_TOKEN_CATALOG.md` with Light
  and Dark values before use in more than one screen.
- A new screen requires a row in `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`.

## 5. Visual-review checklist (apply to every design-affecting PR)

- [ ] Uses existing tokens; no new inline hex/fontSize/padding/radius literal
      introduced without a corresponding token catalog entry.
- [ ] Uses an existing primitive/composite where one applies; new
      abstractions justified per §3.
- [ ] RTL verified (Arabic layout, not just mirrored English).
- [ ] Light and Dark both verified, same structure.
- [ ] Financial amounts follow the sign+color+label rule — never color alone.
- [ ] No new destructive action added without using the `financial.danger`
      token and a `DecisionModal`-style confirmation.
- [ ] No accent-color picker, payment-method/card/bank management, VAT, or
      rounding-method setting introduced — all four are formally **REJECTED
      FOR CURRENT TARGET** (2026-08-26 ruling), not merely unapproved. A
      future reversal requires a fresh, explicit product requirement.
- [ ] No financial semantics, SQLite schema, migration, backup/restore, sync,
      or authentication behavior changed by what is nominally a design change.

## 6. New-pattern approval

A genuinely new interaction pattern (not covered by §3's "reuse" answer) is
proposed as: description → screens affected → why existing primitives don't
cover it → proposed token/component additions → RTL/accessibility/Light-Dark
plan. It becomes canonical only after being added to
`03_MYFI_DESIGN_SYSTEM_CANONICAL.md`.

## 7. RTL checklist

Text alignment, row/icon direction, chevron direction, mixed Arabic/English
runs, numeral formatting, date formatting, and chart label direction must
each be verified per screen using the existing `src/lib/layout.js` helpers
(`isRTL`, `textAlignFor`, `rowDirFor`, `writingDirectionFor`) — not
reimplemented locally.

## 8. Accessibility checklist

Contrast in both themes, minimum touch target size, non-color indicators for
financial direction (already the confirmed pattern via
`FinancialDirectionMark`), and screen-reader labels for icon-only controls
(e.g. the Quick Add circles).

## 9. Light/Dark checklist

Same component tree, same spacing, same hierarchy — only token values change.
Any PR that adds a `theme === 'dark'`-conditional *layout* branch (as opposed
to a color/token lookup) should be treated as a design-system violation and
flagged for review.

## 10. Design decision record template

For any future Product Owner decision affecting the Design System:

```
Date:
Decision:
Reason:
Evidence:
Documents updated:
Superseded/conflicting prior guidance (if any):
Financial/data impact: NONE (unless explicitly stated otherwise, with its own approval gate)
```

## 11. Diagnostic/internal UI governance

**Status: APPROVED DIRECTION (2026-08-26).** Any developer, benchmark,
diagnostic, restore-benchmark, startup-timing, recovery-gate, or test-data
surface must be gated by one consistent mechanism — not a mix of `__DEV__`
checks and build-time environment variables, which is the confirmed current
inconsistency between `SettingsScreen.js:1834-1848` (`__DEV__`-gated,
correct) and `SettingsScreen.js:1520-1531,1544-1557` (not consistently
gated). This direction is settled; the exact gating mechanism's technical
specification is owed to the Security track (`SECURITY-S6 — Production
Security Gate`), not to this design workstream, and must land before any
Production Security Gate sign-off. Nothing here is deleted or modified by
design/documentation work.

## 12. Financial/data safety (standing, not new)

No governance rule in this document authorizes, and no future design PR may
justify on design grounds, a change to: financial semantics, ledger rules,
balances, transaction/transfer meaning, historical FX, reconciliation,
SQLite schema, migrations, backup format, restore behavior, rollback,
synchronization semantics, or authentication semantics. Any design proposal
that appears to require one of these is labeled **ENGINEERING / PRODUCT
APPROVAL REQUIRED** and routed outside the design workstream.
