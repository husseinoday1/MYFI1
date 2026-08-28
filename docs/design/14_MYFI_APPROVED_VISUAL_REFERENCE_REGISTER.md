# MYFI — Approved Visual Reference Register

**Registered:** 2026-08-25
**Status:** CANONICAL — register of Product Owner-approved visual references
**Purpose:** prevent any future developer or AI agent from confusing an approved
mockup with a legacy screenshot, a rejected exploration, or an image-generation
artifact. Every image supplied in the 2026-08-25 "Approved Visual References"
handoff is recorded here with what it approves, what it does not, and what in
it must be ignored.

**Source:** images pasted directly into the MYFI Planning & Audit conversation,
described by the user as "the latest Product Owner-approved MYFI visual
references."

**2026-08-27 update:** the actual image files (11, matching every REF-\* entry
below one-to-one) were provided by the user and are now in the repository
under `docs/design/assets/REF-<code>-<slug>.jpeg`. Every entry below can now
be checked against real pixels instead of only this register's prose.

---

## Onboarding authority update — 2026-08-28

The Product Owner's newer direct instruction supersedes the fixed six-step
sequence recorded below. The current flow is Welcome → three short
personalization questions → Essentials with Privacy notice → Start, with no
Skip action. Welcome has a small AR/EN control at the top side solely for
reading the onboarding in Arabic/RTL or English/LTR; this temporary choice does
not change the real app-language setting. REF-02/03/03B/03D/03C remain
approved visual/content inputs; REF-03E's separate completion step is
historical and is no longer part of normal first-run navigation. The
personalization option layout is informed by the user-supplied 2×2 question
reference, but uses MYFI brand green rather than copying that reference's
purple identity.

---

## REF-01 — Home (Light + Dark, side-by-side)

- **Screen:** Home
- **Theme:** Both (single reference showing Light and Dark of the same layout)
- **Approval status:** APPROVED for balance card, wallets strip, monthly
  summary, Quick Add row, recent-transactions list. **NOT approved** for its
  bottom-navigation labels (see conflict below).
- **Approved design principles:**
  - Centered "MYFI" wordmark in the brand green, profile icon left, bell
    (with unread dot) right.
  - One dominant balance card in solid brand green (`الرصيد الكلي` / Total
    Balance), large white amount, a wallet icon-button, and four inline
    period pills (اليوم / هذا الاسبوع / هذا الشهر / هذا العام) each carrying
    its own delta figure — period switching is a first-class Home control.
  - Horizontally scrollable wallet strip (3 cards + "عرض الكل") with
    per-wallet icon, name, and balance; pagination dots.
  - "ملخص هذا الشهر" — three-column Net/Expense/Income summary with a single
    two-tone progress bar beneath.
  - "الإضافة السريعة" — four circular icon actions: Income, Expense,
    Transfer (bidirectional arrow, blue), Smart (star, purple). Confirms the
    Blueprint's exact Home Quick Add set. **Correction (2026-08-26):** the
    source image's arrow directions are reversed from the canonical
    direction and must not be carried into implementation — **Income is
    UP, Expense is DOWN.** (The source mockup showed Income with a
    down-arrow and Expense with an up-arrow; this is a documentation
    correction only, not a re-audit of the image itself.)
  - Recent Transactions list with colored category-icon circles, +/- colored
    amounts, and a "View all" link.
- **Screen-specific pattern (not global):** the balance-card hero treatment
  and the four period pills are unique to Home; do not generalize the pill
  control elsewhere without a reason.
- **Known textual corrections / conflicts with current repository:**
  - **CONFLICT — bottom navigation.** This image's bottom bar reads
    المزيد / التقارير / الميزانية / الرئيسية (More / Reports / Budget /
    Home) — a **different, 4-item set** than every other approved image
    (REF-04, REF-05, REF-06, REF-07 below), which consistently show
    الرئيسية / أموالي / المتابعات / المزيد (Home / My Money / Follow-ups /
    More). This is judged an **earlier-iteration artifact**, superseded by
    the Blueprint's explicit text (§2/§3) and by the majority (4-of-4 other
    screen mockups) of newer references. **Do not use this image's bottom-nav
    labels as approved** — the canonical navigation is Home / My Money /
    Follow-ups / More, per REF-04–REF-07 and the Blueprint text.
  - The dark-theme progress bar under "ملخص هذا الشهر" shows a third
    (purple-ish) segment not present in the light version — treated as an
    **image-generation artifact to ignore**, not a semantic addition (no
    third income/expense category is defined anywhere else). Verify at
    implementation time rather than encoding a new semantic.
