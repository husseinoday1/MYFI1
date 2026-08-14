# MYFI Financial Model 2.0

> حالة القرار: معتمد للتنفيذ ابتداءً من 2026-08-14. الأقسام الخاصة بـMoney وTransaction/Postings وSQLite Cutover أدناه هي المرجع الملزم. واجهة المستخدم تبقى بسيطة؛ هذا النموذج Internal Engine وليس واجهة محاسبية.

## 1. الغرض

هذه الوثيقة هي المرجع المالي والمعماري للميزات القادمة في MYFI. أي تعديل جديد يجب أن يرتبط بهدف، ونموذج بيانات، وقاعدة مالية، واختبارات، ثم واجهة.

تعريف المنتج في هذه المرحلة:

> نظام مالي شخصي محلي أولاً يوضح للمستخدم كم يملك، كم هو متاح، ما عليه خلال الشهر، وما أثر قراراته المستقبلية.

الغرف والذكاء الاصطناعي والميزات التجارية توسعات فوق هذا الأساس، وليست بديلاً عنه.

## 2. أهداف المنتج

### 2.1 الحقيقة المالية

معرفة الأموال الفعلية، والمتاحة، والمحجوزة، ومكانها، ومصدر كل رقم.

### 2.2 وضوح الشهر

معرفة الدخل والمصروفات والالتزامات والديون وأهداف التوفير وما تم دفعه أو تأجيله.

### 2.3 الإدخال السريع الصحيح

دعم الدخل والمصروف والتحويل والدفع المرتبط والتوفير والتكرار الشهري، مع جعل الإدخال الذكي Draft يحتاج مراجعة قبل التسجيل.

### 2.4 النظام المالي المترابط

عند تسجيل دفعة مرتبطة، تتحدث الحركة والرصيد والدين أو الهدف أو الالتزام معاً، ولا تتكرر في التقارير.

### 2.5 حماية البيانات والمزامنة

يعمل التطبيق Offline، وتندمج تعديلات الأجهزة دون فقدان أو تكرار أو استبدال تغييرات صحيحة بنسخة أقدم.

### 2.6 الفهم والتوقع

تقدم التقارير والتوقعات إجابات تاريخية ومستقبلية مبنية على Financial Engine حتمي.

### 2.7 المساعد المالي

يأتي AI أخيراً. يفسر سؤال المستخدم ويشرح نتيجة المحرك، لكنه لا يحسب الأرصدة ولا يصبح مصدر الحقيقة.

## 3. القواعد غير القابلة للتفاوض

1. كل رقم مالي مهم يصدر من Financial Engine واحد.
2. لا تحسب الشاشة الرصيد بنفسها.
3. لا ينشئ الإدخال الذكي حركة نهائية دون مراجعة.
4. لا تنشئ الحركة المتكررة نسخاً تلقائية صامتة.
5. التحويل بين الحسابات ليس دخلاً أو مصروفاً.
6. تخصيص مبلغ لهدف يحجز المال ولا يخرجه من المحفظة.
7. `Available = Physical - Reserved` في كل الشاشات.
8. الالتزام يقاس بدورة شهرية، لكن يمكن تأجيل تنفيذه إلى تاريخ يومي.
9. الدفع المرتبط لا يكرر أثره في التقارير.
10. الحذف المالي يترك أثراً قابلاً للتدقيق عند الحاجة.
11. البيانات الشخصية خاصة افتراضياً.
12. المشاركة لا تمنح إلا الصلاحية المحددة صراحة.
13. كل مبلغ مخزّن هو Integer Minor Units؛ يمنع تخزين المال في `REAL` أو Float.
14. `Transaction` رأس للعملية ولا يحمل مبلغاً مالياً وحيداً؛ الأثر المالي موجود فقط في `Posting`.
15. العملية المالية وآثارها وروابطها وOutbox تُكتب داخل SQLite transaction واحدة.
16. لا يُعلن SQLite كمصدر حقيقة قبل نجاح Shadow Migration ومقارنات Parity كاملة.

## 4. الكيانات الأساسية

### 4.1 المستخدم ومساحة العمل

```text
User
- id
- email
- displayName
- username

Workspace
- id
- ownerUserId
- type: personal | business | shared
- baseCurrency
- settings
```

