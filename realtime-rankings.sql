-- Create table for real-time rankings
create table if not exists realtime_rankings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  app_id text not null,
  keyword text not null,
  geo text not null,
  rank integer, -- null means not found
  traffic numeric, -- null means not fetched
  traffic_data jsonb, -- full response from API
  last_updated timestamptz default now() not null,
  
  -- Unique constraint to ensure one entry per user/app/keyword/geo
  unique(user_id, app_id, keyword, geo)
);

-- Enable RLS
alter table realtime_rankings enable row level security;

-- Policies
create policy "Users can view their own rankings"
  on realtime_rankings for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rankings"
  on realtime_rankings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rankings"
  on realtime_rankings for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rankings"
  on realtime_rankings for delete
  using (auth.uid() = user_id);
