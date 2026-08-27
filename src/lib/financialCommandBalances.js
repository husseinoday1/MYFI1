import { getWalletAvailableBalances, getWalletBalances } from './wallets';
import { queryLedgerWalletPositions } from './activeLedgerRepository';
import { ARCHIVE_SCOPE } from './archiveScope';

export const commandWalletPosition = async ({
  cutover = false,
  namespace = 'guest',
  walletId,
  wallets = [],
  transactions = [],
  currency = 'IQD',
  defaultWalletId = null,
  excludeTransaction = null,
} = {}) => {
  if (!walletId) return null;
  if (cutover) {
    const sql = await queryLedgerWalletPositions({ namespace, archiveScope: ARCHIVE_SCOPE.ALL });
    if (sql?.supported) {
      const row = (sql.rows || []).find(item => item.id === walletId);
      if (!row) return null;
      let physicalBalance = Number(row.physicalBalance || 0);
      let reservedBalance = Number(row.reservedBalance || 0);
      if (excludeTransaction && excludeTransaction.kind === 'transfer' && excludeTransaction.fromWalletId === walletId) {
        physicalBalance += Math.abs(Number(excludeTransaction.transferFromAmount ?? excludeTransaction.transferAmount ?? 0));
        physicalBalance += Math.abs(Number(excludeTransaction.feeAmount || 0));
      }
      return {
        ...row,
        physicalBalance,
        reservedBalance,
        availableBalance: physicalBalance - reservedBalance,
      };
    }
  }
  const fallbackTransactions = excludeTransaction?.id
    ? transactions.filter(item => item?.id !== excludeTransaction.id)
    : transactions;
  return getWalletAvailableBalances(wallets, fallbackTransactions, currency, defaultWalletId)
    .find(item => item.id === walletId) || null;
};

export const commandWalletBalance = async ({
  cutover = false,
  namespace = 'guest',
  walletId,
  wallets = [],
  transactions = [],
  currency = 'IQD',
  defaultWalletId = null,
} = {}) => {
  if (!walletId) return null;
  if (cutover) {
    const sql = await queryLedgerWalletPositions({ namespace, archiveScope: ARCHIVE_SCOPE.ALL });
    if (sql?.supported) {
      const row = (sql.rows || []).find(item => item.id === walletId);
      if (!row) return null;
      return { ...row, balance: Number(row.physicalBalance || 0) };
    }
  }
  return getWalletBalances(wallets, transactions, currency, defaultWalletId)
    .find(item => item.id === walletId) || null;
};
