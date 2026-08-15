# MYFI — Data Ownership Contract

## الهدف النهائي

SQLite هو المالك الوحيد للحقيقة المالية التشغيلية: ledger identity، wallets، transactions، postings، historical FX، debts/receivables، goals، commitments، budgets، recurring rules، archive metadata، reconciliation، mutation outbox، sync inbox/cursors، وfinancial schema version.

## ملكية غير مالية

- Preferences/Profile: theme، language، country، rotation وأشباهها.
- Zustand: session/UI/query cache فقط؛ لا يكون قاعدة مالية موازية.
- SecureStore: auth/session secrets ومفاتيح حساسة فقط.
- Supabase: Auth + transport/replication؛ ليس الشرط لوجود أو استعمال ledger محلي.

## Current Real State عند R01

البرنامج ما زال Hybrid/transition: V7 موجود، لكن Vault/Zustand/compatibility paths لم تُلغَ بعد. هذا مقصود حتى Gates اللاحقة. يمنع حذف legacy recovery أو snapshot sync قبل gates الصريحة.

## Base Currency

`Base Currency` خاصية هوية للـLedger وليست preference عرض. نقلها وإقفال تغييرها بعد وجود history هو عمل Phase 3؛ R01 لا يغيّرها.

## Account relation

Ledger identity يجب أن تبقى مستقلة عن Supabase user id. Logout/Delete Account لا يساوي Delete Local Financial Data.

## R04 Operational Ownership

After Phase 8 succeeds, V7 SQLite becomes the operational source of truth. The old relational mirror is frozen and Zustand holds only bounded UI/query cache data.

The active local ledger namespace is persisted independently from authentication state. Ordinary Logout removes the cloud session but keeps the same local ledger active. Auth user id is an optional link/replication identity, not the local ledger identity.