- **Global Design System principles derived:** brand-green hero-card
  treatment; period-pill pattern; colored-circle category icons paired with
  signed amounts (not color alone).
- **Canonical documents influenced:** `02_MYFI_VISUAL_IDENTITY_CANONICAL.md`,
  `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md` (Home row), `archive/MYFI_BLUEPRINT_REVISION_MAP.md`.

## REF-02 — Onboarding: Welcome (1 of 6)

- **Screen:** Onboarding, step 1
- **Theme:** Light only
- **Approval status:** APPROVED
- **Approved design principles:** three feature-preview icon cards
  (Expenses/Planning/Goals), a one-line trust tagline ("تجربة عربية واضحة،
  سريعة، وآمنة" — a clear, fast, and safe Arabic experience), a single
  primary CTA ("ابدأ") and a soft skip ("ليس الآن").
- **Known textual corrections:** **product-positioning note (2026-08-26):**
  this register's prior description translated the tagline as a "clear,
  fast, and safe Arabic experience," which risks reading as market
  exclusivity. Arabic/RTL-native is an approved first-class implementation
  requirement, but MYFI's product positioning must remain internationally
  extensible — describe product quality as clear/fast/safe/human/
  financially trustworthy, not as an Arabic-only product. The on-screen copy
  itself is a localization detail outside this register's authority to
  rewrite.
- **Canonical documents influenced:** `02_MYFI_VISUAL_IDENTITY_CANONICAL.md`
  (onboarding tone), `01_MYFI_MASTER_PRODUCT_DESIGN_BLUEPRINT.md`.

## REF-03 — Onboarding: Priorities (2 of 6)

- **Screen:** Onboarding, step 2
- **Theme:** Light only
- **Approval status:** APPROVED
- **Approved design principles:** multi-select priority list (تتبع
  المصروفات / التخطيط الشهري والميزانية / الديون والالتزامات / الادخار
  والأهداف / فهم وضعي المالي / استخدام شامل) with green check-circle
  selection state and an explicit reversibility note ("يمكنك تعديل هذه
  الأولويات لاحقاً من داخل التطبيق").
- **Known textual corrections:** none identified.

## REF-03B — Onboarding: Customize experience (3 of 6)

- **Screen:** Onboarding, step 3
- **Theme:** Light only
- **Approval status:** APPROVED
- **Approved design principles:** four stacked selector rows (Country,
  Language, Currency, Appearance) each showing the current value with a
  chevron, plus a "safe and private experience" trust note. Confirms
  Appearance (Light/Dark/System) is offered during onboarding itself, not
  only in Settings.
- **Known textual corrections:** none identified.

## REF-03C — Onboarding: Privacy first (approved step 5 of 6)

- **Screen:** Onboarding, step 5
- **Theme:** Light only
- **Approval status:** APPROVED — **high-value reference**, directly informs
  the local-first/privacy messaging required by the 2026-08-24 Product/
  Security addendum. Step position (5 of 6) confirmed correct by the
  2026-08-26 Product Owner ruling on onboarding length.
- **Approved design principles:** exactly three principle cards — data
  starts locally and stays under your control (phone+lock icon); sync is
  optional, enable later (cloud icon); permissions requested only when
  needed (shield-check icon) — followed by an explicit acknowledgement row
  ("فهمت وأوافق") before continuing.
- **Known textual corrections:** none. **RESOLVED (2026-08-26):** the
  6-step onboarding length (REF-02/03/03B/03D/03C/03E) is explicitly
  approved as intentionally short — the step-count question this register
  previously flagged against the 2026-08-24 addendum is settled, not open.

## REF-03D — Onboarding: Create first wallet (source labeled "1 of 6"; approved canonical position: step 4 of 6)

- **Screen:** Onboarding, "Create first wallet" step
- **Theme:** Light only
- **Approval status:** APPROVED for content. **Numbering RESOLVED
  (2026-08-26):** the Product Owner's approved 6-step order names this step
  explicitly as step 4 ("Create first wallet"), settling the numbering
  inconsistency this register previously flagged.
- **Approved design principles:** wallet name field (defaults to "المحفظة
  الرئيسية", editable), currency confirmed from the earlier step (read-only
  display, IQD), single primary CTA ("متابعة"). Consistent with the ruling's
  explicit "no opening balance requirement during onboarding" — this step
  asks only for a wallet name and shows the already-chosen currency, no
  balance figure is requested here.
- **Known textual corrections / artifacts to ignore:** the source mockup was
  labeled "1 من 6", identical to REF-02 (Welcome). This was a
  step-numbering/generation artifact in the source image, not a Product
  Owner position — the canonical order is now fixed by the 2026-08-26
  ruling: Welcome(1) → Priorities(2) → Customize(3) → **this step(4)** →
  Privacy(5) → Complete(6). Implementation must renumber this screen's
  progress indicator to "4 of 6."

## REF-03E — Onboarding: Complete (6 of 6)

- **Screen:** Onboarding, final step
- **Theme:** Light only
- **Approval status:** APPROVED
- **Approved design principles:** success state (checkmark + sparkle
  decoration, not a photo/illustration), a compact confirmation summary
  (Priorities / Country / Currency / Wallet) each with a reversibility note,
  single primary CTA ("ابدأ استخدام MYFI").
- **Known textual corrections:** none identified.

## Onboarding — additional approved rules (2026-08-26, not visible in any single image)

None of REF-02/03/03B/03D/03C/03E show an account-type selector or an
opening-balance entry field, so no image conflicts with the following — they
are recorded here as explicit approved rules governing the whole onboarding
sequence, to prevent a future implementation from adding them anyway:

- **No Personal / Business / Dual account-type selection** anywhere in
  onboarding.
- **No opening-balance requirement** during onboarding (REF-03D's wallet
  step asks only for a name, consistent with this).
- **Permissions are requested contextually**, at the moment a related
  feature is first used — never bundled into onboarding itself.
- **Existing users get a short "What Changed" experience**, not the full
  6-step onboarding sequence, on any future update that would otherwise
  re-trigger it.

## REF-04 — My Money (أموالي) hub + drill-down flow

- **Screen:** My Money, plus its four gateway detail screens
- **Theme:** Light only
- **Approval status:** APPROVED — **primary reference for the entire My
  Money destination**, which has no current 1:1 code screen.
- **Approved design principles:**
  - Exactly four numbered gateway cards, matching the Blueprint's "four
    first-class gateways" literally: 1) المحافظ والحسابات (Wallets &
    Accounts), 2) الحركات والسجل (Transactions & History), 3) الخطة
    والميزانية (Plan & Budget), 4) التقارير والتحليلات (Reports &
    Analytics) — each card shows a live summary stat and a named link that
    opens a dedicated full-screen destination.
  - The four destinations shown are: a Wallets screen (total + per-wallet +
    a separate bank-accounts section — **correction, 2026-08-26: external
    bank/card-aggregation linkage is FUTURE/CONDITIONAL, not a current
    product capability; do not infer live banking integration from this
    mockup, and the current target must work fully without it**), a History
    screen (filter tabs +
    search + date-grouped list), a Budget screen (donut chart + category
    breakdown with percentages), and a Reports screen (tabbed overview +
    top-5-categories list + "view full report").
  - "اختصارات سريعة" quick-shortcut row beneath the four cards: Transfer,
    Add transaction, New budget, Quick report.
  - An explicit, literal **navigation-rules legend** is shown on-canvas:
    "View something → full Page", "simple Add → Bottom Sheet", "complex
    action → full flow" — this is a direct, almost verbatim restatement of
    Blueprint §21 and should be treated as confirmed, stable global
    navigation doctrine, not just a My Money-local note.
