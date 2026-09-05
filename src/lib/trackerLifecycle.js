export const TRACKER_COMPLETION_GRACE_DAYS = 7;

const parseDateISO = (value) => {
  if (!value) return null;
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const latestMovementDate = (items = [], fallback = null) => {
  const dates = (Array.isArray(items) ? items : [])
    .map(item => item?.date || item?.dateISO || null)
    .filter(Boolean)
    .sort();
  return dates[dates.length - 1] || fallback || null;
};

const absoluteAmount = value => Math.abs(Number(value) || 0);

export const debtRemaining = (item = {}, paid = item.paid) => Math.max(
  0,
  absoluteAmount(item.total) - absoluteAmount(paid),
);

export const goalRemaining = (item = {}, saved = item.cur) => (
  item.status === 'released'
    ? 0
    : Math.max(0, absoluteAmount(item.target) - absoluteAmount(saved))
);

export const debtLifecycle = (item = {}, paid = item.paid, eventDate = null) => {
  const total = absoluteAmount(item.total);
  const settled = total > 0 && debtRemaining(item, paid) <= 0;
  if (settled) {
    const completedAt = item.completedAt || item.settledAt || eventDate || latestMovementDate(item.payments, item.createdAt);
    return {
      status: 'settled',
      completedAt: completedAt || null,
      settledAt: completedAt || null,
      settledAmount: absoluteAmount(paid),
    };
  }
  return {
    status: 'active',
    ...(item.status === 'settled' && eventDate ? { reopenedAt: eventDate } : {}),
  };
};

export const goalLifecycle = (item = {}, saved = item.cur, eventDate = null) => {
  if (item.status === 'released') {
    return {
      status: 'released',
      completedAt: item.completedAt || item.settledAt || null,
      settledAt: item.settledAt || item.completedAt || null,
      settledAmount: absoluteAmount(item.settledAmount || saved),
    };
  }
  const target = absoluteAmount(item.target);
  const settled = target > 0 && goalRemaining(item, saved) <= 0;
  if (settled) {
    const completedAt = item.completedAt || item.settledAt || eventDate || latestMovementDate(item.savings, item.createdAt);
    return {
      status: 'settled',
      completedAt: completedAt || null,
      settledAt: completedAt || null,
      settledAmount: absoluteAmount(saved),
    };
  }
  return {
    status: 'active',
    ...(item.status === 'settled' && eventDate ? { reopenedAt: eventDate } : {}),
  };
};

// A released goal's status is frozen by design (see goalLifecycle above) --
// deleting one of its saving transactions cannot change that, but the
// generic "linked transaction" delete copy claims it will. This tells the
// caller when that claim would be false, so the UI can say something true
// instead. Pure/read-only: decides what to say, never what to do.
export const releasedGoalDeleteNotice = (trans = {}, goal = null) => {
  if (!trans?.isGoalSaving || !goal || goal.status !== 'released') return null;
  return {
    goalId: goal.id,
    goalName: goal.name || null,
    releasedAt: goal.settledAt || goal.completedAt || null,
  };
};

// One copy of the refusal wording, because six screens offer this delete and
// six near-identical strings drift. The store refuses regardless; this is what
// the owner is told, and it has to name the way forward rather than leave the
// tap doing nothing.
export const releasedGoalDeleteRefusalCopy = (notice, lang = 'ar') => {
  const ar = lang === 'ar';
  const name = notice?.goalName;
  const on = notice?.releasedAt ? String(notice.releasedAt).slice(0, 10) : null;
  return {
    title: ar ? 'لا يمكن حذف هذه الحركة' : "This transaction can't be deleted",
    body: ar
      ? `${name ? `الهدف "${name}"` : 'هذا الهدف'} مكتمل وتم تحويل مبلغه إلى المحفظة${on ? ` بتاريخ ${on}` : ''}. حذف هذه الحركة كان سيترك الهدف يعرض مبلغاً لا تسنده أي حركة. للتعديل: افتح الهدف واختر "التراجع عن التحويل" أولاً، ثم احذف ما تريد.`
      : `${name ? `Goal "${name}"` : 'This goal'} was completed and its amount transferred to the wallet${on ? ` on ${on}` : ''}. Deleting this would leave the goal showing an amount no transaction supports. To change it: open the goal, choose "Undo transfer" first, then delete what you need.`,
  };
};

// Undoing a release, decided as pure data so it can be tested without a store.
//
// Releasing a reserve goal does not move cash: both the saving and the release
// transaction carry amt/walletAmount 0. What a saving does is RESERVE part of a
// wallet (getWalletAvailableBalances subtracts un-released goal allocations from
// availableBalance), and what the release does is free that reservation. So
// undoing a release means re-reserving — and that can only be honoured if the
// wallet still has that much available. If the owner spent the money after
// releasing it, re-reserving would drive available balance negative, so this
// refuses instead, naming the wallet and the shortfall.
//
// The goal's own savings list was emptied at release, but the saving
// transactions themselves were not deleted, so the list is rebuilt from them.
export const planGoalReleaseUndoV1 = ({
  goal = null, transactions = [], walletAvailableById = new Map(),
} = {}) => {
  if (!goal || goal.status !== 'released') {
    return { ok: false, reason: 'goal_not_released' };
  }
  const rows = (Array.isArray(transactions) ? transactions : []).filter(item => (
    item?.isGoalSaving && item.goalId === goal.id && item.savingId && !item.deletedAt
  ));
  if (!rows.length) {
    // Nothing survives to rebuild from. The saving transactions are voided
    // rather than erased, so recovering from voided rows is possible in
    // principle — deliberately out of scope here rather than guessed at.
    return { ok: false, reason: 'goal_release_undo_no_surviving_savings' };
  }

  const savings = rows.map(item => ({
    id: item.savingId,
    amt: Math.abs(Number(item.allocationAmount || 0)),
    date: item.dateISO || null,
    ts: Number(item.ts || 0),
    walletId: item.walletId || null,
    walletAmount: Math.abs(Number(item.allocationWalletAmount ?? item.allocationAmount ?? 0)),
    walletCurrency: item.walletCurrency || null,
    exchangeRate: item.exchangeRate,
  })).sort((a, b) => a.ts - b.ts);

  const perWallet = new Map();
  for (const saving of savings) {
    const key = saving.walletId || '';
    perWallet.set(key, (perWallet.get(key) || 0) + saving.walletAmount);
  }

  // Every wallet must be able to absorb its share. Checked for all of them
  // before returning, so the refusal names every shortfall rather than only
  // the first one the owner would then hit again.
  const shortfalls = [];
  for (const [walletId, amount] of perWallet) {
    if (amount <= 0) continue;
    const available = Number(walletAvailableById.get(walletId));
    if (!Number.isFinite(available) || available + 0.0001 < amount) {
      shortfalls.push({
        walletId,
        required: amount,
        available: Number.isFinite(available) ? available : null,
        shortfall: Number.isFinite(available) ? amount - available : null,
      });
    }
  }
  if (shortfalls.length) {
    return { ok: false, reason: 'goal_release_undo_insufficient_available', shortfalls };
  }

  const cur = Math.min(
    savings.reduce((total, item) => total + Math.abs(Number(item.amt) || 0), 0),
    Math.abs(Number(goal.target) || 0),
  );
  return {
    ok: true,
    savings,
    cur,
    // Back to 'settled', not 'active': the goal really did reach its target.
    // goalLifecycle re-derives from here normally, because only 'released'
    // short-circuits it.
    status: 'settled',
    reReserved: [...perWallet.entries()].map(([walletId, amount]) => ({ walletId, amount })),
  };
};

export const reopenCompletionCommitments = (commitments = [], links = []) => {
  const linkReasons = new Map((Array.isArray(links) ? links : [])
    .filter(link => link?.linkedType && link?.linkedId)
    .map(link => [`${link.linkedType}:${link.linkedId}`, link.endReason]));
  if (!linkReasons.size) return commitments;
  return (Array.isArray(commitments) ? commitments : []).map(item => {
    const reason = linkReasons.get(`${item.linkedType}:${item.linkedId}`);
    if (!reason || item.endReason !== reason) return item;
    const next = { ...item, active: true };
    delete next.endedAt;
    delete next.endReason;
    return next;
  });
};

export const daysSinceISO = (value, now = new Date()) => {
  const date = parseDateISO(value);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86400000));
};

export const isTrackerPastGracePeriod = (completedAt, now = new Date(), graceDays = TRACKER_COMPLETION_GRACE_DAYS) => {
  const age = daysSinceISO(completedAt, now);
  return age != null && age >= graceDays;
};

export const isSafelyArchivableTracker = (item = {}) => {
  if (item.kind === 'saving') {
    return ['released', 'settled'].includes(item.source?.status);
  }
  if (item.kind === 'monthly') {
    return item.source?.repeatMonthly === false && !!item.source?.lastPaidMonth;
  }
  return item.status === 'done';
};
