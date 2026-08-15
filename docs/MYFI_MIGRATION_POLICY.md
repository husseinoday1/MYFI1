# MYFI — SQLite Migration Policy

## Journal

الجدول `schema_migrations` يسجل: migration_id، from/to version، checksum، started/completed، status، app_version، attempts، last_error.

## قواعد migration

- forward-only.
- deterministic.
- idempotent أو محمية من double application.
- checksum verified؛ تغيير migration سبق تسجيلها يوقف startup المالي.
- DDL/data step داخل transaction حيث يدعم SQLite.
- journal `running` يكتب قبل transaction حتى يمكن كشف interruption.
- crash بعد commit وقبل journal completion آمن لأن migration يجب أن تعاد idempotently.
- failure يسجل `failed` ولا يسمح للfinancial command بالاستمرار.
- بعد migration يثبت `PRAGMA user_version` وتنفذ health check.

## V7 adoption في R01

`0007_financial_ledger_v7_baseline` تتبنى قواعد V7 الحالية وتصلح/تضيف فقط بنية schema المطلوبة بشكل idempotent. لا تعدل transaction amounts/postings/FX أو أي financial value موجودة.

## Rollback

Schema migrations forward-only في بيانات المستخدم. Rollback البرمجي لـR01 يعني الرجوع للكود السابق فقط قبل الاعتماد الإنتاجي؛ لا ننفذ downgrade destructive على DB. لذلك اختبار old DB → upgrade → verify إلزامي قبل إغلاق Phase 2 على الجهاز.
