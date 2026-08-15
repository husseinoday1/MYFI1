هذه النسخة تستبدل ترتيب الخطة السابقة وتحتفظ بكل عقودها الصحيحة، مع تصحيح نقطة الـCutover وإضافة ما كان ناقصاً: Data Ownership، Schema Migration Infrastructure المبكر، Account Lifecycle، Multi-currency Gate، Single-writer/Concurrency، Security/Reliability، Restore↔Cloud semantics، Opening Balance، Recurring، Budget Intelligence، Final RC Gate وغيرها. الخطة السابقة نفسها كانت تشترط SQLite-first Write/Read وBalance Proof وبيئات حقيقية قبل اعتبار V7 مصدر الحقيقة، وهذا المبدأ باقٍ كما هو. 

# MYFI — MASTER ENGINEERING EXECUTION PLAN

## الخطة الهندسية والتنفيذية النهائية الشاملة

**الحالة:** Frozen Master Plan بعد الاعتماد
**النطاق:** MYFI Current Real State
**المبدأ:** لا Rewrite من الصفر، ولا Feature جديدة فوق أساس مالي غير مثبت
**الهدف:** تحويل MYFI من Advanced Beta إلى تطبيق مالي Local-first يمكن الاعتماد عليه لسنوات

---

# 1. الهدف النهائي

MYFI يجب أن ينتهي إلى نظام تكون فيه الحقيقة المالية كالتالي:

```text
User
  ↓
UI
  ↓
Financial Command / Query Layer
  ↓
SQLite Financial Ledger
  ↓
Postings + Entities + FX + Budgets + Archive Metadata
  ↓
Outbox
  ↓
Background Sync
  ↓
Supabase
```

ولا يكون:

```text
UI
→ Zustand
→ Vault
→ Mirror
→ SQLite
→ Snapshot
→ Cloud
```

الهدف النهائي ليس فقط أن SQLite موجودة.

الهدف:

> **SQLite هي المصدر المالي الوحيد فعلياً للقراءة والكتابة والحسابات والتاريخ المالي.**

---

# 2. المبادئ غير القابلة للتفاوض

## 2.1 المال لا يعاد تفسيره

لا يجوز لأي تغيير مستقبلي أن يغير معنى Transaction تاريخية بسبب:

* تغيير Base Currency.
* تغيير Country.
* سعر صرف جديد.
* Account login.
* Guest merge.
* Archive.
* Restore.
* Sync.
* تغيير timezone.
* Upgrade للتطبيق.

---

## 2.2 Local-first الحقيقي

القاعدة:

```text
User action
→ Local SQLite durable commit
→ UI success
→ Cloud later
```

لا يوجد:

```text
User action
→ wait for Supabase
→ UI success
```

إلا في العمليات التي هي بطبيعتها Cloud-only مثل authentication.

---

## 2.3 Cloud ليس Source of Truth للمال

Supabase دوره:

* Authentication.
* Multi-device transport.
* Mutation replication.
* Cloud continuity.

ولا يصبح:

* الجهة الوحيدة التي تملك Ledger.
* شرطاً لاستخدام MYFI.
* سبباً لفقدان البيانات بعد Delete Account.

---

## 2.4 Delete Account ≠ Delete Financial Data

تبقى قاعدة معمارية أساسية:

```text
Delete MYFI Account
≠
Delete Local Ledger
```

أما:

```text
Delete Local Financial Data
```

فهي عملية مستقلة تماماً، صريحة، ومدمرة.

---

## 2.5 لا يوجد Silent Financial Repair

إذا وجد MYFI تناقضاً مالياً:

لا:

```text
guess
fix silently
continue
```

بل:

```text
detect
→ classify
→ block dangerous operation
→ explain
→ explicit repair/migration path
```

---

## 2.6 لا يوجد Floating Point كحقيقة مالية

كل الأموال الحسابية:

```text
integer minor units
```

الـdecimal يستخدم في العرض والإدخال فقط.

---

## 2.7 كل Financial Change قابل للإثبات

الرصيد النهائي لأي Wallet يجب أن يمكن اشتقاقه من authoritative postings.

---

# 3. Release Scope قبل التنفيذ

قبل أي تطوير كبير نثبت Release Scope.

## MYFI Production Scope الأول

يجب أن يحدد رسمياً:

### Included

* Local ledger.
* Wallets.
* Income.
* Expense.
* Transfers.
* Fees.
* Multi-currency.
* Debt.
* Receivables.
* Goals.
* Commitments.
* Budgets.
* Reports.
* History.
* Recurring.
* Archive.
* Backup.
* Restore.
* Account lifecycle.
* Optional cloud sync.
* Android production release.

### Conditional

* OCR.
* Voice.
* Multi-device sync.

لا تصبح Production إلا بعد Gates الخاصة بها.

### Deferred / Hidden إذا غير مكتملة

* Workspaces.
* Shared financial ledgers.
* أي Experimental screen.
* أي developer/performance screens.
* أي Legacy functionality غير مطلوبة للمستخدم.

---

# 4. Data Ownership Matrix

هذه الوثيقة إلزامية قبل أي Refactor:

`docs/MYFI_DATA_OWNERSHIP.md`

الهدف: لا يبقى سؤال "هذه المعلومة حقيقتها وين؟".

| البيانات                 | Source of Truth النهائي     |
| ------------------------ | --------------------------- |
| Ledger identity          | SQLite                      |
| Wallets                  | SQLite                      |
| Transactions             | SQLite                      |
| Postings                 | SQLite                      |
| Historical FX            | SQLite                      |
| Debts                    | SQLite                      |
| Receivables              | SQLite                      |
| Goals                    | SQLite                      |
| Commitments              | SQLite                      |
| Budgets                  | SQLite                      |
| Recurring rules          | SQLite                      |
| Archive metadata         | SQLite                      |
| Reconciliation           | SQLite                      |
| Mutation outbox          | SQLite                      |
| Sync inbox/cursors       | SQLite/local sync metadata  |
| Financial schema version | SQLite                      |
| Theme                    | Preferences                 |
| Language                 | Preferences                 |
| Country                  | Preferences/Profile         |
| Screen rotation          | Preferences                 |
| UI filters               | Zustand                     |
| Current page cache       | Zustand                     |
| Session UI state         | Zustand                     |
| Authentication token     | SecureStore                 |
| Encryption keys          | SecureStore                 |
| User backup file         | External encrypted package  |
| Supabase                 | Sync replica / Auth backend |

## ملاحظة حاسمة

`Base Currency` ليست مجرد UI preference.

يجب أن تصبح:

```text
ledger.base_currency
```

لأنها جزء من هوية ومعنى Ledger.

أما:

```text
country
```

فهو Profile/Presentation preference.

---

# 5. Final Target Storage Architecture

## SQLite

تملك كل الحقيقة المالية التشغيلية.

## Zustand

يحتوي فقط:

* session state.
* selected ledger.
* filters.
* current screen state.
* current page rows.
* small summaries.
* loading/error states.
* sync indicator.

ولا يحمل:

```text
100,000 transaction
```

كحقيقة تشغيلية.

## SecureStore

يحتوي:

* auth/session secret.
* encryption keys.
* biometric/app-lock secrets.

## Vault

دوره النهائي:

**Recovery checkpoint transitional/periodic** وليس competing financial database.

لا يعاد تشفير snapshot تحتوي كامل الـLedger بعد كل Transaction مستقبلاً.

## Supabase

* auth.
* mutation replication.
* optional continuity.

## Backup files

User-owned disaster recovery artifacts.

---

# 6. العقود المالية الأساسية

يتم إنشاء:

`docs/MYFI_FINANCIAL_CONTRACT.md`

## 6.1 Money

كل مبلغ:

```text
amount_minor: integer
currency: ISO/defined currency code
```

لا يعتمد المحرك على:

```text
0.1 + 0.2
```

كحقيقة مالية.

---

# 7. Currency Precision Contract

يجب أن يوجد Currency Metadata واضح:

```text
code
minor_unit_exponent
display_decimals
symbol
rounding_policy
```

لا نفترض أن كل العملات منزلتان عشريتان.

قبل migration:

* مراجعة IQD.
* USD.
* EUR.
* GBP.
* JPY.
* currencies المدعومة الأخرى.

## القاعدة

Currency exponent المالي شيء.

وعدد الكسور التي نعرضها للمستخدم شيء آخر.

---

# 8. FX Contract

أي foreign transaction تاريخية يجب أن تحتوي — حسب نوعها — على ما يكفي لإعادة بناء قيمتها دون الرجوع إلى سعر اليوم.

Conceptually:

```text
original_amount_minor
original_currency

base_amount_minor
base_currency

rate_numerator
rate_denominator
rate_date
rate_source
rate_is_manual
```

أسماء الحقول الفعلية يمكن أن تتبع V7 الحالية.

## القاعدة

Historical Transaction:

```text
immutable historical FX
```

Current Wallet Valuation:

```text
latest/current rate
```

وهما مفهومين منفصلين.

---

# 9. FX Rounding Contract

لا يتم استخدام rounding عشوائي أو `Math.round()` في أماكن مختلفة.

يجب أن يوجد helper مركزي واحد للتحويل:

```text
convertMinorUnits(...)
```

مع:

* deterministic rational calculation.
* overflow protection.
* safe integers.
* explicit rounding rule.
* negative-value behavior.
* tests على boundary conditions.

إذا V7 لديها rounding rule ثابتة، نحافظ عليها ولا نغيرها دون migration contract.

---

# 10. Transfer Contract

Transfer بين Wallet A وWallet B:

```text
source posting
destination posting
optional fee posting
FX snapshot if currencies differ
```

Transfer:

* ليس Income.
* ليس Expense.

Fee:

* Expense مرة واحدة فقط.

Cross-currency transfer يجب أن يحتفظ بالقيمة الأصلية في كلا الجانبين.

---

# 11. Date / Time Contract

يتم تثبيت:

```text
transaction_date
created_at
updated_at
server_received_at
rate_date
```

## transaction_date

Financial calendar date:

```text
YYYY-MM-DD
```

لا تعاد تفسيرها عند تغيير timezone.

مثال:

Transaction بتاريخ:

```text
2026-12-31
```

تبقى في December report حتى إذا:

* أضيفت يوم 2 يناير.
* سافر المستخدم.
* تغير timezone.
* تمت مزامنتها بعد أسبوع.

## created_at / updated_at

UTC timestamps تقنية.

## Sync timestamps

لا تستخدم لتحديد الشهر المالي.

---

# 12. Ledger Identity Contract

كل Financial Ledger له:

```text
ledger_id
```

immutable.

مستقل عن:

```text
supabase_user_id
```

## كل Transaction

تملك على الأقل مفهوماً مكافئاً لـ:

```text
transaction_id
ledger_id
created_device_id
created_at
updated_at
revision
status
voided_at/deleted_at
```

حسب تصميم V7 الموجود.

---

# 13. Entity Identity

نفس القاعدة تطبق على:

* wallets.
* debts.
* receivables.
* goals.
* commitments.
* budgets.
* recurring rules.

لا تعتمد العلاقات على Array indexes أو temporary UI IDs.

---

# 14. Revision Contract

كل تعديل Financial entity يجب أن يعرف:

```text
current_revision
base_revision
```

عند الحاجة للمزامنة.

Edit:

```text
same immutable ID
revision + 1
```

لا Edit عن طريق:

```text
delete old
create unrelated new
```

إلا إذا كان هذا جزءاً صريحاً من domain semantics.

---

# 15. Delete Contract

Financial delete الافتراضي:

```text
void / tombstone
```

وليس disappearance غير قابل للتتبع.

Physical deletion/compaction يأتي فقط بعد retention rules واضحة.

---

# 16. Financial Audit Trail

لا نحتاج Enterprise audit system.

لكن نحتاج minimal forensic history للمعلومات الحساسة مثل:

* transaction created.
* amount changed.
* wallet changed.
* transaction voided.
* restored.
* reconciliation performed.

الهدف:

> نستطيع تفسير لماذا تغير الرقم.

لا تحفظ sensitive values في Android logs.

---

# 17. Single-Writer / Concurrency Contract

كل Financial write يمر من Boundary واحدة.

مثلاً:

```text
FinancialRepository
or
FinancialCommandService
```

لا يسمح للشاشات بالكتابة مباشرة إلى جداول مختلفة.

## مصادر الكتابة المحتملة

* user action.
* remote sync apply.
* recurring generator.
* restore.
* migration.
* archive operation.
* reconciliation.

يجب تنسيقها.

## Maintenance Lock

عمليات مثل:

```text
restore
schema migration
canonical cutover
```

تأخذ Maintenance Lock.

أثناءها:

* sync worker يتوقف.
* recurring generator يتوقف.
* financial UI writes تتوقف.

---

# 18. Atomic Financial Write Contract

المسار:

```text
BEGIN SQLite transaction

write entity/transaction
write postings
write links
increment revision
write outbox mutation

COMMIT

update UI cache
show success
```

## ممنوع

```text
COMMIT financial data
→ app crashes
→ outbox not written
```

لذلك outbox يجب أن تدخل في نفس DB transaction.

---

# 19. Phase 0 — Governance, Evidence, Contracts & Scope

## الهدف

تثبيت القواعد قبل تغيير الكود.

## المخرجات الإلزامية

إنشاء:

```text
docs/MYFI_RELEASE_GATE_STATUS_AR.md
docs/MYFI_DATA_OWNERSHIP.md
docs/MYFI_FINANCIAL_CONTRACT.md
docs/MYFI_DATE_TIME_CONTRACT.md
docs/MYFI_SYNC_PROTOCOL.md
docs/MYFI_MIGRATION_POLICY.md
docs/MYFI_BACKUP_FORMAT.md
docs/MYFI_SECURITY_THREAT_MODEL.md
docs/MYFI_PERFORMANCE_SLO.md
docs/MYFI_RELEASE_SCOPE.md
```

