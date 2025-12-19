# google-sheets-sync-cron

Server-side scheduled Google Sheets → Supabase sync.

## What it does

- Reads `public.google_sheets_sync` rows where:
  - `is_sync_enabled = true`
  - `is_server_scheduled = true`
- Fetches tabs + tab data from the stored Google Apps Script Web App URL
- Upserts into `public.aso_entries` using conflict key `user_id,date,app_id,geo,keyword`
- Updates `google_sheets_sync.last_synced_at`

## Database change

Run `google-sheets-sync-server-schedule.sql` in the Supabase SQL editor to add:

- `google_sheets_sync.is_server_scheduled boolean not null default false`

## Required secrets

Supabase Edge Functions already have `SUPABASE_URL` injected at runtime.

Set this secret (Service Role key from Dashboard → Project Settings → API):

`supabase secrets set SERVICE_ROLE_KEY="PASTE_SERVICE_ROLE_KEY_HERE"`

## Scheduling (UTC+3)

You want runs at **00:00, 06:00, 12:00, 18:00** in **UTC+3**.

Most schedulers use UTC; the equivalent UTC times are:

- 21:00, 03:00, 09:00, 15:00 (UTC)

Cron (UTC):

`0 21,3,9,15 * * *`

## Security (optional)

If you set an env var `CRON_SECRET`, the function requires a matching request header:

- `x-cron-secret: <CRON_SECRET>`

It also accepts a query param for schedulers that can’t send custom headers:

- `?cron_secret=<CRON_SECRET>`

If `CRON_SECRET` is not set, the function runs without this check.