- **Known textual corrections:** none identified — this reference is
  internally consistent with the Blueprint text.
- **Global Design System principles derived:** the View/Add/Complex-flow
  navigation-pattern legend (→ `03_MYFI_DESIGN_SYSTEM_CANONICAL.md` §Navigation).
- **Canonical documents influenced:** `03_MYFI_DESIGN_SYSTEM_CANONICAL.md`,
  `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md` (My Money + 4 sub-screens),
  `archive/MYFI_BLUEPRINT_REVISION_MAP.md`.

## REF-05 — Follow-ups (المتابعات) hub + breakdown

- **Screen:** Follow-ups, plus its six section detail screens
- **Theme:** Light only
- **Approval status:** APPROVED — primary reference for the Follow-ups
  destination.
- **Approved design principles:**
  - "ملخص المتابعات" summary strip: five live counters (Upcoming
    commitments / Upcoming installments / Renewing subscription / Active
    goals / Amount owed).
  - Quick Add row: exactly Debt / Receivable / Commitment / Goal — matches
    the Blueprint's Follow-ups Quick Add set literally.
  - "يحتاج انتباهك" (Needs attention) list — colored left-accent bar per
    item type, a type pill (Commitment/Debt/Subscription), due-date text.
  - "ملخص سريع" four-stat colored grid: Debts (red) / Receivables (green) /
    Commitments (orange) / Goals (purple).
  - "الأقسام الرئيسية" — six navigable rows, each with a count/total and a
    one-line description: Debts & Receivables, Commitments, Installments,
    Subscriptions, Goals & Savings, **Payment History (سجل الدفعات)** — this
    directly confirms Payment History as a first-class Follow-ups section,
    not a buried sub-view.
  - A floating "+" plus an explicit on-canvas note that the Quick-Add row
    here uses "نفس النمط في الرئيسية" (the same pattern as Home) — this is
    direct visual confirmation of the global, single Add-Method setting
    applying to both Home and Follow-ups (Blueprint §3.12), which code
    verification also confirms is already implemented (`App.js:1047-1049`,
    `TrackersLabScreen.js:726-739`). **Correction (2026-08-26):** the source
    image rendered this floating `+` in purple. **Purple is not established
    as the canonical Side `+` button color** merely because a generated
    reference showed it — the global Side `+` button belongs to the MYFI
    olive/green brand system unless device testing later proves a better
    accessible treatment. Purple remains available only where a governed
    semantic/category role justifies it (e.g. the Goals category color),
    not for the global Add control.
