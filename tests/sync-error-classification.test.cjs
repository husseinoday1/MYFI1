// Retry classification and display sanitisation contract.
//
// The defect this guards: the old classifier matched /\b502\b/ against the whole
// error text, and a 5xx from the edge arrives as an HTML body full of headers,
// cookies and Cloudflare metadata. Any incidental "502" made an unrelated failure
// look transient and got it retried. The same raw text was rendered on screen in a
// row labelled "diagnostic code".

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const filename = path.join(root, 'src/lib/syncErrorClassification.js');

const source = fs.readFileSync(filename, 'utf8')
  .replace(/export const /g, 'const ')
  + `
module.exports = {
  syncErrorStatusCode,
  isNeverRetrySyncError,
  isTransientCloudSyncError,
  syncDiagnosticCode,
};
`;

const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(source, filename);

const {
  isNeverRetrySyncError,
  isTransientCloudSyncError,
  syncDiagnosticCode,
} = compiled.exports;

// A realistic edge error body: long, and containing "502" only incidentally.
const EDGE_BODY = [
  '<!DOCTYPE html><html><head><title>Error</title></head><body>',
  'cf-ray: 8f2a1b3c4d5e6502-FRA',
  'content-length: 5031',
  'set-cookie: __cf_bm=abc; path=/',
  'x-request-id: 7f502e11-0000-4000-8000-000000000000',
  '</body></html>',
].join('\n');

// --- the regression -------------------------------------------------------
assert.equal(
  isTransientCloudSyncError({ message: EDGE_BODY }), false,
  'REGRESSION: an incidental "502" inside an error body must not look transient',
);
console.log('[PASS] incidental status-like digits do not trigger a retry');

// Genuine transient signals still retry.
assert.equal(isTransientCloudSyncError({ status: 503 }), true, 'structured 503 retries');
assert.equal(isTransientCloudSyncError({ status: 500 }), true, 'structured 500 retries');
assert.equal(isTransientCloudSyncError({ message: 'Network request failed' }), true);
assert.equal(isTransientCloudSyncError({ message: 'upstream request timeout' }), true);
assert.equal(isTransientCloudSyncError({ message: 'HTTP 504 gateway timeout' }), true);
console.log('[PASS] genuine transient failures still retry');

// Structured status wins over text, and non-retryable statuses do not retry.
assert.equal(isTransientCloudSyncError({ status: 400, message: 'timeout' }), false,
  'a structured non-retryable status must not be overridden by text');
assert.equal(isTransientCloudSyncError({ status: 404 }), false);
console.log('[PASS] structured status is authoritative when present');

// --- never-retry ----------------------------------------------------------
// The server raises mutation_id_conflict with SQLSTATE 40001, a conventionally
// retryable class, so the exclusion must be explicit.
assert.equal(isNeverRetrySyncError({ message: 'mutation_id_conflict', code: '40001' }), true);
assert.equal(isTransientCloudSyncError({ message: 'mutation_id_conflict', code: '40001' }), false);
assert.equal(
  isTransientCloudSyncError({ status: 503, message: 'mutation_id_conflict' }), false,
  'a conflict must not become retryable just because it arrived with a 5xx',
);
assert.equal(isNeverRetrySyncError({ message: 'network request failed' }), false);
console.log('[PASS] mutation_id_conflict is never retried, whatever it arrives with');

// --- display sanitisation -------------------------------------------------
const shown = syncDiagnosticCode(EDGE_BODY);
assert.ok(!/cf-ray|set-cookie|<html|__cf_bm/i.test(shown),
  `REGRESSION: raw response leaked to the user: ${shown}`);
assert.ok(shown.length <= 64, 'displayed code must stay short');
console.log(`[PASS] raw edge body renders as "${shown}", not headers and cookies`);

// Short internal reasons keep their diagnostic value.
assert.equal(syncDiagnosticCode('vault_unreadable'), 'vault_unreadable');
assert.equal(syncDiagnosticCode('financial_v2_activation_not_eligible'),
  'financial_v2_activation_not_eligible');
assert.equal(syncDiagnosticCode(null), null);
assert.equal(syncDiagnosticCode('mutation_id_conflict'), 'mutation_id_conflict');
console.log('[PASS] short internal reasons pass through unchanged');

// A long unrecognised body still collapses to a stable category.
assert.equal(syncDiagnosticCode('x'.repeat(500)), 'sync_failed');
console.log('[PASS] unrecognised long text collapses to a stable category');

console.log('MYFI SYNC ERROR CLASSIFICATION CONTRACT: PASS');
