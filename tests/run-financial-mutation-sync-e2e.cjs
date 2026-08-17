const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(workspace, '.env'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));
const credentialsPath = process.env.MYFI_TEST_CREDENTIAL_FILE;
const credentials = process.env.MYFI_TEST_EMAIL && process.env.MYFI_TEST_PASSWORD
  ? { email: process.env.MYFI_TEST_EMAIL, password: process.env.MYFI_TEST_PASSWORD }
  : credentialsPath ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) : null;
if (!credentials) throw new Error('Temporary staging credentials are required.');

const baseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = env.EXPO_PUBLIC_SUPABASE_KEY;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = {};
  try { body = bodyText ? JSON.parse(bodyText) : {}; } catch { body = { raw: bodyText }; }
  return { response, body };
};
const normalized = value => {
  const row = Array.isArray(value) ? value[0] : value;
  return {
    accepted: row?.acceptedMutationIds || row?.accepted_mutation_ids || [],
    remote: row?.remoteMutations || row?.remote_mutations || [],
    latest: Number(row?.latestSequence ?? row?.latest_sequence ?? 0),
    hasMore: row?.hasMore === true || row?.has_more === true,
  };
};

(async () => {
  const auth = await requestJson(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert(auth.response.ok && auth.body.access_token, `Authentication failed (${auth.response.status}).`);
  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${auth.body.access_token}`,
    'Content-Type': 'application/json',
  };
  const sync = async ({ mutations = [], after = 0, deviceId }) => {
    const result = await requestJson(`${baseUrl}/rest/v1/rpc/sync_financial_mutations_v1`, {
      method: 'POST', headers,
      body: JSON.stringify({
        p_mutations: mutations,
        p_after_sequence: after,
        p_device_id: deviceId,
        p_limit: 500,
      }),
    });
    assert(result.response.ok, `Mutation RPC failed (${result.response.status}): ${result.body?.message || result.body?.raw || 'unknown'}`);
    return normalized(result.body);
  };

  const runId = `mutation-e2e-${Date.now()}`;
  const deviceA = `${runId}:device-a`;
  const deviceB = `${runId}:device-b`;
  const mutationA = {
    mutationId: `${runId}:a:1`, entityType: 'goal', entityId: `${runId}:goal`,
    operation: 'upsert', entityRevision: 1, payloadVersion: 7,
    payload: { id: `${runId}:goal`, name: 'Two-client staging goal', saved: 0 },
    createdAt: new Date().toISOString(),
  };
  const pushedA = await sync({ mutations: [mutationA], after: 0, deviceId: deviceA });
  assert(pushedA.accepted.includes(mutationA.mutationId), 'Client A mutation was not acknowledged.');
  const remoteA = pushedA.remote.find(item => (item.mutationId || item.mutation_id) === mutationA.mutationId);
  assert(remoteA, 'Client A did not receive the committed server mutation.');
  assert(pushedA.latest > 0, 'Server sequence did not advance for client A.');

  const pulledB = await sync({ after: 0, deviceId: deviceB });
  assert(pulledB.remote.some(item => (item.mutationId || item.mutation_id) === mutationA.mutationId), 'Client B did not receive client A mutation.');
  assert(pulledB.latest >= pushedA.latest, 'Client B cursor is behind the received mutation.');

  const mutationB = {
    mutationId: `${runId}:b:2`, entityType: 'goal', entityId: mutationA.entityId,
    operation: 'upsert', entityRevision: 2, payloadVersion: 7,
    payload: { id: mutationA.entityId, name: 'Two-client staging goal', saved: 6550 },
    createdAt: new Date(Date.now() + 1).toISOString(),
  };
  const pushedB = await sync({ mutations: [mutationB], after: pulledB.latest, deviceId: deviceB });
  assert(pushedB.accepted.includes(mutationB.mutationId), 'Client B mutation was not acknowledged.');
  assert(pushedB.latest > pulledB.latest, 'Server sequence did not advance for client B.');

  const pulledA = await sync({ after: pushedA.latest, deviceId: deviceA });
  assert(pulledA.remote.some(item => (item.mutationId || item.mutation_id) === mutationB.mutationId), 'Client A did not receive client B mutation.');
  assert(pulledA.latest >= pushedB.latest, 'Client A cursor did not reach client B mutation.');

  const duplicate = await sync({ mutations: [mutationA], after: pulledA.latest, deviceId: deviceA });
  assert(duplicate.accepted.includes(mutationA.mutationId), 'Idempotent retry was not acknowledged.');
  const duplicateRows = await requestJson(
    `${baseUrl}/rest/v1/financial_mutations_v1?mutation_id=eq.${encodeURIComponent(mutationA.mutationId)}&select=mutation_id`,
    { headers },
  );
  assert(duplicateRows.response.ok, `Mutation uniqueness read failed (${duplicateRows.response.status}).`);
  assert(Array.isArray(duplicateRows.body) && duplicateRows.body.length === 1, 'Idempotent retry created duplicate rows.');

  const conflictingReuse = await requestJson(`${baseUrl}/rest/v1/rpc/sync_financial_mutations_v1`, {
    method: 'POST', headers,
    body: JSON.stringify({
      p_mutations: [{
        ...mutationA,
        payload: { ...mutationA.payload, saved: 999999 },
      }],
      p_after_sequence: pulledA.latest,
      p_device_id: deviceA,
      p_limit: 500,
    }),
  });
  assert(!conflictingReuse.response.ok, 'Conflicting reuse of a mutation ID was accepted by the server.');

  const invalid = await requestJson(`${baseUrl}/rest/v1/rpc/sync_financial_mutations_v1`, {
    method: 'POST', headers,
    body: JSON.stringify({
      p_mutations: [{ ...mutationA, mutationId: `${runId}:invalid`, operation: 'invalid-operation' }],
      p_after_sequence: pulledA.latest,
      p_device_id: deviceA,
      p_limit: 500,
    }),
  });
  assert(!invalid.response.ok, 'Invalid mutation was accepted by the server.');

  console.log('two-client-mutation-ordering: ok');
  console.log('mutation-idempotency: ok');
  console.log('mutation-id-conflict: ok');
  console.log('mutation-validation: ok');
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
