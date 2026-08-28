// MYFI_ARCHIVE_F1_REPAIR_PLAN_P11C_D3
// Phase 11-C / ruling D3: users who archived a year before the §3.5 freeze are
// still carrying the damage `commitYearArchive` did to their workspace. This
// module works out, for one workspace, exactly what that damage was and what the
// undamaged values are.
//
// It BUILDS A PLAN. It does not apply one, and it has no repair path of its own.
// D3 is explicit: an evidenced migration with before/after verification, never a
// silent repair (A0 §5, and `src/lib/CLAUDE.md`: "On inconsistent data, fail
// closed and surface it. Never auto-correct balances").
//
// The three damages, from commitYearArchive:
//   1. wallet.openingBalance += the archived year's movement for that wallet;
//   2. debt.payments for the archived year removed, folded into debt.archivedPaid;
//   3. goal.savings for the archived year removed, folded into goal.archivedSaved.
//
// All three are recoverable because the Cold Archive stores the workspace as it
// was BEFORE the mutation: commitYearArchive passes `current.debts` /
// `current.goals` / `current.trans` into storeColdArchiveYear, and computes the
// mutated `nextDebts` / `nextGoals` / `nextWallets` separately. So the archive
// holds the original payments and savings, and the archived transactions needed
// to reverse the opening-balance arithmetic.

import { archivedWalletMovement } from '../store/domain';

const yearOfDate = value => Number(String(value || '').slice(0, 4)) || null;
const sumAmt = items => (Array.isArray(items) ? items : []).reduce(
  (total, item) => total + Number(item?.amt || 0), 0,
);

// Every transaction the Cold Archive holds, across all archived years.
const archivedTransactions = (coldArchives = []) => (
  (Array.isArray(coldArchives) ? coldArchives : []).flatMap(
    archive => (Array.isArray(archive?.data?.trans) ? archive.data.trans : []),
  )
);

/**
 * The opening balance each wallet should have.
 *
 * commitYearArchive added the archived movement in; subtracting the same
 * movement back out recovers the original. This is the identical arithmetic the
 * V7 shadow migration already relies on
 * (`residual = openingBalance − coldMovement`), reused rather than reinvented so
 * the two cannot drift apart.
 */
export const openingBalanceRepairRows = ({
  wallets = [], coldArchives = [], defaultWalletId = null,
} = {}) => {
  const movement = archivedWalletMovement(
    archivedTransactions(coldArchives), wallets, defaultWalletId,
  );
  return (Array.isArray(wallets) ? wallets : []).map(wallet => {
    const current = Number(wallet?.openingBalance || 0);
    const inflated = Number(movement.get(wallet?.id) || 0);
    return {
      walletId: String(wallet?.id || ''),
      currentOpeningBalance: current,
      trueOpeningBalance: current - inflated,
      archivedMovement: inflated,
      needsRepair: inflated !== 0,
    };
  });
};

// The pre-archive entity, as the Cold Archive recorded it. Later archives are
// searched first so the newest surviving copy wins — an entity archived twice
// appears in both, and the older copy is the more truncated one.
const archivedEntity = (coldArchives, key, id) => {
  const archives = Array.isArray(coldArchives) ? [...coldArchives] : [];
  archives.sort((a, b) => Number(b?.year || 0) - Number(a?.year || 0));
  for (const archive of archives) {
    const list = archive?.data?.[key];
    if (!Array.isArray(list)) continue;
    const match = list.find(item => String(item?.id || '') === String(id));
    if (match) return match;
  }
  return null;
};

/**
 * Debt payment history that archiving truncated.
 *
 * The repaired payment list is the union of what survives in the live entity and
 * what the archive preserved, keyed by payment identity, so re-running this on an
 * already-repaired workspace adds nothing.
 */
export const debtHistoryRepairRows = ({ debts = [], coldArchives = [] } = {}) => (
  (Array.isArray(debts) ? debts : []).map(debt => {
    const archived = archivedEntity(coldArchives, 'debts', debt?.id);
    const livePayments = Array.isArray(debt?.payments) ? debt.payments : [];
    const archivedPayments = Array.isArray(archived?.payments) ? archived.payments : [];

    const seen = new Set(livePayments.map(payment => paymentKey(payment)));
    const missing = archivedPayments.filter(payment => !seen.has(paymentKey(payment)));

    return {
      debtId: String(debt?.id || ''),
      currentPaymentCount: livePayments.length,
      missingPaymentCount: missing.length,
      currentArchivedPaid: Number(debt?.archivedPaid || 0),
      // Once the payments are back in the list, keeping archivedPaid would
      // double-count them: commitYearArchive sets paid = archivedPaid + sum(rest).
      repairedPayments: [...livePayments, ...missing],
      repairedArchivedPaid: 0,
      repairedPaid: sumAmt([...livePayments, ...missing]),
      needsRepair: missing.length > 0 || Number(debt?.archivedPaid || 0) !== 0,
    };
  })
);

