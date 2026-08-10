const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const outDir = path.resolve(__dirname, '..', 'output', 'pdf');
fs.mkdirSync(outDir, { recursive: true });

const htmlPath = path.join(outDir, 'myfi-current-ui-fixes-preview.html');
const pdfPath = path.join(outDir, 'myfi-current-ui-fixes-preview.pdf');
const coverPath = path.join(outDir, 'myfi-current-ui-fixes-preview-cover.png');

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const executablePath = chromeCandidates.find(item => fs.existsSync(item));

const money = value => `${value} د.ع`;

const field = (label, value, meta = '') => `
  <div class="field">
    <span>${label}</span>
    <strong>${value}</strong>
    ${meta ? `<small>${meta}</small>` : ''}
  </div>
`;

const chip = (label, active = false, tone = 'green') => `<b class="${active ? `active ${tone}` : ''}">${label}</b>`;

const metric = (label, value, tone = 'green') => `
  <div class="metric ${tone}">
    <span>${label}</span>
    <strong>${value}</strong>
  </div>
`;

const listRow = (title, value, tone = 'plain') => `
  <div class="list-row ${tone}">
    <span>${title}</span>
    <strong>${value}</strong>
  </div>
`;

const nav = active => {
  const items = [
    ['الرئيسية', 'home'],
    ['المتابعات', 'trackers'],
    ['التقارير', 'reports'],
    ['الإعدادات', 'settings'],
  ];
  return `<div class="nav">${items.map(([label, key]) => `<span class="${active === key ? 'on' : ''}">${label}</span>`).join('')}</div>`;
};

const phone = ({ title, subtitle, tone = 'green', active = 'home', children, footer = '' }) => `
  <section class="phone">
    <div class="status"></div>
    <div class="phone-scroll">
      <div class="app-head ${tone}">
        <div>
          <h3>${title}</h3>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        <i>${tone === 'red' ? '!' : tone === 'blue' ? '@' : tone === 'amber' ? '?' : '✓'}</i>
      </div>
      ${children}
    </div>
    ${footer || nav(active)}
  </section>
`;

const sheet = ({ title, subtitle, tone = 'green', children, primary = 'حفظ', secondary = 'رجوع' }) => `
  <section class="phone sheet-phone">
    <div class="status"></div>
    <div class="sheet">
      <div class="handle"></div>
      <div class="app-head ${tone}">
        <div>
          <h3>${title}</h3>
          ${subtitle ? `<p>${subtitle}</p>` : ''}
        </div>
        <i>${tone === 'red' ? '↓' : tone === 'blue' ? '+' : tone === 'amber' ? 'AI' : '↑'}</i>
      </div>
      ${children}
      <div class="actions">
        <button class="secondary">${secondary}</button>
        <button class="${tone}">${primary}</button>
      </div>
    </div>
  </section>
`;

const page = (num, title, subtitle, body, note = '') => `
  <article class="page">
    <header>
      <div class="vote">أوافق / أحتاج تعديل</div>
      <div>
        <span class="num">${String(num).padStart(2, '0')}</span>
        <h1>${title}</h1>
        <p>${subtitle}</p>
      </div>
    </header>
    <main>${body}</main>
    ${note ? `<footer>${note}</footer>` : ''}
  </article>
`;

const pages = [];

pages.push(page(
  0,
  'MYFI - معاينة بنفس تصميم التطبيق الحالي',
  'هذه ليست واجهة جديدة؛ هي نفس لغة MYFI الحالية مع التعديلات التي جمعتها منك حتى نصوّت عليها قبل التنفيذ.',
  `<div class="cover-grid">
    <div class="cover-card green"><h2>نفس الستايل</h2><p>أخضر MYFI، كروت بيضاء، خلفية فاتحة، حقول موحدة، وشريط تنقل سفلي مثل التطبيق.</p></div>
    <div class="cover-card red"><h2>الملاحظات</h2><p>أصلحنا ازدواج التصنيفات، رسائل الدخول، الحساب، المتابعات، التقارير، الأرشيف، التشفير، والدمج.</p></div>
    <div class="cover-card amber"><h2>طريقة التصويت</h2><p>اكتب رقم الصفحة أو اسم الشاشة: موافق، عدّل، أو ادمجها مع شاشة ثانية.</p></div>
    <div class="cover-card blue"><h2>قبل البرمجة</h2><p>بعد موافقتك نطبق التصميم داخل التطبيق الحقيقي، ثم نبني نسخة اختبار جديدة على الهاتف.</p></div>
  </div>`,
  'الهدف: لا نغير هوية البرنامج، فقط ننظف التجربة ونرتب الشاشات.'
));

