# MYFI P20-G01 — items 8-10 for the 611b091 PASS run

Date: 2026-08-20

## Item 8 — server-side audit: CONFIRMED

```json
{
  "event_id": 6,
  "ledger_id": "ledger-f1272d8f0d211a45f1eb6a01b8c49bc0",
  "owner_user_id": "3b6e303d-4a03-4643-a5d8-2b54b613b3b8",
  "from_epoch": 2, "to_epoch": 3,
  "reason": "controlled_recovery",
  "device_id": "f9e67984-1798-445e-9d9b-2026221422fe",
  "created_at": "2026-08-20 15:04:39.92479+00"
}
```
Matches device log `startedAt: 2026-08-20T15:04:39.057Z` to within ~0.9s.

## Items 9-10 — real account: PARTIALLY CONFIRMED, one open item

Signed back into `husseinoday10@gmail.com` — login succeeded, real
financial data visible and intact on screen. **But cloud sync itself has
been stuck loading for 2+ minutes** despite pressing "Sync Now", not
resolving.

## Concrete new evidence on WHY (Supabase Dashboard, screenshot)

- **"Project is depleting its Disk IO Budget"** warning, shown live on the
  project card.
- Free plan, **Nano** compute.
- **Database size: 353 MB / 500 MB (70% of free-tier limit)**.

This is hard confirmation of the resource-exhaustion pattern seen all day
(504s on signup/login, failed user-deletion, email rate limits) — not
guesswork. The stuck real-account sync right now is most likely the same
cause, not data corruption (data on-screen is intact).

## Recommendation

Items 9-10 can't be marked fully clean while sync is actively stuck — but
this looks like the known infra issue, not a P20-G01 code defect. Suggest:
either wait for sync to resolve and re-check, or accept items 9-10 as
"data verified intact, sync degraded by known Disk IO constraint" without
further cloud-stress testing, per the pause guidance already in effect.