/**
 * Goal savings history that archiving truncated. Same shape as debts, with
 * `cur` recomputed the way the store does (capped at the goal target).
 */
export const goalHistoryRepairRows = ({ goals = [], coldArchives = [] } = {}) => (
  (Array.isArray(goals) ? goals : []).map(goal => {
    const archived = archivedEntity(coldArchives, 'goals', goal?.id);
    const liveSavings = Array.isArray(goal?.savings) ? goal.savings : [];
    const archivedSavings = Array.isArray(archived?.savings) ? archived.savings : [];

    const seen = new Set(liveSavings.map(saving => paymentKey(saving)));
    const missing = archivedSavings.filter(saving => !seen.has(paymentKey(saving)));
    const repairedSavings = [...liveSavings, ...missing];
    const repairedTotal = sumAmt(repairedSavings);
    const target = Number(goal?.target || 0);

    return {
      goalId: String(goal?.id || ''),
      currentSavingCount: liveSavings.length,
      missingSavingCount: missing.length,
      currentArchivedSaved: Number(goal?.archivedSaved || 0),
      repairedSavings,
      repairedArchivedSaved: 0,
      repairedCur: target > 0 ? Math.min(target, repairedTotal) : repairedTotal,
      needsRepair: missing.length > 0 || Number(goal?.archivedSaved || 0) !== 0,
    };
  })
);

// A payment/saving has no guaranteed id, so identity is its own fields. Date and
// amount alone would merge two genuine same-day same-amount payments into one,
// which would silently destroy history — the very thing this module repairs.
const paymentKey = entry => JSON.stringify([
  entry?.id ?? null,
  entry?.date ?? entry?.dateISO ?? null,
  Number(entry?.amt || 0),
  entry?.note ?? null,
]);

/**
 * The whole plan for one workspace.
 *
 * `ok: true` means nothing needs repairing. Anything else is a finding for a
 * human to act on, with the before and after values stated.
 */
export const buildArchiveF1RepairPlan = ({
  wallets = [], debts = [], goals = [], coldArchives = [], defaultWalletId = null,
} = {}) => {
  const walletRows = openingBalanceRepairRows({ wallets, coldArchives, defaultWalletId });
  const debtRows = debtHistoryRepairRows({ debts, coldArchives });
  const goalRows = goalHistoryRepairRows({ goals, coldArchives });

  const wallet = walletRows.filter(row => row.needsRepair);
  const debt = debtRows.filter(row => row.needsRepair);
  const goal = goalRows.filter(row => row.needsRepair);

  return {
    ok: wallet.length === 0 && debt.length === 0 && goal.length === 0,
    wallets: walletRows,
    debts: debtRows,
    goals: goalRows,
    affected: {
      wallets: wallet.map(row => row.walletId),
      debts: debt.map(row => row.debtId),
      goals: goal.map(row => row.goalId),
    },
  };
};

/**
 * Standing Engineering Rule 6: a repair plan carries opening balances, payment
 * amounts and goal totals, so the raw object must never reach a log, an
 * acceptance payload or an evidence document. This reduces it to shape and
 * identity — counts and ids, no amounts.
 */
export const summarizeRepairPlanForDiagnostics = (plan = {}) => ({
  ok: !!plan.ok,
  wallets: {
    checked: Array.isArray(plan.wallets) ? plan.wallets.length : 0,
    affected: plan.affected?.wallets?.length || 0,
    affectedIds: [...(plan.affected?.wallets || [])],
  },
  debts: {
    checked: Array.isArray(plan.debts) ? plan.debts.length : 0,
    affected: plan.affected?.debts?.length || 0,
    affectedIds: [...(plan.affected?.debts || [])],
  },
  goals: {
    checked: Array.isArray(plan.goals) ? plan.goals.length : 0,
    affected: plan.affected?.goals?.length || 0,
    affectedIds: [...(plan.affected?.goals || [])],
  },
});
