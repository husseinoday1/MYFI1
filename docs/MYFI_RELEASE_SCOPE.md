# MYFI — Production Release Scope

## Included target
Local ledger، wallets، income/expense، transfers/fees، multi-currency، debt/receivables، goals/commitments، budgets، reports/history، recurring، archive، backup/restore، account lifecycle، optional cloud sync، Android production release.

## Conditional
OCR، Voice، Multi-device sync؛ لا توصف Production-ready قبل gates الخاصة بها.

## Deferred/Hidden إذا غير مكتملة
Workspaces/shared ledgers، experimental screens، developer/performance screens.

## Feature freeze
حتى Operational Canonical Cutover لا نضيف feature جديدة إلا إذا تحمي المال أو مطلوبة للمigration/testing أو release blocker.

## R01 scope
Phase 0 contracts + Phase 1 native/SQLite proof preparation + Phase 2 migration infrastructure. لا يشمل Phase 3 Base Currency/Guest Merge/FX/Archive/Date/Opening Balance fixes، ولا أي deletion للlegacy paths.