pages.push(page(
  1,
  'الترحيب أول مرة',
  'نختصر الواجهات الكثيرة، ونضيف تسجيل الدخول ونوع الحساب من البداية بدون إجبار.',
  `<div class="phones three">
    ${phone({ title: 'أهلاً بك في MYFI', subtitle: 'إعداد سريع من 3 خطوات', tone: 'green', children: `
      ${field('نوع الحساب', 'شخصي', 'شخصي / عمل / شخصي + عمل')}
      <div class="chips">${chip('شخصي', true)}${chip('عمل')}${chip('مزدوج')}</div>
      ${field('الدولة والعملة', 'العراق · IQD')}
      ${field('الشهر واللغة', 'عربي · أرقام', 'قابل للتغيير لاحقاً')}
    `, footer: '<div class="actions"><button class="secondary">تخطي</button><button class="green">التالي</button></div>' })}
    ${phone({ title: 'الحساب اختياري', subtitle: 'المزامنة والنسخ لاحقاً', tone: 'blue', children: `
      ${field('الاسم', 'Hussein')}
      ${field('اليوزر نيم', 'hussein_myfi', 'فريد للربط بالغرف مستقبلاً')}
      ${field('الدخول', 'بريد + كلمة مرور')}
      <div class="notice">يمكن استخدام التطبيق محلياً الآن، وتفعيل الحساب متى ما تريد.</div>
    `, footer: '<div class="actions"><button class="secondary">محلياً</button><button class="blue">دخول</button></div>' })}
    ${phone({ title: 'دليل سريع', subtitle: 'صفحة واحدة بدل الشرح الطويل', tone: 'amber', children: `
      ${listRow('المحفظة', 'مكان المال')}
      ${listRow('المتابعة', 'دين / توفير / التزام')}
      ${listRow('الرصيد المتاح', 'الذي يمكن صرفه')}
      ${listRow('المحجوز', 'توفير محفوظ')}
      <div class="notice amber">الدليل يبقى متاحاً من الإعدادات.</div>
    `, footer: '<div class="actions"><button class="secondary">رجوع</button><button class="amber">ابدأ</button></div>' })}
  </div>`,
  'ملاحظة ناقصة أضيفت: نوع الحساب وتسجيل الدخول يظهران في البداية، لكن بدون منع الاستخدام المجاني المحلي.'
));

pages.push(page(
  2,
  'الحساب والإعدادات',
  'الحساب يصبح شاشة واضحة مستقلة، وقائمة الحسابات تصير احترافية مع اسم ويوزر نيم فريد.',
  `<div class="phones three">
    ${phone({ title: 'الإعدادات', subtitle: 'الحساب ليس مخفي داخل قائمة', active: 'settings', tone: 'green', children: `
      ${listRow('حسابي', 'Hussein · متصل', 'green')}
      ${listRow('عام', 'لغة، مظهر، عملة')}
      ${listRow('الشهور', 'عربي / English / أرقام', 'amber')}
      ${listRow('الأمان', 'قفل، تشفير، استعادة')}
      ${listRow('دليل المستخدم', 'مصطلحات وشرح الاستخدام', 'blue')}
    ` })}
    ${phone({ title: 'حسابي', subtitle: 'هوية واضحة للغرف لاحقاً', active: 'settings', tone: 'blue', children: `
      ${field('الاسم', 'Hussein')}
      ${field('اليوزر نيم', 'hussein_myfi', 'فريد ولا يتكرر')}
      ${field('البريد', 'user@email.com')}
      ${field('الحالة', 'متصل · آخر مزامنة الآن')}
      <div class="notice blue">اليوزر نيم يستخدم للغرف والمشاركة لاحقاً.</div>
    ` })}
    ${phone({ title: 'تسجيل الدخول', subtitle: 'رسائل صحيحة وواضحة', active: 'settings', tone: 'red', children: `
      ${field('البريد', 'user@email.com')}
      ${field('كلمة المرور', '••••••••', 'زر إظهار داخل الحقل')}
      ${field('النتيجة', 'تظهر رسالة الخطأ فقط عند فشل حقيقي')}
      <div class="notice red">لا تظهر invalid login credentials بعد نجاح الدخول.</div>
    ` })}
  </div>`,
  'هنا أضفت أيضاً شاشة إعادة كلمة المرور: إظهار كلمة المرور، وتأكيد تطابق الكلمتين لحظياً.'
));

