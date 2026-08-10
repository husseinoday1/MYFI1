const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const workspace = path.resolve(__dirname, '..');
const outDir = path.join(workspace, 'output', 'pdf');
const htmlPath = path.join(outDir, 'myfi-design-preview.html');
const pdfPath = path.join(outDir, 'myfi-design-preview.pdf');
const previewPngPath = path.join(outDir, 'myfi-design-preview-cover.png');
const fontUrl = pathToFileURL(path.join(workspace, 'assets', 'fonts', 'Cairo.ttf')).href;

fs.mkdirSync(outDir, { recursive: true });

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const icon = (value) => `<span class="icon">${esc(value)}</span>`;

const phone = ({ title, tone = 'blue', meta = '', rows = [], chips = [], notice = '', footer = 'حفظ', compact = false }) => `
  <section class="phone ${compact ? 'compact' : ''}">
    <div class="sheet">
      <div class="handle"></div>
      <div class="phone-head ${tone}">
        <div class="phone-icon">${icon(meta || '•')}</div>
        <div>
          <h3>${esc(title)}</h3>
          <p>${esc(rows.find((row) => row.strong)?.value || 'جاهز للمراجعة')}</p>
        </div>
      </div>
      ${rows.map((row) => `
        <div class="field ${row.big ? 'big' : ''}">
          <span>${esc(row.label)}</span>
          <strong>${esc(row.value)}</strong>
          ${row.detail ? `<small>${esc(row.detail)}</small>` : ''}
        </div>
      `).join('')}
      ${chips.length ? `<div class="chips">${chips.map((chip) => `<b class="${chip.on ? tone : ''}">${esc(chip.label)}</b>`).join('')}</div>` : ''}
      ${notice ? `<div class="notice ${tone}">${esc(notice)}</div>` : ''}
      <div class="phone-actions">
        <button>رجوع</button>
        <button class="${tone}">${esc(footer)}</button>
      </div>
    </div>
  </section>
`;

const page = ({ kicker, title, subtitle, phones = '', notes = [], vote = 'أوافق / أحتاج تعديل' }) => `
  <article class="page">
    <header>
      <div>
        <span class="kicker">${esc(kicker)}</span>
        <h1>${esc(title)}</h1>
        <p>${esc(subtitle)}</p>
      </div>
      <div class="vote">${esc(vote)}</div>
    </header>
    <main>${phones}</main>
    ${notes.length ? `<aside>${notes.map((note) => `<p>${esc(note)}</p>`).join('')}</aside>` : ''}
  </article>
`;

const miniCard = (title, body, tone = 'blue') => `
  <div class="mini-card ${tone}">
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
  </div>
`;

const screenGrid = (items) => `<div class="screen-grid">${items.join('')}</div>`;

