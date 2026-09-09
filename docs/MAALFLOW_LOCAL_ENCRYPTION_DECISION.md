# MaalFlow — Local Database Encryption Decision (§109)

Plan reference: `MAALFLOW_MASTER_PLAN_FROZEN.md` §109. Evidence base:
`MAALFLOW_SECURITY_THREAT_MODEL.md` (§108), findings F-01 and F-03.

## Decision

**Option A.** The Android app sandbox, `allowBackup=false`, and device full-disk
encryption are accepted as adequate for the current threat model. The local SQLite
ledger stays plaintext. SQLCipher is **not** adopted at this time.

This is a decision, not a deferral: it is what ships, and it is defensible. It is also
**conditional** — the conditions are in §3, and they are enforced by a test, not by
goodwill.

---

## 1. What is actually true today

| | |
|---|---|
| Ledger | `maalflow-ledger-v2.db`, `SQLite.openDatabaseAsync()` — **plaintext on disk** |
| Auth tokens | **Encrypted at rest** (`secureAuthStorage`, AES envelope, master key in SecureStore) |
| Backups | AES-GCM **when the user sets a password**; plain JSON otherwise |
| Sandbox | `allowBackup=false`, now audited in the built artifact (§105) |

Note the asymmetry recorded as F-01: the credentials are protected more strongly than
the financial data they unlock. That is a consequence of SecureStore being cheap and
database encryption being expensive, not of a considered risk ranking.

## 2. Why Option A, honestly

Not because the ledger does not deserve encryption. Because:

**The cost is a driver replacement, not a flag.** `expo-sqlite@~16.0.10` exposes no key,
cipher or `PRAGMA key` API. Option B means swapping the SQLite driver (op-sqlite with
SQLCipher, or a custom native module) across all 5 database entry points, revalidating
the entire V7 ledger, and re-running the Phase 15 performance work — the 50K-row tiers,
the startup reuse path, the staging batch work — on an encrypted driver whose per-query
cost is unmeasured.

**The plan forbids adopting it on appearance.** §109 is explicit: not "because it looks
more professional". Compatibility, performance, migration, recovery and Expo/native
validation must exist first. None of them do.

**The threat it would close is narrower than it sounds.** Database encryption protects
A1 against an attacker with filesystem access on an unlocked or rooted device. It does
nothing for the two ways data realistically leaves this app today: an unencrypted backup
export (F-03), and smart capture uploads (F-04). Both are closer to the user and cheaper
to address, and F-04 already has been.

**Adding it now would be the worst version of it.** An unproven encrypted driver, before
launch, with no recovery story, on a financial ledger, is a data-loss risk that exceeds
the disclosure risk it removes.

## 3. Conditions this decision depends on

Option A is only honest while all of these hold. Breaking any one of them invalidates
the decision, not merely the wording.

1. **We never claim the local database is encrypted.** Not in the app, not on the store
   listing, not in marketing, not in support replies. "Encrypted backup" is true and may
   be said; "your data is encrypted" is not.
2. **`allowBackup=false` keeps holding in the shipped artifact**, verified per build by
   the §105 audit rather than by reading config.
3. **The privacy policy states plainly** that financial data is stored unencrypted on the
   device and protected by the device's own security.
4. **Backup export keeps offering encryption prominently** — it is the one place the user
   can protect this data themselves.

**Verified 2026-09-09:** condition 1 currently holds. Every encryption string in the app
refers to backup files (`ArchiveScreen`, `SettingsScreen`, `SettingsLegacyScreen`), which
is accurate. No marketing or store document claims database or device-level encryption.
Condition 1 is now enforced by `tests/local-encryption-honesty.test.cjs`.

## 4. What would flip this to Option B

Revisit when any of these becomes true. This is the list a future reader should check
rather than re-deriving the argument:

- The app begins storing data belonging to someone other than the account holder
  (shared spaces, family accounts, any multi-party ledger).
- A regulator, bank partner, or enterprise customer requires encryption at rest.
- `expo-sqlite` gains a supported cipher API, which collapses the cost from a driver
  replacement to a configuration change.
- Real users report device theft with data exposure.
- The product starts making any claim that requires it to be true.

## 5. If Option B is ever taken

It needs all five, and in this order:

1. **Recovery first.** What happens when the key is lost or the keystore is cleared? An
   encrypted ledger nobody can open is worse than a plaintext one.
2. **Migration.** Plaintext → encrypted, on-device, interruptible, with a proven rollback.
3. **Performance.** Re-run the Phase 15 measurements at every dataset tier. Encryption
   sits under every query in the app.
4. **Compatibility.** Backup format, restore proofs, and the V7 ledger must survive.
5. **Expo/native validation.** Prebuild, CI build, and a real device.

Only then may the product say it. Not before.

---

## Standing rule

لا نضيف آلية أمنية شكلية إذا لم نستطع اختبار recovery/compatibility لها،
**ولا نسوّق حماية لم نُثبتها.**