pages.push(page(
  3,
  'الرئيسية والإدخال السريع',
  'تبقى الرئيسية بنفس شكلها الحالي، لكن كل زر يفتح شاشة مخصصة وليس نفس نافذة الكلاسيك.',
  `<div class="phones three">
    ${phone({ title: 'نظرة عامة', subtitle: 'الرئيسية الحالية بعد التنظيف', active: 'home', tone: 'green', children: `
      <div class="hero">
        <span>الرصيد المتاح</span>
        <strong>${money('1,850,000')}</strong>
        <small>الكاش + المصرفي - المحجوز للتوفير</small>
      </div>
      <div class="metric-grid">
        ${metric('الدخل', '+1,500,000', 'green')}
        ${metric('الصرف', '-250,000', 'red')}
        ${metric('الصافي', '+1,250,000', 'blue')}
        ${metric('المتابعات', '4 نشطة', 'amber')}
      </div>
      <div class="quick-grid">
        <b class="red">صرف</b><b class="green">دخل</b><b class="blue">تحويل</b><b class="amber">ذكي</b>
      </div>
    ` })}
    ${sheet({ title: 'إدخال صرف', subtitle: 'شاشة مخصصة للصرف', tone: 'red', primary: 'حفظ الصرف', children: `
      ${field('المبلغ', '25,000 د.ع')}
      ${field('العنوان', 'مطعم')}
      ${field('التصنيف', 'طعام', 'بدون تكرار عنوان التصنيف فوق وتحت')}
      ${field('التاريخ والتكرار', 'اليوم · غير مكرر')}
      ${field('المحفظة', 'الكاش')}
    ` })}
    ${sheet({ title: 'إدخال دخل', subtitle: 'نفس حجم ونمط الحقول', tone: 'green', primary: 'حفظ الدخل', children: `
      ${field('المبلغ', '1,500,000 د.ع')}
      ${field('العنوان', 'راتب')}
      ${field('التصنيف', 'راتب')}
      ${field('التاريخ والتكرار', 'آب 2026 · شهري')}
      ${field('المحفظة', 'الحساب البنكي')}
    ` })}
  </div>`,
  'التصنيف، التاريخ، التكرار، والمحفظة كلها بنفس النمط والحجم؛ لا يوجد تكرار لعبارة تصنيف الصرف/الدخل.'
));

pages.push(page(
  4,
  'شاشة الإدخال الذكي والتحويل',
  'الإدخال الذكي والتحويل لهما شاشة خاصة، مع مراجعة قبل الحفظ مثل ما طلبت.',
  `<div class="phones three">
    ${sheet({ title: 'إدخال ذكي', subtitle: 'كاميرا، صورة، صوت', tone: 'amber', primary: 'تحليل', children: `
      ${field('المصدر', 'كاميرا / صورة / صوت')}
      ${field('الحالة', 'تحليل ثم تعبئة الحقول')}
      ${field('قبل الحفظ', 'المستخدم يراجع البيانات')}
      <div class="chips">${chip('كاميرا', true, 'amber')}${chip('صورة')}${chip('صوت')}</div>
      <div class="notice amber">لا يتم الحفظ تلقائياً بعد التحليل.</div>
    ` })}
    ${sheet({ title: 'تحويل بين المحافظ', subtitle: 'شاشة مستقلة', tone: 'blue', primary: 'حفظ التحويل', children: `
      ${field('من محفظة', 'الكاش')}
      ${field('إلى محفظة', 'الحساب البنكي')}
      ${field('المبلغ', '100,000 د.ع')}
      ${field('التاريخ', 'اليوم')}
      <div class="notice blue">التحويل لا يظهر كمصروف أو دخل في التقارير.</div>
    ` })}
    ${phone({ title: 'تأكيد الحفظ', subtitle: 'تنبيه بسيط لا يقطع التجربة', tone: 'green', children: `
      ${field('الحركة', 'صرف · مطعم · 25,000')}
      ${field('الرصيد بعد الحفظ', '1,825,000 د.ع')}
      <div class="notice">تم الحفظ. يمكنك الرجوع للتعديل من سجل الحركات.</div>
    ` })}
  </div>`,
  'هذه تعالج طلبك: شاشات الإدخال السريع تختلف حسب الزر، وليست نافذة كلاسيكية واحدة.'
));

pages.push(page(
  5,
  'المتابعات كما كانت + ترتيب أفضل',
  'نعيد ملخصات الدين بنوعيه والتوفير والالتزامات، ونحافظ على الحسابات والمنطق.',
  `<div class="phones three">
    ${phone({ title: 'المتابعات', subtitle: 'الملخصات رجعت بالأعلى', active: 'trackers', tone: 'green', children: `
      <div class="metric-grid">
        ${metric('دين عليّ', '2,500,000', 'red')}
        ${metric('دين لي', '750,000', 'green')}
        ${metric('توفير', '3,000,000', 'blue')}
        ${metric('التزامات', '450,000', 'amber')}
      </div>
      <div class="tabs">${chip('الكل', true)}${chip('دين عليّ')}${chip('دين لي')}${chip('توفير')}</div>
      ${listRow('قسط سيارة', 'متبقي 2,500,000', 'red')}
      ${listRow('دين صديق', 'لي 750,000', 'green')}
      ${listRow('سفر', 'مدخر 1,200,000', 'blue')}
    ` })}
    ${phone({ title: 'دين عليّ', subtitle: 'الحساب واضح', active: 'trackers', tone: 'red', children: `
      ${field('إجمالي الدين', '2,500,000 د.ع')}
      ${field('المسدد', '0 د.ع')}
      ${field('المتبقي', '2,500,000 د.ع')}
      ${field('أثره على الرصيد', 'دين قديم لا يغير الرصيد')}
      <div class="notice red">تسجيل دفعة لاحقاً ينقص الرصيد.</div>
    ` })}
    ${phone({ title: 'دين لي', subtitle: 'تحصيل أو تسجيل قديم', active: 'trackers', tone: 'green', children: `
      ${field('المبلغ المطلوب', '750,000 د.ع')}
      ${field('المحصل', '0 د.ع')}
      ${field('المتبقي', '750,000 د.ع')}
      ${field('أثره على الرصيد', 'عند الاستلام يزيد الرصيد')}
      <div class="notice">الحسابات تبقى مضبوطة حسب نوع الحركة.</div>
    ` })}
  </div>`,
  'ثبتنا المنطق: دين قديم لا ينشئ حركة مالية، أما الدفع/الاستلام لاحقاً يحدث الرصيد.'
));

