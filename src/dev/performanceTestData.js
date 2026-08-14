// MYFI_PERFORMANCE_DATA_RUNTIME_V5_1_2
import { FLOW_TYPES } from '../lib/modules';
import { normalizeTransactionTag } from '../lib/transactionTags';
import { archivedWalletMovement, demoDate, yearOf } from '../store/domain';
import { buildDemoWorkspace } from '../store/demoData';
import { getDefaultWalletId } from '../lib/wallets';
import { compareTransactionsNewestFirst } from '../lib/transactionIndex';

import { DEFAULT_PERFORMANCE_TEST_TIER, getPerformanceTestTier } from './performanceTestConfig';

const expensePatterns = [
  { cat: 'food', title: 'مشتريات المنزل', base: 18000, step: 850, walletId: 'demo_cash' },
  { cat: 'transport', title: 'وقود ومواصلات', base: 24000, step: 1100, walletId: 'demo_cash' },
  { cat: 'health', title: 'صيدلية وعناية صحية', base: 16000, step: 420, walletId: 'demo_bank' },
  { cat: 'clothes', title: 'ملابس واحتياجات', base: 32000, step: 900, walletId: 'demo_bank' },
  { cat: 'entertain', title: 'ترفيه واشتراكات', base: 14000, step: 560, walletId: 'demo_cash' },
  { cat: 'other', title: 'مصاريف متنوعة', base: 12000, step: 470, walletId: 'demo_cash' },
];

const stableInt = (index, salt = 0) => (
  (Math.imul(index + 1, 1103515245) + Math.imul(salt + 17, 12345)) >>> 0
);

const makeExpense = ({ index, tier, monthIndex, dateISO }) => {
  const pattern = expensePatterns[stableInt(index, 3) % expensePatterns.length];
  const recentFactor = Math.max(0, tier.months - monthIndex);
  const amountVariation = stableInt(index, 7) % 28000;
  const trend = pattern.cat === 'food' || pattern.cat === 'transport'
    ? Math.round(recentFactor * pattern.step)
    : Math.round((recentFactor % 8) * pattern.step);
  const amt = -(pattern.base + amountVariation + trend);
  const business = stableInt(index, 11) % 9 === 0;
  return {
    id: `perf_${tier.id}_expense_${index}`,
    title: business ? 'مصاريف عمل يومية' : pattern.title,
    amt,
    cat: business ? 'other' : pattern.cat,
    dateISO,
    walletId: business ? 'demo_business' : pattern.walletId,
    scope: business ? 'business' : 'personal',
    flowType: FLOW_TYPES.EXPENSE,
  };
};

const makeIncome = ({ index, tier, dateISO }) => {
  const business = stableInt(index, 13) % 4 === 0;
  const amount = business
    ? 350000 + (stableInt(index, 14) % 1450000)
    : 120000 + (stableInt(index, 15) % 750000);
  return {
    id: `perf_${tier.id}_income_${index}`,
    title: business ? 'دخل مشروع' : 'دخل إضافي',
    amt: amount,
    cat: 'salary',
    dateISO,
    walletId: business ? 'demo_business' : (stableInt(index, 16) % 2 ? 'demo_bank' : 'demo_cash'),
    scope: business ? 'business' : 'personal',
    flowType: FLOW_TYPES.INCOME,
  };
};

const makeTransfer = ({ index, tier, dateISO }) => ({
  id: `perf_${tier.id}_transfer_${index}`,
  title: 'تحويل بين المحافظ',
  kind: 'transfer',
  transferAmount: 50000 + (stableInt(index, 19) % 650000),
  fromWalletId: stableInt(index, 20) % 2 ? 'demo_bank' : 'demo_cash',
  toWalletId: 'demo_savings',
  scope: 'personal',
  dateISO,
  flowType: FLOW_TYPES.TRANSFER,
});

