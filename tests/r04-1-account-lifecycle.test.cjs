const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const assert = require('assert').strict;

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const filename = path.join(root, 'src/lib/accountWorkspace.js');
const source = babel.transformFileSync(filename, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const mod = new Module(filename, module);
mod.filename = filename;
mod.paths = Module._nodeModulePaths(path.dirname(filename));
mod._compile(source, filename);

const {
  accountIdFromWorkspaceNamespace,
  resolveWorkspaceTransition,
} = mod.exports;

assert.equal(accountIdFromWorkspaceNamespace('user:abc-123'), 'abc-123');
assert.equal(accountIdFromWorkspaceNamespace('guest'), null);

assert.deepEqual(
  resolveWorkspaceTransition({
    currentNamespace: 'user:account-a',
    currentLinkedUserId: 'account-a',
    nextUserId: null,
  }),
  {
    namespace: 'user:account-a',
    linkedUserId: 'account-a',
    preserveCurrent: true,
    accountSwitch: false,
    shouldOfferGuestTransfer: false,
  },
  'logout must preserve the same active local ledger',
);

assert.deepEqual(
  resolveWorkspaceTransition({
    currentNamespace: 'user:account-a',
    currentLinkedUserId: 'account-a',
    nextUserId: 'account-a',
  }),
  {
    namespace: 'user:account-a',
    linkedUserId: 'account-a',
    preserveCurrent: true,
    accountSwitch: false,
    shouldOfferGuestTransfer: false,
  },
  'same-account re-login must reuse the mounted ledger without Guest merge',
);

assert.deepEqual(
  resolveWorkspaceTransition({
    currentNamespace: 'user:account-a',
    currentLinkedUserId: 'account-a',
    nextUserId: 'account-b',
  }),
  {
    namespace: 'user:account-b',
    linkedUserId: 'account-b',
    preserveCurrent: false,
    accountSwitch: true,
    shouldOfferGuestTransfer: false,
  },
  'switching accounts must select the new account ledger without treating the old ledger as Guest',
);

assert.deepEqual(
  resolveWorkspaceTransition({
    currentNamespace: 'guest',
    currentLinkedUserId: null,
    nextUserId: 'account-a',
  }),
  {
    namespace: 'user:account-a',
    linkedUserId: 'account-a',
    preserveCurrent: false,
    accountSwitch: false,
    shouldOfferGuestTransfer: true,
  },
  'only a true unlinked Guest ledger may offer Guest to Account transfer',
);

const sync = read('src/store/slices/useSyncSlice.js');
assert(sync.includes('ACTIVE_LOCAL_LEDGER_CONTEXT_KEY'), 'account/ledger link is not persisted independently from auth');
assert(sync.includes('disconnectCloudSession: async'), 'logout still has no explicit cloud-session-only action');
assert(sync.includes('resolveWorkspaceTransition'), 'runtime does not use the lifecycle state machine');
assert(sync.includes('transition.shouldOfferGuestTransfer'), 'Guest transfer is not gated by the transition decision');

const settings = read('src/screens/SettingsScreen.js');
assert(settings.includes('disconnectCloudSession'), 'Settings does not use the safe cloud-disconnect action');
assert(settings.includes('openRequest'), 'Settings cannot receive a direct Account/Security route');

const center = read('src/components/HomeCenterModal.js');
assert(center.includes("onOpenSettingsPage?.('account')"), 'Account & Security does not route directly to the account page');
assert(!center.includes("onOpenTab?.('settings')"), 'Account & Security still falls back to generic Settings');

const app = read('App.js');
assert(app.includes('settingsOpenRequest'), 'App shell has no Settings deep-link request');
assert(app.includes("openSettingsPage('account')") || app.includes('onOpenSettingsPage={openSettingsPage}'), 'Home cannot request the Account page');

console.log('MYFI R04.1 P04R1-001 ACCOUNT/LIFECYCLE REGRESSION: PASSED');
