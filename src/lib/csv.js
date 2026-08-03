import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { getTransactionDisplayAmount } from './modules';
import { getTransactionTagLabel } from './transactionTags';

const csvCell = (value) => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const writeAndShareCsv = async (csv, name, dialogTitle) => {
  if (!FileSystem.documentDirectory) {
    throw new Error('CSV storage is unavailable');
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('File sharing is unavailable');
  }
  const uri = `${FileSystem.documentDirectory}${name}_${Date.now()}.csv`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle,
    UTI: 'public.comma-separated-values-text',
  });
  return uri;
};

export const transactionsToCsv = (trans = [], cats = [], wallets = [], cfg = {}) => {
  const catMap = new Map(cats.map(cat => [cat.id, cfg.lang === 'ar' ? cat.label : cat.labelEn]));
  const walletMap = new Map(wallets.map(wallet => [wallet.id, wallet.name || wallet.nameEn || wallet.id]));
  const headers = ['date', 'title', 'amount', 'type', 'transaction_tag', 'category', 'wallet', 'note'];
  const rows = [...trans]
    .sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')))
    .map(tx => [
      tx.dateISO || '',
      tx.kind === 'transfer' ? 'Wallet transfer' : tx.title || '',
      getTransactionDisplayAmount(tx),
      tx.kind === 'transfer' ? 'transfer' : tx.flowType || (Number(tx.amt || 0) >= 0 ? 'income' : 'expense'),
      getTransactionTagLabel(tx, cfg.lang),
      catMap.get(tx.cat) || tx.cat || '',
      walletMap.get(tx.walletId) || tx.walletId || '',
      tx.note || '',
    ]);
  return `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}`;
};

export const shareCsv = async ({ trans, cats, wallets, cfg, name = 'myfi_transactions' }) => {
  const csv = transactionsToCsv(trans, cats, wallets, cfg);
  return writeAndShareCsv(csv, name, 'MYFI CSV');
};

export const shareComparisonCsv = async ({ periods = [], cfg = {}, name = 'myfi_comparison' }) => {
  const ar = cfg.lang === 'ar';
  const headers = ar
    ? ['الفترة', 'الدخل', 'المصروف', 'الصافي', 'نسبة الادخار']
    : ['period', 'income', 'expense', 'net', 'savings_rate'];
  const rows = periods.map(item => [
    item.label || item.key || '',
    Number(item.inc || 0),
    Number(item.exp || 0),
    Number(item.bal || 0),
    `${Number(item.savingsRate || 0)}%`,
  ]);
  const csv = `\uFEFF${[headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')}`;
  return writeAndShareCsv(csv, name, ar ? 'مقارنة MYFI' : 'MYFI comparison');
};
