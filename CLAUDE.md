# MYFI — Claude Code project instructions

MYFI is a local-first personal-finance app (Expo / React Native / Android) whose
financial truth lives in on-device SQLite, with Supabase used only for gated sync
and backup. Real user money data is at stake; correctness outranks speed.

This file is loaded into **every** session. It stays small on purpose: it says how
to think, where to look, and what must never be violated. Detail lives elsewhere —
follow the pointers instead of duplicating them here.

## 1. Non-negotiable rules

**Financial invariants** (authority: `docs/MYFI_FINANCIAL_CONTRACT.md` — read it
before touching money code, do not rely on this summary):
SQLite owns financial truth · local durable commit before cloud · integer minor
units · every balance derivable from postings · no silent repair · immutable
financial IDs (edit = revision bump) · delete = void/tombstone · historical FX
frozen per transaction · transfers are never income or expense · base currency
locked once history exists.

**Verification floor.** Token economy never reduces verification for: financial
calculations, balances, transactions, migrations, schema changes, restore/backup,
existing-user upgrades, destructive operations, auth/security, or release. In
those domains, verify from source and tests — cached summaries are not evidence.

**Standing engineering rules** (authority: `docs/00_MYFI_CANONICAL_AUTHORITY.md`
§ "Standing Engineering Rules", binding, read there for the full text):
CI is the only trusted build path for acceptance · stateful/counter logic needs a
test that repeats the action · `/code-review` clean before every push · CI safety
gates use ancestry + a repo-tracked allowlist, never a hardcoded commit · a change
is done only when a named CI run ID is green · every change and its rationale
(including rejected alternatives) is written into the evidence files, not just the
commit message.

**Git safety.** Verify branch/HEAD before acting. Never commit or push without
explicit user approval in chat. Never force-push, reset --hard, or rewrite shared
history. Feature work happens on a branch, not on `main`.

## 2. Authority order

Never resolve a conflict by filename or recency of prose. The binding order is
A0–A7, defined in `docs/00_MYFI_CANONICAL_AUTHORITY.md`. A0 — actual repository
state — always wins over any document, including this one.

## 3. Session start (do this, not a repository scan)

```
node tools/myfi-context.mjs          # add --fetch to compare against the remote
```

One command returns branch, HEAD, worktree, versions, SQLite schema version, and
which knowledge domains the cached state files have gone stale on. Then:

1. Read `.myfi-ai/PROJECT_STATE.md` and `.myfi-ai/CURRENT_TASK.md` — a **cache**,
   never authority. If the collector reports STALE, re-verify only the domains it
   flagged; if it flags a high-risk domain (`!!`), re-verify from source before
   making any claim about it.
2. Read `docs/00_CONTEXT_MAP.md` to find the right place to look for the task.
3. Read `docs/00_DOCUMENT_INDEX.md` before opening anything under `docs/` — it
   says which documents are canonical and which are historical.
4. Load only the canonical documents the task actually needs.

Do **not** read all of `docs/` (103 files) or sweep `src/lib/` (96 modules).
Search first, read targeted files second, expand only when evidence demands it.

## 4. Where knowledge lives

| Kind | Location | Trust |
|---|---|---|
| Durable rules | this file + nested `CLAUDE.md` per directory | stable |
| Canonical truth | `docs/` per the authority order | authoritative |
| Verified state cache | `.myfi-ai/PROJECT_STATE.md` | only with fresh provenance |
| Active task state | `.myfi-ai/CURRENT_TASK.md` | only with fresh provenance |
| Decisions / routing | `.myfi-ai/DECISIONS.md`, `.myfi-ai/*_HANDOFF.md` | supporting |

Nested `CLAUDE.md` files exist in `src/lib/`, `tests/`, `docs/`, `supabase/` and
`.github/` and load automatically when you work there. Local rules belong in them,
not here.

Never write volatile facts (branch, HEAD, test results, current blocker) into this
file or any `CLAUDE.md`. They belong in `.myfi-ai/` with a provenance header.

## 5. Task state and compaction

Keep `.myfi-ai/CURRENT_TASK.md` current during long work — objective, acceptance
criteria, verified completed work, files involved, blockers, decisions, next exact
action. Nothing important may exist only in conversation history.

After a compaction or in a fresh session, recover in this order: this file →
`node tools/myfi-context.mjs` → `.myfi-ai/CURRENT_TASK.md` → the diff for the
invalidated domains → the task. Do not restart the analysis from scratch.

## 6. Essential commands

```
npm run test:gate        # full quality gate (the acceptance test suite)
npm run test:database    # schema + backfill + financial core
npm run verify:android   # Expo Android export check
node tools/myfi-context.mjs --fetch   # baseline + remote delta + staleness
```

Builds used as acceptance evidence come from CI, never from a local build.

## 7. Reporting and context economy

Report compactly during routine progress; explain in depth for decisions,
architecture, risk, and conflicts. Prefer bounded tool output (targeted greps,
failure summaries) over dumping logs, directory trees, or full files into context.
The goal is minimum *sufficient verified* context — not minimum context.