pages.push(page(
  6,
  'إنشاء المتابعات',
  'شاشات إنشاء دين، توفير، والتزام تصبح مرتبة مثل إدخال الصرف والدخل.',
  `<div class="phones four">
    ${sheet({ title: 'دين عليّ', subtitle: 'مدين لشخص', tone: 'red', primary: 'حفظ الدين', children: `
      ${field('اسم الدين', 'قسط سيارة')}
      ${field('إجمالي الدين', '2,500,000 د.ع')}
      ${field('نوع التسجيل', 'دين قديم / استلمت المبلغ')}
      ${field('التاريخ', '10 آب 2026')}
    ` })}
    ${sheet({ title: 'دين لي', subtitle: 'شخص مدين لك', tone: 'green', primary: 'حفظ الدين', children: `
      ${field('اسم الدين', 'دين صديق')}
      ${field('المبلغ المطلوب', '750,000 د.ع')}
      ${field('إذا أعطيت المبلغ الآن', 'ينقص من محفظتك')}
      ${field('المحفظة', 'الكاش')}
    ` })}
    ${sheet({ title: 'توفير', subtitle: 'هدف ومال محجوز', tone: 'blue', primary: 'حفظ التوفير', children: `
      ${field('اسم الهدف', 'سفر')}
      ${field('المبلغ المطلوب', '3,000,000 د.ع')}
      ${field('طريقة التوفير', 'يحجز عند إضافة مبلغ')}
      ${field('التزام شهري', 'اختياري')}
    ` })}
    ${sheet({ title: 'التزام', subtitle: 'إيجار، قسط، اشتراك', tone: 'amber', primary: 'حفظ الالتزام', children: `
      ${field('اسم الالتزام', 'إيجار')}
      ${field('المبلغ', '450,000 د.ع')}
      ${field('التكرار', 'شهري')}
      ${field('المحفظة والتصنيف', 'الكاش · سكن')}
    ` })}
  </div>`,
  'هذه هي الصفحة التي قلت عنها “طبقها حرفياً” لكن بأسلوب MYFI الحقيقي.'
));

pages.push(page(
  7,
  'تعديل المتابعات وسجل الدفعات',
  'كل شاشات التعديل ترتفع فوق الكيبورد ولا تبقى ثابتة تحت الإدخال.',
  `<div class="phones three">
    ${phone({ title: 'تفاصيل المتابعة', subtitle: 'كارت واضح + سجل', active: 'trackers', tone: 'blue', children: `
      ${field('سفر', '1,200,000 / 3,000,000')}
      <div class="progress"><span style="width:40%"></span></div>
      ${listRow('إضافة توفير', '+250,000', 'green')}
      ${listRow('سجل التوفير', '4 حركات', 'blue')}
      ${listRow('تعديل المتابعة', 'اسم، مبلغ، محفظة')}
    ` })}
    ${sheet({ title: 'تعديل المتابعة', subtitle: 'ترتفع فوق لوحة المفاتيح', tone: 'blue', primary: 'حفظ التعديل', children: `
      ${field('الاسم', 'سفر')}
      ${field('المبلغ المطلوب', '3,000,000 د.ع')}
      ${field('المحفظة', 'الكاش')}
      <div class="keyboard">لوحة المفاتيح تحت، والشاشة لا تختفي خلفها</div>
    ` })}
    ${phone({ title: 'سجل الحركات', subtitle: 'تعديل وحذف دفعة', active: 'trackers', tone: 'green', children: `
      ${listRow('10 آب', '+250,000', 'green')}
      ${listRow('3 آب', '+150,000', 'green')}
      ${listRow('25 تموز', '+300,000', 'green')}
      <div class="notice">تعديل أي دفعة يحدث الرصيد والمتبقي فوراً.</div>
    ` })}
  </div>`,
  'هذه تغطي الدين، التوفير، والالتزام: الإنشاء والتعديل والدفعات كلها بنفس قاعدة KeyboardAvoiding.'
));

