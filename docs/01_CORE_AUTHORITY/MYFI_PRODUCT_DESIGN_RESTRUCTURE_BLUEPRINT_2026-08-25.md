# MYFI — Product Design Restructure Blueprint (AI Handoff)

**Registered:** 2026-08-25
**Source:** User-supplied blueprint (`MYFI_PRODUCT_DESIGN_RESTRUCTURE_BLUEPRINT_AI_HANDOFF.pdf`), pasted in full into the MYFI Planning & Audit conversation.
**Status:** Approved Product Owner planning/design direction. **Analysis and documentation only — does not by itself authorize any implementation, UI migration, or code change.**
**Registered by:** MYFI Planning & Audit, verified against branch `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`, HEAD `d2ed3ae03c137d818040dfe77c665c516b8440b7`.

This document is reproduced verbatim from the user's supplied handoff so it is
repo-tracked and not dependent on a Desktop PDF or a chat transcript. See
`docs/00_MYFI_CANONICAL_AUTHORITY.md` for how this registers against the
authority order, and `docs/04_CURRENT_EVIDENCE/MYFI_PRODUCT_DESIGN_BLUEPRINT_RECONCILIATION_2026-08-25.md`
for the Planning & Audit reconciliation pass (confirmed conflicts, baseline, handoff).

---

# MYFI — CANONICAL VISUAL IDENTITY, DESIGN SYSTEM & FULL PRODUCT UI AUDIT

You are working inside the MYFI repository in Claude Code.

This is a DESIGN / PRODUCT / ARCHITECTURE DOCUMENTATION PHASE.

Your job is to perform a complete visual, interaction, and design-system audit of the CURRENT MYFI application and all relevant design documentation, then establish one canonical MYFI visual identity and Design System that all current and future screens must follow.

IMPORTANT:

DO NOT implement the redesigned UI during this task.

DO NOT modify production financial behavior.

DO NOT modify ledger logic, database schemas, financial semantics, backup/restore contracts, synchronization contracts, migrations, balances, transactions, historical FX behavior, or existing financial data.

This task is:

REPOSITORY INSPECTION
→ DESIGN AUDIT
→ VISUAL IDENTITY DEFINITION
→ DESIGN SYSTEM DEFINITION
→ SCREEN CONSISTENCY REVIEW
→ DOCUMENTATION
→ MIGRATION PLANNING
→ STOP

No production UI migration is authorized yet.

==================================================
0. REPOSITORY SAFETY AND BASELINE
==================================================

Before any work:

1. Identify and report:
   - repository
   - current branch
   - exact HEAD commit
   - git status
   - Node version
   - npm version
   - Expo SDK
   - React Native version
   - current SQLite/schema version if relevant to design dependencies
   - current navigation structure

2. DO NOT work directly on main.

3. If documentation files must be created during this task, create a dedicated documentation/design branch based on the exact current approved baseline.

Suggested branch name:

design/canonical-visual-system-audit

4. This task may CREATE documentation files only.

5. Do not edit production application code during this task.

6. Do not delete or rewrite legacy documentation yet.

Legacy documentation must remain available as evidence until the next approved consolidation phase.

==================================================
1. SOURCE-OF-TRUTH HIERARCHY
==================================================

Use this hierarchy whenever evidence conflicts:

1. Actual current MYFI repository/runtime evidence for CURRENT implementation state.
2. Latest explicitly approved Product Owner decisions.
3. Latest supplied MYFI Product Design Restructure Blueprint.
4. Older MYFI design/product documents.
5. Existing legacy UI behavior.
6. Competitor/reference evidence.
7. Claude recommendations.

A newer approved Product Owner decision may intentionally supersede older code and older documentation.

Never allow legacy code or older documentation to silently redefine the approved target product.

For each material conflict document:

- Current implementation
- Current documentation
- Latest approved target
- Conflict
- Recommended resolution
- Design impact
- Architecture impact
- Financial-data impact
- Product Owner decision required? Yes/No

==================================================
2. CURRENT APPROVED PRODUCT STRUCTURE
==================================================

The current approved primary bottom navigation is:

Home / الرئيسية
My Money / أموالي
Follow-ups / المتابعات
More / المزيد

This supersedes older concepts based on three primary destinations.

History is NOT a permanent primary tab.

Reports are NOT a permanent primary tab.

Settings is NOT a permanent primary tab.

Settings is reached from More and appropriate contextual account/profile entry points.

Full Transaction History is a reusable secondary destination.

