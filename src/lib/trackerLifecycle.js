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
