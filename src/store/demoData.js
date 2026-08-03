import { DEF_CATS, DEF_NOTIF, normalizeCfg } from '../lib/constants';
import { monthKey } from '../lib/commitments';
import { FLOW_TYPES } from '../lib/modules';
import { normalizeTransactionTag } from '../lib/transactionTags';
import { demoDate, sumAmt } from './domain';

export const buildDemoWorkspace = (currentCfg = {}) => {
  const cfg = normalizeCfg({
    ...currentCfg,
    demoMode: true,
    profileType: 'personal_business',
    activeScope: 'all',
    currency: 'IQD',
    enabledModules: {
      wallets: true,
      debtsOwed: true,
      debtsReceivable: true,
      goals: true,
      commitments: true,
      recurring: true,
      budgets: true,
    },
    categoryBudgets: {
      food: 520000,
      rent: 700000,
      transport: 260000,
      health: 180000,
      clothes: 220000,
      entertain: 160000,
      other: 240000,
    },
    defaultWalletId: 'demo_cash',
  });

  const wallets = [
    { id: 'demo_cash', name: 'النقد', nameEn: 'Cash', type: 'cash', currency: 'IQD', openingBalance: 1800000, scope: 'personal' },
    { id: 'demo_bank', name: 'الحساب البنكي', nameEn: 'Bank account', type: 'bank', currency: 'IQD', openingBalance: 3200000, scope: 'personal' },
    { id: 'demo_savings', name: 'حساب التوفير', nameEn: 'Savings wallet', type: 'savings', currency: 'IQD', openingBalance: 900000, scope: 'personal' },
    { id: 'demo_business', name: 'محفظة العمل', nameEn: 'Business wallet', type: 'business', currency: 'IQD', openingBalance: 1500000, scope: 'business' },
  ];

  const rows = [
    ['demo_salary_0', 'راتب الشهر', 2400000, 'salary', demoDate(0, 1), 'demo_bank'],
    ['demo_rent_0', 'إيجار المنزل', -650000, 'rent', demoDate(0, 2), 'demo_bank'],
    ['demo_food_0', 'مشتريات المنزل', -185000, 'food', demoDate(0, 5), 'demo_cash'],
    ['demo_transport_0', 'وقود ومواصلات', -92000, 'transport', demoDate(0, 8), 'demo_cash'],
    ['demo_salary_1', 'راتب الشهر', 2350000, 'salary', demoDate(-1, 1), 'demo_bank'],
    ['demo_rent_1', 'إيجار المنزل', -650000, 'rent', demoDate(-1, 2), 'demo_bank'],
    ['demo_food_1', 'مطعم ومشتريات', -310000, 'food', demoDate(-1, 10), 'demo_cash'],
    ['demo_health_1', 'صيدلية', -78000, 'health', demoDate(-1, 16), 'demo_cash'],
    ['demo_salary_2', 'راتب الشهر', 2300000, 'salary', demoDate(-2, 1), 'demo_bank'],
    ['demo_rent_2', 'إيجار المنزل', -650000, 'rent', demoDate(-2, 2), 'demo_bank'],
    ['demo_food_2', 'مشتريات غذائية', -265000, 'food', demoDate(-2, 12), 'demo_cash'],
    ['demo_fun_2', 'اشتراك ترفيه', -45000, 'entertain', demoDate(-2, 18), 'demo_bank'],
  ].map(([id, title, amt, cat, dateISO, walletId], index) => ({
    id,
    title,
    amt,
    cat,
    dateISO,
    walletId,
    flowType: amt >= 0 ? FLOW_TYPES.INCOME : FLOW_TYPES.EXPENSE,
    scope: 'personal',
    ts: Date.now() - index * 1000,
  }));

  const debtPaymentId = 'demo_debt_payment';
  const goalSavingId = 'demo_goal_saving';
  rows.push(
    {
      id: 'demo_debt_tx',
      title: 'سداد دين علي - قرض الهاتف',
      amt: -100000,
      cat: 'other',
      dateISO: demoDate(0, 12),
      walletId: 'demo_bank',
      scope: 'personal',
      flowType: FLOW_TYPES.DEBT_PAYMENT,
      isDebtPayment: true,
      debtId: 'demo_debt',
      paymentId: debtPaymentId,
      ts: Date.now() - 20000,
    },
    {
      id: 'demo_goal_tx',
      title: 'توفير - صندوق الطوارئ',
      amt: 0,
      allocationAmount: 300000,
      cat: 'other',
      dateISO: demoDate(0, 14),
      walletId: 'demo_bank',
      scope: 'personal',
      flowType: FLOW_TYPES.GOAL_ALLOCATION,
      isGoalSaving: true,
      goalId: 'demo_goal',
      savingId: goalSavingId,
      ts: Date.now() - 21000,
    },
  );

  const extraDebtPayments = [];
  const extraReceivablePayments = [];
  const extraGoalSavings = [];
  const extraTravelSavings = [];
  let txIndex = rows.length;
  const demoTs = () => Date.now() - (txIndex += 1) * 1000;
  const addTx = (tx) => rows.push({ scope: 'personal', ts: demoTs(), ...tx });

  Array.from({ length: 12 }, (_, index) => -index).forEach((offset, index) => {
    const suffix = Math.abs(offset);
    const dateISO = day => demoDate(offset, day);
    const debtAmount = 70000 + (index % 3) * 15000;
    const receivableAmount = 65000 + (index % 4) * 20000;
    const goalAmount = 150000 + (index % 5) * 25000;
    const travelAmount = index % 2 === 0 ? 85000 + (index % 3) * 15000 : 0;
    const debtPayment = { id: `demo_extra_debt_payment_${suffix}`, amt: debtAmount, date: dateISO(18), ts: demoTs() };
    const receivablePayment = { id: `demo_extra_receivable_payment_${suffix}`, amt: receivableAmount, date: dateISO(15), ts: demoTs() };
    const goalSaving = { id: `demo_extra_goal_saving_${suffix}`, amt: goalAmount, date: dateISO(14), ts: demoTs() };

    extraDebtPayments.push(debtPayment);
    extraReceivablePayments.push(receivablePayment);
    extraGoalSavings.push(goalSaving);

    addTx({ id: `demo_extra_income_${suffix}`, title: 'دخل إضافي', amt: 280000 + (index % 4) * 30000, cat: 'salary', dateISO: dateISO(4), walletId: 'demo_cash', flowType: FLOW_TYPES.INCOME, transactionTag: 'cash_deposit' });
    addTx({ id: `demo_extra_business_income_${suffix}`, title: 'مبيعات المشروع', amt: 720000 + (index % 6) * 45000, cat: 'salary', dateISO: dateISO(6), walletId: 'demo_business', flowType: FLOW_TYPES.INCOME, scope: 'business' });
    addTx({ id: `demo_extra_food_${suffix}`, title: 'مشتريات أسبوعية', amt: -(165000 + (index % 5) * 21000), cat: 'food', dateISO: dateISO(7), walletId: 'demo_cash', flowType: FLOW_TYPES.EXPENSE });
    addTx({ id: `demo_extra_transport_${suffix}`, title: 'وقود وتكسي', amt: -(78000 + (index % 4) * 12000), cat: 'transport', dateISO: dateISO(9), walletId: 'demo_cash', flowType: FLOW_TYPES.EXPENSE });
    addTx({ id: `demo_extra_health_${suffix}`, title: 'صيدلية وفحص', amt: -(45000 + (index % 3) * 18000), cat: 'health', dateISO: dateISO(11), walletId: 'demo_cash', flowType: FLOW_TYPES.EXPENSE });
    addTx({ id: `demo_extra_clothes_${suffix}`, title: 'ملابس واحتياجات', amt: -(95000 + (index % 4) * 25000), cat: 'clothes', dateISO: dateISO(13), walletId: 'demo_bank', flowType: FLOW_TYPES.EXPENSE, transactionTag: 'installment' });
    addTx({ id: `demo_extra_fun_${suffix}`, title: 'ترفيه وطلعة', amt: -(70000 + (index % 5) * 16000), cat: 'entertain', dateISO: dateISO(17), walletId: 'demo_cash', flowType: FLOW_TYPES.EXPENSE, transactionTag: 'subscription' });
    addTx({ id: `demo_extra_business_cost_${suffix}`, title: 'مصاريف المشروع', amt: -(180000 + (index % 6) * 30000), cat: 'other', dateISO: dateISO(19), walletId: 'demo_business', flowType: FLOW_TYPES.EXPENSE, scope: 'business' });
    addTx({ id: `demo_extra_commitment_${suffix}`, title: 'اشتراك الإنترنت', amt: -60000, cat: 'other', dateISO: dateISO(20), walletId: 'demo_bank', flowType: FLOW_TYPES.COMMITMENT_PAYMENT, isCommitmentPayment: true, commitmentId: 'demo_commitment', commitmentMonth: monthKey(dateISO(20)) });
    addTx({ id: `demo_extra_debt_tx_${suffix}`, title: 'سداد دين علي - قرض الهاتف', amt: -debtAmount, cat: 'other', dateISO: debtPayment.date, walletId: 'demo_bank', flowType: FLOW_TYPES.DEBT_PAYMENT, isDebtPayment: true, debtId: 'demo_debt', paymentId: debtPayment.id });
    addTx({ id: `demo_extra_receivable_tx_${suffix}`, title: 'تحصيل دين لي - سلفة صديق', amt: receivableAmount, cat: 'other', dateISO: receivablePayment.date, walletId: 'demo_cash', flowType: FLOW_TYPES.RECEIVABLE_COLLECTION, isDebtPayment: true, debtId: 'demo_receivable', paymentId: receivablePayment.id });
    addTx({ id: `demo_extra_goal_tx_${suffix}`, title: 'توفير - صندوق الطوارئ', amt: 0, allocationAmount: goalAmount, cat: 'other', dateISO: goalSaving.date, walletId: 'demo_savings', flowType: FLOW_TYPES.GOAL_ALLOCATION, isGoalSaving: true, goalId: 'demo_goal', savingId: goalSaving.id });
    addTx({ id: `demo_extra_transfer_${suffix}`, title: 'تحويل بين المحافظ', kind: 'transfer', transferAmount: 220000 + (index % 4) * 40000, fromWalletId: 'demo_bank', toWalletId: 'demo_savings', dateISO: dateISO(16), flowType: FLOW_TYPES.TRANSFER });

    if (travelAmount) {
      const travelSaving = { id: `demo_extra_travel_saving_${suffix}`, amt: travelAmount, date: dateISO(22), ts: demoTs() };
      extraTravelSavings.push(travelSaving);
      addTx({ id: `demo_extra_travel_goal_tx_${suffix}`, title: 'توفير - رحلة الصيف', amt: 0, allocationAmount: travelAmount, cat: 'other', dateISO: travelSaving.date, walletId: 'demo_savings', flowType: FLOW_TYPES.GOAL_ALLOCATION, isGoalSaving: true, goalId: 'demo_travel_goal', savingId: travelSaving.id });
    }
  });

  return {
    trans: rows.map(normalizeTransactionTag),
    debts: [{
      id: 'demo_debt',
      name: 'قرض الهاتف',
      total: 1800000,
      paid: 100000 + sumAmt(extraDebtPayments),
      archivedPaid: 0,
      direction: 'owed',
      scope: 'personal',
      createdAt: demoDate(-1, 3),
      payments: [{ id: debtPaymentId, amt: 100000, date: demoDate(0, 12) }, ...extraDebtPayments],
    }, {
      id: 'demo_receivable',
      name: 'سلفة صديق',
      total: 1600000,
      paid: sumAmt(extraReceivablePayments),
      archivedPaid: 0,
      direction: 'receivable',
      scope: 'personal',
      createdAt: demoDate(-10, 7),
      payments: extraReceivablePayments,
    }],
    goals: [{
      id: 'demo_goal',
      name: 'صندوق الطوارئ',
      target: 5000000,
      cur: 300000 + sumAmt(extraGoalSavings),
      archivedSaved: 0,
      scope: 'personal',
      createdAt: demoDate(-2, 1),
      savings: [{ id: goalSavingId, amt: 300000, date: demoDate(0, 14) }, ...extraGoalSavings],
    }, {
      id: 'demo_travel_goal',
      name: 'رحلة الصيف',
      target: 2500000,
      cur: sumAmt(extraTravelSavings),
      archivedSaved: 0,
      scope: 'personal',
      createdAt: demoDate(-9, 1),
      savings: extraTravelSavings,
    }],
    commitments: [{
      id: 'demo_commitment',
      name: 'اشتراك الإنترنت',
      amt: 60000,
      day: 20,
      firstDueISO: demoDate(-2, 20),
      cat: 'other',
      walletId: 'demo_bank',
      linkedType: 'none',
      linkedId: null,
      repeatMonthly: true,
      active: true,
      scope: 'personal',
      lastPaidMonth: monthKey(demoDate(0, 20)),
    }, {
      id: 'demo_commitment_rent',
      name: 'إيجار المنزل',
      amt: 650000,
      day: 2,
      firstDueISO: demoDate(-11, 2),
      cat: 'rent',
      walletId: 'demo_bank',
      linkedType: 'none',
      linkedId: null,
      repeatMonthly: true,
      active: true,
      scope: 'personal',
      lastPaidMonth: monthKey(demoDate(0, 2)),
    }, {
      id: 'demo_commitment_business',
      name: 'مصاريف المشروع الشهرية',
      amt: 180000,
      day: 19,
      firstDueISO: demoDate(-11, 19),
      cat: 'other',
      walletId: 'demo_business',
      linkedType: 'none',
      linkedId: null,
      repeatMonthly: true,
      active: true,
      scope: 'business',
      lastPaidMonth: monthKey(demoDate(0, 19)),
    }],
    wallets,
    cats: DEF_CATS,
    cfg,
    notif: DEF_NOTIF,
  };
};
