# MYFI — Supabase publishable-key migration, and why the "invalid anon key" finding was a false positive

Date: 2026-08-20
Produced by: MYFI Implementation session
Supersedes the conclusion of: `MYFI_P20_G01_SUPABASE_KEY_INVALID_2026-08-20.md`

## Headline

**The legacy anon key was never invalid.** The 401 that produced the BLOCKING
finding came from an endpoint that rejects *every* non-secret key by design, so it
could not have distinguished a good key from a bad one. The migration to the new
publishable key was still done — it is correct, verified, and good hygiene — but it
does **not** explain the `INVALID API KEY` seen at login on device, and that symptom
is still open.

## 1. Why the earlier 401 was a false positive

The prior evidence tested:

```bash
curl "https://<project>.supabase.co/rest/v1/" -H "apikey: <legacy key>"   # 401
```

`/rest/v1/` is PostgREST's OpenAPI root. It is service-role-only. Its own response
says so:

```json
{"message":"Invalid API key",
 "hint":"Only the `service_role` API key can be used for this endpoint."}
```

The new publishable key gets refused at the same endpoint, just with a clearer
message:

```json
{"message":"Secret API key required",
 "hint":"Only secret API keys can be used for this endpoint."}
```

Both keys "fail" there. The endpoint cannot be used as a key-validity probe.

## 2. What the legacy key actually does on real endpoints

| Endpoint | Legacy JWT anon key | New `sb_publishable_…` |
|---|---|---|
| `GET /auth/v1/settings` | **200** | **200** |
| `GET /rest/v1/financial_ledgers_v2?select=ledger_id&limit=1` | **200** `[]` | **200** `[]` |

The legacy key authenticates fine against both the auth gateway and a real RLS-guarded
table. It was not rotated out from under the repo, and the personal→professional
account migration had not invalidated it.

## 3. Library compatibility (checked, not assumed)

`package.json` declares `^2.105.3`, but `package-lock.json` pins **2.110.8**, which is
what `npm ci` installs in CI and what is installed locally. That version has explicit
new-key support — from `node_modules/@supabase/supabase-js/dist/index.cjs`:

> New-format Supabase API keys (`sb_publishable_…` / `sb_secret_…`) are not JWTs and
> must never be sent as a Bearer token — they belong only in the `apikey` header.

```js
const isNewApiKey = (key) => key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
```

So no library upgrade and no client-code change are required. Live SDK smoke test with
the new key:

```text
createClient(url, sb_publishable_…)
  .from('financial_ledgers_v2').select('ledger_id').limit(1)  -> OK (0 rows, RLS)
  .auth.getSession()                                          -> OK
```

The only shape assumption anywhere in the repo is
`SUPABASE_KEY.length > 20` (`src/lib/supabase.js:7`); the new key is 46 chars.

## 4. Change made

- `.env` → `EXPO_PUBLIC_SUPABASE_KEY` set to the publishable key. `.env` is gitignored
  (`.gitignore:9`), so this is a local-machine change only.
- `eas.json` → same value in `build.preview.env` and `build.production.env`.
  Two lines changed; no structural edit.

`eas.json` is tracked and now carries the publishable key in git. That matches what the
repo already did with the anon key, and publishable keys are public by design — but it
is worth a deliberate decision before the repo goes public, not an accident.

**No secret key (`sb_secret_…`) was requested, seen, written, or referenced anywhere.**
Secret keys belong only server-side and must never enter client config or this repo.

Verification after the change: `.env` and `eas.json` preview values match, both live
endpoints return 200, and `npm run test:gate` is **81 passed, 0 failed, 11 skipped**.

## 5. Still open — the device `INVALID API KEY`

The user really did see `INVALID API KEY` at login on the locally-built APK
(commit `cf7714e`, SHA-256 `268460fb…0348462`). That observation stands; only its
attribution to a bad key is withdrawn.

Most likely cause, and the cheapest thing to check next: **the local build may not have
baked the Supabase env into the bundle.** `src/lib/supabase.js:11` falls back to the
literal string `'offline-public-key'` when `isSupabaseConfigured` is false:

```js
const clientKey = isSupabaseConfigured ? SUPABASE_KEY : 'offline-public-key';
```

An APK carrying `offline-public-key` produces exactly `INVALID API KEY` at login, on
every account, indistinguishable at the UI from a rotated key.

`tools/build-local-internal-apk.ps1:26-27` *does* export both variables from
`eas.json` before building, so a build run through that script is fine. A direct
`gradlew assembleRelease` without those variables in the environment is not. CI is
also fine — every workflow injects them explicitly.

**Next step for Testing & Release:** confirm which command produced that APK. If it was
not `npm run build:apk:local`, rebuild through the script (or CI) and retry login
before assuming anything about keys.

## 6. Noted risk — not acted on

The Supabase dashboard reports the project is "exhausting multiple resources". Whether
to upgrade the plan is the user's decision, not an engineering one. Recorded here
because cloud instability would surface as intermittent sync/auth failures during
P20-G01 device acceptance and could easily be misread as an app defect.

## Status

Phase 9 remains OPEN. P20-G01 items 6–10 remain unmet. The key migration removes a
suspected blocker that turned out not to be one; the real login failure is still
unexplained and is the next thing to isolate.