## Release Gate Status

لكل Claim:

```text
Claim ID
Description
Evidence
Status
Test type
Environment
Device
App version
DB schema
Dataset
Result
Failure reason
Decision
Date
```

Statuses:

```text
confirmed
already-built
needs-audit
blocked
skipped
failed
passed
retired
```

## Entry

Current Real State ZIP معروف.

## Exit

لا توجد Architecture decision أساسية غير موثقة.

---

# 20. Phase 1 — Android Native + SQLite V7 Reality Proof

## الهدف

إثبات أن V7 تعمل على Android حقيقي.

## الاختبارات

على real device:

* app install.
* cold start.
* DB initialization.
* create wallet.
* opening transaction.
* income.
* expense.
* same-currency transfer.
* cross-currency transfer إن مدعوم.
* fee.
* edit.
* void.
* reload app.
* verify balances.
* kill/reopen.
* idempotent mutation replay.
* transaction rollback failure test.

## Android SQLite

التأكد من:

* `expo-sqlite` native module.
* production-like build.
* transaction behavior.
* WAL/locking behavior.

## Security P0 مبكر

يصلح فوراً:

```text
android:allowBackup=false
```

في الـmerged manifest الفعلي.

## Release Signing

نفحص:

* Gradle.
* EAS configuration.
* credentials.
* actual production build path.

لا نعتبر debug signing Release ready.

## Baseline Performance

نسجل baseline فقط.

لا نحسن Hybrid architecture هنا.

## Exit Gate

لا ننتقل إذا V7 لا تعمل بثبات على الجهاز.

---

# 21. Phase 2 — Migration Infrastructure Minimum

هذه المرحلة يجب أن تأتي **قبل أي Schema changes كبيرة جديدة**.

## Schema Migration Journal

جدول مفاهيمي:

```text
schema_migrations
-----------------
migration_id
from_version
to_version
checksum
started_at
completed_at
status
app_version
```

## القواعد

كل migration:

* forward-only.
* deterministic.
* idempotent أو محمية against double application.
* checksum verified.
* transaction-wrapped حيث يمكن.
* crash-aware.
* testable independently.

## Startup

عند startup:

```text
read schema version
→ check migration journal
→ resume/recover if interrupted
→ migrate
→ health check
→ open ledger
```

## لا نسمح

بأن UI يبدأ كتابة مالية بينما DB migration غير مكتملة.

## Exit

لدينا infrastructure نستطيع استخدامها لـV8/V9 وليس migration مخصصة لمرة واحدة فقط.

---

# 22. Phase 3 — Confirmed P0 Financial Safety Fixes

## 3.1 Base Currency

Base Currency تصبح Ledger property.

إذا يوجد Financial History:

```text
change base currency = blocked
```

## 3.2 Country

Country يمكن تغييره.

لكنه لا يغير Base Currency بعد history.

## 3.3 Guest → Account

Guest merge:

```text
remap ownership/IDs only as required
```

ولا يغير:

* wallet currency.
* transaction original currency.
* original amounts.
* historical base values.
* FX history.

## 3.4 Missing Historical FX

Foreign legacy transaction بدون historical rate مثبت:

```text
UNRESOLVED_FX
```

لا:

```text
rate = 1
```

ولا current valuation.

## 3.5 Dangerous Archive

إذا Archive الحالية تعيد كتابة opening balances أو تغير financial meaning:

تُجمّد حتى Archive Consolidation.

## 3.6 Date Audit

نفحص:

* reports.
* recurring.
* backup.
* restore.
* sync.
* rate date.
* transaction date.

## 3.7 Opening Balance Audit

كل Wallet تصنف:

```text
canonical opening transaction
or
legacy opening field
```

نعد inventory كامل.

## Exit Gate

كل P0 لديه Regression Test.

---

# 23. Opening Balance Final Contract

Opening Balance يجب أن تصبح Financial Event canonical.

لا يبقى إلى الأبد مصدران:

```text
wallet.openingBalance
+
opening transaction
```

## Migration

لكل legacy wallet:

```text
legacy opening value
→ canonical opening transaction/posting
```

ثم مقارنة:

```text
balance before == balance after
```

Opening Balance:

* لا Income.
* لا Expense.
* لا يتغير بسبب Archive.

---

# 24. Phase 4 — Balance Proof + Financial Invariant Engine

## الهدف

إثبات المال من Ledger.

## القاعدة الأساسية

```text
Wallet balance
=
SUM(authoritative wallet postings)
```

## وليس

معادلة Income/Expense المبسطة وحدها.

---

# 25. Transaction-Type Invariants

## Income

* valid wallet.
* valid currency.
* valid amount.
* correct posting.
* contributes to income.

## Expense

* valid posting.
* contributes to expense.
* no duplicated fee.

## Transfer

* source exists.
* destination exists.
* no same-side duplication.
* frozen FX.
* fee exactly once.
* P&L neutral except fee.

## Debt Proceeds

* cash increases.
* debt link exists.
* principal not income.

## Debt Payment

* cash decreases.
* debt principal changes.
* principal not normal expense.

## Receivable Creation

* financial relationship created.
* no false income.
* cash semantics consistent with actual model.

## Receivable Collection

* cash increase.
* valid link.
* principal not income.

## Goal Allocation

* reserved/physical semantics preserved.
* no expense.

## Goal Release

* reserve released.
* no income.

## Commitment Payment

* payment recorded once.
* linked correctly.
* no double counting.

## Opening Balance

* changes starting cash.
* not P&L.

## Reconciliation

* independent transaction type.
* explicit delta.
* not P&L.

## Void

Original effect excluded according to ledger semantics.

---

# 26. Health Checker

يكون امتداداً لنظام V7 الموجود وليس Engine منافس.

يفحص:

* wallet balances.
* entity IDs.
* duplicate IDs.
* invalid revisions.
* orphan links.
* invalid currencies.
* missing historical FX.
* invalid rational rates.
* opening balance duplication.
* invalid posting structure.
* archived-state consistency.
* outbox stuck.
* foreign-key integrity.
* schema migration status.

Negative wallet balance:

**ليست corruption بحد ذاتها.**

---

# 27. Health Levels

```text
HEALTHY
WARNING
BLOCKING
```

## BLOCKING

يمنع:

* canonical cutover.
* restore promotion.
* destructive migration.
* production release.

---

# 28. Multi-Currency Correctness Gate

Multi-currency تحتاج Gate مستقلة.

## يجب إثبات

### Wallet Currency

كل Wallet لها Currency مستقلة.

### Transaction

تحفظ original currency/amount.

### Base

تحفظ historical base value.

### FX

تحفظ:

* rate.
* date.
* source.
* manual flag.

### Transfer

اختبار:

```text
USD wallet → IQD wallet
```

مع:

* source amount.
* destination amount.
* historical FX.
* fee.
* base report impact.

### Future Rate Change

تغيير سعر اليوم:

لا يغير:

* Transaction history.
* historical monthly reports.
* historical base amount.

### Manual FX

لا يعيد valuation للماضي تلقائياً.

---

# 29. Phase 5 — Shadow Migration / Migration Readiness Gate

**هذه ليست Final Cutover.**

## الهدف

إثبات أن V7 تستطيع تمثيل Current State بصورة صحيحة.

## الخطوات

```text
freeze source snapshot
→ create staging ledger/database
→ import
→ normalize
→ validate
→ compare
```

## المقارنات

### Identity

* ledger identity.
* transaction IDs.
* wallet IDs.
* entity IDs.

### Counts

* wallets.
* transactions.
* debts.
* receivables.
* goals.
* commitments.
* budgets.
* recurring rules.
* FX records.
* archive metadata.

### Money

* native wallet balances.
* physical balances.
* reserved balances.
* currency totals.
* transfer totals.
* fees.

### Reports

* monthly income.
* monthly expense.
* net cash movement.
* category totals.

### Links

* debt links.
* receivable links.
* goal links.
* commitment links.

### FX

```text
unresolved foreign FX = 0
```

إلا إذا migration بقيت محظورة ولم يتم cutover.

### Opening

لا duplicate opening truth.

### Archive

Old archive references/accounting semantics verified.

### Hash

```text
source semantic representation
target semantic representation
```

## نتيجة الفشل

```text
NO PROMOTION
discard staged target
keep old source unchanged
```

## نتيجة النجاح

```text
Migration Ready
```

فقط.

لا `source_mode=sqlite` نهائياً بعد.

---

# 30. Phase 6 — SQLite-first Write Path

هذه أهم مرحلة تشغيلية.

## الهدف

كل Financial Command يكتب مباشرة إلى SQLite.

---

# 31. Write Boundary

مثلاً:

```text
FinancialCommandService
```

يوفر Commands بدلاً من التلاعب بـZustand arrays.

---

# 32. Vertical Slice 1 — Wallet

يشمل:

* create wallet.
* rename.
* edit non-financial metadata.
* opening balance.
* currency immutability rules.
* close/archive wallet.
* delete rules.

Wallet لا يمكن حذفها بشكل يكسر historical references.

---

# 33. Vertical Slice 2 — Income

```text
validate
→ begin DB
→ transaction row
→ posting
→ revision
→ outbox
→ commit
→ cache update
```

---

# 34. Vertical Slice 3 — Expense

نفس العقد.

---

# 35. Vertical Slice 4 — Transfer

يشمل:

* same-currency.
* cross-currency.
* fees.
* original amounts.
* historical FX.

كل شيء Atomic.

---

# 36. Vertical Slice 5 — Edit

Edit:

* same ID.
* revision increment.
* postings rebuilt/versioned وفق نموذج V7.
* outbox mutation.
* no duplicate.

---

# 37. Vertical Slice 6 — Void/Delete

* tombstone/void.
* revision.
* outbox.
* no unexplained physical deletion.

---

# 38. Vertical Slice 7 — Undo

Undo ليست `set(oldState)`.

يجب أن تمر عبر Financial Command.

تحدد حسب نوع العملية:

* reverse void.
* restoration.
* compensating transaction.

ولا تكسر revision history.

---

# 39. Debt Write Paths

يشمل:

* create debt.
* edit metadata/terms.
* record proceeds.
* payment.
* close debt.
* reopen إن مدعوم.
* delete/void rules.

---

# 40. Receivable Write Paths

يشمل:

* create.
* lend/record creation.
* collect.
* edit.
* close.

---

# 41. Goal Write Paths

* create goal.
* edit target.
* allocation.
* release.
* completion.
* archive/delete policy.

---

# 42. Commitment Write Paths

* create.
* edit.
* payment.
* complete.
* overdue status.

---

# 43. Budget Write Paths

Budgets نفسها تنتقل إلى canonical storage.

يشمل:

* create.
* edit.
* disable.
* accept suggestion.
* reject suggestion.
* manual override.

---

# 44. Recurring Rule Write Paths

Rule نفسها canonical، وليس فقط transaction الناتجة عنها.

حقول مفاهيمية:

```text
rule_id
ledger_id
type
amount
currency
wallet
schedule
timezone policy
start date
end date
next occurrence
status
revision
```

---

# 45. FX Write Paths

* add manual rate.
* update future/current valuation rate.
* preserve historical transaction snapshots.
* prevent historical mutation.

---

# 46. Reconciliation Write Path

المستخدم يدخل:

```text
actual wallet balance = X
```

MYFI يحسب:

```text
delta = actual - ledger balance
```

ثم يعرض:

* ledger balance.
* actual balance.
* difference.

ولا ينفذ إلا بعد explicit confirmation.

ثم ينشئ Reconciliation transaction.

---

# 47. Mutation Envelope من البداية

حتى قبل Sync Hardening الكامل، كل outbox item الجديدة تحمل protocol envelope.

Conceptually:

```text
mutation_id
ledger_id
entity_id
entity_type
operation
revision
base_revision
device_id
protocol_version
payload_schema_version
restore_epoch
created_at
```

حتى لا نعيد تصميم outbox بعد أشهر.

---

# 48. Write Path Exit Gate

لا تعتبر هذه المرحلة ناجحة إلا عندما:

* الشاشات الأساسية لا تحتاج `saveLocal()` كآلية Financial Commit.
* durable DB commit يسبق success UI.
* outbox atomic.
* app kill بعد commit لا يفقد mutation.
* app kill قبل commit لا يترك partial state.
* all core financial entities تستخدم نفس boundary.

---

# 49. Phase 7 — SQLite-first Read Path

## الهدف

لا full financial history في JavaScript.

---

# 50. Home

SQL queries لـ:

* current balances.
* monthly income.
* monthly expense.
* recent transactions.
* actionable alerts.
* budget status.

لا scan كامل.

---

# 51. History

## Pagination

Keyset pagination أفضل من deep OFFSET حيث يلزم.

مثلاً:

```text
(transaction_date, created_at, id)
```

كـstable cursor.

## Filters

SQL:

* wallet.
* category.
* transaction type.
* amount range إذا مطلوب.
* date range.
* archived scope.

---

# 52. Search

لا:

```text
LIKE '%query%' on payload_json
```

على كامل Ledger.

استخدام:

* FTS5 إذا مدعوم ومستقر في environment.
* أو indexed searchable table.

Index فقط ما يحتاجه المستخدم:

* title.
* note.
* category text.
* wallet label عند الحاجة.

لا index للبيانات الحساسة بلا داعٍ.

---

# 53. Reports

كل accounting totals:

```text
SUM(integer minor units)
```

في SQL أو domain calculations integer-safe.

Reports:

