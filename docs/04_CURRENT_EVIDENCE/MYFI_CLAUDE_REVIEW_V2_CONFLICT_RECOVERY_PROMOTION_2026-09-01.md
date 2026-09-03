# MYFI — مراجعة عميقة: مسار إصلاح تعارض مزامنة V2 (checkpoint + promotion)

**الحالة: مراجعة كود فعلي فقط، لا تعديل.** كل سطر أدناه تم تتبعه في المصدر
الحقيقي على الفرع `fix/pui-001-r2-onboarding-reader-recent-transactions`
(نسخة `C:\Users\husse\OneDrive\Документы\MYFI`، غير مودعة بعد)، وكل اختبار
جديد ذُكر أدناه أُعيد تشغيله فعليًا من هذه الجلسة (node مباشرة، ليس فقط
قراءة الكود) وتأكدت نتيجته.

## الحكم العام

الآلية **آمنة ماليًا/ذريًا في المسار الذي بُني من أجله**، وتُظهر انضباطًا
حقيقيًا: إعادة استخدام البنية التحتية الموجودة بدل اختراع آلية موازية،
تحقق مزدوج من السحابة (عند التحضير وعند التأكيد)، تحقق من عدم تغيّر
الحالة المحلية بين التحضير والترقية عبر مقارنة الـgeneration، ومعاملة
SQLite واحدة ذرية للاستبدال مع فحص foreign_key + quick_check قبل الإرجاع.
هذا لم يُؤخذ على الثقة — أعدت تشغيل الاختبارات الأربعة الجديدة بنفسي ونجحت
جميعها:

```
node tests/run-p20-v2-conflict-checkpoint.cjs           → PASSED
node tests/run-p20-v2-conflict-recovery-prepare.cjs      → PASSED
node tests/run-p20-phase12d-bootstrap-recovery-promotion.cjs → PASSED
node tests/p20-v2-conflict-status.test.cjs                → PASSED
```

لكن توجد **نقطة واحدة حقيقية وملموسة** يجب إصلاحها قبل اعتبار هذا جاهزًا
للمستخدم (البند A)، ونقطة تكرر نمطًا سبق رصده في 2026-08-31 ولم يُغلق بعد
(البند B). البند C ملاحظة أقل خطورة، غير مؤكدة، ولا أرى أنها تستحق حجب
هذا العمل.

---

## ما تم التحقق منه ووُجد صحيحًا

### 1. الـcheckpoint كامل ومحمي بذرّية حقيقية
`createFinancialConflictRecoveryCheckpointV1`
([financialLedgerV7Repository.js:5453](../../src/lib/financialLedgerV7Repository.js))
يعيد استخدام نفس غلاف المعاملة الذرية الموجود أصلًا
(`runFinancialRestorePromotionTransactionV8`) بدل بناء آلية جديدة. ينسخ كل
الجداول المالية + الأرشيف البارد + `ledger_workspace_state_v7` من
namespace الحي إلى namespace خاص جديد (`::conflict-recovery-checkpoint::`)،
ثم:
- يقارن عدد الصفوف قبل/بعد لكل جدول (9 جداول) ويرفض عند أي فرق.
- يقرأ الـlive generation قبل وبعد النسخ ويرفض إن تغيّرت أثناء العملية —
  هذا يغلق أي نافذة سباق نظرية بين قراءة المرشح والنسخ الفعلي.
- `PRAGMA foreign_key_check` و`PRAGMA quick_check` قبل تثبيت الإيصال.
- اختبار SQLite حقيقي أثبت أيضًا أن محاولة إنشاء نفس checkpoint مرتين
  تُرفض (`financial_v2_conflict_checkpoint_already_exists`).

