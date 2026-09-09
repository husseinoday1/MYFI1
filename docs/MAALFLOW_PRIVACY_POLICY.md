# MaalFlow — سياسة الخصوصية / Privacy Policy

> **مسوّدة.** قبل النشر املأ: `[اسم الجهة]`، `[بريد التواصل]`، `[تاريخ السريان]`.
> النصّ مبنيّ على سلوك التطبيق الفعلي كما هو موثّق في `MAALFLOW_SECURITY_THREAT_MODEL.md`،
> ويجب أن يبقى مطابقًا لنموذج Data Safety في Google Play. أي تغيير في أحدهما يُلزم الآخر.

---

# النسخة العربية

**آخر تحديث:** `[تاريخ السريان]`

## الخلاصة في ثلاثة أسطر

MaalFlow يعمل على جهازك أولًا. **لا يحتاج حسابًا**، ولا يعرض إعلانات، ولا يتتبّعك، ولا يبيع بياناتك لأحد.
البيانات تغادر هاتفك في حالتين فقط: أن تربط حسابًا للمزامنة، أو أن تستخدم قراءة الفواتير والتسجيل الصوتي.
وكلتاهما **اختياريتان بالكامل**، ونطلب إذنك قبل الأولى مرّة وقبل الثانية مرّة.

## ١. من نحن

`[اسم الجهة]` — المسؤول عن معالجة البيانات في تطبيق MaalFlow.
للتواصل بشأن الخصوصية: `[بريد التواصل]`

## ٢. أين تعيش بياناتك

### على جهازك — الوضع الافتراضي
كل ما تسجّله (الحركات، المحافظ، الديون، الأهداف، الالتزامات، الفئات، الإعدادات) يُحفظ في قاعدة بيانات داخل التطبيق على هاتفك.
**تستطيع استخدام التطبيق كاملًا دون إنشاء حساب ودون اتصال بالإنترنت.** في هذه الحالة لا تصل بياناتك المالية إلينا إطلاقًا.

### على السحابة — فقط إذا ربطت حسابًا
عند ربط حساب تُزامَن: حركاتك وسجلّك المالي، والديون، والأهداف والمدّخرات، والالتزامات، والفئات، وبيانات ملفك (الاسم الظاهر، اسم المستخدم، البريد، الهاتف إن أدخلته، الدولة، صورة الحساب)، وسجلّ أحداث فنّي يُستخدم لسلامة المزامنة والاستعادة.

نستخدم **Supabase** لتخزين هذه البيانات، مع عزل على مستوى الصفوف يمنع أي حساب من قراءة بيانات حساب آخر.

## ٣. الالتقاط الذكي — الإفصاح الأهم

عند تصوير فاتورة أو تسجيل ملاحظة صوتية، **لا تُعالَج على جهازك**:

- **صورة الفاتورة** تُرسل إلى **OpenAI** و/أو **Google Gemini** لاستخراج المبلغ والتفاصيل.
- **التسجيل الصوتي يُرفع كصوت خام** إلى **OpenAI** لتحويله إلى نصّ، ثم يُحلَّل النصّ.

الفاتورة قد تحمل اسمك، وآخر أرقام بطاقتك، واسم المتجر، وكامل مشترياتك في تلك الزيارة. **نحن لا نحتفظ بالصورة ولا بالتسجيل**، لكننا لا نتحكّم بما تفعله تلك الخدمات بها؛ راجع سياساتها إن أردت التفصيل.

**تُطلب موافقتك قبل أول استخدام لكلٍّ منهما على حدة**، ويمكنك سحبها في أي وقت من **الإعدادات ← الالتقاط الذكي والخصوصية**. والتطبيق يعمل بكامل وظائفه دون تفعيلهما — تستطيع إدخال كل حركة يدويًا.

## ٤. ما لا نفعله

- **لا إعلانات.**
- **لا تحليلات ولا تتبّع** — لا يوجد في التطبيق أي أداة تتبّع طرف ثالث.
- **لا بيع ولا مشاركة** لبياناتك المالية مع أي جهة لأغراض تسويقية.
- **لا نقرأ** جهات اتّصالك، ولا موقعك، ولا رسائلك.
- **لا نُدرج** بياناتك المالية في سجلّات التشخيص.

## ٥. الأمان — بصراحة

- **قاعدة البيانات المالية على جهازك غير مشفَّرة.** تحميها عزلة التطبيق في نظام أندرويد، وتعطيل النسخ الاحتياطي التلقائي للنظام، وتشفير جهازك نفسه إن كان مفعّلًا. **لا ندّعي تشفير قاعدة البيانات المحلية.**
- **بيانات دخولك مشفَّرة** عند تخزينها، ومفتاحها محفوظ في مخزن مفاتيح النظام.
- **لقطات الشاشة معطّلة** داخل التطبيق، حتى لا تظهر أرصدتك في شاشة التطبيقات الأخيرة.
- يمكنك تفعيل **قفل بالبصمة** يُعيد القفل بعد مدّة تختارها.

## ٦. النسخ الاحتياطية — مسؤوليتك المشتركة

