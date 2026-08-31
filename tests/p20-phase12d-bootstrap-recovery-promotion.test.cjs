const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const promotion = fs.readFileSync(path.join(root, 'src/lib/financialBootstrapRecoveryPromotionV2.js'), 'utf8');
const repository = fs.readFileSync(path.join(root, 'src/lib/financialLedgerV7Repository.js'), 'utf8');

assert.match(promotion, /runFinancialRestorePromotionTransactionV8/);
assert.match(promotion, /financial_v2_bootstrap_recovery_promotion_live_state_present/);
assert.match(promotion, /financial_v2_bootstrap_recovery_promotion_stage_source_mismatch/);
assert.match(promotion, /financial_v2_bootstrap_recovery_promotion_hot_stage_incomplete/);
assert.match(promotion, /financial_archive_recovery_promotion_stage_incomplete/);
assert.match(promotion, /financial_v2_bootstrap_recovery_promotion_identity_compare_and_swap_failed/);
assert.match(promotion, /replaceColdArchiveNamespaceFromStage/);
assert.match(promotion, /includeWorkspaceState: true/);
assert.match(promotion, /promoted_pending_activation/);
assert.doesNotMatch(promotion, /activateFinancialSyncProtocolV2V8/,
  'promotion must not silently activate production sync');
assert.doesNotMatch(promotion, /beginLedgerRestoreEpochV8|advanceLedgerRestoreEpochInTransactionV8/,
  'import promotion must not create or advance a Restore Epoch');
assert.match(repository, /includeWorkspaceState = false/,
  'transaction helper needs an explicit workspace copy opt-in');
assert.match(repository, /if \(includeWorkspaceState\)/);

console.log('MYFI P20 PHASE 12-D BOOTSTRAP RECOVERY ATOMIC PROMOTION CONTRACT: PASSED');
