# MYFI — Backup Format Contract

Backup هو disaster recovery وليس Sync ولا Archive.

الحزمة النهائية versioned logical package وتضم: manifest، backup_format_version، schema_version، semantic_hash_version، created_at، app_version، ledger metadata، financial data، integrity/encryption metadata.

تشمل ledger/wallets/transactions/postings/FX/debts/receivables/goals/commitments/budgets/recurring/archive metadata/reconciliation/relevant financial config. لا تشمل auth tokens أو SecureStore keys أو biometric secrets.

Restore النهائي يكون staged: decrypt → parse → schema validate → staged import → financial health → semantic validation → promotion تحت maintenance lock. لا overwrite مباشر ولا half-restored ledger.

R01 لا يغير backup/restore implementation؛ هذا العقد يمنع تضارب العمل اللاحق.