### 2. تصنيف "الحالة الضيقة" صارم فعلًا
`staleWorkspaceCommand`/`inspectCandidate` في
[financialV2ConflictRecoveryV1.js](../../src/lib/financialV2ConflictRecoveryV1.js)
يرفض أي شيء خارج whitelist صارم لشكل الـenvelope والـpayload (فقط
`cfg`+`cloudRevision`)، ويفحص recursively عن أي مفتاح مالي معروف
(`trans`, `wallets`, `postings`, …)، ويربط الـrevision/baseRevision
برقم مراجعة workspace السحابي المُتحقق منه فعلًا. الاختبار الحقيقي أثبت
أن وجود حركة مالية معلقة واحدة في outbox يرفض التحضير **قبل** إنشاء أي
checkpoint (`checkpointCalls === 0`) — الترتيب صحيح: لا نكتب شيئًا محليًا
قبل التأكد أن الحالة آمنة.

### 3. فصل التحضير عن التأكيد مع إعادة تحقق سحابي فعلي
`confirmPreparedCloudConflictRecoveryV1` يعيد تنزيل وإثبات السحابة من
جديد ويقارنها بما وثّقه intent التحضير (`sameVerifiedCloud`) — أي تغيّر
ولو بحقل واحد يرفض العملية **قبل** استدعاء الترقية إطلاقًا. الاختبار أثبت
هذا حرفيًا: `promotionCalls === 0` بعد تغيير السحابة بين التحضير والتأكيد.

### 4. حذف V1/V3 بعد checkpoint — آمن ومبرر
داخل `promotePreparedCloudConflictRecoveryV1`
([financialBootstrapRecoveryPromotionV2.js:349](../../src/lib/financialBootstrapRecoveryPromotionV2.js)):
الحذف الفعلي لا يحدث إلا بعد نجاح **كلا** التحققين الجديدين معًا داخل نفس
المعاملة:
- `assertConflictCheckpoint` — يقارن إيصال الـcheckpoint، الـgeneration
  الحالية، وعدد الصفوف في كل جدول من الـ9 مقابل ما وثّقه الإيصال وقت
  الإنشاء.
- `assertOnlyPreparedWorkspaceMutations` — يعيد قراءة outbox_v3 الحالي
  ويقارنه صفًا بصف مع قائمة `staleWorkspaceMutationIds` التي حضّرها
  `prepare`. أي mutation إضافي أو مختلف يرفض العملية بأكملها.

هذا هو نفس نمط "لا تغيير جزئي، إما الكل أو لا شيء" المستخدم في الكود
المُراجَع مسبقًا (`promoteVerifiedBootstrapRecoveryV2`)، وليس آلية موازية.

### 5. `activateFinancialSyncV2()` بعد الترقية — لا يُعيد رفع/تكرار بيانات
هذا كان سؤال Codex الأهم (رقم 4)، وتتبعته حتى النهاية بدل الافتراض:

`promotePreparedCloudConflictRecoveryV1` يُدخل صفًا في
`ledger_bootstrap_state_v8` بنفس `bootstrap_id`/`manifest_hash` اللذين
تحملهما **نفس** نسخة السحابة المُتحقق منها (`hot.bootstrapId`,
`hot.manifestHash` — أتت أصلًا من `stageVerifiedBootstrapWithArchiveV2`
التي قرأت هذه القيم من السحابة نفسها). لاحقًا، عندما يستدعي
`confirmV2ConflictRecovery` الدالة الموجودة أصلًا `activateFinancialSyncV2()`
→ `runControlledFinancialV2Activation` → `bootstrapFinancialLedgerV2`
([financialBootstrapV2.js:314](../../src/lib/financialBootstrapV2.js)):
هذه الدالة تتحقق أولًا `cloud.bootstrappedAt && previousState.status==='finalized'`
مع تطابق bootstrap_id/manifest_hash — وهذا يتحقق هنا بالضبط بسبب الصف
الذي كتبته الترقية للتو — فتأخذ المسار **idempotent** الذي يكتفي بقراءة
تحقق (`verifyFinancialBootstrapReadbackV2`) **ولا** يبني bootstrap stage
جديدًا ولا يرفع أي صف. هذا تصميم متعمد وصحيح، وليس صدفة.

