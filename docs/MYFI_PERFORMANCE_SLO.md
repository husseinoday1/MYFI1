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

WAL + foreign_keys=ON + busy_timeout=5000 موجودة في connection setup، ويقوم device harness بتسجيلها مع quick_check ومدة التنفيذ. لا نغير synchronous/checkpoint policy بلا benchmark/crash-safety evidence.
