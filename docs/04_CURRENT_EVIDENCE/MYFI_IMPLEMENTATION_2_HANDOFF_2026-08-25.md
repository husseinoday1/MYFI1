# MYFI — Implementation 2 handoff → Implementation 3

**Date:** 2026-08-25
**Branch:** `impl/p10-014a-local-strategy-b-device-gate-2026-08-22`
**HEAD:** `d2ed3ae docs(p10): record live production restore closure`
**Upstream:** in sync, `0/0`. Nothing of mine is unpushed.

## Read this first — a status claim in circulation is wrong

A Planning & Audit draft for Testing & Release states:

> "Strategy B/V13 ما زالت معزولة عن production restore"

**That is no longer true, and acting on it is dangerous.** Verified on this HEAD:

- `src/store/slices/dataSlice.js` imports `startCanonicalRestoreProductionV13`,
  `resumeCanonicalRestoreProductionV13` and `markCanonicalRestoreActivatedV13` from
  `../../lib/financialRestoreProductionV13`.
- `importBackup` now branches into that engine: `const productionRestore =
  options?.triggerKind === 'undo' || (canonicalBackupCandidate(candidate) && !!get().user
  && get().financialLedgerV7Cutover)`.
- Commit `5209d17 feat(p10): wire production canonical restore` touched `dataSlice.js`
  (+189), `SettingsScreen.js` and `SettingsLegacyScreen.js` — the three entry points the
  pre-wiring checklist listed as untouched.
- `d2ed3ae` is literally titled "record live production restore closure".

So a real user tapping restore on a signed-in, cut-over account now goes through the V13
production engine. If Testing & Release believes the engine is isolated, they may skip
testing the live path, or assume a restore attempt is harmless because "nothing is
wired". Correct the draft before it is sent.

**Consequence for the pre-wiring checklist:** section C of
`MYFI_P10_PRE_WIRING_CHECKLIST_2026-08-21.md` says "App.js, dataSlice.js and the settings
restore flow are untouched by Phase 10 so far", and the header says no module has a caller
in `src/`. Both are now stale. The checklist's A1/A2/B1 items still matter, but its
premise — that nothing is wired, so nothing is urgent — has been overtaken. A2 in
particular (promotion must refuse a stage built over a moved ledger) was written as
"blocking the moment something is wired". Something is wired.

I did not verify whether V13 implements A2's generation revalidation; my context ran out
mid-check. **That is the first thing to check.**

## What I verified of the draft

| Claim | Result |
|---|---|
| CI run `32718230827`, commit `ed436ef` | **True.** Run is on `ed436ef`, completed/success. |
| `ed436ef` is the accepted build | True, but note HEAD is one commit later (`d2ed3ae`), so the accepted build is not the tip. |
| Docs modified locally, not pushed | **True.** `MYFI_ENGINEERING_HANDOFF.md`, `docs/00_MYFI_CANONICAL_AUTHORITY.md`, `docs/MYFI_SECURITY_THREAT_MODEL.md` are modified and uncommitted, plus ~15 untracked files including new CLAUDE.md files and P10-014A planning docs. |
| `test:gate` 120/0/11 | **Not verified.** I did not run it this session. |

## A correction I made to my own analysis

I first reported "10 unpushed commits including the production wiring". That was wrong: I
had compared against `impl/p20-g01-acceptance-apk-2026-08-19`, the old branch. Work moved
to the P10-014A branch days ago. Always confirm the branch before reading a delta —
this repo has several long-lived `impl/*` branches and the active one changes.

## What was open when I stopped

1. Reviewing the Planning draft for Testing & Release (above). Finding stands, not sent.
2. Nothing else. No uncommitted work of mine, no in-flight CI of mine.

## Traps worth carrying

**The working directory is shared.** Three sessions plus Codex write to
`C:\Users\husse\OneDrive\Документы\MYFI`. Twice this session my commit carried someone
else's work: once via `git add -A` sweeping an untracked design doc, once because my
commit's parent was already their commit. Run `git log --oneline -3` and `git status`
before every commit, and stage explicit paths rather than `-A`.

**Verify the installed build, not the checked-out branch.** A day was spent diagnosing a
cold-start defect that had already been fixed; the phone was running an APK four commits
behind and nothing said so.

**Peer status reports have been wrong four times today** — a harness claimed to print
per-tier results that did not, a commit described as unpushed that was already an
ancestor, a branch tip named that was stale, and now the isolation claim above. Read the
code or the git state, not the summary.

**The phone is USB-attached** and `adb` is at
`C:\Users\husse\AppData\Local\Android\Sdk\platform-tools\adb.exe` (not on PATH). Driving
it — force-stop, install, relaunch — is visible and alarming to whoever is holding it.
Ask first.

## Standing decisions that must not be re-litigated

- **Strategy B** chosen by the user on device measurements
  (`MYFI_P10_STRATEGY_B_DECISION_2026-08-21.md`).
- **The P10-012 migration stays unapplied** until the session that actually tests it, by
  the user's decision after being shown it rewrites a live function. Reasoning is recorded
  in the pre-wiring checklist B1.
- **Lock budget must be stated against a network assumption.** The epoch handshake is 13 ms
  local + 581 ms network; at 1k rows the fence is >90% network wait.
