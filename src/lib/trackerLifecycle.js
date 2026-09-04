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