* monthly income.
* monthly expense.
* net.
* category spending.
* wallet positions.
* budget performance.
* year.
* custom period.

---

# 54. Trackers

Debt/receivable/goal/commitment screens لا تحمل كل history إلى JS.

Queries محددة:

* active entities.
* detail history.
* outstanding.
* paid/collected.
* due items.

---

# 55. Budget Inputs

Smart Budget يأخذ SQL aggregates وليس `trans[]`.

---

# 56. Zustand بعد المرحلة

يصبح:

```text
UI/session/query cache
```

ولا:

```text
parallel financial database
```

---

# 57. Phase 8 — Operational Canonical Cutover

هنا فقط نعلن V7 Operational Source of Truth.

## قبل Cutover

نكرر final delta/parity check، لأن البيانات قد تغيرت منذ Shadow Migration.

## الخطوات

```text
enter maintenance mode
pause sync
pause recurring
freeze old financial writer
flush pending compatible operations
run final parity
run health checker
unresolved FX = 0
verify schema
verify backup checkpoint
```

ثم:

```text
promote active ledger pointer/source_mode
```

---

# 58. Atomic Cutover Pointer

يفضل أن يكون الـpromotion نفسه صغيراً.

Conceptually:

```text
active_ledger_id / source_mode
```

يتم تغييره atomically.

---

# 59. بعد Cutover

Old source:

```text
rollback checkpoint
read-only
```

لا يستمر كـcompeting writer.

---

# 60. Cutover Failure

إذا أي check يفشل:

```text
resume old mode
V7 stage stays diagnostic or discarded
no partial cutover
```

---

# 61. Phase 9 — Account Lifecycle Gate

هذه Phase مستقلة لأنها مصدر محتمل لفقدان البيانات.

## Scenario A — Local-only

* install.
* skip account.
* create wallet/data.
* close/reopen.
* data remains.

## Scenario B — Guest → Signup

* Guest IQD.
* Guest USD wallet.
* financial history.
* create account.
* attach ledger.
* no currency mutation.
* no ID corruption.
* no balance change.

## Scenario C — Logout

Logout:

* removes/invalidates cloud session.
* does not delete ledger.

## Scenario D — Re-login

* ledger remains accessible.
* sync resumes safely.

## Scenario E — Second device

* login.
* bootstrap cloud ledger.
* verify convergence.

## Scenario F — Account Switch

Account A وAccount B:

لا:

* cross-account wallets.
* cross-account outbox.
* mixed sync cursor.
* wrong ledger opened.

## Scenario G — Delete Account

قبل cloud delete:

* local ledger secured.
* becomes local-only/unlinked.
* cloud identity deleted.

ثم المستخدم يستطيع الاستمرار.

## Scenario H — Delete Local Data

عملية مستقلة:

* warning.
* re-auth/confirmation عند الحاجة.
* clear consequences.

ولا تستدعى بواسطة Logout/Delete Account.

---

# 62. Ledger ↔ Account Mapping

يجب أن توجد طبقة واضحة:

```text
ledger_id
↔ optional cloud account ownership/link
```

وليس:

```text
ledger_id = supabase_user_id
```

---

# 63. Phase 10 — Atomic Backup / Restore Engine

## Backup

Backup هي disaster recovery.

ليست:

* Sync.
* Archive.
* Export history فقط.

---

# 64. Backup Format

Versioned logical package:

```text
manifest
backup_format_version
schema_version
semantic_hash_version
created_at
app_version
ledger metadata
financial data
integrity metadata
encryption metadata
```

يشمل:

* ledger.
* wallets.
* transactions.
* postings.
* FX.
* debts.
* receivables.
* goals.
* commitments.
* budgets.
* recurring.
* archive metadata.
* reconciliation.
* relevant local financial configuration.

ولا يشمل:

* auth tokens.
* SecureStore keys.
* biometric secrets.

---

# 65. Backup Encryption

الحفاظ على AES-GCM/PBKDF2 system الحالي ما دام الاختبار يثبت صحته.

يجب اختبار:

* correct password.
* wrong password.
* corrupted ciphertext.
* truncated file.
* tampered file.

---

# 66. Temporary Backup Files

أي plain/unprotected temporary artifact:

يُحذف بعد:

* save.
* share.
* cancellation.
* failure.

قدر الإمكان.

---

# 67. Atomic Restore Architecture

لا overwrite مباشر.

المسار:

```text
select backup
→ decrypt
→ parse
→ schema validate
→ create staged ledger/database
→ import
→ financial health proof
→ semantic validation
→ checksum/hash
→ ready
```

ثم:

```text
pause sync
pause recurring
acquire maintenance lock
→ atomic active-ledger promotion
→ increment restore_epoch
→ reopen
```

---

# 68. Restore Failure

قبل promotion:

```text
active ledger untouched
```

بعد crash:

الحالة المقبولة:

```text
old complete ledger
```

أو:

```text
new complete ledger
```

ولا:

```text
half restored ledger
```

---

# 69. Restore vs Cloud

هذا أخطر سيناريو:

```text
cloud newer
+
user restores old backup
```

لا يبدأ sync بشكل أعمى.

## Safe Default

بعد Restore لحساب مربوط Cloud:

```text
SYNC PAUSED
RESTORE_RECONCILIATION_REQUIRED
```

ثم النظام يعرف أن:

```text
restore_epoch changed
```

ويطبق policy واضحة.

لا Cloud ولا Local يكتب فوق الآخر بصمت.

---

# 70. Restore vs Import

مفهومان منفصلان:

## Restore

إعادة نفس Ledger:

```text
preserve ledger_id
```

## Import as New Ledger

نسخة مستقلة:

```text
new ledger_id
```

حتى لا يحدث Cloud collision.

إذا MYFI لا يدعم multiple ledgers حالياً:

Import-as-new يبقى غير متاح للمستخدم حتى دعم ذلك فعلياً.

---

# 71. Phase 11 — Archive Consolidation

Archive داخل MYFI:

```text
ledger lifecycle / visibility
```

ليس Financial Mutation.

---

# 72. Archive Model

يفضل:

```text
archived_at
archive_year
```

أو model مكافئ داخل V7.

لا duplicate canonical transaction.

---

# 73. Archive Invariants

Archive لا تغير:

* wallet balance.
* opening balance.
* transaction amount.
* FX.
* debt history.
* goal totals.

---

# 74. Archive Query Scope

كل query تحدد:

```text
ACTIVE
ARCHIVED
ALL
```

## Wallet Balance

يستخدم ALL financial postings دائماً حسب ledger semantics.

Archive visibility لا تغير balance.

---

# 75. Reports & Archive

التقرير يحدد scope صريح.

لا تتغير historical totals بصمت فقط لأن المستخدم ضغط Archive.

---

# 76. Cold Archive Migration

القديم:

```text
Cold Archive
```

يهاجر إلى canonical V7 representation.

## العملية

* read old record.
* rebuild canonical entity.
* verify immutable IDs.
* verify money.
* verify FX.
* verify balances.
* mark old archive migrated.

لا delete للقديم حتى validation.

---

# 77. Export Archive

`Export Archive File` مفهوم منفصل.

هو user artifact لسنة/period.

ليس Source of Truth.

---

# 78. Phase 12 — Final Semantic Backup Round Trip

بعد Archive consolidation نثبت Backup contract النهائي.

## الاختبار

```text
Ledger A
→ Backup
→ clean environment
→ Restore
→ Ledger B
```

ثم:

```text
semantic_hash(A)
==
semantic_hash(B)
```

---

# 79. Canonical Semantic Serialization

لا نعمل hash للـraw SQLite bytes.

قبل hash:

* sort by immutable ID.
* normalize money integer representation.
* normalize date format.
* stable field ordering.
* exclude DB row IDs.
* exclude WAL state.
* exclude cache.
* exclude ephemeral sync cursor عند عدم كونه semantic.
* exclude device-local settings غير المالية.

---

# 80. Semantic Hash Version

```text
semantic_hash_version
```

إلزامية.

حتى نستطيع تغيير algorithm مستقبلاً.

---

# 81. Semantic Equality تشمل

* ledger identity.
* wallets.
* transactions.
* postings.
* debts.
* receivables.
* goals.
* commitments.
* budgets.
* recurring rules.
* historical FX.
* archive metadata.
* balances.
* monthly totals.
* links.
* reconciliation.

---

# 82. Phase 13 — Compatibility / Dual-write Retirement

لا نحذف القديم دفعة واحدة.

## Stage A

قبل cutover:

```text
old source authoritative
V7 shadow
```

## Stage B

بعد operational cutover:

```text
V7 authoritative
old source read-only rollback
```

## Stage C

Stop:

```text
V6 writes
old financial mirrors
```

## Stage D

بعد نجاح:

* Backup/Restore.
* semantic round trip.
* account lifecycle.
* stability soak.

نوقف old readers العادية.

## Stage E

بعد release soak:

نحذف:

* compatibility bridge.
* dead V6 repositories.
* migration-only runtime code غير المطلوب.

---

# 83. Vault Retirement Strategy

Vault لا يحذف فوراً.

لكن دوره يتغير.

## أثناء الانتقال

Recovery rollback layer.

## بعد الاستقرار

يقرر دوره النهائي:

* periodic checkpoint.
* major-operation checkpoint.
* encrypted emergency recovery.

لا full ledger serialization بعد كل Transaction إذا كان ذلك يعيد O(N) cost.

---

# 84. Phase 14 — Sync Hardening

## المبدأ

Local mutation أولاً.

Cloud لاحقاً.

---

# 85. Sync Protocol Envelope

كل mutation:

```text
protocol_version
payload_schema_version
minimum_supported_version
mutation_id
ledger_id
entity_id
entity_type
operation
revision
base_revision
device_id
restore_epoch
created_at
```

---

# 86. Outbox

States:

```text
pending
in_flight
acknowledged
failed_retryable
failed_permanent
```

## Retry

Exponential backoff + jitter.

لا fixed retry للأبد.

---

# 87. Inbox

Remote mutations يجب أن تكون idempotent.

نحفظ:

* mutation ID.
* server sequence.
* application status.

Repeated delivery:

لا duplicate.

---

# 88. Tombstones

Delete يحتاج tombstone retention كافية حتى لا يعيد جهاز قديم entity محذوفة.

تحدد policy لـ:

* retention.
* compaction.
* stale device recovery.

---

# 89. Conflict Policy

## Monetary fields

مثل:

* amount.
* wallet.
* currency.
* FX.

لا automatic field merge.

إذا concurrent edit حقيقي:

```text
financial conflict
```

يحفظ كلا التعديلين بما يكفي لاتخاذ قرار صحيح.

## Metadata

note/category وغيرها يمكن أن يكون لها policy أخف.

لكن لا "smart merge" غير قابل للتفسير.

---

# 90. Delete vs Edit

يحدد العقد مسبقاً.

مثلاً حسب revision/base revision والتوقيت المنطقي.

لا يترك للسطر الأخير الذي وصل.

---

# 91. Two-device Matrix

### Add/Add

يجب أن تتقارب البيانات.

### Same transaction edit/edit

Conflict policy.

### Edit/Delete

Deterministic result.

### Offline A + Online B

Convergence.

### Server accepted + network response lost

Idempotency يمنع duplicate.

### App killed with pending outbox

بعد reopen يستمر sync.

### Account switch

No leakage.

### Guest → Account

No FX/currency corruption.

### Old app ↔ New app

Protocol compatibility gate.

### Restore Epoch

Cloud لا يعكس restore دون policy.

---

# 92. Sync Worker Coordination

Sync worker يجب أن يتوقف أثناء:

* Restore.
* Schema migration.
* Canonical cutover.

ويعاود بعد نجاح العملية.

---

# 93. Mutation Retention

بعد سنوات:

لا نترك:

```text
millions of acknowledged outbox rows
```

نحدد:

* acknowledged cleanup.
* inbox retention.
* mutation compaction.
* tombstone retention.

بدون فقدان idempotency safety.

---

# 94. Snapshot Sync Removal

يبقى Snapshot fallback إلى أن:

```text
mutation sync
+
two devices
+
restore epoch
+
cross-version
+
account lifecycle
```

كلها PASS على staging/realistic environment.

بعدها فقط retirement.

---

# 95. Phase 15 — Performance + Reliability Gate

Performance بعد SQLite-first.

لا نقيس architecture سنزيلها ونعتبرها Production result.

---

# 96. Dataset Tiers

```text
1K
10K
25K
50K
100K stress
```

مع:

* multiple wallets.
* multiple currencies.
* years of history.
* debts/goals/commitments.
* archived rows.
* search text.

---

# 97. Metrics

نقيس p50/p95:

* cold startup.
* warm Home.
* History first page.
* History next page.
* Search.
* filter.
* monthly report.
* yearly report.
* add transaction durable commit.
* edit.
* delete/void.
* reconciliation.
* Archive.
* Backup.
* Restore validation.
* sync apply.

---

# 98. Memory Metrics

* JS heap.
* Android PSS/RSS.
* DB size.
* WAL size.

## القاعدة

فتح Home أو أول History page لا يجب أن يجلب كل الـLedger.

---

# 99. Performance SLOs

القيم النهائية تثبت في:

`docs/MYFI_PERFORMANCE_SLO.md`

**قبل optimization النهائي**.

يتم اختيار:

* representative low/mid-range Android.
* representative OS version.
* 25K/50K dataset.

لا نغير threshold فقط لأن النتيجة سيئة.

---

# 100. 100K Policy

100K:

* correctness required.
* no catastrophic crash.
* no data corruption.
* stress metric required.

لكن لا نضيف architecture معقدة فقط لإظهار رقم 100K.

---

# 101. SQLite Reliability Tests

اختبار:

* app killed mid-command.
* app killed after commit.
* DB busy.
* lock contention.
* low storage.
* disk full.
* interrupted WAL checkpoint.
* interrupted migration.
* corrupted DB simulation حيث يمكن.
* foreign-key violation.
* integrity check failure.

---

# 102. SQLite Operational Configuration

يتم تدقيق:

```text
foreign_keys
journal_mode
synchronous
busy_timeout
checkpoint policy
```

ولا يتم تغييرها بالمجرد.

كل اختيار يحتاج:

* reason.
* benchmark.
* crash-safety evidence.

---

# 103. DB Health

عند الحاجة:

```text
PRAGMA quick_check
```

أو equivalent.

ليس في كل startup إذا مكلف.

يمكن استخدامه:

* diagnostic.
* restore validation.
* major migration.
* support flow.

---

# 104. Phase 16 — Android Production + Security Gate

## Android

فحص الـartifact النهائي وليس config source فقط.

---

# 105. Merged Manifest

يجب التحقق من:

```text
allowBackup=false
orientation
permissions
exported components
```

في الـmerged release manifest.

---

# 106. Signing

* production key/managed credential.
* لا debug keystore.
* documented credential ownership.
* recovery policy للمفتاح.

---

# 107. Rotation Contract

Modes:

```text
Use device setting
Portrait
Auto/allowed orientations
```

"Use device setting" يعني فعلاً respect OS.

لا catch فارغ:

```text
.catch(() => {})
```

في operations التي يجب تشخيص فشلها.

---

# 108. Security Threat Model

توثق:

## Assets

* financial database.
* backups.
* credentials.
* OCR images.
* voice.
* cloud mutations.

## Threats

* stolen phone.
* malicious backup access.
* cloud account compromise.
* cross-account access.
* accidental export.
* logs.
* tampered backup.
* replayed mutation.

---

# 109. Local Database Encryption Decision

SQLite الحالية plaintext.

يجب اتخاذ قرار صريح:

### Option A

Android sandbox + backup disabled + device encryption considered adequate للـthreat model الحالي.

أو:

### Option B

Encrypted SQLite migration.

لكن لا نضيف SQLCipher فقط لأنه يبدو "أكثر احترافاً".

يحتاج:

* compatibility.
* performance.
* migration.
* recovery.
* Expo/native validation.

ولا نسوق "fully encrypted local database" إلا بعد إثباته.

---

# 110. SecureStore

اختبار:

* first install.
* device reboot.
* logout.
* account deletion.
* app reinstall.
* biometric enabled/disabled.
* key loss behavior.

---

# 111. App Lock / Biometrics

إذا موجودة أو سيتم تسويقها:

يجب تحديد:

* ماذا تغلق؟
* هل background timeout؟
* هل biometric failure يسمح fallback؟
* هل البيانات تبقى في recent-app snapshot؟

---

# 112. Sensitive Logs

ممنوع logging لـ:

* amounts إن لم نحتجها.
* notes.
* OCR content.
* auth tokens.
* backup password.
* raw RPC payloads.
* PII.

Diagnostics تستخدم:

* redacted IDs.
* hashes.
* status codes.

---

# 113. Supabase Security

اختبارات Negative:

* User A reads User B ledger → FAIL.
* User A mutation to User B ledger → FAIL.
* unauthenticated RPC → FAIL.
* invalid ledger ownership → FAIL.
* replay mutation → idempotent/no corruption.

---

# 114. OCR / Voice Privacy Gate

قبل upload:

المستخدم يعرف أن media ستعالج خارج الجهاز إذا هذا هو الواقع.

يجب:

* consent/disclosure واضح.
* auth.
* temporary file cleanup.
* no background upload hidden.
* error does not create wrong transaction.
* parsed result presented as suggestion.

لا:

```text
AI decides financial transaction
```

المستخدم يؤكد.

---

# 115. Phase 17 — Budget Intelligence + Recurring + Product Correctness

هذه ليست P0، لكن يجب أن تكتمل قبل تسويق المنتج على أنها Features ناضجة.

---

# 116. Smart Budget Engine

يبقى Local Engine.

لا Fake AI.

Input:

* آخر 3–6 أشهر.
* recent weighting.
* median/robust statistics.
* outlier handling.
* recurring expenses.
* commitments.
* manual edits.
* accepted/rejected history.

---

# 117. Insufficient Data

إذا البيانات أقل من الحد المطلوب:

لا يعطي رقم pseudo-precise.

يقول:

> لا توجد بيانات كافية بعد لبناء اقتراح موثوق.

---

# 118. Explainability

كل اقتراح لديه:

```text
Why this suggestion?
```

مثلاً:

* historical average.
* recent trend.
* recurring obligations.
* excluded outlier.
* confidence.

---

# 119. User Control

Smart Budget:

* suggestion فقط.
* user can edit.
* accept.
* reject.
* ignore.

لا automatic budget rewrite.

---

# 120. Budget Learning

يتم الاحتفاظ محلياً بما يكفي لمعرفة:

* suggestion accepted.
* edited.
* rejected.

لكن لا يبنى نموذج معقد بلا داعٍ.

---

# 121. Recurring Engine Contract

كل recurring rule لها immutable ID.

يجب أن يكون generation idempotent.

مفتاح مثل:

```text
rule_id + occurrence_date
```

أو equivalent.

يمنع duplicate generation.

---

# 122. Missed Occurrences

يجب تحديد policy:

إذا التطبيق لم يفتح شهرين:

* generate missed occurrences؟
* present pending suggestions؟
* skip؟

القرار Product يجب أن يكون واضحاً ولا يعتمد على accidental implementation.

---

# 123. Month Edge Cases

اختبار:

* 28 February.
* 29 February.
* day 30.
* day 31.
* month without day 31.

---

# 124. Recurring Edit

تعديل rule اليوم:

لا يغير Transactions تاريخية.

التعديل يؤثر على future occurrences فقط إلا إذا user فعل explicit historical edit.

---

# 125. Timezone

Recurring schedule يتبع contract محدد.

لا يولد transaction مرتين عند timezone/DST changes.

---

# 126. Phase 18 — Structural Refactor + UX / Accessibility

لا Cleanup لمجرد الجمال.

Refactor فقط عندما يخدم:

* testability.
* domain separation.
* performance.
* maintainability.

---

# 127. useSyncSlice

تفكيكه تدريجياً إلى:

```text
account lifecycle
sync worker
local persistence compatibility
migration
restore orchestration
```

مع tests قبل النقل وبعده.

---

# 128. Settings

استخراج أي Financial Guards حيّة من Legacy أولاً.

ثم:

* one Settings implementation.
* remove duplicate behavior.
* clear groups.

اقتراح:

```text
General
Financial
Security & Privacy
Account & Sync
Backup & Data
Help & About
```

---

# 129. Add Transaction

يجب أن يبقى سريعاً.

Primary path:

* amount.
* income/expense.
* wallet.
* category.
* save.

Advanced fields progressive disclosure:

* FX.
* notes.
* recurring.
* fees.
* smart capture.

---

# 130. Home

هدفها:

```text
calm financial status
```

وليس dashboard مزدحم.

تظهر:

* balance.
* month position.
* relevant budget signal.
* needs attention فقط إذا موجود.
* recent transactions.

---

# 131. History

تكون المكان الرئيسي لـ:

* search.
* filter.
* date.
* wallet.
* transaction type.
* archive scope.

---

# 132. Reports

لا charts بلا فائدة.

الأولوية:

* income vs expense.
* net.
* spending categories.
* monthly trend.
* wallet position.
* budget adherence.

---

# 133. Alerts

`Alert.alert` يبقى فقط عندما نحتاج:

* destructive confirmation.
* serious permission.
* critical failure.

أما normal validation:

* inline message.
* banner.
* toast.
* field error.

---

# 134. Accessibility Cross-Cutting Contract

Accessibility تبدأ من Phase 0، وليس في النهاية.

أي component جديد يجب أن يحترم:

* Dynamic Type.
* TalkBack.
* touch targets.
* RTL/LTR.
* focus.
* semantic labels.

Phase 18 فقط Final Audit.

---

# 135. Typography

نراجع:

* fixed tiny fonts.
* truncation.
* Arabic readability.
* enlarged text.

لا نص مالي مهم بحجم غير مقروء.

---

# 136. Currency Formatting

Presentation layer موحدة.

لا screen يعمل:

```text
amount.toFixed(...)
```

بشكل منفصل.

نستخدم:

```text
formatMoney()
formatCurrency()
formatRate()
formatDate()
```

مركزية.

---

# 137. RTL/LTR

اختبار:

* Arabic app.
* English app.
* mixed wallet names.
* Latin currency codes.
* negative amounts.
* percentage.
* charts.

---

# 138. Charts Accessibility

كل chart لديه textual summary.

المعلومة لا تعتمد فقط على اللون.

---

# 139. Navigation

نمنع:

* nested navigation غير الضرورية.
* Settings داخل Settings داخل modal.
* dead-end screens.
* technical screens للمستخدم.

---

# 140. Terminology Contract

توحيد:

```text
Backup
Restore
Archive
Export
Sync
Wallet
Base Currency
Exchange Rate
Reconciliation
```

وترجمتها العربية بصورة ثابتة.

---

# 141. Phase 19 — Codebase Final Cleanup

بعد استقرار المعمارية.

## مرشحون

* Legacy screens.
* V6 repositories.
* dead helpers.
* duplicate formatting.
* duplicate financial logic.
* unused files.

## القاعدة

قبل Delete:

```text
prove not used
+
tests cover replacement
```

---

# 142. Circular Dependencies

يبنى check آلي إن أمكن.

المطلوب:

* domain لا يعتمد على screens.
* repository لا يعتمد على UI.
* sync لا يستورد screen code.
* formatting لا يحتوي financial state.

---

# 143. God Components

تفكيك:

* Settings.
* Reports.
* Add Transaction.
* Trackers.

لكن حسب responsibility وليس حسب عدد الأسطر فقط.

---

# 144. Testing Architecture

نقسم tests حسب domain:

```text
tests/
  financial/
  sqlite/
  migration/
  backup/
  restore/
  account/
  sync/
  multicurrency/
  recurring/
  budgets/
  performance/
  android/
  security/
  accessibility/
```

---

# 145. Unit Tests

تشمل:

* money conversion.
* FX.
* transaction invariants.
* rounding.
* dates.
* recurring occurrence generation.
* budget algorithm.

---

# 146. Property / Randomized Financial Tests

مفيد جداً للـLedger.

مثلاً:

توليد sequence عشوائي من:

* income.
* expense.
* transfer.
* debt.
* goal.
* reconciliation.

ثم التأكد أن:

```text
computed postings balance == wallet balance
```

ولا NaN/overflow/duplicate.

---

# 147. SQLite Integration Tests

على SQLite حقيقية قدر الإمكان:

* transaction atomicity.
* constraints.
* indexes.
* keyset pagination.
* FTS.
* outbox same transaction.

---

# 148. Migration Tests

Fixtures من:

* old single currency.
* old multi-currency.
* missing FX.
* archive.
* legacy opening.
* large dataset.
* malformed links.

---

# 149. Backup Tests

* current backup.
* old backup version.
* password.
* corruption.
* semantic equality.

---

# 150. Account Tests

Full lifecycle matrix.

---

# 151. Sync Tests

* two clients.
* concurrent mutations.
* version mismatch.
* stale devices.
* restore epoch.
* replay.

---

# 152. Fault Injection Tests

خلال:

* migration.
* restore.
* financial write.
* sync.
* archive migration.

---

# 153. Static Tests

تبقى مفيدة.

لكن لا نعتبر:

```text
28/28 static
```

معنى:

```text
Production Ready
```

---

# 154. Phase 20 — Final Release Candidate Gate

نأخذ **نفس Release build** الذي سننشره.

ولا نعتمد نتائج builds مختلفة.

## RC يجب أن يمر:

### Financial

* all invariants.
* multicurrency.
* balance proof.
* no unresolved FX.

### SQLite

* read/write.
* migration.
* integrity.

### Backup

* restore.
* semantic round trip.

### Account

* complete lifecycle.

### Sync

إذا ستسوق كProduction feature.

### Performance

25K/50K SLO.

### Reliability

fault tests.

### Security

threat model gate.

### Android

final manifest/signing/AAB.

### UX

no developer diagnostics.

### Accessibility

TalkBack/font scaling/RTL.

### Privacy

OCR/voice disclosures.

---

# 155. Release Candidate Freeze

بعد RC:

لا Feature جديدة.

يسمح فقط:

* P0 fix.
* release blocker.
* test/documentation required for release.

---

# 156. Phase 21 — Rollout / Rollback

المسار:

```text
Internal
→ Closed Beta
→ small production percentage
→ monitor
→ expand gradually
```

---

# 157. Rollout Monitoring

نراقب:

* startup failures.
* migration failures.
* restore failures.
* DB health.
* sync conflicts.
* crash rate.

بدون إرسال financial content الحساسة.

---

# 158. Rollback Strategy

لا:

```text
install old APK over new DB
```

عشوائياً.

بعد schema upgrade:

Rollback يكون غالباً:

```text
hotfix app
compatible with current schema
```

إلا إذا أثبت downgrade path بشكل رسمي.

---

# 159. Migration Rollout Safety

عند major DB migration:

* staged rollout.
* monitor migration failure rate.
* retain rollback checkpoint.
* لا حذف old representation بسرعة.

---

# 160. Product / Pricing Boundary

## Free

يجب أن يبقى المستخدم مالكاً لبياناته حتى بدون اشتراك:

* local ledger.
* wallets.
* multi-currency core.
* income/expense.
* transfer.
* debt/receivable.
* goals.
* commitments.
* basic budgets.
* core reports.
* Archive.
* Backup.
* Restore.
* Export.

