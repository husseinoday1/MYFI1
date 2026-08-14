// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
export const PERFORMANCE_TEST_TIERS = [
  { id: '200', mode: 'longterm', transactions: 200, months: 24, labelAr: 'خفيف', labelEn: 'Light', purposeAr: 'سنتان لفحص الشاشات والتقارير والأرشفة', purposeEn: 'Two years for screens, reports, and archive checks' },
  { id: '1000', mode: 'longterm', transactions: 1000, months: 36, labelAr: 'متوسط', labelEn: 'Medium', purposeAr: 'ثلاث سنوات لاختبار الاستخدام المتكرر والفلاتر', purposeEn: 'Three years for repeated use and filtering' },
  { id: '5000', mode: 'longterm', transactions: 5000, months: 48, labelAr: 'كثيف', labelEn: 'Heavy', purposeAr: 'أربع سنوات لقياس الأداء مع سجل مالي كبير', purposeEn: 'Four years of large-history performance' },
  { id: '10000', mode: 'longterm', transactions: 10000, months: 60, labelAr: 'ضغط', labelEn: 'Stress', purposeAr: 'خمس سنوات لاختبار القوائم والتقارير تحت الضغط', purposeEn: 'Five years to stress lists and reports' },
  { id: '25000', mode: 'longterm', transactions: 25000, months: 72, labelAr: 'أقصى', labelEn: 'Extreme', purposeAr: 'ست سنوات لاختبار حدود الأداء على الجهاز', purposeEn: 'Six years for device performance limits' },
  { id: '50000', mode: 'longterm', transactions: 50000, months: 96, labelAr: 'طويل الأمد', labelEn: 'Long-term', purposeAr: 'ثمان سنوات لمحاكاة مستخدم قديم واختبار الأرشفة', purposeEn: 'Eight years to simulate a long-term user and archives' },
  { id: '100000', mode: 'longterm', transactions: 100000, months: 120, labelAr: '10 سنوات', labelEn: '10 years', purposeAr: 'مئة ألف حركة لاختبار العمر الطويل وحدود المعمارية', purposeEn: '100k entries to validate long-life architecture limits' },
  { id: 'active5000', mode: 'active', transactions: 5000, months: 12, labelAr: 'نشط 5K', labelEn: 'Active 5K', purposeAr: 'خمسة آلاف حركة في السنة الحالية بدون أرشفة لاختبار المحرك النشط', purposeEn: '5k current-year entries with no archive to stress the active engine' },
  { id: 'active10000', mode: 'active', transactions: 10000, months: 12, labelAr: 'نشط 10K', labelEn: 'Active 10K', purposeAr: 'عشرة آلاف حركة نشطة لاختبار SQL والواجهة بدون إخفاء الضغط بالأرشفة', purposeEn: '10k active entries to stress SQL/UI without archive masking' },
  { id: 'active25000', mode: 'active', transactions: 25000, months: 12, labelAr: 'نشط 25K', labelEn: 'Active 25K', purposeAr: 'خمسة وعشرون ألف حركة نشطة لكشف أي اختناق في Active Ledger', purposeEn: '25k active entries to expose Active Ledger bottlenecks' },
];

export const DEFAULT_PERFORMANCE_TEST_TIER = '200';

export const getPerformanceTestTier = (tierId = DEFAULT_PERFORMANCE_TEST_TIER) => (
  PERFORMANCE_TEST_TIERS.find(item => item.id === String(tierId)) || PERFORMANCE_TEST_TIERS[0]
);
