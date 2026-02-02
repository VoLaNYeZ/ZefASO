-- Apply this in the Supabase SQL editor.

create table if not exists realtime_rankings_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  app_id text not null,
  keyword text not null,
  geo text not null,
  rank integer,
  traffic numeric,
  captured_at timestamptz not null default now()
);

create index if not exists realtime_rankings_history_user_app_idx
  on realtime_rankings_history(user_id, app_id, captured_at desc);

create index if not exists realtime_rankings_history_user_key_idx
  on realtime_rankings_history(user_id, app_id, keyword, geo, captured_at desc);

alter table realtime_rankings_history enable row level security;

create policy "Users can view their realtime rankings history"
  on realtime_rankings_history for select
  using (auth.uid() = user_id);

create policy "Users can insert their realtime rankings history"
  on realtime_rankings_history for insert
  with check (auth.uid() = user_id);

create policy "Users can update their realtime rankings history"
  on realtime_rankings_history for update
  using (auth.uid() = user_id);

create policy "Users can delete their realtime rankings history"
  on realtime_rankings_history for delete
  using (auth.uid() = user_id);
