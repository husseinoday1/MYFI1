const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/store/multiDeviceSync.js');
const metadataPath = path.join(root, 'src/lib/cloudWorkspaceMetadata.js');
const metadata = fs.readFileSync(metadataPath, 'utf8').replace(/export const /g, 'const ');
let source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/import \{ cloudWorkspaceCfg, mergeCloudWorkspaceCfg \} from '\.\.\/lib\/cloudWorkspaceMetadata\.js';\r?\n/, '');
source = `${metadata}\n${source}`;
source = source.replace(/export const /g, 'const ');
source += '\nmodule.exports = { valuesEqual, mergeArray3, sameWorkspaceData, mergeWorkspaceStates };\n';
const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const { valuesEqual, mergeArray3, sameWorkspaceData, mergeWorkspaceStates } = sandbox.module.exports;

const state = patch => ({ trans: [], debts: [], goals: [], wallets: [], commitments: [], cats: [], cfg: {}, ...patch });

// Key ordering must not create a false change.
assert.equal(valuesEqual({ a: 1, b: { x: 2, y: 3 } }, { b: { y: 3, x: 2 }, a: 1 }), true);
assert.equal(sameWorkspaceData(state({ cfg: { currency: 'IQD', lang: 'ar' } }), state({ cfg: { lang: 'ar', currency: 'IQD' } })), true);

// Independent records created offline on two devices must survive the merge.
{
  const base = state({ trans: [] });
  const local = state({ trans: [{ id: 'local-1', amt: 10 }] });
  const remote = state({ trans: [{ id: 'remote-1', amt: 20 }] });
  const merged = mergeWorkspaceStates({ base, local, remote, conflicts: [] });
  assert.deepEqual(new Set(merged.trans.map(x => x.id)), new Set(['local-1', 'remote-1']));
}

// A deletion from either side after a common base wins over a stale edit.
{
  const base = state({ trans: [{ id: 'tx-1', amt: 10, note: 'base' }] });
  const local = state({ trans: [] });
  const remote = state({ trans: [{ id: 'tx-1', amt: 15, note: 'edited remotely' }] });
  const merged = mergeWorkspaceStates({ base, local, remote, conflicts: [] });
  assert.equal(merged.trans.length, 0, 'deleted transaction must not resurrect');
}

// Nested payment additions from both devices must both survive.
{
  const baseDebt = { id: 'debt-1', total: 100, payments: [] };
  const base = state({ debts: [baseDebt] });
  const local = state({ debts: [{ ...baseDebt, payments: [{ id: 'p-local', amt: 10 }] }] });
  const remote = state({ debts: [{ ...baseDebt, payments: [{ id: 'p-remote', amt: 20 }] }] });
  const merged = mergeWorkspaceStates({ base, local, remote, conflicts: [] });
  assert.deepEqual(new Set(merged.debts[0].payments.map(x => x.id)), new Set(['p-local', 'p-remote']));
}

// A true scalar conflict is explicit and deterministic; local wins only that scalar.
{
  const conflicts = [];
  const base = state({ cfg: { currency: 'IQD', lang: 'ar' } });
  const local = state({ cfg: { currency: 'USD', lang: 'ar' } });
  const remote = state({ cfg: { currency: 'EUR', lang: 'en' } });
  const merged = mergeWorkspaceStates({ base, local, remote, conflicts });
  assert.equal(merged.cfg.currency, 'USD');
  assert.equal(merged.cfg.lang, 'ar', 'device-local language must not merge from cloud state');
  assert.ok(conflicts.some(x => String(x.path).includes('cfg.currency')), 'scalar conflict should be recorded');
}

console.log('MYFI SYNC CORE V4: PASSED');