const pages = [
  page({
    kicker: 'MYFI - معاينة قبل التطبيق',
    title: 'ملف تصويت للتصميم بعد آخر الملاحظات',
    subtitle: 'هذه ليست نسخة نهائية من التطبيق. هي صور تفصيلية مقترحة حتى توافق على الشكل والمنطق قبل التنفيذ الكامل.',
    phones: screenGrid([
      miniCard('الهدف', 'نثبت تجربة نسخة 1 قبل النشر، ثم نضيف الدفع والذكاء الاصطناعي والميزات المدفوعة لاحقاً.', 'green'),
      miniCard('طريقة التصويت', 'اكتب رقم الصفحة أو اسم الشاشة، ثم قل: موافق، عدل، أو ادمجها مع شاشة أخرى.', 'blue'),
      miniCard('القاعدة', 'كل تصميم هنا يحافظ على الحسابات: الرصيد، الدين، التوفير، الالتزامات، والأرشيف.', 'orange'),
      miniCard('الأولوية', 'الشاشات التي تظهر أول مرة، الحساب، الإدخال، المتابعات، التقارير، والتنبيهات.', 'red'),
    ]),
    notes: [
      'كل صفحة مصممة كصورة قرار: الفكرة، الشاشة، وما الذي سيبقى ثابتاً منطقياً.',
      'إذا وافقت، أطبقها على التطبيق واحدة واحدة مع اختبارات.'
    ],
    vote: 'قرار عام: موافق على الاتجاه؟',
  }),
  page({
    kicker: '01',
    title: 'الترحيب أول مرة',
    subtitle: 'اختصار الواجهات الكثيرة، مع تسجيل الدخول ونوع الحساب من البداية.',
    phones: screenGrid([
      phone({
        title: 'مرحبا بك في MYFI',
        tone: 'blue',
        meta: '✦',
        rows: [
          { label: 'الخطوة', value: '1 من 3', detail: 'بدون شرح طويل' },
          { label: 'نوع الاستخدام', value: 'شخصي', strong: true },
          { label: 'الحساب', value: 'تسجيل دخول أو تجربة كضيف' },
        ],
        chips: [{ label: 'شخصي', on: true }, { label: 'عمل' }, { label: 'شخصي + عمل' }],
        notice: 'كل شيء قابل للتغيير لاحقاً من الإعدادات.',
        footer: 'متابعة',
      }),
      phone({
        title: 'تسجيل الدخول',
        tone: 'green',
        meta: '↗',
        rows: [
          { label: 'البريد', value: 'user@email.com' },
          { label: 'كلمة المرور', value: '••••••••' },
          { label: 'رسالة الخطأ', value: 'تظهر فقط عند فشل حقيقي', strong: true },
        ],
        chips: [{ label: 'دخول', on: true }, { label: 'إنشاء حساب' }],
        notice: 'لا تظهر رسالة invalid credentials بعد نجاح الدخول.',
        footer: 'دخول',
      }),
      phone({
        title: 'دليل سريع',
        tone: 'orange',
        meta: '?',
        rows: [
          { label: 'ما هي المحفظة؟', value: 'مكان المال' },
          { label: 'ما هي المتابعة؟', value: 'دين، توفير، أو التزام' },
          { label: 'ما هو الأرشيف؟', value: 'سنوات قديمة محفوظة' },
        ],
        notice: 'الدليل يظهر أول مرة ويبقى متاحاً من الإعدادات.',
        footer: 'فهمت',
      }),
    ]),
    notes: ['نقطة التصويت: هل تريدها 3 خطوات كما هنا، أو خطوتين فقط؟'],
  }),
  page({
    kicker: '02',
    title: 'الحساب والإعدادات',
    subtitle: 'الحساب يصبح شاشة واضحة ومستقلة، مع اسم ويوزر نيم فريد للربط بالغرف مستقبلاً.',
    phones: screenGrid([
      phone({
        title: 'حسابي',
        tone: 'blue',
        meta: '@',
        rows: [
          { label: 'الاسم', value: 'Hussein', strong: true },
          { label: 'اليوزر نيم', value: '@hussein_myfi' },
          { label: 'البريد', value: 'user@email.com' },
          { label: 'المزامنة', value: 'آخر تحديث الآن' },
        ],
        notice: 'اليوزر نيم فريد، ويستخدم لاحقاً للغرف والمشاركة.',
        footer: 'حفظ الحساب',
      }),
      phone({
        title: 'قائمة الحساب',
        tone: 'green',
        meta: '☰',
        rows: [
          { label: 'الملف الشخصي', value: 'اسم، صورة، يوزر نيم' },
          { label: 'الأمان', value: 'كلمة مرور، استعادة، تشفير' },
          { label: 'المزامنة', value: 'النسخ السحابي والحالة' },
          { label: 'الخطة المستقبلية', value: 'مجاني الآن، دفع لاحقاً' },
        ],
        footer: 'إدارة',
      }),
      phone({
        title: 'إعادة كلمة المرور',
        tone: 'orange',
        meta: '⌁',
        rows: [
          { label: 'كلمة جديدة', value: '••••••••' },
          { label: 'إظهار النص', value: 'زر عين داخل الحقل' },
          { label: 'التطابق', value: 'الكلمتان متطابقتان', strong: true },
        ],
        notice: 'الواجهة تخبرك فوراً إذا الكلمتان غير متطابقتين.',
        footer: 'تحديث',
      }),
    ]),
    notes: ['نقطة التصويت: هل شاشة الحساب تكون تبويب كامل، أم تفتح من زر الحساب بالأعلى؟'],
  }),
  page({
    kicker: '03',
    title: 'الإدخال السريع في الرئيسية',
    subtitle: 'كل زر يفتح شاشة مخصصة، وليس شاشة كلاسيكية فيها تبديل داخلي.',
    phones: screenGrid([
      phone({
        title: 'إدخال صرف',
        tone: 'red',
        meta: '↓',
        rows: [
          { label: 'المبلغ', value: '25,000 د.ع', big: true, strong: true },
          { label: 'العنوان', value: 'مطعم' },
          { label: 'المحفظة', value: 'الكاش' },
          { label: 'تصنيف الصرف', value: 'طعام' },
          { label: 'التاريخ والتكرار', value: 'اليوم - غير مكرر' },
        ],
        footer: 'حفظ الصرف',
      }),
      phone({
        title: 'إدخال دخل',
        tone: 'green',
        meta: '↑',
        rows: [
          { label: 'المبلغ', value: '1,500,000 د.ع', big: true, strong: true },
          { label: 'العنوان', value: 'راتب' },
          { label: 'المحفظة', value: 'الحساب البنكي' },
          { label: 'تصنيف الدخل', value: 'راتب' },
          { label: 'التاريخ والتكرار', value: 'آب 2026 - شهري' },
        ],
        footer: 'حفظ الدخل',
      }),
      phone({
        title: 'إدخال ذكي',
        tone: 'orange',
        meta: '✦',
        rows: [
          { label: 'المصدر', value: 'كاميرا، صورة، صوت' },
          { label: 'الحالة', value: 'تحليل ثم تعبئة الحقول' },
          { label: 'بعد التحليل', value: 'المستخدم يراجع قبل الحفظ', strong: true },
        ],
        chips: [{ label: 'كاميرا', on: true }, { label: 'صورة' }, { label: 'صوت' }],
        footer: 'تحليل',
      }),
    ]),
    notes: ['كل الحقول بنفس الحجم والنمط: تاريخ، تكرار، تصنيف، محفظة.'],
  }),
  page({
    kicker: '04',
    title: 'إنشاء المتابعات - التصميم المعتمد',
    subtitle: 'التصميم الذي وافقت عليه: شاشات منفصلة للدين والتوفير والالتزام، مع الحسابات مضبوطة.',
    phones: screenGrid([
      phone({
        title: 'دين عليّ',
        tone: 'red',
        meta: '↓',
        rows: [
          { label: 'اسم الدين', value: 'قسط سيارة' },
          { label: 'إجمالي الدين', value: '2,500,000 د.ع', big: true, strong: true },
          { label: 'أثر الرصيد', value: 'دين قديم - لا يغير الرصيد' },
          { label: 'تاريخ البداية', value: '10 آب 2026' },
        ],
        chips: [{ label: 'دين قديم', on: true }, { label: 'استلمت المبلغ' }],
        notice: 'إذا اخترت استلمت المبلغ، تظهر محفظة التأثير ويزيد رصيدها.',
        footer: 'حفظ الدين',
      }),
      phone({
        title: 'دين لي',
        tone: 'green',
        meta: '↑',
        rows: [
          { label: 'اسم الدين', value: 'دين لصديق' },
          { label: 'المبلغ المطلوب', value: '750,000 د.ع', big: true, strong: true },
          { label: 'أثر الرصيد', value: 'أعطيت المبلغ - ينقص الرصيد' },
          { label: 'محفظة التأثير', value: 'الكاش' },
        ],
        chips: [{ label: 'دين قديم' }, { label: 'أعطيت المبلغ', on: true }],
        footer: 'حفظ الدين',
      }),
      phone({
        title: 'توفير',
        tone: 'blue',
        meta: '⚑',
        rows: [
          { label: 'اسم التوفير', value: 'سفر' },
          { label: 'المبلغ المطلوب', value: '3,000,000 د.ع', big: true, strong: true },
          { label: 'طريقة التوفير', value: 'الحجز يبدأ عند إضافة مبلغ توفير' },
          { label: 'التزام شهري مرتبط', value: 'اختياري' },
        ],
        footer: 'حفظ التوفير',
      }),
      phone({
        title: 'التزام',
        tone: 'orange',
        meta: '◷',
        rows: [
          { label: 'اسم الالتزام', value: 'إيجار' },
          { label: 'مبلغ الالتزام', value: '450,000 د.ع', big: true, strong: true },
          { label: 'شهر البدء', value: 'آب 2026' },
          { label: 'المحفظة والتصنيف', value: 'الكاش - سكن' },
        ],
        chips: [{ label: 'شهري', on: true }, { label: 'مرة واحدة' }],
        footer: 'حفظ الالتزام',
      }),
    ]),
    notes: ['ثابت حسابياً: دين قديم لا ينشئ حركة، دين عليّ مستلم يزيد الرصيد، دين لي مدفوع ينقص الرصيد.'],
  }),
  page({
    kicker: '05',
    title: 'المتابعات بعد الإنشاء',
    subtitle: 'رجوع ملخصات الدين والتوفير والالتزامات، مع تعديل المتابعات فوق الكيبورد.',
    phones: screenGrid([
      phone({
        title: 'المتابعات',
        tone: 'blue',
        meta: '☷',
        rows: [
          { label: 'دين عليّ', value: '2,500,000 د.ع' },
          { label: 'دين لي', value: '750,000 د.ع' },
          { label: 'المتبقي للتوفير', value: '3,000,000 د.ع' },
          { label: 'الالتزامات', value: '450,000 د.ع' },
        ],
        notice: 'ملخصات أعلى القائمة، بدون زحمة ولا تكرار.',
        footer: 'تصفية',
      }),
      phone({
        title: 'تعديل متابعة',
        tone: 'green',
        meta: '✎',
        rows: [
          { label: 'الاسم', value: 'قسط سيارة' },
          { label: 'المبلغ', value: '2,500,000 د.ع', big: true },
          { label: 'التاريخ', value: 'آب 2026' },
        ],
        notice: 'الشاشة ترتفع فوق الكيبورد عند الكتابة.',
        footer: 'حفظ التعديل',
      }),
      phone({
        title: 'سجل الدفعات',
        tone: 'orange',
        meta: '≡',
        rows: [
          { label: 'إظهار السجل', value: 'زر واضح داخل البطاقة' },
          { label: 'تحديد متعدد', value: 'حذف دفعات محددة' },
          { label: 'الأرشفة', value: 'المنتهي يبقى 7 أيام للمراجعة' },
        ],
        footer: 'إدارة',
      }),
    ]),
    notes: ['زر الرجوع في الأرشيف يرجع من واجهة الأرشيف ولا يخرج من البرنامج.'],
  }),
  page({
    kicker: '06',
    title: 'التقارير',
    subtitle: 'حذف حد الإنفاق الشهري، توسيع مخطط المقارنة، وإصلاح الأشهر العربية.',
    phones: screenGrid([
      phone({
        title: 'التقارير',
        tone: 'blue',
        meta: '↗',
        rows: [
          { label: 'الكروت الظاهرة', value: 'الدخل، الصرف، الرصيد' },
          { label: 'المحذوف', value: 'كارت حد الإنفاق الشهري' },
          { label: 'الرصيد المرحل', value: 'إعادة تسمية أو إخفاء إذا غير واضح' },
        ],
        footer: 'عرض',
      }),
      phone({
        title: 'مخطط المقارنة',
        tone: 'green',
        meta: '▥',
        rows: [
          { label: 'الوضع', value: 'شهري أو سنوي' },
          { label: 'التوسيع', value: 'فتح المخطط بحجم أكبر' },
          { label: 'الأشهر', value: 'عربي، English، أرقام' },
        ],
        notice: 'النص العربي داخل الرسم لا يظهر بحروف منفصلة.',
        footer: 'تكبير',
      }),
      phone({
        title: 'إعداد الأشهر',
        tone: 'orange',
        meta: '12',
        rows: [
          { label: 'النظام', value: 'أرقام' },
          { label: 'بدائل', value: 'عربي - English' },
          { label: 'التأثير', value: 'كل البرنامج' },
        ],
        chips: [{ label: 'أرقام', on: true }, { label: 'عربي' }, { label: 'English' }],
        footer: 'حفظ',
      }),
    ]),
  }),
  page({
    kicker: '07',
    title: 'الأمان والتشفير',
    subtitle: 'إظهار كلمة المرور، تطابق الكلمات، ورفع شاشة التشفير فوق الكيبورد.',
    phones: screenGrid([
      phone({
        title: 'تشفير البيانات',
        tone: 'blue',
        meta: '⌁',
        rows: [
          { label: 'كلمة المرور', value: '••••••••' },
          { label: 'إظهار النص', value: 'زر عين داخل الحقل' },
          { label: 'قوة الكلمة', value: 'متوسطة' },
        ],
        notice: 'الشارة لا تختفي تحت الكيبورد.',
        footer: 'تفعيل',
      }),
      phone({
        title: 'استعادة كلمة المرور',
        tone: 'green',
        meta: '✓',
        rows: [
          { label: 'كلمة جديدة', value: '••••••••' },
          { label: 'تأكيد الكلمة', value: '••••••••' },
          { label: 'التطابق', value: 'متطابقتان' },
        ],
        footer: 'تحديث',
      }),
      phone({
        title: 'رسائل الدخول',
        tone: 'red',
        meta: '!',
        rows: [
          { label: 'كلمة مرور خطأ', value: 'تظهر رسالة خطأ واضحة' },
          { label: 'دخول ناجح', value: 'لا تظهر invalid credentials' },
          { label: 'الرابط', value: 'رسالة مفهومة عند انتهاء الصلاحية' },
        ],
        footer: 'موافق',
      }),
    ]),
  }),
  page({
    kicker: '08',
    title: 'الأرشيف والدمج',
    subtitle: 'زر الرجوع والسلوك بعد دمج بيانات الضيف مع الحساب.',
    phones: screenGrid([
      phone({
        title: 'الأرشيف',
        tone: 'blue',
        meta: '↩',
        rows: [
          { label: 'زر الهاتف رجوع', value: 'يغلق الأرشيف فقط' },
          { label: 'لا يحدث', value: 'لا يخرج من البرنامج' },
          { label: 'الأعوام', value: 'قائمة واضحة للأرشيف' },
        ],
        footer: 'رجوع',
      }),
      phone({
        title: 'مراجعة الدمج',
        tone: 'orange',
        meta: '30',
        rows: [
          { label: 'بعد الدمج', value: 'انتظار 30 ثانية' },
          { label: 'المستخدم', value: 'يراجع السجل والمحافظ أولاً' },
          { label: 'التنبيه', value: 'رجوع أو إبقاء التغييرات' },
        ],
        notice: 'لا تقاطع المستخدم فوراً بعد الدمج.',
        footer: 'إبقاء التغييرات',
      }),
      phone({
        title: 'منع التكرار',
        tone: 'green',
        meta: '≠',
        rows: [
          { label: 'المختلف', value: 'يضاف' },
          { label: 'المكرر', value: 'يدمج بدون تكرار' },
          { label: 'نقطة رجوع', value: 'محفوظة قبل التنفيذ' },
        ],
        footer: 'تم',
      }),
    ]),
  }),
  page({
    kicker: '09',
    title: 'الدليل والمصطلحات',
    subtitle: 'دليل مستخدم بسيط داخل التطبيق لشرح أول استخدام ومصطلحات البرنامج.',
    phones: screenGrid([
      phone({
        title: 'دليل الاستخدام',
        tone: 'blue',
        meta: '?',
        rows: [
          { label: 'أول مرة', value: 'كيف أضيف محفظة وحركة' },
          { label: 'المتابعات', value: 'دين، توفير، التزام' },
          { label: 'التقارير', value: 'ماذا تعني الأرقام' },
        ],
        footer: 'ابدأ',
      }),
      phone({
        title: 'مصطلحات',
        tone: 'green',
        meta: 'أ',
        rows: [
          { label: 'المحفظة', value: 'مكان المال' },
          { label: 'الرصيد المتاح', value: 'المتاح للصرف بعد الحجز' },
          { label: 'التوفير', value: 'هدف يحجز مبلغاً عند الإضافة' },
          { label: 'الأرشيف', value: 'سنوات قديمة محفوظة' },
        ],
        footer: 'فهمت',
      }),
      phone({
        title: 'مساعدة داخل الشاشة',
        tone: 'orange',
        meta: 'i',
        rows: [
          { label: 'أين تظهر؟', value: 'علامة صغيرة بجانب المصطلح' },
          { label: 'الشرح', value: 'سطرين فقط' },
          { label: 'لا تزعج', value: 'تظهر عند الضغط فقط' },
        ],
        footer: 'إغلاق',
      }),
    ]),
  }),
  page({
    kicker: '10',
    title: 'الخطة المستقبلية بدون تعارض',
    subtitle: 'النشر الأول مجاني كنسخة 1، والدفع والذكاء الاصطناعي والغرف تأتي لاحقاً كتحديثات كبيرة.',
    phones: screenGrid([
      phone({
        title: 'نسخة 1',
        tone: 'green',
        meta: '1',
        rows: [
          { label: 'الوضع', value: 'اختبار على الهاتف ثم نشر' },
          { label: 'السعر', value: 'مجاني الآن' },
          { label: 'الهدف', value: 'استقرار وتجربة واضحة' },
        ],
        footer: 'جاهز للاختبار',
      }),
      phone({
        title: 'ميزات مدفوعة لاحقاً',
        tone: 'blue',
        meta: '$',
        rows: [
          { label: 'مدة الاشتراك', value: 'أشهر محددة' },
          { label: 'فتح ميزات', value: 'غرف، مزامنة متقدمة، AI' },
          { label: 'التعارض', value: 'لا، إذا تركنا البنية جاهزة' },
        ],
        footer: 'لاحقاً',
      }),
      phone({
        title: 'ذكاء اصطناعي',
        tone: 'orange',
        meta: 'AI',
        rows: [
          { label: 'الخيار القريب', value: 'خدمة سحابية بحدود مجانية' },
          { label: 'داخل الجهاز', value: 'خفيف جداً للمهام البسيطة فقط' },
          { label: 'التطبيق الآن', value: 'يبقى صالحاً بدون AI' },
        ],
        footer: 'مستقبلاً',
      }),
    ]),
    notes: ['هذه الصفحة للتأكد أن إصلاحات اليوم لا تعارض الدفع والميزات الكبيرة لاحقاً.'],
  }),
];

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>MYFI Design Preview</title>
  <style>
    @font-face { font-family: CairoLocal; src: url("${fontUrl}") format("truetype"); }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e8edf5;
      color: #15202b;
      font-family: CairoLocal, "Segoe UI", Tahoma, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .page {
      width: 297mm;
      height: 210mm;
      overflow: hidden;
      padding: 10mm 12mm;
      page-break-after: always;
      break-after: page;
      break-inside: avoid;
      background: #f4f6fb;
      display: flex;
      flex-direction: column;
      gap: 6mm;
    }
    .page:last-child { page-break-after: auto; }
    header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12mm;
      border-bottom: 1px solid #d8e0ec;
      padding-bottom: 4mm;
    }
    h1, h3, p { margin: 0; }
    h1 { font-size: 23px; line-height: 1.35; font-weight: 900; }
    header p { margin-top: 2mm; color: #657084; font-size: 12px; line-height: 1.65; max-width: 170mm; }
    .kicker {
      display: inline-block;
      color: #5478d8;
      font-size: 11px;
      font-weight: 900;
      margin-bottom: 2mm;
    }
    .vote {
      min-width: 48mm;
      min-height: 18mm;
      border: 1px solid #cfd8e6;
      border-radius: 5mm;
      background: white;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3mm;
      color: #2e3a4d;
      font-size: 12px;
      font-weight: 900;
      text-align: center;
    }
    main { flex: 1; }
    aside {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4mm;
    }
    aside p {
      background: #ffffff;
      border: 1px solid #d8e0ec;
      border-radius: 4mm;
      padding: 3mm 4mm;
      color: #566275;
      font-size: 10.5px;
      line-height: 1.65;
    }
    .screen-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 4mm;
      align-items: stretch;
    }
    .screen-grid:has(.mini-card) {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .phone {
      min-height: 116mm;
      border-radius: 9mm;
      padding: 2.5mm;
      background: #dfe6f0;
      display: flex;
      align-items: flex-end;
      border: 1px solid #cfd8e6;
    }
    .phone.compact { min-height: 106mm; }
    .sheet {
      width: 100%;
      min-height: 107mm;
      background: #ffffff;
      border: 1px solid #d5deeb;
      border-radius: 8mm;
      padding: 3mm;
      box-shadow: 0 6mm 18mm rgba(22, 32, 47, 0.13);
    }
    .handle {
      width: 14mm;
      height: 1.4mm;
      background: #d5deeb;
      border-radius: 99px;
      margin: 0 auto 4mm;
    }
    .phone-head {
      display: flex;
      align-items: center;
      gap: 3mm;
      border-radius: 5mm;
      padding: 3mm;
      border: 1px solid transparent;
      margin-bottom: 3mm;
    }
    .phone-icon {
      width: 11mm;
      height: 11mm;
      border-radius: 4mm;
      color: white;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 900;
      flex: 0 0 auto;
    }
    .icon { direction: ltr; unicode-bidi: isolate; }
    .phone-head h3 { font-size: 13px; line-height: 1.35; font-weight: 900; }
    .phone-head p { font-size: 10px; color: #5c6880; line-height: 1.3; font-weight: 800; margin-top: 1mm; }
    .field {
      min-height: 12.5mm;
      background: #f1f4fa;
      border: 1px solid #d8e0ec;
      border-radius: 4mm;
      padding: 1.8mm 2.5mm;
      margin-bottom: 1.7mm;
      overflow: hidden;
    }
    .field.big { min-height: 16mm; }
    .field span {
      display: block;
      color: #657084;
      font-size: 9.5px;
      line-height: 1.35;
      font-weight: 800;
      margin-bottom: 1mm;
    }
    .field strong {
      display: block;
      color: #15202b;
      font-size: 12px;
      line-height: 1.45;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .field.big strong { font-size: 17px; line-height: 1.3; }
    .field small {
      display: block;
      color: #7a8496;
      font-size: 8.5px;
      line-height: 1.35;
      margin-top: 0.8mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chips {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2mm;
      margin: 2mm 0;
    }
    .chips b {
      min-height: 9.5mm;
      border-radius: 4mm;
      display: grid;
      place-items: center;
      background: #f1f4fa;
      border: 1px solid #d8e0ec;
      color: #657084;
      font-size: 9.5px;
      text-align: center;
      padding: 1.5mm;
      font-weight: 900;
    }
    .notice {
      border-radius: 4mm;
      padding: 2.4mm 3mm;
      font-size: 9.5px;
      line-height: 1.55;
      font-weight: 800;
      margin-top: 2mm;
      min-height: 10mm;
    }
    .phone-actions {
      display: grid;
      grid-template-columns: 14mm 1fr;
      gap: 2mm;
      margin-top: 2mm;
    }
    button {
      border: 0;
      min-height: 12mm;
      border-radius: 4mm;
      background: #f1f4fa;
      color: #657084;
      font-family: inherit;
      font-size: 10px;
      font-weight: 900;
    }
    button.blue, button.green, button.orange, button.red { color: white; }
    .blue .phone-icon, button.blue, .chips b.blue { background: #5478d8; }
    .green .phone-icon, button.green, .chips b.green { background: #2fa66f; }
    .orange .phone-icon, button.orange, .chips b.orange { background: #d89233; }
    .red .phone-icon, button.red, .chips b.red { background: #df5b55; }
    .phone-head.blue, .notice.blue { background: rgba(84,120,216,0.12); border-color: rgba(84,120,216,0.28); color: #3159b9; }
    .phone-head.green, .notice.green { background: rgba(47,166,111,0.12); border-color: rgba(47,166,111,0.28); color: #1f7f52; }
    .phone-head.orange, .notice.orange { background: rgba(216,146,51,0.13); border-color: rgba(216,146,51,0.30); color: #9b641d; }
    .phone-head.red, .notice.red { background: rgba(223,91,85,0.12); border-color: rgba(223,91,85,0.30); color: #b3403c; }
    .mini-card {
      min-height: 64mm;
      background: #ffffff;
      border: 1px solid #d8e0ec;
      border-radius: 7mm;
      padding: 7mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 4mm;
    }
    .mini-card h3 { font-size: 17px; line-height: 1.35; font-weight: 900; }
    .mini-card p { font-size: 12px; line-height: 1.75; color: #5e6a7d; font-weight: 700; }
    .mini-card.blue { border-top: 4mm solid #5478d8; }
    .mini-card.green { border-top: 4mm solid #2fa66f; }
    .mini-card.orange { border-top: 4mm solid #d89233; }
    .mini-card.red { border-top: 4mm solid #df5b55; }
    @page { size: A4 landscape; margin: 0; }
  </style>
</head>
<body>
${pages.join('\n')}
</body>
</html>`;

fs.writeFileSync(htmlPath, html, 'utf8');

(async () => {
  const localChrome = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find((candidate) => fs.existsSync(candidate));
  const browser = await chromium.launch({
    headless: true,
    ...(localChrome ? { executablePath: localChrome } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1403, height: 992 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
  await page.screenshot({ path: previewPngPath, fullPage: false });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '0', right: '0', bottom: '0', left: '0' },
  });
  await browser.close();
  console.log(JSON.stringify({ htmlPath, pdfPath, previewPngPath }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
