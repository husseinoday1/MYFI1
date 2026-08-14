const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(workspace, '.env'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.trim().startsWith('#')).map(line => {
  const index = line.indexOf('=');
  return [line.slice(0, index), line.slice(index + 1)];
}));

const credentialsPath = process.env.MYFI_TEST_CREDENTIAL_FILE;
const imagePath = process.env.MYFI_TEST_IMAGE_FILE;
const audioPath = process.env.MYFI_TEST_AUDIO_FILE;
const credentials = process.env.MYFI_TEST_EMAIL && process.env.MYFI_TEST_PASSWORD
  ? { email: process.env.MYFI_TEST_EMAIL, password: process.env.MYFI_TEST_PASSWORD }
  : credentialsPath ? JSON.parse(fs.readFileSync(credentialsPath, 'utf8')) : null;
if (!credentials || !imagePath || !audioPath) {
  throw new Error('Temporary credentials, image, and audio paths are required.');
}
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

(async () => {
  const serviceFailures = [];
  const auth = await requestJson(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  assert(auth.response.ok, `Authentication failed (${auth.response.status}).`);
  assert(auth.body.access_token && auth.body.user?.id, 'Authentication response is incomplete.');
  const token = auth.body.access_token;
  const userId = auth.body.user.id;
  console.log('auth: ok');

  const headers = {
    apikey: publishableKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const readSnapshot = async () => {
    const read = await requestJson(`${baseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=user_id,trans,debts,goals,wallets,commitments,cats,cfg,revision,updated_at`, { headers });
    assert(read.response.ok, `Cloud read failed (${read.response.status}).`);
    return Array.isArray(read.body) ? (read.body[0] || null) : null;
  };

  const rpcSync = async (expectedRevision, snapshot, deviceId) => {
    const result = await requestJson(`${baseUrl}/rest/v1/rpc/sync_user_data_v2`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        p_expected_revision: Number(expectedRevision || 0),
        p_trans: snapshot.trans || [],
        p_debts: snapshot.debts || [],
        p_goals: snapshot.goals || [],
        p_wallets: snapshot.wallets || [],
        p_commitments: snapshot.commitments || [],
        p_cats: snapshot.cats || [],
        p_cfg: snapshot.cfg || {},
        p_device_id: deviceId,
      }),
    });
    assert(result.response.ok, `sync_user_data_v2 failed (${result.response.status}).`);
    const row = Array.isArray(result.body) ? result.body[0] : result.body;
    assert(row && typeof row.accepted === 'boolean' && Number.isFinite(Number(row.revision)), 'Sync RPC response is malformed.');
    return row;
  };

  const original = await readSnapshot();
  let latestRevision = Number(original?.revision || 0);
  const testId = `cloud-e2e-${Date.now()}`;
  const testSnapshot = {
    trans: [{ id: testId, type: 'expense', amt: 12500, note: 'Cloud integration test', walletId: 'wallet-e2e' }],
    debts: [], goals: [], commitments: [],
    wallets: [{ id: 'wallet-e2e', name: 'Test wallet', balance: 87500 }],
    cats: [{ id: 'cat-e2e', name: 'Test category', budget: 25000 }],
    cfg: { lang: 'ar', currency: 'IQD', integrationTest: testId },
  };

  try {
    const accepted = await rpcSync(latestRevision, testSnapshot, `e2e-${testId}`);
    assert(accepted.accepted === true, 'Revision-matched cloud write was rejected.');
    assert(Number(accepted.revision) > latestRevision, 'Revision did not advance.');
    latestRevision = Number(accepted.revision);

    const read = await readSnapshot();
    assert(read?.cfg?.integrationTest === testId, 'Cloud data mismatch.');
    assert(read?.trans?.[0]?.amt === 12500, 'Transaction amount was not preserved.');
    console.log('sync-rpc-write-read: ok');

    const stale = await rpcSync(latestRevision - 1, { ...testSnapshot, cfg: { ...testSnapshot.cfg, staleWrite: true } }, `stale-${testId}`);
    assert(stale.accepted === false, 'Stale revision was incorrectly accepted.');
    assert(Number(stale.revision) === latestRevision, 'Stale response did not return the current revision.');
    console.log('optimistic-concurrency: ok');

    const invoke = async (name, filePath, mimeType) => {
      const form = new FormData();
      const bytes = fs.readFileSync(filePath);
      form.append('file', new Blob([bytes], { type: mimeType }), filePath.split(/[\\/]/).pop());
      return requestJson(`${baseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
        body: form,
      });
    };

    const ocr = await invoke('smart-ocr', imagePath, 'image/png');
    if (ocr.response.ok && typeof ocr.body.text === 'string' && ocr.body.text.trim()) console.log('image-analysis: ok');
    else serviceFailures.push(`OCR failed (${ocr.response.status}, ${ocr.body.code || 'no-code'}): ${ocr.body.error || 'unknown error'}`);

    const voice = await invoke('smart-transcribe', audioPath, 'audio/wav');
    if (voice.response.ok && typeof voice.body.text === 'string' && voice.body.text.trim()) console.log('voice-analysis: ok');
    else serviceFailures.push(`Voice failed (${voice.response.status}, ${voice.body.code || 'no-code'}): ${voice.body.error || 'unknown error'}`);
  } finally {
    // Restore through the same revision-checked RPC; never bypass RLS with direct DML.
    const restore = original || { trans: [], debts: [], goals: [], wallets: [], commitments: [], cats: [], cfg: {} };
    const restored = await rpcSync(latestRevision, restore, `e2e-restore-${Date.now()}`);
    assert(restored.accepted === true, 'Original snapshot restore was rejected.');
    console.log('cloud-restore-via-rpc: ok');
  }

  if (serviceFailures.length) throw new Error(serviceFailures.join('\n'));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
