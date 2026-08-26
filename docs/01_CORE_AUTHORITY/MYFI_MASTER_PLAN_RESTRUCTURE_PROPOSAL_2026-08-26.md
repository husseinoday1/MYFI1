# MYFI Master Plan Restructure Proposal — 2026-08-26

**Status:** PROPOSAL, awaiting user sign-off. Does not replace
`MYFI_MASTER_PLAN_FROZEN.md` until approved — per
`docs/00_MYFI_CANONICAL_AUTHORITY.md`, phase sequencing changes only via an
approved proposal. Once approved, this becomes the new post-Phase-10 section
of the frozen plan (Phases 0-10 are untouched — already executed, closed).

**Why this exists:** the 2026-08-24 addendum opened Product Design/Security
as an undated "parallel workstream" rather than giving it real phase
numbers, and five new product-direction decisions (2026-08-26, user
approvals below) don't have a home in the current phase list at all. This
proposal gives the whole post-Phase-10 arc one coherent, explicit structure
instead of a frozen plan plus a growing pile of side-addenda.

## What does NOT change
- Phases 0-10: untouched, already executed and closed.
- All financial invariants (`MYFI_FINANCIAL_CONTRACT.md`), migration policy,
  data ownership rules: untouched. Every new feature below is evaluated
  against them explicitly, not assumed compatible.
- Phases 11, 12, 13, 15: unchanged from the frozen plan (archive
  consolidation, semantic backup round-trip, compatibility retirement,
  performance/reliability). No new content merges into these.

## Restructured post-Phase-10 phase map

### Phase 14 — Sync Hardening (14-A unchanged) + Household Sharing groundwork (14-B, new, future)
- **14-A (unchanged):** notification/account switch cleanup, two-device
  mutation convergence, personal/business workspace separation, no
  cross-account outbox/cursor — exactly as already in the frozen plan.
- **14-B (new, future, not scheduled):** household/family shared-ledger
  access (multiple real people, one ledger, presumably role-scoped). User
  decision 2026-08-26: keep this bundled with 14-A's existing "workspace
  separation" concept rather than a standalone phase, since it's the same
  underlying problem (who else can see/touch this ledger) — but explicitly
  **not scheduled now**, stays a future-plans item until 14-A's own scope is
  settled. Needs its own auth/permissions design before any scoping.

### Phase 16 — Android Production + Security/Privacy (16-A unchanged) + Bank-Sync Readiness (16-B, new, architecture-only)
- **16-A (unchanged):** notification privacy, shared-room least-data
  loading, no project/personal leakage, diagnostics contain no
  balances/history.
- **16-B (new):** **architecture readiness for future bank-account
  auto-sync — explicitly NOT implementation.** User decision 2026-08-26:
  agreed in principle, but Iraq's regulatory environment does not currently
  allow this, while other countries may; build the *seam* now so it can be
  turned on per-country later without a rebuild, actual connections stay
  out of scope until legal clearance exists for a given country (Iraq
  included, pending any exception).
  - Reconciles with the "local-first principles" non-negotiable constraint
    (see `MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_2026-08-25.md` §31):
    local-first means **on-device SQLite is the store of truth**, not that
    every entry must be hand-typed. A future bank-sync import writing into
    the same local ledger via the same commit path as manual entry does not
    violate this — it's a new *entry source*, not a new source of truth.
  - Concrete readiness scope (design/schema only, no vendor integration):
    add an entry-source discriminator to the transaction shape (already has
    `smartSource` for capture-method tracking per `docs/SMART_CAPTURE.md` —
    extend the same concept rather than inventing a parallel field), and an
    abstraction boundary in the import path so a future bank-sync provider
    plugs into the *existing* local-commit flow instead of a new one.
  - Explicit non-goals for 16-B: no bank API vendor selection, no OAuth/Open
    Banking integration, no per-country legal research deliverable — this
    phase produces a design seam only, each real country rollout is its own
    future-gated proposal.

### Phase 17 — Product Correctness, restructured into five tracks
Original scope (recurring frequencies, missed-occurrence policy, expected-
income forecast, seasonal budgets, accepted/rejected budget learning, goal
target dates, split transactions, merchant/payee decision, external file
import policy, product claim scope) becomes **17-A**, unchanged. New tracks:

