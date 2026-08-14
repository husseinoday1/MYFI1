# MYFI — Financial Core V7 Release Gate

التاريخ: 2026-08-14

## المسار المنفّذ

Baseline → Tests → Financial Model → SQLite Cutover → Read Paths → Mutation Sync → Archive/Backup → Financial Features → UX → Release Gate.

SQLite V7 هو مصدر الحقيقة المحلي بعد Shadow Migration متطابق. النموذج الداخلي يستخدم Minor Units وTransaction/Postings، بينما تبقى الواجهة المبسطة للمستخدم. Vault وSnapshot Sync وCold Archive القديم باقية كطبقات fallback مؤقتة وفق شروط الإزالة المعتمدة.

## معنى نتائج البوابة

- Static/contract: بنية الملفات والعقود ومسارات الربط.
- JavaScript runtime: نموذج المال، الأوامر، الترحيل، النسخ، والمزامنة باستخدام runtime محلي.
- SQLite schema runtime: إنشاء DDL حقيقي وفحص القيود وForeign Keys عبر `node:sqlite`.
- Store/web runtime: تحميل وتشغيل المتجر ومسارات واجهة الويب التي يمكن اختبارها محلياً.
- Android bundle: نجاح تصدير حزمة Expo/Android.
- Cloud mutation protocol: فاحص Staging بعميلين معزولين موجود، ويغطي الترتيب والـcursor ومنع التكرار والتحقق من الإدخال. يلزم نشر migration وبيانات Staging لتشغيله.
- Two-device app E2E: لا يُعد ناجحاً قبل استعمال جلستين فعليتين معزولتين بعد نجاح فاحص Staging.
- Native SQLite device: الفاحص المعزول موجود في Development Settings، ولا يُعد ناجحاً قبل تشغيله على Android/iOS فعلي.
- Native device E2E: لا يُعد ناجحاً قبل فحص إعادة التشغيل والاستعادة ومسارات المستخدم على جهاز فعلي.

## النتيجة المحلية النهائية

- Quality Gate مع Android: **36 PASS / 0 FAIL**.
- Android Expo production export: **PASS**.
- JavaScript/JSX parse، العقود، Store web runtime، Repository runtime، SQLite DDL/constraints، ووحدات الحساب والمزامنة والأداء: **PASS** كلٌ بنوعه.
- `git diff --check`: **PASS**؛ تحذيرات CRLF فقط وليست أخطاء محتوى.
- Cloud staging، Native SQLite على جهاز، Two-device app، ومسارات Android اليدوية: **لم تُشغّل** لعدم وجود Staging credentials أو جهاز/محاكي متصل. الـharnesses جاهزة ولا تُسجّل كنجاح قبل تنفيذها فعلياً.

## فحص المستخدم المختصر

1. افتح بياناتك القديمة وتأكد أن Settings تعرض SQLite V7 وسلامة المحرك.
2. جرّب Expense وIncome وTransfer بين عملتين مع رسم، ثم أعد تشغيل التطبيق.
3. جرّب Debt وGoal وCommitment وافحص History وHome وReports.
4. أرشف سنة قديمة وافتحها وصدّرها من جديد.
5. أنشئ Backup مشفّراً، ثم اختبر Restore على نسخة تجريبية.
6. لا يُلغى Snapshot fallback إلا بعد نشر migration ونجاح اختبار جهازين.

في نسخة التطوير يظهر زر **فحص SQLite V7 على هذا الجهاز** ضمن البيانات والتخزين. يستعمل namespace منفصلاً، يفحص Expense وIncome وTransfer وGoal وOutbox وSQLite constraints، ثم يحذف بياناته تلقائياً حتى عند الفشل.

## نتيجة المراجعة الذاتية الأخيرة

أُعيد فحص مسارات الكتابة والحذف والأرشفة والاستعادة والمزامنة بعد التنفيذ. تم تصحيح منع الكتابة بمراجعة قديمة قبل حذف القيود، رفع مراجعات الكيانات محلياً، مزامنة تغييرات الكيانات المرتبطة، مطابقة الأقسام المنطقية للنسخة الاحتياطية، إعادة cutover فور إعادة الضبط، وإنشاء قيد تحرير داخلي للحجز عند أرشفة توفير هدف. أضيفت اختبارات تشغيلية مباشرة لهذه الحدود، وصُحّح مشغّل Android على Windows.
