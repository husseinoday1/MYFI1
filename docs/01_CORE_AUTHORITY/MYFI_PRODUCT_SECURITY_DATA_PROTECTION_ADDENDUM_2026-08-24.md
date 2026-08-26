# MYFI — Product Design, Security & Data Protection Addendum

**Status:** User-approved planning and sequencing overlay, refined after Phase 10 closure

**Approved:** 2026-08-24

**Verified branch:** `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`

**Verified commit:** `d2ed3ae03c137d818040dfe77c665c516b8440b7`

**Scope:** Product/UX and security/data-protection planning after Phase 10

**Implementation authority:** None by itself; every implementation package still requires its own scoped plan, dependency check, tests, and acceptance evidence.

## 1. Authority and non-conflict rule

This addendum does not rewrite or renumber the Frozen Master Plan. It overlays
the post-Phase-10 product and security work so that neither is lost between
engineering phases.

The labels `PRODUCT-P0-A` through `PRODUCT-P3` and `SECURITY-S0` through
`SECURITY-S6` are work-package labels, not replacements for the canonical
engineering phase numbers in the Frozen Master Plan.

If this addendum conflicts with actual repository state, the Frozen Master
Plan, or a permanent financial/data/sync/backup/security contract, the normal
authority order in `docs/00_MYFI_CANONICAL_AUTHORITY.md` applies. Product or
security work must never weaken financial integrity, recoverability, migration
safety, or acceptance gates.

## 2. Phase 10 closure boundary

Phase 10 is closed by the live production restore evidence in:

`docs/04_CURRENT_EVIDENCE/MYFI_PHASE10_LIVE_PRODUCTION_RESTORE_CLOSURE_2026-08-24.md`

The accepted production APK was built from
`ed436efab2cdee118fb21113c12026012cba14c1`; the closure evidence was recorded
at `d2ed3ae03c137d818040dfe77c665c516b8440b7`.

This closure replaces the old pre-closure analysis-only rule with:

- first reconcile and approve the Product Blueprint and Security Current-State
  work;
- then select one small implementation package with its own scoped plan;
- no SQLCipher, SecureStore lifecycle, Supabase schema, backup-format,
  production Android, or financial-schema change is authorized by this
  addendum alone;
- no Product redesign may weaken backup/restore, sync, ledger, migration,
  deletion, historical FX, or recovery contracts.

No new Patch IDs are created by this document. Patch IDs start only when a
post-Phase-10 package has a scoped implementation plan, dependency check, tests,
and acceptance evidence.

## 3. Three equal product dimensions

MYFI must progress across three dimensions without trading one against another:

1. **Financial Integrity** — deterministic, auditable, recoverable financial truth.
2. **Product Experience** — calm, modern, Arabic-native, focused, fast, and understandable.
3. **Security & Privacy** — production-grade protection of local data, secrets,
   backups, synchronization, intelligent-input data, and recovery paths.

The target is not a larger collection of features or cards. MYFI should show
the most important financial fact or next action at the moment it matters.

## 4. Competitive design translation

The product work must deliberately translate lessons from:

- EZer;
- Feloosy;
- Money Lover;
- Money Manager;
- Masareef / المصاريف.

No screen is copied pixel-for-pixel. Every candidate pattern is classified as:

- **Adopt** — the concept fits MYFI as-is;
- **Improve** — retain the solved user problem but produce a better MYFI form;
- **Reject** — it adds noise, risk, or complexity without enough value;
- **Outperform** — MYFI can solve the need better through its local-first,
  deterministic financial core.

Competitor analysis must give product experience the same attention as
financial features: onboarding, education, Settings information architecture,
themes, icons, cards, bottom sheets, dialogs, empty/loading/error/success
states, navigation, Quick Add, Arabic/RTL quality, automation, assistant
placement, privacy presentation, and perceived product quality.

Current translation matrix:

| Competitor | Adopt | Improve | Reject | Outperform |
|---|---|---|---|---|
| EZer | Safe-to-Spend, commitments/warnings, privacy dashboard, Bottom Sheets | Link each warning to a clear next action and explain the calculation | Dense layout and mixed localization | Explainable Safe-to-Spend backed by the local ledger |
| Feloosy | Lower manual entry, SMS, voice, financial conversation | Reconciliation, deduplication, and reviewed drafts | Trusting smart input without review | Answers from MYFI deterministic business logic, not cloud/LLM guesses |
| Money Lover | Onboarding, recurring flows, budgets, wallet discovery, education | Contextual education instead of only a large Help Center | Long wizard or too many early settings | Arabic first-use journey with lower friction |
| Money Manager | Hierarchy, analytics, many-function organization, import concepts | Progressive disclosure and actionable outputs | Exposing all complexity at once | Reports that explain why and what to do next |
| Masareef / المصاريف | Arabic simplicity, understandable debts/installments, easy recurring transactions | Arabic-first and real RTL through reports and charts | Simplicity that removes financial semantics | Professional financial depth without daily cognitive load |