البريد يعرّف المستخدم ويسمح بالمزامنة والاسترداد. `displayName` يستخدم لمخاطبة المستخدم داخل التطبيق. `username` معرف عام وفريد لتسهيل البحث والدعوات في الغرف.

قواعد `username`:

- فريد عالميًا.
- لا يستخدم كصلاحية وصول.
- لا يكشف بيانات المستخدم المالية.
- يستخدم بصيغة مثل `@username`.
- يدعم الدعوة إلى الغرف بجانب البريد.
- يجب منع الكلمات المحجوزة مثل `admin`, `support`, `myfi`.

امتلاك بريد أو username لمستخدم لا يمنح صلاحية على بياناته. الصلاحية تأتي فقط من عضوية غرفة أو مشاركة صريحة.

### 4.2 الحساب المالي

واجهة المستخدم يمكن أن تسميه محفظة، لكن النموذج الداخلي هو `FinancialAccount`:

```text
FinancialAccount
- id
- workspaceId
- name
- type: cash | bank | debit_card | credit_card | e_wallet | savings
- currencyCode
- status
- scope
- createdAt / updatedAt / archivedAt
```

الرصيد الافتتاحي لا يبقى رقماً خاصاً داخل الحساب؛ يُرحّل إلى `opening_balance` Transaction مع Posting حتى يصبح كل رصيد قابلاً للتفسير والتدقيق.

### 4.3 دفتر الحركات

```text
Currency
- code
- minorUnitExponent
- enabled

ExchangeRate
- id
- baseCurrencyCode
- quoteCurrencyCode
- numerator
- denominator
- rateDate
- source
- capturedAt

FinancialTransaction
- id
- workspaceId
- kind
- status: posted | voided
- dateISO
- occurredAt
- categoryId
- title
- note
- sourceType
- sourceId
- idempotencyKey
- deviceId
- revision
- createdAt
- updatedAt
- deletedAt

Posting
- id
- transactionId
- accountId
- bucket: physical | reserved
- role: principal | source | destination | fee | allocation | release | opening
- amountMinor
- currencyCode
- exchangeRateId
- createdAt
```

هذا Multi-leg Ledger وليس نظام محاسبة يظهر للمستخدم. لا نفرض على المستخدم قيوداً أو حسابات مقابلة. الأنواع الأساسية هي: `opening_balance`, `income`, `expense`, `transfer`, `debt_payment`, `debt_collection`, `goal_allocation`, `goal_release`, `commitment_payment`.

مثال واجهة المستخدم:

```text
تحويل 100 دولار إلى 131,000 دينار
```

والتمثيل الداخلي:

```text
FinancialTransaction(kind=transfer)
├─ Posting(source,      physical, -10000 USD minor, Wallet USD)
├─ Posting(destination, physical, +131000 IQD minor, Wallet IQD)
└─ Posting(fee,         physical, -100 USD minor, Wallet USD)  # عند وجود رسم 1 USD
```

قواعد المبالغ والعملات:

- أمثلة Minor Units: `IQD exponent=0`, `USD exponent=2`, `KWD exponent=3`.
- `amountMinor` و`numerator` و`denominator` أعداد صحيحة فقط، وتبقى ضمن حدود SQLite signed 64-bit وJavaScript safe integer عند عبور طبقة التطبيق.
- لا يُعاد حساب مبلغ جهة التحويل من Float. مبلغا المصدر والوجهة اللذان وافق عليهما المستخدم هما الحقيقة.
- سعر التحويل Metadata تاريخي قابل للتدقيق، ويرتبط بـ`rateDate` و`source` مثل `user_entered`, `manual`, `provider:<name>`, أو `migration`.
- التحويل بين Minor Units يتم بنسبة كسرية وبقاعدة rounding واحدة: nearest minor unit, halves away from zero.
- كل Posting يحمل نفس عملة الحساب المرتبط به، وإلا تُرفض العملية قبل الكتابة.
- لا يدخل `transfer` في الدخل أو المصروف. الرسم فقط يدخل كمصروف عند إعداد التقارير.

صيغة التحويل الحتمية عند الحاجة إلى اشتقاق مبلغ:

```text
targetMinor = round(
  sourceMinor × numerator × 10^targetExponent
  ÷ (denominator × 10^sourceExponent)
)
```

يحفظ `numerator/denominator` نسبة العملات بوحداتها الرئيسية. في التحويل الذي أدخل المستخدم طرفيه، تُشتق النسبة من الطرفين للحفظ والتفسير فقط ولا تستبدل أي Posting.

قواعد الرصيد:

```text
Physical Balance = SUM(postings.amountMinor WHERE bucket = physical)
Reserved Balance = SUM(postings.amountMinor WHERE bucket = reserved)
Available Balance = Physical Balance - Reserved Balance
```

تخصيص الهدف يضيف Posting موجباً إلى `reserved` ولا يغيّر `physical`. تحرير الهدف يضيف Posting سالباً إلى `reserved`. الدفعات المرتبطة بالدين أو الالتزام تملك أثراً مالياً واحداً فقط، وتُربط بالكيان بدلاً من إنشاء أثر مكرر.

الـTransaction المنشورة لا تُمحى بصمت. الحذف المنطقي يضع `deletedAt`/tombstone ويخرج Postings من الرصيد الفعال، مع Outbox mutation قابلة للمزامنة والتدقيق.

### 4.4 الحركات المتكررة

يجب فصل القالب عن النسخة الشهرية:

```text
RecurringTemplate
- id
- workspaceId
- title
- type: income | expense
- amountMinor
- currencyCode
- categoryId
- accountId
- recurrence: monthly
- dayOfMonth
- active

RecurringOccurrence
- id
- templateId
- cycleMonth
- dueISO
- status: pending | confirmed | skipped
- transactionId
```

الحالة الافتراضية `pending`. يراجع المستخدم المبلغ والتاريخ والحساب قبل إنشاء Transaction.

### 4.5 الالتزامات الشهرية

الالتزام يحتاج قالباً ونسخة لكل دورة شهرية:

```text
CommitmentTemplate
- id
- workspaceId
- name
- amountMinor
- currencyCode
- categoryId
- accountId
- recurrence: monthly
- startMonth
- active
- linkedType: none | debt | receivable | goal
- linkedId

CommitmentOccurrence
- id
- templateId
- cycleMonth
- nominalDueISO
- deferredUntilISO
- status: pending | deferred | paid | skipped | cancelled
- paymentTransactionId
```

المعنى:

- `cycleMonth` هو الشهر الذي ينتمي إليه الالتزام.
- `nominalDueISO` تاريخ اسمي داخل الشهر عند الحاجة.
- `deferredUntilISO` تأجيل يومي بسبب عدم توفر المبلغ أو ظرف طارئ.
- التأجيل لا يغير دورة الشهر إلا إذا اختار المستخدم «الشهر القادم».
- الدفع في سبتمبر لالتزام أغسطس المؤجل يبقى مرتبطاً بدورة أغسطس، ولا يلغي التزام سبتمبر.

هذا الفصل هو الحل النهائي لمشكلة الاعتماد على `lastPaidMonth` وحده.

### 4.6 الديون والأهداف

```text
Debt
- id
- workspaceId
- direction: owed | receivable
- currencyCode
- principalMinor
- status

DebtPayment
- id
- debtId
- transactionId
- appliedAmountMinor

Goal
- id
- workspaceId
- name
- currencyCode
- targetAmountMinor
- targetDate
- status

GoalAllocation
- id
- goalId
- accountId
- transactionId
- amountMinor
- releasedAt
```

`paidAmount`, `remainingAmount` و`savedAmount` قيم مشتقة من الروابط وPostings الفعالة، وليست مصادر حقيقة مستقلة قابلة للتباعد.

الدين ليس التزاماً، والالتزام قد يكون خطة دفع للدين. الحركة هي الأثر المالي الفعلي.

### 4.7 دورة حياة الدين والهدف

القياس يكون على مستوى الدين أو الهدف بالكامل، وليس على مستوى عدد الأيام:

```text
Debt: active -> settled -> archived
Goal: active -> settled -> released | archived
```