Reports & Analytics are a prominent gateway inside My Money and open a dedicated Reports experience.

Follow-ups owns ongoing financial matters including debts, receivables, commitments, bills, installments, subscriptions, goals, savings, due items and Payment History / سجل الدفعات.

More is NOT Settings.

==================================================
3. APPROVED HOME DIRECTION
==================================================

Home is a daily financial status and action surface.

Preserve these approved principles:

- MYFI centered in the top area
- account/profile access
- notification access
- no permanent Search control on Home
- strong balance card
- period controls:
  Today
  This week
  This month
  This year
- compact wallet access
- View all wallets
- monthly summary:
  Income
  Expense
  Net
- no unnecessary previous-month comparison card
- Needs Attention only when meaningful
- Recent Transactions
- View All Transactions
- no meaningless permanent zero-state cards

Global Add interaction supports:

Mode A:
Quick Add

Mode B:
Side + button

They are mutually exclusive.

Home Quick Add actions:

Expense
Income
Transfer
Smart

==================================================
4. APPROVED MY MONEY DIRECTION
==================================================

My Money has four first-class gateways:

1. Wallets & Accounts
2. Transactions & History
3. Plan & Budget
4. Reports & Analytics

Wallets represent actual user money and must never be buried in Settings.

History remains highly accessible but is a secondary destination.

Search belongs inside full History, not permanently on Home.

Reports remain a major dedicated experience.

==================================================
5. APPROVED FOLLOW-UPS DIRECTION
==================================================

Follow-ups is a first-class action-and-tracking workspace.

It includes, where supported:

- Debts I owe
- Receivables
- Commitments
- Bills
- Installments
- Subscriptions
- Savings
- Goals
- Upcoming due items
- Payment tracking
- Payment History / سجل الدفعات

Follow-ups Quick Add actions are:

Debt
Receivable
Commitment
Goal

If Side + mode is selected, the Quick Add row disappears and the side + exposes contextual Follow-ups actions.

==================================================
6. APPROVED MORE DIRECTION
==================================================

More is a utility/services/customization/data/help/product-capabilities surface.

The approved high-level structure currently includes:

- customizable Shortcuts
- My Tools
- Data & Files
- Benefits / Rewards
- Help / MYFI
- Settings

More is adaptive over product maturity.

Classify More content as:

PERMANENT
TEMPORARY / MATURITY-DEPENDENT
CONDITIONAL

Temporary educational/promotional/discovery surfaces may later move, collapse, or disappear.

Do not create duplicate business logic when several entry points open the same destination.

==================================================
7. APPROVED MY TOOLS / CUSTOMIZATION DIRECTION
==================================================

My Tools may include:

- Customize MYFI
- Categories
- Currencies / valuation tools
- Templates
- Archive
- Feature visibility
- User shortcuts

Customize MYFI may include:

- Add Method
- Shortcuts
- Feature visibility
- approved UI customization
- Restore customization defaults

The global Add Method preference belongs here:

More
→ My Tools
→ Customize MYFI
→ Add Method

Do NOT place Add Method in the main Settings hierarchy.

User-facing terminology:

طريقة الإضافة / Add Method

Mode:
Quick Add
OR
Side + button

Feature visibility affects UI presentation only.

It must never delete, reinterpret, or hide historical financial truth from reports/history/export/backup.

==================================================
8. APPROVED SETTINGS DIRECTION
==================================================

Settings must remain calm, compact and preference-oriented.

Approved root structure:

1. Account & Sync card
2. Appearance & Language
3. Financial Preferences
4. Notifications & Reminders
5. Privacy & Security

IMPORTANT:

The top Account & Sync card itself is the entry point.

Do NOT create a duplicate Account & Sync row below it.

Reference/mockup documentation must use a neutral/default avatar.

Do not hard-code a real person's identity into design references.

Account & Sync may contain:

- profile/identity
- optional account connection
- sync status
- devices/sessions
- recovery
- password reset/recovery
- sign out
- account deletion

Appearance & Language may contain:

- System / Light / Dark
- Language
- month-name/display preference
- orientation only if justified

DO NOT introduce user-selectable brand accent colors at this stage.

Financial Preferences may contain:

- country
- base currency
- default wallet
- future salary-cycle preference only if separately approved

Notifications & Reminders may group:

- Follow-up reminders
- Financial alerts
- Activity reminders
- Notification privacy

Privacy & Security may contain:

- App lock
- Biometrics
- Re-lock duration
- Hide balances
- Hide notification details
- future Privacy Mode only if separately approved

