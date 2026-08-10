# MYFI — الحزمة الأولى (الجزء الآمن الجاهز للنسخ)

هذه الحزمة لا تغيّر GitHub تلقائياً. انسخ الملفات إلى مشروعك ثم ارفعها بنفسك.

## 1) المكتبة الجديدة الوحيدة

نفّذ داخل مجلد المشروع:

```bash
npx expo install expo-screen-orientation
```

لا تستخدم إصداراً يدوياً بـ npm لأن `expo install` يختار الإصدار المتوافق مع Expo 54.

> `expo-image-picker` موجود أصلاً في مشروعك، لذلك لا نضيف مكتبة للصورة الشخصية.

---

## 2) الإشعارات

استبدل الملف:

`src/components/NotificationCenterModal.js`

بالملف الموجود في هذه الحزمة بنفس المسار.

التغيير:
- إزالة زر الحذف الفردي الكبير من كل إشعار.
- إزالة "حذف الكل".
- الحذف يصبح عن طريق التحديد المتعدد فقط.
- مراجعة الإدخال الذكي تظهر كبند واضح داخل الإشعارات.
- مراجعة الإدخال الذكي ليست ضمن العناصر القابلة للحذف.
- إذا توجد إدخالات ذكية غير مراجعة، يبقى بند المراجعة ظاهراً حتى فتح المراجعة والتأكد منها.

مهم: اختفاء بند "مراجعة الإدخال الذكي" بعد التأكيد يعتمد على `smartReviewCount` الحالي في `App.js`؛ عندما يصبح العدد 0 يختفي تلقائياً.

---

## 3) اتجاه الشاشة

أضف الملف:

`src/lib/screenOrientation.js`

ثم في `app.json` غيّر فقط:

```json
"orientation": "portrait"
```

إلى:

```json
"orientation": "default"
```

وفي `App.js` أضف أعلى الملف:

```js
import { applyOrientationMode } from './src/lib/screenOrientation';
```

وداخل `AppRoot` بعد توفر `cfg` أضف:

```js
useEffect(() => {
  applyOrientationMode(cfg.orientationMode || 'system').catch(() => {});
}, [cfg.orientationMode]);
```

### constants.js

داخل `DEF_CFG` أضف:

```js
orientationMode: 'system',
```

وداخل `normalizeCfg` في الكائن المعاد أضف:

```js
orientationMode: ['system', 'portrait', 'landscape'].includes(cfg.orientationMode)
  ? cfg.orientationMode
  : 'system',
```

القيم:
- `system` = حسب إعداد الجهاز ورغبة المستخدم.
- `portrait` = طولي.
- `landscape` = عرضي.

> لا تحذف `orientation: "default"` من app.json، لأن `unlockAsync()` يحتاج أن لا يكون التطبيق مقفولاً أساساً على Portrait.

---

## 4) واجهة التاريخ + المحفظة

أضف:

`src/components/EntryContextRow.js`

هذا Component موحد للشكل الذي اتفقنا عليه في:
- الدين عليّ
- الدين لي
- التوفير
- الالتزام
- الالتزام المرتبط

هو لا يغيّر منطق التاريخ أو المحفظة؛ فقط يوحّد الشكل حتى لا نخاطر بالحسابات.

مثال دمج داخل `NewItemModal.js`:

```js
import EntryContextRow from './EntryContextRow';
```

ثم بدل عرض حقل التاريخ وحقل المحفظة ككتلتين غير متناسقتين، استخدم:

```jsx
<EntryContextRow
  th={th}
  lang={lang}
  dateTitle={lang === 'ar' ? 'تاريخ البداية' : 'Start date'}
  dateValue={formattedDate}
  walletTitle={lang === 'ar' ? 'محفظة التأثير' : 'Wallet'}
  walletValue={walletLabel}
  walletMeta={walletBalanceLabel}
  onPressDate={() => setDatePickerOpen(true)}
  onPressWallet={() => setWalletPickerOpen(true)}
  accentColor={accent}
/>
```

استخدم أسماء state/callback الموجودة فعلياً عندك بدل الأسماء التوضيحية أعلاه.

**لا تحذف DateField أو منطق Wallet الحالي**؛ فقط اربط callbacks الحالية بالـ component الجديد.

---

## 5) إصلاح profiles / display_name

شغّل محتوى:

`supabase/migrations/20260810_profile_identity_fix.sql`

من Supabase SQL Editor، أو ضعه ضمن migrations وشغّل migration بالطريقة التي تستخدمها.

المigration:
- يضمن وجود `display_name`.
- يضمن `username`.
- يضمن `phone`.
- يضيف `avatar_url` للمستقبل.
- ينشئ Unique username case-insensitive إذا لا توجد بيانات مكررة حالياً.
- يطلب من PostgREST إعادة تحميل schema cache.

بعدها جرّب حفظ الاسم واليوزرنيم من البرنامج مرة ثانية.

---

## 6) إعدادات اتجاه الشاشة

داخل `SettingsScreen.js` أضف اختياراً مستقلاً باسم:

**اتجاه الشاشة / Screen orientation**

والخيارات:

- حسب الجهاز / Follow device → `system`
- طولي / Portrait → `portrait`
- عرضي / Landscape → `landscape`

استخدم نفس أسلوب الاختيارات المستخدم عندك للثيم/اللغة، وعدّل:

```js
setCfg?.({ ...cfg, orientationMode: value })
```

أو دالة تحديث الإعدادات الموجودة فعلياً في الشاشة.

---

## اختبار سريع بعد النسخ

1. شغّل:
   `npx expo install expo-screen-orientation`
2. شغّل اختبارات المشروع الحالية.
3. افتح البرنامج Portrait ثم لف الجهاز: في `system` يجب أن يستجيب لإعداد الجهاز.
4. اختبر `portrait` و `landscape`.
5. افتح الإشعارات:
   - لا يوجد حذف فردي كبير.
   - يوجد تحديد متعدد.
   - الإدخال الذكي يظهر كبند مراجعة مستقل ولا يدخل في الحذف.
6. شغّل SQL migration ثم عدّل الاسم/username وتأكد أن خطأ schema cache اختفى.
7. اختبر شاشة دين/توفير/التزام بعد ربط `EntryContextRow`.

## ملاحظة

هذا الجزء متعمد أن يكون قليل المخاطر: لا يغيّر العمليات المالية أو احتساب الأرصدة.
بعد رفعه إلى `main` يمكن مراجعة النسخة الجديدة ثم إكمال بقية الحزمة الأولى بدقة على الملفات الفعلية.
