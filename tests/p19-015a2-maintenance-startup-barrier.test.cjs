const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(process.argv[2] || '.');
const read = rel => fs.readFileSync(path.join(repo, rel), 'utf8');

const barrier = read('src/lib/financialMaintenanceBarrier.js');
const sync = read('src/store/slices/useSyncSlice.js');
const data = read('src/store/slices/dataSlice.js');
const app = read('App.js');
const repoV7 = read('src/lib/financialLedgerV7Repository.js');

assert(barrier.includes('P19-015A2: process-wide financial maintenance barrier'));
assert(barrier.includes('runFinancialMaintenanceTask'));
assert(barrier.includes('subscribeFinancialMaintenance'));
assert(barrier.includes('pendingMaintenance.push(request)'));
assert(barrier.includes('activeMaintenance = {'));
assert(barrier.includes("presentation = 'blocking'") && barrier.includes('visible: !!visibleMaintenance'));

assert(sync.includes("from '../../lib/financialMaintenanceBarrier'"));
assert(sync.includes("from '../../lib/ledgerDatabase'"));
assert(sync.includes("runFinancialMaintenance: async (reason, task, options = {})"));
assert(sync.includes("P19-015A2: do not start scheduled sync while maintenance is pending/active"));
assert(sync.includes("P19-015A2: local load owns schema/cutover maintenance"));
assert(sync.includes("P19-015A2: serialize every auth/account workspace transition"));
assert(sync.includes("P19-015A2: canonical cutover is a maintenance operation"));
assert(sync.includes("P19-015A2 auto-cutover reuses outer maintenance"));
assert(sync.includes("await get().activateFinancialV7Cutover({ maintenanceOwned: true });"));
assert(sync.includes('hasSteadyFinancialCloudRecoveryStateV2'));
assert(sync.includes("presentation: 'blocking'"));
assert(sync.includes("insideSync: true"));
assert(sync.includes("maintenanceOwned: true"));
assert(sync.includes("isFinancialMaintenanceBlocked()"));

assert(data.includes("P19-015A2: destructive local reset owns the maintenance barrier"));
assert(data.includes("P19-015A2: archive moves hot/cold financial state under one maintenance barrier"));
assert(data.includes("P19-015A2: backup restore owns the maintenance barrier"));
assert(data.includes("maintenanceOwned: true"));

assert(app.includes("P19-015A2: startup barrier"));
assert(app.includes("subscribeFinancialMaintenance"));
assert(app.includes("getFinancialMaintenanceSnapshot"));
assert(app.includes("financialMaintenance.visible"));
assert(app.includes("جاري تأمين البيانات"));
assert(app.includes("if (FRESH_TEST_MODE || !ready) return undefined;"));

const startupIndex = app.indexOf('P19-015A2: startup barrier');
const loadLocalIndex = app.indexOf('await loadLocal();', startupIndex);
const authListenerIndex = app.indexOf('supabase.auth.onAuthStateChange', startupIndex);
const getSessionIndex = app.indexOf('supabase.auth.getSession()', startupIndex);
const readyIndex = app.indexOf('setReady(true);', getSessionIndex);
assert(startupIndex >= 0 && loadLocalIndex > startupIndex);
assert(authListenerIndex > loadLocalIndex);
assert(getSessionIndex > loadLocalIndex);
assert(readyIndex > getSessionIndex);

assert(repoV7.includes('export const FINANCIAL_SQLITE_SCHEMA_VERSION = 8;'));
assert(!barrier.includes('PRAGMA user_version'));
assert(!barrier.includes('ALTER TABLE'));
assert(!barrier.includes('CREATE TABLE'));

console.log('P19-015A2 maintenance/startup static contract passed.');
