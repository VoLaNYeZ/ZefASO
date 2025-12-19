-- Apply this in Supabase SQL editor.
-- Adds a flag to enable server-side scheduled sync for Google Sheets.

alter table if exists public.google_sheets_sync
add column if not exists is_server_scheduled boolean not null default false;

