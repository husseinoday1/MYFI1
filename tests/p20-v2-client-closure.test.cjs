const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || '.');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const must = (value, label) => {
  if (!value) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
};

const multi = read('src/store/multiDeviceSync.js');
const repo = read('src/lib/financialLedgerV7Repository.js');
const sync = read('src/store/slices/useSyncSlice.js');
const gate = read('tests/run-quality-gate.cjs');

must(multi.includes('export const canonicalWorkspaceCfg = cfg =>'), 'canonical workspace cfg helper exists');
must(multi.includes("filter(([key]) => key !== 'avatarUri')"), 'avatarUri is excluded from canonical cfg');
must(multi.includes('cfg: canonicalWorkspaceCfg(state?.cfg)'), 'sameWorkspaceData uses canonical cfg');
must(multi.includes('...localDerivedWorkspaceCfg(local.cfg)'), 'merge keeps local derived avatar URI');

must(repo.includes('const canonicalFinancialEntityPayload = (entityType, payload) =>'), 'V7 entity canonicalizer exists');
must(repo.includes('safeJson(canonicalFinancialEntityPayload(entity.entityType, entity.payload))'), 'V7 storage strips derived workspace URI');
must(repo.includes('payload: canonicalFinancialEntityPayload(entity.entityType, entity.payload),'), 'prepared local entity is canonical before outbox');
must(repo.includes('payload: canonicalFinancialEntityPayload(String(item.entityType), item.payload ?? null),'), 'workspace equality input is canonical');

must(sync.includes("import { canonicalWorkspaceCfg, mergeWorkspaceStates, sameWorkspaceData }"), 'sync slice imports canonical cfg');
must(sync.includes('cfg: canonicalWorkspaceCfg(clean.cfg)'), 'saveLocal V7 workspace commit is canonical');
must(sync.includes('cfg: canonicalWorkspaceCfg(finalState.cfg)'), 'persistSynced V7 bridge is canonical');
must(sync.includes('p_cfg: canonicalWorkspaceCfg(current.cfg)'), 'compatibility user_data RPC is canonical');
must(!sync.includes('p_cfg: current.cfg,'), 'raw cfg is not sent to compatibility RPC');
must(sync.includes('[P20_V2_SYNC_CONTEXT]'), 'V2 startup context is observable');
must(sync.includes('[P20_V2_MUTATION_STATE]'), 'V2 mutation result is observable');
must(gate.includes("'p20-v2-client-closure.test.cjs'"), 'P20 contract is in static quality gate');

const runtimeSource = multi
  .replace(/\bexport const /g, 'const ')
  .concat('\nreturn { canonicalWorkspaceCfg, sameWorkspaceData, mergeWorkspaceStates };');
const api = new Function(runtimeSource)();

const base = {
  trans: [], debts: [], goals: [], wallets: [], commitments: [], cats: [],
  cfg: { avatarPath: 'user/avatar', avatarUri: 'signed://old', currency: 'IQD', theme: 'dark' },
};
const local = {
  ...base,
  cfg: { ...base.cfg, avatarUri: 'signed://local' },
};
const remote = {
  ...base,
  cfg: { ...base.cfg, avatarUri: 'signed://remote' },
};

must(api.sameWorkspaceData(local, remote), 'signed avatar URL rotation is a semantic no-op');
must(
  !api.sameWorkspaceData(local, { ...remote, cfg: { ...remote.cfg, avatarPath: 'user/other-avatar' } }),
  'stable avatarPath change remains a semantic change',
);

const conflicts = [];
const merged = api.mergeWorkspaceStates({ base, local, remote, conflicts });
must(merged.cfg.avatarPath === 'user/avatar', 'merge preserves canonical avatarPath');
must(merged.cfg.avatarUri === 'signed://local', 'merge preserves local derived avatarUri for display');
must(conflicts.length === 0, 'derived avatarUri rotation creates no merge conflict');

const canonical = api.canonicalWorkspaceCfg(local.cfg);
must(!Object.prototype.hasOwnProperty.call(canonical, 'avatarUri'), 'canonical cfg omits avatarUri');
must(canonical.avatarPath === 'user/avatar', 'canonical cfg retains avatarPath');

console.log('P20 FINAL V2 CLIENT CLOSURE CONTRACT: PASS');