- يصبح الدين `settled` عند وصول مجموع الدفعات إلى المبلغ الكلي.
- يصبح الهدف `settled` عند وصول مجموع التوفيرات إلى المبلغ المستهدف.
- لا يحذف الإكمال الحركة أو الدفعات أو التوفيرات؛ تبقى في السجل مع رسالة واضحة: `انتهى الدين` أو `اكتمل الهدف`.
- يظهر الإكمال أيضاً في التنبيهات الحديثة، مع إبقاء السجل قابلاً للمراجعة والتدقيق.
- عند إكمال دين أو هدف مرتبط بالتزام متكرر، يتوقف الالتزام المرتبط تلقائياً مع حفظ سبب الإيقاف.
- إذا عُدّلت أو حُذفت الدفعة أو التوفيرة الأخيرة وأصبح العنصر غير مكتمل، يعود إلى `active` ويُسجل وقت إعادة الفتح. لا تعاد الالتزامات المتوقفة يدوياً؛ يعاد فقط ما توقف بسبب الإكمال.
- `released` قرار مستقل لتحرير أموال الهدف بعد اكتماله، ولا يعني حذف الهدف أو فقدان تاريخه.

بهذا يكون الدين والهدف كياناً مستمراً: يبدأ بمتابعة شهرية أو مالية، ينتهي بحالة موضحة، ثم ينتقل لاحقاً إلى الأرشيف دون كسر التقارير أو تاريخ الحركات.

## 5. Financial Engine

كل الشاشات والتقارير تستخدم نفس المصدر:

```js
getAccountBalance(accountId, asOf)
getPhysicalBalance(accountId, asOf)
getReservedBalance(accountId, asOf)
getAvailableBalance(accountId, asOf)
getNetWorth(asOf)
getCashFlow(period)
getMonthlyObligations(cycleMonth)
getDebtExposure(asOf)
getUpcomingOccurrences(cycleMonth)
getForecast(period)
```

يجب أن تدعم الدوال `asOf` حتى لا يظهر رصيد اليوم عند استعراض شهر تاريخي. القراءة النهائية تكون من SQLite/Postings عبر Repository واحد؛ Zustand يحمل View State ونتائج Queries فقط ولا يصبح نسخة مالية موازية.

الدفع المرتبط يجب أن يكون ذرياً:

```text
طلب UI مع idempotencyKey
↓
BEGIN IMMEDIATE
↓
التحقق من العملة والحساب والروابط والمبلغ
↓
إنشاء FinancialTransaction + Postings
↓
إنشاء/تحديث الرابط Debt أو Goal أو CommitmentOccurrence
↓
إضافة Outbox mutation داخل المعاملة نفسها
↓
COMMIT
↓
إعادة DTO محسوب إلى View State ثم UI
```

إذا فشل أي جزء يحدث `ROLLBACK` ولا تظهر الحركة في الواجهة ولا يوجد Outbox يتيم. لا يوجد مسار `Vault-first` في العمليات التي تم تحويلها إلى Vertical Slice.

## 6. الغرف والمشاركة الانتقائية

### 6.1 الهدف

الغرفة مساحة تعاون لمستخدمين يملكون حسابات بريدية، مثل رحلة أو ميزانية منزل أو مشروع صغير أو مصروفات مشتركة، مع بقاء الحساب المالي الشخصي لكل مستخدم خاصاً.

### 6.2 قاعدة الخصوصية

> لا يرى عضو الغرفة أي بيانات مالية شخصية إلا ما اختار مالكها مشاركته صراحة.

لا يحصل العضو تلقائياً على المحافظ أو الراتب أو الديون أو الأهداف أو الحركات أو الملاحظات الخاصة.

### 6.3 نموذج الغرفة

```text
Room
- id
- ownerUserId
- name
- type: trip | family | project | shared_expense
- currency
- status: active | archived

RoomMember
- roomId
- userId
- role: owner | editor | contributor | viewer
- status: invited | active | revoked
- invitedEmail
- invitedUsername

RoomShare
- id
- roomId
- ownerUserId
- sourceType: transaction | category | budget | commitment | goal | account_summary
- sourceId
- visibility: summary | details | manage
- revokedAt
```

### 6.4 كيف تتم المشاركة

