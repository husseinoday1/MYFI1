import { daysInMonth, isISODate, normalizeDate, today } from '../utils/calc';

const clampDay = (value) => {
  const n = Math.round(Math.abs(Number(value) || 1));
  return Math.max(1, Math.min(31, n));
};

const dayFromISO = (value) => {
  const safe = normalizeDate(value);
  return clampDay(new Date(`${safe}T12:00:00`).getDate());
};

const normalizeLinkedType = (value) =>
  ['debt', 'receivable', 'goal'].includes(value) ? value : 'none';

export const monthKey = (dateISO = today()) => {
  const safe = normalizeDate(dateISO);
  return safe.slice(0, 7);
};

export const addDaysISO = (dateISO = today(), days = 0) => {
  const safe = normalizeDate(dateISO);
  const d = new Date(`${safe}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
};

export const addMonthsISO = (dateISO = today(), months = 1) => {
  const safe = normalizeDate(dateISO);
  const source = new Date(`${safe}T12:00:00`);
  const target = new Date(source.getFullYear(), source.getMonth() + Number(months || 0), 1, 12, 0, 0);
  const day = Math.min(source.getDate(), daysInMonth(target.getMonth(), target.getFullYear()));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const normalizeCommitments = (items = [], fallbackWalletId = null) =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && (item.name || Number(item.amt || 0)))
    .map(item => {
      const firstDueISO = item.firstDueISO ? normalizeDate(item.firstDueISO) : null;
      const linkedType = normalizeLinkedType(item.linkedType);
      return {
        ...item,
        name: String(item.name || '').trim() || 'التزام شهري',
        amt: Math.abs(Number(item.amt || 0)),
        firstDueISO,
        day: firstDueISO ? dayFromISO(firstDueISO) : clampDay(item.day),
        cat: item.cat || 'other',
        walletId: item.walletId || fallbackWalletId,
        linkedType,
        linkedId: linkedType === 'none' ? null : item.linkedId || null,
        deferredUntilISO: isISODate(item.deferredUntilISO) ? item.deferredUntilISO : null,
        repeatMonthly: item.repeatMonthly !== false,
        active: item.active !== false,
        createdAt: normalizeDate(item.createdAt || today()),
      };
    });

const applyDeferredDue = (baseDueISO, commitment = {}) => {
  const deferredUntilISO = isISODate(commitment.deferredUntilISO) ? commitment.deferredUntilISO : null;
  return deferredUntilISO && deferredUntilISO > baseDueISO ? deferredUntilISO : baseDueISO;
};

export const commitmentDueISO = (commitment = {}, date = new Date()) => {
  const firstDueISO = commitment.firstDueISO ? normalizeDate(commitment.firstDueISO) : null;
  if (commitment.repeatMonthly === false && firstDueISO) return applyDeferredDue(firstDueISO, commitment);
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = Math.min(clampDay(commitment.day), daysInMonth(month, year));
  const dueISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const baseDueISO = firstDueISO && dueISO < firstDueISO ? firstDueISO : dueISO;
  return applyDeferredDue(baseDueISO, commitment);
};

export const deferredCommitmentDueISO = (commitment = {}, option = 'day', date = new Date()) => {
  const dueISO = commitmentDueISO(commitment, date);
  const todayISO = today();
  const anchorISO = dueISO < todayISO ? todayISO : dueISO;
  if (option === 'three_days') return addDaysISO(anchorISO, 3);
  if (option === 'next_month') {
    let nextISO = addMonthsISO(dueISO, 1);
    while (nextISO <= todayISO) nextISO = addMonthsISO(nextISO, 1);
    return nextISO;
  }
  return addDaysISO(anchorISO, 1);
};

export const getUpcomingCommitments = (items = [], date = new Date()) =>
  normalizeCommitments(items)
    .filter(item => item.active && item.amt > 0)
    .map(item => {
      if (!item.repeatMonthly && item.lastPaidMonth) return null;
      const dueISO = commitmentDueISO(item, date);
      const dueDate = new Date(`${dueISO}T12:00:00`);
      const key = monthKey(dueISO);
      return {
        ...item,
        dueISO,
        paidThisMonth: item.lastPaidMonth === key,
        daysUntil: Math.ceil((dueDate - date) / 86400000),
      };
    })
    .filter(Boolean)
    .filter(item => !item.paidThisMonth)
    .sort((a, b) => a.daysUntil - b.daysUntil);
