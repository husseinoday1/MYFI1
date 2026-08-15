import { asDate, daysInMonth, isISODate, normalizeDate, today } from './dateCore';
import { normalizeCurrencyCode } from './financialCoreV2';

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

const isMonthKey = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

const dateToISO = (date = new Date()) => {
  const safe = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${safe.getFullYear()}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getDate()).padStart(2, '0')}`;
};

export const monthKey = (dateISO = today()) => {
  const safe = normalizeDate(dateISO);
  return safe.slice(0, 7);
};

export const monthsBetween = (from = new Date(), toISO = today()) => {
  const start = from instanceof Date && !Number.isNaN(from.getTime()) ? from : new Date();
  const target = new Date(`${normalizeDate(toISO)}T12:00:00`);
  return ((target.getFullYear() - start.getFullYear()) * 12) + target.getMonth() - start.getMonth();
};

export const formatCommitmentMonth = (dateISO = today(), lang = 'ar') => {
  const date = new Date(`${normalizeDate(dateISO)}T12:00:00`);
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', {
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return monthKey(dateISO);
  }
};

export const formatCommitmentDate = (dateISO = today(), lang = 'ar') => {
  const date = new Date(`${normalizeDate(dateISO)}T12:00:00`);
  try {
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-IQ' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return normalizeDate(dateISO);
  }
};

export const addDaysISO = (dateISO = today(), days = 0) => {
  const safe = normalizeDate(dateISO);
  const date = new Date(`${safe}T12:00:00`);
  date.setDate(date.getDate() + Number(days || 0));
  return dateToISO(date);
};

export const addMonthsISO = (dateISO = today(), months = 1) => {
  const safe = normalizeDate(dateISO);
  const source = new Date(`${safe}T12:00:00`);
  const target = new Date(source.getFullYear(), source.getMonth() + Number(months || 0), 1, 12, 0, 0);
  const day = Math.min(source.getDate(), daysInMonth(target.getMonth(), target.getFullYear()));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const commitmentCycleMonth = (commitment = {}, date = new Date()) => {
  if (isMonthKey(commitment.deferredCycleMonth)) return commitment.deferredCycleMonth;
  if (isMonthKey(commitment.lastPaidMonth)) {
    return monthKey(addMonthsISO(`${commitment.lastPaidMonth}-01`, 1));
  }
  if (commitment.firstDueISO) return monthKey(commitment.firstDueISO);
  return monthKey(dateToISO(date));
};

export const normalizeCommitments = (items = [], fallbackWalletId = null, fallbackCurrency = 'IQD') =>
  (Array.isArray(items) ? items : [])
    .filter(item => item && (item.name || Number(item.amt || 0)))
    .map(item => {
      const firstDueISO = item.firstDueISO ? normalizeDate(item.firstDueISO) : null;
      const linkedType = normalizeLinkedType(item.linkedType);
      return {
        ...item,
        name: String(item.name || '').trim() || 'التزام شهري',
        amt: Math.abs(Number(item.amt || 0)),
        currencyCode: normalizeCurrencyCode(item.currencyCode || item.currency, fallbackCurrency),
        firstDueISO,
        day: firstDueISO ? dayFromISO(firstDueISO) : clampDay(item.day),
        cat: item.cat || 'other',
        walletId: item.walletId || fallbackWalletId,
        linkedType,
        linkedId: linkedType === 'none' ? null : item.linkedId || null,
        deferredUntilISO: isISODate(item.deferredUntilISO) ? item.deferredUntilISO : null,
        deferredCycleMonth: isMonthKey(item.deferredCycleMonth) ? item.deferredCycleMonth : null,
        lastPaidMonth: isMonthKey(item.lastPaidMonth) ? item.lastPaidMonth : null,
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
  const safeDate = asDate(date);
  const firstDueISO = commitment.firstDueISO ? normalizeDate(commitment.firstDueISO) : null;
  if (commitment.repeatMonthly === false && firstDueISO) return applyDeferredDue(firstDueISO, commitment);
  const cycleMonth = commitmentCycleMonth(commitment, safeDate);
  const [yearValue, monthValue] = cycleMonth.split('-').map(Number);
  const year = yearValue || safeDate.getFullYear();
  const month = Math.max(0, (monthValue || safeDate.getMonth() + 1) - 1);
  const day = Math.min(clampDay(commitment.day), daysInMonth(month, year));
  const baseDueISO = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const deferredUntilISO = isISODate(commitment.deferredUntilISO)
    && (!commitment.deferredCycleMonth || commitment.deferredCycleMonth === cycleMonth)
    ? commitment.deferredUntilISO
    : null;
  return deferredUntilISO && deferredUntilISO > baseDueISO ? deferredUntilISO : baseDueISO;
};

export const deferredCommitmentDueISO = (commitment = {}, option = 'day', date = new Date()) => {
  const safeDate = asDate(date);
  const dueISO = commitmentDueISO(commitment, safeDate);
  const todayISO = dateToISO(safeDate);
  const anchorISO = dueISO < todayISO ? todayISO : dueISO;
  if (option === 'day') return addDaysISO(anchorISO, 1);
  if (option === 'three_days') return addDaysISO(anchorISO, 3);
  let nextISO = addMonthsISO(dueISO, 1);
  while (monthKey(nextISO) <= monthKey(todayISO)) nextISO = addMonthsISO(nextISO, 1);
  return nextISO;
};

export const getUpcomingCommitments = (items = [], date = new Date()) => {
  const safeDate = asDate(date);
  return normalizeCommitments(items)
    .filter(item => item.active && item.amt > 0)
    .map(item => {
      if (!item.repeatMonthly && item.lastPaidMonth) return null;
      const dueISO = commitmentDueISO(item, safeDate);
      const dueDate = new Date(`${dueISO}T12:00:00`);
      const key = monthKey(dueISO);
      const monthsUntil = monthsBetween(safeDate, dueISO);
      const daysUntil = Math.ceil((dueDate - safeDate) / 86400000);
      const isDeferred = isISODate(item.deferredUntilISO) && item.deferredUntilISO === dueISO;
      return {
        ...item,
        dueISO,
        dueMonth: key,
        cycleMonth: commitmentCycleMonth(item, safeDate),
        paidThisMonth: item.lastPaidMonth === key,
        monthsUntil,
        daysUntil,
        isDeferred,
        deferredDaysUntil: isDeferred ? daysUntil : null,
        actionable: monthsUntil < 0 || (monthsUntil === 0 && (!isDeferred || daysUntil <= 0)),
      };
    })
    .filter(Boolean)
    .filter(item => !item.paidThisMonth)
    .sort((a, b) => a.monthsUntil - b.monthsUntil || a.dueISO.localeCompare(b.dueISO));
};
