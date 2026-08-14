# MYFI — SQLite Financial Core V7

الحالة: منفّذ محلياً ومربوط بمسارات الكتابة والقراءة  
يعتمد على: [Financial Model 2.0](./FINANCIAL_MODEL_2_0_AR.md)

## الهدف

V7 يستبدل نموذج `ledger_transactions` العريض وحقول `REAL` بنموذج داخلي `FinancialTransaction + Postings`. واجهة المستخدم تبقى بسيطة، بينما التحويلات والرسوم والتخصيصات تُحفظ داخلياً كأرجل مالية مترابطة. أصبح SQLite مصدر الحقيقة بعد Shadow Migration متطابق، ويبقى Vault/Snapshot fallback مؤقتاً فقط للحماية والتوافق.

## الجداول الملزمة

```text
ledger_currencies
  code TEXT PRIMARY KEY
  minor_exponent INTEGER NOT NULL

ledger_accounts
  namespace TEXT
  id TEXT
  name TEXT
  account_type TEXT
  scope TEXT
  currency_code TEXT -> ledger_currencies.code
  status TEXT
  created_at TEXT
  updated_at TEXT
  archived_at TEXT NULL
  PRIMARY KEY(namespace, id)

ledger_exchange_rates
  namespace TEXT
  id TEXT
  base_currency_code TEXT
  quote_currency_code TEXT
  numerator INTEGER
  denominator INTEGER
  rate_date TEXT
  source TEXT
  captured_at TEXT
  PRIMARY KEY(namespace, id)

ledger_financial_transactions
  namespace TEXT
  id TEXT
  kind TEXT
  status TEXT
  scope TEXT
  date_iso TEXT
  occurred_at TEXT
  category_id TEXT NULL
  title TEXT
  note TEXT
  source_type TEXT NULL
  source_id TEXT NULL
  idempotency_key TEXT
  device_id TEXT
  revision INTEGER
  archive_year INTEGER NULL
  archived_at TEXT NULL
  deleted_at TEXT NULL
  created_at TEXT
  updated_at TEXT
  PRIMARY KEY(namespace, id)
  UNIQUE(namespace, idempotency_key)

ledger_postings
  namespace TEXT
  id TEXT
  transaction_id TEXT -> ledger_financial_transactions
  account_id TEXT -> ledger_accounts
  bucket TEXT CHECK physical|reserved
  role TEXT
  amount_minor INTEGER NOT NULL
  currency_code TEXT
  exchange_rate_id TEXT NULL -> ledger_exchange_rates
  created_at TEXT
  PRIMARY KEY(namespace, id)

ledger_transaction_links
  namespace TEXT
  id TEXT
  transaction_id TEXT
  link_type TEXT
  link_id TEXT
  relation TEXT
  applied_amount_minor INTEGER NULL
  currency_code TEXT NULL
  created_at TEXT
  PRIMARY KEY(namespace, id)

ledger_outbox_v2
  namespace TEXT
  sequence_id INTEGER PRIMARY KEY AUTOINCREMENT
  mutation_id TEXT UNIQUE
  entity_type TEXT
  entity_id TEXT
  operation TEXT
  entity_revision INTEGER
  payload_version INTEGER
  payload_json TEXT
  created_at TEXT
  attempts INTEGER
  next_attempt_at TEXT NULL
  acknowledged_at TEXT NULL
  last_error TEXT NULL
```

جداول `migration_runs`, `reconciliation_results` و`cutover_state` تحفظ أدلة Shadow Migration وقرار المصدر. `ledger_monthly_budgets` يبقى مؤقتاً لكن كل مبلغ فيه Minor Units ولا توجد أسعار `REAL`.

## القيود

- `PRAGMA foreign_keys=ON`, `journal_mode=WAL`, و`busy_timeout` تبقى مفعلة.
- لا يوجد عمود مالي `REAL` في V7.
- `amount_minor`, `numerator`, و`denominator` أعداد صحيحة، و`denominator > 0`.
- Posting currency تساوي Account currency؛ يتحقق Repository قبل SQL وتتحقق أداة Data Health بعده.
- كل Transaction فعالة تملك Posting واحدة على الأقل.
- Expense تملك Posting principal سالبة واحدة؛ Income موجبة واحدة.
- Transfer تملك source سالبة وdestination موجبة، وfee سالبة اختيارية.
- Goal allocation/release تستخدم `reserved`; لا تغير `physical`.
- Header/Posting/Link/Outbox تُكتب داخل `withTransactionAsync` واحدة.
- `idempotency_key` يعيد العملية الموجودة ولا ينشئ نسخة ثانية.

## مسارات الكتابة المنفّذة

