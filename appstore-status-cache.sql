-- Apply this in the Supabase SQL editor.

create table if not exists appstore_status_cache (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  app_id text not null,
  status text not null check (status in ('banned', 'ok')),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists appstore_status_cache_user_app_uniq
  on appstore_status_cache(user_id, app_id);

create index if not exists appstore_status_cache_user_status_idx
  on appstore_status_cache(user_id, status);

alter table appstore_status_cache enable row level security;

create policy "Users can view their App Store status cache"
  on appstore_status_cache for select
  using (auth.uid() = user_id);

create policy "Users can insert their App Store status cache"
  on appstore_status_cache for insert
  with check (auth.uid() = user_id);

create policy "Users can update their App Store status cache"
  on appstore_status_cache for update
  using (auth.uid() = user_id);

create policy "Users can delete their App Store status cache"
  on appstore_status_cache for delete
  using (auth.uid() = user_id);
