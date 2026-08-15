# MYFI — Financial Contract

## قواعد غير قابلة للتفاوض

1. التاريخ المالي لا يعاد تفسيره بسبب country/login/guest merge/archive/restore/sync/timezone/upgrade.
2. Local-first: durable SQLite commit يسبق UI success، والـCloud لاحقاً.
3. money calculations تعتمد integer minor units؛ decimals للعرض/الإدخال فقط.
4. كل رصيد يجب أن يكون قابلاً للاشتقاق من authoritative postings.
5. لا silent repair؛ mismatch مالي يُكتشف ويُصنف ويوقف العملية الخطرة.
6. IDs المالية immutable؛ edit يرفع revision بدلاً من delete/create غير مرتبط.
7. delete المالي الافتراضي void/tombstone، لا disappearance غير قابل للتتبع.
8. historical FX snapshot immutable؛ current valuation rate مفهوم منفصل.
9. transfer = source posting + destination posting + optional fee + FX snapshot عند اختلاف العملات؛ لا يحسب كـincome/expense.
10. outbox mutation يجب أن تكون في نفس SQLite transaction مع financial write.

## Atomic write boundary

`BEGIN → entity/header → postings → links → revision → outbox → COMMIT → UI cache → success`.

R01 لا يعلن أن كل الشاشات وصلت لهذا الهدف؛ هذا هو العقد الذي تقاس عليه مراحل write/read cutover اللاحقة.

## R04 Contract Freeze — before operational V7 cutover

- Base currency is explicitly user-confirmed before first financial history. Country can suggest a currency but never owns or silently changes it.
- Budgets are currency-sensitive financial state and participate in the base-currency lock.
- Foreign transaction/reconciliation FX must be explicit historical input when required; wallet current valuation is not a historical-FX fallback.
- Tracker/category/wallet lifecycle operations are metadata operations and cannot erase or relabel posted financial truth.
- Broken linked identities block for review; labels/names/single-candidate heuristics are not valid financial identity repair.
- Feature visibility cannot change financial totals or hide authoritative rows from reports/history.
- Unknown wallet references in restore input are blocking validation errors; no default-wallet auto-repair.
- Current user-facing scope does not yet claim advanced amortized-loan interest/principal schedules, three-layer merchant/settlement/reporting currency, third-currency transfer fees, or refund/reversal workflow semantics. These cases must not be silently guessed or mapped to a different financial meaning.
