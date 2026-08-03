export const filterTransactionsByPeriod = (transactions = [], scope = 'month', selectedDate = new Date()) => {
  const baseDate = selectedDate instanceof Date ? selectedDate : new Date(String(selectedDate));
  if (Number.isNaN(baseDate.getTime())) return [];

  return (Array.isArray(transactions) ? transactions : []).filter(item => {
    const date = item?.dateISO ? new Date(`${item.dateISO}T12:00:00`) : null;
    if (!date || Number.isNaN(date.getTime())) return false;
    if (scope === 'month') {
      return date.getMonth() === baseDate.getMonth() && date.getFullYear() === baseDate.getFullYear();
    }
    if (scope === 'year') {
      return date.getFullYear() === baseDate.getFullYear();
    }
    return true;
  });
};
