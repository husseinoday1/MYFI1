// MYFI_ARCHIVE_BALANCE_PARITY_P11B
// Phase 11-B, step 1. Before any wallet stops reading its balance from
// `openingBalance + hot-array movement`, we have to know that the canonical
// posting sum already agrees with it — on real data, not in principle.
//
// §73 says archiving may not change the wallet balance. Phase 11-B removes the
// mechanism that currently keeps that true by accident (commitYearArchive folding
// the archived movement back into openingBalance). Swapping the source without
// first proving the two agree would silently move real balances, which is exactly
// what the D3 ruling forbids: an explicit, evidenced migration, never a silent
// repair.
//
// So this module only ever *reports*. It has no repair path, by design — if the
// two sources disagree, that is a finding for a human, not something to paper over.

import { getWalletBalances } from './wallets';
import { moneyToMinor } from './financialCoreV2';

// The canonical balance: every physical posting on the account, with no archive
// predicate. §74 — "Wallet Balance uses ALL financial postings always."
export const canonicalWalletBalancesMinor = (postings = []) => {
  const totals = new Map();
  for (const posting of Array.isArray(postings) ? postings : []) {
    if (posting?.bucket !== 'physical') continue;
    const accountId = String(posting.accountId ?? posting.account_id ?? '');
    if (!accountId) continue;
    const amount = Number(posting.amountMinor ?? posting.amount_minor ?? 0);
    if (!Number.isSafeInteger(amount)) continue;
    totals.set(accountId, (totals.get(accountId) || 0) + amount);
  }
  return totals;
};

// The legacy balance, in minor units so the two are comparable without float noise.
export const legacyWalletBalancesMinor = ({
  wallets = [], transactions = [], baseCurrency = 'IQD', defaultWalletId = null,
} = {}) => {
  const rows = getWalletBalances(wallets, transactions, baseCurrency, defaultWalletId);
  return new Map(rows.map(row => [
    String(row.id),
    moneyToMinor(Number(row.balance || 0), row.currency || baseCurrency),
  ]));
};

/**
 * Compare the two sources wallet by wallet.
 *
 * Returns exact amounts — this is for tests, migration verification and local
 * inspection. Anything that gets logged, persisted or pasted into an evidence
 * file must go through `summarizeParityForDiagnostics` first (Standing Rule 6).
 */
export const compareWalletBalanceParity = ({
  wallets = [], transactions = [], postings = [], baseCurrency = 'IQD', defaultWalletId = null,
} = {}) => {
  const legacy = legacyWalletBalancesMinor({ wallets, transactions, baseCurrency, defaultWalletId });
  const canonical = canonicalWalletBalancesMinor(postings);
  const walletIds = [...new Set([...legacy.keys(), ...canonical.keys()])].sort();

  const rows = walletIds.map(walletId => {
    // A wallet present in one source but not the other is a mismatch, not a zero.
    // Treating "absent" as 0 would hide the most interesting failure: an account
    // that exists canonically but never reached the hot workspace, or vice versa.
    const inLegacy = legacy.has(walletId);
    const inCanonical = canonical.has(walletId);
    const legacyMinor = legacy.get(walletId) ?? null;
    const canonicalMinor = canonical.get(walletId) ?? null;
    const matches = inLegacy && inCanonical && legacyMinor === canonicalMinor;
    return {
      walletId,
      inLegacy,
      inCanonical,
      legacyMinor,
      canonicalMinor,
      deltaMinor: inLegacy && inCanonical ? canonicalMinor - legacyMinor : null,
      matches,
    };
  });

  const mismatched = rows.filter(row => !row.matches);
  return {
    ok: mismatched.length === 0,
    checked: rows.length,
    matched: rows.length - mismatched.length,
    rows,
    mismatchedWalletIds: mismatched.map(row => row.walletId),
  };
};

/**
 * Standing Rule 6: a parity result carries wallet balances, so the raw object must
 * never reach a log, an acceptance payload or an evidence document. This reduces it
 * to shape and identity — counts and wallet ids, no amounts and no deltas.
 */
export const summarizeParityForDiagnostics = (result = {}) => ({
  ok: !!result.ok,
  checked: Number(result.checked || 0),
  matched: Number(result.matched || 0),
  mismatched: Array.isArray(result.mismatchedWalletIds) ? result.mismatchedWalletIds.length : 0,
  // Ids identify which wallet to look at without disclosing what is in it.
  mismatchedWalletIds: Array.isArray(result.mismatchedWalletIds) ? [...result.mismatchedWalletIds] : [],
});
