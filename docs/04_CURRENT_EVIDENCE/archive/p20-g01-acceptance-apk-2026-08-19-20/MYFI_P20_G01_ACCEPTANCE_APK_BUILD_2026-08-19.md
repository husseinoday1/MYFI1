# MYFI P20-G01 — Item 1 Evidence: Acceptance APK Built and Verified

Date: 2026-08-19
Produced by: MYFI Implementation session
Scope: **item 1 of 10 only** ("Build the signed P20-G01 acceptance APK").
Items 2–10 are real-device/Supabase steps and remain PENDING.

## Correction to the consolidated status file

`MYFI_PHASE9_STATUS_CONSOLIDATED_2026-08-19.md` records "10 required steps, 0 done".
That was already stale when written: the canonical acceptance build had run and
succeeded earlier the same day. Item 1 is DONE.

```text
Workflow : .github/workflows/p20-g01-phase9-restore-epoch-gate.yml
Run      : 32229015804 — conclusion SUCCESS
Branch   : r05-p20-phase9-restore-epoch-gate
Commit   : fd98f80dd1eb2f7aca9ad23d5d06aa64940e8ba0
Base     : d847957c05dc9fe3cdd0bc3eb9c93d525f65deb0 (accepted P20 baseline)
```

The run enforced the exact-scope check (5 files, no drift from the accepted P20
baseline) and passed the P20-G01 contract, P20 client-closure regression, P19
final regression, static gate, runtime gate, `verify:android`, and the keystore
certificate check before producing the APK.

## Artifact

```text
Artifact : P20-G01-phase9-restore-epoch-gate-apk (id 9356765965, not expired)
Local    : C:\Users\husse\Downloads\MYFI_P20_G01_ACCEPTANCE_APK\
           android\app\build\outputs\apk\release\app-release.apk
SHA256   : b2bc29d349643eef3729aa66fa9713327be6dd21efa8188d11d6053c2aa80a89
Size     : 34,754,487 bytes
ABI      : arm64-v8a only
Retention: 7 days from 2026-08-19 (re-run the workflow if it lapses)
```

`sha256sum` of the downloaded APK matches `app-release.apk.sha256` and the
`SHA256=` line in `P20-G01-build-evidence.txt`.

## Independent local verification (this session, not re-using CI's word)

Branch `impl/p20-g01-acceptance-apk-2026-08-19` (from `f3fddf3`, which contains
the gate commit `fd98f80` plus docs). No code changed.

| Check | Result |
|---|---|
| `tests/p20-g01-phase9-restore-epoch-gate.test.cjs` | PASSED |
| `tests/p20-v2-client-closure.test.cjs` | PASS |
| `tests/p19-final-clean-v2-hardening.test.cjs` | PASS |
| `npm run test:gate:static` | 62 passed, 0 failed, 11 skipped |
| `npm run test:gate:runtime` | 18 passed, 0 failed, 6 skipped |
| `npm run verify:android` | Exported (android bundle 5.74 MB) |

APK-level checks (beyond what CI did — CI only checked the keystore, not the
signed artifact):

| Check | Result |
|---|---|
| `apksigner verify` | v2 scheme: **true** |
| Signer #1 SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` — matches the installed MYFI cert, so item 2 (install over, no Clear Data) is signature-compatible |
| Gate code shipped in `assets/index.android.bundle` | `P20_G01_PHASE9_RESTORE_EPOCH_GATE_PASS`, `advance_financial_restore_epoch_v2`, `controlled_recovery` present |
| Acceptance relabel of the Settings row | present (EN "Restore Epoch gate — disposable only" and AR "اختبار Restore Epoch …" — stored UTF-16 in the Hermes string table, so an ASCII-only grep misses them) |
| `EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE` as a runtime string | absent from the bundle, i.e. inlined at build time |

**Honest limit:** the *value* of the acceptance flag is not independently
decompilable from the Hermes bytecode. It rests on the workflow setting
`EXPO_PUBLIC_P19_RESTORE_EPOCH_DEVICE_GATE=1` in both `GITHUB_ENV` and the
Gradle step, recorded as `AcceptanceFlag=...=1` in the build evidence, plus the
inlining signal above. First real-device confirmation is item 3: the Settings
row must read "Restore Epoch gate — disposable only". If it still reads "Local
SQLite evidence", the flag did not bake in and the APK must be rebuilt.

## Safety posture of this session

No real financial data was touched, no reset/restore was executed, `main` was
not modified, and nothing was pushed. The APK is inert until the gate row is
pressed on a disposable, financially empty account.

## Next

Item 2: install this APK over the current app **without** Clear Data, then
item 3: confirm the gate refuses to run on the real non-empty account. Those are
device steps and belong to the MYFI Testing & Release session.
