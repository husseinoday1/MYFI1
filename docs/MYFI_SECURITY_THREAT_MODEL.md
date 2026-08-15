# MYFI — Security Threat Model

## Assets
financial SQLite DB، backups، credentials، OCR images، voice artifacts، cloud mutations.

## Threats
stolen device، malicious backup access، cloud-account compromise، cross-account leakage، accidental export، sensitive logs، tampered backup، replayed mutation.

## R01 decisions

- Android source manifest يجب أن يحتوي `android:allowBackup=false`؛ التحقق من merged release artifact يبقى gate لاحقاً.
- SQLite حالياً plaintext. لا ندعي local DB encryption. قرار SQLCipher مؤجل حتى يوجد compatibility/performance/migration/recovery/native evidence.
- SecureStore يبقى للأسرار، وليس financial ledger.
- diagnostics/logging لا تحتوي notes/raw financial history/secrets.
- production signing الحالي غير مثبت؛ debug signing لا يعتبر Release Ready.

## قاعدة

لا نضيف آلية أمنية شكلية إذا لم نستطع اختبار recovery/compatibility لها.