بدأ القطع بمسار Expense العمودي، ثم عُمم نفس العقد الذري على Income وTransfer وDebt وSaving Goal وCommitment وOpening Balance. التعديل والحذف والاسترجاع والأرشفة تنشئ أيضاً mutation قابلة للتدقيق والمزامنة.

### Expense Vertical Slice

```text
UI Expense Command
  amountMinor, accountId, categoryId, dateISO, title, note, idempotencyKey
        ↓
Financial command validation
        ↓
SQLite BEGIN IMMEDIATE / withTransactionAsync
        ↓
INSERT ledger_financial_transactions(kind=expense)
        ↓
INSERT ledger_postings(bucket=physical, role=principal, amountMinor<0)
        ↓
INSERT ledger_outbox_v2(financial_transaction, upsert, aggregate payload)
        ↓
COMMIT
        ↓
SELECT committed transaction DTO + computed wallet balance
        ↓
Zustand/View State refresh
        ↓
Compatibility Vault snapshot after commit (temporary fallback only)
```

إذا فشلت SQLite فلا يحدث تحديث UI ولا Vault write. إذا نجحت SQLite وفشل Compatibility snapshot، تبقى SQLite العملية الصحيحة وتظهر حالة fallback dirty لإعادة المحاولة؛ لا يحدث rollback للمال المنشور بسبب فشل طبقة قديمة بعد الـcommit.

## Query contract

الـRepository يعيد DTO متوافقاً مؤقتاً مع الشاشات الحالية، لكنه يشتقه من Header/Postings:

```text
id, kind, flowType, dateISO, title, note, cat
walletId, walletCurrency, walletAmountMinor
baseCurrencyCode, baseAmountMinor
balanceWarning
```

الحقول العشرية القديمة مثل `amt` و`walletAmount` تُبنى عند View boundary فقط باستخدام currency exponent. لا تُكتب ثانيةً كمصدر مالي داخل V7.

## Shadow Migration

المحوّل يبني IDs ثابتة:

```text
transaction: legacy:<namespace>:transaction:<legacyId>
posting:     legacy:<namespace>:transaction:<legacyId>:<role>:<index>
rate:        legacy:<namespace>:rate:<currencyPair>:<date>:<canonicalRate>
```

مصادر الاستيراد هي Vault active history وجميع Cold Archive years. لا يغيّر Shadow run جداول المصدر ولا `cutover_state`.

نتيجة Reconciliation تحتوي على الأقل:

```text
logicalTransactionCount
postingCount
walletCurrencyBalances
walletReservedBalances
monthlyIncomeExpenseFeeByCurrency
debtGoalCommitmentLinkCounts
sourceCanonicalChecksum
targetCanonicalChecksum
```

`eligible_for_cutover=true` فقط عند عدم وجود أي mismatch. التقرير يبقى محفوظاً مع schemaVersion وappVersion ووقت التشغيل.

الترحيل الحالي ينفذ داخل namespace مرحلي مستقل، ويقارن العدد والأرصدة والعملات والمجاميع الشهرية والروابط والـchecksums قبل الترقية. عند أي اختلاف يُحذف المرحلي فقط ولا يتغير المصدر. بعد النجاح تصبح قراءة History وHome وReports من V7. جميع سنوات Cold Archive تدخل المقارنة وتبقى ملفات الأرشيف القديمة محفوظة كـfallback.

## المزامنة والنسخ الاحتياطي

- `ledger_outbox_v2` يحفظ mutations ذرية، و`ledger_inbox_v2` يمنع تكرار remote mutations.
- Migration السحابة `financial_mutations_v1` يحفظ ترتيب الخادم وcursor لكل جهاز. يلزم نشره واختباره بجهازين قبل إزالة Snapshot Sync.
- Snapshot Sync الحالي يبقى fallback، ولا يُلغى بسبب نجاح الاختبارات المحلية.
- النسخة الأساسية Logical V10 ذات manifest وschemaVersion وchecksums، ثم تُضغط وتُشفّر. نسخة SQLite الخام طبقة Recovery اختيارية وليست الصيغة الوحيدة.

## الحالة التشغيلية

- SQLite V7: مصدر الحقيقة المحلي بعد reconciliation ناجح.
- Vault: توافق واسترجاع مؤقت، وليس مصدر القراءة بعد cutover.
- V6 ledger: محول توافق مؤقت لبعض المسارات القديمة.
- Cold Archive القديم: retained fallback بعد ترحيله والتحقق منه.
- Budget V2 وRecurring وData Health: مربوطة بالنموذج الموحد، مع بقاء العرض بسيطاً للمستخدم.

## حدود دليل الاختبار

اختبارات Repository/SQL في Node لا تُسمى Native SQLite PASS إذا استخدمت mock أو parser. بوابة Native تحتاج Expo SQLite على Android/iOS، ثم Device E2E. بوابة Shadow Migration مستقلة ولا تُستنتج من نجاح Expense unit tests.
