# supabase — cloud backend (gated)

The cloud is **not** the source of financial truth; on-device SQLite is. Cloud work
is governed by `docs/MYFI_SYNC_PROTOCOL.md` and `docs/MYFI_DATA_OWNERSHIP.md`.

## Local rules

- **Migrations under `migrations/` are production DDL.** Sequence: prove the claim
  against the live database → write a reviewed migration → preflight → apply →
  postcheck. Fail closed rather than repairing data in place.
- Applying a migration is a user-approval gate. The project ref in use is a real,
  personal-account project — treat every table as live user data.
- **Never handle a service_role key or database password.** Access goes through the
  configured MCP, which holds auth. Do not paste credentials into files or logs.
- **Never test destructive behaviour against a real account.** No standing separate
  staging project exists (deliberately declined), so destructive paths must be
  proven on disposable data.
- Edge functions in `functions/` are deployed via the documented npm scripts; a
  deploy is an outward-facing action requiring approval.
