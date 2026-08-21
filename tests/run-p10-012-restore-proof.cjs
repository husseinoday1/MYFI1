// Phase 10 Step 12 — execute the production opaque restore-proof derivation.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/financialRestoreProofV11.js');
const compile = (source) => {
  const compiled = new Module(filename, module);
  compiled.filename = filename;
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  compiled._compile(source, filename);
  return compiled.exports;
};

let source = fs.readFileSync(filename, 'utf8')
  .replace(/import \{ sha256 \} from '@noble\/hashes\/sha2';/, `const { sha256 } = require('@noble/hashes/sha2');`)
  .replace(/import \{ bytesToHex \} from '@noble\/hashes\/utils';/, `const { bytesToHex } = require('@noble/hashes/utils');`)
  .replace(/import \{ CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS \} from '\.\/financialBackupV11';/,
    `const CANONICAL_BACKUP_V11_MANIFEST_COUNT_KEYS = Object.freeze([
  'transactions', 'postings', 'links', 'accounts', 'exchangeRates', 'entities',
  'coldArchiveBundles', 'coldArchiveRecords',
]);`)
  .replace(/export const /g, 'const ');
source += `\nmodule.exports = {
  CANONICAL_RESTORE_PROOF_V11_DOMAIN,
  isCanonicalRestoreOperationIdV11,
  deriveCanonicalRestoreProofDigestV11,
};\n`;

const { deriveCanonicalRestoreProofDigestV11 } = compile(source);
const base = {
  operationId: '11111111-1111-4111-8111-111111111111',
  ledgerId: 'ledger-proof',
  fromEpoch: 7,
  toEpoch: 8,
  semanticHash: 'a'.repeat(64),
  validatorVersion: 2,
  counts: {
    accounts: 1, transactions: 2, postings: 3, links: 4, exchangeRates: 5, entities: 6,
    coldArchiveBundles: 7, coldArchiveRecords: 8,
  },
};

const first = deriveCanonicalRestoreProofDigestV11(base);
const reordered = deriveCanonicalRestoreProofDigestV11({
  ...base,
  counts: Object.fromEntries(Object.entries(base.counts).reverse()),
});
assert.match(first, /^[a-f0-9]{64}$/);
assert.equal(reordered, first, 'object insertion order must not change the canonical proof');
assert.notEqual(deriveCanonicalRestoreProofDigestV11({ ...base, operationId: '22222222-2222-4222-8222-222222222222' }), first);
assert.notEqual(deriveCanonicalRestoreProofDigestV11({ ...base, semanticHash: 'b'.repeat(64) }), first);
assert.notEqual(deriveCanonicalRestoreProofDigestV11({ ...base, counts: { ...base.counts, postings: 4 } }), first);
assert.throws(() => deriveCanonicalRestoreProofDigestV11({ ...base, counts: {} }), /canonical_restore_proof_input_invalid/);
assert.throws(() => deriveCanonicalRestoreProofDigestV11({ ...base, operationId: 'not-a-uuid' }), /canonical_restore_proof_input_invalid/);
console.log('MYFI P10-012 OPAQUE RESTORE PROOF: PASS');