pages.push(page(
  8,
  'التقارير',
  'حذف كارت حد الإنفاق الشهري، تبسيط الرصيد المرحل، وتكبير مخطط المقارنة.',
  `<div class="phones three">
    ${phone({ title: 'التقارير', subtitle: 'بدون كارت حد الإنفاق', active: 'reports', tone: 'green', children: `
      ${field('الفترة', 'آب 2026')}
      <div class="metric-grid">
        ${metric('الدخل', '+1,500,000', 'green')}
        ${metric('الصرف', '-250,000', 'red')}
        ${metric('الصافي', '+1,250,000', 'blue')}
        ${metric('رصيدك الآن', '1,850,000', 'green')}
      </div>
      ${listRow('المحذوف', 'حد الإنفاق الشهري', 'red')}
      ${listRow('المعاد تسميته', 'رصيد نهاية الفترة', 'blue')}
    ` })}
    ${phone({ title: 'مقارنة الأداء', subtitle: 'تكبير الرسم', active: 'reports', tone: 'blue', children: `
      <div class="chart">
        <b style="height:70%"></b><b class="red" style="height:42%"></b>
        <b style="height:82%"></b><b class="red" style="height:50%"></b>
        <b style="height:64%"></b><b class="red" style="height:37%"></b>
      </div>
      ${field('العرض', 'شهري أو سنوي')}
      ${field('الأشهر', 'عربي، English، أرقام')}
      <div class="notice blue">الحروف العربية داخل الرسم لا تظهر متقطعة.</div>
    ` })}
    ${phone({ title: 'إعداد الأشهر', subtitle: 'يؤثر على كل البرنامج', active: 'settings', tone: 'amber', children: `
      ${field('النظام الحالي', 'أرقام')}
      <div class="chips">${chip('أرقام', true, 'amber')}${chip('عربي')}${chip('English')}</div>
      ${field('التأثير', 'التقارير، الأرشيف، التاريخ')}
      ${field('مثال', '08 / آب / Aug')}
    ` })}
  </div>`,
  'بهذا نزيل الكارت غير الضروري ونحل مشكلة الأشهر العربية من الإعدادات.'
));

pages.push(page(
  9,
  'الأرشيف والدمج والتشفير',
  'زر رجوع الهاتف يغلق واجهة الأرشيف، والدمج لا يمنع المراجعة مباشرة.',
  `<div class="phones three">
    ${phone({ title: 'الأرشيف', subtitle: 'رجوع صحيح', active: 'settings', tone: 'blue', children: `
      ${field('زر رجوع الهاتف', 'يغلق الأرشيف فقط')}
      ${field('لا يحدث', 'لا يخرج من البرنامج')}
      ${field('زر داخل الشاشة', 'رجوع واضح في الأعلى')}
      ${listRow('ملف للقراءة فقط', 'archive_2025.myfi', 'blue')}
    ` })}
    ${phone({ title: 'مراجعة الدمج', subtitle: 'تنبيه متأخر', active: 'settings', tone: 'amber', children: `
      ${field('بعد الدمج', 'انتظار 30 - 60 ثانية')}
      ${field('الرسالة', 'تنبيه فقط مع رجوع')}
      ${field('الهدف', 'المستخدم يراجع التغييرات أولاً')}
      <div class="notice amber">زر “إلغاء التغييرات” يظهر بعد فرصة مراجعة.</div>
    ` })}
    ${phone({ title: 'التشفير', subtitle: 'كلمة مرور واضحة', active: 'settings', tone: 'green', children: `
      ${field('كلمة المرور', '••••••••', 'زر عين داخل الحقل')}
      ${field('التأكيد', 'متطابقتان', 'تظهر لحظياً')}
      ${field('القوة', 'جيدة', 'الشارة فوق الكيبورد')}
      <div class="keyboard">لا تغطي لوحة المفاتيح شارة القوة</div>
    ` })}
  </div>`,
  'أضفت أيضاً إصلاح شاشة كلمة المرور الجديدة: إظهار النص والتطابق قبل الحفظ.'
));

