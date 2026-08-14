import { asDate } from './dateCore';

const monthKeyFor = (date = new Date()) => {
  const safeDate = asDate(date);
  return `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
};

export const isCurrentMonthTransaction = (transaction = {}, date = new Date()) => (
  String(transaction.dateISO || '').slice(0, 7) === monthKeyFor(date)
);
