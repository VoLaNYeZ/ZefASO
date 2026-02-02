-- Apply this in the Supabase SQL editor.

create table if not exists competitor_targets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  app_name text not null,
  app_id text,
  bundle_id text,
  aliases text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  geos text[] not null default '{}'::text[],
  keyword_geo_pairs text[] not null default '{}'::text[],
  developer_names text[] not null default '{}'::text[],
  min_score numeric not null default 0.86,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists competitor_targets_user_active_idx
  on competitor_targets(user_id, is_active);

create index if not exists competitor_targets_user_app_idx
  on competitor_targets(user_id, app_name);

create unique index if not exists competitor_targets_user_app_uniq
  on competitor_targets(user_id, app_name);

alter table if exists competitor_targets
  add column if not exists keyword_geo_pairs text[] not null default '{}'::text[];

create table if not exists competitor_detections (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  target_key text not null,
  target_app_name text not null,
  target_app_id text,
  target_bundle_id text,
  candidate_key text not null,
  candidate_track_id text,
  candidate_bundle_id text,
  candidate_name text not null,
  candidate_seller text,
  candidate_genre text,
  candidate_url text,
  candidate_artwork_url text,
  candidate_release_date timestamptz,
  candidate_update_date timestamptz,
  score numeric not null,
  signals jsonb,
  found_in jsonb,
  is_potential boolean not null default false,
  potential_reason text,
  is_ignored boolean not null default false,
  ignored_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_scan_id uuid,
  unique(user_id, target_key, candidate_key)
);

create index if not exists competitor_detections_user_last_seen_idx
  on competitor_detections(user_id, last_seen_at desc);

create index if not exists competitor_detections_user_target_idx
  on competitor_detections(user_id, target_app_name);

alter table if exists competitor_detections
  add column if not exists is_potential boolean not null default false;

alter table if exists competitor_detections
  add column if not exists potential_reason text;

alter table if exists competitor_detections
  add column if not exists is_banned boolean not null default false;

alter table if exists competitor_detections
  add column if not exists banned_checked_at timestamptz;

create index if not exists competitor_detections_user_banned_idx
  on competitor_detections(user_id, is_banned);

create index if not exists competitor_detections_user_candidate_idx
  on competitor_detections(user_id, candidate_track_id);

alter table competitor_targets enable row level security;
alter table competitor_detections enable row level security;

create policy "Users can view their competitor targets"
  on competitor_targets for select
  using (auth.uid() = user_id);

create policy "Users can insert their competitor targets"
  on competitor_targets for insert
  with check (auth.uid() = user_id);

create policy "Users can update their competitor targets"
  on competitor_targets for update
  using (auth.uid() = user_id);

create policy "Users can delete their competitor targets"
  on competitor_targets for delete
  using (auth.uid() = user_id);

create policy "Users can view their competitor detections"
  on competitor_detections for select
  using (auth.uid() = user_id);

create policy "Users can insert their competitor detections"
  on competitor_detections for insert
  with check (auth.uid() = user_id);

create policy "Users can update their competitor detections"
  on competitor_detections for update
  using (auth.uid() = user_id);

create policy "Users can delete their competitor detections"
  on competitor_detections for delete
  using (auth.uid() = user_id);