Restore لا يكون paywalled.

---

# 161. Plus

مناسب للخدمات التي تكلف infrastructure:

* cloud multi-device sync.
* cloud continuity.
* OCR.
* voice capture.
* advanced automation.
* selected advanced insights.

---

# 162. ما لا يُسوّق قبل إثباته

ممنوع ادعاء:

```text
100K ready
Production-grade sync
Fully encrypted local database
Perfect historical FX
Atomic disaster recovery
AI financial advisor
```

إلا بعد Gates مثبتة.

---

# 163. Workspaces

لا نبنيها الآن فقط لأن infrastructure تسمح.

إذا غير مكتملة:

```text
hidden / deferred
```

لكن `ledger_id` وتصميم ownership لا يغلق الباب أمامها مستقبلاً.

---

# 164. OCR / Voice

تبقى optional convenience features.

لا تصبح جزءاً من Financial Truth مباشرة.

المسار:

```text
image/audio
→ extract suggestion
→ user reviews
→ user confirms
→ normal Financial Command
```

---

# 165. Support Diagnostics

يفضل وجود Diagnostic Mode داخلي.

يستطيع استخراج:

* app version.
* schema version.
* ledger health result.
* migration status.
* outbox counts.
* integrity results.

ولا يتضمن:

* transaction notes.
* raw financial history.
* secrets.

---

# 166. Release Gate Status كمرجع دائم

أي Phase تنتهي:

يُحدث:

```text
docs/MYFI_RELEASE_GATE_STATUS_AR.md
```

لا نكتفي بعبارة في chat أو commit.

---

# 167. Definition of Done لكل Phase

أي مرحلة ليست Done إلا إذا:

1. implementation مكتمل.
2. tests مكتوبة.
3. tests ناجحة.
4. real environment عند الحاجة.
5. migration/rollback مدروسة.
6. documentation محدثة.
7. لا unresolved P0.
8. evidence مسجل.

---

# 168. قواعد Git / Change Scope

كل Phase تقسم إلى PRs صغيرة منطقية.

مثال:

```text
PR 1: contracts/tests only
PR 2: repository implementation
PR 3: one vertical slice
PR 4: UI adoption
PR 5: compatibility removal
```

لا PR ضخمة تغير:

* schema.
* sync.
* restore.
* archive.
* UX.

كلها دفعة واحدة.

---

# 169. قاعدة Refactor

قبل Refactor:

```text
test current behavior
```

ثم:

```text
refactor
```

ثم:

```text
same tests + new tests
```

لا Refactor blind.

---

# 170. قاعدة Feature Freeze

حتى نصل Operational Canonical Cutover:

لا Features جديدة إلا إذا:

* تحمي المال.
* مطلوبة للmigration.
* مطلوبة للاختبار.
* release blocker.

---

# 171. ترتيب التنفيذ النهائي

```text
PHASE 0
Governance + Evidence + Contracts + Scope
+ Data Ownership
+ Security/Accessibility rules

PHASE 1
Android Native + SQLite V7 Reality Proof

PHASE 2
Migration Infrastructure Minimum

PHASE 3
Confirmed Financial P0 Fixes
+ Base Currency
+ Guest Merge
+ FX
+ Archive Freeze
+ Date
+ Opening Balance Audit

PHASE 4
Balance Proof
+ Financial Invariants
+ Multi-Currency Correctness

PHASE 5
Shadow Migration / Migration Readiness
NO operational cutover yet

PHASE 6
SQLite-first Write Path
+ Same-transaction Outbox
+ All Financial Entities
+ Single Writer

PHASE 7
SQLite-first Read Path
+ Home
+ History
+ Reports
+ Search
+ Trackers
+ Budgets

PHASE 8
Operational Canonical Cutover
V7 becomes actual authority

PHASE 9
Account Lifecycle Gate

PHASE 10
Atomic Backup / Restore Engine
+ Restore ↔ Cloud semantics

PHASE 11
Archive Consolidation

PHASE 12
Final Semantic Backup Round Trip

PHASE 13
Compatibility / Dual-write Retirement
+ Vault final role

PHASE 14
Sync Hardening
+ Protocol Versioning
+ Two-device
+ Restore Epoch
+ Conflict Policy

PHASE 15
Performance + Reliability Gate

PHASE 16
Android Production + Security Gate

PHASE 17
Budget Intelligence
+ Recurring Completion
+ Remaining Product Correctness

PHASE 18
Structural Refactor
+ UX
+ Accessibility

PHASE 19
Final Codebase Cleanup

PHASE 20
Final Release Candidate Gate

PHASE 21
Internal → Closed Beta → Staged Production
```

---

# 172. Dependency Rules

## لا Phase 5 Readiness بدون

* P0 fixed.
* Health proof.
* migration infrastructure.

## لا Phase 6 بدون

Shadow migration proven.

## لا Phase 7 الكامل بدون

Core write paths proven.

## لا Phase 8 Cutover بدون

* write path.
* core read path.
* final parity.
* health.
* rollback checkpoint.

## لا Phase 13 final retirement بدون

* restore proven.
* semantic backup proven.
* account lifecycle proven.

## لا Snapshot Sync removal بدون

Mutation Sync two-device gate.

## لا Production بدون

Final RC gate على نفس build.

---

# 173. الأشياء التي لا يجوز حذفها مبكراً

لا نحذف:

* Vault recovery.
* Snapshot Sync.
* V6 reader.
* old archive.
* legacy migration code.
* old state backup.

إلا عند Gate صريح يسمح بذلك.

---

# 174. الأشياء التي يجب أن تختفي في النهاية

بعد نجاح كل Gates:

* Zustand full ledger.
* V6 financial mirror.
* competing financial snapshots.
* duplicate Archive financial storage.
* legacy Settings implementation.
* duplicate currency logic.
* stale integrity engines.
* dead screens.
* obsolete migration runtime paths.

---

# 175. Final Production Architecture

```text
┌─────────────────────────────────────┐
│                 UI                  │
│ Home / History / Reports / Trackers │
│ Budgets / Settings / Add            │
└──────────────────┬──────────────────┘
                   │
           Commands / Queries
                   │
┌──────────────────▼──────────────────┐
│       Financial Domain Layer        │
│                                     │
│ Money / FX / Dates / Invariants     │
│ Debt / Receivable / Goals           │
│ Budgets / Recurring / Reconciliation│
└──────────────┬──────────────┬───────┘
               │              │
           Commands         Queries
               │              │
┌──────────────▼──────────────▼───────┐
│           SQLite Ledger             │
│       SINGLE SOURCE OF TRUTH        │
│                                     │
│ ledger / wallets / transactions     │
│ postings / FX / entities            │
│ budgets / recurring                 │
│ archive metadata                    │
│ outbox / sync state                 │
└──────────────┬──────────────────────┘
               │
        durable local commit
               │
               ├────────→ UI success
               │
               ▼
          Background Sync
               │
┌──────────────▼──────────────────────┐
│             Supabase               │
│ Auth / RLS / RPC / Mutation Relay   │
└─────────────────────────────────────┘

SecureStore:
keys / secrets / auth

Zustand:
UI/session/query cache only

Backup:
user-owned encrypted disaster recovery
```

---

# 176. أهم قوانين عدم الانحراف

1. لا Final Cutover قبل SQLite-first Write + Core Read.
2. لا تغيير Base Currency بعد history.
3. لا Country يغير Base Currency بصمت.
4. لا Guest merge يغير Wallet Currency.
5. لا Missing FX يتحول إلى `1`.
6. لا Current FX يعيد تقييم الماضي.
7. لا JS floating point كحقيقة مالية.
8. لا Financial write خارج command/repository boundary.
9. لا Outbox خارج نفس transaction المالية.
10. لا UI success قبل durable local commit.
11. لا Cloud blocking للFinancial UI.
12. لا Health Checker منافس لـV7 truth.
13. لا Archive تغير balances.
14. لا Restore overwrite مباشر.
15. لا Sync يبدأ أعمى بعد Restore.
16. لا Restore وImport يُعاملان كشيء واحد.
17. لا حذف account يمسح ledger.
18. لا dual-write إلى الأبد.
19. لا Snapshot Sync removal قبل two-device proof.
20. لا V6 reader removal قبل restore proof.
21. لا schema change بدون migration journal.
22. لا sync mutation بلا protocol version.
23. لا automatic merge لـmonetary conflicts.
24. لا recurring duplicate occurrence.
25. لا smart budget يتخذ قراراً بدلاً من المستخدم.
26. لا AI extraction ينشئ حركة بلا confirmation.
27. لا sensitive financial logs.
28. لا `allowBackup=true` في production Android.
29. لا debug signing في production artifact.
30. لا accessibility كـpost-release afterthought.
31. لا Workspaces نصف مكتملة.
32. لا Feature جديدة قبل ثبات الأساس.
33. لا claim تسويقي بلا Release Gate evidence.
34. لا “PASSED” بدون Environment + Test Type + Build.
35. لا Rewrite للمشروع ما دام V7 يمكن إكمالها بأمان.

---

# 177. متى نعتبر MYFI Near Production؟

فقط بعد نجاح:

```text
Operational SQLite Cutover
+
Financial Health
+
Account Lifecycle
+
Atomic Restore
+
Semantic Backup
+
Core Performance
+
Android Security
```

---

# 178. متى نعتبر MYFI Production Ready؟

فقط عندما **نفس Release Candidate build** يمر:

```text
Financial correctness
SQLite correctness
Migration
Multi-currency
Backup/Restore
Account lifecycle
Sync if marketed
Performance
Reliability
Security
Android final artifact
Accessibility
Privacy
UX release audit
```

ثم يدخل:

```text
Internal
→ Closed Beta
→ Staged Production
```

---

# 179. القرار الهندسي النهائي

MYFI لا يحتاج Rewrite.

الهدف ليس إضافة المزيد من الأنظمة.

الهدف هو إزالة التنافس بين الأنظمة الموجودة وجعل النظام النهائي أبسط:

```text
One Ledger
One Financial Truth
One Money Contract
One Write Boundary
One Migration Policy
One Backup Contract
One Sync Protocol
```

كل مرحلة من الخطة يجب أن تجعل MYFI:

**أبسط، أدق، أسرع، أكثر أماناً، وأسهل في الصيانة.**

إذا أي تغيير لا يحقق واحدة من هذه النتائج أو يحل خطراً مثبتاً:

**لا ينفذ.**

---

# 180. ADDENDUM 2026-08-15 — User Notes Reconciliation + Multi-Persona Audit

هذا الملحق **إضافي ومُلزم** ولا يعيد كتابة الأقسام 1–179 ولا يغير ترتيب المراحل المجمدة.

مصدر مراجعة الكود لهذه الجولة:

```text
Repository: husseinoday1/MYFI1
Branch: phase-04-multicurrency-r03
HEAD: 28c7e29e7c1623f83ccb4359bba613f8f2f5cd25
Commit: R03 Phase 4 multi-currency completion and Phase 5 migration readiness
Review date: 2026-08-15
```

قاعدة هذا الملحق:

> أي ملاحظة مستخدم سابقة لم تعد تُعامل كـ"محادثة قديمة". تصبح Requirement أو Regression Gate أو Device Verification Item إلى أن يوجد دليل واضح بأنها أُغلقت.

ولا تعتبر أي ملاحظة "منفذة" فقط لأن الكود يحتوي جزءاً قريباً منها.

---

# 181. Status Contract لملاحظات المستخدم

نستخدم الحالات التالية فقط:

```text
IMPLEMENTED_STRUCTURAL
PARTIAL
PENDING
DEVICE_VERIFY
TWO_DEVICE_VERIFY
PERFORMANCE_VERIFY
DEFERRED_BY_PLAN
BLOCKING
```

المعنى:

* `IMPLEMENTED_STRUCTURAL`: المسار موجود في الكود الحالي، لكن لا يعفي من Device test عند الحاجة.
* `PARTIAL`: جزء من المطلوب موجود وجزء مفقود أو ما زال يعتمد Legacy path.
* `PENDING`: الملاحظة لم تُغلق.
* `DEVICE_VERIFY`: لا يمكن إغلاقها بدون APK/device evidence.
* `TWO_DEVICE_VERIFY`: تحتاج جهازين حقيقيين.
* `PERFORMANCE_VERIFY`: لا تغلق بالـunit tests.
* `DEFERRED_BY_PLAN`: مؤجلة عمداً إلى Phase لاحقة، وليست منسية.
* `BLOCKING`: تمنع الانتقال إلى مرحلة تجعل SQLite write/read path نهائياً أو تمنع RC.

---

# 182. Reconciliation — ملاحظات المستخدم السابقة مقابل الحالة الحالية

## 182.1 Onboarding

المطلوب السابق:

* 3 شاشات فقط.
* Screen 1 قيمة البرنامج + Mini Dashboard حقيقي.
* Screen 2 فهم الإنفاق.
* Screen 3 Quick Setup:
  * نوع الاستخدام.
  * الدولة.
  * العملة.
  * شرح Local-first / Cloud optional.
* لا Guide تلقائي بعد Onboarding.

الحالة:

```text
3 screens: IMPLEMENTED_STRUCTURAL
Mini dashboard / spending explanation: IMPLEMENTED_STRUCTURAL
Quick Setup usage/country/currency: PENDING
Personal/Business/Dual selection: PENDING
Hardcoded personal completion path: BLOCKING for intended onboarding semantics
Automatic extra guide: no evidence of forced guide in current reviewed path
```

الملاحظة المهمة:

الكود الحالي ينهي Onboarding على `personal` مباشرة ولا يعرض Quick Setup الذي كان مطلوباً سابقاً.