**Needs code verification:** actual screen/component reuse cannot be decided
from planning text alone. `PRODUCT-P0-A` must inspect current screens,
components, tokens, navigation, and behavior before recommending implementation.

## 5. Product workstream

| Package | Outcome | Required boundary |
|---|---|---|
| `PRODUCT-P0-A — Competitive Design Translation` | Competitor findings, Adopt/Improve/Reject/Outperform matrix, target experience blueprint, screen/reuse inventory | Analysis/design first; implementation requires separate approval |
| `PRODUCT-P0-B — Design System Foundation` | Tokens, typography, spacing, surfaces, controls, semantic colors, icons, System/Light/Dark themes, RTL and accessibility rules | No change to financial semantics |
| `PRODUCT-P0-C — Onboarding & First Use` | Welcome, intended use, minimum setup, privacy explanation, temporary first-use checklist, useful empty states | No long configuration wizard; no financial migration |
| `PRODUCT-P0-D — Settings & Education` | Settings IA, Privacy/Data Center, first-time hints, contextual education, Help structure | Advanced controls use progressive disclosure |
| `PRODUCT-P1-A — Context-Aware Home & Needs Attention` | Current position, available-after-commitments candidate, attention items, next actions, limited insights, recent activity | No Safe-to-Spend claim before a frozen deterministic contract |
| `PRODUCT-P1-B — Quick Add & Smart Defaults` | Fast Expense/Income/Transfer path plus progressively disclosed Smart Input/OCR/Voice/Template candidates | No bypass of validation, confirmation, or posting rules |
| `PRODUCT-P1-C — Insights, Search & Goals` | Actionable reports, better search/filtering, improved goals and next actions | Historical FX and financial presentation remain contract-driven |
| `PRODUCT-P2 — Smart Automation` | Recurring detection, templates, alerts, categorization, OCR/Voice/SMS drafts | No direct financial writes; privacy contract required first |
| `PRODUCT-P3 — Advanced Intelligence` | Statement import, salary-cycle planning, cash forecast, “Ask Your Money” | LLM is never source of truth or calculator of authoritative balances |

### PRODUCT-P0-A required deliverables

1. Competitor-by-competitor findings.
2. Adopt/Improve/Reject/Outperform decisions.
3. MYFI target visual philosophy.
4. Home blueprint.
5. Welcome/onboarding and first-use blueprint.
6. Contextual education architecture.
7. Settings information architecture.
8. Navigation review based on frequency and intent.
9. Quick Add interaction model.
10. Icon and theme systems.
11. Component language and state patterns.
12. Financial Assistant placement.
13. Privacy/Data Center UX.
14. Arabic/RTL and accessibility rules.
15. Screen-by-screen redesign and reuse inventory.
16. Explicit list of functionality that remains unchanged.

## 6. Target product character and interaction rules

MYFI should feel calm, premium, financially trustworthy, intelligent,
Arabic-native, focused, and fast. It must not feel crowded, technical,
configuration-heavy, inconsistent, or visually noisy.

The target Home answers:

1. Where am I financially?
2. What requires attention?
3. What should I do next?

It adapts to real financial state and does not preserve irrelevant zero-value
cards merely to fill a layout.

The target onboarding asks only what is needed for early value. A temporary
checklist may guide first wallet, first income, first expense, and first useful
summary, then disappears permanently.

Education has three layers: first-time hints, contextual education at the
moment of need, and a deeper Help Center. Excessive tutorial modals are not the
default.

Settings is organized around Account, Money, App Experience, Privacy &
Security, Backup & Sync, Help, and Advanced. This is an information architecture
proposal to validate against the actual setting inventory, not permission to
move or remove behavior blindly.

The target product formula is:

```text
simple daily use
+ contextual understanding
+ reviewable automation
+ deterministic financial truth
+ trustworthy privacy and recovery
= target MYFI
```

## 7. Financial Assistant and unified smart input

“Ask Your Money / اسأل أموالك” may interpret intent and explain deterministic
results, but it never owns balances, financial truth, or posting.

The architectural rule remains:

```text
User intent
→ approved Financial Query/Command service
→ deterministic SQLite-backed result or Draft
→ validation and user review
→ explicit confirmation where required
→ ledger posting through existing business logic
```

All intelligent entry candidates converge on one reviewed pipeline:

