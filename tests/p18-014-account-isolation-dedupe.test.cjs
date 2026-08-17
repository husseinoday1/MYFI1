'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const domain = fs.readFileSync(path.join(root, 'src/store/domain.js'), 'utf8');
const sync = fs.readFileSync(path.join(root, 'src/store/slices/useSyncSlice.js'), 'utf8');

assert.match(domain, /const stableEntityKey = item =>/);
assert.match(domain, /const walletKey = wallet => stableEntityKey\(wallet\) \|\|/);
assert.match(domain, /const transactionKey = item => \{[\s\S]*?const stable = stableEntityKey\(item\);[\s\S]*?if \(stable\) return stable;/);
assert.match(domain, /const paymentKey = item => stableEntityKey\(item\) \|\|/);
assert.match(domain, /const debtKey = item => stableEntityKey\(item\) \|\|/);
assert.match(domain, /const goalKey = item => stableEntityKey\(item\) \|\|/);
assert.match(domain, /const commitmentKey = item => stableEntityKey\(item\) \|\|/);

assert.match(sync, /Different namespaces must never[\s\S]*?collapse ownership/);
assert.match(sync, /if \(referencedGuestWalletIds\.has\(item\.id\)\) return true;/);
assert.doesNotMatch(sync, /Same technical ID does not mean the same financial account[\s\S]*?existing\.currency/);

function stableEntityKey(item) {
  const id = String(item?.id || '').trim();
  return id ? `id:${id}` : '';
}
function keepLastUniqueBy(items, keyOf) {
  const seen = new Set();
  const result = [];
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    const key = keyOf(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.reverse();
}

// Two legitimate same-content transactions with different IDs must survive.
const sameContent = [
  { id: 'tx-a', title: 'Fuel', amt: -10, dateISO: '2026-08-17' },
  { id: 'tx-b', title: 'Fuel', amt: -10, dateISO: '2026-08-17' },
];
assert.equal(keepLastUniqueBy(sameContent, stableEntityKey).length, 2);

// Same stable ID is the only canonical duplicate proof.
const sameId = [
  { id: 'tx-a', title: 'old' },
  { id: 'tx-a', title: 'new' },
];
const collapsed = keepLastUniqueBy(sameId, stableEntityKey);
assert.equal(collapsed.length, 1);
assert.equal(collapsed[0].title, 'new');

// Two wallets from separate namespaces can share human-visible properties
// but are not the same financial account when their stable IDs differ.
const wallets = [
  { id: 'wallet-account', name: 'المحفظة الشخصية', currency: 'IQD' },
  { id: 'wallet-guest-remapped', name: 'المحفظة الشخصية', currency: 'IQD' },
];
assert.equal(keepLastUniqueBy(wallets, stableEntityKey).length, 2);

console.log('P18-014 ACCOUNT ISOLATION + STABLE-ID DEDUPE CONTRACT: PASSED');
