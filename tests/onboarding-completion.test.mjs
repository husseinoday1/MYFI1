import assert from 'node:assert/strict';
import { ensureOnboardingWallet } from '../src/lib/onboardingCompletion.js';

;(async () => {
const calls = [];
const setCfg = async patch => { calls.push(['cfg', patch]); return { ok: true }; };

const created = await ensureOnboardingWallet({
  wallets: [], currency: 'IQD', scope: 'personal', name: 'المحفظة الرئيسية',
  editWallet: async () => { throw new Error('must not edit a missing wallet'); },
  addWallet: async draft => { calls.push(['add', draft]); return { id: 'created-wallet' }; },
  setCfg,
});
assert.deepEqual(created, { ok: true, walletId: 'created-wallet', created: true });
assert.equal(calls[0][0], 'add');
assert.deepEqual(calls[1], ['cfg', { defaultWalletId: 'created-wallet' }]);

let editedId = null;
const updated = await ensureOnboardingWallet({
  wallets: [{ id: 'wallet_cash', currency: 'IQD' }], currency: 'IQD', scope: 'personal', name: 'رئيسية',
  editWallet: async (id, patch) => { editedId = id; assert.equal(patch.name, 'رئيسية'); return true; },
  addWallet: async () => { throw new Error('must not create when the seed wallet exists'); },
  setCfg: async patch => { assert.deepEqual(patch, { defaultWalletId: 'wallet_cash' }); return { ok: true }; },
});
assert.deepEqual(updated, { ok: true, walletId: 'wallet_cash', created: false });
assert.equal(editedId, 'wallet_cash');

const failed = await ensureOnboardingWallet({
  wallets: [], currency: 'IQD', scope: 'personal', name: 'رئيسية',
  editWallet: async () => true,
  addWallet: async () => false,
  setCfg,
});
assert.deepEqual(failed, { ok: false, reason: 'wallet_create_failed' });

console.log('onboarding completion: all assertions passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
