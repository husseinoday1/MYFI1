# MYFI — Navigation and Information Architecture

**Status:** CANONICAL · **Consolidated:** 2026-08-26 (extracted from
`03_MYFI_DESIGN_SYSTEM_CANONICAL.md` §2 into its own document, per the
Master Blueprint rebuild, to separate IA authority from component/
interaction authority)
**Basis:** `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md` §4,
`14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md` (REF-04's on-canvas
navigation legend), direct code evidence at HEAD
`d2ed3ae03c137d818040dfe77c665c516b8440b7`.

## 1. Primary navigation — LOCKED

Exactly four primary tabs: **Home · My Money · Follow-ups · More.**

Confirmed current-vs-target gap: the live app has 5 primary tabs today
(`App.js:54-60`, `BASE_TABS`: `home`, `history`, `trackers`, `reports`,
`settings`). History, Reports, and Settings must each move off the primary
bar. This is a reorganization task — most of the underlying screens and
logic already exist (see `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`).

## 2. Navigation rules (global, confirmed by REF-04's on-canvas legend)

The approved My Money reference states this almost verbatim as a design
rule, not just a local note — it is global doctrine:

- **View something → full Page.**
- **Simple add action → Bottom Sheet.**
- **Complex, multi-step action → full-screen flow** (e.g. statement import).
- Multiple entry points may open the **same** secondary screen — never
  duplicate business logic per entry point. Already correctly implemented
  for Add: one `AddTransModal` fed by multiple `openAddExp`/`openAddInc`/etc.
  handlers (`App.js:785-820`).

## 3. Destination map

| Destination | Type | Reached from | Owns |
|---|---|---|---|
| **Home** | Primary tab | Bottom nav | Daily status + quick action |
| **My Money** | Primary tab | Bottom nav | Wallets & Accounts, Transactions & History, Plan & Budget, Reports & Analytics (4 gateways) |
| **Follow-ups** | Primary tab | Bottom nav | Debts, Receivables, Commitments, Bills, Installments, Subscriptions, Goals, Savings, due items, Payment History |
| **More** | Primary tab | Bottom nav | My Shortcuts, My Tools, Data & Files, Benefits, MYFI & Help, Settings |
| History | Secondary | My Money → Transactions & History (also reachable from Home's recent-transactions "View all") | Full transaction ledger, filters, search |
| Reports | Secondary (gateway) | My Money → Reports & Analytics | Full reporting/analytics experience (still a full destination once opened — not reduced to a summary) |
| Settings | Secondary | More → Settings | 5-section preference surface (§5) |
| Archive | Secondary | **More → My Tools → Archive** (2026-08-26 ruling; not Home, not a My Money gateway) | Archived/closed trackers and years |

## 4. Add Method (global) — LOCKED

**Location:** More → My Tools → Customize MYFI → Add Method.
**Modes:** Quick Add **or** side `+` button, mutually exclusive.
**Scope:** the one global setting applies to both Home and Follow-ups;
actions stay contextual (Home: Expense/Income/Transfer/Smart; Follow-ups:
Debt/Receivable/Commitment/Goal).
**Code status:** already implemented as `cfg.entryMode`
(`'quick'`/`'classic'`, `App.js:837`, `HomeScreen.js:1161`,
`TrackersLabScreen.js:726`) and already applies to both destinations in
code — this is a relocation into the target IA, not new logic.
**Color note (corrected 2026-08-26):** the side `+` control is not
canonically purple; it belongs to the MYFI olive/green brand system.

## 5. Settings root — LOCKED

Exactly 5 sections, no duplicate Account & Sync row:

1. **Account & Sync** (top card, itself the entry point — identity, sync
   status, verification, account actions; never an account-type selector)
2. **Appearance & Language**
3. **Financial Preferences** (Country, Base Currency, Default Wallet —
   2026-08-26 ruling; **not** under Appearance & Language)
4. **Notifications & Reminders**
5. **Privacy & Security**

**Explicitly excluded** absent a fresh Product Owner requirement:
user-selectable accent color, payment-method/card/bank management, VAT,
rounding. All three were shown in an approved-reference mockup and rejected
for the current target — see `14_MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`,
REF-07.

## 6. Header pattern

Confirmed by REF-01/04/05/06/07: profile icon + centered/leading title +
bell icon — **except** Settings, which uses a search icon instead of the
profile icon (no duplicate profile access needed since Account & Sync is
the first row). **Settings search itself is an implementation/Expo
validation detail, not a hard requirement** — if Settings stays small and
clear, search may be omitted without reopening this document.

## 7. Onboarding flow — LOCKED (revised 2026-08-28)

1. Welcome with an explicit AR/EN language choice directly beneath the welcome
copy → 2–4. Three short personalization questions → 5. Essentials (country,
currency, appearance, first-wallet name) and start. Language changes the
onboarding copy and RTL/LTR direction immediately, then is stored as the
app-wide manual language preference.

The three questions cover usage context, first financial goal, and current
money organization. The goal question allows one or more selections because
its choices are complementary; the other two remain single-answer. They tune supported module
visibility; freelancer or personal-and-work answers derive the existing mixed
financial scope without rendering a rigid account-type selector or inventing
capabilities.
There is no Skip path: each question requires one answer and Back remains
available. Privacy is a concise notice on Essentials, not a separate blocking
step. No opening-balance requirement; permissions are requested
contextually per-feature; existing users get a short "What Changed" flow
instead of the full sequence. REF-02/03/03B/03D/03C remain visual-content
references; REF-03E's separate completion screen is superseded by the
combined Privacy-and-start ending.

## 8. Rationale for the IA change

The prior 5-tab structure surfaced History, Reports, and Settings as
equal-weight destinations to Home — none of which answer "what should I do
right now" the way Home/My Money/Follow-ups/More do. Grouping History and
Reports under My Money, and Settings/Archive/Data under More, reduces the
primary bar to destinations that are genuinely daily-use, while everything
else remains one tap away rather than competing for bottom-bar space.
