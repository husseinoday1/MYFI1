# Normalized Backfill Runbook

This tool copies a legacy MYFI JSON snapshot into the normalized Supabase schema.
It is designed for a staging project and is read-only by default.

## 1. Prepare staging

1. Apply all normalized migrations in filename order to the staging Supabase project.
2. Create or choose an authenticated staging user.
3. Export the current MYFI data as JSON. The tool accepts a legacy export, a `snapshotFromState` object, or a MYFI package payload JSON.

Do not use a production service key. The service key is only accepted at runtime through `SUPABASE_TEST_SERVICE_ROLE_KEY` or `--service-key`; it is never stored in the repository.

## 2. Dry-run first

```powershell
$env:SUPABASE_TEST_URL = "https://staging-project.supabase.co"
node tools/backfill-normalized.cjs `
  --input .\staging\snapshot.json `
  --user-id "AUTH_USER_UUID" `
  --report .\staging\backfill-dry-run.json
```

Dry-run does not contact Supabase. It prints the source counts, calculated totals, derived defaults, and the tables that would be written.

## 3. Apply to staging

```powershell
$env:SUPABASE_TEST_URL = "https://staging-project.supabase.co"
$env:SUPABASE_TEST_SERVICE_ROLE_KEY = "STAGING_SERVICE_ROLE_KEY"
node tools/backfill-normalized.cjs `
  --input .\staging\snapshot.json `
  --user-id "AUTH_USER_UUID" `
  --apply `
  --report .\staging\backfill-result.json
```

The operation is idempotent for the same workspace and `legacy_id` values. It upserts records and does not delete stale staging rows. Use a fresh staging workspace for each rehearsal when exact counts matter.

The report compares:

- row counts for categories, wallets, debts, goals, commitments, transactions, payments, tags, and tag links;
- signed transaction totals, income, expenses, transfers, allocations, and display net;
- every wallet balance by legacy wallet id;
- debt totals and paid amounts;
- goal targets and saved amounts;
- commitment totals.

Exit code `0` means the comparison passed. Exit code `2` means the backfill completed but a comparison difference remains. Exit code `1` means the tool could not complete.

## 4. Review before changing app reads

Do not switch the app to normalized reads until `comparison.passed` is `true`, warnings are reviewed, and the report is archived with the staging snapshot. Keep the legacy JSON snapshot as the rollback source during the read-path pilot.

For a read-only in-app comparison, set `EXPO_PUBLIC_NORMALIZED_READ_MODE=shadow` in a
development build and restart Expo. The app continues loading `user_data`; the normalized
result is stored only in `normalizedPreview` with its differences. Return the setting to
`off` after the rehearsal.