عند تصدير نسخة احتياطية نعرض عليك **تشفيرها بكلمة مرور**.
**النسخة غير المشفَّرة نسخة كاملة وواضحة من بياناتك المالية** خارج حماية التطبيق. من يحصل على الملف يقرأ كل شيء. اختر التشفير كلّما شاركت الملف أو حفظته خارج هاتفك، ونحن لا نستطيع استرجاع كلمة مرور نسيتها.

## ٧. الإشعارات

الإشعارات تُولَّد على جهازك محليًا. ويمكنك إخفاء تفاصيلها من شاشة القفل بحيث لا تظهر مبالغ أو أسماء.

## ٨. حقوقك

- **الاطّلاع والتصدير** — تصدير بياناتك في أي وقت كملف PDF أو CSV أو نسخة احتياطية كاملة.
- **الحذف** — حذف حسابك السحابي وبياناته نهائيًا من داخل التطبيق. يُحذف معه ملفك وصورتك وسجلّك المالي السحابي. وتبقى بياناتك على جهازك حتى تحذفها أنت.
- **الحذف المحلي** — حذف بيانات هذا الجهاز وحده مع إبقاء نسختك السحابية.
- **سحب الموافقات** — سحب موافقة الالتقاط الذكي في أي وقت.

## ٩. الأطفال

التطبيق غير موجّه لمن هم دون **١٣** عامًا، ولا نجمع بياناتهم عن قصد.

## ١٠. تغيّر هذه السياسة

عند أي تغيير جوهري — خصوصًا في **من تصل إليه بياناتك** — نحدّث تاريخ السريان، ونطلب موافقتك من جديد إذا اتّسع نطاق ما يغادر جهازك.

## ١١. التواصل

`[بريد التواصل]`

---
---

# English version

**Last updated:** `[effective date]`

## The short version

MaalFlow runs on your device first. **It needs no account**, shows no ads, does not track you, and does not sell your data to anyone.
Data leaves your phone in exactly two cases: you connect an account to sync, or you use receipt scanning or voice capture.
Both are **entirely optional**, and each asks your permission before its first use.

## 1. Who we are

`[entity name]` is the controller of personal data processed in MaalFlow.
Privacy contact: `[contact email]`

## 2. Where your data lives

### On your device — the default
Everything you record — transactions, wallets, debts, goals, commitments, categories, settings — is stored in a database inside the app on your phone.
**You can use the whole app without an account and without an internet connection.** In that case your financial data never reaches us at all.

### In the cloud — only if you connect an account
Connecting an account syncs: your transactions and financial ledger, debts, goals and savings, commitments, categories, your profile (display name, username, email, phone if you enter one, country, avatar) and a technical event log used for sync and restore integrity.

We use **Supabase** to store this, with row-level isolation preventing any account from reading another's data.

## 3. Smart capture — the disclosure that matters most

When you photograph a receipt or record a voice note, **it is not processed on your device**:

- **The receipt image** is sent to **OpenAI** and/or **Google Gemini** to extract the amount and details.
- **The voice recording is uploaded as raw audio** to **OpenAI** for transcription; the resulting text is then analysed.

A receipt can carry your name, your card tail, the merchant, and everything you bought on that visit. **We do not keep the image or the recording**, but we do not control what those services do with them; see their policies for details.

**Each is consented to separately before its first use**, and you can withdraw consent at any time in **Settings → Smart capture & privacy**. The app is fully functional without either — every transaction can be entered by hand.

## 4. What we do not do

- **No ads.**
- **No analytics, no tracking** — the app contains no third-party tracking SDK.
- **No selling or sharing** of your financial data for marketing.
- **We do not read** your contacts, your location, or your messages.
- **We do not put** financial data in diagnostic logs.

## 5. Security — stated plainly

- **The financial database on your device is not encrypted.** It is protected by the Android application sandbox, by system auto-backup being disabled, and by your device's own encryption if enabled. **We do not claim local database encryption.**
- **Your sign-in credentials are encrypted** at rest, with the key held in the device keystore.
- **Screenshots are disabled** in the app, so balances do not appear in the recent-apps preview.
- You can enable a **biometric lock** that re-locks after a delay you choose.

## 6. Backups — a shared responsibility

When you export a backup we offer to **encrypt it with a password**.
**An unencrypted backup is a complete, readable copy of your financial data** outside the app's protection. Anyone who obtains the file can read all of it. Choose encryption whenever you share the file or store it off your phone. We cannot recover a password you forget.

## 7. Notifications

Notifications are generated locally on your device. You can hide their details on the lock screen so no amounts or names appear.

## 8. Your rights

- **Access and export** — export your data at any time as PDF, CSV, or a full backup.
- **Deletion** — permanently delete your cloud account and its data from inside the app, including your profile, avatar and synced financial records. Data on your device remains until you delete it.
- **Local deletion** — delete this device's copy while keeping your cloud data.
- **Withdraw consent** — revoke smart capture consent at any time.

## 9. Children

MaalFlow is not directed to children under **13**, and we do not knowingly collect their data.

## 10. Changes to this policy

For any material change — especially to **who your data reaches** — we update the effective date, and ask for your consent again if the scope of what leaves your device widens.

## 11. Contact

`[contact email]`