كذلك تحقق: `promotePreparedCloudConflictRecoveryV1` **لا** يعيد ربط
الهوية (`ledger_id`/`restore_epoch`) كما تفعل
`promoteVerifiedBootstrapRecoveryV2` — وهذا صحيح هنا لأن شرط الدخول
يفرض أصلًا أن الهوية المحلية تطابق هوية السحابة (نزاع على نفس الـledger
ونفس الـepoch، وليس تبنّي ledger جديد). فرق مبرر بين الحالتين، ليس نسيانًا.

### 6. لا آلية تنزيل موازية
`stageVerifiedBootstrapWithArchiveV2` هو استخلاص نظيف لمنطق
`recoverVerifiedBootstrapWithArchiveV2` الموجود أصلًا (التنزيل + الإثبات
المزدوج)، ثم أعيد بناء الدالة الأصلية من فوقه. هذا يعالج بالضبط نمط
"إعادة اختراع آلية موجودة" الذي رُصد سابقًا (`normalize()`/
`detectRecurringCandidates`، وglue السحابة يوم 08-31).

---

## البند A — نتيجة حقيقية: "نقطة الرجوع المحلية" التي تَعِد بها الواجهة غير قابلة للاستخدام فعليًا

نص الواجهة في `SettingsScreen.js` (عربي وإنجليزي، في تنبيهي التحضير
والتأكيد) يقول صراحة: **"احتفظ MYFI بنقطة رجوع محلية كاملة"** / *"A local
restore point is kept"*. بحثت في كامل `src/` عن أي دالة تقرأ من
namespace الـcheckpoint (`<namespace>::conflict-recovery-checkpoint::<id>`)
لتُعيدها إلى الـnamespace الحي — **لا توجد أي دالة كهذه في المشروع كله**.

آلية التراجع الوحيدة الموجودة فعلًا هي
[financialRestoreUndoV13.js](../../src/lib/financialRestoreUndoV13.js)،
وهي تتوقع صيغة namespace مختلفة تمامًا
(`${namespace}::restore-checkpoint::${id}`، وليس
`::conflict-recovery-checkpoint::`) ولا تتعرف على هذا الـcheckpoint الجديد
إطلاقًا.

**الخلاصة:** الـcheckpoint نفسه حقيقي، مُتحقق منه، ذرّي، ولا يُحذف بعد
الترقية (الاختبار الجديد يثبت هذا: `ledger_workspace_state_v7` في
namespace الـcheckpoint يبقى صفًا واحدًا بعد الترقية) — لكنه اليوم
**write-only**: لا زر، ولا دالة، ولا مسار كود يستطيع استخدامه لإرجاع
الجهاز لحالته قبل الاستبدال إن ندم المستخدم بعد الضغط على "استبدال النسخة
المحلية". نص الواجهة يَعِد المستخدم بشيء لا يقدر الكود على تنفيذه بعد.

هذا ليس خطأ في الذرّية أو السلامة المالية — البيانات المُستبدَلة صحيحة
ومُتحقق منها. لكنه فجوة وظيفية حقيقية بين الوعد في الواجهة والتنفيذ.

**التوصية:** إما (أ) بناء مسار استرجاع فعلي بسيط يقرأ من
`checkpointNamespace` المُخزّن في الإيصال ويعيده إلى الـnamespace الحي
(نفس نمط `copyFinancialNamespaceFromStageInTransactionV7` لكن بالاتجاه
المعاكس)، أو (ب) إن كان القرار المتعمد هو "بلا زر تراجع تلقائي في v1"،
فعلى الأقل تعديل نص الواجهة ليقول شيئًا صادقًا مثل "نسخة احتياطية محلية
محفوظة للدعم الفني" بدل الإيحاء بإمكانية تراجع ذاتي غير موجود.

---

## البند B — نفس نمط "مسار دفاعي بلا اختبار" المرصود سابقًا يتكرر هنا

مراجعة 2026-08-31 (`MYFI_CLAUDE_REVIEW_PHASE12D_ATOMIC_RECOVERY`) رصدت أن
`assertSafeEmptyShell` و`assertMaterializedStages` لا يملكان أي سيناريو
اختبار يُغذّيهما ببيانات حقيقية تُرفض. نفس النمط تكرر هنا تمامًا مع
الدالتين الجديدتين في هذه الحزمة:

- `assertConflictCheckpoint` — لا يوجد اختبار يتحقق من رفضها عند: عدم
  تطابق عدد الصفوف بين الإيصال والفعلي، أو تغيّر الـgeneration بين
  التحضير والترقية.
- `assertOnlyPreparedWorkspaceMutations` — لا يوجد اختبار يتحقق من رفضها
  عند وجود outbox_v3 إضافي أو مختلف عمّا سجّله intent التحضير.

تحققت من هذا مباشرة: الاختبار الوحيد الذي يستدعي
`promotePreparedCloudConflictRecoveryV1` فعليًا (وليس mock) هو السيناريو
الناجح الوحيد في `run-p20-phase12d-bootstrap-recovery-promotion.cjs`. ملف
`run-p20-v2-conflict-recovery-prepare.cjs` يختبر رفض التحضير بشكل جيد،
لكنه **يُقلّد** (`mock`) دالة الترقية نفسها بدل استدعائها — فهو لا يختبر
هذين التحققين الجديدين إطلاقًا.

كما أن `assertMaterializedStages` — الدالة القديمة نفسها التي كانت غير
مُختبرة في المراجعة السابقة — تُستدعى الآن من مسار ثانٍ (`promotePreparedCloudConflictRecoveryV1`) دون أن يضيف هذا المسار الجديد
أي تغطية لها.

**التوصية:** إضافة 3 حالات اختبار SQLite حقيقية بنفس نمط الاختبار
الناجح الموجود الآن: (1) checkpoint بعدد صفوف مزيّف/ناقص → رفض، (2)
mutation إضافي غير متوقع في outbox_v3 وقت الترقية → رفض، (3) mutation
واحد لكن بقيمة مختلفة (revision مثلاً) عمّا سجّله intent → رفض. هذا رخيص
تقنيًا لأنه نفس نمط الحقن الموجود أصلًا في اختبار damagedFixture.

---

## البند C — ملاحظة غير مؤكدة، أولوية أقل

إن نجحت الترقية المحلية (`promotePreparedCloudConflictRecoveryV1`) لكن
فشل `activateFinancialSyncV2()` بعدها مباشرة داخل `confirmV2ConflictRecovery`
([useSyncSlice.js:1608](../../src/store/slices/useSyncSlice.js))، تُصبح
الحالة `restoreSafety.status = 'financial_v2_conflict_recovery_activation_required'`
و`lastSyncError` يحمل سبب فشل التفعيل (ليس `financial_v2_revision_conflict`
بعد الآن). كلا شرطي إظهار أزرار "إصلاح تعارض المزامنة" /
"استبدال النسخة المحلية المتعارضة" في `SettingsScreen.js` يفشلان عندئذ،
فيختفي الزران معًا من صفحة البيانات رغم أن بيانات الجهاز أصبحت فعلًا
النسخة السحابية الصحيحة وينقص فقط تفعيل V2.

لم أتتبّع هذا حتى نهايته: `financialSyncV2Activation` (حالة التفعيل
العامة، تُكتب أيضًا عند هذا الفشل) لا تُقرأ من **أي** شاشة في `src/`
بحسب البحث — وهذا الفراغ في واجهة إعادة محاولة التفعيل موجود مسبقًا في
كامل نظام تفعيل V2 (يُستدعى تلقائيًا من `dataSlice.js` في مكانين آخرين)،
وليس شيئًا استحدثته هذه الحزمة تحديدًا. الأرجح أن دورة تحميل/مزامنة عادية
لاحقة تُعيد محاولة `activateFinancialSyncV2()` تلقائيًا وتنجح بصمت (لأنها
مصمَّمة لتكون idempotent عبر نفس آلية bootstrap المذكورة في البند 5 أعلاه)
— لكن هذا افتراض غير مُتحقق منه بالتتبع الكامل، أذكره بصراحة كغير محسوم
وليس كخطأ مؤكد.

---

## خلاصة الأجوبة على أسئلة Codex الستة

