const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const must = (condition, message) => {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
};

const sync = read('src/store/slices/useSyncSlice.js');
const app = read('App.js');
const ownership = read('docs/MYFI_DATA_OWNERSHIP.md');

must(sync.includes("import { Platform } from 'react-native';"),
  'native platform selection for active ledger identity storage is missing');
must(sync.includes("import SQLiteStorage from 'expo-sqlite/kv-store';"),
  'SQLite KV storage is not imported for active ledger identity');
must(sync.includes('const ACTIVE_LOCAL_LEDGER_CONTEXT_VERSION = 2;'),
  'active ledger identity context version was not advanced to V2');
must(sync.includes("const activeLedgerIdentityStorage = Platform.OS === 'web' ? AsyncStorage : SQLiteStorage;"),
  'Android/native active ledger identity is not SQLite-first');
must(sync.includes('persistActiveLocalLedgerContext(activeLedgerIdentityStorage'),
  'active ledger context is not persisted to the primary SQLite-backed store');
must(sync.includes('persistActiveLocalLedgerContext(AsyncStorage'),
  'legacy AsyncStorage compatibility write is missing');
must(sync.includes('active_local_ledger_context_unavailable'),
  'total active-ledger identity read failure does not fail closed');
must(sync.includes('active_local_ledger_context_corrupt'),
  'corrupt active-ledger identity does not fail closed');
must(sync.includes('readActiveLocalLedgerNamespace'),
  'loadLocal no longer resolves the durable active ledger namespace');

const localLoadIndex = app.indexOf('await loadLocal();');
const authSessionIndex = app.indexOf('supabase.auth.getSession()');
must(localLoadIndex >= 0 && authSessionIndex >= 0 && localLoadIndex < authSessionIndex,
  'local ledger must mount before cloud auth/session resolution');

must(ownership.includes('active local ledger namespace is persisted independently from authentication state'),
  'Data Ownership contract no longer requires auth-independent active ledger persistence');
must(ownership.includes('Ledger identity يجب أن تبقى مستقلة عن Supabase user id'),
  'Data Ownership contract no longer states ledger/auth identity independence');

console.log('MYFI P19-001 OFFLINE LEDGER IDENTITY CONTRACT: PASSED');