- **Known textual corrections:** none identified.
- **Canonical documents influenced:** `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`
  (Follow-ups + 6 sub-sections), `05_MYFI_COMPONENT_ARCHITECTURE.md`
  (FollowUpCard, PaymentHistoryRow).

## REF-06 — More (المزيد), Light + Dark + breakdown

- **Screen:** More, plus its five section detail breakdowns
- **Theme:** Both
- **Approval status:** APPROVED
- **Approved design principles:**
  - "اختصاراتي" (My Shortcuts) card at the top: **exactly three**
    user-customizable shortcut icons with an "edit"/reorder affordance and
    pagination dots — confirms the "three user-selected shortcuts" detail
    from the latest instruction (§3.11).
  - Five main rows, each icon+title+one-line description+chevron: أدواتي
    (My Tools), البيانات والملفات (Data & Files), المزايا (Benefits, crown
    icon), المساعدة (Help), الإعدادات (Settings) — confirms More's approved
    top-level set exactly.
  - Detail breakdown per section: My Tools → Categories, Currencies &
    Accounts, Templates, Archive, Feature visibility, Shortcuts management.
    Data & Files → Backup, Restore, Export, Import, File management, Delete
    local data (destructive, red). Benefits → Premium, Rewards, Invite a
    friend, Cross-device access. Help → Help center, Contact us, FAQ,
    What's new, Service status. Settings (preview only, see REF-07 for the
    actual screen) → General, Account & Sync, Privacy & Security,
    Notifications, App management, About.
- **Known textual corrections:** none identified. Note: the
  "الإعدادات" column here is a **preview/summary of Settings' content
  inside More's own breakdown graphic**, not a claim that Settings' actual
  root screen shows these exact six items — see REF-07 for the authoritative
  Settings root.
- **Canonical documents influenced:** `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`
  (More + 5 sub-sections, Archive relocation), `05_MYFI_COMPONENT_ARCHITECTURE.md`.

## REF-07 — Settings (الإعدادات), Light + Dark + breakdown

- **Screen:** Settings, plus its five section detail breakdowns
- **Theme:** Both
- **Approval status:** APPROVED — **authoritative reference resolving the
  previously-unverified Settings root structure.**
- **Approved design principles:**
  - Header uses a **search icon** (not present on other screens' headers)
    and no separate profile icon — profile access is via the Account & Sync
    card itself.
  - Root list is **exactly five rows**, matching the Blueprint's approved
    structure one-to-one: 1) Account & Sync (top card, avatar + account
    identity/verified badge + live sync status — **correction, 2026-08-26:
    the source image's "Personal account" label must not be encoded as an
    MYFI account-type model; the approved onboarding removed Personal/
    Business/Dual entirely, so this card may show identity, sync status,
    verification, and account actions, but never an account-type
    selector**), 2) Appearance & Language,
    3) Financial Preferences ("العملة، الموازنة، الفئات، الحسابات" — wait:
    labeled "الإعدادات المالية" but subtitle mentions currency/budget/
    categories/accounts), 4) Notifications & Reminders, 5) Privacy &
    Security. **No duplicate Account/Sync row appears beneath the top
    card.**
  - Detail breakdown per section: Account & Sync → account info,
    devices & sessions, sync & backup, password recovery, sign out, delete
    account (destructive). Appearance & Language → theme (Light/Dark/Auto),
    language, font size, **and an "accent color" swatch picker (5 colors)**.
    Financial Preferences → base currency, budget method, categories,
    accounts, **and a "payment methods" row (cards & digital wallets)**,
    plus a VAT/rounding row. Notifications → transaction alerts, reminders,
    weekly reports, offers/news, per-channel toggles (in-app/email/push),
    do-not-disturb hours. Privacy & Security → app lock (biometric),
    passcode change, re-lock duration, hide balances, hide notification
    amounts, session management, privacy link.
