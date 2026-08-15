# MYFI — Date / Time Contract

- `transaction_date`: تاريخ مالي بصيغة `YYYY-MM-DD` ولا يعاد تفسيره بسبب timezone أو وقت sync.
- `created_at` و`updated_at`: UTC timestamps تقنية.
- `server_received_at`: sync/audit timestamp ولا يحدد الشهر المالي.
- `rate_date`: تاريخ سعر الصرف التاريخي المرتبط بالمعاملة.
- report month يعتمد `transaction_date`، لا created/sync timestamp.

مثال: عملية `2026-12-31` تبقى في تقرير ديسمبر حتى لو أنشئت/زامنت لاحقاً أو تغير timezone.

R01 يوثق العقد فقط؛ inventory/audit الكامل لمسارات التاريخ في reports/recurring/backup/restore/sync هو Phase 3.