لا تعتبر Onboarding مغلقة قبل إعادة هذه المتطلبات واختبارها.

---

## 182.2 Trackers direct actions

المطلوب:

```text
دين عليّ
مستحق لي
ادخار
التزامات
```

كأزرار مباشرة، وعدم جمعها داخل `Add Tracker` واحد.

الحالة:

```text
IMPLEMENTED_STRUCTURAL
```

يوجد مسار Direct actions منفصل للأنواع الأربعة حسب الـmodules المفعلة.

يبقى Device UX verification عند Phase 18.

---

## 182.3 Settings navigation

المطلوب:

* Settings Root واضح.
* لا Menu → Menu → Menu.
* Back يرجع خطوة واحدة.
* الضغط على Settings tab يعيد إلى Root.
* Financial Setup مالية فقط.
* لا فتح Legacy Settings كاملة من Advanced.
* استخدام Accordions عندما تكون الأقسام كثيرة أفضل من nesting.

الحالة:

```text
Root + nav stack + reset-to-root mechanics: IMPLEMENTED_STRUCTURAL
Financial section still embeds LegacySettingsScreen: PARTIAL
Single Settings implementation: PENDING
Legacy behavior retirement: DEFERRED_BY_PLAN / Phase 18-19
```

قاعدة جديدة:

> لا نعتبر Settings مكتملة طالما financial behavior موزع فعلياً بين New Settings وLegacy Settings.

---

## 182.4 Language / Theme / Rotation wording

المطلوب:

* توحيد معنى `حسب الجهاز`.
* `استخدام إعداد الجهاز` يكون action/choice.
* `حسب الجهاز · العربية` أو `حسب الجهاز · داكن` يكون state explanation.
* إذا manual، لا نعرض `حسب الجهاز` كأنه قيمة ثانية.

الحالة:

```text
New Settings wording: IMPLEMENTED_STRUCTURAL
Legacy parity: DEVICE_VERIFY / code parity review required
```

---

## 182.5 Home

المطلوب السابق:

* Available Balance الرقم الأساسي.
* Physical/Reserved في Wallet details.
* لا Card لكل شيء.
* Important States لا تظهر إذا فارغة.
* Savings section لا تظهر إذا فارغة.
* صفر يعرض 0 وليس 0+ / 0-.
* CTA واضح للمستخدم الجديد.
* استعادة Month Summary.
* إظهار Savings وNet في ملخص الشهر.
* Quick Actions بعد ملخص الشهر.

الحالة:

```text
Available balance focus: IMPLEMENTED_STRUCTURAL
Month summary exists: IMPLEMENTED_STRUCTURAL
Quick actions exist: IMPLEMENTED_STRUCTURAL
Empty-state logic: IMPLEMENTED_STRUCTURAL / DEVICE_VERIFY
Exact final ordering/visual hierarchy: DEVICE_VERIFY
```

أي regression في Month Summary يعود مباشرة إلى `BLOCKING UX regression` لأنه ملاحظة مستخدم سابقة.

---

## 182.6 History

المطلوب السابق:

* بدون Header `السجل + عدد الحركات`.
* Search/Filter/Transaction type controls ثابتة أثناء Scroll.
* إذا لا توجد transactions لا نظهر أدوات فارغة.
* Today ثم Yesterday ثم Older.
* داخل اليوم: newest first.
* `dateISO` أساس التاريخ و`ts` لترتيب نفس اليوم.

الحالة:

```text
Top header removal: IMPLEMENTED_STRUCTURAL
Fixed controls outside scrolling list: IMPLEMENTED_STRUCTURAL
Hide controls on empty history: IMPLEMENTED_STRUCTURAL
Unified newest-first indexing: IMPLEMENTED_STRUCTURAL
Real device sticky behavior: DEVICE_VERIFY
```

---

## 182.7 Repeat Transaction

المطلوب:

تكرار:

* Income.
* Expense.
* Transfer.
* Debt payment.
* Saving.
* Commitment payment.

مع:

* تاريخ اليوم.
* مراجعة المستخدم قبل Save.
* عدم نسخ recurring schedule بصمت.
* لا Silent Failure.

الحالة:

```text
Draft duplication paths for all listed types: IMPLEMENTED_STRUCTURAL
Real device end-to-end: DEVICE_VERIFY
```

---

## 182.8 Commitment payment default wallet

المطلوب:

عند الدفع من:

* Home.
* Tracker.
* Commitment details.

تكون Default Wallet الحالية هي الاختيار الأول، ويمكن تغييرها يدوياً، ولا تفرض Wallet تاريخ إنشاء الالتزام نفسها.

الحالة:

```text
Default-wallet initialization in AddTransModal: IMPLEMENTED_STRUCTURAL
Cross-entry-point device parity: DEVICE_VERIFY
```

---

## 182.9 Reports UX

المطلوب:

* لا تعتبر Reports فارغة إذا لا توجد Transactions لكن توجد balances/debts/receivables/savings/commitments.
* Empty state فقط عندما لا توجد Financial Data.
* Selected periods لا تتحول إلى سلسلة طويلة.
* اختيار التقرير مرة واحدة ثم عرض البيانات مباشرة.
* لا card/list ثانية بنفس اسم التقرير قبل البيانات.
* تبسيط Reports.
* Wallet controls واضحة وغير مزدحمة.

الحالة:

```text
Report engine has broader financial snapshot inputs: IMPLEMENTED_STRUCTURAL
Old duplicate-selection UX: DEVICE_VERIFY
No-transactions-but-trackers scenario: DEVICE_VERIFY
Final UX simplification: PARTIAL
```

لا تغلق ملاحظة Reports من static review فقط.

---

## 182.10 Budget V2

المطلوب:

* الشهر الحالي.
* إجمالي الميزانية.
* إجمالي المصروف.
* المتبقي.
* Categories.
* budget/spent/remaining لكل Category.
* Progress.
* statuses واضحة بلا مبالغة بالألوان.

الحالة:

```text
Monthly budget maps + rows + summary: IMPLEMENTED_STRUCTURAL
Final UX: PARTIAL / DEVICE_VERIFY
```

---

## 182.11 Adaptive Smart Budget / Smart Fill

المطلوب:

* 3–6 أشهر.
* recent weighting.
* outlier handling.
* recurring.
* commitments.
* manual edits.
* accepted/rejected history.
* explainability.
* confidence.
* user accept/edit/reject/ignore.
* insufficient-data message.
* Local-first.

الحالة:

```text
Historical weighting: IMPLEMENTED_STRUCTURAL
Outlier handling: IMPLEMENTED_STRUCTURAL
Trend/confidence: IMPLEMENTED_STRUCTURAL
Local engine: IMPLEMENTED_STRUCTURAL
Accepted/edited/rejected learning state: PENDING
Full explainability UX: PARTIAL
No pseudo-precision under insufficient data: must remain a regression test
```

---

## 182.12 User Guide V2

المطلوب أن يشمل:

```text
Getting started
Daily transactions
Income
Expense
Transfers
Wallets
Balances
Categories
Budgets
Smart suggestions
Debts
Receivables
Savings
Goals
Commitments
Recurring
Reports
Archive
Sharing
Export
PDF
CSV
Account
Devices
Sync
Backup
Restore
Security
```

الحالة الحالية:

```text
Task-oriented Guide exists: IMPLEMENTED_STRUCTURAL
Coverage is still only a small subset: PARTIAL
Full User Guide V2: PENDING
```

---

## 182.13 Glossary

المطلوب `مصطلحات البرنامج` بالعربية للمفاهيم المالية والمنتج.

الحالة:

```text
PENDING
```

لا يوجد دليل في المسار الحالي على Glossary كامل.

---

## 182.14 About / Mission / Iraqi identity

المطلوب:

* Logo + Name.
* تعريف مختصر.
* رسالة المنتج.
* مبادئ MYFI.
* `صُمم في العراق، للمستخدم العربي أولاً.`
* المجاني والاشتراك.
* Version/Build/Platform.
* Privacy/Terms/Licenses.
* Help يبقى منفصلاً.

الحالة:

```text
About page exists: IMPLEMENTED_STRUCTURAL
Full mission / Iraqi identity content: PARTIAL
Final branding/rebranding: DEFERRED_BY_PLAN until Arabic name is selected
```

لا نغير اسم التطبيق أو Logo قبل قرار الاسم النهائي.

---

## 182.15 Account / Profile UX

المطلوب:

* هوية مستخدم واحدة.
* لا Local Account / Cloud Profile technical model للمستخدم.
* قبل الربط: `محفوظ على هذا الجهاز`.
* بعد الربط: نفس الاسم والصورة + `متصل بحساب MYFI`.
* account optional.
* profile name/image يرجعان من Cloud Profile على جهاز ثانٍ.
* Legacy `المستخدم/User` placeholder وليس اسم حقيقي.

الحالة:

```text
Single-identity presentation: PARTIAL / mostly structural
Legacy placeholder handling: IMPLEMENTED_STRUCTURAL
Cloud profile infrastructure: IMPLEMENTED_STRUCTURAL
Second-device identity restore proof: TWO_DEVICE_VERIFY
```

ملاحظة جهاز حالية غير مغلقة:

```text
Home profile → "إدارة الحساب والأمان" → opens generic Settings root
Expected: direct Account/Security destination
Status: PENDING
```

---

## 182.16 Auth / Keyboard

ملاحظة المستخدم:

> واجهة تسجيل الدخول تبقى منخفضة والكيبورد يغطيها.

الحالة:

```text
PENDING / DEVICE_VERIFY
```

الكود الحالي يستخدم `KeyboardAvoidingView` مع ScrollView، لكن تصميم `justifyContent: center` ما زال يحتاج اختباراً حقيقياً ولا يكفي وجود المكوّن لإغلاق الملاحظة.

---

## 182.17 Date / Year selector

الملاحظة:

* الوظيفة تعمل.
* اختيار السنة المباشر مطلوب ومفيد.
* الشكل الحالي غير احترافي.

الحالة:

```text
Functional: IMPLEMENTED_STRUCTURAL
Visual/professional redesign: DEFERRED_BY_PLAN → Phase 18 UX
```

لا نعيد تصميمه داخل Phase مالية إلا إذا يمنع الاستخدام.

---

## 182.18 Archive save-to-phone

المطلوب:

* Save to phone ≠ Share.
* لا نزيل البيانات active قبل نجاح إنشاء/حفظ archive package.
* password archive لا يخفّض قوة التشفير لأجل السرعة.

الحالة:

```text
Save-to-device path: IMPLEMENTED_STRUCTURAL
Archive commit after successful package path: IMPLEMENTED_STRUCTURAL
Encryption performance: PERFORMANCE_VERIFY
```

---

## 182.19 Backup / Restore

المطلوب:

* Active data.
* archived years.
* wallets.
* categories.
* budgets.
* debts.
* receivables.
* savings/goals.
* commitments.
* relevant financial settings.
* staged validation before destructive promotion.
* semantic equality.
* preserve ledger identity حسب restore mode.

الحالة:

```text
Logical backup model includes broad data + cold archives: IMPLEMENTED_STRUCTURAL
Full Phase 10 atomic restore gate: PENDING
Cross-version restore: PENDING
Semantic round-trip real proof: PENDING
```

---

## 182.20 Sync / Multi-device

المطلوب:

* three-way merge behavior not regressed.
* revision protection.
* device id.
* account-switch guard.
* deletion wins over stale state.
* retry behavior.
* local logout only.
* real two-device test.

الحالة:

```text
Core concepts present from prior work: IMPLEMENTED_STRUCTURAL / legacy bridge
Single-device automatic retry observed previously: DEVICE evidence exists
Two-device concurrent convergence: TWO_DEVICE_VERIFY
Final mutation-sync gate: PENDING
```

---

## 182.21 Notifications

المطلوب السابق:

* Development/production-like build test.
* لا اعتبار Expo Go دليلاً نهائياً.

الحالة:

```text
APK/native path available: IMPLEMENTED_STRUCTURAL
Full notification behavior acceptance: DEVICE_VERIFY
Account-switch notification isolation: PENDING
Privacy consistency across notification types: PENDING
```

---

# 183. Multi-Persona Audit — الملاحظات الجديدة الملزمة

هذه البنود نتجت من مراجعة MYFI كمستخدمين متعددين ذوي أهداف مختلفة.

لا تُعامل كـWishlist. كل بند إما:

* Contract gap.
* Product correctness gap.
* Privacy/security gap.
* UX/accessibility gap.
* Release-positioning gap.

---

## 183.1 Personal + Business user

### Finding UPA-01 — Scope separation

في الوضع المزدوج يجب ألا تكون `ALL` هي الطريقة الوحيدة العملية للعرض والإدخال.

المطلوب:

* Personal view مستقل.
* Business view مستقل.
* All view اختياري.
* entry scope واضح.
* default wallet لا يخلق leakage بين Personal وBusiness.
* budgets لا تتداخل بين scopeين.

**Gate:** BLOCKING قبل اعتماد Write/Read path النهائي للمستخدم المزدوج.

---

## 183.2 Shared / Family user

### Finding UPA-02 — Shared room privacy

لا تحمل أو تعرض بيانات مشروع/شخصي خارج ما وافق المستخدم على مشاركته.

### Finding UPA-03 — Membership roles

يجب فصل مفاهيم:

```text
Owner
Manager/Member
Viewer
```

إن تم تسويق Shared/Family feature.

### Finding UPA-04 — Owner leave semantics

مغادرة Owner لا يجوز أن تعني حذف workspace/room للجميع بلا ownership-transfer policy واضحة.

**Phase:** قبل أي marketing للـshared rooms.

---

## 183.3 Debt / Loan user

### Finding UPA-05 — Debt due date

