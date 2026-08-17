const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');

const projectRoot = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(projectRoot, 'src/lib/financialMutationSync.js');

const repositoryMock = {
  acknowledgeLedgerMutationsV7: async () => 0,
  failLedgerMutationV7: async () => true,
  getLedgerSyncCursorV7: async () => 0,
  readPendingLedgerMutationsV7: async () => [],
  applyRemoteLedgerMutationsV7: async ({ mutations = [] }) => {
    const latest = mutations.reduce((value, row) => Math.max(
      value,
      Number(row.serverSequence || row.server_sequence || 0),
    ), 0);
    return { supported: true, ok: true, applied: mutations.length, cursor: latest };
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === './financialLedgerV7Repository' && parent?.filename === target) return repositoryMock;
  return originalLoad.call(this, request, parent, isMain);
};

const source = babel.transformFileSync(target, {
  babelrc: false,
  configFile: false,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
}).code;
const mod = new Module(target, module);
mod.filename = target;
mod.paths = Module._nodeModulePaths(path.dirname(target));
mod._compile(source, target);

const { syncFinancialMutationsV7 } = mod.exports;

const response = ({ seq = 0, hasMore = false }) => ({
  acceptedMutationIds: [],
  remoteMutations: seq ? [{
    mutationId: `remote-${seq}`,
    serverSequence: seq,
    entityType: 'goal',
    entityId: 'goal-1',
    operation: 'upsert',
    entityRevision: seq,
    payloadVersion: 7,
    payload: { id: 'goal-1', revision: seq },
  }] : [],
  latestSequence: seq,
  hasMore,
});

(async () => {
  let calls = 0;
  const paged = {
    rpc: async () => {
      calls += 1;
      return { data: response({ seq: calls, hasMore: calls < 2 }), error: null };
    },
  };
  const complete = await syncFinancialMutationsV7({
    supabase: paged,
    namespace: 'user:test',
    deviceId: 'device-a',
    maxPages: 3,
  });
  assert.equal(complete.ok, true);
  assert.equal(complete.pages, 2);
  assert.equal(complete.cursor, 2);
  assert.equal(complete.hasMore, false);

  calls = 0;
  const endless = {
    rpc: async () => {
      calls += 1;
      return { data: response({ seq: calls, hasMore: true }), error: null };
    },
  };
  const exhausted = await syncFinancialMutationsV7({
    supabase: endless,
    namespace: 'user:test',
    deviceId: 'device-a',
    maxPages: 2,
  });
  assert.equal(exhausted.ok, false);
  assert.equal(exhausted.reason, 'financial_mutation_sync_page_budget_exhausted');
  assert.equal(exhausted.pages, 2);
  assert.equal(exhausted.hasMore, true);

  const stalled = {
    rpc: async () => ({ data: response({ seq: 0, hasMore: true }), error: null }),
  };
  const stalledResult = await syncFinancialMutationsV7({
    supabase: stalled,
    namespace: 'user:test',
    deviceId: 'device-a',
    maxPages: 3,
  });
  assert.equal(stalledResult.ok, false);
  assert.equal(stalledResult.reason, 'financial_mutation_sync_cursor_stalled');
  assert.equal(stalledResult.pages, 1);
  assert.equal(stalledResult.hasMore, true);

  console.log('MYFI P19-002 SYNC PAGING RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
