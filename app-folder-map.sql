-- Apply this in the Supabase SQL editor.

create table if not exists app_folder_map (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  app_key text not null,
  folder text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, app_key)
);

create index if not exists app_folder_map_user_idx
  on app_folder_map(user_id);

alter table app_folder_map enable row level security;

create policy "Users can view their folder map"
  on app_folder_map for select
  using (auth.uid() = user_id);

create policy "Users can insert their folder map"
  on app_folder_map for insert
  with check (auth.uid() = user_id);

create policy "Users can update their folder map"
  on app_folder_map for update
  using (auth.uid() = user_id);

create policy "Users can delete their folder map"
  on app_folder_map for delete
  using (auth.uid() = user_id);

-- Optional: enable realtime on this table if you want cross-session live updates.
-- alter publication supabase_realtime add table app_folder_map;
