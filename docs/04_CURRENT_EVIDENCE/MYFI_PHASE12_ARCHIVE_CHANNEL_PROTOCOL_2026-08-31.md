# MYFI Phase 12-A — عقد قناة الأرشيف السحابية

**الحالة:** تصميم تنفيذي للمراجعة قبل الكود.
**القرار المعتمد:** استعادة الحساب تشمل الدفتر الحي والأرشيف البارد.
**لا يغيّر هذا الملف قاعدة Supabase أو بيانات أي مستخدم.**

## المشكلة الدقيقة

المزامنة الحالية تنشر أن حركة أصبحت مؤرشفة (`archiveYear`/`archivedAt`) ضمن mutation للحركة، لكن تفاصيل الأرشيف البارد تبقى في `cold_archive_years` و`cold_archive_transactions` محليًا. Bootstrap V2 النهائي لا يضم هذه الجداول، ولا يمكن تعديل Bootstrap قديم بعد finalization.

لذلك لا يكفي أن يرى جهاز ثانٍ أن الحركة "مؤرشفة"؛ يحتاج أيضًا حزمة الأرشيف نفسها ليعرض التاريخ ويستعيده بصورة كاملة.

## القرار المعماري

نبني **قناة أرشيف مرافقة**، لا نعدّل Bootstrap المنتهي:

```text
Bootstrap المالي النهائي (موجود وثابت)
            +
رأس أرشيف سحابي قابل للتحديث عبر CAS
            → لقطة أرشيف نهائية غير قابلة للتعديل
            → صفوف السنوات والحركات مع hashes وmanifest
```

لكل `ledgerId + restoreEpoch` رأس واحد يشير إلى أحدث لقطة أرشيف موثقة. كل لقطة نفسها immutable. تغيير الأرشيف ينشر لقطة جديدة ثم يحرّك الرأس فقط إذا بقي generation المتوقع مطابقًا؛ لا overwrite صامت.

## عقد الصفوف

| row type | row key | payload |
|---|---|---|
| `archive_year` | `[scope, year]` | header: year, scope, checksum, summary, archivedAt، metadata |
| `archive_transaction` | `[scope, year, id]` | transaction المؤرشفة كما في `payload_json`، مع حقول الفهرسة اللازمة للتحقق |

كل row يحمل `ordinal` متصلًا و`rowHash = SHA-256(rowType + "\n" + rowKey + "\n" + canonicalPayloadText)`. والـmanifest هو hash قائمة row hashes المرتبة.

لا ندخل `namespace` المحلي أو user ID في payload؛ الربط والملكية يأتيان من ledger/epoch ورقم الجلسة السحابية.

## دورة النشر

1. عندما يؤرشف التطبيق حركة، تبقى mutation الحالية مسؤولة عن حالة الحركة نفسها.
2. بعد نجاح تسجيل الحزمة المحلية، ينشئ العميل snapshot أرشيف كاملًا من `exportColdArchives` داخل قراءة متسقة.
3. يرسل `expectedArchiveGeneration` للرأس السحابي. الخادم يقفل الرأس للمالك فقط.
4. ينشئ session، يرفع الصفوف بالتسلسل، ويتحقق من hashes والـmanifest، ثم ينهي اللقطة.
5. في نفس معاملة الخادم، يحدّث الرأس من generation `N` إلى `N+1` ليرتبط باللقطة النهائية.
6. لو تغير الرأس قبل التحديث، يفشل بـconflict؛ لا يكتب فوق لقطة جهاز آخر. تعرض الواجهة "الأرشيف تغيّر على جهاز آخر" وتطلب تنزيله أولًا أو اتخاذ قرار صريح لاحقًا.

لا نعتبر أرشفة الحركة "محفوظة سحابيًا بالكامل" حتى تنجح mutation الحية ولقطة الأرشيف معًا. عند الانقطاع تحفظ حالة pending محليًا ولا تدّعي اكتمالًا.

## دورة الاستعادة

1. يكتشف التطبيق Bootstrap النهائي عبر المصدر الحالي.
2. يقرأ رأس الأرشيف بنفس ledger/epoch، ثم ينزّل اللقطة المشار إليها ويعيد تحقق manifest والصفوف إلى stage خاص.
3. يثبت stage المالي وstage الأرشيف، ثم يرقّيهما معًا داخل معاملة SQLite واحدة.
4. لا تظهر "اكتملت الاستعادة" إلا بعد تثبيت الاثنين ثم activation V2.

### التوافق مع الحسابات الحالية