Do not invent unsupported payment-method, card, or bank settings.

==================================================
9. LEGAL / PRIVACY / COMPLIANCE INFORMATION
==================================================

Clearly distinguish:

Privacy UX
from
Privacy Policy.

Operational privacy controls belong in:

Settings → Privacy & Security

Legal and informational surfaces may live under:

More → Help / MYFI

or a justified equivalent secondary destination.

Examples:

- Privacy & Data explanation
- Privacy Policy
- Terms & Conditions
- Open-source licenses if required
- About MYFI
- Version information

Account deletion remains primarily part of Account & Sync.

Other legal/privacy surfaces may link to the SAME deletion flow.

Do not duplicate deletion logic.

Google Play/privacy compliance is a release requirement, not merely a visual Settings item.

==================================================
10. PRIMARY OBJECTIVE OF THIS AUDIT
==================================================

The current MYFI application contains screens created at different times.

Your responsibility is to determine whether the application currently feels like:

ONE PRODUCT DESIGNED BY ONE TEAM

or a collection of unrelated visual implementations.

Perform a full visual identity and design consistency review.

Do not limit the review to colors.

Review the COMPLETE PRODUCT LANGUAGE.

==================================================
11. FULL VISUAL IDENTITY AUDIT
==================================================

Inspect all major screens and reusable UI components.

Audit at minimum:

- background treatment
- surfaces
- card hierarchy
- brand color
- semantic financial colors
- typography
- font family
- font size
- font weight
- Arabic typography
- line height
- page spacing
- page margins
- card padding
- section spacing
- list spacing
- radius
- shadows
- elevation
- borders
- separators
- icons
- icon size
- icon containers
- active/inactive icon states
- headers
- top bars
- bottom navigation
- tabs
- list rows
- buttons
- icon buttons
- inputs
- selectors
- switches
- chips
- badges
- modals
- bottom sheets
- dialogs
- toasts
- alerts
- feedback
- skeletons
- loading states
- empty states
- errors
- warnings
- success states
- charts
- financial amount display
- RTL behavior
- mixed Arabic/English layout
- accessibility
- touch targets
- motion
- responsive behavior

==================================================
12. DESIGN CONSISTENCY CLASSIFICATION
==================================================

Classify each issue:

P0 — Critical usability/accessibility inconsistency

P1 — Major system inconsistency

P2 — Visual/polish inconsistency

P3 — Future enhancement

Also classify every screen/component as:

A. Approved — preserve design direction
B. Approved — normalize through Design System
C. Legacy — migrate
D. Duplicate entry point — shared destination
E. Temporary / maturity-dependent
F. Future capability
G. Product Owner decision required
H. Developer/internal-only UI

==================================================
13. DEFINE THE CANONICAL MYFI VISUAL IDENTITY
==================================================

Establish one canonical visual identity.

The approved visual personality is:

- Calm
- Stable
- Human
- Financially trustworthy
- Modern
- Premium without luxury excess
- Professional
- Easy to scan
- Arabic/RTL-native
- Strong but restrained
- Consistent across Light and Dark

The product must NOT feel:

- futuristic
- neon
- gaming-like
- crypto-like
- visually noisy
- excessively colorful
- overloaded with gradients
- overloaded with cards
- dependent on heavy shadows
- like unrelated screens stitched together

The approved core brand direction is a restrained olive/green identity.

Do not introduce random purple, blue, orange or feature-specific identity colors without semantic justification.

Financial semantic colors remain independent from decorative brand colors.

==================================================
14. COLOR GOVERNANCE
==================================================

Define semantic tokens for roles such as:

background.primary
background.secondary
surface.primary
surface.secondary
surface.elevated
text.primary
text.secondary
text.muted
border.default
border.strong
brand.primary
brand.soft
action.primary
action.secondary
income
expense
transfer
positive
warning
danger
info
neutral

Use naming that fits the actual MYFI architecture.

The same semantic meaning must use the same representation throughout the application.

Do not rely on color alone for financial meaning.

==================================================
15. LIGHT / DARK PARITY
==================================================

Light and Dark must be two theme expressions of ONE Design System.

They must preserve:

- layout
- hierarchy
- component structure
- spacing
- semantic meaning
- interaction behavior

Dark mode must not become a separate artistic redesign.

Audit current screens for structural divergence between themes.

==================================================
16. TYPOGRAPHY SYSTEM
==================================================

Define a canonical typography hierarchy.

At minimum:

- Brand/App title
- Page title
- Section title
- Card title
- Body
- Secondary body
- Caption
- Label
- Button
- Financial amount
- KPI/metric
- Supporting financial text

For each define:

- font family
- size
- weight
- line height
- Arabic behavior
- English/mixed-text behavior

Avoid arbitrary screen-specific font values.

==================================================
17. SPACING SYSTEM
==================================================

Define a canonical spacing scale.

Use a small predictable system.

For example conceptually:

XS
S
M
L
XL
2XL

Map actual values based on current MYFI implementation and recommended target system.

Standardize:

- page padding
- card padding
- card gaps
- section gaps
- list rows
- controls
- forms
- bottom sheets
- modals
- safe-area spacing

Identify existing magic values.

==================================================
18. RADIUS / BORDER / ELEVATION SYSTEM
==================================================

Define canonical:

Radius:
- small
- medium
- large
- pill/full

Borders:
- subtle
- standard
- emphasized
- destructive where applicable

Elevation:
- flat
- subtle
- floating
- modal

Hierarchy should come primarily from:

spacing
contrast
typography
grouping

not excessive shadows.

==================================================
19. ICONOGRAPHY SYSTEM
==================================================

Audit all icon families currently in use.

Define one canonical icon strategy where technically feasible.

Standardize:

- icon family
- stroke/filled behavior
- size
- alignment
- icon container
- active/inactive states
- directional mirroring rules
- financial semantic meaning

Normal state may use outline.

Active/selected may use filled/emphasized treatment only if coherent.

Avoid unrelated mixed icon styles.

==================================================
20. COMPONENT SYSTEM
==================================================

Inventory and evaluate shared components.

Potential canonical components include:

Button
IconButton
Card
InteractiveCard
SummaryCard
AlertCard
MetricCard
AccountCard
TransactionRow
FinancialAmount
Input
SearchField
Select
Toggle
Tabs
Chip
Badge
SectionHeader
PageHeader
BottomSheet
Modal
DecisionDialog
EmptyState
ErrorState
LoadingState
Skeleton
ChartContainer
InsightCard

Do not create abstractions solely to reduce file count.

Reuse is justified when components share:

- semantic role
- interaction contract
- state model
- accessibility behavior
- visual behavior

Avoid giant universal components with excessive conditional props.

Preferred hierarchy:

Design Tokens
→ Theme
→ Primitives
→ Reusable Composite Components
→ Financial Domain Components
→ Screens

==================================================
21. NAVIGATION LANGUAGE
==================================================

Define one navigation behavior.

Audit:

- bottom navigation
- headers
- back navigation
- modal navigation
- bottom sheets
- secondary pages
- tabs
- contextual entry points

Establish canonical rules for:

- page header height
- title location
- account/profile icon
- notification icon
- back direction
- action placement
- active bottom-tab state
- secondary-screen transitions

Use these approved principles:

View something
→ Page

Simple add action
→ Bottom Sheet

Complex workflow
→ Full-screen flow

Multiple entry points may open the SAME secondary screen.

Do not create duplicates.

==================================================
22. FINANCIAL DATA PRESENTATION
==================================================

Define one financial presentation contract.

Standardize:

- amounts
- currency placement
- decimal handling
- thousands separators
- positive/negative signs
- income
- expense
- transfer
- balances
- percentages
- trends
- available vs total balance
- due amounts
- progress

Do not rely only on green/red.

Use typography, sign, icons and labels appropriately.

==================================================
23. CHART DESIGN SYSTEM
==================================================

Audit all existing reports/charts.

Define a shared chart language for future Reports.

Cover:

- chart containers
- typography
- axes
- grid lines
- tooltip
- legends
- semantic colors
- selected point
- loading
- empty
- comparison
- drill-down entry
- RTL labels
- dates
- currency

Charts must answer a financial question.

Avoid decorative charts.

==================================================
24. EMPTY / LOADING / ERROR / FEEDBACK STATES
==================================================

Define unified patterns for:

EMPTY:
- explain what is missing
- explain why it matters
- give a next action

LOADING:
- skeleton where appropriate
- blocking progress only when necessary

ERROR:
- inline validation
- recoverable error
- network/offline
- blocking error
- destructive-operation error
- data-integrity error

SUCCESS / FEEDBACK:
- save
- copy
- delete
- undo
- import
- sync
- backup
- restore
- creation
- settings update

Determine when to use:

inline feedback
toast/snackbar
modal/dialog
state transition

Do not mix patterns randomly.