1. **هل checkpoint يحتفظ بكل ما يلزم للرجوع؟** يحتفظ بكل البيانات
   ومُتحقق ذرّيًا — لكن "الرجوع" نفسه غير مُنفَّذ في أي مكان (انظر البند A).
2. **هل قد يُسمح بتعارض لا يطابق الحالة الضيقة؟** لا، الفحص صارم
   ومُختبر فعليًا برفض حالة مالية معلقة.
3. **هل حذف V1/V3 بعد checkpoint آمن؟** نعم، محمي بتحققين مزدوجين
   داخل نفس المعاملة الذرية — لكن هذين التحققين أنفسهما غير مُختبرين في
   مسار الرفض (انظر البند B).
4. **هل تفعيل V2 عبر activateFinancialSyncV2() صحيح ولا يكرر البيانات؟**
   نعم، مؤكد بالتتبع المباشر إلى الكود الذي يحدد المسار idempotent.
5. **هل عرض الزر في Settings يعتمد على الحالة الصحيحة؟** نعم في المسار
   الطبيعي؛ توجد فجوة عرض محتملة وغير مؤكدة في حالة فشل التفعيل بعد نجاح
   الترقية (البند C).
6. **هل توجد مشكلة دورة import أو maintenance barrier؟** لا شيء رُصد؛
   كل من `prepare`/`confirm` يمرّان عبر `runFinancialMaintenance` الموجود
   أصلًا بنفس نمط بقية عمليات الصيانة المالية.

---

## البرومبت لمحادثة Codex الجديدة

