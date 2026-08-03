# MYFI Database Architecture

## Migration strategy

MYFI currently stores a complete cloud snapshot in `public.user_data`. That table and
`sync_user_data_v2` remain the compatibility layer while the normalized schema is
introduced. The first normalized migration only creates the new tables, indexes, and
Row Level Security policies. It does not delete, rewrite, or backfill existing data.

The migration order is:

1. Apply the normalized schema in a staging Supabase project.
2. Bootstrap one personal workspace for each authenticated user.
3. Backfill categories, wallets, debts, goals, commitments, transactions, and tags from
   the JSON snapshot using stable `legacy_id` values.
4. Compare row counts, monthly totals, wallet balances, and relationship counts.
5. Pilot normalized reads behind the `EXPO_PUBLIC_NORMALIZED_READ_MODE` feature flag.
6. Enable normalized writes for new accounts first.
7. Keep the JSON snapshot as a rollback export until two production releases pass.
8. Retire the snapshot sync only after a verified export and restore rehearsal.

## Ownership model

`profiles` belongs to an authenticated user. A user owns one active personal workspace
and may later own a business or shared workspace. `workspace_members` controls access to
workspace-scoped records. Every financial table includes `workspace_id` either directly
or through its parent record.

## Financial model

Amounts use `numeric(20,4)` and every wallet and financial record stores a currency code.
Transactions keep their signed amount, while transfers, goal allocations, debt payments,
and commitment payments preserve their links to the source record. Deletion is represented
by `deleted_at` or `archived_at` where a historical record must remain auditable.
Wallet transfers may cross personal and business scopes; source and destination scopes are
stored separately so both scoped views receive the correct side of the movement.
Workspace UI preferences remain in `workspaces.app_settings`; financial records do not.
This preserves layout and module choices without returning to a single financial JSON blob.

## Security model

- All normalized tables have Row Level Security enabled.
- Workspace access is checked through membership or ownership.
- Subscription records are readable by the user but should be written by a trusted
  server-side webhook, not directly by the mobile client.
- `audit_events` is intentionally not writable by the client.
- Database triggers reject cross-workspace wallet, category, tracker, payment, and tag links.
- The existing JSON snapshot remains the rollback path during the transition.

## Current implementation

The repository now includes an idempotent staging backfill CLI and a read-only normalized
repository. `off` is the default mode. `preview` permits an explicit comparison, while
`shadow` runs the comparison after a successful legacy cloud load. Neither mode replaces
the live snapshot or writes from the mobile client.

The next gated step is to run the backfill against a staging Supabase project, archive a
passing reconciliation report, and test the shadow result on representative accounts.
Normalized writes remain disabled until those checks pass.
