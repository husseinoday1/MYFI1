const monthKeyFor = (date = new Date()) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
);

export const isCurrentMonthTransaction = (transaction = {}, date = new Date()) => (
  String(transaction.dateISO || '').slice(0, 7) === monthKeyFor(date)
);
