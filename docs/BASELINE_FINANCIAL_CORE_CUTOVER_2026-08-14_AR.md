# MYFI — Baseline قبل Financial Core Cutover

التاريخ: 2026-08-14  
الفرع: `codex/financial-core-cutover`

## Snapshot المصدر

تم إنشاء نسخة محلية من كود المشروع قبل أي تغيير في النموذج المالي أو مسار SQLite:

```text
.myfi-backups/baseline-financial-core-cutover-20260814.zip
Size: 7,468,124 bytes
SHA-256: 34D7EB527899F0CE23B695ABCA19407AB1A8DB6E877B3F853F9D6E99275AA5B3
Entries: 281
```

هذه نسخة Baseline لكود ومسارات المشروع وليست Backup لبيانات مستخدم على هاتف. لا تحتوي `.env` أو `.git` أو `node_modules`. المجلد محلي ومضاف إلى `.gitignore` حتى لا يدخل إلى Git بالخطأ.

كان Worktree يحتوي مسبقاً تعديلات وملفات جديدة كثيرة تخص تطوير MYFI. لم تُحذف أو تُستبدل، والنسخة تحفظ الحالة كما كانت عند بداية مسار الـCutover.

## بوابة الاختبار المعتمدة

الأمر الأساسي:

```text
npm run test:gate
```

الأوامر الجزئية:

```text
npm run test:gate:static
npm run test:gate:runtime
```

نتيجة Baseline في 2026-08-14:

```text
30 PASS
0 FAIL
11 SKIPPED
```

الـPASS مصنّف ولا يعني اختباراً واحداً عاماً:

- `JS_JSX_PARSE`: تحليل كل ملفات JS/JSX.
- `STATIC_CONTRACT`: عقود بنيوية ثابتة.
- `UNIT_RUNTIME`: منطق يعمل فعلياً داخل Node.
- `STORE_RUNTIME_WEB`: Financial Store مع طبقة Web/Memory، ولا يثبت Expo SQLite Native.

## العقود القديمة المصنفة Legacy

هذه الملفات لا تُحسب PASS ولا تُشغّل ضمن البوابة الحالية، وتظهر `SKIPPED` مع السبب:

- `design-refinement-v1.test.cjs`: يفرض تدفق حذف Vault قديم استُبدل بمسار يحفظ بيانات الجهاز أولاً.
- `ux-core-v4.test.cjs`: يفرض تقسيم Financial Settings أقدم من الواجهة الموحدة الحالية.
- `ux-logic-correction-v3.test.cjs`: يفرض Information Architecture أقدم للحساب والإعدادات.
- `ux-logic-refinement-v2.test.cjs`: يتعارض مع UX أحدث للمتابعات والدليل حسب المهمة.
- `ux-polish-v43.test.cjs`: استُبدل بعقود Account V4.4 وAccount UX V4.5 وSettings V5.0.1.

بقاء الملفات مؤقتاً مقصود كمرجع تاريخي. لا يجوز إعادتها إلى الـGate إلا بعد إعادة كتابتها كعقد حالي غير متعارض.

## البوابات غير المثبتة بعد

تظهر هذه صراحةً `SKIPPED` وليست جزءاً من النجاح الحالي:

- `CLOUD_INTEGRATION`: يحتاج Staging credentials وشبكة وتشغيل صريح.
- `ANDROID_BUNDLE_EXPORT`: يحتاج `--include-android` أو `npm run verify:android`.
- `NATIVE_SQLITE_INTEGRATION`: لا يوجد Device/Native harness بعد.
- `TWO_DEVICE_SYNC_E2E`: Outbox Sync الجديد غير منفذ بعد.
- `SHADOW_MIGRATION_PARITY`: أداة مقارنة Vault/SQLite غير منفذة بعد.
- `DEVICE_E2E`: يحتاج Android device أو emulator.

## العقود التي صُححت لتطابق السلوك الحالي

- السجل المالي يقبل رصيداً سالباً ويحفظ `balanceWarning` بدل رفض واقع حدث فعلاً.
- المحفظة التي تملك تاريخاً مالياً لا تُحذف ولا يُعاد تشكيل تاريخها بصمت.
- Cold Archive لا يزيل البيانات النشطة إذا تعذر حفظ SQLite Native.
- `exportBackup()` عقد Async.
- Performance fixtures تُحسب عبر active + archived rows.
- Financial Core في Node هو Web compatibility test؛ لا يدّعي نجاح SQLite Native.

## شرط الانتقال للمرحلة التالية

هذه الوثيقة تثبت Baseline فقط. لا تسمح بـSQLite Cutover. الانتقال يحتاج أولاً اعتماد النموذج المالي النهائي، ثم Vertical Slice، ثم Shadow Migration بنتيجة Parity كاملة.
