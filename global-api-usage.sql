-- Global API usage counter for shared platform quotas.
-- Apply this in Supabase SQL editor.

create table if not exists public.global_api_usage (
  service text primary key,
  month text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.global_api_usage enable row level security;

drop policy if exists global_api_usage_select on public.global_api_usage;
create policy global_api_usage_select
  on public.global_api_usage
  for select
  to authenticated
  using (true);

create or replace function public.get_global_api_usage(service_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_month text := to_char(now(), 'YYYY-MM');
  cur_count integer;
begin
  select case when month = cur_month then count else 0 end
    into cur_count
  from public.global_api_usage
  where service = service_name;

  return coalesce(cur_count, 0);
end;
$$;

create or replace function public.increment_global_api_usage(service_name text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_month text := to_char(now(), 'YYYY-MM');
  new_count integer;
begin
  insert into public.global_api_usage(service, month, count)
  values (service_name, cur_month, 1)
  on conflict (service) do update
    set
      count = case
        when public.global_api_usage.month = cur_month then public.global_api_usage.count + 1
        else 1
      end,
      month = cur_month,
      updated_at = now()
  returning count into new_count;

  return new_count;
end;
$$;

revoke all on function public.get_global_api_usage(text) from public;
revoke all on function public.increment_global_api_usage(text) from public;
grant execute on function public.get_global_api_usage(text) to authenticated;
grant execute on function public.increment_global_api_usage(text) to authenticated;
