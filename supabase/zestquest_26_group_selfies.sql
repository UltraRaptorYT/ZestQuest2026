insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'zestquest-26-group-selfies',
  'zestquest-26-group-selfies',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Enable group selfie read access for all users'
  ) then
    create policy "Enable group selfie read access for all users"
    on storage.objects
    for select
    to anon
    using (bucket_id = 'zestquest-26-group-selfies');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Enable group selfie uploads for all users'
  ) then
    create policy "Enable group selfie uploads for all users"
    on storage.objects
    for insert
    to anon
    with check (bucket_id = 'zestquest-26-group-selfies');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Enable group selfie updates for all users'
  ) then
    create policy "Enable group selfie updates for all users"
    on storage.objects
    for update
    to anon
    using (bucket_id = 'zestquest-26-group-selfies')
    with check (bucket_id = 'zestquest-26-group-selfies');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'zestquest_26_team'
      and policyname = 'Enable selfie updates for all users'
  ) then
    create policy "Enable selfie updates for all users"
    on public.zestquest_26_team
    for update
    to anon
    using (true)
    with check (true);
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
        and tablename = 'zestquest_26_team'
    )
  then
    alter publication supabase_realtime add table public.zestquest_26_team;
  end if;
end
$$;
