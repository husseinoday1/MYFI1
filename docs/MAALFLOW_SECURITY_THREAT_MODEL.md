# MaalFlow — Security Threat Model

Plan reference: `MAALFLOW_MASTER_PLAN_FROZEN.md` §108. Feeds the decisions required by
§109 (local database encryption), §110 (SecureStore), §111 (app lock / biometrics) and
§112 (OCR / voice privacy gate).

## 0. Method, and what this document is not

Every control claimed below was read out of the code at the cited path. Nothing here is
aspirational: a control that is not implemented is recorded as *absent*, not as *planned*.
Where a protection is weaker than a reader might assume, the asymmetry is stated instead
of being smoothed over.

**القاعدة الحاكمة:** لا نضيف آلية أمنية شكلية إذا لم نستطع اختبار recovery/compatibility
لها، ولا نسوّق حماية لم نُثبتها.

Verified against commit `08e1b16`. Re-verify before Play Store submission; §106 production
signing is still unproven and this model assumes it lands first.

---

## 1. Trust boundaries

| # | Boundary | Crossed by |
|---|---|---|
| B1 | Device ↔ app sandbox | Android app sandbox, `allowBackup=false` |
| B2 | App ↔ device keystore | SecureStore (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`) |
| B3 | App ↔ user-controlled filesystem | Backup export / import, CSV share |
| B4 | Device ↔ Supabase | Auth session, mutation protocol, avatar storage |
| B5 | Supabase edge function ↔ OpenAI / Google Gemini | OCR image, raw voice audio |

B5 is the boundary the product has the least control over, and the one §112 must gate.

---

## 2. Assets

### A1 — Financial ledger (highest value)
`maalflow-ledger-v2.db`, opened via `SQLite.openDatabaseAsync(LEDGER_DB_NAME)`
(`src/lib/ledgerDatabase.js:127`) with **no key and no SQLCipher**.

**Stored in plaintext on disk.** Its only protections are the Android app sandbox,
`allowBackup=false`, and whatever full-disk encryption the device itself provides.

### A2 — Backups
`.maalflow` ZIP packages built in `src/lib/maalflowFiles.js`. Encryption is **opt-in**
and password-derived: with a password the payload is AES-GCM sealed into `backup.enc`
with an AAD binding `format:kind:schemaVersion`; without one it is written as plain
`backup.json`. The manifest carries a SHA-256 per file.

### A3 — Credentials
Supabase session tokens are **encrypted at rest**: `secureAuthStorage`
(`src/lib/secureVault.js`) seals every value with a master key before writing it to the
SQLite KV store. The master key and device id live in SecureStore. A one-time migration
reads any legacy plaintext AsyncStorage session, re-seals it, and deletes the original.

### A4 — OCR images
Captured on device, sent to the `smart-ocr` edge function. That function performs **no
storage upload and no table insert** — it is pass-through. The image is forwarded to
**OpenAI** (`https://api.openai.com/v1/responses`) and/or **Google Gemini**
(`https://generativelanguage.googleapis.com/v1beta/models/…:generateContent`).

A receipt photo is not a neutral image: it commonly carries the user's name, card tail,
merchant, location and full purchase history for that visit.

### A5 — Voice artifacts
Same shape via `smart-transcribe`. **Raw audio** goes to
`https://api.openai.com/v1/audio/transcriptions`, and the resulting text to
`/v1/responses` and/or Gemini. Nothing is persisted by our function.

### A6 — Cloud mutations
The V1/V2 mutation protocol, guarded by `unique (user_id, mutation_id)` with
`on conflict … do nothing` (`supabase/migrations/202608140001_financial_mutation_sync_v1.sql`).
30 `enable row level security` statements across the migration set.

---

## 3. Threats

### T1 — Stolen or lost phone
**Reachable:** the plaintext ledger (A1), if the attacker defeats the lock screen or the
device is unencrypted.
**Control:** app lock gates the entire component tree. It arms at cold start when
`cfg.bioLock` is on, and re-arms on foreground when the app has been backgrounded for
`cfg.lockDelaySeconds` (default **300s**) — `App.js:707-722`. Device PIN/pattern fallback
is permitted (`disableDeviceFallback: false`, `src/lib/biometric.js:24`).
**Residual:** the app lock is a UI gate, not encryption. It does not protect A1 against
an attacker with filesystem access. See F-01.

### T2 — Malicious backup access (adb / cloud device backup)
**Control:** `allowBackup=false` in `app.json`, which keeps the ledger out of Android
auto-backup and `adb backup`.
**Residual:** verification against the **merged release manifest** is still owed (§105).
Source config is not proof.

### T3 — Cloud account compromise
**Reachable:** everything that account has synced.
**Control:** RLS on every user-scoped table; the session token is never written in the
clear on device.
**Residual:** password compromise is game over for cloud data by design. Nothing in the
app mitigates a compromised Supabase credential, and it should not claim to.

### T4 — Cross-account access
**Control:** RLS scoping plus the identity-adoption review flow, which blocks pending
local mutations from being silently promoted into a different cloud ledger.
**Residual:** RLS policy coverage has not been re-verified since the rename changed
policy names; re-run against the new Supabase project when it exists.

### T5 — Accidental export
**Reachable:** a full plaintext ledger, in the user's chosen folder or share target.
**Control:** the export flow asks how the file should be protected before writing.
**Residual:** **an unencrypted export is a complete plaintext copy of A1 outside every
boundary above.** This is the single easiest way for a user to lose their own data. See F-03.

### T6 — Sensitive logs
**Control:** the diagnostic payload privacy contract passes
(`tests/dev-diagnostic-payload-privacy.test.cjs`). Runtime `[MAALFLOW:*]` tags carry
timings and state codes, not notes, amounts, or secrets.
**Residual:** none identified. Keep the contract in the gate.

### T7 — Tampered backup
**Control:** per-file SHA-256 in the manifest; AES-GCM authenticates the encrypted
payload and its AAD; restore proofs are SHA-256 digests over a canonical structure with a
domain separator (`src/lib/financialRestoreProofV13.js`), and Supabase receives only the
opaque digest.
**Residual:** an *unencrypted* backup has integrity checking but no authentication — a
manifest and its payload can both be rewritten. Encryption is what makes A2 tamper-evident.

### T8 — Replayed mutation
**Control:** closed at the database layer. `unique (user_id, mutation_id)` plus
`on conflict … do nothing` makes replay idempotent rather than additive.
**Residual:** none. This is the strongest control in the model.

---

## 4. Findings

| ID | Finding | Severity |
|---|---|---|
| **F-01** | Credentials are encrypted at rest; the financial ledger is not. The lower-value asset has the stronger protection. Deliberate, but must never be described as "encrypted local database". | High |
| **F-02** | No `FLAG_SECURE` / screen-capture protection anywhere. Balances and transactions appear in the recent-apps snapshot and are freely screenshottable. | Medium |
| **F-03** | Backup encryption is opt-in. The default path produces a plaintext ledger copy outside the sandbox. | High |
| **F-04** | OCR/voice: our functions persist nothing, but receipt images and **raw audio** leave the device to OpenAI and Google Gemini. Originally blocking because no smart-capture-specific consent existed — `cfg.accountConsentAccepted` covers account and sync terms, a different thing at a different moment, so a user could photograph a receipt without ever being told where it went. **Client side closed** by the §112 gate below. The Play data-safety declaration remains outstanding and is the owner's to file. | Partly closed |
| **F-05** | `allowBackup=false` is verified in source only, not in the merged release manifest. | Medium |
| **F-06** | Production signing is unproven; a debug-signed build is not Release Ready. | Blocking |

---

## 5. Decisions this model hands forward

**§109 — Local database encryption.** The evidence supports **Option A** (sandbox +
`allowBackup=false` + device encryption) *provided* F-01 and F-03 are honoured in the
product copy. Option B (SQLCipher) stays deferred until compatibility, performance,
migration, recovery and Expo/native evidence exist. لا نضيف SQLCipher لأنه يبدو أكثر
احترافاً.

**§110 — SecureStore.** Scope is confirmed narrow and correct: master key and device id
only, never the ledger. The test matrix (first install, reboot, logout, account deletion,
reinstall, biometric toggle, key loss) is still owed.

**§111 — App lock.** Answered above: it locks the whole tree, re-arms after a 300s
background delay, and permits device-credential fallback. The unanswered part is the
recent-app snapshot — F-02.

**§112 — OCR / voice privacy gate.** Implemented in `src/lib/smartCaptureConsent.js`,
enforced at both capture entry points in `src/components/AddTransModal.js`, and contracted
by `tests/smart-capture-privacy-gate.test.cjs`.

| Requirement | Status |
|---|---|
| Disclosure before the *first* capture of each kind, naming the provider | Done — and it runs **before** the OS permission prompt, so nobody grants camera or microphone access before learning where the data goes |
| Consent stored separately from `cfg.accountConsentAccepted` | Done — `smartCaptureImageConsent` and `smartCaptureVoiceConsent`, independent of each other and of sync consent |
| Withdrawable | Done — Settings › Smart capture & privacy, always visible (not inside the Legal group, which only renders when the privacy/terms URLs are configured) |
| App fully usable without smart capture | Already true; the disclosure states it, and declining returns cleanly to manual entry |
| Play data-safety declaration | **Outstanding — owner's action.** Photos and audio are transmitted off-device and must be declared |

Consent is stored as the disclosure *version*, not a boolean: changing the providers or
the scope of what leaves the device means bumping `SMART_CAPTURE_CONSENT_VERSION`, which
re-asks everyone rather than inheriting consent given to a different statement.

A decline is not persisted as a permanent opt-out — the next attempt asks again. That is
deliberate: a user who taps the camera by accident and backs out has not opted out of the
feature forever.

Google Play's data-safety form must match this behaviour. Shipping it undeclared would be
a policy violation as well as a privacy one, which is why that row stays open.

---

## 6. R01 decisions (retained)

- Android source manifest must contain `allowBackup=false`; verifying the merged release
  artifact remains a later gate.
- SQLite is currently plaintext. We do not claim local DB encryption.
- SecureStore holds secrets, not the financial ledger.
- Diagnostics and logging contain no notes, raw financial history, or secrets.
- Production signing is not yet established; debug signing is not Release Ready.
