const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(workspace, '.env'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).filter(Boolean).map(line => {
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
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const requestJson = async (url, options) => {
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
  const testId = `cloud-e2e-${Date.now()}`;
  const payload = {
    user_id: userId,
    trans: [{ id: testId, type: 'expense', amt: 12500, note: 'Cloud integration test', walletId: 'wallet-e2e' }],
    debts: [],
    goals: [],
    wallets: [{ id: 'wallet-e2e', name: 'Test wallet', balance: 87500 }],
    commitments: [],
    cats: [{ id: 'cat-e2e', name: 'Test category', budget: 25000 }],
    cfg: { lang: 'ar', currency: 'IQD', integrationTest: testId },
    updated_at: new Date().toISOString(),
  };
  const upsert = await requestJson(`${baseUrl}/rest/v1/user_data?on_conflict=user_id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(payload),
  });
  assert(upsert.response.ok, `Cloud write failed (${upsert.response.status}).`);

  const read = await requestJson(`${baseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}&select=*`, {
    headers,
  });
  assert(read.response.ok, `Cloud read failed (${read.response.status}).`);
  assert(Array.isArray(read.body) && read.body[0]?.cfg?.integrationTest === testId, 'Cloud data mismatch.');
  assert(read.body[0]?.trans?.[0]?.amt === 12500, 'Transaction amount was not preserved.');
  console.log('sync-and-rls: ok');

  const invoke = async (name, path, mimeType) => {
    const form = new FormData();
    const bytes = fs.readFileSync(path);
    form.append('file', new Blob([bytes], { type: mimeType }), path.split(/[\\/]/).pop());
    return requestJson(`${baseUrl}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      body: form,
    });
  };

  const ocr = await invoke('smart-ocr', imagePath, 'image/png');
  if (ocr.response.ok && typeof ocr.body.text === 'string' && ocr.body.text.trim()) {
    console.log('image-analysis: ok');
  } else {
    serviceFailures.push(`OCR failed (${ocr.response.status}, ${ocr.body.code || 'no-code'}): ${ocr.body.error || 'unknown error'} ${String(ocr.body.reason || ocr.body.details || '').slice(0, 500)}`);
    console.log('image-analysis: unavailable');
  }

  const voice = await invoke('smart-transcribe', audioPath, 'audio/wav');
  if (voice.response.ok && typeof voice.body.text === 'string' && voice.body.text.trim()) {
    console.log('voice-analysis: ok');
  } else {
    serviceFailures.push(`Voice failed (${voice.response.status}, ${voice.body.code || 'no-code'}): ${voice.body.error || 'unknown error'} ${String(voice.body.reason || voice.body.details || '').slice(0, 500)}`);
    console.log('voice-analysis: unavailable');
  }

  const cleanup = await fetch(`${baseUrl}/rest/v1/user_data?user_id=eq.${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers,
  });
  assert(cleanup.ok, `Test row cleanup failed (${cleanup.status}).`);
  console.log('cloud-cleanup: ok');
  if (serviceFailures.length) throw new Error(serviceFailures.join('\n'));
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