- **CONFLICTS WITH EXPLICIT TEXTUAL PRODUCT OWNER DECISIONS — do not
  promote into canonical rules:**
  1. **Accent color picker** ("لون التمييز", 5 swatches, green
     pre-selected) under Appearance & Language directly contradicts the
     Blueprint's explicit "DO NOT introduce user-selectable brand accent
     colors at this stage." **Resolution: REJECTED FOR CURRENT TARGET
     (Product Owner ruling, 2026-08-26).** No accent-color picker is
     canonical; this is now a settled status, not an open decision.
  2. **"Payment methods" (cards & digital wallets) row** under Financial
     Preferences is not named anywhere in the Blueprint's approved Financial
     Preferences scope. **Resolution: REJECTED FOR CURRENT TARGET /
     REMOVE FROM TARGET (Product Owner ruling, 2026-08-26).** Not to be
     inferred into implementation absent a fresh, explicit product
     requirement.
  3. **VAT/tax and rounding-method row** under Financial Preferences —
     similarly not named in the Blueprint's approved scope. **Resolution:
     REJECTED FOR CURRENT TARGET / REMOVE FROM TARGET (Product Owner
     ruling, 2026-08-26).**
  4. **Country and Base Currency placement — RESOLVED (2026-08-26):**
     approved under **Financial Preferences**, not Appearance & Language.
     Current code (`SettingsScreen.js:1402-1403`) groups Country/Currency
     with Language/Theme — a confirmed code-vs-target gap for the
     implementation phase, not an open design question.
- **Canonical documents influenced:** `07_MYFI_SCREEN_DESIGN_SPECIFICATIONS.md`
  (Settings root + 5 sections), `04_MYFI_DESIGN_TOKEN_CATALOG.md` (explicitly
  documents the rejected accent-color token), `archive/MYFI_BLUEPRINT_REVISION_MAP.md`.

---

## Summary table

| Ref | Screen | Theme | Status | File | Key conflict/artifact |
|---|---|---|---|---|---|
| REF-01 | Home | Both | Approved (nav labels excluded) | `assets/REF-01-home.jpeg` | Bottom-nav labels superseded by REF-04–07 + Blueprint text |
| REF-02 | Onboarding 1/6 Welcome | Light | Approved | `assets/REF-02-onboarding-welcome.jpeg` | none |
| REF-03 | Onboarding 2/6 Priorities | Light | Approved | `assets/REF-03-onboarding-priorities.jpeg` | none |
| REF-03B | Onboarding 3/6 Customize | Light | Approved | `assets/REF-03B-onboarding-customize.jpeg` | none |
| REF-03C | Onboarding 5/6 Privacy | Light | Approved | `assets/REF-03C-onboarding-privacy.jpeg` | step-count question resolved 2026-08-26 (approved as intentionally short) |
| REF-03D | Onboarding: create first wallet | Light | Approved, canonical step 4 of 6 | `assets/REF-03D-onboarding-wallet-setup.jpeg` | Source mislabeled "1 of 6" — resolved 2026-08-26 |
| REF-03E | Onboarding 6/6 Complete | Light | Approved | `assets/REF-03E-onboarding-complete.jpeg` | none |
| REF-04 | My Money hub | Light | Approved | `assets/REF-04-mymoney-hub.jpeg` | **2026-08-27:** the real file is a numbered 1–4 vertical drill-through list (Wallets/Accounts, Transactions/Log, Plan/Budget, Reports/Analytics), NOT a "4 gateways" grid as this table previously described — that description was written before the file existed. Current repo (`MyMoneyScreen.js`, Step 3) uses a GatewayCard grid instead; structural gap, not yet reconciled. |
| REF-05 | Follow-ups hub + 6 sections | Light | Approved | `assets/REF-05-followups-hub.jpeg` | none |
| REF-06 | More + 5 sections | Both | Approved | `assets/REF-06-more-hub.jpeg` | none |
| REF-07 | Settings + 5 sections | Both | Approved (structure); 3 content items rejected | `assets/REF-07-settings.jpeg` | accent color, payment methods, VAT/rounding — all REJECTED FOR CURRENT TARGET 2026-08-26; Country/Currency → Financial Preferences, approved |
