# MYFI — Canonical Design Token Catalog

**Registered:** 2026-08-25 · **Status:** CANONICAL
**Basis:** current tokens verified directly in `src/lib/theme.js` and
`src/lib/tokens.js` at HEAD `d2ed3ae03c137d818040dfe77c665c516b8440b7`, target
values per `MYFI_VISUAL_IDENTITY_CANONICAL.md` and the approved visual
references (`MYFI_APPROVED_VISUAL_REFERENCE_REGISTER.md`).

Legend: **Current** = confirmed value in code today. **Target** = this
document's recommendation. **Migration note** = what changes and why.
No row in this catalog authorizes a code change by itself — implementation
requires a separate approved package.

## Brand tokens

**Brand/income independence — Status: APPROVED (2026-08-26).** `brand.primary`
and `financial.income` must be independent semantic roles, not coupled
through the same source token; they may still resolve to the same visible
value today. See the `financial.income` row below.


| Token | Purpose | Current | Target (Light) | Target (Dark) | Migration note |
|---|---|---|---|---|---|
| `brand.primary` | The one MYFI accent color | `primary = BRAND_GREEN (#138A57)` (`theme.js:11`) | `#138A57` (unchanged) | `#138A57` (unchanged, confirm dark-surface contrast) | Keep value; **decouple as its own key**, see below |
| `brand.soft` | Low-emphasis brand tint | `primSoft = rgba(22,155,98,0.12)` (`theme.js:14`) | unchanged | unchanged | Keep |
| `brand.onPrimary` | Text/icon on brand-green surfaces | `onPrimary = #FFFFFF` | unchanged | unchanged | Keep |

**No `brand.accent` / user-selectable accent token exists or is approved.**
REF-07's 5-swatch accent picker is explicitly rejected — see
`MYFI_VISUAL_IDENTITY_CANONICAL.md` §3 and the Visual Reference Register.

## Semantic financial tokens

| Token | Purpose | Current | Prohibited misuse | Migration note |
|---|---|---|---|---|
| `financial.income` | Income amounts/accents | `inc = BRAND_GREEN` (`theme.js:16`) — **same literal as `brand.primary`** | Must not be re-purposed as a generic "positive" UI color outside financial amounts | **Split from `brand.primary`.** Keep the same visible green initially (no visual change required), but define as an independently-assignable token so changing brand color does not silently change income color and vice versa. This satisfies the corrected rule ("independent semantic roles," not "different literal values") |
| `financial.expense` | Expense amounts/accents | `exp = #C74F5C` (light) / `#E06B76` (dark) (`theme.js:18` approx.) | Must not be reused for generic "negative"/error UI | Keep value, keep as-is |
| `financial.transfer` | Transfer-type entries | **Does not exist** — transfers currently borrow `primary` (`HistoryScreen.js:465`) | Must not equal `income` or `expense` | **Add new token.** Recommend a neutral blue or the existing `primary`-adjacent tone, distinct enough from income green — exact hue is an implementation-phase decision, not fixed here |
| `financial.warning` | Warnings, balance adjustments | `warn`/`warnBg` (confirmed present) | Must not be reused for destructive actions | Keep |
| `financial.danger` | Destructive actions (delete account, delete data) | **Does not exist** | Must not equal `warning` or `expense` | **Add new token.** REF-06's "حذف البيانات المحلية" and REF-07's "حذف الحساب" rows are the concrete use cases — both currently likely reuse `expense` red; give destructive actions their own token so expense-red and danger-red can diverge later if needed |
| `financial.positive` / `financial.neutral` | Generic positive/neutral indicators outside a strict income/expense context (e.g. goal progress) | Not separately defined — goal progress bars in REF-04/REF-05 use green | Should alias `income` unless evidence requires a distinct hue | Decide during token-split implementation |

## Category tokens

**Status: APPROVED DIRECTION (2026-08-26).** Governed per
`MYFI_VISUAL_IDENTITY_CANONICAL.md` §5 — broader-than-brand palette is
sanctioned, must be muted/controlled, must never substitute for brand or
financial-semantic tokens, must hold contrast in both themes, must never be
the sole category identifier, and must stay centrally defined (already true
structurally — `CAT_COLORS` is one file).

**Audited value-by-value recommendation** (current `CAT_COLORS`,
`src/lib/constants.js:344-348`, in declared order):

