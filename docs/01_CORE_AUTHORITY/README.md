# `01_CORE_AUTHORITY/` — what belongs here and why (added 2026-08-26)

This folder was growing two genuinely different kinds of document under one
label, which blurred what "core authority" means. This README splits them
explicitly. No files were moved — moving them would have required updating
7+ cross-references in `docs/design/` alone, several written by a session
(Implementation 3) actively mid-task on this shared checkout; the risk of
breaking a live reference outweighed the tidiness of a physical move.
Classification below is the actual fix.

## Category 1 — Engineering authority (A1/A2 in `00_MYFI_CANONICAL_AUTHORITY.md`)
Binding on execution: phase order, financial/security policy overlays.
- `MYFI_MASTER_PLAN_FROZEN.md` — **A1**, the frozen phase roadmap itself.
- `MYFI_MULTI_CURRENCY_FINANCIAL_POLICY_ADDENDUM.md` — **A2**, financial policy overlay.
- `MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md` — **A2**, sync overlay.
- `MYFI_R04_1_ACCEPTANCE_RECOVERY_ADDENDUM.md` — **A2**, recovery-gate overlay.
- `MYFI_PRODUCT_SECURITY_DATA_PROTECTION_ADDENDUM_2026-08-24.md` — **A2**, opened the post-Phase-10 Product/Security workstreams; this one is a genuine planning overlay, not a raw input.
- `MYFI_RELEASE_GATE_STATUS_AR.md` / `MYFI_USER_NOTES_RECONCILIATION_CANONICAL_2026-08-16.md` — **A4**-adjacent status/reconciliation records kept here because they gate release, not because they're inputs.

## Category 2 — Historical raw Product Owner input (reference only, no execution authority by itself)
Reproduced verbatim so it's repo-tracked instead of living only in a chat
transcript or a Desktop PDF. Read for provenance/context; the *authoritative,
current* version of what it describes lives elsewhere once processed.
- `MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md` — the original
  Product Owner design blueprint as pasted. **Current canonical version:**
  `docs/design/01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` (see that file's
  own supersession note). This file stays for historical record per
  `docs/90_HISTORICAL_SUPERSEDED_INDEX.md`'s cross-link.

**Rule going forward:** a new raw, verbatim-pasted Product Owner document
lands in Category 2 and gets a one-line entry here on arrival. It only earns
Category 1 status once Planning & Audit has processed it into an actual
phase/policy overlay — being pasted into this folder is not by itself
engineering authority (see `00_MYFI_CANONICAL_AUTHORITY.md` A6 note on
`docs/design/` for the same principle applied to the design canon).