Debt الحقيقي يحتاج due/maturity semantics، لا مجرد createdAt + remaining amount.

### Finding UPA-06 — Principal vs interest vs fee

دفعة قرض/بطاقة قد تحتوي:

```text
principal
interest
fee
```

ولا يجوز اعتبار كل payment تخفيض principal تلقائياً.

**Gate:** BLOCKING قبل توسيع debt feature كـloan-grade feature.

---

## 183.4 Tracker deletion

### Finding UPA-07 — Delete tracker must not rewrite financial truth

حذف tracker لا يجوز أن يمحو financial transactions المرتبطة كأثر جانبي غير واضح.

يجب التفريق بين:

```text
Archive tracker
Hide tracker
Delete tracker metadata
Void financial transaction
```

**Gate:** BLOCKING.

---

## 183.5 Historical labels

### Finding UPA-08 — Rename must not rewrite historical meaning silently

تعديل اسم Debt/Goal اليوم لا يجب أن يعيد كتابة وصف الحركات التاريخية بلا explicit rule.

---

## 183.6 Goal user

### Finding UPA-09 — Goal target date

Goal يجب أن يدعم distinction بين:

```text
target amount only
target amount + deadline
```

إذا نريد forecast/planning ناضج.

---

## 183.7 Historical reports

### Finding UPA-10 — As-of truth

تقرير 2025 يجب أن يعرض state كما كانت في 2025، لا current goal/debt state.

أي fallback تاريخي مثل:

```text
1970-01-01
today()
```

يحتاج explicit migration/audit semantics ولا يجوز أن يصنع تاريخاً وهمياً.

**Gate:** BLOCKING للتقارير التاريخية النهائية.

---

## 183.8 Recurring-heavy user

### Finding UPA-11 — Recurrence frequencies

لا يقتصر recurring على monthly إذا تم تسويقه كRecurring Engine ناضج.

يغطي contract على الأقل:

```text
weekly
biweekly
monthly
quarterly
semiannual
annual
custom interval if supported
```

### Finding UPA-12 — Missed occurrences

إذا التطبيق لم يفتح لفترة، policy يجب أن تكون صريحة وidempotent.

### Finding UPA-13 — Commitment matching

لا يجوز اعتبار commitment مدفوعاً فقط بسبب تشابه اسم/تصنيف/مبلغ بدرجة قد تسبب false match.

---

## 183.9 Salary / Freelancer user

### Finding UPA-14 — Expected future income

Forecast لا يجوز تقديمه كقرار نهائي إذا كان لا يعرف الدخل المتوقع القادم.

يجب أن يوضح basis بوضوح.

---

## 183.10 Seasonal budget user

### Finding UPA-15 — Zero-spend months

Smart budget history لا يهمل أشهر الصفر بطريقة ترفع "المعتاد" للتصنيفات الموسمية.

### Finding UPA-16 — Suggestion learning

قبول/تعديل/رفض الاقتراحات يجب أن يدخل Product state إذا كانت الخطة تقول إن النظام يتعلم من المستخدم.

---

## 183.11 Base currency + budget

### Finding UPA-17 — Budget locks base-currency meaning

وجود Budget مالي قبل أول transaction يجب أن يدخل ضمن `currency-sensitive financial state` أو يكون له contract واضح عند تغيير base currency.

**Gate:** BLOCKING قبل base-currency contract النهائي.

---

## 183.12 Traveller / card user

### Finding UPA-18 — Three-layer transaction currency

يجب أن يستطيع النموذج التمييز عند الحاجة بين:

```text
original purchase currency
settlement wallet/card currency
ledger base/reporting currency
```

مثال:

```text
purchase: EUR
card settles: USD
base ledger: IQD
```

### Finding UPA-19 — Third-currency fee

Transfer fee قد تكون:

* source currency.
* target currency.
* third currency.
* separate wallet.
* receiver-deducted.

لا نعلن support شامل إذا model لا يغطيها.

### Finding UPA-20 — Wallet valuation freshness

أي `valuationRate` مستخدم لصافي المركز المالي يحتاج:

```text
rate
rate date
source
freshness semantics
```

ولا يظهر كأنه current إذا كان قديماً.

---

## 183.13 International number input

### Finding UPA-21 — Locale-safe number parsing

لا يجوز أن تتحول:

```text
1.234,56
```

إلى قيمة مالية مختلفة بسبب parser موحد على نمط واحد.

يجب اختبار:

* Arabic digits.
* Persian digits.
* ar-IQ separators.
* en-US.
* decimal-comma locales.
* copy/paste formatted amounts.

**Gate:** BLOCKING لأي global claim.

---

## 183.14 Arabic identity

### Finding UPA-22 — Username policy clarity

إذا Username مقيد باللاتيني:

* يجب أن يكون قرار Product واضحاً.
* لا يحول الاسم العربي بصمت إلى underscores.
* Display Name يبقى عربي بالكامل.

---

## 183.15 Fast-entry user

### Finding UPA-23 — Split transactions

إذا نريد expense categorization احترافية، يجب تحديد هل transaction واحدة يمكن تقسيمها بين عدة categories.

إذا غير مدعوم في الإصدار الحالي، يذكر كحد Product واضح.

---

## 183.16 Refund / reversal

### Finding UPA-24 — Refund is not ordinary income

Refund/chargeback/reversal يحتاج semantics تمنع تضخيم Income بسبب إعادة مصروف سابق.

**Gate:** BLOCKING للتقارير الدقيقة.

---

## 183.17 Merchant analytics

### Finding UPA-25 — Merchant/Payee semantics

إذا نريد rules/analytics حسب جهة الصرف، لا يكفي `title` وحده كمفهوم طويل الأمد.

---

## 183.18 Data portability

### Finding UPA-26 — Import from external transaction files

Backup restore لا يساوي transaction import.

يجب تحديد support policy لـ:

```text
CSV
OFX
QIF
other formats if supported
```

مع preview/matching/dedupe قبل الإدخال.

### Finding UPA-27 — CSV multi-currency completeness

CSV المالي يجب ألا يفقد عند الحاجة:

* native currency.
* native amount.
* base amount.
* FX rate/snapshot.
* from/to wallets.
* transfer fee.
* transaction type/tag.

**Gate:** BLOCKING إذا CSV يُسوّق كfinancial export كامل.

---

## 183.19 Long-history search

### Finding UPA-28 — Search active + cold archives

Search النهائي يجب أن يستطيع تحديد نطاق:

```text
active only
archived only
all history
```

بدون فتح archive سنة سنة.

### Finding UPA-29 — Arabic search normalization

البحث العربي يجب أن يستخدم normalization موحداً ولا يعتمد lower-case `includes` فقط.

---

## 183.20 Category lifecycle

### Finding UPA-30 — Category delete must not rewrite past reports

حذف category اليوم لا يجب أن يحول كل التاريخ إلى `other` ويزيل budget history بصمت.

يجب التفريق بين:

```text
archive category
disable category for future use
historical mapping
explicit migration
```

**Gate:** BLOCKING.

---

## 183.21 Feature toggles

### Finding UPA-31 — Hidden feature ≠ hidden financial truth

إطفاء module UI لا يجوز أن يغير:

* Income.
* Expense.
* balance.
* report totals.
* historical truth.

قد يخفي Tracker UI، لكنه لا يخفي transaction المالية من truth.

**Gate:** BLOCKING.

---

## 183.22 Wallet lifecycle

### Finding UPA-32 — UI text must match delete behavior

إذا Wallet ذات history لا يمكن حذفها، لا تعرض رسالة تقول إن تاريخها سينقل تلقائياً إلى Wallet أخرى إلا إذا هذا هو contract الحقيقي والمثبت.

---

## 183.23 Notifications

### Finding UPA-33 — Daily notification content freshness

Scheduled notification body لا يعتبر "حياً" إذا تم حسابه مرة واحدة وقت schedule.

### Finding UPA-34 — Cancel only owned reminders

`cancel daily` لا يجب أن يلغي كل scheduled notifications الأخرى.

### Finding UPA-35 — Privacy gate applies to every notification

`hideNotificationDetails` يجب أن يحمي:

* decision alerts.
* low balance.
* debt.
* commitment.
* recurring.
* أي notification مالية.

### Finding UPA-36 — Notification namespace per ledger/account

throttle keys وscheduled IDs يجب ألا تتقاطع بين Account A / Account B أو ledgers مختلفة.

### Finding UPA-37 — Priority truncation

إذا engine يرسل أول عنصرين فقط، يجب وجود policy تمنع إسقاط critical third item بلا ظهور داخل notification center.

---

## 183.24 Signup / Profile user

### Finding UPA-38 — Confirm password

Signup UX يحتاج قرار واضح حول confirmation/typo prevention.

### Finding UPA-39 — Raw backend errors

لا يظهر technical backend error للمستخدم النهائي إلا كdiagnostic opt-in.

### Finding UPA-40 — Degraded profile write

إذا backend schema لا يقبل بعض profile fields، لا يعتبر Save كاملاً بصمت.

يجب إظهار partial/degraded state أو منع claim النجاح.

### Finding UPA-41 — Public fallback username uniqueness

fallback مثل `@myfi_user` لا يجوز تقديمه كمعرّف عام unique.

---

## 183.25 Backup repair

### Finding UPA-42 — No silent wallet-reference repair

Unknown wallet references في backup/restore لا يجوز إصلاحها تلقائياً إلى default wallet بدون explicit review.

هذا يدخل مباشرة تحت:

```text
No silent financial repair
```

**Gate:** BLOCKING.

---

## 183.26 Accessibility user

### Finding UPA-43 — Touch / TalkBack / Dynamic Type

كل user-facing component يجب أن يمر:

* touch target.
* TalkBack label.
* focus order.
* Arabic/English RTL/LTR.
* 200% font.
* truncation.
* chart textual alternative.

لا ينتظر Phase 18 لإصلاح component جديد؛ Phase 18 هو Final Audit فقط.

---

## 183.27 Product positioning

### Finding UPA-44 — Marketing claim must match domain

لا نستخدم claims أوسع من model الحقيقي.

أمثلة تحتاج حذر:

```text
"كل أموالك"
"Business finance"
"Recurring engine"
"Complete export"
"Family finance"
```

إذا لا يوجد بعد:

* investments/assets.
* loan interest model.
* business tax/invoice/customer/vendor semantics.
* full shared roles/privacy.
* full recurring frequencies.

يكون wording مضبوطاً إلى scope الحقيقي للنسخة.

---

# 184. Gate U-1 — User Notes Reconciliation Gate

قبل Phase 6 SQLite-first Write Path:

يجب إنشاء ملف Evidence يراجع كل ملاحظات المستخدم السابقة ويعطي لكل واحدة:

```text
ID
Original user requirement
Current code path
Status
Automated test
Device test
Two-device test if needed
Remaining gap
Target phase
```

لا يجوز استخدام:

```text
probably fixed
looks fine
should work
```

كحالة إغلاق.

الحالات المقبولة للإغلاق:

```text
PASS_STATIC + PASS_RUNTIME
PASS_DEVICE
PASS_TWO_DEVICE
PASS_PERFORMANCE
DEFERRED_WITH_EXACT_PHASE
```

---

# 185. Gate U-2 — Financial Product Correctness Before Phase 6

هذه البنود من الـPersona Audit تصبح **Pre-Phase-6 contract blockers** لأن تنفيذ Write Path نهائي قبل حسمها سيجعل تعديل الـledger لاحقاً أصعب:

```text
UPA-01 Personal/Business scope separation
UPA-05 Debt due-date semantics
UPA-06 Principal / interest / fee semantics
UPA-07 Tracker deletion vs financial history
UPA-10 Historical as-of reports
UPA-13 Commitment false matching
UPA-17 Budget + base currency meaning
UPA-18 Three-layer currency transaction
UPA-19 Third-currency fee support policy
UPA-20 Valuation-rate freshness
UPA-24 Refund/reversal semantics
UPA-30 Category lifecycle / historical truth
UPA-31 Feature toggle must not hide financial truth
UPA-42 No silent backup repair
UPA-45 Logout / session must not redefine local ledger lifecycle
```

ليس معنى ذلك أن كل Feature المتقدمة يجب أن تنفذ قبل Phase 6.

المطلوب قبل Phase 6 هو:

> تثبيت الـdomain contract والـstorage model حتى لا نكتب SQLite-first على semantics نعرف مسبقاً أنها ناقصة أو خطرة.

إذا feature تؤجل:

```text
explicitly unsupported
+
data model future-safe
+
no false claim
```

---

# 185A. Phase Ownership / Non-Intersection Rule

To preserve the frozen order, findings discovered after R03 do **not** create parallel mini-phases and do not silently reopen completed implementation work.

Each finding has exactly one **primary owner**:

```text
Pre-Phase-6 Gate U-1 = evidence/reconciliation only
Pre-Phase-6 Gate U-2 = domain/storage contract freeze only
Phase 6 = writes
Phase 7 = reads/query presentation
Phase 8 = operational cutover
Phase 9 = account/ledger lifecycle semantics
Phase 10 = restore engine
Phase 11 = archive consolidation
Phase 12 = semantic backup round trip
Phase 13 = compatibility retirement
Phase 14 = sync hardening/two-device
Phase 15 = performance/reliability
Phase 16 = Android production/security/privacy
Phase 17 = product-feature correctness
Phase 18 = UX/accessibility/final interaction polish
Phase 19 = code cleanup only
Phase 20 = RC acceptance only
```

A later phase may **verify** an earlier contract but must not invent a second implementation of it. A UI problem that exposes wrong financial meaning returns to the owning financial contract; a visual-only problem remains Phase 18.

