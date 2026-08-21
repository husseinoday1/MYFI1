// Phase 10 Step 12 — literal child-process exits through the real P10-010 SQLite
// financial promotion and real P10-011 canonical reload. The worker is the same
// operational harness used by the P10-011 gate, not a metadata replacement.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const worker = path.join(root, 'tests/run-p10-011-post-commit-recovery.cjs');
const namespace = 'workspace:restart-proof';
const boundaries = [
  ['after_intent', 'intent_pending_server', false],
  ['after_server_response_before_proof_state', 'intent_pending_server', false],
  ['after_server_proof', 'server_epoch_proven', false],
  ['after_local_promotion', 'local_promoted_pending_reload', true],
  ['after_local_reload', 'local_reloaded_reconciliation_required', true],
  ['after_cloud_readback_state', 'cloud_readback_verified', true],
  ['after_shadow_quiescent_state', 'shadow_quiescent', true],
  ['after_v2_activation_before_state', 'shadow_quiescent', true],
];

const inspect = (filename) => {
  const db = new DatabaseSync(filename);
  try {
    const promotion = db.prepare(`SELECT value FROM ledger_v7_meta WHERE key=?`).get(`canonical_restore_promotion_v11:${namespace}`);
    const intent = db.prepare(`SELECT value FROM ledger_v7_meta WHERE key=?`).get(`restore_intent:${namespace}`);
    const identity = db.prepare(`SELECT restore_epoch FROM ledger_sync_identity_v8 WHERE namespace=?`).get(namespace);
    const transactions = db.prepare(`SELECT id FROM ledger_financial_transactions_v7 WHERE namespace=? ORDER BY id`).all(namespace).map(row => row.id);
    const archives = db.prepare(`SELECT year FROM cold_archive_years WHERE namespace=? ORDER BY year`).all(namespace).map(row => Number(row.year));
    return {
      state: JSON.parse((promotion || intent).value),
      restoreEpoch: Number(identity.restore_epoch),
      transactions,
      archives,
    };
  } finally {
    db.close();
  }
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'myfi-p10-012-real-hard-exit-'));
try {
  for (const [boundary, expectedStatus, promoted] of boundaries) {
    const filename = path.join(temp, `${boundary}.sqlite`);
    const killed = spawnSync(process.execPath, [worker, root], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        MYFI_P10_012_RUNTIME_DB_FILE: filename,
        MYFI_P10_012_HARD_EXIT_BOUNDARY: boundary,
      },
    });
    assert.equal(killed.status, 86, `${boundary} must literally terminate the real financial worker: ${killed.stderr}`);
    const stopped = inspect(filename);
    assert.equal(stopped.state.status, expectedStatus);
    assert.equal(stopped.restoreEpoch, promoted ? 8 : 7);
    assert.deepEqual(stopped.transactions, [promoted ? 'tx-new' : 'tx-old']);
    assert.deepEqual(stopped.archives, [promoted ? 2025 : 2024]);

    const resumed = spawnSync(process.execPath, [worker, root], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        MYFI_P10_012_RUNTIME_DB_FILE: filename,
        MYFI_P10_012_RUNTIME_RESUME: '1',
      },
    });
    assert.equal(resumed.status, 0, `${boundary} must resume through real P10-010/011: ${resumed.stderr}`);
    assert.match(resumed.stdout, /REAL FINANCIAL HARD-EXIT RESUME: PASS/);
    const completed = inspect(filename);
    assert.equal(completed.state.status, 'v2_activated');
    assert.equal(completed.restoreEpoch, 8);
    assert.deepEqual(completed.transactions, ['tx-new']);
    assert.deepEqual(completed.archives, [2025]);
  }
  console.log(`[PASS] ${boundaries.length} literal exits preserve/resume real hot ledger, archive, epoch and canonical reload`);
  console.log('MYFI P10-012 REAL FINANCIAL HARD-EXIT RECOVERY: PASS');
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
