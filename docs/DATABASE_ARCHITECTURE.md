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

The existing normalized Supabase compatibility schema uses `numeric(20,4)`. It is not the
final Financial Core storage contract. The approved local V7 model stores money as integer
minor units and separates transaction headers from postings. The future mutation-level cloud
schema must preserve those exact minor units and posting legs instead of round-tripping them
through floating-point values. See `FINANCIAL_MODEL_2_0_AR.md` and
`SQLITE_FINANCIAL_CORE_V7_DESIGN_AR.md`.

Transfers, goal allocations, debt payments, and commitment payments preserve explicit links
to the source record. Deletion is represented by `deleted_at` or a void/tombstone where a
historical record must remain auditable.
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

The local financial engine is implemented as SQLite V7. It commits transaction headers,
postings, tracker links, entity changes, historical exchange rates, and an outbox in one
database transaction. A separate shadow namespace imports active Vault data and every cold
archive year; SQLite becomes the local source of truth only after exact reconciliation of
counts, balances, monthly totals, links, and canonical checksums. Vault and the V6 ledger
remain temporary compatibility and recovery adapters rather than local read authorities.

Home, History, Reports, exports, archive operations, backup/restore, and account lifecycle
now use the V7 projection after cutover. Logical Backup V10 is the portable primary format;
it contains versioned financial data, currencies/rates, budgets, archive metadata, and
checksums before compression and encryption.

Mutation-level cloud sync is implemented locally through `ledger_outbox_v2`,
`ledger_inbox_v2`, ordered cursors, and `financial_mutations_v1`. The existing JSON snapshot
sync deliberately remains a fallback. Deploying the migration in staging and passing a
two-device authenticated test are still required before snapshot retirement or a production
cloud-sync claim.