```text
Manual / Template / SMS / OCR / Statement / Voice / Assistant
→ Draft
→ Validate
→ Deduplicate
→ Categorize
→ Review
→ Confirm
→ Post
```

No OCR, SMS parser, voice model, or LLM may directly create a final ledger
mutation.

## 8. Security and data-protection workstream

| Package | Outcome | Dependency |
|---|---|---|
| `SECURITY-S0 — Threat Model & Current-State Evidence` | Verified assets, trust boundaries, current controls, gaps, and threats | Current-state analysis first; implementation requires separate approval |
| `SECURITY-S1 — SQLCipher Feasibility & Decision` | Evidence-backed A/B/C recommendation, native compatibility, performance, migration and recovery design | CI/native Android and existing-user evidence |
| `SECURITY-S2 — Key Lifecycle & Recovery Design` | Generation, storage, retrieval, rotation/loss policy, reinstall/account/biometric behavior | Explicit product decision on recoverability |
| `SECURITY-S3 — Backup/Restore Security` | Backup confidentiality/authentication and compatibility with staged atomic restore | Phase 10 live closure |
| `SECURITY-S4 — Cloud/Sync Security Acceptance` | RLS, account isolation, replay/stale-device/conflict/lifecycle proof | Supabase and runtime evidence |
| `SECURITY-S5 — Smart Data Privacy` | OCR/SMS/Voice/Statement/Assistant local-vs-cloud, consent, retention and deletion contracts | Product decision before implementation |
| `SECURITY-S6 — Production Security Gate` | Release APK manifest, backup controls, permissions, exported components, signing, logs and recovery evidence | All accepted packages |

## 9. SQLCipher decision gate

The financial SQLite database is treated as **plaintext at rest** until actual
code and native runtime evidence prove otherwise.

The current architecture recommendation is:

**A — Adopt SQLCipher before Production, confidence Medium.**

Reason: MYFI stores sensitive local financial history, and App Lock alone does
not protect a copied SQLite file. This recommendation is not implementation
authority. SECURITY-S1 still must prove native compatibility, performance,
migration, recovery, and Android release behavior before code changes.

SECURITY-S1 must still return and justify the final decision:

- **A — Adopt SQLCipher before Production**;
- **B — Defer with explicit threat-model justification**;
- **C — Reject for this release with documented compensating controls**.

The decision must prove compatibility, performance, existing-database
migration, key lifecycle, backup/restore, interruption and crash recovery,
rollback, and native Android behavior.

If adopted, the minimum migration design is:

```text
existing plaintext DB
→ safety checkpoint
→ key provisioning
→ encrypted staging DB
→ transactional transfer
→ schema and integrity validation
→ financial invariant validation
→ backup/restore validation
→ interruption and crash tests
→ atomic promotion
→ existing-user upgrade acceptance
```

Fresh-install-only evidence is insufficient. Investigation must never use the
user's real financial data.

## 10. Key, app-lock, and recovery contracts

Encryption keys must never be stored in source code, SQLite, AsyncStorage,
Git, logs, analytics, or CI output. SecureStore/Android Keystore-backed
storage is the candidate secret store, not the ledger.

The design must define first install, normal launch, reboot, logout, account
deletion, local financial-data deletion, reinstall, biometric enrollment
change/removal, SecureStore loss, key corruption, rotation if supported, and
device migration.

Biometric/App Lock and database-at-rest encryption are separate layers. The
database key must not be bound to biometrics in a way that breaks background
sync, notifications, backup, restore, or recovery without an explicit policy.

Security must balance confidentiality, integrity, and recoverability. A
mechanism that can silently make the user's ledger unrecoverable is not
acceptable.

## 11. Backup, Android, logging, cloud, and smart-data gates

- Backup protection must cover confidentiality, tamper detection, bounded
  parsing, staged validation, semantic proof, atomic promotion, rollback,
  corruption, interruption, and old-to-new version recovery.
- The actual merged release artifact must prove `android:allowBackup="false"`
  and applicable backup rules, permissions, exported components, absence of
  debug-only components, signing, and release manifest behavior.
- Production logs, diagnostics, crash reports, analytics, and CI artifacts
  must not contain notes, balances, full financial history, raw SMS/OCR/voice
  content, tokens, keys, passwords, or backup payloads.
- OCR, Voice, SMS, Statement Import, and Assistant work must document local or
  cloud processing, exact outbound data, purpose, disclosure, consent,
  retention, temporary-artifact deletion, authentication, and failure behavior.
  There is no hidden upload.
- Supabase remains auth/transport/replication. SQLite remains the local
  financial source of truth. `ledger_id` remains independent from
  `supabase_user_id`; Logout, Delete Account, and Delete Local Financial Data
  remain separate operations.