1. ينشئ المستخدم غرفة.
2. يدعو مستخدماً آخر عبر البريد أو `@username`.
3. يقبل المدعو الدعوة بحسابه.
4. يحدد مالك البيانات ما الذي يشاركه، وبأي مستوى رؤية.
5. يمكن إلغاء المشاركة أو إلغاء العضوية في أي وقت.

البريد واليوزر نيم يستخدمان للهوية والدعوة فقط، وليس للوصول إلى الحساب الشخصي خارج الغرفة.

### 6.5 مستويات الرؤية

```text
summary
```

يعرض الإجمالي أو الحصة فقط.

```text
details
```

يعرض المبلغ والتاريخ والتصنيف والعنوان المختصر.

```text
manage
```

يسمح بالتعديل أو الإضافة ضمن صلاحيات الغرفة، ولا يفتح الحساب الشخصي الكامل.

مثال:

```text
الفندق في رحلة: details
حصة المستخدم من الفندق: details
ميزانية الرحلة: summary
راتب المستخدم: private
محفظة المستخدم بالكامل: private
```

### 6.6 RoomProjection

الغرفة لا تقرأ جداول الحساب الشخصي مباشرة. ينشئ النظام إسقاطاً آمناً يحتوي فقط على الحقول المسموح بها:

```text
RoomProjection
- roomId
- shareId
- publicRecordId
- safePayload
- sourceRevision
- updatedAt
- revokedAt
```

قواعد مهمة:

- مشاركة عنصر لا تعني مشاركة العناصر المرتبطة به تلقائياً.
- مشاركة ميزانية لا تكشف الحسابات التي تم تمويلها منها.
- تخفى المعرفات الداخلية والملاحظات الخاصة.
- إلغاء المشاركة يمنع القراءة الجديدة.
- كل تعديل حساس قابل للتدقيق.
- المصروف المشترك لا يصبح مصروفاً شخصياً لكل الأعضاء تلقائياً.
- التسوية بين الأعضاء تسجل كالتزام أو حركة واضحة.

## 7. المزامنة والأمان

```text
UI
↓
View State
↓
Financial Engine
↓
SQLite Source of Truth
↓
Outbox / Sync Engine
↓
Supabase with RLS
```

كل سجل مهم يحتاج `id`, `createdAt`, `updatedAt`, `deletedAt`, `revision`, و`deviceId`.

```text
OutboxMutation
- sequenceId
- mutationId (globally unique)
- workspaceId
- entityType
- entityId
- operation: upsert | delete | void
- entityRevision
- payloadVersion
- payload
- createdAt
- attempts
- nextAttemptAt
- acknowledgedAt
- lastError
```

`mutationId` و`idempotencyKey` يمنعان تكرار العملية بعد timeout أو إعادة تشغيل التطبيق. لا يُحذف Outbox row قبل acknowledgement واضح، وأي mutation ولدت مع Transaction تُحفظ في نفس SQLite commit.

الحساب الشخصي والغرفة لهما سياسات وصول منفصلة:

- المستخدم يقرأ بياناته الشخصية فقط.
- عضو الغرفة يقرأ `RoomProjection` المسموح له فقط.
- العميل لا يكتب سجل التدقيق مباشرة.
- دمج الأجهزة يعتمد على التعديلات لا Snapshot كامل.

Snapshot Sync الحالي يبقى Compatibility/Fallback أثناء التطوير، ولا يُلغى حتى ينجح Outbox Sync على جهازين فعليين في حالات Online وOffline والتعارض وإعادة المحاولة. بعد Cutover لا يجوز للـSnapshot fallback أن يمسح SQLite أو يعيد بناءها تلقائياً؛ الاسترجاع منه عملية Recovery صريحة ومتحققة فقط.

## 8. خارطة التنفيذ

### المرحلة 0: Baseline وTest Gate

Snapshot قابل للتحقق، جرد الاختبارات، وتصنيف النتائج إلى Parse وStatic وRuntime وNative وCloud وDevice، مع إظهار `SKIPPED` وعدم تسميته نجاحاً.

### المرحلة 1: Final Financial Model

Minor Units، Transaction/Postings، العملات، Historical Exchange Rate، `rateDate/source`، قواعد الروابط، وOutbox atomicity.

### المرحلة 2: SQLite Vertical Slices