const buildBulkTransaction = (index, tier) => {
  const now = new Date();
  const activeMode = tier.mode === 'active';
  const monthIndex = activeMode
    ? (stableInt(index, 23) % (now.getMonth() + 1))
    : index < 4 ? 0 : (stableInt(index, 23) % tier.months);
  const currentDayCap = Math.max(1, Math.min(28, now.getDate()));
  let dayLimit = monthIndex === 0 ? currentDayCap : 28;
  if (activeMode) dayLimit = monthIndex === now.getMonth() ? currentDayCap : 28;
  const day = index < 4 ? currentDayCap : (1 + (stableInt(index, 29) % dayLimit));
  const dateISO = activeMode
    ? `${now.getFullYear()}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    : demoDate(-monthIndex, day);
  const selector = stableInt(index, 31) % 20;
  const tx = selector === 0 || selector === 7
    ? makeIncome({ index, tier, monthIndex, dateISO })
    : selector === 13
      ? makeTransfer({ index, tier, monthIndex, dateISO })
      : makeExpense({ index, tier, monthIndex, dateISO });
  return normalizeTransactionTag({
    ...tx,
    // Never let today's fixture rows live in the future. Otherwise a real
    // transaction added in the morning cannot enter Home's recent list until
    // noon even though its date is correct.
    ts: Math.min(
      Date.parse(`${dateISO}T12:00:00Z`) + (index % 3600) * 1000,
      now.getTime() - (index % 3600) * 1000,
    ),
  });
};

const calcArchiveStats = rows => {
  let income = 0;
  let expense = 0;
  const categories = new Map();
  rows.forEach(item => {
    if (item?.kind === 'transfer' || item?.flowType === FLOW_TYPES.TRANSFER) return;
    const amount = Number(item?.amt || 0);
    if (amount > 0) income += Math.abs(amount);
    else if (amount < 0) {
      const spent = Math.abs(amount);
      expense += spent;
      const key = String(item?.cat || 'other');
      categories.set(key, Number(categories.get(key) || 0) + spent);
    }
  });
  return {
    income,
    expense,
    net: income - expense,
    categories: [...categories.entries()].map(([id, spent]) => ({ id, spent })),
  };
};

const partitionCompletedYears = (base, rows) => {
  const currentYear = new Date().getFullYear();
  const byYear = new Map();
  const activeRows = [];
  rows.forEach(item => {
    const year = yearOf(item?.dateISO);
    if (!Number.isInteger(year) || year >= currentYear) {
      activeRows.push(item);
      return;
    }
    const yearRows = byYear.get(year);
    if (yearRows) yearRows.push(item);
    else byYear.set(year, [item]);
  });

  const archivedRows = [...byYear.values()].flat();
  const defaultWalletId = getDefaultWalletId(base.wallets, base.cfg.currency, base.cfg.defaultWalletId);
  const movement = archivedWalletMovement(archivedRows, base.wallets, defaultWalletId);
  const activeWallets = base.wallets.map(wallet => ({
    ...wallet,
    openingBalance: Number(wallet.openingBalance || 0) + Number(movement.get(wallet.id) || 0),
  }));
  const archives = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, yearRows]) => {
      yearRows.sort(compareTransactionsNewestFirst);
      const stats = calcArchiveStats(yearRows);
      const summary = {
        year,
        scope: 'all',
        archivedAt: new Date().toISOString(),
        checksum: '',
        count: yearRows.length,
        income: stats.income,
        expense: stats.expense,
        net: stats.net,
        categories: stats.categories,
      };
      return {
        year,
        scope: 'all',
        data: {
          trans: yearRows,
          debts: base.debts,
          goals: base.goals,
          wallets: base.wallets,
          commitments: base.commitments,
          cats: base.cats,
          archiveScope: 'all',
          cfg: { ...base.cfg, archiveYear: year, archiveScope: 'all', archiveSummaries: undefined },
        },
        summary,
      };
    });

  activeRows.sort(compareTransactionsNewestFirst);
  return { activeRows, activeWallets, archives };
};

const finalizePerformanceWorkspace = (base, tier, rows) => {
  if (rows.length > tier.transactions) rows.length = tier.transactions;
  rows.sort(compareTransactionsNewestFirst);

  // Two complementary modes are deliberate:
  // - longterm: realistic multi-year distribution with completed years archived;
  // - active: every row stays in the current-year active ledger to expose hot-path bottlenecks.
  const partitioned = tier.mode === 'active'
    ? { activeRows: [...rows].sort(compareTransactionsNewestFirst), activeWallets: base.wallets, archives: [] }
    : partitionCompletedYears(base, rows);
  const archiveSummaries = partitioned.archives.map(item => item.summary);

  return {
    ...base,
    trans: partitioned.activeRows,
    wallets: partitioned.activeWallets,
    __performanceArchives: partitioned.archives,
    cfg: {
      ...base.cfg,
      demoMode: true,
      performanceTestMode: true,
      performanceTestTier: tier.id,
      performanceTestTransactions: tier.transactions,
      performanceTestActiveTransactions: partitioned.activeRows.length,
      performanceTestArchivedTransactions: tier.transactions - partitioned.activeRows.length,
      performanceTestMonths: tier.months,
      performanceTestModeKind: tier.mode || 'longterm',
      archiveSummaries,
    },
    dirty: false,
    syncConflict: null,
    lastSyncError: null,
  };
};

export const buildPerformanceTestWorkspace = (currentCfg = {}, tierId = DEFAULT_PERFORMANCE_TEST_TIER) => {
  const tier = getPerformanceTestTier(tierId);
  const base = buildDemoWorkspace(currentCfg);
  // Performance fixtures intentionally regenerate the entire transaction history.
  // This prevents the small built-in demo sample from dominating the 200-row tier
  // and guarantees that every tier is distributed across its full multi-year span.
  const rows = [];

  let index = 0;
  while (rows.length < tier.transactions) {
    rows.push(buildBulkTransaction(index, tier));
    index += 1;
  }

  return finalizePerformanceWorkspace(base, tier, rows);
};

export const buildPerformanceTestWorkspaceAsync = async (
  currentCfg = {},
  tierId = DEFAULT_PERFORMANCE_TEST_TIER,
  { batchSize = 1500 } = {},
) => {
  const tier = getPerformanceTestTier(tierId);
  const base = buildDemoWorkspace(currentCfg);
  const rows = [];
  const safeBatch = Math.max(250, Number(batchSize) || 1500);

  for (let index = 0; index < tier.transactions; index += 1) {
    rows.push(buildBulkTransaction(index, tier));
    if (index > 0 && index % safeBatch === 0) {
      // Yield to React Native between batches so 25k/50k fixture generation
      // does not freeze touch handling and animations for one long JS task.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return finalizePerformanceWorkspace(base, tier, rows);
};