pages.push(page(
  10,
  'دليل المستخدم والمصطلحات',
  'صفحة بسيطة داخل الإعدادات تشرح الاستخدام أول مرة ومعاني كلمات البرنامج.',
  `<div class="phones three">
    ${phone({ title: 'دليل MYFI', subtitle: 'موجود في الإعدادات', active: 'settings', tone: 'green', children: `
      ${listRow('ابدأ بسرعة', 'محفظة، دخل، صرف')}
      ${listRow('المتابعات', 'دين، توفير، التزام')}
      ${listRow('التقارير', 'قراءة الدخل والصرف')}
      ${listRow('النسخ والأرشيف', 'حفظ واسترجاع')}
    ` })}
    ${phone({ title: 'المصطلحات', subtitle: 'شرح للمستخدم العادي', active: 'settings', tone: 'blue', children: `
      ${field('الرصيد الفعلي', 'كل المال داخل المحافظ')}
      ${field('الرصيد المتاح', 'ما يمكن صرفه الآن')}
      ${field('المحجوز للتوفير', 'مال محفوظ لهدف')}
      ${field('رصيد نهاية الفترة', 'تقدير نهاية الشهر/السنة')}
    ` })}
    ${phone({ title: 'مساعدة أول مرة', subtitle: 'تظهر عند الحاجة فقط', active: 'settings', tone: 'amber', children: `
      ${field('بعد أول دخول', 'دليل مختصر')}
      ${field('داخل الشاشة', 'تلميحات صغيرة')}
      ${field('لا نكثر النوافذ', 'بدون إزعاج')}
      <div class="notice amber">المستخدم يقدر يعيد فتح الدليل من الإعدادات.</div>
    ` })}
  </div>`,
  'هذا يعالج طلب دليل الاستخدام وشرح المصطلحات بدون تحويل التطبيق إلى شروحات طويلة.'
));