Expense أولاً عبر `SQLite → linked effects → outbox → commit → UI`، ثم Income، Transfer، Debt، Saving، Commitment. لا تُحوّل عملية جديدة إلى Vault-first.

### المرحلة 3: Shadow Migration ثم Cutover

استيراد Vault والـCold Archive القديم إلى النموذج الموحد، ثم مقارنة العدد والأرصدة حسب المحفظة والعملة والإجماليات الشهرية والروابط والـchecksums. أي اختلاف يمنع Cutover. بعد النجاح فقط تتوقف إعادة بناء SQLite من Vault عند التشغيل.

### المرحلة 4: Read Paths

History ثم Home ثم Reports ثم Intelligence ثم Export تقرأ من Financial Engine/SQLite، مع Parity tests لكل انتقال.

### المرحلة 5: Sync Outbox

مزامنة mutation-level، retries وidempotency وtombstones واختبار جهازين. Snapshot Sync يبقى fallback مؤقتاً حتى نجاح الاختبار الفعلي.

### المرحلة 6: Archive وBackup وAccount Lifecycle

ترحيل Cold Archive القديم والتحقق منه قبل اعتباره Legacy. Backup منطقي Versioned ومشفّر، Account deletion/logout/reset بدون فقدان بيانات محلية.

### المرحلة 7: الميزات المالية وUX

Budget V2، Recurring/Occurrences، Data Health، ثم تحسينات UX وRTL بعد استقرار المحرك.

### المرحلة 8: Rooms وAI والتجاري

الغرف والمشاركة والذكاء المالي توسعات فوق مصدر الحقيقة المستقر ولا تسبق Cutover.

### المرحلة 9: الإصدار الرسمي على Android

إغلاق بوابات المنتج وAndroid والتوقيع والخصوصية والاختبار وصفحة المتجر والتشغيل كما هو موضح في [معايير الإصدار الرسمي](./ANDROID_RELEASE_READINESS_AR.md). لا يُعد رفع APK تجريبي إصداراً رسمياً؛ الإصدار الرسمي يحتاج `AAB` إنتاجي، Play App Signing، مراجعة Google Play، اختباراً مناسباً لنوع حساب المطور، وإطلاقاً تدريجياً مع مراقبة.

## 9. Shadow Migration وSource of Truth Cutover

الانتقال لا يكتب فوق بيانات Vault ولا يحذف Cold Archive. كل تشغيل Migration يملك `migrationRunId`, `sourceSnapshotChecksum`, `targetSchemaVersion`, الحالة، ونتيجة المقارنة.

```text
Vault active snapshot ─┐
Cold Archive years ────┼─> Normalizer ─> SQLite shadow namespace ─> Reconciliation
Legacy metadata ───────┘                                         │
                                                                  ├─ mismatch: BLOCK
                                                                  └─ exact parity: eligible
```

المقارنات الملزمة:

- عدد العمليات المنطقية، مع عدم مساواة Transaction count بعدد Postings.
- Physical وReserved وAvailable لكل محفظة ولكل عملة.
- الدخل والمصروف والرسوم وصافي التدفق لكل شهر ولكل عملة.
- عدد وروابط Debt/Goal/Commitment ودفعاتها وتخصيصاتها.
- أقدم وأحدث تاريخ، وعدد السجلات المحذوفة والمؤرشفة.
- Canonical checksums مرتبة بمفاتيح ثابتة وليست JSON بترتيب عشوائي.

Cutover marker لا يُكتب إلا بعد نجاح جميع المقارنات وتخزين تقرير النتيجة. فشل أو انقطاع Migration قابل لإعادة التشغيل idempotently ولا يغير مصدر الحقيقة الحالي.

بعد Cutover:

- SQLite هي المصدر الوحيد للكتابة والقراءة المالية.
- Zustand لا يُستخدم لإعادة بناء SQLite عند التشغيل.
- Vault يصبح Compatibility export/fallback مؤقتاً، لا مصدر كتابة أول.
- rollback يغيّر مؤشر المصدر فقط إذا كانت النسخة المقصودة كاملة ومتحققة؛ لا يخلط كتابات المصدرين.

### Cold Archive القديم

