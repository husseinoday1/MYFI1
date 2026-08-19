const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2] || '.');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const repo = read('src/lib/financialLedgerV7Repository.js');
const sync = read('src/store/slices/useSyncSlice.js');
const must = (value, label) => {
  if (!value) throw new Error(`[FAIL] ${label}`);
  console.log(`[PASS] ${label}`);
};

must(repo.includes('export const FINANCIAL_SQLITE_SCHEMA_VERSION = 8;'), 'SQLite schema remains V8');
must(repo.includes('adoptUnbootstrappedCloudLedgerIdentityV8'), 'clean V2 adoption API exists');
must(repo.includes('runLedgerExclusiveTransaction(db, async (txn)'), 'identity adoption uses exclusive SQLite transaction');
must(repo.includes("reason: 'financial_v2_adoption_local_financial_state_present'"), 'real financial state blocks identity adoption');
must(repo.includes("reason: 'financial_v2_adoption_setup_shell_not_safe'"), 'unsafe setup shell blocks identity adoption');
must(repo.includes("entity_type IN ('wallet','category')"), 'wallet/category setup rows are explicitly recognized');
must(repo.includes("Number(payload.openingBalance || 0) === 0"), 'wallet opening balance must be zero');
must(repo.includes("Number(payload.openingBaseBalance || 0) === 0"), 'wallet base opening balance must be zero');
must(repo.includes("accountRows.length <= 1"), 'setup shell permits at most one account');
must(repo.includes("walletRows.length <= 1"), 'setup shell permits at most one wallet');
must(repo.includes("unsafeEntities"), 'non-setup entities remain blocking');
must(repo.includes("legacyInbox"), 'legacy inbox state blocks unsafe adoption');
must(repo.includes("legacySyncCursor"), 'legacy V1 cursor state blocks unsafe adoption');
must(repo.includes("reason: 'financial_v2_adoption_transport_state_not_clean'"), 'unexpected transport state blocks identity adoption');
must(repo.includes('DELETE FROM ledger_outbox_v3 WHERE ledger_id=?'), 'old setup shadow outbox is removed before identity CAS');
must(repo.includes('DELETE FROM ledger_outbox_v2'), 'old setup V1 outbox is removed before identity CAS');
must(repo.includes('UPDATE ledger_sync_identity_v8'), 'identity rebind is explicit');
must(repo.includes("txn.getAllAsync('PRAGMA foreign_key_check')"), 'foreign key integrity is verified before commit');
must(repo.includes("status: 'adopted_pending_bootstrap'"), 'durable adoption evidence is recorded');

must(sync.includes('adoptUnbootstrappedCloudLedgerIdentityV8,'), 'sync slice imports clean adoption API');
must(sync.includes("if (source.mode === 'v2_unbootstrapped')"), 'unbootstrapped cloud path is handled');
must(sync.includes("status: 'adopted_v2_unbootstrapped'"), 'successful adoption state is explicit');
must(sync.includes('requireV2: true'), 'clean adoption requires V2 activation');
const durableGuardStart = sync.indexOf('const durableCleanV2Cutover =');
const setupShellGate = sync.indexOf('const wallets = Array.isArray(current.wallets)', durableGuardStart);
const pendingActivationReason = sync.indexOf("'financial_v2_adoption_pending_activation'", durableGuardStart);
must(
  durableGuardStart >= 0
    && pendingActivationReason > durableGuardStart
    && setupShellGate > pendingActivationReason,
  'post-adoption retries remain V2-only',
);
must(sync.includes("cutoverMarker?.cleanV2Cutover === true"), 'durable clean-V2 marker is checked before shell classification');
must(sync.indexOf("cutoverMarker?.cleanV2Cutover === true") < sync.indexOf("const wallets = Array.isArray(current.wallets)"), 'durable V2 marker is checked before local setup-shell gate');
must(sync.includes('if (cloudRecovery?.requireV2)'), 'V1 fallback is forbidden after any V2-required recovery');
must(!sync.includes('if (cloudRecovery?.recovered && cloudRecovery?.requireV2)'), 'old transient-only V1 fallback guard is removed');
must(sync.includes('[P19_FINAL_V2_ACTIVATION_FAIL]'), 'activation failure reason is observable');
must(sync.includes('[P19_FINAL_V1_FALLBACK]'), 'legacy fallback is observable');
must(sync.includes('[P19_FINAL_TRANSIENT_RETRY]'), 'transient network retry is automatic and observable');
must(sync.includes('TRANSIENT_SYNC_RETRY_DELAYS_MS = [1500, 5000, 15000, 30000]'), 'transient retry uses bounded backoff');
must(sync.includes("Promise.resolve(current.syncCloud?.({ reason: 'transient_retry' }))"), 'transient retry re-enters sync only after timer release');
must(sync.includes('[P19_FINAL_V2_ACTIVE]'), 'activation device marker exists');
must(sync.includes('[P19_FINAL_V2_SYNC_OK]'), 'steady-state V2 sync device marker exists');
must(sync.includes("reason: 'financial_v2_already_active'"), 'active V2 setup shell bypasses recovery on restart');
must(sync.indexOf("reason: 'financial_v2_already_active'") < sync.indexOf('const source = await fetchVerifiedFinancialCloudRecoverySourceV2'), 'active/pending V2 guards run before cloud recovery fetch');

console.log('P19 FINAL V2 SETUP-SHELL TARGETED CONTRACT: PASS');
