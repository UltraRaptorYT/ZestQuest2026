create table if not exists public.zestquest_26_galaxy_transmission_state (
  id smallint primary key default 1 check (id = 1),
  round integer not null default 1,
  grid_order integer[] not null check (cardinality(grid_order) = 15),
  grid_orders jsonb not null default '[]'::jsonb
    check (jsonb_typeof(grid_orders) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.zestquest_26_galaxy_transmission_state
  add column if not exists grid_orders jsonb not null default '[]'::jsonb;

alter table public.zestquest_26_galaxy_transmission_state enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zestquest_26_galaxy_transmission_state'
      and policyname = 'Enable Galaxy Transmission state read access for all users'
  ) then
    create policy "Enable Galaxy Transmission state read access for all users"
    on public.zestquest_26_galaxy_transmission_state
    for select
    to anon
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zestquest_26_galaxy_transmission_state'
      and policyname = 'Enable Galaxy Transmission state creation for all users'
  ) then
    create policy "Enable Galaxy Transmission state creation for all users"
    on public.zestquest_26_galaxy_transmission_state
    for insert
    to anon
    with check (id = 1);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zestquest_26_galaxy_transmission_state'
      and policyname = 'Enable Galaxy Transmission state updates for all users'
  ) then
    create policy "Enable Galaxy Transmission state updates for all users"
    on public.zestquest_26_galaxy_transmission_state
    for update
    to anon
    using (id = 1)
    with check (id = 1);
  end if;
end
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'zestquest_26_galaxy_transmission_state'
    )
  then
    alter publication supabase_realtime
    add table public.zestquest_26_galaxy_transmission_state;
  end if;
end
$$;