- **17-B — Contact-linked debts & multi-party settlement (approved, next
  in line for scoping).** Generalizes 17-A's existing open "merchant/payee
  decision" item: a debt/receivable gets an optional structured contact
  reference (name + phone) instead of free text only; multiple debts can
  share one contact; a settlement flow closes out one or more debts for
  that contact at once. Grounded in the current implementation (verified
  2026-08-26): debts live as JSON payload rows in `ledger_entities_v7`
  (`entity_type='debt'`), so this is a payload-shape change plus new UI, not
  a schema migration. Stays entirely in the Verification Floor (touches
  live financial code in `trackersSlice.js`) regardless of how small it
  looks. **New rule needed before scoping starts:** `MYFI_DATA_OWNERSHIP.md`
  currently has no rule for a third party's phone number (not the account
  owner's own) — add one before implementation, not after.
  SMS-sending to that contact is explicitly **out of scope** — no messaging
  infrastructure exists in the codebase today (verified: no `expo-sms`, no
  SMS/messaging vendor dependency); that would be its own future proposal
  with a vendor, cost, and consent model, not a line item here.
- **17-C — Budget prediction / spending suggestions from history
  (approved).** Presentation/analytics layer over existing budget and
  transaction data (`getBudgetRows`, `getBudgetSummary` and history already
  in `src/lib/budgets.js`/`wallets.js`) — no new financial write path, no
  new stored fields. Lowest risk of the three approved-now items.
- **17-D — Smart Capture improvement (approved, scope TBD).** The user
  referenced a prior agreement that Smart Capture (`docs/SMART_CAPTURE.md`)
  "needs a big improvement" — this proposal cannot specify what improvement
  without that detail; flagged here as an open 17-D slot so it has a home
  in the restructured plan, with the actual scope to be supplied before
  work starts.
- **17-E — AI financial assistant, natural-language Q&A over the user's
  data (approved for a paid tier; privacy approach still open).** User
  explicitly asked for "a middle-ground solution" on privacy — this
  proposal does not pick one; it registers the requirement and the decision
  that's still needed:
  - Option 1: fully on-device (small local model or rule-based query
    engine) — strongest privacy, weakest capability, no new phone-number-
    style external-data question at all.
  - Option 2: send a redacted/aggregated summary (no raw transaction text,
    no names) to an external LLM API per query, with explicit UI disclosure
    each time data leaves the device.
  - Option 3: opt-in per session — user explicitly turns on "AI Assistant"
    knowing summarized data leaves the device for that session only.
  This needs its own short design spike before scoping, not a default pick
  buried in a phase-list line item — recommend Planning & Audit runs that
  spike before 17-E gets a real execution package.

### Phase 18 — split into 18-A (executing now) and 18-B (original scope, deferred until 18-A closes)
Confirmed from the earlier 2026-08-26 sequencing decision
(`04_CURRENT_EVIDENCE/MYFI_SCREEN_MIGRATION_SEQUENCING_DECISION_2026-08-26.md`):
- **18-A — Visual Identity & Navigation Migration.** The design-system/
  navigation-restructure workstream, currently executing (Steps 1-3 of
  `docs/design/12_MYFI_DESIGN_MIGRATION_ROADMAP.md` done; Step 4
  Settings/Legacy consolidation blocked on Phases 11-13 closing first, per
  that same decision doc).
- **18-B — original UX/accessibility polish** (login keyboard avoidance,
  date-selector polish, locale number input, font-scaling/TalkBack, etc.) —
  unchanged from the frozen plan, executes after 18-A.

### Phases 19-21 — unchanged (code cleanup, RC acceptance, release)

## Sequencing summary (what actually blocks what)

```
Phase 11 → 12 → 13 ─┬─→ 18-A Step 4 (Settings/Legacy)
                     │
Phase 14-A → 15 → 16-A → 17-A/B/C/D → 18-B → 19 → 20 → 21
                     │
        14-B, 16-B, 17-E: future-plans slots, not scheduled,
        each needs its own scoping trigger before execution
```
18-A Steps 3/5-9 (everything except Step 4) do not depend on Phases 11-17
and continue in parallel, as already happening.

## Financial / migration / phase impact
- No SQLite schema migration required for 17-B (payload-shape change) or
  17-C (read-only analytics).
- 17-E, if it ever sends any user data externally, is a security/privacy-
  contract-level decision (`MYFI_SECURITY_THREAT_MODEL.md`, A3) — cannot be
  authorized by this proposal alone even after this proposal is approved;
  needs its own dedicated sign-off when the privacy option is chosen.
- 16-B is design-only in this proposal; zero schema/migration impact until
  a specific country's real integration gets its own future proposal.
- New rule needed: third-party contact PII (17-B) addition to
  `MYFI_DATA_OWNERSHIP.md` before 17-B implementation starts.

## Risk if not adopted
The five 2026-08-26 product decisions and the Design workstream continue
living as disconnected side-conversations with no phase home, the way the
2026-08-24 addendum already did once — each new session has to be told
about them individually instead of reading one coherent plan, and the real
sequencing dependency (17-B needs a data-ownership rule first; 18-A Step 4
needs Phases 11-13 first) stays implicit instead of gating anything.
