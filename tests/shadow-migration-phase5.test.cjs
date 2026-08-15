const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const migration = read('src/lib/financialLedgerV7Migration.js');
const sync = read('src/store/slices/useSyncSlice.js');
const repo = read('src/lib/financialLedgerV7Repository.js');

assert(migration.includes('migrationReady: true'), 'Phase 5 success must be represented as Migration Ready.');
assert(migration.includes("sourceMode: 'shadow'") && migration.includes('cutover: false'), 'Phase 5 success must retain shadow source mode and explicitly deny cutover.');
assert(migration.includes('discardFinancialWorkspaceStageV7({ stageNamespace, database })'), 'Verified staging workspace must be discarded after readiness proof.');
assert(migration.includes('setFinancialWorkspaceStateV7') && migration.includes("sourceMode: 'shadow'"), 'Readiness checksum must be recorded without changing operational source.');
assert(!/return\s+promoteFinancialWorkspaceStageV7\s*\(/.test(migration), 'Phase 5 must never promote staged data to operational SQLite.');
assert(migration.includes("reason: 'UNRESOLVED_FX'"), 'Missing historical FX must block migration readiness.');
assert(sync.includes("financialLedgerV7Cutover: migration.sourceMode === 'sqlite' && migration.migrationReady !== true"), 'Readiness must not mark the app as cut over.');
assert(sync.includes("if (v7State?.source_mode === 'sqlite')"), 'Already-cutover installed devices must remain readable; Phase 5 must not destructively downgrade them.');
assert(repo.includes("CHECK(source_mode IN ('shadow','sqlite'))"), 'Workspace state schema must retain explicit shadow/sqlite modes.');

console.log('MYFI PHASE 5 SHADOW MIGRATION READINESS CONTRACT: PASSED');
