const assert = require('node:assert/strict');
const {
  buildPlannedRowsReport,
  buildRows,
  buildSourceReport,
  compareReports,
  normalizeSource,
  parseArgs,
} = require('../tools/backfill-normalized.cjs');

const snapshot = {
  cfg: { currency: 'IQD', lang: 'ar', profileType: 'personal' },
  data: {
    cats: [
      { id: 'food', label: 'Food', labelEn: 'Food', icon: 'restaurant-outline', color: '#f00' },
      { id: 'other', label: 'Other', labelEn: 'Other' },
    ],
    wallets: [
      { id: 'cash', name: 'Cash', nameEn: 'Cash', type: 'cash', openingBalance: 1000, scope: 'personal' },
      { id: 'bank', name: 'Bank', nameEn: 'Bank', type: 'bank', openingBalance: 2000, scope: 'business' },
    ],
    trans: [
      { id: 'income-1', title: 'Salary', amt: 500, cat: 'other', walletId: 'bank', dateISO: '2026-01-01', flowType: 'income' },
      { id: 'expense-1', title: 'Food', amt: -125, cat: 'food', walletId: 'cash', dateISO: '2026-01-02', flowType: 'expense', transactionTag: 'essential' },
      { id: 'transfer-1', title: 'Move', kind: 'transfer', transferAmount: 200, fromWalletId: 'bank', toWalletId: 'cash', dateISO: '2026-01-03', flowType: 'transfer' },
      { id: 'goal-1', title: 'Save', amt: 0, allocationAmount: 50, isGoalSaving: true, goalId: 'goal-1', savingId: 'saving-1', walletId: 'cash', dateISO: '2026-01-04', flowType: 'goal_allocation' },
    ],
    debts: [{ id: 'debt-1', name: 'Phone', total: 1000, archivedPaid: 100, payments: [{ id: 'payment-1', amt: 50, date: '2026-01-05' }] }],
    goals: [{ id: 'goal-1', name: 'Emergency', target: 1000, archivedSaved: 25, savings: [{ id: 'saving-1', amt: 50, date: '2026-01-04' }] }],
    commitments: [{ id: 'commit-1', name: 'Internet', amt: 60, day: 20, firstDueISO: '2026-01-20', walletId: 'bank', cat: 'other' }],
  },
};

const normalized = normalizeSource(snapshot);
const report = buildSourceReport(normalized);
const built = buildRows(normalized);
const planned = buildPlannedRowsReport(normalized, built);

assert.equal(report.counts.transactions, 4);
assert.equal(report.counts.debtPayments, 1);
assert.equal(report.counts.goalSavings, 1);
assert.equal(report.counts.tags, 1);
assert.equal(report.counts.transactionTags, 1);
assert.equal(report.totals.income, 500);
assert.equal(report.totals.expense, 125);
assert.equal(report.totals.transfers, 200);
assert.equal(report.totals.allocations, 50);
assert.equal(report.totals.walletBalances.cash, 1075);
assert.equal(report.totals.walletBalances.bank, 2300);
assert.equal(built.rows.transactions.length, 4);
assert.equal(built.rows.wallets[1].scope, 'business');
assert.equal(built.rows.transactions[2].scope, 'business');
assert.equal(built.rows.transactions[2].from_scope, 'business');
assert.equal(built.rows.transactions[2].to_scope, 'personal');
assert.equal(built.rows.debt_payments[0].debtLegacyId, 'debt-1');
assert.equal(built.rows.goal_savings[0].transactionLegacyId, 'goal-1');
assert.equal(planned.counts.transactions, report.counts.transactions);
assert.equal(planned.counts.wallets, report.counts.wallets);
assert.equal(planned.totals.walletBalances.cash, report.totals.walletBalances.cash);
assert.equal(compareReports(report, planned).passed, true);
assert.equal(parseArgs(['--input', 'snapshot.json', '--user-id', 'user-1', '--apply']).apply, true);

const target = JSON.parse(JSON.stringify(report));
target.source = 'normalized_staging';
assert.equal(compareReports(report, target).passed, true);
target.counts.transactions += 1;
assert.equal(compareReports(report, target).passed, false);

console.log('MYFI normalized backfill helpers: all assertions passed');
