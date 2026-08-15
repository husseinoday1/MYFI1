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