R03/Phase 4-5 implementation is retained, but acceptance is **reopened only where the new U-1/U-2 evidence identifies a contradiction**. No destructive rollback and no duplicate implementation stream. If U-2 changes a storage/model contract, Phase 5 Shadow Migration is re-run as parity validation before Phase 6.

---

# 186. Phase Injection Map

## Phase 4 / Financial correctness

أضف gates:

* UPA-01.
* UPA-06.
* UPA-07.
* UPA-10.
* UPA-13.
* UPA-17.
* UPA-18.
* UPA-19.
* UPA-20.
* UPA-24.
* UPA-30.
* UPA-31.

## Phase 5 / Shadow migration readiness

Migration parity يجب أن يشمل:

* category lifecycle semantics.
* hidden modules not altering financial truth.
* refund/reversal if supported before cutover.
* personal/business scope mappings.
* FX three-layer/fee fields if accepted into current release scope.
* no silent wallet remapping.

Phase 5 يبقى:

```text
Migration Ready
```

ولا يتحول إلى Operational Cutover.

## Phase 6 / Write Path

قبل أول production Financial Command:

* final transaction types frozen.
* explicit unsupported cases reject safely.
* no fallback rate = 1.
* no hidden repair.
* no tracker metadata action deletes financial truth accidentally.

## Phase 7 / Read Path

أضف:

* active + archive search scope.
* Arabic normalized search.
* feature toggle does not alter financial totals.
* historical as-of reports.
* current-vs-historical valuation labeling.

## Phase 9 / Account Lifecycle

أضف:

* logout/unlink/re-login/account-switch ledger lifecycle semantics.
* profile degraded-save semantics.
* public username fallback.
* notification account/ledger isolation.
* second-device profile restoration.

## Phase 10 / Backup / Restore

أضف:

* unknown wallet reference = blocking review.
* no automatic default-wallet repair.
* CSV/backup distinction in UX.
* full archive inclusion proof.
* semantic round-trip.
* cross-version restore.

## Phase 14 / Sync Hardening

أضف:

* notification/account switch cleanup.
* two-device mutation convergence.
* personal/business workspace separation.
* no cross-account outbox/cursor.

## Phase 16 / Android Production + Security / Privacy

أضف:

* notification privacy consistency.
* shared-room least-data loading.
* no project/personal leakage.
* support diagnostics contain no balances/history.

## Phase 17 / Product Correctness

أضف:

* recurring frequencies/policy.
* missed occurrence policy.
* expected-income forecast semantics.
* seasonal budgets.
* accepted/rejected budget learning.
* goal target dates.
* split transactions decision.
* merchant/payee decision.
* external file import policy.
* product claim scope.

## Phase 18 / UX & Accessibility

أضف:

* login keyboard avoidance.
* profile → Account/Security direct routing.
* date/year selector polish.
* locale number input.
* Arabic username/display-name UX.
* signup typo protection.
* Settings final Legacy retirement UX.
* Reports final one-selection flow.
* 200% font / TalkBack / touch targets.

## Phase 20 / Release Candidate

لا RC PASS إذا أي من التالي غير محسوم:

```text
BLOCKING user note
BLOCKING persona finding
two-device gate
notification privacy gate
historical truth gate
backup no-silent-repair gate
scope separation gate
```

---

# 187. Regression-Test Rule لكل ملاحظة مستخدم

أي bug أو UX behavior قال المستخدم إنه حصل فعلياً، إذا تم إصلاحه:

```text
Before test fails
→ fix
→ After test passes
→ Device evidence when UI/runtime
```

أمثلة إلزامية:

* Income يظهر مباشرة في History.
* savings/commitment payment amount يظهر.
* automatic sync after reconnect.
* base currency does not mutate.
* default wallet on commitment payment.
* Repeat Transaction.
* Today-first History ordering.
* profile Account/Security route.
* Auth keyboard.
* multi-currency transfer one-screen behavior.
* no 0 target amount before FX input.
* no overlapping merge prompts.
* account switch isolation.

لا نعيد الاعتماد على الذاكرة بعد إصلاحها.

---

# 188. Device Acceptance Backlog — ملاحظات لا يغلقها Static Audit

هذه البنود تبقى مفتوحة حتى APK/device test:

```text
D-01 Onboarding Quick Setup final UX
D-02 Home month summary ordering and visibility
D-03 History fixed controls during long scroll
D-04 Repeat Transaction all six flows
D-05 Commitment default wallet from all entry points
D-06 Reports one-selection UX
D-07 Reports with trackers but zero normal transactions
D-08 Budget V2 visual hierarchy
D-09 Profile → Account/Security route
D-10 Login keyboard avoidance
D-11 Date/year selector final design
D-12 Notification privacy
D-13 Notification coexistence/cancellation
D-14 Archive encrypted export performance
D-15 Multi-currency transaction/history presentation
```

---

# 189. Two-Device Acceptance Backlog

```text
TD-01 Same account, concurrent financial writes
TD-02 Delete vs stale edit
TD-03 Offline A + Online B + reconnect A
TD-04 Account A → Account B switch isolation
TD-05 Profile name/photo restoration
TD-06 Notification namespace after account switch
TD-07 No mixed wallet/outbox/cursor
TD-08 No duplicate financial mutation
```

---

# 190. Product Scope Honesty Gate

قبل أي Store/marketing copy:

كل claim يجب أن يرتبط بـEvidence.

إذا feature غير كاملة:

لا نقول:

```text
complete
all
fully automated
AI decides
business accounting
family finance
bank-grade import
```

إلا إذا الـRelease Gate يثبتها.

MYFI يبقى:

> Local-first financial management system that explains and assists, while the user remains in control.

---

# 191. Updated Immediate Execution Order

الحالة الحالية لا تعني البدء مباشرة بـPhase 6.

الترتيب بعد هذا الملحق:

```text
1. Freeze this addendum.
2. Create User Notes Reconciliation evidence against HEAD 28c7e29...
3. Resolve/contract-freeze Gate U-2 blockers.
4. Run targeted automated tests for the confirmed gaps.
5. Do not perform Operational Cutover.
6. Only after Gate U-1 + U-2 are closed:
   Phase 6 SQLite-first Write Path.
7. Phase 7 Read Path.
8. Continue frozen master plan order.
```

---

# 192. Final Addendum Rule

لا تُعتبر أي ملاحظة مستخدم "قديمة" أو "صغيرة" إذا كانت تمس:

* المال.
* التاريخ.
* العملة.
* الحساب.
* الاستعادة.
* المزامنة.
* الخصوصية.
* فقدان البيانات.
* navigation الأساسي.
* إمكانية تنفيذ إجراء يومي.

وتحديداً:

> إذا المستخدم سبق أن قال إن شيئاً لم يعمل، لا نغلقه بالذاكرة أو قراءة الكود فقط عندما يكون سلوكه Device-dependent.

هذا الملحق يصبح جزءاً من MYFI Frozen Master Plan من تاريخ 2026-08-15.

---

# 193. Plan Architecture Audit Addendum — Logout / Session ≠ Ledger Lifecycle

## Finding UPA-45 — Logout must not change local financial ownership semantics

Current reviewed behavior at HEAD `28c7e29e7c1623f83ccb4359bba613f8f2f5cd25`:

```text
Sign out local cloud session
→ setUser(null)
→ workspace namespace resolves from user:<id> to guest
→ UI loads guest namespace
```

The outgoing account namespace is saved before switching when needed; the reviewed logout path does not explicitly clear that account namespace. Therefore this is not proven physical deletion. However, from the user's perspective the active ledger disappears after logout because the app changes financial namespace. This conflicts with MYFI local-first identity if logout is presented as only disconnecting the cloud account.

### Contract

```text
Cloud session lifecycle != Local ledger lifecycle
Logout != Delete Local Data
Logout != Switch to unrelated empty ledger silently
```

The ledger/account relationship must remain explicit through `ledger_id ↔ optional cloud account link`; cloud authentication must not itself define whether the local financial ledger exists or is visible.

### Risk

If the user continues entering data after logout in the guest namespace and later signs back in, the current model can create a new Guest → Account transfer/merge situation. That can produce avoidable duplicate/merge/conflict UX even though the user intended only to disconnect cloud sync.

### Phase ownership — no overlap

* **Before Phase 6:** freeze the ownership/session contract and data model. This is `BLOCKING` because SQLite-first writes must not bake cloud session identity into ledger authority.
* **Phase 9 — Account Lifecycle:** implement/finalize logout, re-login, account switch, optional unlink behavior, and explicit Delete Local Data behavior.
* **Phase 9 device gate:** verify logout does not delete or silently hide the intended current local ledger; verify re-login and account switch without duplication/leakage.
* **Phase 20 RC:** no pass without evidence that Logout and Delete Local Data are distinct operations.

### Required regression evidence

```text
A. signed-in ledger with financial history
B. sign out on this device
C. local financial data remains preserved according to the chosen lifecycle contract
D. offline use after logout has unambiguous ledger identity
E. re-login does not duplicate/merge the same ledger as foreign Guest data
F. Delete Local Data remains a separate explicit destructive action
```

**Status:** `BLOCKING` contract before Phase 6; runtime acceptance target Phase 9.

---

# 194. Latest Screenshot UX Findings — Phase Ownership Rule

The latest device screenshots do not create a parallel implementation stream. They are injected into the existing phases as follows:

* **Financial meaning / multi-currency labels:** Phase 4 contract correctness + Phase 7 read presentation.
* **History amount/currency clarity:** Phase 7 read path; final visual polish Phase 18.
* **Home summary currency basis clarity:** Phase 7 queries/presentation; final hierarchy Phase 18.
* **Tracker card visual consistency:** Phase 18 unless a displayed amount is financially wrong, in which case it returns to the owning financial phase.
* **Keyboard / bottom-sheet avoidance:** Phase 18, except when it blocks completion of a required financial action.
* **Icon–Action Semantic Consistency Audit:** Phase 18 global UX gate.

Icon contract examples:

```text
Back/Undo = back/undo icon
Keep/Confirm = check/confirm icon
Cancel/Close = X/close icon
Delete = trash icon
Edit = pencil/edit icon
Transfer = transfer arrows
```

The merge-result dialog screenshot is a confirmed regression example: a trash icon beside Back and an X beside Keep Changes violate this contract.

### Non-intersection rule

A screenshot finding is assigned to exactly one **primary owning phase**. Other phases may carry regression tests or final acceptance only; they must not independently reimplement the same behavior.

---

# 195. Consolidated Release Cadence Amendment — 2026-08-15

User-approved delivery cadence:

```text
Large release packages only where engineering dependencies permit.
Each release may contain 3–4 adjacent phases.
Internal numbered patches remain separate for rollback/evidence.
One automated workstation gate per release.
One real-device acceptance session at the end of the release.
```

This changes delivery cadence only. It does not relax any phase gate, financial invariant, rollback rule, or evidence requirement.

## R04 ownership

R04 is the first consolidated operational package after R03 migration readiness:

```text
Gate U-1 / U-2 contract freeze
Phase 6 — SQLite-first Write Path
Phase 7 — SQLite-first Read Path
Phase 8 — Operational Canonical Cutover
Phase 9 — Account Lifecycle
```

Phase 8 is permitted only inside R04 after the Phase 5 readiness proof is rerun against the exact installed state and all Phase 8 parity/health checks pass. R03 itself remains correctly classified as `Migration Ready` only.

## R04 pre-cutover contract decisions

The following U-2 items are frozen before operational promotion:

* Personal/Business/Mixed financial scope must be explicit; Mixed honors `activeScope` rather than always returning ALL.
* Base currency must be explicitly confirmed before first financial history; country only suggests a currency and never owns it.
* Budgets are currency-sensitive financial meaning and therefore lock base-currency reinterpretation.
* Foreign transaction historical FX cannot silently fall back to current wallet valuation.
* Foreign wallet reconciliation requires explicit historical FX.
* Current wallet valuation has a capture timestamp; it is never used to rewrite historical transaction FX.
* Tracker/category/wallet metadata lifecycle must not rewrite or delete posted financial truth.
* Broken tracker links block for explicit review; name/candidate heuristics cannot silently relink financial payments.
* Feature visibility may hide UI modules but cannot hide transactions from financial totals/reports.
* Backup references to unknown wallets are blocking validation errors, not automatic default-wallet repairs.
* Three-layer merchant/settlement/reporting currency, third-currency fees, loan interest/principal schedules, and refund/reversal UX are explicitly unsupported in the current user-facing scope until their owning Product Correctness phase; the V7 entity/transaction model must not falsely classify or auto-invent these semantics.
* Historical planning state is not claimed as an as-of snapshot until an explicit historical-state model exists; period cash-flow totals remain historical, while current tracker state must be labeled/presented as current where shown.

## R04 account/session contract

```text
Logout = end cloud session only.
Logout != Delete Local Ledger.
Logout != silent switch to unrelated Guest ledger.
Delete Account != Delete Local Financial Data.
Delete Local Data remains an independent destructive action.
```

The active local ledger pointer persists independently from the Supabase auth session. Explicit account deletion may unlink/clone according to the dedicated lifecycle flow; ordinary logout preserves the active ledger.

## R04 read/cutover contract

After successful Phase 8 promotion:

* V7 SQLite is the canonical financial source.
* legacy relational mirror is frozen; no new authoritative writes go there.
* Zustand transaction history is a bounded compatibility/UI cache, not the full ledger.
* History uses V7 SQL paging/search/filter.
* Home uses V7 SQL summary/recent/wallet-position queries.
* Reports use V7 SQL aggregate/category queries for financial totals.
* health checks after cutover use V7 invariant proof, not legacy mirror row-count parity.
* pending outbox is preserved during stage promotion unless an explicit reviewed protocol says otherwise.
