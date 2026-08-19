const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||path.join(__dirname,'..'));const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const diag=read('src/dev/p19LocalSqliteDiagnostics.js');
const sync=read('src/store/slices/useSyncSlice.js');
const repo=read('src/lib/financialLedgerV7Repository.js');
const bootstrap=read('src/lib/financialBootstrapV2.js');

assert.match(diag,/P19-015B0_LEDGER_IDENTITY_FORENSICS/);
assert.match(diag,/P19-015B1_LEDGER_IDENTITY_ADOPTION_PREFLIGHT/);
assert.match(diag,/patchId:\s*'P19-015B1'/);
assert.match(diag,/parentPatchId:\s*'P19-015B0'/);
assert.match(diag,/expo-crypto/);
for(const token of [
  'PRAGMA foreign_key_list',
  'identityTopology',
  'outboxPayloadForensics',
  'rawPayloadReturned: false',
  'p19B1ClassifyWorkspaceRows',
  'payloadSha256',
  'financialKeyPaths',
  'legacyToShadowPairing',
  'eligibleForB2Design',
  'authorizedToMutate: false',
  'parentOnlyIdentityChangeForbidden: true',
  'durableRecoveryResumeMarkerRequired: true',
  'v1FallbackMustRemainBlockedAcrossRestartAfterRecoveryStarts: true',
  'preserveLegacyCloudSourceUntilV2Readback: true',
  'workspaceShadowRowsMayBeSupersededOnlyAfterVerifiedBootstrap: true',
]) assert.ok(diag.includes(token),`missing ${token}`);
assert.doesNotMatch(diag,/\.runAsync\s*\(/);
assert.doesNotMatch(diag,/\.execAsync\s*\(/);
assert.doesNotMatch(diag,/\bINSERT\b/i);
assert.doesNotMatch(diag,/\bUPDATE\b/i);
assert.doesNotMatch(diag,/\bDELETE\b/i);
assert.doesNotMatch(diag,/supabase\.(rpc|from|functions)/);

const guardStart=sync.indexOf("if (source.reservedLedgerId && source.reservedLedgerId !== shell.ledgerId)");
assert.ok(guardStart>=0,'reserved identity guard missing');
const guardEnd=sync.indexOf("return { attempted: true, ok: false, blocked: true, reason, source, shell };",guardStart);
assert.ok(guardEnd>guardStart,'reserved identity guard end missing');
const guard=sync.slice(guardStart,guardEnd+120);
assert.ok(guard.includes('financial_v2_reserved_ledger_identity_adoption_required'));

const restoreStart=sync.indexOf('const restoreSnapshotAsOperationalV7');
const restoreEnd=sync.indexOf('const snapshotData',restoreStart);
assert.ok(restoreStart>=0&&restoreEnd>restoreStart,'legacy restore helper missing');
const restore=sync.slice(restoreStart,restoreEnd);
assert.ok(restore.includes('forceReplace: true'));
assert.ok(restore.includes('resetPendingOutbox: true'));

const promoteStart=repo.indexOf('export const promoteFinancialWorkspaceStageV7');
const promoteEnd=repo.indexOf('export const cloneFinancialWorkspaceV7',promoteStart);
assert.ok(promoteStart>=0&&promoteEnd>promoteStart,'promotion function missing');
const promote=repo.slice(promoteStart,promoteEnd);
assert.ok(promote.includes('ledger_outbox_v2'),'legacy pending outbox reset missing');
assert.doesNotMatch(promote,/ledger_outbox_v3/,'shadow V2 outbox is not covered by legacy restore promotion');

const finalizeStart=repo.indexOf('export const finalizeFinancialBootstrapStageV8');
const finalizeEnd=repo.indexOf('export const inspectFinancialEmptyShellV8',finalizeStart);
assert.ok(finalizeStart>=0&&finalizeEnd>finalizeStart,'bootstrap finalize function missing');
const finalize=repo.slice(finalizeStart,finalizeEnd);
assert.ok(finalize.includes('ledger_outbox_v3'));
assert.ok(finalize.includes('superseded_by_bootstrap_id'));
assert.ok(finalize.includes('checkpoint_outbox_sequence'));

const bootStart=bootstrap.indexOf('export const bootstrapFinancialLedgerV2');
assert.ok(bootStart>=0,'V2 bootstrap missing');
const boot=bootstrap.slice(bootStart);
assert.ok(boot.includes('verifyFinancialBootstrapReadbackV2'));
assert.ok(boot.includes('finalizeFinancialBootstrapStageV8'));

console.log('[PASS] P19-015B1 identity adoption preflight contract');
console.log('[PASS] Runtime diagnostic remains read-only and returns hashes/shapes, not raw payload');
console.log('[PASS] Current restore/bootstrap topology gap is explicitly captured for P19-015B2');
