# MYFI — Supabase anon key in repo is invalid (blocks all builds/logins)

Date: 2026-08-20
Produced by: MYFI Testing & Release session
Severity: **BLOCKING** — stops all P20-G01 device acceptance work (items 2–10)
and, more broadly, blocks login on any APK built from the current repo state.

## Finding

`EXPO_PUBLIC_SUPABASE_KEY` (identical value in both `.env` and
`eas.json` → `build.preview.env`) is **rejected by the live Supabase project**:

```bash
curl -s -o /dev/null -w "HTTP_STATUS:%{http_code}\n" \
  "https://qihahfufuupgivnjzmfe.supabase.co/rest/v1/" \
  -H "apikey: <the EXPO_PUBLIC_SUPABASE_KEY value in .env/eas.json>"

HTTP_STATUS:401
```

This is independent of the app, the build, or the device — a plain `curl` with
no app code involved gets 401 from Supabase's REST gateway using the key
that's checked into the repo right now.

## How this was found

While completing the P20-G01 device acceptance re-run (new APK built locally
from commit `cf7714e` on `impl/p20-g01-acceptance-apk-2026-08-19`, containing
the Option A restore-epoch fix, SHA-256
`268460fba16b057ee0cee7a94ff27732c4c641668748bb12caa8d0d830348462`), the user
got `INVALID API KEY` on login for every account tried. Before assuming a
build defect, the key itself was checked directly against Supabase and found
invalid at the source — this is not a build-process artifact.

## Consequence

- Any APK built from this repo's checked-in config (whether by CI or locally)
  will hit the same failure. This is not specific to the local build tried
  today.
- P20-G01 items 2–10 cannot proceed — no account can log in, so there is no
  way to reach the disposable-account or real-account test states at all.

## Likely cause (not confirmed — needs Implementation/Planning to check)

Per project memory, MYFI's Supabase/GitHub/signing accounts are mid-migration
from personal to professional ownership. A key rotation or project change as
part of that migration, not yet reflected in `.env`/`eas.json`, is the most
plausible explanation. Not verified from this session — Testing & Release has
no access to the Supabase project's dashboard/settings to check current keys.

## What's needed to unblock

1. The current valid anon key for the live Supabase project (still
   `qihahfufuupgivnjzmfe`, or a new project if one was created as part of the
   account migration).
2. Confirmation of which `.env`/`eas.json` fields need updating, since both
   currently carry the same stale value.
3. Once fixed, Testing & Release needs to rebuild locally (or via CI) and
   retry from item 2.

No code was changed by this session in response to this — updating
`EXPO_PUBLIC_SUPABASE_KEY` is a config change with app-wide impact and needs
the correct current value from whoever manages the Supabase project.