- Monetary conflicts are never automatically “smart merged.” RLS,
  cross-account isolation, service-role absence in the client, outbox retries,
  mutation IDs, revisions, restore epochs, replay, stale devices, account
  switching, and two-device convergence need explicit evidence.

## 12. Cross-cutting production requirements

- Brand strings must be portable through localization/configuration because
  MYFI is not necessarily the final public name.
- Every new component supports Arabic/English, RTL/LTR, TalkBack, Dynamic
  Type, semantic labels, focus order, minimum touch targets, and non-color-only
  meaning from its first implementation.
- Money, currency, date, and status formatting remains centralized. Screens do
  not invent calculations or scatter `toFixed()` formatting.
- Historical FX is immutable; changing current valuation never reinterprets
  old transactions.
- Before public authentication, branded SMTP, sender identity, Arabic/English
  templates, SPF/DKIM/DMARC, deliverability, and privacy-safe notification
  previews are required.

## 13. Refined roadmap after Phase 10

Product track:

| Package | Goal | What it must not do |
|---|---|---|
| `P0-A — Competitive Design Translation` | Screen maps, UX rules, IA, design specification, reuse inventory | No production code |
| `P0-B — Design System Foundation` | Tokens, components, icons, themes, RTL/a11y | No financial semantics change |
| `P0-C — Onboarding & First Use` | Welcome, onboarding, checklist, empty states | No financial migration |
| `P0-D — Settings & Education` | Settings IA, Privacy/Data Center, contextual education | No ledger reopening |
| `P1-A — Context-Aware Home & Needs Attention` | Home decision surface | No Safe-to-Spend without a frozen contract |
| `P1-B — Quick Add & Smart Defaults` | Faster entry and less repetition | No bypass of posting rules |
| `P1-C — Insights, Search, Goals` | Actionable reports and goals | No FX/history reinterpretation |
| `P2 — Smart Automation` | Recurring, alerts, categorization, OCR/voice/SMS | No direct financial writes |
| `P3 — Advanced Intelligence` | Statement import, salary cycle, assistant | No LLM source of truth |

Security/data track:

| Package | Goal | Dependency |
|---|---|---|
| `S0 — Threat Model & Current-State Evidence` | Current state, threats, controls, gaps | Can proceed as analysis after Phase 10 |
| `S1 — SQLCipher Feasibility & Decision` | Native compatibility, performance, migration/recovery decision | Android evidence |
| `S2 — Key Lifecycle & Recovery Design` | Key loss/reinstall/account-deletion policies | Product decision required |
| `S3 — Backup/Restore Security` | Encryption/authentication/staged restore security | Phase 10 closure |
| `S4 — Cloud/Sync Security Acceptance` | RLS, conflicts, lifecycle, outbox | Supabase/runtime evidence |
| `S5 — Smart Data Privacy` | OCR/SMS/voice/AI contracts | Product decision required |
| `S6 — Production Security Gate` | APK, logs, manifests, recovery evidence | All accepted packages |

## 14. Sequencing and implementation gates

```text
Phase 10 is closed:
  reconcile and approve PRODUCT-P0-A + SECURITY-S0
  → choose one small package
  → verify repository reality and dependencies
  → implement without changing unrelated financial contracts
  → automated tests
  → CI Android artifact where relevant
  → device/runtime evidence

Before Production:
  SECURITY-S1 through SECURITY-S6 decisions/evidence as applicable
  + accepted Product packages
  + unchanged financial, sync, migration, and recovery invariants
```

No package may be prioritized only because it is visually attractive. Each
backlog item must state the user problem, experience, current partial support,
UI/business-logic/database/migration impact, financial-data impact, priority,
dependency, failure modes, rollback, tests, and acceptance proof.

## 15. Explicitly unchanged contracts

This addendum does not change:

- SQLite as local operational financial truth;
- the command/query and posting boundaries;
- transfer, posting, tombstone, identity, and historical FX semantics;
- account lifecycle versus ledger lifecycle;
- account deletion versus local financial-data deletion;
- outbox/sync/restore-epoch contracts;
- the prohibition on silent repair or invented financial data;
- the requirement to preserve old paths until parity and acceptance are proven;
- Phase 10 closure criteria and real-device evidence precedence.

## 16. Decisions reserved for later user approval

- Exact deterministic definition of Safe-to-Spend / available after commitments.
- SQLCipher A/B/C decision after SECURITY-S1 evidence.
- Recovery model for key/SecureStore loss.
- Local versus cloud boundary for OCR/SMS/Voice/Assistant.
- Retention and deletion policy for smart-data artifacts.
- First implementation package after PRODUCT-P0-A and SECURITY-S0 approval.
- Whether Assistant usage eventually justifies a primary navigation position.
