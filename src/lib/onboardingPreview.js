import { formatMoneyNumber } from './money';

const previewScale = (currency = 'IQD') => {
  switch (String(currency).toUpperCase()) {
    case 'IQD': return 1000;
    case 'IRR': return 10000;
    case 'JPY': return 100;
    case 'KRW': return 1000;
    case 'IDR': return 10000;
    case 'VND': return 50000;
    case 'LBP': return 100000;
    case 'SYP': return 10000;
    default: return 1;
  }
};

const profileCopy = (profileType = 'personal', lang = 'ar') => {
  const ar = lang === 'ar';
  if (profileType === 'business') {
    return {
      heroBody: ar ? 'تابع سيولة المشروع وإيراداته ومصاريفه بدون خلطها بأموالك الشخصية.' : 'Track business cash, income and costs without mixing them with personal money.',
      balance: ar ? 'سيولة المشروع' : 'Business cash',
      income: ar ? 'إيراد المشروع' : 'Business income',
      expense: ar ? 'مصاريف المشروع' : 'Business costs',
      insightTitle: ar ? 'افهم مصاريف مشروعك' : 'Understand business costs',
      insightBody: ar ? 'شاهد أكبر أبواب تشغيل المشروع واعرف أين تحتاج قراراً.' : 'See the largest operating costs and where a decision is needed.',
      rows: ar
        ? [['مبيعات', 'storefront-outline'], ['تشغيل', 'construct-outline'], ['موردون', 'cube-outline'], ['أخرى', 'ellipsis-horizontal-outline']]
        : [['Sales', 'storefront-outline'], ['Operations', 'construct-outline'], ['Suppliers', 'cube-outline'], ['Other', 'ellipsis-horizontal-outline']],
    };
  }
  if (profileType === 'personal_business') {
    return {
      heroBody: ar ? 'تابع الشخصي والمشروع مع فصل واضح بينهما وإمكانية رؤية الإجمالي.' : 'Track personal and business money separately, with a clear combined view when you need it.',
      balance: ar ? 'إجمالي الرصيد' : 'Total balance',
      income: ar ? 'إجمالي الدخل' : 'Total income',
      expense: ar ? 'إجمالي الصرف' : 'Total spending',
      insightTitle: ar ? 'شاهد أين يذهب المال' : 'See where money goes',
      insightBody: ar ? 'قارن الصرف الشخصي والمشروع حتى لا يختلط عليك القرار.' : 'Compare personal and business spending before making a decision.',
      rows: ar
        ? [['البيت', 'home-outline'], ['المشروع', 'storefront-outline'], ['النقل', 'car-outline'], ['أخرى', 'ellipsis-horizontal-outline']]
        : [['Home', 'home-outline'], ['Business', 'storefront-outline'], ['Transport', 'car-outline'], ['Other', 'ellipsis-horizontal-outline']],
    };
  }
  return {
    heroBody: ar ? 'دخل، مصروفات، محافظ وأهدافك المالية في مكان واحد — بدون تعقيد.' : 'Income, spending, wallets and financial goals in one place — without the clutter.',
    balance: ar ? 'الرصيد المتاح' : 'Available balance',
    income: ar ? 'الدخل' : 'Income',
    expense: ar ? 'المصروف' : 'Spending',
    insightTitle: ar ? 'اعرف أين تذهب أموالك' : 'Know where your money goes',
    insightBody: ar ? 'شاهد نمط إنفاقك خلال الشهر وافهم ما الذي تغيّر قبل أن يتحول إلى مفاجأة.' : 'See your monthly spending pattern and understand what changed before it becomes a surprise.',
    rows: ar
      ? [['السكن', 'home-outline'], ['النقل', 'car-outline'], ['التسوق', 'bag-outline'], ['أخرى', 'ellipsis-horizontal-outline']]
      : [['Housing', 'home-outline'], ['Transport', 'car-outline'], ['Shopping', 'bag-outline'], ['Other', 'ellipsis-horizontal-outline']],
  };
};

// This is illustrative onboarding data only. It must react to the user's
// selected currency/profile and must never be mistaken for stored financial data.
export const getOnboardingPreview = ({ currency = 'IQD', symbol = '', profileType = 'personal', lang = 'ar' } = {}) => {
  const scale = previewScale(currency);
  const copy = profileCopy(profileType, lang);
  const amounts = {
    balance: 8450 * scale,
    income: 5200 * scale,
    expense: 2750 * scale,
    categories: [900, 550, 480, 430].map(value => value * scale),
  };
  const money = value => `${formatMoneyNumber(value, currency, lang)} ${symbol || currency}`;

  return {
    ...copy,
    balanceValue: money(amounts.balance),
    incomeValue: money(amounts.income),
    expenseValue: money(amounts.expense),
    spendingValue: money(amounts.expense),
    rows: copy.rows.map(([label, icon], index) => ({
      label,
      icon,
      value: money(amounts.categories[index]),
      pct: ['32%', '20%', '17%', '16%'][index],
    })),
  };
};