يُقرأ كل عام قديم ويُحوّل إلى نفس `FinancialTransaction/Postings` مع `archivedAt`, سنة المصدر، وchecksum الحزمة القديمة. يبقى الأرشيف القديم دون حذف حتى نجاح counts، balances، monthly totals، links وchecksums، ثم يوصف `Legacy Read-only`. الإزالة اللاحقة قرار مستقل بعد نسخة Backup واختبار Restore.

## 10. Backup وRestore

الصيغة الأساسية Logical Versioned Format وليست نسخة ملف SQLite فقط:

```text
manifest
├─ format: MYFI_LOGICAL_BACKUP
├─ formatVersion
├─ schemaVersion
├─ exportedAt / appVersion
├─ baseCurrency
├─ sections + recordCounts
└─ checksums

financialData
├─ accounts
├─ transactions
├─ postings
├─ links / debts / goals / commitments / occurrences
├─ currencies / exchangeRates
├─ budgets
└─ archiveMetadata
```

تُبنى الـchecksums على Canonical serialization، ثم تُضغط الحزمة وتُشفّر. Restore يعمل إلى Staging namespace، يتحقق من schema والترابط والعدّ والchecksums، ثم يبدّلها ذرياً. Outbox pending لا يُعاد تشغيله من Backup بشكل أعمى حتى لا تتكرر مزامنة قديمة؛ يُنشأ Sync bootstrap جديد بعد الاستعادة.

نسخة SQLite الخام مسموحة كطبقة Recovery إضافية مرتبطة بإصدار Schema وتطبيق محدد، لكنها ليست Backup portable الوحيد ولا تستبدل الصيغة المنطقية.

## 11. عقد تنفيذ أي ميزة

```text
Requirement
↓
Goal supported
↓
Data model
↓
Financial rule
↓
Migration
↓
Unit tests
↓
Domain integration
↓
UI
↓
Android / iOS / Arabic / English / Light / Dark verification
↓
Release gate: AAB / Play Console / Privacy / Testing / Monitoring
```

لا تعتبر الميزة مكتملة إذا نجحت الواجهة وفشلت التقارير أو المزامنة أو المشاركة.

## 12. معايير القبول

- لا يوجد مصدران مختلفان لحساب الرصيد.
- لا يخلط تأجيل أغسطس بالتزام سبتمبر.
- تعديل أو حذف الدفع لا يكسر الدين أو الهدف أو الالتزام.
- يظهر الدين المنتهي والهدف المكتمل في السجل والأرشيف برسالة حالة واضحة.
- تعديل أو حذف آخر دفعة أو توفيرة يعيد العنصر إلى المتابعة النشطة دون فقدان تاريخ الإكمال.
- إكمال دين أو هدف يوقف الالتزام المرتبط تلقائياً، مع حفظ سبب الإيقاف.
- المزامنة لا تنتج تكراراً أو فقداناً.
- يمكن تصدير البيانات واستعادتها والتحقق منها.
- يمكن مشاركة عنصر واحد دون كشف الحساب الكامل.
- يستطيع مالك البيانات إلغاء المشاركة فوراً.
- تتطابق الرئيسية والتقارير وPDF في الأرقام.
- تعمل المسارات الأساسية بالعربية والإنجليزية على Android وiPhone.
- لا يوجد مبلغ مالي جديد مخزّن كـ`REAL`.
- كل cross-currency operation تحتفظ بـ`rateDate/source` ومبالغ Postings الأصلية.
- لا يحدث Cutover إذا اختلف أي count أو balance أو monthly total أو link أو checksum.
- Cold Archive القديم وSnapshot Sync لا يُلغيان قبل نجاح بدائلهما والتحقق منها.

## 13. قرارات الغرف المؤجلة

- هل يسمح `editor` بتعديل المصروف المشترك أم الإضافة فقط؟
- هل التسوية بين الأعضاء التزام أم تحويل؟
- هل نسمح بمشاركة مبلغ مخفي جزئياً أم `summary` فقط؟
- هل يستطيع العضو دعوة عضو آخر؟
- هل نحتاج ضيفاً مؤقتاً بلا حساب MYFI؟

الافتراض الآمن حالياً: مالك الغرفة يدعو الأعضاء، ومالك البيانات يحدد ما يشاركه، والعضو لا يستطيع توسيع صلاحياته بنفسه.
