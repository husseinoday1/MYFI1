const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.argv[2] || path.join(__dirname,'..'));
const authority = fs.readFileSync(path.join(root,'docs/00_MYFI_CANONICAL_AUTHORITY.md'),'utf8');
const sync = fs.readFileSync(path.join(root,'docs/MYFI_SYNC_PROTOCOL.md'),'utf8');
const addendum = fs.readFileSync(
  path.join(root,'docs/01_CORE_AUTHORITY/MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md'),'utf8'
);
const evidence = fs.readFileSync(
  path.join(root,'docs/04_CURRENT_EVIDENCE/MYFI_P19_001_011_SYNC_V2_EXECUTION_EVIDENCE_2026-08-17.md'),'utf8'
);

assert(authority.includes('P19_011_AUTHORITY_REGISTRATION'));
assert(authority.includes('MYFI_P19_SYNC_V2_ACTIVATION_ADDENDUM.md'));
assert(authority.includes('MYFI_P19_001_011_SYNC_V2_EXECUTION_EVIDENCE_2026-08-17.md'));

for (const token of [
  'cloud read-back',
  'per-row SHA-256',
  'manifest SHA-256',
  'quiescent',
  'automatic fallback to V1 is FORBIDDEN',
  'activated_at',
  'real-device',
]) assert(addendum.includes(token), `missing P19 addendum token: ${token}`);

for (const token of [
  'P19_011_SYNC_V2_PERMANENT_CONTRACT',
  'read-back',
  'SHA-256',
  'quiescent',
  'post-activation',
  'V1 fallback',
]) assert(sync.includes(token), `missing permanent sync contract token: ${token}`);

for (let n=1;n<=11;n+=1) {
  const id = `P19-${String(n).padStart(3,'0')}`;
  assert(evidence.includes(id), `evidence missing ${id}`);
}
for (const token of [
  'reset interlock must run before visible/local financial state is cleared',
  'P19-011 original contract failure',
  'P19-011R1 P19-010 regression failure',
  'npm run test:gate',
  'npm run verify:android',
  'financial_mutations_v1 = 557',
  'financial_mutations_v2 = 0',
  'Phase 9: OPEN',
]) assert(evidence.includes(token), `evidence missing token: ${token}`);

console.log('MYFI P19-011 PLAN + EVIDENCE CONTRACT: PASSED');