```
المشروع: MYFI — المسار المحلي
C:\Users\husse\OneDrive\Документы\MYFI
الفرع: fix/pui-001-r2-onboarding-reader-recent-transactions
لا يوجد أي commit أو push أو APK جديد لهذه الحزمة حتى الآن. التغييرات
التالية موجودة في working tree فقط (git status --short):
  M  src/lib/financialLedgerV7Repository.js
  M  src/lib/financialBootstrapRecoveryCoordinatorV2.js
  M  src/lib/financialBootstrapRecoveryPromotionV2.js
  ?? src/lib/financialV2ConflictRecoveryV1.js (جديد)
  M  src/store/slices/useSyncSlice.js
  M  src/screens/SettingsScreen.js
  + اختبارات: tests/financial-ledger-v7-runtime.test.mjs,
    tests/p20-v2-conflict-status.test.cjs,
    tests/run-p20-v2-conflict-checkpoint.cjs,
    tests/run-p20-v2-conflict-recovery-prepare.cjs,
    tests/run-p20-phase12d-bootstrap-recovery-promotion.cjs,
    tests/run-quality-gate.cjs
توجد ملفات أخرى متسخة في الشجرة تخص أعمالًا سابقة — ليست جزءًا من هذه
الحزمة، لا تلمسها ولا تستخدم git add -A.

هذه الحزمة هي إصلاح تعارض مزامنة V2 الحقيقي (financial_v2_revision_conflict)
الموثّق في docs/04_CURRENT_EVIDENCE/MYFI_PHASE12_V2_CONFLICT_FORENSICS_2026-09-01.md:
checkpoint محلي كامل + مرحلتا prepare/confirm منفصلتان + ترقية ذرية واحدة
(promotePreparedCloudConflictRecoveryV1) تستبدل النسخة المحلية المتعارضة
بنسخة سحابية مُتحقق منها، بعد موافقة صريحة من المستخدم في الواجهة.

اقرأ أولًا، ولا تُعد تحليل أي شيء ورد فيه من الصفر:
docs/04_CURRENT_EVIDENCE/MYFI_CLAUDE_REVIEW_V2_CONFLICT_RECOVERY_PROMOTION_2026-09-01.md

نتيجة تلك المراجعة (Claude، تتبع فعلي في الكود + إعادة تشغيل حقيقية
لكل الاختبارات الأربعة الجديدة، ليس على الثقة): معظم الآلية صحيحة
ومؤكدة — الذرّية، تصنيف "الحالة الضيقة" الآمنة، فصل التحضير عن التأكيد،
حذف V1/V3 المحمي بتحققين مزدوجين، وسلامة إعادة استخدام
activateFinancialSyncV2() بلا تكرار بيانات (كل هذا مؤكد، لا تُعد بناءه).

الأخطاء المؤكدة الوحيدة التي تحتاج إصلاحًا فعليًا:

1) نص واجهة SettingsScreen.js (عربي وإنجليزي) يَعِد المستخدم صراحة
   بوجود "نقطة رجوع محلية" بعد الاستبدال، لكن لا توجد في المشروع كله أي
   دالة تقرأ من checkpointNamespace (`::conflict-recovery-checkpoint::`)
   لتُعيده إلى الـnamespace الحي. آلية التراجع الموجودة أصلًا
   (financialRestoreUndoV13.js) لا تتعرف على هذا الـnamespace. اختر: إما
   بناء دالة استرجاع فعلية بسيطة (عكس اتجاه
   copyFinancialNamespaceFromStageInTransactionV7 الموجودة)، أو تعديل
   نص الواجهة ليتوقف عن الوعد بقدرة غير موجودة. إن لم يكن الاختيار
   واضحًا من نمط المنتج، اسأل المستخدم قبل التنفيذ.

2) assertConflictCheckpoint وassertOnlyPreparedWorkspaceMutations
   (الفحصان اللذان يحميان حذف V1/V3) لا يملكان أي اختبار SQLite حقيقي
   يُثبت أنهما يرفضان حالة تالفة — الاختبار الوحيد الذي يستدعي
   promotePreparedCloudConflictRecoveryV1 فعليًا (لا mock) هو سيناريو
   نجاح واحد فقط. أضف 3 حالات اختبار حقيقية (نفس نمط حقن damagedFixture
   الموجود أصلًا): عدد صفوف checkpoint غير مطابق، mutation إضافي غير
   متوقع في outbox_v3 وقت الترقية، ومحتوى mutation مختلف عمّا سجّله
   intent.

لا تلمس أي كود آخر غير هاتين النقطتين — بقية الحزمة مُراجَعة ومؤكدة،
لا تُعد فحصها أو إعادة كتابتها.

قواعد ثابتة في هذا المشروع، بلا استثناء:
- لا حذف صامت لأي بيانات مالية أو حالة مزامنة تحت أي ظرف.
- لا push، ولا بناء APK جديد، ولا أي عملية كتابة/mutation على Supabase
  (بما فيها أي استدعاء RPC يغيّر حالة السحابة) دون موافقة صريحة من
  المستخدم في المحادثة، في كل مرة على حدة — موافقة سابقة لا تُحسب لمرة
  لاحقة.
- كل خطوة إصلاح = commit محلي مستقل خاص بها، بعد عرضها على المستخدم
  وموافقته، وليس commit واحد يجمع كل شيء.

أولوية MYFI الحالية: إغلاق Phase 12 (نظام النسخ الاحتياطي/الاستعادة
الكامل واستعادة بيانات المزامنة بأمان) قبل أي ميزة كبيرة جديدة
(Tracker Builder، MYFI Flow، أو غيرها) — هذه قاعدة صارمة وليست تفضيلًا.

الخطوة العملية الأولى في هذه المحادثة: اقرأ تقرير المراجعة أعلاه كاملًا،
راجع التغييرات غير المودعة المذكورة فوق مباشرة في الكود لتتأكد أنها لا
تزال كما وُصفت، ثم أصلح فقط النقطتين المؤكدتين (1) و(2) أعلاه — لا شيء
غيرهما. بعد الإصلاح شغّل بوابة الجودة كاملة (tests/run-quality-gate.cjs)
وتأكد أنها لا تزال خضراء، ثم اعرض على المستخدم commit محلي منفصل لكل
إصلاح. اختبار الهاتف الفعلي لا يبدأ قبل: (أ) اكتمال هذه الـcommits،
(ب) طلب موافقة صريحة جديدة من المستخدم على GitHub Actions build — لا
تفترض أن أيًا من الاثنين حصل تلقائيًا.
```