pages.push(page(
  11,
  'الخطة القريبة والمستقبلية',
  'النسخة 1 تبقى مجانية للاختبار والنشر الأول، والدفع والذكاء الاصطناعي تأتي لاحقاً بدون تعارض.',
  `<div class="phones three">
    ${phone({ title: 'نسخة 1', subtitle: 'الآن', tone: 'green', children: `
      ${field('الوضع', 'اختبار على الهاتف ثم نشر')}
      ${field('السعر', 'مجاني الآن')}
      ${field('الهدف', 'استقرار وتجربة واضحة')}
      ${field('مهم', 'لا نربط الدفع الآن')}
    `, footer: '<div class="actions"><button class="green">جاهز للاختبار</button></div>' })}
    ${phone({ title: 'ميزات مدفوعة', subtitle: 'لاحقاً', tone: 'blue', children: `
      ${field('اشتراك', 'أشهر محددة')}
      ${field('فتح ميزات', 'غرف، مزامنة متقدمة، AI')}
      ${field('عدم التعارض', 'لا نترك أماكن الدفع فارغة')}
      ${field('التطبيق الآن', 'يبقى صالح بدون دفع')}
    `, footer: '<div class="actions"><button class="blue">لاحقاً</button></div>' })}
    ${phone({ title: 'ذكاء اصطناعي', subtitle: 'خطة مرنة', tone: 'amber', children: `
      ${field('الآن', 'تحليل محلي بدون AI مدفوع')}
      ${field('الخيار القريب', 'خدمة مجانية بحدود بسيطة')}
      ${field('داخل الجهاز', 'خفيف للمهام البسيطة فقط')}
      ${field('لاحقاً', 'AI سحابي للمدفوع')}
    `, footer: '<div class="actions"><button class="amber">مستقبل</button></div>' })}
  </div>`,
  'هذه الصفحة للتأكد أن تصميم اليوم لا يعارض الدفع أو التحديثات الكبيرة القادمة.'
));

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>MYFI Current UI Fixes Preview</title>
  <style>
    @font-face {
      font-family: CairoLocal;
      src: url("${path.resolve(__dirname, '..', 'assets', 'fonts', 'Cairo.ttf').replace(/\\/g, '/')}");
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: #F4F6F5;
      color: #142019;
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
      background: #F4F6F5;
      display: flex;
      flex-direction: column;
      gap: 6mm;
    }
    .page:last-child { page-break-after: auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 14mm;
      border-bottom: 1px solid rgba(20,32,25,0.12);
      padding-bottom: 4mm;
    }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 25px; line-height: 1.35; font-weight: 900; letter-spacing: 0; }
    header p { color: #5D6962; font-size: 12px; line-height: 1.65; max-width: 190mm; margin-top: 1.5mm; font-weight: 700; }
    .num { color: #138A57; font-size: 12px; font-weight: 900; }
    .vote {
      min-width: 48mm;
      border-radius: 8px;
      border: 1px solid rgba(20,32,25,0.12);
      background: #fff;
      padding: 5mm 6mm;
      font-size: 13px;
      font-weight: 900;
      color: #142019;
      text-align: center;
      box-shadow: 0 3px 7px rgba(2,8,15,0.06);
    }
    main { flex: 1; display: grid; align-items: center; }
    footer {
      border: 1px solid rgba(20,32,25,0.12);
      background: #fff;
      border-radius: 8px;
      padding: 3mm 5mm;
      color: #5D6962;
      font-size: 10.5px;
      font-weight: 800;
      text-align: center;
    }
    .cover-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5mm;
      align-items: stretch;
    }
    .cover-card {
      min-height: 74mm;
      background: #fff;
      border: 1px solid rgba(20,32,25,0.12);
      border-top: 6mm solid #138A57;
      border-radius: 8px;
      padding: 10mm 7mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 5mm;
      box-shadow: 0 3px 7px rgba(2,8,15,0.06);
    }
    .cover-card h2 { font-size: 19px; line-height: 1.4; font-weight: 900; }
    .cover-card p { font-size: 12px; line-height: 1.85; color: #5D6962; font-weight: 750; }
    .cover-card.red { border-top-color: #C74F5C; }
    .cover-card.amber { border-top-color: #A96E0A; }
    .cover-card.blue { border-top-color: #447FC1; }
    .phones { display: grid; gap: 5mm; align-items: center; }
    .phones.three { grid-template-columns: repeat(3, 1fr); }
    .phones.four { grid-template-columns: repeat(4, 1fr); gap: 4mm; }
    .phone {
      width: 100%;
      height: 142mm;
      border-radius: 26px;
      background: #ECEFED;
      border: 1px solid rgba(20,32,25,0.12);
      padding: 5mm 3mm 3mm;
      display: flex;
      flex-direction: column;
      box-shadow: 0 3px 7px rgba(2,8,15,0.06);
    }
    .phones.four .phone { height: 145mm; padding-inline: 2.3mm; }
    .status {
      width: 20mm;
      height: 1.7mm;
      border-radius: 999px;
      background: #D4DAD7;
      margin: 0 auto 4mm;
      flex: 0 0 auto;
    }
    .phone-scroll {
      flex: 1;
      background: #F4F6F5;
      border-radius: 20px 20px 8px 8px;
      padding: 4mm;
      overflow: hidden;
    }
    .sheet-phone {
      justify-content: flex-end;
      padding-top: 28mm;
    }
    .sheet {
      flex: 1;
      background: #fff;
      border-radius: 18px 18px 8px 8px;
      border: 1px solid rgba(20,32,25,0.12);
      padding: 3.5mm;
      box-shadow: 0 10px 18px rgba(2,8,15,0.10);
      overflow: hidden;
    }
    .handle {
      width: 20mm;
      height: 1.6mm;
      background: #D4DAD7;
      border-radius: 999px;
      margin: 0 auto 3mm;
    }
    .app-head {
      min-height: 18mm;
      border-radius: 8px;
      border: 1px solid rgba(19,138,87,0.25);
      background: rgba(22,155,98,0.12);
      padding: 3mm;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 2mm;
      margin-bottom: 3mm;
      color: #138A57;
    }
    .app-head h3 { font-size: 14px; line-height: 1.35; font-weight: 900; }
    .app-head p { font-size: 9.5px; line-height: 1.4; color: #5D6962; font-weight: 800; margin-top: 0.8mm; }
    .app-head i {
      width: 12mm;
      height: 12mm;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: #138A57;
      color: #fff;
      font-style: normal;
      font-size: 10px;
      font-weight: 900;
      flex: 0 0 auto;
      direction: ltr;
    }
    .app-head.red { background: rgba(199,79,92,0.11); border-color: rgba(199,79,92,0.25); color: #C74F5C; }
    .app-head.red i { background: #C74F5C; }
    .app-head.blue { background: rgba(68,127,193,0.12); border-color: rgba(68,127,193,0.25); color: #447FC1; }
    .app-head.blue i { background: #447FC1; }
    .app-head.amber { background: rgba(169,110,10,0.12); border-color: rgba(169,110,10,0.25); color: #A96E0A; }
    .app-head.amber i { background: #A96E0A; }
    .field, .list-row {
      min-height: 12mm;
      border-radius: 8px;
      border: 1px solid rgba(20,32,25,0.12);
      background: #F2F4F3;
      padding: 2mm 3mm;
      margin-bottom: 2mm;
      overflow: hidden;
    }
    .field span, .metric span, .list-row span {
      display: block;
      color: #5D6962;
      font-size: 9.5px;
      line-height: 1.25;
      font-weight: 850;
      margin-bottom: 0.7mm;
    }
    .field strong, .list-row strong {
      display: block;
      color: #142019;
      font-size: 12px;
      line-height: 1.35;
      font-weight: 900;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .field small {
      display: block;
      color: #758079;
      font-size: 8px;
      line-height: 1.25;
      font-weight: 700;
      margin-top: 0.6mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .hero {
      border-radius: 8px;
      background: #DCEFE5;
      border: 1px solid rgba(19,138,87,0.25);
      padding: 4mm;
      margin-bottom: 3mm;
    }
    .hero span, .hero small { display: block; color: #143326; font-size: 9px; font-weight: 800; }
    .hero strong { display: block; color: #143326; font-size: 23px; line-height: 1.35; font-weight: 900; margin: 1mm 0; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; margin-bottom: 3mm; }
    .metric {
      min-height: 20mm;
      background: #fff;
      border: 1px solid rgba(20,32,25,0.12);
      border-radius: 8px;
      padding: 2.5mm;
    }
    .metric strong { display: block; font-size: 12px; line-height: 1.4; font-weight: 900; color: #138A57; }
    .metric.red strong { color: #C74F5C; }
    .metric.blue strong { color: #447FC1; }
    .metric.amber strong { color: #A96E0A; }
    .quick-grid, .chips, .tabs {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 2mm;
      margin-bottom: 2mm;
    }
    .tabs { grid-template-columns: repeat(4, 1fr); }
    .quick-grid b, .chips b, .tabs b {
      min-height: 9.5mm;
      border-radius: 8px;
      background: #ECEFED;
      border: 1px solid rgba(20,32,25,0.12);
      display: grid;
      place-items: center;
      font-size: 9px;
      font-weight: 900;
      color: #5D6962;
      text-align: center;
      padding: 1mm;
    }
    b.active.green, .quick-grid b.green, button.green { background: #138A57; color: #fff; }
    b.active.red, .quick-grid b.red, button.red { background: #C74F5C; color: #fff; }
    b.active.blue, .quick-grid b.blue, button.blue { background: #447FC1; color: #fff; }
    b.active.amber, .quick-grid b.amber, button.amber { background: #A96E0A; color: #fff; }
    .notice {
      border-radius: 8px;
      background: rgba(22,155,98,0.12);
      color: #143326;
      padding: 2.5mm;
      font-size: 9px;
      line-height: 1.5;
      font-weight: 800;
      margin-top: 2mm;
    }
    .notice.red { background: rgba(199,79,92,0.11); color: #8f3340; }
    .notice.blue { background: rgba(68,127,193,0.12); color: #2d5c92; }
    .notice.amber { background: rgba(169,110,10,0.12); color: #704908; }
    .list-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 2mm;
      background: #fff;
    }
    .list-row span, .list-row strong { margin: 0; }
    .list-row.green { border-color: rgba(19,138,87,0.25); }
    .list-row.red { border-color: rgba(199,79,92,0.25); }
    .list-row.blue { border-color: rgba(68,127,193,0.25); }
    .list-row.amber { border-color: rgba(169,110,10,0.25); }
    .actions {
      display: grid;
      grid-template-columns: 0.72fr 1.4fr;
      gap: 2mm;
      margin-top: auto;
    }
    button {
      border: 1px solid transparent;
      border-radius: 8px;
      min-height: 11mm;
      padding: 2mm;
      font-family: inherit;
      font-size: 10px;
      font-weight: 900;
    }
    button.secondary { background: #ECEFED; color: #5D6962; border-color: rgba(20,32,25,0.12); }
    .nav {
      height: 16mm;
      background: #fff;
      border-top: 1px solid rgba(20,32,25,0.12);
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1mm;
      align-items: center;
      padding: 1.5mm;
      border-radius: 0 0 20px 20px;
      flex: 0 0 auto;
    }
    .nav span {
      min-height: 10mm;
      display: grid;
      place-items: center;
      font-size: 7.5px;
      font-weight: 900;
      color: #758079;
      border-radius: 8px;
    }
    .nav span.on { color: #138A57; background: rgba(22,155,98,0.12); }
    .progress { height: 3mm; border-radius: 999px; background: #ECEFED; overflow: hidden; margin: 2mm 0 4mm; }
    .progress span { display: block; height: 100%; background: #447FC1; border-radius: 999px; }
    .keyboard {
      height: 20mm;
      border-radius: 8px;
      background: #ECEFED;
      display: grid;
      place-items: center;
      color: #758079;
      font-size: 9px;
      font-weight: 900;
      margin-top: 2mm;
    }
    .chart {
      height: 45mm;
      border-radius: 8px;
      background: #fff;
      border: 1px solid rgba(20,32,25,0.12);
      padding: 4mm;
      display: flex;
      align-items: end;
      justify-content: center;
      gap: 3mm;
      margin-bottom: 3mm;
    }
    .chart b {
      width: 8mm;
      background: #138A57;
      border-radius: 999px 999px 2px 2px;
    }
    .chart b.red { background: #C74F5C; }
    @page { size: A4 landscape; margin: 0; }
  </style>
</head>
<body>${pages.join('\n')}</body>
</html>`;

async function main() {
  fs.writeFileSync(htmlPath, html, 'utf8');
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--font-render-hinting=none'],
  });
  const page = await browser.newPage({ viewport: { width: 1754, height: 1240 }, deviceScaleFactor: 1 });
  await page.goto(`file://${htmlPath.replace(/\\/g, '/')}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.screenshot({ path: coverPath, fullPage: false });
  await browser.close();
  console.log(JSON.stringify({ htmlPath, pdfPath, coverPath }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
