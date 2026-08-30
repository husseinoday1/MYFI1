import { DEFAULT_WALLET_ID } from './wallets.js';

// Completing onboarding must never assume that a just-created or restored
// workspace already contains the seed wallet. This helper is intentionally
// framework-free so the branch is exercised with real mocked mutations.
export const ensureOnboardingWallet = async ({
  wallets = [],
  currency,
  scope,
  name,
  editWallet,
  addWallet,
  setCfg,
}) => {
  const list = Array.isArray(wallets) ? wallets : [];
  const existing = list.find(wallet => wallet?.id === DEFAULT_WALLET_ID) || list[0] || null;
  const result = existing
    ? await editWallet(existing.id, { currency, scope, name, nameEn: name })
    : await addWallet({ name, nameEn: name, currency, scope, openingBalance: 0, valuationRate: 1 });

  if (!result) return { ok: false, reason: existing ? 'wallet_update_failed' : 'wallet_create_failed' };
  const walletId = existing?.id || result.id;
  if (!walletId) return { ok: false, reason: 'wallet_id_missing' };
  const selection = await setCfg({ defaultWalletId: walletId });
  if (selection?.ok === false) return { ok: false, reason: selection.reason || 'default_wallet_save_failed' };
  return { ok: true, walletId, created: !existing };
};