==================================================
25. RTL-FIRST SYSTEM
==================================================

Arabic is first-class.

Audit:

- page flow
- text alignment
- row ordering
- back arrows
- chevrons
- directional icons
- mixed Arabic/English
- numbers
- currency
- dates
- charts
- tabs
- dialogs
- sheets
- form fields

Do not mechanically mirror everything.

Document what mirrors and what remains logically unchanged.

==================================================
26. ACCESSIBILITY
==================================================

Establish one accessibility baseline.

Review:

- contrast
- font scaling
- Dynamic Type behavior where applicable
- minimum touch targets
- TalkBack labels
- semantic roles
- focus order
- error announcements
- switch state descriptions
- non-color indicators
- Light/Dark accessibility
- Arabic and English content

Accessibility is part of the Design System.

==================================================
27. RESPONSIVE / DEVICE RULES
==================================================

Define behavior for:

- small phones
- normal phones
- large phones
- orientation if retained
- tablets only if actually in product scope

Avoid per-device visual hacks.

==================================================
28. MOTION SYSTEM
==================================================

Define motion rules for:

- card interaction
- expand/collapse
- bottom sheets
- modal transitions
- page transitions
- progress
- success
- chart changes
- reordering

Motion must communicate state.

Avoid decorative animation.

Support reduced motion when appropriate.

==================================================
29. SCREEN-BY-SCREEN CONSISTENCY REVIEW
==================================================

Review every major screen.

For each document:

Screen name
Current role
Current visual identity
Current issues
Design-system deviations
Approved target direction
Elements to preserve
Elements to normalize
Elements to migrate
Reusable components
Missing components
UX improvements
Accessibility
RTL
Priority
Future implementation phase

At minimum review:

Onboarding
Home
My Money-related current equivalents
Transaction History
Transaction Details
Follow-ups/Trackers
Debt flows
Receivable flows
Commitment flows
Goal/Savings flows
Payment History
Reports
Wallets
Wallet details
Budget/Planning
Categories
Archive
Settings
Account/Sync
Notifications
Privacy/Security
Backup/Restore
More-equivalent surfaces
Help/About
All major add-entry flows

==================================================
30. DEV / INTERNAL UI AUDIT
==================================================

Search for internal controls such as:

- developer settings
- diagnostics
- benchmarks
- Restore Epoch gates
- SQLite diagnostics
- startup timing
- demo/test-data controls
- debug utilities

Classify separately.

They must not become part of the public production design by accident.

Recommend a future internal Developer/Diagnostics strategy.

Do NOT delete them now.

==================================================
31. DESIGN GOVERNANCE
==================================================

Define how future screens preserve consistency.

Every new screen must answer:

- Which tokens does it use?
- Which existing primitives?
- Which reusable components?
- Does it introduce a new pattern?
- Why is the new pattern needed?
- Should it become reusable?
- Does the canonical documentation need updating?
- Does it preserve RTL/accessibility?
- Does it preserve financial semantics?

Rule:

REUSE BEFORE CREATION.

==================================================
32. VISUAL CONSISTENCY PREVENTION
==================================================

Recommend practical methods to prevent drift:

- centralized tokens
- canonical components
- design-review checklist
- linting where practical
- screenshot baselines
- visual regression
- Storybook/component previews only if appropriate to current stack
- Light/Dark verification
- Arabic/English verification
- representative device sizes

==================================================
33. MASTER DESIGN SOURCE OF TRUTH
==================================================

Do NOT rewrite the current Master Blueprint during this task.

Instead prepare a Blueprint Revision Map.

Classify every major existing Blueprint section as:

KEEP
AMEND
SUPERSEDED
REMOVE FROM TARGET
ADD NEW

For every item provide:

- reason
- evidence
- current conflict
- approved target
- design impact
- product impact
- architecture impact
- database impact
- financial-data impact
- priority

==================================================
34. FINANCIAL / DATABASE SAFETY
==================================================

No recommendation in this task authorizes changes to:

- financial semantics
- transaction semantics
- transfers
- ledger
- reconciliation
- historical FX
- SQLite schema
- financial migrations
- sync semantics
- backup format
- restore behavior
- rollback behavior
- existing-user data

If required by a future proposal label:

ENGINEERING / PRODUCT APPROVAL REQUIRED

For every migration recommendation state:

Financial Data Impact
Database Impact
Schema Impact
Migration Required?
Backup/Restore Impact
Sync Impact
Existing User Impact
Rollback Requirement

