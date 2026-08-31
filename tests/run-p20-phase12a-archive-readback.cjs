const path = require('node:path');
const Module = require('node:module');
const babel = require('@babel/core');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const target = path.join(root, 'src/lib/financialArchiveSnapshotV2.js');
const sha = value => crypto.createHash('sha256').update(String(value)).digest('hex');

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-crypto' && parent?.filename === target) {
    return {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digestStringAsync: async (_algorithm, value) => sha(value),
    };
  }
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

const {
  buildFinancialArchiveSnapshotRowsV2,
  readFinancialArchiveHeadV2,
  verifyFinancialArchiveSnapshotReadbackV2,
} = mod.exports;

const makeSupabase = ({ rows, manifestHash, archivePresent = true }) => ({
  rpc: async (name, args) => {
    if (name === 'get_financial_archive_head_v2') {
      return {
        data: archivePresent ? {
          ledgerId: 'ledger-1234567890123456', restoreEpoch: 1, archivePresent: true,
          archiveGeneration: 1, snapshotId: 'archive-snapshot-123456', manifestHash,
          expectedRowCount: rows.length,
        } : {
          ledgerId: 'ledger-1234567890123456', restoreEpoch: 1, archivePresent: false,
        },
        error: null,
      };
    }
    assert.equal(name, 'get_financial_archive_snapshot_rows_v2');
    const after = Number(args.p_after_ordinal || 0);
    const limit = Number(args.p_limit || 200);
    const pageRows = rows.filter(row => row.ordinal > after).slice(0, limit);
    const nextOrdinal = pageRows.length ? pageRows[pageRows.length - 1].ordinal : after;
    return {
      data: {
        ledgerId: 'ledger-1234567890123456', restoreEpoch: 1, archiveGeneration: 1,
        snapshotId: 'archive-snapshot-123456', manifestHash, expectedRowCount: rows.length,
        rows: pageRows, nextOrdinal,
        hasMore: rows.some(row => row.ordinal > nextOrdinal),
      },
      error: null,
    };
  },
});

(async () => {
  const built = await buildFinancialArchiveSnapshotRowsV2([{
    year: 2025,
    scope: 'personal',
    checksum: 'archive-checksum',
    summary: { count: 1 },
    data: { cats: [{ id: 'food' }], trans: [{ id: 'tx-1', amount: 1250, title: 'Food' }] },
  }]);
  assert.equal(built.rows.length, 2);
  assert.equal(built.rows[0].rowType, 'archive_year');
  assert.equal(built.rows[1].rowType, 'archive_transaction');
  assert.match(built.manifestHash, /^[0-9a-f]{64}$/);

  const supabase = makeSupabase({ rows: built.rows, manifestHash: built.manifestHash });
  const head = await readFinancialArchiveHeadV2({
    supabase, ledgerId: 'ledger-1234567890123456', restoreEpoch: 1,
  });
  assert.equal(head.ok, true);
  assert.equal(head.archivePresent, true);
  const received = [];
  const verified = await verifyFinancialArchiveSnapshotReadbackV2({
    supabase, ledgerId: head.ledgerId, restoreEpoch: head.restoreEpoch,
    archiveGeneration: head.archiveGeneration, snapshotId: head.snapshotId,
    manifestHash: head.manifestHash, expectedRowCount: head.expectedRowCount, pageSize: 1,
    onVerifiedRow: row => received.push(row),
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.pages, 2);
  assert.equal(received.length, built.rows.length, 'only verified archive rows may reach a private-stage writer');

  const noArchive = await readFinancialArchiveHeadV2({
    supabase: makeSupabase({ rows: [], manifestHash: sha(''), archivePresent: false }),
    ledgerId: 'ledger-1234567890123456', restoreEpoch: 1,
  });
  assert.equal(noArchive.ok, true);
  assert.equal(noArchive.archivePresent, false);

  const damaged = built.rows.map(row => ({ ...row }));
  damaged[1].rowHash = '0'.repeat(64);
  let corruptCallbacks = 0;
  const corrupted = await verifyFinancialArchiveSnapshotReadbackV2({
    supabase: makeSupabase({ rows: damaged, manifestHash: built.manifestHash }),
    ledgerId: 'ledger-1234567890123456', restoreEpoch: 1, archiveGeneration: 1,
    snapshotId: 'archive-snapshot-123456', manifestHash: built.manifestHash,
    expectedRowCount: damaged.length,
    onVerifiedRow: () => { corruptCallbacks += 1; },
  });
  assert.equal(corrupted.ok, false);
  assert.equal(corrupted.reason, 'financial_archive_snapshot_readback_row_hash_mismatch');
  assert.equal(corruptCallbacks, 1, 'only the valid prefix may reach the callback before a tampered row fails closed');

  await assert.rejects(
    () => buildFinancialArchiveSnapshotRowsV2([{ year: 2025, scope: 'personal', data: { trans: [{ id: 'same' }, { id: 'same' }] } }]),
    /financial_archive_snapshot_transaction_duplicate/,
  );
  console.log('MYFI P20 PHASE 12-A ARCHIVE READBACK RUNTIME: PASSED');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
