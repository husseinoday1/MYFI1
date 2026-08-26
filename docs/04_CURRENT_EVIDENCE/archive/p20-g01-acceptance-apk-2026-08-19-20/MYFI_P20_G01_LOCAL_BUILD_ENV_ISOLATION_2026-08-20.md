# MYFI P20-G01 — Local `gradlew assembleRelease` does not propagate EXPO_PUBLIC_* env vars; pivoting to CI

Date: 2026-08-20
Produced by: MYFI Testing & Release session
Status: **STILL BLOCKED, reminder bump 2026-08-20.** Local build path fully
abandoned — even a hardcoded literal fallback (no env var involved at all,
`src/lib/supabase.js` edited to `process.env.EXPO_PUBLIC_SUPABASE_KEY ||
'sb_publishable_v8aCmN7-gYLzaOrIkp6U-A_LAXvu-Iu'` directly in source, in the
disposable `C:\MYFI-TESTREL-BUILD` clone only, never committed) still failed
to appear in the built bundle. This points to something deeper than env-var
propagation in the local Gradle/Metro pipeline on this machine — not
something Testing & Release should keep spending time on.

**Action needed from Implementation/Planning:** update
`EXPECTED_BASE` in `.github/workflows/p20-g01-phase9-restore-epoch-gate.yml`
to the current accepted commit on `impl/p20-g01-acceptance-apk-2026-08-19`
(or otherwise unblock the exact-scope check), then build via CI —
Testing & Release is ready to install and continue P20-G01 items 2–10 the
moment a correctly-flagged, correctly-keyed APK is available from there.

## What was tried

Multiple local builds of the acceptance APK from
`impl/p20-g01-acceptance-apk-2026-08-19` (through commit `cf7714e`, later
`afad788`), using `gradlew.bat app:assembleRelease` directly (the
`tools/build-local-internal-apk.ps1` wrapper doesn't set the acceptance flag
`EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1`, so it was called manually
instead), from a fresh ASCII-path clone (`C:\MYFI-TESTREL-BUILD`, the
original OneDrive path has non-ASCII characters that break the Gradle JVM
launcher's jarfile resolution).

Attempted fixes, each verified by extracting `assets/index.android.bundle`
from the resulting APK and grepping for the real Supabase key fragment vs.
the literal fallback string `offline-public-key` (see `src/lib/supabase.js:5-11`):

| Attempt | Result in bundle |
|---|---|
| Shell `$env:EXPO_PUBLIC_SUPABASE_KEY` set before `gradlew`, no `--rerun-tasks` | `offline-public-key` present, real key absent |
| Same, with `--rerun-tasks` (rules out Gradle task-cache staleness) | Same — `offline-public-key` present |
| `.env` file copied into the clone (git-ignored, so a fresh clone never has it) matching the shared original's current content (updated to the new `sb_publishable_...` key by Implementation's `afad788`) | Same — `offline-public-key` present |
| Metro cache (`$env:TEMP\metro-*`, `haste-map-*`, `node_modules\.cache`) cleared, rebuilt with a confirmed-empty cache (`warning: Bundler cache is empty, rebuilding` in the build log) | Same — `offline-public-key` present |

At the last attempt, the shell's `$env:EXPO_PUBLIC_SUPABASE_KEY` was
independently confirmed present and correct-length (208 chars, the legacy
JWT key — itself confirmed valid against `/auth/v1/settings`, 200 OK) at the
moment `gradlew` was invoked. The resulting bundle still contained neither
that key nor the `.env` file's `sb_publishable_...` key — only the
`offline-public-key` fallback, in every attempt regardless of source.

## Conclusion

`app:createBundleReleaseJsAndAssets` (which shells out to `npx expo
export:embed`, per `android/app/build.gradle:21`) does not receive
`EXPO_PUBLIC_*` values from the invoking shell's environment nor from a
present `.env` file, when invoked via `gradlew.bat` directly on this machine.
The exact isolation mechanism (Gradle worker/exec environment scoping vs.
some other cause) was not root-caused — this is a build-tooling investigation
that belongs with Implementation, not something to keep spending
Testing & Release time/tokens on speculatively.

**What is proven to work**: the original CI workflow
(`.github/workflows/p20-g01-phase9-restore-epoch-gate.yml`) produced the
item-1 acceptance APK correctly, with the flag and (presumably) correct key
baked in — confirmed on-device (correct Settings-row label, working refusal
behavior on real/disposable accounts) before this local-build detour started.

## Blocker to using CI now

The workflow's exact-scope guard is hardcoded to the original P20 baseline:

```bash
EXPECTED_BASE="d847957c05dc9fe3cdd0bc3eb9c93d525f65deb0"
test "$(git rev-parse HEAD^)" = "$EXPECTED_BASE"
```

The branch has since advanced past that single-commit scope (D1, D2, evidence
commits, the key migration). Running the workflow as-is on the current branch
tip will fail this check immediately. Testing & Release does not have
standing to change a CI safety gate unilaterally.

## Request

Implementation/Planning: please either update `EXPECTED_BASE` (or the
scope-check logic) to accept the current branch tip, or provide an
alternative build path, then trigger/re-run the workflow (or tell Testing &
Release to do so via `gh workflow run ... --ref
impl/p20-g01-acceptance-apk-2026-08-19`) so a correctly-configured APK is
available. Local `gradlew` builds on this Testing & Release machine are not
a reliable substitute until the env-var isolation issue above is understood.

No code was changed by this session. `C:\MYFI-TESTREL-BUILD` is a disposable
local clone (not the shared working directory) and can be deleted at any
time without consequence.