- إذا لم يكن للأرشيف أي بيانات: ينشأ head فارغ موثق مرة واحدة؛ الاستعادة تظل كاملة.
- إذا لم يوجد archive head: هذا حساب عادي بلا أرشيف منشور، وتبقى استعادة الدفتر الحي كاملة وطبيعية. عند ظهور أول لقطة لاحقًا، تلتقطها المزامنة التالية. لا تعرض الواجهة رسالة "ينتظر جهازًا آخر"؛ Bootstrap القديم لا يحمل أصلًا إشارة تسمح بهذا الاستنتاج.
- بعد النشر الأول، تعمل الأجهزة الجديدة مع Bootstrap القديم والقناة المرافقة بصورة كاملة.

### الحسابات الجديدة

عند إنشاء Bootstrap جديد، يسجَّل reference للـarchive head والـmanifest (حتى لو صفر صفوف) ضمن عقد Bootstrap بإصدار واضح. لا ننسخ archive rows مرتين داخل جدول Bootstrap؛ المرجع الموثق يجعل الاستعادة وحدة واحدة، والقناة نفسها تستمر لتحديث الأرشيف بعد الأشهر والسنوات اللاحقة.

## الجداول وواجهات RPC المقترحة

هذه أسماء مبدئية للمراجعة، لا SQL بعد:

- `financial_archive_heads_v2`: `ledger_id`, `restore_epoch`, `generation`, `snapshot_id`, `manifest_hash`, `expected_row_count`, `finalized_at`.
- `financial_archive_snapshot_sessions_v2`: لقطة immutable وحالة `staging/uploading/finalized/aborted` وowner وexpected generation.
- `financial_archive_snapshot_rows_v2`: صفوف اللقطة مع ordinal/type/key/hash/payload.
- `begin_financial_archive_snapshot_v2`
- `upload_financial_archive_snapshot_rows_v2`
- `finalize_financial_archive_snapshot_v2`
- `get_financial_archive_snapshot_rows_v2`
- `get_financial_archive_head_v2`

كل جدول RLS مفعّل ولا وصول مباشر لـ`authenticated`. كل RPC يثبت `auth.uid()` يساوي owner للـledger، ويستخدم `SECURITY DEFINER` فقط عند الضرورة مع `search_path` ثابت و`REVOKE` من `public` و`anon`، ثم `GRANT` محدود لـ`authenticated`.

## الحالات التي يجب أن تفشل بأمان

- head generation مختلف.
- owner/session مختلفان.
- ledger أو epoch مختلفان عن Bootstrap المصدر.
- hash/manifest/ordinal/row-key غير صالح أو مكرر.
- محاولة تعديل snapshot finalized.
- Bootstrap يقول إن archive موجود لكن head غير موجود.
- انقطاع بين finalize اللقطة وتحديث الرأس: اللقطة تبقى orphan قابلة للتنظيف أو الاستئناف، والرأس لا يتغير.
- انقطاع بعد الرأس وقبل SQLite promotion: الاستئناف يقرأ الرأس نفسه، ولا ينشر لقطة ثانية.

## العلاقة مع Restore Epoch

قناة الأرشيف ليست Restore Epoch: نشر لقطة أرشيف لاحقة لا يغيّر `restore_epoch` ولا ينبغي أن يبدأ `beginLedgerRestoreEpochV8`، لأن تلك الدالة تنشئ/تتطلب هوية محلية ثم تمهّد لرفع العهد، وهو عقد مختلف عن نشر archive snapshot.

عند استيراد الحساب كاملًا، ينفذ تنزيل archive stage ضمن نفس Import Session الحصري للـBootstrap، ويقرأ `readLedgerRestoreIntentV8` كمانع: إذا كانت استعادة حقيقية قائمة، يتوقف بلا تغيير. لكنه لا ينشئ restore intent جديدًا ولا يستدعي `advanceLedgerRestoreEpochInTransactionV8`.

هذا يمنع مسارين متوازيين من دون إساءة استعمال آلية تغيّر العهد أو منع تفعيل V2 بلا حاجة.

## معايير قبول 12-A

1. مراجعة Claude للعقد، خصوصًا دلالة `archive_generation` ووسيلة كشف الأرشيف الموجود بالحسابات القديمة.
2. migration SQL جديد لا يلمس Bootstrap rows النهائية ولا يغير restore epoch.
3. اختبارات SQL فعلية: owner isolation، CAS لجهازين، immutable finalized snapshot، hash tamper، orphan handling.
4. لا دمج مع مستورد Bootstrap الحي قبل نجاح هذه الاختبارات ومراجعة البروتوكول.
