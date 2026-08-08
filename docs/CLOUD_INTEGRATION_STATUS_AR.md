# حالة اختبار التكامل السحابي

تاريخ الفحص: 2026-08-09

## النتيجة الحالية

لم يكتمل اختبار `npm run test:cloud:managed` لأن Supabase CLI يحتاج تسجيل دخول أو `SUPABASE_ACCESS_TOKEN` للوصول إلى مفاتيح المشروع.

السكربت أصبح يدعم الآن ثلاثة مسارات للعثور على الأداة:

- `tools/supabase-cli/supabase.exe` داخل المشروع.
- أمر `supabase` من PATH.
- تمرير مسار صريح عبر `-SupabasePath`.

الرسالة الحالية المتوقعة عند غياب الأداة:

```text
Supabase CLI was not found. Install it with `npm install --save-dev supabase`, `scoop install supabase`, or pass -SupabasePath.
```

## ما تم التحقق منه

- تم تثبيت Supabase CLI كاعتماد تطوير.
- السكربت وجد CLI وشغّله.
- السكربت ينشئ ملفات اختبار مؤقتة للصورة والصوت.
- السكربت ينظف الملفات المؤقتة حتى عند الفشل.
- لا يتم حفظ `service_role` داخل المشروع.
- اختبار Node الداخلي جاهز للتحقق من:
  - تسجيل دخول مستخدم اختبار مؤقت.
  - كتابة وقراءة `user_data` عبر RLS.
  - استدعاء `smart-ocr`.
  - استدعاء `smart-transcribe`.
  - حذف بيانات الاختبار والمستخدم المؤقت.

## طريقة الإغلاق

سجل دخول Supabase على الجهاز:

```powershell
npx supabase login
```

أو وفر توكن مؤقت في جلسة PowerShell الحالية:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "ضع_التوكن_هنا"
```

ثم أعد الفحص:

```powershell
npm run test:cloud:managed
```

إذا لم ترد استخدام `service_role` من CLI، يمكن تشغيل اختبار Node المباشر بحساب اختبار موجود وصورة وصوت:

```powershell
$env:MYFI_TEST_EMAIL = "test@example.com"
$env:MYFI_TEST_PASSWORD = "password"
$env:MYFI_TEST_IMAGE_FILE = "C:\path\receipt.png"
$env:MYFI_TEST_AUDIO_FILE = "C:\path\voice.wav"
npm run test:cloud
```

لا تعتبر بوابة cloud مغلقة حتى تظهر هذه النتائج:

```text
temporary-user: created
auth: ok
sync-and-rls: ok
image-analysis: ok
voice-analysis: ok
cloud-cleanup: ok
temporary-user: removed
temporary-files: removed
```