| # | Current hex | Issue found | Recommended muted target | Action |
|---|---|---|---|---|
| 1 | `#3ecf6e` | Bright, saturated green — close enough to `financial.income`/`brand.primary` to risk confusion in a category chip next to an amount | `#5FAE83` (muted sage-green) | ADJUST |
| 2 | `#38bdf8` | Bright sky blue, oversaturated for a restrained palette | `#6FA0C4` (muted slate-blue) | ADJUST |
| 3 | `#f6ad55` | Bright orange | `#C99860` (muted terracotta) | ADJUST |
| 4 | `#94a3b8` | Already a muted slate gray | — | KEEP |
| 5 | `#fc8181` | Salmon/red — risks visual confusion with `financial.expense`/`financial.danger` | `#C08080` (muted brick-rose) | ADJUST |
| 6 | `#fb923c` | Near-duplicate hue family with #3 (both orange) | `#B98A5E` (muted amber-brown, shifted from #3 for distinguishability) | ADJUST + differentiate from #3 |
| 7 | `#a78bfa` | Bright purple, oversaturated | `#8D7CB8` (muted purple) | ADJUST |
| 8 | `#6b7280` | Already a muted gray | — | KEEP |
| 9 | `#f472b6` | Bright pink, oversaturated | `#C480A0` (muted rose) | ADJUST |
| 10 | `#34d399` | Near-duplicate hue family with #1 (both green) | `#4F9E8A` (muted teal-green, shifted from #1 for distinguishability) | ADJUST + differentiate from #1 |
| 11 | `#fbbf24` | Bright amber/yellow — risks confusion with `financial.warning` | `#C9A94A` (muted gold) | ADJUST |
| 12 | `#60a5fa` | Near-duplicate hue family with #2 (both blue) | `#6E8FB0` (muted steel-blue, shifted from #2 for distinguishability) | ADJUST + differentiate from #2 |

**Secondary finding:** the 12-slot palette currently only spans about 9
distinguishable hue families (green×2, blue×2, orange×2, plus gray×2, purple,
pink, amber) — pairs (1,10), (2,12), (3,6) are close enough to reduce
practical distinguishability once muted. The recommended targets above shift
each pair apart slightly for this reason; a full accessibility/contrast pass
against both Light and Dark surfaces is still an implementation-phase task,
not decided by this document.

| Token | Purpose | Current | Target | Migration note |
|---|---|---|---|---|
| `category.palette[1..12]` | Category tag identity | `CAT_COLORS`, 12 hues (`constants.js:344-348`) | Muted set above | Governance approved; exact hex confirmed pending implementation-time contrast pass |
| `category.default[...]` | Default per-category-type colors | `constants.js:153-160` | Reviewed alongside `category.palette` | Same governance |

**No payment-method, card, bank, VAT, or rounding-method tokens are defined
in this catalog — Status: REJECTED FOR CURRENT TARGET (2026-08-26).** These
are not approved MYFI capabilities; no token, component, or Settings row for
them should be created from mockup artifacts.

## Surface / background / text / border tokens

| Token | Purpose | Current | Migration note |
|---|---|---|---|
| `surface.background` | Page background | `bg` (`theme.js:5`) | Keep |
| `surface.card` | Default card surface | `card` (`theme.js:6`) | Keep |
| `surface.cardHigh` | Elevated/emphasized card | `cardHigh` (`theme.js:7`) | Keep |
| `surface.input` | Input field background | `input` (`theme.js:8`) | Keep |
| `surface.nav` | Bottom navigation background | `nav` (`theme.js:9`) | Keep |
| `text.primary` / `text.secondary` / `text.muted` | Text hierarchy | Present in `theme.js` (exact keys not exhaustively enumerated in this pass) | Confirm full key list during implementation; not blocking for this document |
| `border.default` / `border.strong` | Dividers, outlines | Present, not exhaustively enumerated | Confirm during implementation |

## Typography tokens (`TYPE`, `src/lib/tokens.js:6-13`)

| Token | Current value | Usage | Migration note |
|---|---|---|---|
| `hero` | 28 | Balance-card amount (REF-01) | Keep |
| `title` | 22 | Page/section titles | Keep |
| `section` | 14 | Section headers | Keep |
| `body` | 14 | Default body text | Keep |
| `meta` | 12 | Secondary/meta text | Keep |
| `tiny` / `caption` | 12 | Fine print | Keep |

**Adoption gap (not a value problem):** 532 raw `fontSize` literals exist in
`src/screens/*.js` against 15 uses of `TYPE`. No new sizes are proposed;
`MYFI_COMPONENT_INVENTORY_AND_MIGRATION.md` tracks the adoption migration.

## Spacing tokens (`SPACE`, `tokens.js:20-29`)

Existing scale confirmed present and structurally sound. Adoption gap: 23
uses of `SPACE` against 614 raw padding/margin literals in screens. No new
scale values proposed here; this is a migration-adoption item.

## Radius tokens (`RADIUS`, `tokens.js:31-38`)

Existing scale confirmed present (small/medium/large/pill family). Adoption
gap: 158 uses against 286 raw `borderRadius` literals. No new values
proposed; migration-adoption item.

## Elevation tokens (`SHADOW`, `tokens.js:40-86`)

Existing `Platform.select`-based tiers (`card`/`subtle`/`float`) confirmed
well-adopted already (only 1 raw shadow literal found outside the token
system). **No migration needed here** — this is the one token family already
close to fully adopted; use it as the template for how the others should
work.

## Icon tokens

| Token | Purpose | Current | Migration note |
|---|---|---|---|
| `icon.family` | The one icon set | `Ionicons` (`@expo/vector-icons`), 31 files, zero exceptions | Already canonical, no change |
| `icon.container.*` | Tinted rounded container behind action icons | Ad hoc per screen (REF-01/REF-05 Quick Add circles) | Formalize as a primitive per `MYFI_DESIGN_SYSTEM_CANONICAL.md` |
