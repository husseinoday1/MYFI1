# مراجعة حزمة تغييرات Git

تاريخ المراجعة: 2026-08-09

## القرار

التغييرات الحالية تمثل حزمة إصدار واحدة واسعة، وليست تصحيحًا صغيرًا. يمكن رفعها معًا إذا كان الهدف هو تثبيت نسخة MYFI المالية الجديدة قبل اختبارات الهاتف وPlay Console.

## يدخل في الحزمة

- تحديثات الواجهة الأساسية:
  - `App.js`
  - `src/screens/HomeScreen.js`
  - `src/screens/ReportsScreen.js`
  - `src/screens/TrackersLabScreen.js`
  - `src/screens/SettingsScreen.js`
  - `src/components/AddTransModal.js`
  - `src/components/NewItemModal.js`
  - `src/components/DateField.js`
  - `src/components/NotificationCenterModal.js`
  - `src/components/HomeCenterModal.js`
  - `src/components/WalletBalanceCard.js`
- تحديثات النموذج المالي والمنطق:
  - `src/store/domain.js`
  - `src/store/useStore.js`
  - `src/store/slices/*`
  - `src/lib/commitments.js`
  - `src/lib/financialForecast.js`
  - `src/lib/financialIntegrity.js`
  - `src/lib/trackerLifecycle.js`
  - `src/lib/wallets.js`
  - `src/lib/categories.js`
  - `src/utils/calc.js`
- المزامنة والاستعادة:
  - `src/store/multiDeviceSync.js`
  - `src/store/slices/useSyncSlice.js`
  - `supabase/migrations/202608080001_add_commitment_occurrence_state.sql`
  - `tests/sync-scenarios.test.mjs`
  - `tests/run-sync-scenarios.cjs`
- الاختبارات والوثائق:
  - `tests/financial-core.test.mjs`
  - `tests/ui-contract.test.cjs`
  - `tests/run-cloud-integration.ps1`
  - `README.md`
  - `docs/*.md`
- أدوات التطوير:
  - `package.json`
  - `package-lock.json`
  - إضافة `supabase` كاعتماد تطوير لتشغيل اختبار cloud managed بشكل قابل للتكرار.

## حذف مقبول

هذه الملفات تبدو أدوات ترقيع قديمة وليست جزءًا من المنتج النهائي:

- `apply-all-fixes.ps1`
- `apply-backup-restore-fix.ps1`
- `tools/apply-backup-restore-fix.cjs`
- `tools/apply-lifecycle-wallet-search-reset.cjs`

حذف `README-AR.md` مقبول لأن `README.md` أصبح الوثيقة الرئيسية العربية للمشروع.

## لا يدخل في Git

- `.env`
- `.expo/`
- `dist-android-verify/`
- `node_modules/`
- ملفات APK/AAB.
- أي مفاتيح، شهادات، أو ملفات Supabase CLI التنفيذية.

## ملاحظات بعد تثبيت Supabase CLI

تثبيت `supabase@2.113.0` أظهر تحذير `npm audit` بوجود 22 مشكلة في شجرة الاعتمادات. لا يتم تشغيل `npm audit fix --force` ضمن هذه الحزمة لأنه قد يغير نسخ Expo/React Native ويحتاج اختبار توافق منفصل.

## الفحوصات التي نجحت قبل هذه المراجعة

```text
npm run test:logic
npm run test:sync-scenarios
npm run test:db-schema
npm run test:backfill
npm run test:ui
git diff --check
npm run verify:android
```

## قبل commit

أعد تشغيل:

```powershell
npm run test:logic
npm run test:sync-scenarios
npm run test:db-schema
npm run test:backfill
npm run test:ui
git diff --check
```

ثم راجع `git status --short` وتأكد أن الملفات المؤقتة غير ظاهرة.
