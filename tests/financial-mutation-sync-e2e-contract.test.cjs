const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const source = fs.readFileSync(path.join(root, 'tests/run-financial-mutation-sync-e2e.cjs'), 'utf8');
const managed = fs.readFileSync(path.join(root, 'tests/run-cloud-integration.ps1'), 'utf8');
const qualityGate = fs.readFileSync(path.join(root, 'tests/run-quality-gate.cjs'), 'utf8');

assert.match(source, /device-a/);
assert.match(source, /device-b/);
assert.match(source, /Client B did not receive client A mutation/);
assert.match(source, /Client A did not receive client B mutation/);
assert.match(source, /Idempotent retry created duplicate rows/);
assert.match(source, /Invalid mutation was accepted/);
assert.match(managed, /run-financial-mutation-sync-e2e\.cjs/);
assert.match(qualityGate, /CLOUD_MUTATION_PROTOCOL_E2E/);

console.log('MYFI mutation sync two-client staging harness contract passed.');
