// Regression test for a real bug found via live device testing on 2026-09-10:
// enabling biometric app lock worked for the rest of that session, then silently
// reverted to off after the app was fully killed (Recent Apps swipe / force-stop)
// and relaunched.
//
// Root cause: persistFinancialLocalPreferencesV7() only ran an UPDATE against
// ledger_workspace_state_v7. A namespace's row there is normally created by the
// first full (non-localOnly) V7 workspace commit -- typically a currency change
// or a financial mutation. A brand-new namespace whose very first write is a
// UI-only preference (bioLock, before any financial activity) has no row yet,
// so the UPDATE silently matched nothing and the function returned false.
// saveLocal() turned that into a thrown error -- but only after coreSet() had
// already applied the change to in-memory Zustand state, so the toggle looked
// like it worked for the rest of that live session and was lost on next cold
// start, when config is reloaded from that same (never-written) row.
//
// This loads financialLedgerV7Repository.js against a real in-memory SQLite
// database (node:sqlite), not a mock, using the same react-native/expo-sqlite
// stubbing technique as tests/run-financial-ledger-v7.cjs and the same
// AsyncDatabase shim as tests/financial-ledger-migration-runtime.test.cjs.
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const { DatabaseSync } = require('node:sqlite');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'react-native') return { Platform: { OS: 'android' } };
  if (request === 'expo-sqlite') return {};
  return originalLoad.call(this, request, parent, isMain);
};

const transform = filename => babel.transformFileSync(filename, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;

const originalJs = require.extensions['.js'];
require.extensions['.js'] = (targetModule, filename) => {
  if (filename.includes(`${path.sep}src${path.sep}`)) {
    targetModule._compile(transform(filename), filename);
    return;
  }
  originalJs(targetModule, filename);
};

const repoPath = path.join(__dirname, '..', 'src', 'lib', 'financialLedgerV7Repository.js');
const {
  ensureFinancialLedgerV7,
  persistFinancialLocalPreferencesV7,
  readFinancialWorkspaceV7,
} = require(repoPath);

class AsyncDatabase {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  async execAsync(sql) { this.db.exec(sql); }
  async runAsync(sql, ...args) { return this.db.prepare(sql).run(...args); }
  async getFirstAsync(sql, ...args) { return this.db.prepare(sql).get(...args) || null; }
  async getAllAsync(sql, ...args) { return this.db.prepare(sql).all(...args); }
  async withExclusiveTransactionAsync(callback) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      await callback(this);
      this.db.exec('COMMIT');
    } catch (error) {
      try { this.db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }
  close() { this.db.close(); }
}

(async () => {
  const database = new AsyncDatabase();
  await ensureFinancialLedgerV7(database);

  const rowCountBefore = (await database.getFirstAsync(
    `SELECT count(*) as n FROM ledger_workspace_state_v7 WHERE namespace=?`, 'guest',
  )).n;
  assert.equal(rowCountBefore, 0, 'precondition: this is a brand-new namespace with no workspace row yet');

  // The exact reproduction: a UI-only preference write on a namespace that has
  // never had a financial mutation or currency change reach the full V7 commit.
  const ok = await persistFinancialLocalPreferencesV7({
    namespace: 'guest',
    cfg: { bioLock: true, lockDelaySeconds: 0 },
    notif: {},
    database,
  });
  assert.equal(ok, true, 'must succeed on a namespace with no pre-existing workspace row, not silently no-op');

  const row = await database.getFirstAsync(
    `SELECT payload_json FROM ledger_workspace_state_v7 WHERE namespace=?`, 'guest',
  );
  assert.ok(row, 'a workspace row must now exist for the namespace');
  const payload = JSON.parse(row.payload_json);
  assert.equal(payload.localPreferences?.cfg?.bioLock, true, 'the preference must actually be stored, not just report success');

  // This is what a cold start reads from -- if this does not see bioLock:true,
  // relaunching the app after this "session" would revert the toggle exactly
  // like the reported bug.
  const projection = await readFinancialWorkspaceV7({ namespace: 'guest', database });
  assert.equal(
    projection.workspace.cfg?.bioLock, true,
    'a cold-start projection read must see the preference that was just persisted',
  );

  // The pre-existing (already-working) update path must still work unchanged:
  // persisting again must update the same row, not create a second one.
  const ok2 = await persistFinancialLocalPreferencesV7({
    namespace: 'guest',
    cfg: { bioLock: false, lockDelaySeconds: 300 },
    notif: {},
    database,
  });
  assert.equal(ok2, true);
  const rowCountAfter = (await database.getFirstAsync(
    `SELECT count(*) as n FROM ledger_workspace_state_v7 WHERE namespace=?`, 'guest',
  )).n;
  assert.equal(rowCountAfter, 1, 'a second write to the same namespace must update in place, not duplicate the row');
  const projection2 = await readFinancialWorkspaceV7({ namespace: 'guest', database });
  assert.equal(projection2.workspace.cfg?.bioLock, false, 'the update path must still overwrite correctly');

  database.close();
  console.log('MaalFlow financial-ledger-v7 local-preferences persistence: PASS');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