==================================================
35. REQUIRED CANONICAL DOCUMENTATION OUTPUTS
==================================================

Create the following NEW documentation files.

Do not overwrite old design documents during this phase.

1.

docs/design/MYFI_VISUAL_IDENTITY_CANONICAL.md

Must define:

- design philosophy
- brand personality
- visual character
- olive/green identity
- color governance
- typography
- spacing
- radius
- elevation
- iconography
- Light/Dark relationship
- RTL
- accessibility
- motion
- examples of prohibited visual drift

2.

docs/design/MYFI_DESIGN_SYSTEM_CANONICAL.md

Must define:

- canonical tokens
- theme system
- primitives
- reusable components
- variants
- navigation rules
- cards
- buttons
- inputs
- lists
- sheets
- dialogs
- feedback
- states
- financial amount presentation
- charts
- responsive rules

3.

docs/design/MYFI_DESIGN_TOKEN_CATALOG.md

For every token specify:

- token name
- semantic purpose
- recommended/current target value
- usage
- prohibited misuse
- Light value
- Dark value where applicable

4.

docs/design/MYFI_COMPONENT_INVENTORY_AND_MIGRATION.md

For every relevant component specify:

- existing component
- role
- current variants
- problems
- canonical replacement
- keep/consolidate/replace/remove
- migration required
- screens using it
- priority

5.

docs/design/MYFI_SCREEN_VISUAL_CONSISTENCY_MATRIX.md

For every major screen specify:

- current design status
- approved target
- identity alignment
- component alignment
- UX issues
- RTL
- accessibility
- design debt
- migration priority

6.

docs/design/MYFI_DESIGN_GOVERNANCE.md

Define:

- source-of-truth hierarchy
- reuse-before-creation
- component approval rules
- token governance
- visual-review checklist
- new-pattern approval
- RTL checklist
- accessibility checklist
- Light/Dark checklist
- design decision record template

7.

docs/design/MYFI_BLUEPRINT_REVISION_MAP.md

Contain:

KEEP
AMEND
SUPERSEDED
REMOVE FROM TARGET
ADD NEW

for the existing Master Blueprint.

8.

docs/design/MYFI_DESIGN_SYSTEM_AUDIT_AND_MIGRATION_PROPOSAL.md

This is the executive consolidated report and must include:

- baseline
- audit
- major visual identity problems
- design consistency debt
- canonical identity summary
- token strategy
- component strategy
- navigation audit
- More/Settings audit
- screen migration matrix summary
- RTL audit
- accessibility audit
- chart audit
- internal/dev UI audit
- Blueprint Revision Map summary
- implementation sequence proposal
- visual regression strategy
- risks
- open Product Owner decisions
- executive summary

==================================================
36. DOCUMENTATION QUALITY
==================================================

These documents are not temporary notes.

They must be written as professional long-term project artifacts.

Use clear sections.

Avoid vague recommendations.

Distinguish:

CONFIRMED CURRENT STATE
APPROVED TARGET
CLAUDE RECOMMENDATION
FUTURE POSSIBILITY
PRODUCT OWNER DECISION REQUIRED

Use evidence from actual code.

Reference file paths/components where relevant.

==================================================
37. END-OF-TASK VALIDATION
==================================================

Before finishing:

Verify that all required documentation files exist.

Verify they do not contradict each other.

Verify the same visual identity rules are used across all canonical files.

Verify navigation matches:

Home
My Money
Follow-ups
More

Verify Settings is not described as a primary tab.

Verify Add Method is not placed in main Settings.

Verify Account & Sync is not duplicated below the account card.

Verify no user-selectable accent color is accidentally approved.

Verify Light/Dark parity is documented.

Verify developer-only controls are identified.

Verify financial-data boundaries are respected.

==================================================
38. FINAL OUTPUT
==================================================

Return exactly:

Repository:
Branch:
HEAD:
Git status:

Design audit completed:
Visual identity audit completed:
Canonical visual identity created:
Canonical Design System created:
Token catalog created:
Component inventory created:
Screen consistency matrix created:
Design governance created:
Blueprint revision map created:
Migration proposal created:

Production code modified: NO
Financial data modified: NO
Database/schema modified: NO
Financial migration performed: NO

Top 10 visual consistency problems:

Top 10 Design System priorities:

Product Owner decisions still required:

Recommended implementation sequence:

NEXT EXACT TASK:

Product Owner reviews the canonical visual identity, Design System, screen consistency matrix, and Blueprint Revision Map.

Do not begin implementation until explicitly authorized.
