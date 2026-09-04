# MYFI — Performance / Reliability SLO

R01 يسجل baseline ولا يحسن Hybrid architecture بصورة عمياء.

## SLO design rules

- financial history لا تحمل كاملة إلى Zustand عند اكتمال read cutover.
- History تستخدم pagination مستقرة؛ deep OFFSET يتجنب عند الحاجة.
- Reports تعتمد SQL/integer-safe aggregates.
- Search لا يعمل `LIKE %query%` على payload_json لكل ledger.
- tracker/detail queries scoped، وليست full-history scans.

## Reliability probes المطلوبة عبر المراحل

app kill mid-command/after commit، DB busy/lock contention، low storage/disk full، interrupted WAL checkpoint/migration، FK violation، integrity/quick_check failure.

## SQLite operational baseline في R01

WAL + foreign_keys=ON + busy_timeout=5000 + synchronous=NORMAL كلها مثبّتة في
connection setup داخل `ledgerDatabase.getLedgerDb()` وحدها، ويؤكدها device harness
عند التشغيل على جهاز حقيقي مع `PRAGMA quick_check`.

تصحيح (2026-09-04): النسخة السابقة من هذه الفقرة قالت إن الـharness يسجّل الـprobes
"مع quick_check ومدة التنفيذ". الـquick_check مسجّل فعلاً، لكن "مدة التنفيذ" رقم واحد
لكامل الجولة (`durationMs` في `financialLedgerV7DeviceHarness`)، وليست مدة لكل probe.
لا توجد حتى الآن أي أدوات قياس p50/p95 في `src/`.

`synchronous` كان يُضبط سابقاً داخل schema bootstrap الخاص بـ`activeLedgerRepository`،
فكانت قيمته تعتمد على ترتيب الاستدعاء (FULL قبله، NORMAL بعده) على نفس الاتصال المشترك.
ثُبِّت الآن على NORMAL مع reason + benchmark، وcrash-safety evidence ما زالت ناقصة
وتنتظر §101. التفاصيل:
`docs/04_CURRENT_EVIDENCE/MYFI_PHASE15_SQLITE_CONFIG_AUDIT_2026-09-04.md`.

لا نغير synchronous/checkpoint policy بلا benchmark/crash-safety evidence.
checkpoint policy لم تُضبط بعد عمداً (تنتظر قياس حجم WAL في §98).
